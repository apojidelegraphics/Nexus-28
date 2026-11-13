// Nexus provider layer — one interface over every backend, with tool calling.
//
//   chat({ provider, model, system, messages, tools, key, baseUrl, signal, onText, appleFM })
//     -> { text, toolCalls: [{ id, name, args, thoughtSignature? }] }
//   stream(opts) -> text            (chat without tools; kept for simple callers)
//   listModels({ provider, key, baseUrl }) -> [modelId]
//
// Normalized messages:
//   { role: 'user', content }
//   { role: 'assistant', content, toolCalls?: [{ id, name, args, thoughtSignature? }] }
//   { role: 'tool', toolCallId, name, content, isError? }
// Normalized tools: [{ name, description, parameters (JSON Schema) }]

const PROVIDERS = {
  anthropic:  { label: 'Claude (Anthropic)', kind: 'anthropic', base: 'https://api.anthropic.com/v1', needsKey: true, defaultModel: 'claude-sonnet-4-5' },
  openai:     { label: 'ChatGPT (OpenAI)',   kind: 'openai',    base: 'https://api.openai.com/v1',    needsKey: true, defaultModel: 'gpt-5-mini' },
  gemini:     { label: 'Gemini (Google)',    kind: 'gemini',    base: 'https://generativelanguage.googleapis.com/v1beta', needsKey: true, defaultModel: 'gemini-2.5-flash' },
  deepseek:   { label: 'DeepSeek',           kind: 'openai',    base: 'https://api.deepseek.com',     needsKey: true, defaultModel: 'deepseek-chat' },
  openrouter: { label: 'OpenRouter',         kind: 'openai',    base: 'https://openrouter.ai/api/v1', needsKey: true, defaultModel: 'openrouter/auto' },
  ollama:     { label: 'Ollama (local)',     kind: 'openai',    base: 'http://localhost:11434/v1',    needsKey: false, local: true, defaultModel: 'llama3.2' },
  lmstudio:   { label: 'LM Studio (local)',  kind: 'openai',    base: 'http://localhost:1234/v1',     needsKey: false, local: true, defaultModel: '' },
  apple:      { label: 'Apple Foundation Models (local)', kind: 'apple', base: '', needsKey: false, local: true, defaultModel: 'system', noTools: true }
};

class ProviderError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
const TOOLS_UNSUPPORTED = /does not support tools|tools? (?:are |is )?not supported|tool(?:s| calling| use) (?:is )?(?:not|un)supported|unsupported (?:parameter|field)[^.]*tools|no endpoints found that support tool/i;

function trimSlash(u) { return (u || '').replace(/\/+$/, ''); }
const safeParse = s => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
let idSeq = 0;
const newId = p => `${p}_${Date.now().toString(36)}${(idSeq++).toString(36)}`;

// Parse a Server-Sent Events body, calling onEvent(dataString) per "data:" payload.
async function readSSE(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = raw.split(/\r?\n/)
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) onEvent(data);
    }
  }
  const tail = buf.trim();
  if (tail.startsWith('data:')) onEvent(tail.slice(5).trim());
}

async function failIfBad(res, providerLabel) {
  if (res.ok) return;
  let detail = '';
  try {
    const body = await res.text();
    try {
      const j = JSON.parse(body);
      detail = j.error?.message || j.message || j.error || body;
    } catch { detail = body; }
  } catch {}
  if (typeof detail !== 'string') detail = JSON.stringify(detail);
  throw new ProviderError(`${providerLabel} ${res.status}: ${detail.slice(0, 300)}`, res.status);
}

function resolve(providerId, baseUrl) {
  const p = PROVIDERS[providerId];
  if (!p) throw new ProviderError(`Unknown provider "${providerId}"`);
  return { p, base: trimSlash(baseUrl || p.base) };
}

