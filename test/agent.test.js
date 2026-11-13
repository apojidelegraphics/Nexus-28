// Agent tests: tool-calling wire formats, agent loop, tools, web parsing, MCP (real SDK server), conversations.
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { chat, geminiSchema } = require('../src/providers');
const { runAgent } = require('../src/agent');
const tools = require('../src/tools');
const web = require('../src/web');
const { McpManager } = require('../src/mcp');
const { Conversations, titleFrom } = require('../src/conversations');

let n = 0; const ok = m => { n++; console.log('  ✓', m); };
const seen = {};
const sse = (res, events) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('')); };

const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', () => {
    const body = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
    seen[req.url.split('?')[0]] = body;
    const u = req.url;
    if (u === '/oa/chat/completions') {
      const hasTool = body.messages.some(m => m.role === 'tool');
      if (!hasTool) return sse(res, [
        { choices: [{ delta: { content: 'Let me check. ' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'web_search', arguments: '{"que' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"nexus"}' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_2', type: 'function', function: { name: 'fetch_url', arguments: '{"url":"https://x.y"}' } }] } }] }, '[DONE]']);
      return sse(res, [{ choices: [{ delta: { content: 'Done.' } }] }, '[DONE]']);
    }
    if (u === '/nt/chat/completions') { res.writeHead(400); return res.end(JSON.stringify({ error: { message: 'registry.ollama.ai/library/gemma does not support tools' } })); }
    if (u === '/an/messages') return sse(res, [
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Searching.' } },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'web_search', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"weather"}' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } }]);
    if (u.startsWith('/ge/models/g:streamGenerateContent')) return sse(res, [
      { candidates: [{ content: { parts: [{ functionCall: { name: 'web_search', args: { query: 'q' } }, thoughtSignature: 'SIG123' }] } }] }]);
    // web fixtures
    if (u.startsWith('/ddg/html/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(path.join(__dirname, 'fixtures', 'ddg.html'))); }
    if (u === '/tv/search') { res.writeHead(200); return res.end(JSON.stringify({ results: [{ title: 'T1', url: 'https://a.com', content: 'snippet' }], images: ['https://img.com/1.jpg', { url: 'https://img.com/2.jpg' }] })); }
    if (u.startsWith('/br/web/search')) { res.writeHead(200); return res.end(JSON.stringify({ web: { results: [{ title: '<strong>B</strong>1', url: 'https://b.com', description: 'desc &amp; more', thumbnail: { src: 'https://t.com/b.jpg' } }] } })); }
    if (u === '/page') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(`<html><head><title>Nexus &amp; Co</title><meta property="og:image" content="/hero.png"><meta property="og:description" content="The best HUD"></head><body><nav>menu</nav><article><h1>Hello</h1><p>${'Body text. '.repeat(100)}</p><script>evil()</script></article></body></html>`); }
    if (u === '/redirect') { res.writeHead(302, { Location: '/page' }); return res.end(); }
    if (u === '/pic.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end('PNG'); }
    res.writeHead(404); res.end();
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const B = `http://127.0.0.1:${server.address().port}`;
  const T = [{ name: 'web_search', description: 'search', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }];

  // ---------- Provider tool-call wire formats
  let txt = '';
  let r = await chat({ provider: 'openai', model: 'm', key: 'k', baseUrl: B + '/oa', system: 'S', messages: [{ role: 'user', content: 'hi' }], tools: T, onText: t => txt += t });
  assert.strictEqual(r.text, 'Let me check. ');
  assert.deepStrictEqual(r.toolCalls.map(c => [c.id, c.name, c.args]), [['call_1', 'web_search', { query: 'nexus' }], ['call_2', 'fetch_url', { url: 'https://x.y' }]]);
  assert.strictEqual(seen['/oa/chat/completions'].tools[0].function.name, 'web_search');
  ok('OpenAI-compatible: streamed tool calls assembled across chunks');
  await chat({ provider: 'openai', model: 'm', key: 'k', baseUrl: B + '/oa', messages: [
    { role: 'user', content: 'hi' }, { role: 'assistant', content: 'x', toolCalls: [{ id: 'call_1', name: 'web_search', args: { query: 'q' } }] },
    { role: 'tool', toolCallId: 'call_1', name: 'web_search', content: 'res' }], tools: T });
  const om = seen['/oa/chat/completions'].messages;
  assert.strictEqual(om[1].tool_calls[0].function.arguments, '{"query":"q"}');
  assert.deepStrictEqual(om[2], { role: 'tool', tool_call_id: 'call_1', content: 'res' });
  ok('OpenAI-compatible: tool results sent back in wire format');

  r = await chat({ provider: 'anthropic', model: 'c', key: 'k', baseUrl: B + '/an', messages: [
    { role: 'user', content: 'hi' }, { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'web_search', args: {} }, { id: 'b', name: 'web_search', args: {} }] },
    { role: 'tool', toolCallId: 'a', name: 'web_search', content: 'r1' }, { role: 'tool', toolCallId: 'b', name: 'web_search', content: 'r2', isError: true }], tools: T });
  assert.deepStrictEqual(r.toolCalls, [{ id: 'toolu_1', name: 'web_search', args: { query: 'weather' } }]);
  const am = seen['/an/messages'];
  assert.strictEqual(am.tools[0].input_schema.type, 'object');
  assert.strictEqual(am.messages[1].content[0].type, 'tool_use');
  assert.strictEqual(am.messages[2].content.length, 2, 'parallel tool results merged into one user turn');
  assert.strictEqual(am.messages[2].content[1].is_error, true);
  ok('Anthropic: tool_use parsing + merged tool_result turn');

  r = await chat({ provider: 'gemini', model: 'g', key: 'k', baseUrl: B + '/ge', messages: [
    { role: 'user', content: 'hi' }, { role: 'assistant', content: '', toolCalls: [{ id: 'x', name: 'web_search', args: { query: 'a' }, thoughtSignature: 'PREV' }] },
    { role: 'tool', toolCallId: 'x', name: 'web_search', content: 'res' }], tools: [{ name: 'mcp_tool', description: 'd', parameters: { type: 'object', additionalProperties: false, $schema: 'x', properties: { a: { type: ['string', 'null'], default: 'z' } } } }] });
  assert.strictEqual(r.toolCalls[0].thoughtSignature, 'SIG123');
  const gm = seen['/ge/models/g:streamGenerateContent'];
  assert.strictEqual(gm.contents[1].parts[0].thoughtSignature, 'PREV');
  assert.deepStrictEqual(gm.contents[2].parts[0].functionResponse, { name: 'web_search', response: { result: 'res' } });
  assert.deepStrictEqual(gm.tools[0].functionDeclarations[0].parameters, { type: 'object', properties: { a: { type: 'string', nullable: true } } });
  ok('Gemini: functionCall + thoughtSignature round-trip, schema sanitized');

  await assert.rejects(chat({ provider: 'ollama', model: 'gemma', baseUrl: B + '/nt', messages: [{ role: 'user', content: 'hi' }], tools: T }), e => e.toolsUnsupported === true);
  ok('tool-incapable local model detected');

  // ---------- Agent loop (scripted model)
  const script = (steps) => { let i = 0; return async ({ onText, tools: tl }) => { const s = steps[i++]; if (s.throwTools && tl.length) { const e = new Error('no tools'); e.toolsUnsupported = true; throw e; } if (s.text) onText(s.text); return { text: s.text || '', toolCalls: s.calls || [] }; }; };
  const events = [];
  let out = '';
  const res = await runAgent({
    chat: script([
      { text: 'Looking.', calls: [{ id: '1', name: 'web_search', args: { query: 'q' } }, { id: '2', name: 'calendar_create_event', args: { title: 'Dentist', start: '2026-11-14T15:00' } }, { id: '3', name: 'fetch_url', args: { url: 'u' } }] },
      { text: 'All set.' }]),
    request: {}, messages: [{ role: 'user', content: 'go' }], tools: [{ name: 'web_search' }, { name: 'calendar_create_event' }, { name: 'fetch_url' }],
    exec: async (name) => { if (name === 'fetch_url') throw new Error('404'); return { content: 'ok', activity: { summary: '2 results', sources: [{ title: 'S', url: 'https://s' }], images: ['https://i/1.jpg'] } }; },
    describe: tools.describe, needsConfirm: tools.needsConfirm,
    confirm: async ({ label }) => { events.push('confirm:' + label); return false; },
    onText: t => out += t, onEvent: e => events.push(e.type === 'status' ? 's:' + e.status : `a:${e.activity.tool}:${e.activity.status}`)
  });
  assert.strictEqual(res.text, 'Looking.\n\nAll set.'); assert.strictEqual(out, res.text);
  assert.deepStrictEqual(res.activity.map(a => [a.tool, a.status]), [['web_search', 'ok'], ['calendar_create_event', 'denied'], ['fetch_url', 'error']]);
  assert.deepStrictEqual(res.sources, [{ title: 'S', url: 'https://s' }]); assert.deepStrictEqual(res.images, ['https://i/1.jpg']);
  assert.ok(events.includes('confirm:Add calendar event') && events.includes('s:connecting') && events.includes('s:tool') && events.includes('s:awaiting'));
  ok('agent loop: tools run, write action needs approval, denial + errors reported back');

  const res2 = await runAgent({ chat: script([{ throwTools: true }, { text: 'Plain answer.' }]), request: {}, messages: [{ role: 'user', content: 'x' }], tools: [{ name: 't' }],
    exec: async () => ({}), describe: tools.describe, needsConfirm: () => false, confirm: async () => true });
  assert.ok(res2.toolsDropped && res2.text === 'Plain answer.');
  ok('agent loop: falls back to no tools when the model cannot call them');

  // Weak model: invents tool names and loops (the bug from the screenshot)
  let execCount = 0;
  const looping = async () => ({ text: '', toolCalls: [{ id: 'x' + Math.random(), name: 'calendar', args: { start: '2026-11-09' } }, { id: 'y' + Math.random(), name: 'reminders', args: {} }] });
  const res3 = await runAgent({
    chat: looping, request: {}, messages: [{ role: 'user', content: "what's on my calendar" }],
    tools: [{ name: 'web_search' }, { name: 'calendar_events' }, { name: 'calendar_create_event' }, { name: 'reminders_list' }, { name: 'reminders_create' }],
    exec: async (name) => { execCount++; throw new Error('unknown command ' + (name === 'calendar_events' ? 'cal_list' : 'rem_list')); },
    describe: tools.describe, needsConfirm: tools.needsConfirm, confirm: async () => true, maxSteps: 8
  });
  assert.deepStrictEqual(res3.activity.slice(0, 2).map(a => a.tool), ['calendar_events', 'reminders_list'], 'invented names mapped to the read-only tools');
  assert.strictEqual(execCount, 2, 'identical failing calls are not re-run');
  assert.ok(res3.activity.length <= 6, `loop stopped early (${res3.activity.length} calls)`);
  assert.ok(/couldn't complete that/.test(res3.text) && /npm run build:helper/.test(res3.text), res3.text);
  ok('agent guard: invented tool names mapped, repeats skipped, loop stopped with a clear explanation');
  const res4 = await runAgent({
    chat: script([{ calls: [{ id: 'q', name: 'teleport', args: {} }] }, { text: 'Sorry, I cannot teleport.' }]), request: {}, messages: [{ role: 'user', content: 'x' }],
    tools: [{ name: 'web_search' }], exec: async () => ({}), describe: tools.describe, needsConfirm: tools.needsConfirm, confirm: async () => true
  });
  assert.ok(/No tool named "teleport". Available tools: web_search/.test(res4.activity[0].summary) && res4.text === 'Sorry, I cannot teleport.');
  ok('agent guard: unknown tool gets the list of real tools, model recovers');

  // ---------- Tools
  assert.deepStrictEqual(tools.buildToolset({ agentic: false, settings: { web: { enabled: true } }, helperBuilt: true }).labels, []);
  assert.deepStrictEqual(tools.buildToolset({ agentic: false, settings: { web: { enabled: true, chatAgents: true } }, helperBuilt: true }).labels, ['web_search', 'fetch_url', 'weather']);
  assert.deepStrictEqual(tools.buildToolset({ agentic: true, settings: { web: { enabled: true }, apple: { calendar: true } }, helperBuilt: true }).labels, ['web_search', 'fetch_url', 'weather', 'look_at_screen', 'calendar_events', 'calendar_create_event']);
  assert.deepStrictEqual(tools.buildToolset({ agentic: true, settings: { web: { enabled: true }, apple: { calendar: true }, weather: { enabled: false }, screen: { enabled: false } }, helperBuilt: false }).labels, ['web_search', 'fetch_url']);
  assert.ok(tools.needsConfirm('look_at_screen') && !tools.needsConfirm('web_search'));
  ok('toolset gating: Paragon gets connectors + screen (asks first), chat agents only web (if allowed)');
  const local = tools.parseWhen('2026-11-14');
  assert.strictEqual(new Date(local * 1000).getHours(), 0);
  assert.throws(() => tools.parseWhen('next blursday'), /Couldn't understand/);
  ok('date parsing (date-only is local midnight)');
  const fakeHelper = { available: () => true, request: async (obj) => { assert.strictEqual(obj.cmd, 'cal_create'); return { data: { title: obj.title, start: obj.start, end: obj.end, calendar: 'Home' } }; } };
  const cr = await tools.execute('calendar_create_event', { title: 'Dentist', start: '2026-11-14T15:00' }, { settings: {}, helper: fakeHelper });
  assert.ok(/Created "Dentist" on .*Nov 14.*3:00 PM in Home/.test(cr.content), cr.content);
  ok('calendar create → helper request with epoch times');

  // ---------- Web
  process.env.NEXUS_TEST_ALLOW_PRIVATE = '0';
  await assert.rejects(web.assertPublicUrl('http://127.0.0.1/'), /blocked/);
  await assert.rejects(web.assertPublicUrl('http://localhost:3000/'), /blocked/);
  await assert.rejects(web.assertPublicUrl('http://192.168.1.1/'), /blocked/);
  await assert.rejects(web.assertPublicUrl('http://[::1]/'), /blocked/);
  await assert.rejects(web.assertPublicUrl('file:///etc/passwd'), /Only http/);
  assert.ok(web.isPrivateIp('10.0.0.5') && web.isPrivateIp('::ffff:127.0.0.1') && !web.isPrivateIp('8.8.8.8'));
  ok('private network addresses blocked');
  process.env.NEXUS_TEST_ALLOW_PRIVATE = '1';
  let s = await web.search({ provider: 'duckduckgo', query: 'nexus', base: B + '/ddg' });
  assert.deepStrictEqual(s.results.map(x => x.url), ['https://example.com/one', 'https://news.example.org/two?a=1&b=2']);
  assert.strictEqual(s.results[0].title, 'Example One & More');
  ok('DuckDuckGo results parsed (ads skipped, redirect links decoded)');
  s = await web.search({ provider: 'tavily', query: 'x', key: 'tk', base: B + '/tv' });
  assert.deepStrictEqual(s.images, ['https://img.com/1.jpg', 'https://img.com/2.jpg']);
  s = await web.search({ provider: 'brave', query: 'x', key: 'bk', base: B + '/br' });
  assert.deepStrictEqual([s.results[0].title, s.results[0].snippet, s.images[0]], ['B1', 'desc & more', 'https://t.com/b.jpg']);
  await assert.rejects(web.search({ provider: 'tavily', query: 'x' }), /No Tavily key/);
  ok('Tavily (with images) and Brave results normalized');
  const page = await web.fetchPage(B + '/redirect');
  assert.strictEqual(page.title, 'Nexus & Co'); assert.ok(page.text.startsWith('Hello') && !page.text.includes('evil') && !page.text.includes('menu'));
  assert.strictEqual(page.image, B + '/hero.png');
  ok('fetch_url: follows redirects, extracts article text, strips scripts/nav');
  const pv = await web.linkPreview(B + '/page');
  assert.deepStrictEqual([pv.kind, pv.title, pv.description, pv.image], ['page', 'Nexus & Co', 'The best HUD', B + '/hero.png']);
  assert.strictEqual((await web.linkPreview(B + '/pic.png')).kind, 'image');
  ok('link previews (page + image)');

  // ---------- MCP with a real SDK server over stdio
  const mcp = new McpManager({ env: { ...process.env, TEST_TOKEN: 'from-env' } });
  const conn = await mcp.connect({ id: 'n1', name: 'My Notes', type: 'stdio', command: process.execPath, args: [path.join(__dirname, 'mcp-test-server.js')], confirmWrites: true }, { env: { TEST_TOKEN: 'secret-123' } });
  assert.strictEqual(conn.status, 'connected', conn.error);
  const { tools: mt, routes } = mcp.agentTools();
  assert.deepStrictEqual(mt.map(t => t.name).sort(), ['my_notes__explode', 'my_notes__list_notes', 'my_notes__send_note']);
  assert.strictEqual(routes.my_notes__list_notes.confirm, false);
  assert.strictEqual(routes.my_notes__send_note.confirm, true);
  let mr = await mcp.call(routes.my_notes__list_notes, { tag: 'work' });
  assert.strictEqual(mr.text, 'notes for work: alpha, beta (token=secret-123)');
  mr = await mcp.call(routes.my_notes__explode, {});
  assert.ok(mr.isError);
  ok('MCP: stdio server connected, tools namespaced, read/write classified, secrets passed as env');
  const ex = await tools.execute('my_notes__send_note', { to: 'Lucas', body: 'hi' }, { settings: {}, mcp, routes });
  assert.strictEqual(ex.content, 'sent "hi" to Lucas');
  assert.ok(tools.needsConfirm('my_notes__send_note', routes.my_notes__send_note));
  await assert.rejects(tools.execute('my_notes__explode', {}, { settings: {}, mcp, routes }), /kaboom/);
  ok('MCP: calls routed through the tool executor (errors surface)');
  const bad = await mcp.connect({ id: 'b', name: 'Bad', type: 'stdio', command: 'definitely-not-a-command-xyz', args: [] });
  assert.strictEqual(bad.status, 'error'); assert.ok(/not found/.test(bad.error), bad.error);
  ok('MCP: missing command reported clearly');
  await mcp.closeAll();

  // ---------- Conversations
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-conv-'));
  fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify([{ role: 'user', content: '@paragon brief me on the week ahead please', ts: 1 }, { role: 'assistant', persona: 'paragon', content: 'ok', ts: 2 }]));
  const cv = new Conversations(dir);
  let sum = cv.summary();
  assert.strictEqual(sum.list.length, 1); assert.strictEqual(sum.list[0].title, 'brief me on the week ahead please');
  ok('conversations: older history migrated into first chat');
  const fresh = cv.create(); assert.strictEqual(cv.create().id, fresh.id, 'empty chat reused');
  cv.append({ role: 'user', content: 'What is the weather like in Boston this weekend for the game?' });
  assert.strictEqual(cv.active().title, 'What is the weather like in Boston this…');
  sum = cv.summary(); assert.strictEqual(sum.list.length, 2); assert.strictEqual(sum.list[0].id, fresh.id);
  cv.remove(fresh.id); assert.strictEqual(cv.summary().list.length, 1);
  cv.clearAll(); assert.strictEqual(cv.summary().list.length, 0);
  const reread = new Conversations(dir); assert.strictEqual(reread.summary().list.length, 0);
  assert.strictEqual(titleFrom(''), 'New chat');
  ok('conversations: create/reuse/title/delete/clear persist');

  console.log(`\n${n} agent checks passed`);
  server.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
