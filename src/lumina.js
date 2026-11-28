// 4.4.0 LuminaRender: Solis makes pictures with OpenRouter's Image API.
//   POST https://openrouter.ai/api/v1/images  { model, prompt, aspect_ratio, resolution, n: 1, response_format: 'b64_json',
//   input_references: [{ type: 'image_url', image_url: { url } }] }  →  { data: [{ b64_json | url, media_type }], usage: { cost } }
// Picture models aren't free, so this runs on the person's own OpenRouter key (never the free Nexus key).
//   render(args, { key, fetch }) → { b64, mime, model, prompt, aspect_ratio, resolution, cost, fellBack }
'use strict';
const ENDPOINT = 'https://openrouter.ai/api/v1/images';
const DEFAULT_MODEL = 'google/gemini-3.1-flash-image';
const MODELS = {
  'google/gemini-3.1-flash-image': 'General scenes and photorealism',
  'black-forest-labs/flux.2-pro': 'The same character or style across pictures (with references)',
  'recraft/recraft-v4.1-vector': 'Vector art, logos and icons'
};
const ASPECTS = ['1:1', '16:9', '21:9', '4:3', '9:16'];
const RESOLUTIONS = ['1K', '2K', '4K'];
const REF = /^(https:\/\/[^\s"'<>]{4,2000}|data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]{20,})$/;

// the tool's arguments → a safe request body
function body(a = {}) {
  const prompt = String(a.prompt || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 4000);
  if (prompt.length < 3) throw new Error('Describe the picture first.');
  const model = MODELS[a.model] ? a.model : DEFAULT_MODEL;
  const aspect_ratio = ASPECTS.includes(a.aspect_ratio) ? a.aspect_ratio : '16:9';
  const resolution = RESOLUTIONS.includes(String(a.resolution || '').toUpperCase()) ? String(a.resolution).toUpperCase() : '2K';
  const refs = (Array.isArray(a.input_references) ? a.input_references : []).map(String).filter(u => REF.test(u)).slice(0, 8);
  return { model, prompt, aspect_ratio, resolution, n: 1, response_format: 'b64_json', ...(refs.length ? { input_references: refs.map(url => ({ type: 'image_url', image_url: { url } })) } : {}) };
}

async function render(a, { key, fetch: f = globalThis.fetch, signal } = {}) {
  if (!key) throw new Error('LuminaRender needs your own OpenRouter key: Settings → Models & keys → OpenRouter. (The free Nexus key only runs free models, and picture models aren\'t free.)');
  let req = body(a), fellBack = false;
  const call = async b => {
    const res = await f(ENDPOINT, { method: 'POST', signal, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://apojidelegraphics.github.io/Nexus-28/', 'X-Title': "Nexus '28 Solis" }, body: JSON.stringify(b) });
    const j = await res.json().catch(() => ({}));
    return { res, j };
  };
  let { res, j } = await call(req);
  // a model OpenRouter doesn't list (names change): try the default once
  if (!res.ok && req.model !== DEFAULT_MODEL && (res.status === 404 || res.status === 400) && /model|not found|invalid|unknown|no endpoints/i.test(JSON.stringify(j))) {
    req = { ...req, model: DEFAULT_MODEL }; fellBack = true; ({ res, j } = await call(req));
  }
  if (!res.ok) {
    const msg = j?.error?.message || `OpenRouter said ${res.status}.`;
    throw new Error(res.status === 401 ? 'OpenRouter didn\'t accept your key. Check it in Settings → Models & keys.' : res.status === 402 ? 'Your OpenRouter account is out of credit for pictures. Add credit at openrouter.ai.' : msg);
  }
  const d = (j.data || [])[0] || {};
  let b64 = d.b64_json || '', mime = d.media_type || 'image/png';
  if (!b64 && d.url && /^https:\/\//.test(d.url)) {
    const r2 = await f(d.url, { signal }); if (!r2.ok) throw new Error('The picture was made but couldn\'t be downloaded.');
    b64 = Buffer.from(await r2.arrayBuffer()).toString('base64'); mime = r2.headers?.get?.('content-type') || mime;
  }
  if (!b64) throw new Error('OpenRouter didn\'t send a picture back. Try a different prompt or model.');
  if (/svg/i.test(mime)) mime = 'image/svg+xml';
  return { b64, mime, model: req.model, prompt: req.prompt, aspect_ratio: req.aspect_ratio, resolution: req.resolution, cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null, fellBack };
}

module.exports = { render, body, MODELS, ASPECTS, RESOLUTIONS, DEFAULT_MODEL, ENDPOINT };
