// Electron smoke test: boots the real main process with the fake helper and a mock model server,
// then checks all three windows, conversation migration, an agent tool run, and an MCP connector.
// Run: NEXUS_HELPER=test/fake-helper.js NEXUS_TEST_ALLOW_PRIVATE=1 electron test/smoke.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const dir = path.join(require('os').tmpdir(), 'nexus-smoke');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
app.setPath('userData', dir);
process.env.NEXUS_KEEP_USERDATA = '1';
process.env.FAKE_WAKE = '1';
app.commandLine.appendSwitch('password-store', 'basic'); // Linux CI has no keychain
app.whenReady().then(() => { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable() && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true); });
fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify([{ role: 'user', content: 'old saved chat', ts: 1 }]));

// Mock OpenAI-compatible model: first turn calls fetch_url, second turn answers.
const model = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
    if (req.url.startsWith('/rest/v1/assistant_prompts')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify([{ name: 'Nexus 28 Paragon', prompt: 'CLOUD PARAGON PROMPT', features: [], updated_at: '2026-11-12T00:00:00Z' }, { name: 'Nexus -27 Armerad', prompt: 'LEGACY ARMERAD PROMPT', features: ['Seek', 'Cognition'], updated_at: '2025-07-12T00:00:00Z' }])); }
    if (req.url.startsWith('/rest/v1/app_content')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify([{ content: 'sk-free-test' }])); }
    if (req.url.startsWith('/rest/v1/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('[]'); }
    if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'm/x:free', name: 'X (free)', pricing: { prompt: '0', completion: '0' } }, { id: 'paid/y', name: 'Y', pricing: { prompt: '1', completion: '1' } }] })); }
    if (req.url.startsWith('/gh/repos/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ tag_name: 'v1.0.1', name: 'v1.0.1', html_url: 'https://github.com/apojidelegraphics/Nexus-28/releases/tag/v1.0.1', assets: [] })); }
    if (req.url === '/page') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<title>Mock Page</title><article><p>The secret word is HELIX.</p></article>'); }
    const body = JSON.parse(raw);
    if (req.headers.authorization === 'Bearer sk-free-test') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'FREE OK ' + body.model } }] })}\n\ndata: [DONE]\n\n`); }
    const sse = ev => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(ev.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'); };
    const toolMsg = body.messages.find(m => m.role === 'tool');
    if (!toolMsg) return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'fetch_url', arguments: JSON.stringify({ url: `http://127.0.0.1:${model.address().port}/page` }) } }] } }] }]);
    const word = /HELIX/.test(toolMsg.content) ? 'HELIX' : 'unknown';
    sse([{ choices: [{ delta: { content: `The word is ${word}. Tools offered: ${body.tools.map(t => t.function.name).join(',')}. cloudPrompt=${body.messages[0].content.startsWith('CLOUD PARAGON PROMPT')} legacyPrompt=${body.messages[0].content.startsWith('LEGACY ARMERAD PROMPT')} seek=${/ACTIVE FEATURES[\s\S]*Seek:/.test(body.messages[0].content)}` } }] }]);
  });
}).listen(0);
process.env.NEXUS_CLOUD_URL = 'http://127.0.0.1:' + 0; // placeholder, set once listening
model.on('listening', () => { process.env.NEXUS_CLOUD_URL = `http://127.0.0.1:${model.address().port}`; process.env.NEXUS_FREE_BASE = `http://127.0.0.1:${model.address().port}/v1`; process.env.NEXUS_UPDATE_BASE = `http://127.0.0.1:${model.address().port}/gh`; });

const loaded = new Set();
app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (...a) => { const m = a[0]?.message ?? a[2]; if (/error/i.test(m)) console.log('[renderer]', m); });
  win.webContents.once('did-finish-load', () => { loaded.add(win.webContents.getURL().split('/').pop()); if (loaded.size === 3) check().catch(e => { console.error(e); app.exit(1); }); });
});

