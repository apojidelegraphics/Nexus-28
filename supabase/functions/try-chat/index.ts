// Nexus '28 Test Run (Supabase Edge Function "try-chat"), v3.4.1.
// The web version of Nexus for people without a Mac. The browser never sees the free Nexus key: it signs in with a
// Nexus account and asks this function, which checks the account, the limits and maintenance, then calls OpenRouter
// with the free key (free models only) and streams the answer back.
//   POST { action: 'chat', agent: 'flash'|'lyte'|'neodela', kind: 'main'|'extra', messages: [{role, content}], model?, features? }
//        content can be text, or (3.4.1) parts: [{ type:'text', text }, { type:'image_url', image_url:{ url:'data:image/…' } }]
//        → text/event-stream (OpenAI-style chunks), or JSON { ok:false, error, message }
//   POST { action: 'search', q }   → { ok, results: [{ title, url, snippet }] }     (DuckDuckGo, no key)
//   POST { action: 'read', url }   → { ok, title, text }                              (a public web page as text)
//   POST { action: 'byok', provider: 'deepseek', key, body } → passes your own DeepSeek key through (never stored)
// Deploy:  supabase functions deploy try-chat --no-verify-jwt     (it checks the sign-in itself)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ORIGINS = ['https://apojidelegraphics.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
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
    const take = async (kind: string, agent = 'flash') => (await db.rpc('try_take', { p_user: uid, p_kind: kind, p_agent: agent })).data || { ok: false, message: 'Test Run isn’t set up yet, or something went wrong. Try again in a moment.' };

    // ---------- web search + page reading (for @Seek, @Integrate, @Cite and the 🌐 button)
    if (b.action === 'search') {
      const q = String(b.q || '').trim().slice(0, 200); if (!q) return json({ ok: false, message: 'Empty search.' });
      const t = await take('search'); if (!t.ok) return json(t);
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
      const html = await res.text(), results: { title: string; url: string; snippet: string }[] = [];
      for (const blk of html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1)) {
        const a = blk.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i); if (!a) continue;
        let href = a[1].replace(/&amp;/g, '&'); const ud = href.match(/[?&]uddg=([^&]+)/); if (ud) href = decodeURIComponent(ud[1]); if (href.startsWith('//')) href = 'https:' + href;
        if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
        const sn = blk.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i);
        results.push({ title: strip(a[2]).slice(0, 160), url: href, snippet: sn ? strip(sn[1]).slice(0, 400) : '' });
        if (results.length >= 6) break;
      }
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
