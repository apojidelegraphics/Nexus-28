// Nexus speech (Supabase Edge Function "nexus-stt", 3.9): free, accurate speech-to-text for signed-in Nexus users.
// The app records your voice and sends the clip here; this checks your account and the daily allowance (stt_take:
// 300 clips / about an hour a day), then asks Groq's Whisper large-v3 turbo and returns the text. Nothing is stored.
// The Groq key is a secret on the server (Supabase → Edge Functions → Secrets → GROQ_API_KEY); apps never see it.
//   POST raw audio (webm/ogg/mp4/wav), headers: Authorization: Bearer <user JWT>, Content-Type, x-seconds, x-language?
//   → { ok: true, text } | { ok: false, error, message }
// Deploy: supabase functions deploy nexus-stt --no-verify-jwt   (it checks the sign-in itself)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const URL_ = Deno.env.get('SUPABASE_URL')!, SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, GROQ = Deno.env.get('GROQ_API_KEY') || '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-seconds, x-language', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  try {
    if (!GROQ) return json({ ok: false, error: 'not_configured', message: 'Nexus speech isn’t switched on yet.' }, 503);
    const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = await db.auth.getUser(jwt);
    if (!who?.user) return json({ ok: false, error: 'signin', message: 'Sign in to your Nexus account to use Nexus speech.' }, 401);
    const type = (req.headers.get('Content-Type') || 'audio/webm').split(';')[0].trim();
    if (!EXT[type]) return json({ ok: false, error: 'type', message: 'That audio format isn’t supported.' }, 400);
    const audio = new Uint8Array(await req.arrayBuffer());
    if (audio.length < 800) return json({ ok: true, text: '' });
    if (audio.length > 8_000_000) return json({ ok: false, error: 'size', message: 'That recording is too long.' }, 413);
    const secs = Math.max(1, Math.min(120, +(req.headers.get('x-seconds') || 0) || Math.round(audio.length / 16000)));
    const { data: t } = await db.rpc('stt_take', { p_user: who.user.id, p_seconds: secs });
    if (!t?.ok) return json({ ok: false, error: 'limit', message: t?.message || 'Nexus speech isn’t set up yet.' }, 429);
    const form = new FormData();
    form.append('file', new Blob([audio], { type }), 'speech.' + EXT[type]);
    form.append('model', 'whisper-large-v3-turbo'); form.append('response_format', 'json'); form.append('temperature', '0');
    const lang = (req.headers.get('x-language') || '').slice(0, 2).toLowerCase(); if (/^[a-z]{2}$/.test(lang)) form.append('language', lang);
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + GROQ }, body: form });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: 'upstream', message: r.status === 429 ? 'Nexus speech is busy. Try again in a moment.' : (j?.error?.message || 'Speech-to-text failed (' + r.status + ').') }, 502);
    return json({ ok: true, text: String(j.text || '').trim() });
  } catch (e) { return json({ ok: false, error: 'error', message: String((e as Error)?.message || e).slice(0, 200) }, 500); }
});