// ---------- OpenAI-compatible (OpenAI, DeepSeek, OpenRouter, Ollama, LM Studio)
function toOpenAIMessages(system, messages) {
  const out = system ? [{ role: 'system', content: system }] : [];
  for (const m of messages) {
    if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    else if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant', content: m.content || null,
        tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } }))
      });
    } else out.push({ role: m.role, content: m.content });
  }
  return out;
}
async function chatOpenAI({ providerId, p, base, model, system, messages, tools, key, signal, onText }) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/Apoji-Delegraphics/nexus-desktop';
    headers['X-Title'] = 'Nexus Desktop';
  }
  const body = { model, stream: true, messages: toOpenAIMessages(system, messages) };
  if (tools?.length) body.tools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, signal, body: JSON.stringify(body) });
  await failIfBad(res, p.label);
  let text = '';
  const calls = [];
  await readSSE(res, data => {
    if (data === '[DONE]') return;
    let j; try { j = JSON.parse(data); } catch { return; }
    if (j.error) throw new ProviderError(`${p.label}: ${j.error.message || j.error}`);
    const d = j.choices?.[0]?.delta;
    if (!d) return;
    if (d.content) { text += d.content; onText(d.content); }
    for (const tc of d.tool_calls || []) {
      const i = tc.index ?? calls.length;
      calls[i] = calls[i] || { id: '', name: '', argStr: '' };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].name += tc.function.name;
      if (tc.function?.arguments) calls[i].argStr += tc.function.arguments;
    }
  });
  return {
    text,
    toolCalls: calls.filter(Boolean).filter(c => c.name).map(c => ({ id: c.id || newId('call'), name: c.name, args: safeParse(c.argStr) }))
  };
}

// ---------- Anthropic
function toAnthropicMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content, ...(m.isError ? { is_error: true } : {}) };
      const last = out[out.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every(b => b.type === 'tool_result')) last.content.push(block);
      else out.push({ role: 'user', content: [block] });
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      const content = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
      out.push({ role: 'assistant', content });
    } else out.push({ role: m.role, content: m.content });
  }
  return out;
}
async function chatAnthropic({ p, base, model, system, messages, tools, key, signal, onText }) {
  const body = { model, max_tokens: 8192, stream: true, system: system || undefined, messages: toAnthropicMessages(messages) };
  if (tools?.length) body.tools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const res = await fetch(`${base}/messages`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body)
  });
  await failIfBad(res, p.label);
  let text = '';
  const blocks = {};
  await readSSE(res, data => {
    let j; try { j = JSON.parse(data); } catch { return; }
    if (j.type === 'error') throw new ProviderError(`${p.label}: ${j.error?.message}`);
    if (j.type === 'content_block_start' && j.content_block?.type === 'tool_use') {
      blocks[j.index] = { id: j.content_block.id, name: j.content_block.name, json: '' };
    } else if (j.type === 'content_block_delta') {
      if (j.delta?.type === 'text_delta') { text += j.delta.text; onText(j.delta.text); }
      else if (j.delta?.type === 'input_json_delta' && blocks[j.index]) blocks[j.index].json += j.delta.partial_json;
    }
  });
  return {
    text,
    toolCalls: Object.keys(blocks).sort((a, b) => a - b).map(k => ({ id: blocks[k].id, name: blocks[k].name, args: safeParse(blocks[k].json) }))
  };
}

