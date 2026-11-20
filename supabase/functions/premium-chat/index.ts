// Nexus '28 3.11 — the Paragon & Axiom key (Supabase Edge Function "premium-chat").
// Pro and Max subscribers (and the people in their plan) run Paragon on Apoji's own key: Pro 10 tasks a day, Max 25.
// Axiom runs on it for the people the Apoji Team allowed. The key never leaves this function.
//   POST /premium-chat/chat/completions   OpenAI-style body { model: 'nexus/paragon'|'nexus/axiom', messages, tools?, stream }
//        headers: Authorization: Bearer <Nexus sign-in token>, X-Nexus-Turn: <id of the chat turn>
//        → the model's stream, passed straight through (or JSON { error: { message } })
//   GET  /premium-chat/status → { paragon: { allowed, tier, limit, used }, axiom: { allowed, used } }
// Secrets:  supabase secrets set PREMIUM_API_KEY=sk-or-...   (an OpenRouter key)
//           Which models run: Apoji Admin → API usage → Paragon & Axiom key (admin_settings 'premium_models'); if nothing is
//           set there, PREMIUM_PARAGON_MODEL / PREMIUM_AXIOM_MODEL, then anthropic/claude-sonnet-4.5 / anthropic/claude-opus-4.1
// Deploy:   supabase functions deploy premium-chat --no-verify-jwt     (it checks the sign-in itself)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const KEY = Deno.env.get('PREMIUM_API_KEY') || '';
const BASE = (Deno.env.get('PREMIUM_BASE') || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const MODELS: Record<string, string> = {
  paragon: Deno.env.get('PREMIUM_PARAGON_MODEL') || 'anthropic/claude-sonnet-4.5',
  axiom: Deno.env.get('PREMIUM_AXIOM_MODEL') || 'anthropic/claude-opus-4.1',
};
// 3.11.1: the models picked in Apoji Admin win (checked once a minute)
let picked: { at: number; v: Record<string, string> } = { at: 0, v: {} };
const MODEL_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;
async function modelFor(db: any, agent: string) {
  if (Date.now() - picked.at > 60e3) {
    try { const { data } = await db.from('admin_settings').select('value').eq('key', 'premium_models').maybeSingle(); picked = { at: Date.now(), v: data?.value || {} }; }
    catch { picked = { at: Date.now(), v: picked.v }; }
  }
  const m = String(picked.v?.[agent] || '');
  return MODEL_RE.test(m) ? m : MODELS[agent];
}
// aARgon3 / Mexel store: an order has to still be active for its plan to count
const STORE_URL = Deno.env.get('STORE_URL') || 'https://yuergfrpfhtcxjkcgjrx.supabase.co';
const STORE_KEY = Deno.env.get('STORE_KEY') || 'sb_publishable_tX9wZpRsI3fAlthnz4lQKA_yVdY7768';
const VOID = /^(void|voided|refunded|cancel+ed|canceled|deleted|expired|paused)$/i;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-nexus-turn, apikey', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const H = { 'Content-Type': 'application/json', ...CORS };
const fail = (message: string, status = 403) => new Response(JSON.stringify({ error: { message } }), { status, headers: H });

async function orderActive(orderId: string | null) {
  if (!orderId) return true;          // admins without an order
  try {
    const r = await fetch(`${STORE_URL}/rest/v1/orders?select=status&order_id=eq.${encodeURIComponent(orderId)}`, { headers: { apikey: STORE_KEY } });
    if (!r.ok) return true;           // the store being down shouldn't stop paying people
    const [o] = await r.json();
    return !!o && !VOID.test(String(o.status || ''));
  } catch { return true; }
}

Deno.serve(async req => {
  // 3.11.1: any page may ask (it still needs a Nexus sign-in), so Apoji Admin's server check can reach it
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const userDb = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: who } = await userDb.auth.getUser(jwt);
  if (!who?.user) return fail('Sign in to your Nexus account to use Paragon on the Nexus key.', 401);
  const uid = who.user.id;
  const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
  const path = new URL(req.url).pathname;

  if (req.method === 'GET' && path.endsWith('/status')) {
    const { data } = await db.rpc('premium_status', { p_user: uid });
    return new Response(JSON.stringify({ ...(data || {}), models: { paragon: await modelFor(db, 'paragon'), axiom: await modelFor(db, 'axiom') } }), { headers: H });
  }
  if (req.method !== 'POST' || !path.endsWith('/chat/completions')) return fail('Not found.', 404);
  if (!KEY) return fail('The Paragon & Axiom key isn’t set up yet. Use your own key in Settings → Models & keys for now.', 503);

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) return fail('Bad request.', 400);
  const agent = String(body.model || '').replace(/^nexus\//, '');
  if (!MODELS[agent]) return fail('That model isn’t on the Nexus key.', 400);
  const turn = String(req.headers.get('X-Nexus-Turn') || '').slice(0, 80) || crypto.randomUUID();

  // maintenance switched on in Apoji Admin for Paragon / Axiom / everything stops it here too
  const { data: mt } = await db.from('maintenance_config').select('scope,enabled,message');
  const off = (mt || []).find((m: any) => (m.enabled === true || m.enabled === 'true') && ['global', 'all', 'app', 'everything', agent, 'premium'].includes(String(m.scope).toLowerCase().replace(/[^a-z0-9]/g, '')));
  if (off) return fail(off.message || 'Down for maintenance. Back soon.', 503);

  const { data: t, error } = await db.rpc('premium_take', { p_user: uid, p_agent: agent, p_turn: turn });
  if (error || !t) return fail('Couldn’t check your plan. Try again in a moment.', 503);
  if (!t.ok) return fail(t.message, 429);
  if (agent === 'paragon' && !(await orderActive(t.order_id))) return fail('Your plan’s order isn’t active any more, so Paragon on the Nexus key is off. Check Settings → Subscription.', 402);

  const up = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { ...H, Authorization: `Bearer ${KEY}`, 'HTTP-Referer': 'https://github.com/Apoji-Delegraphics/nexus-desktop', 'X-Title': 'Nexus 28 ' + agent },
    body: JSON.stringify({ model: await modelFor(db, agent), messages: body.messages, ...(body.tools?.length ? { tools: body.tools } : {}), stream: body.stream !== false, max_tokens: Math.min(+body.max_tokens || 8000, 16000), user: uid }),
  });
  if (!up.ok) {
    const txt = (await up.text()).slice(0, 300);
    let msg = txt; try { msg = JSON.parse(txt).error?.message || txt; } catch { /* plain text */ }
    return fail('The Nexus key: ' + msg, up.status === 429 ? 429 : 502);
  }
  return new Response(up.body, { headers: { ...CORS, 'Content-Type': up.headers.get('Content-Type') || 'text/event-stream', 'Cache-Control': 'no-cache' } });
});
