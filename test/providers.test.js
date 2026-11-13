// Runs every provider adapter against a local mock server that speaks each API's wire format.
const http = require('http');
const assert = require('assert');
const { stream, listModels } = require('../src/providers');

const seen = {};
const sse = (res, events) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  // Split writes mid-event to exercise buffering.
  const body = events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  const mid = Math.floor(body.length / 2);
  res.write(body.slice(0, mid));
  setTimeout(() => { res.end(body.slice(mid)); }, 10);
};

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : null;
    const u = req.url;
    seen[u.split('?')[0]] = { headers: req.headers, body };
    if (u === '/oa/chat/completions') return sse(res, [
      { choices: [{ delta: { role: 'assistant' } }] },
      { choices: [{ delta: { content: 'Hello ' } }] },
      { choices: [{ delta: { content: 'Lucas' } }] }, '[DONE]']);
    if (u === '/oa/models') { res.writeHead(200); return res.end(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }] })); }
    if (u === '/an/messages') return sse(res, [
      { type: 'message_start' },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Para' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'gon' } },
      { type: 'message_stop' }]);
    if (u.startsWith('/an/models')) { res.writeHead(200); return res.end(JSON.stringify({ data: [{ id: 'claude-x' }] })); }
    if (u.startsWith('/ge/models/gem-1:streamGenerateContent')) return sse(res, [
      { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Gem' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'ini' }] } }] }]);
    if (u.startsWith('/ge/models')) { res.writeHead(200); return res.end(JSON.stringify({ models: [
      { name: 'models/gem-1', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] })); }
    if (u === '/bad/chat/completions') { res.writeHead(401); return res.end(JSON.stringify({ error: { message: 'Invalid key' } })); }
    res.writeHead(404); res.end();
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const B = `http://127.0.0.1:${server.address().port}`;
  const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'again' }];
  let n = 0; const ok = m => { n++; console.log('  ✓', m); };

  // OpenAI-compatible family
  for (const id of ['openai', 'deepseek', 'openrouter', 'ollama', 'lmstudio']) {
    let chunks = '';
    const out = await stream({ provider: id, model: 'm', baseUrl: B + '/oa', key: 'k', system: 'SYS', messages: msgs, onText: t => chunks += t });
    assert.strictEqual(out, 'Hello Lucas'); assert.strictEqual(chunks, out);
    const s = seen['/oa/chat/completions'];
    assert.strictEqual(s.body.messages[0].role, 'system');
    assert.strictEqual(s.headers.authorization, 'Bearer k');
    if (id === 'openrouter') assert.ok(s.headers['x-title']);
    ok(`${id} streams`);
  }
  assert.deepStrictEqual(await listModels({ provider: 'ollama', baseUrl: B + '/oa' }), ['a', 'b']); ok('openai-compat listModels');

  // Anthropic
  let out = await stream({ provider: 'anthropic', model: 'c', baseUrl: B + '/an', key: 'ak', system: 'SYS', messages: msgs });
  assert.strictEqual(out, 'Paragon');
  assert.strictEqual(seen['/an/messages'].headers['x-api-key'], 'ak');
  assert.strictEqual(seen['/an/messages'].body.system, 'SYS');
  ok('anthropic streams');
  assert.deepStrictEqual(await listModels({ provider: 'anthropic', key: 'ak', baseUrl: B + '/an' }), ['claude-x']); ok('anthropic listModels');

  // Gemini
  out = await stream({ provider: 'gemini', model: 'gem-1', baseUrl: B + '/ge', key: 'gk', system: 'SYS', messages: msgs });
  assert.strictEqual(out, 'Gemini');
  const g = seen['/ge/models/gem-1:streamGenerateContent'];
  assert.strictEqual(g.headers['x-goog-api-key'], 'gk');
  assert.strictEqual(g.body.contents[1].role, 'model');
  assert.strictEqual(g.body.systemInstruction.parts[0].text, 'SYS');
  ok('gemini streams (thought parts skipped)');
  assert.deepStrictEqual(await listModels({ provider: 'gemini', key: 'gk', baseUrl: B + '/ge' }), ['gem-1']); ok('gemini listModels');

  // Errors
  await assert.rejects(stream({ provider: 'openai', model: 'm', baseUrl: B + '/bad', key: 'k', messages: msgs }), /401: Invalid key/); ok('HTTP errors surface message');
  await assert.rejects(stream({ provider: 'openai', model: 'm', messages: msgs }), /No API key/); ok('missing key caught');
  await assert.rejects(stream({ provider: 'ollama', model: 'm', baseUrl: 'http://127.0.0.1:1/v1', messages: msgs }), /isn't running/); ok('local server down message');
  await assert.rejects(stream({ provider: 'apple', messages: msgs }), /NexusCore/); ok('apple without helper');
  out = await stream({ provider: 'apple', system: 'S', messages: msgs, appleFM: async ({ system, messages }) => `fm:${system}:${messages.length}` });
  assert.strictEqual(out, 'fm:S:3'); ok('apple via helper');

  // Abort
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(stream({ provider: 'ollama', model: 'm', baseUrl: B + '/oa', messages: msgs, signal: ctrl.signal }), e => e.name === 'AbortError'); ok('abort');

  console.log(`\n${n} provider checks passed`);
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