// ---------- Gemini
const GEMINI_KEYS = new Set(['type', 'description', 'properties', 'required', 'items', 'enum', 'format', 'nullable', 'minimum', 'maximum', 'minItems', 'maxItems', 'anyOf']);
function geminiSchema(s) {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (!GEMINI_KEYS.has(k)) continue;
    if (k === 'type' && Array.isArray(v)) {
      const t = v.filter(x => x !== 'null');
      out.type = t[0] || 'string';
      if (v.includes('null')) out.nullable = true;
    } else if (k === 'properties') {
      out.properties = Object.fromEntries(Object.entries(v || {}).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    } else if (k === 'format') {
      if (['enum', 'date-time'].includes(v)) out.format = v;
    } else out[k] = typeof v === 'object' ? geminiSchema(v) : v;
  }
  if (out.type === 'object' && !out.properties) out.properties = {};
  return out;
}
function toGeminiContents(messages) {
  const out = [];
  const push = (role, part) => {
    const last = out[out.length - 1];
    if (last && last.role === role && part.functionResponse && last.parts.every(x => x.functionResponse)) last.parts.push(part);
    else out.push({ role, parts: [part] });
  };
  for (const m of messages) {
    if (m.role === 'tool') push('user', { functionResponse: { name: m.name, response: { result: m.content } } });
    else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls || []) parts.push({ functionCall: { name: c.name, args: c.args || {} }, ...(c.thoughtSignature ? { thoughtSignature: c.thoughtSignature } : {}) });
      if (!parts.length) parts.push({ text: '' });
      out.push({ role: 'model', parts });
    } else out.push({ role: 'user', parts: [{ text: m.content }] });
  }
  return out;
}
async function chatGemini({ p, base, model, system, messages, tools, key, signal, onText }) {
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: toGeminiContents(messages)
  };
  if (tools?.length) body.tools = [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) }];
  const res = await fetch(`${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body)
  });
  await failIfBad(res, p.label);
  let text = '';
  const toolCalls = [];
  await readSSE(res, data => {
    let j; try { j = JSON.parse(data); } catch { return; }
    if (j.error) throw new ProviderError(`${p.label}: ${j.error.message}`);
    for (const part of j.candidates?.[0]?.content?.parts || []) {
      if (part.functionCall) toolCalls.push({ id: newId('fc'), name: part.functionCall.name, args: part.functionCall.args || {}, ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}) });
      else if (part.text && !part.thought) { text += part.text; onText(part.text); }
    }
  });
  return { text, toolCalls };
}

// ---------- Public API
async function chat(opts) {
  const { provider, baseUrl, model } = opts;
  const { p, base } = resolve(provider, baseUrl);
  const onText = opts.onText || (() => {});
  if (p.kind === 'apple') {
    if (!opts.appleFM) throw new ProviderError(`${p.label} needs the NexusCore helper.`);
    const plain = (opts.messages || []).filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content || '' }));
    const text = await opts.appleFM({ system: opts.system, messages: plain, signal: opts.signal });
    onText(text);
    return { text, toolCalls: [] };
  }
  if (p.needsKey && !opts.key) throw new ProviderError(`No API key set for ${p.label}. Open Settings → Providers.`);
  const m = model || p.defaultModel;
  if (!m) throw new ProviderError(`No model chosen for ${p.label}. Open Settings → Agents and pick one.`);
  const args = { ...opts, providerId: provider, p, base, model: m, onText };
  try {
    if (p.kind === 'anthropic') return await chatAnthropic(args);
    if (p.kind === 'gemini') return await chatGemini(args);
    return await chatOpenAI(args);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    if (p.local && /ECONNREFUSED|fetch failed/i.test(String(e.cause?.code || e.message))) {
      throw new ProviderError(`${p.label} isn't running at ${base}. Start it and try again.`);
    }
    if (opts.tools?.length && TOOLS_UNSUPPORTED.test(e.message)) e.toolsUnsupported = true;
    throw e;
  }
}

async function stream(opts) {
  return (await chat({ ...opts, tools: [] })).text;
}

async function listModels({ provider, key, baseUrl }) {
  const { p, base } = resolve(provider, baseUrl);
  if (p.kind === 'apple') return ['system'];
  if (p.needsKey && !key) throw new ProviderError(`No API key set for ${p.label}.`);
  let res, ids = [];
  try {
    if (p.kind === 'anthropic') {
      res = await fetch(`${base}/models?limit=100`, { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } });
      await failIfBad(res, p.label);
      ids = (await res.json()).data.map(m => m.id);
    } else if (p.kind === 'gemini') {
      res = await fetch(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
      await failIfBad(res, p.label);
      ids = (await res.json()).models
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));
    } else {
      res = await fetch(`${base}/models`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
      await failIfBad(res, p.label);
      ids = (await res.json()).data.map(m => m.id);
    }
  } catch (e) {
    if (p.local && /ECONNREFUSED|fetch failed/i.test(String(e.cause?.code || e.message))) {
      throw new ProviderError(`${p.label} isn't running at ${base}.`);
    }
    throw e;
  }
  return ids.sort();
}

module.exports = { PROVIDERS, chat, stream, listModels, ProviderError, readSSE, geminiSchema, TOOLS_UNSUPPORTED };
