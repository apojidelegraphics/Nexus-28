// Nexus '28 Test Run (Supabase Edge Function "try-chat"), v3.7.
// The web version of Nexus for people without a Mac. The browser never sees the free Nexus key: it signs in with a
// Nexus account and asks this function, which checks the account, the limits and maintenance, then calls OpenRouter
// with the free key (free models only) and streams the answer back.
//   POST { action: 'chat', agent: 'flash'|'lyte'|'neodela', kind: 'main'|'extra', messages: [{role, content}], model?, features? }
//        content can be text, or (3.4.1) parts: [{ type:'text', text }, { type:'image_url', image_url:{ url:'data:image/…' } }]
//        → text/event-stream (OpenAI-style chunks), or JSON { ok:false, error, message }
//   POST { action: 'search', q }   → { ok, results: [{ title, url, snippet }] }     (Bing, then DuckDuckGo, then Wikipedia; no key)
//   POST { action: 'read', url }   → { ok, title, text }                              (a public web page as text)
//   POST { action: 'byok', provider: 'deepseek', key, body } → passes your own DeepSeek key through (never stored)
// Deploy:  supabase functions deploy try-chat --no-verify-jwt     (it checks the sign-in itself)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ORIGINS = ['https://apojidelegraphics.github.io', 'apoji://admin', 'http://localhost:8080', 'http://127.0.0.1:8080'];   // 3.11.1: + the Apoji Admin app (its server check)
const cors = (req: Request) => {
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
};
const AGENTS = new Set(['flash', 'lyte', 'neodela']);
const EVERYTHING = ['global', 'all', 'app', 'everything', 'web', 'try', 'test run', 'testrun'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const isFree = (id: string) => id === 'openrouter/free' || /:free$/i.test(id);
const strip = (s: string) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
// Only public web pages: no localhost, private networks, bare IPs or odd ports
function publicUrl(raw: string) {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port))) return null;
  const h = u.hostname.toLowerCase();
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')) return null;
  return u;
}

const BUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
type Hit = { title: string; url: string; snippet: string };
const unamp = (s: string) => s.replace(/&amp;/g, '&');
function bingUrl(href: string) { const h = unamp(href), u = h.match(/[?&]u=a1([A-Za-z0-9_-]+)/); if (u) { try { return atob(u[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(u[1].length / 4) * 4, '=')); } catch { /* not base64 */ } } return h; }
function parseBing(html: string): Hit[] {
  const out: Hit[] = [];
  for (const b of html.split(/<li class="b_algo"/i).slice(1)) {
    const a = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i); if (!a) continue;
    const url = bingUrl(a[1]); if (!/^https?:\/\//.test(url) || /bing\.com\//.test(url)) continue;
    const sn = b.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || b.match(/<div class="b_caption"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ title: strip(a[2]).slice(0, 160), url, snippet: sn ? strip(sn[1]).replace(/^[^·]{0,40}·\s*/, '').slice(0, 400) : '' });
    if (out.length >= 6) break;
  }
  return out;
}
function parseDdg(html: string): Hit[] {
  const out: Hit[] = [];
  for (const blk of html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1)) {
    const a = blk.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i); if (!a) continue;
    let href = unamp(a[1]); const ud = href.match(/[?&]uddg=([^&]+)/); if (ud) href = decodeURIComponent(ud[1]); if (href.startsWith('//')) href = 'https:' + href;
    if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
    const sn = blk.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i);
    out.push({ title: strip(a[2]).slice(0, 160), url: href, snippet: sn ? strip(sn[1]).slice(0, 400) : '' });
    if (out.length >= 6) break;
  }
  return out;
}
async function grab(url: string, init: RequestInit = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try { const r = await fetch(url, { ...init, signal: ctl.signal, headers: { 'User-Agent': BUA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9', ...(init.headers || {}) } }); return r.ok ? await r.text() : ''; }
  catch { return ''; } finally { clearTimeout(t); }
}
async function webSearch(q: string): Promise<Hit[]> {
  const enc = encodeURIComponent(q);
  for (let i = 0; i < 2; i++) { const r = parseBing(await grab(`https://www.bing.com/search?q=${enc}&setlang=en&cc=us`)); if (r.length) return r; }
  const d = parseDdg(await grab('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'q=' + enc })); if (d.length) return d;
  try {
    const w = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc}&srlimit=5&format=json`, { headers: { 'User-Agent': 'Nexus-28-TestRun/3.7' } }).then(r => r.json());
    return (w?.query?.search || []).map((x: any) => ({ title: x.title + ' (Wikipedia)', url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')), snippet: strip(x.snippet || '') }));
  } catch { return []; }
}

Deno.serve(async req => {
  const CORS = cors(req);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const userDb = createClient(URL_, ANON, { global: { headers: { Authorization: 'Bearer ' + jwt } }, auth: { persistSession: false } });
    const { data: who } = await userDb.auth.getUser(jwt);
    if (!who?.user) return json({ ok: false, error: 'signin', message: 'Sign in to your Nexus account first.' }, 401);
    const uid = who.user.id;
    const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({}));
    // 3.12 guest mode: an anonymous sign-in gets 8 answers a day, counted per guest and per network address (hashed)
    const guest = !!(who.user as any).is_anonymous;
    const ipHash = async () => { const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '').split(',')[0].trim() || 'unknown';
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('nexus-guest:' + ip + ':' + SERVICE.slice(-12))); return 'ip:' + [...new Uint8Array(h)].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join(''); };
    const take = async (kind: string, agent = 'flash') => {
      if (guest) {
        if (kind !== 'main') return { ok: false, error: 'guest', message: 'Guests get plain answers only. Make a free account (it keeps this chat) for web search, extras and more answers.' };
        const r = (await db.rpc('try_guest_take', { p_who: [await ipHash(), 'u:' + uid] })).data;
        return r ? { ...r, left_today: r.left } : { ok: false, message: 'Guest mode isn’t set up yet. Make a free account instead.' };
      }
      return (await db.rpc('try_take', { p_user: uid, p_kind: kind, p_agent: agent })).data || { ok: false, message: 'Test Run isn’t set up yet, or something went wrong. Try again in a moment.' };
    };

    // ---------- web search + page reading (for @Seek, @Integrate, @Cite and the 🌐 button)
    if (b.action === 'search') {
      const q = String(b.q || '').trim().slice(0, 200); if (!q) return json({ ok: false, message: 'Empty search.' });
      // 3.7: the single web search switch (Apoji Admin → Maintenance → 🌐 Web search)
      const { data: wm } = await db.from('maintenance_config').select('scope,enabled,message');
      const wOff = (wm || []).find((m: any) => (m.enabled === true || m.enabled === 'true') && ['websearch', 'search'].includes(String(m.scope).toLowerCase().replace(/[^a-z0-9]/g, '')));
      if (wOff) return json({ ok: false, error: 'maintenance', message: '🛠 ' + (wOff.message || 'Web search is down for maintenance. Back soon.') });
      const t = await take('search'); if (!t.ok) return json(t);
      // 3.7: DuckDuckGo refuses requests from cloud servers, so Bing goes first here, then DuckDuckGo, then Wikipedia
      const results = await webSearch(q);
      if (!results.length) return json({ ok: false, message: 'No search engine answered. Try again in a moment.' });
      return json({ ok: true, results });
    }
    if (b.action === 'read') {
      const u = publicUrl(String(b.url || '')); if (!u) return json({ ok: false, message: 'That link can’t be opened.' });
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 9000);
      try {
        const res = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' }, redirect: 'follow', signal: ctl.signal });
        if (!publicUrl(res.url || u.href)) return json({ ok: false, message: 'That link can’t be opened.' });
        const type = res.headers.get('content-type') || '';
        if (!/text\/|html|json|xml/.test(type)) return json({ ok: false, message: 'Not a web page.' });
        const raw = (await res.text()).slice(0, 600000);
        const title = strip((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 160);
        return json({ ok: true, url: res.url, title, text: strip(raw).slice(0, 9000) });
      } catch { return json({ ok: false, message: 'The page took too long.' }); } finally { clearTimeout(timer); }
    }
    // ---------- your own DeepSeek key (its API doesn't allow calls straight from a browser); never stored or logged
    if (b.action === 'byok') {
      if (b.provider !== 'deepseek' || !/^sk-[\w-]{10,}$/.test(String(b.key || ''))) return json({ ok: false, message: 'Bad key.' });
      const res = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + b.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(b.body || {}), stream: true }) });
      return new Response(res.body, { status: res.status, headers: { ...CORS, 'Content-Type': res.headers.get('content-type') || 'text/event-stream' } });
    }

    // ---------- a chat turn on the free Nexus key
    if (b.action !== 'chat') return json({ ok: false, error: 'action' }, 400);
    const agent = AGENTS.has(b.agent) ? b.agent : 'flash';
    // 3.4.1: pictures (up to 4 per message, ~2.5 MB each as data URLs)
    let pics = 0;
    const part = (p: any) => p?.type === 'text' && typeof p.text === 'string' ? { type: 'text', text: p.text.slice(0, 40000) }
      : p?.type === 'image_url' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(p.image_url?.url || '')) && String(p.image_url.url).length < 3_500_000 && ++pics <= 8 ? { type: 'image_url', image_url: { url: p.image_url.url } } : null;
    const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-40)
      .filter((m: any) => m && ['system', 'user', 'assistant'].includes(m.role) && (typeof m.content === 'string' || (m.role === 'user' && Array.isArray(m.content))))
      .map((m: any) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 40000) : m.content.slice(0, 6).map(part).filter(Boolean) }));
    const textLen = (c: any) => typeof c === 'string' ? c.length : c.reduce((n: number, p: any) => n + (p.text?.length || 0), 0);
    if (!msgs.length || msgs.reduce((n: number, m: any) => n + textLen(m.content), 0) > 160000) return json({ ok: false, message: 'That message is too long.' });
    if (pics > 8) return json({ ok: false, message: 'That’s too many pictures at once.' });
    // maintenance from Apoji Admin (everything, the web app, or this agent)
    const { data: maint } = await db.from('maintenance_config').select('scope,enabled,message,admin_bypass');
    const scopes = new Set([...EVERYTHING, agent, `nexus 28 ${agent}`, `nexus '28 ${agent}`]);
    const live = (maint || []).filter((m: any) => m.enabled === true || m.enabled === 'true' || m.enabled?.enabled === true);
    const on = live.find((m: any) => scopes.has(String(m.scope).trim().toLowerCase()));
    if (on) return json({ ok: false, error: 'maintenance', message: '🛠 ' + (on.message || (AGENTS.has(String(on.scope).trim().toLowerCase()) ? `${agent[0].toUpperCase() + agent.slice(1)} is down for maintenance. Try another agent.` : 'Nexus is down for maintenance. Back soon.')) });
    // 3.4.1: feature maintenance (Apoji Admin → Maintenance → a @feature): the page leaves them out; this double-checks
    const fnorm = (x: string) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const featOff = live.find((m: any) => (Array.isArray(b.features) ? b.features : []).some((f: string) => fnorm(f) && fnorm(f) === fnorm(m.scope)));
    if (featOff) return json({ ok: false, error: 'maintenance', message: `🛠 @${featOff.scope} is down for maintenance${featOff.message ? ': ' + featOff.message : ''}. Ask without it.` });
    if (guest && pics) return json({ ok: false, error: 'guest', message: 'Pictures need a free account. Make one from the menu (it keeps this chat).' });
    const t = await take(b.kind === 'extra' ? 'extra' : 'main', agent); if (!t.ok) return json(t);
    const { data: keyRow } = await db.from('app_content').select('content').eq('key', 'openrouter_api_key').maybeSingle();
    const key = typeof keyRow?.content === 'string' ? keyRow.content.trim() : keyRow?.content?.key || '';
    if (!key) return json({ ok: false, message: 'The free Nexus key isn’t set up.' });
    // pictures go to the free router, which picks a free model that can see them
    const model = !pics && isFree(String(b.model || '')) ? String(b.model) : 'openrouter/free';
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://apojidelegraphics.github.io/Nexus-28/try/', 'X-Title': "Nexus '28 Test Run" },
      body: JSON.stringify({ model, messages: msgs, stream: true, max_tokens: b.kind === 'extra' ? 1200 : 4000 }) });
    if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); return json({ ok: false, message: j?.error?.message || 'The model said ' + res.status }); }
    return new Response(res.body, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Nexus-Left': String(t.left_today ?? ''), 'X-Nexus-Agent-Left': String(t.left_agent ?? ''), 'Access-Control-Expose-Headers': 'X-Nexus-Left, X-Nexus-Agent-Left' } });
  } catch (e) {
    return json({ ok: false, message: String((e as Error)?.message || e).slice(0, 200) }, 500);
  }
});