async function check() {
  await new Promise(r => setTimeout(r, 1500));
  const wins = BrowserWindow.getAllWindows();
  const hud = wins.find(w => w.webContents.getURL().endsWith('index.html'));
  const js = s => hud.webContents.executeJavaScript(s);
  const base = `http://127.0.0.1:${model.address().port}/v1`;
  const h = await js(`({ convs: document.querySelectorAll('.conv').length, firstTitle: document.querySelector('.conv .c-title')?.textContent, agent: document.getElementById('abName').textContent, theme: document.documentElement.dataset.theme })`);
  // Bind Paragon to the mock model and add the test MCP server as a connector.
  await js(`window.nexus.setSettings({ bindings: { paragon: { provider: 'ollama', model: 'mock' } }, baseUrls: { ollama: ${JSON.stringify(base)} } })`);
  const conn = await js(`window.nexus.connectors.save({ name: 'Test Notes', type: 'stdio', command: ${JSON.stringify(process.execPath)}, args: [${JSON.stringify(path.join(__dirname, 'mcp-test-server.js'))}], enabled: true }, { env: { ELECTRON_RUN_AS_NODE: '1' } })`);
  const connStatus = Object.values(conn.status)[0];
  const cloudState = await js(`window.nexus.cloud.sync()`);
  const chat = await js(`window.nexus.send('r1', 'paragon', [{ role: 'user', content: 'what is the word?' }])`);
  await js(`window.nexus.setSettings({ legacyBinding: { provider: 'ollama', model: 'mock' } })`);
  const legacy = await js(`window.nexus.send('r3', 'legacy:armerad', [{ role: 'user', content: '@Seek @CodeComplex the word?' }], false, ['Seek', 'CodeComplex'])`);
  const agentsInMenu = await js(`(document.getElementById('agentBtn').click(), [...document.querySelectorAll('#agentMenu .am-item')].length)`);
  await js(`window.nexus.setSettings({ freeKey: { enabled: false } })`);
  const flash = await js(`window.nexus.send('r2', 'flash', [{ role: 'user', content: 'hi' }])`);
  await js(`window.nexus.setSettings({ freeKey: { enabled: true }, bindings: { paragon: { provider: 'openrouter', model: '' } } })`);
  const paid = await js(`window.nexus.setSettings({ freeKey: { model: 'anthropic/claude-opus-4' } }).then(r => r.settings.freeKey.model)`);
  const fetched = await js(`window.nexus.freeModels()`);
  await js(`window.nexus.setSettings({ freeKey: { model: 'openrouter/free' } })`);
  const free = await js(`window.nexus.send('r4', 'neodela', [{ role: 'user', content: 'hi' }])`);
  const ultra = await js(`window.nexus.send('r5', 'paragon', [{ role: 'user', content: 'hi' }])`);
  const acc = await js(`window.nexus.access.state()`);
  const badges = await js(`(renderAgentMenuCheck = [...document.querySelectorAll('#agentMenu .tier-badge')].map(b => b.textContent))`);
  const actions = await js(`window.nexus.actions.list()`);
  console.log('SMOKE', JSON.stringify({ h, connStatus: connStatus.status, connTools: connStatus.tools, chat: { ok: chat.ok, text: chat.text, activity: chat.activity?.map(a => a.tool + ':' + a.status) }, flashErr: flash.error, actions: actions.length, cloudSynced: Object.keys(cloudState.synced), legacy: { text: legacy.text, features: legacy.features, rejected: legacy.rejected }, agentsInMenu, free: { ok: free.ok, text: free.text, model: free.model, usage: free.usage }, ultra: ultra.error, acc: { neodela: acc.neodela, paragon: acc.paragon.mode, flash: acc.flash.limit }, badges }));
  fs.writeFileSync(process.env.SHOT || 'smoke.png', (await hud.webContents.capturePage()).toPNG());
  const upd = await js(`window.nexus.update.check()`);
  await js(`window.nexus.setSettings({ wakeWord: true })`);
  await new Promise(r => setTimeout(r, 1500));
  const quickWin = wins.find(w => w.webContents.getURL().endsWith('quick.html'));
  const wakeShown = quickWin.isVisible();
  await js(`window.nexus.setSettings({ wakeWord: false })`);
  console.log('SMOKE2', JSON.stringify({ paid, fetched: fetched.models?.map(m => m.id), wakeShown, update: { newer: upd.newer, latest: upd.latest } }));
  const pass = h.convs === 1 && h.firstTitle === 'old saved chat' && h.theme === 'green' && connStatus.status === 'connected' &&
    chat.ok && /The word is HELIX/.test(chat.text) && /web_search,fetch_url,weather,test_notes__list_notes/.test(chat.text) && /cloudPrompt=true/.test(chat.text) && /legacyPrompt=true seek=true/.test(legacy.text) && /fetch_url/.test(legacy.text) && !/weather/.test(legacy.text) && legacy.features.join() === 'Seek' && legacy.rejected[0]?.id === 'CodeComplex' && agentsInMenu === 5 && actions.length === 2 && /No API key/.test(flash.error) &&
    free.ok && /FREE OK openrouter\/free/.test(free.text) && free.usage.used === 1 && free.usage.limit === 28 && ultra.blocked && /Ultra/.test(ultra.error) && acc.neodela.used === 1 && acc.paragon.mode === 'blocked' && acc.flash.limit === null && badges.length === 5 && wakeShown && upd.newer && upd.latest === '1.0.1' && paid === 'openrouter/free' && fetched.ok && fetched.models.map(m => m.id).join() === 'openrouter/free,m/x:free';
  if (!pass) console.log("SMOKE FAIL", JSON.stringify({ actions: actions.length, flash: flash.error, free, ultra, badges }));
  app.exit(pass ? 0 : 1);
}
model.on('listening', () => require('../main.js'));
