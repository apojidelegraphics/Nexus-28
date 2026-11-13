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
process.env.NEXUS_TEST_EXPORT_DIR = path.join(dir, 'exports'); fs.mkdirSync(process.env.NEXUS_TEST_EXPORT_DIR, { recursive: true });
fs.writeFileSync(path.join(dir, 'notes.txt'), 'NOTE FILE: the launch code is 4471');
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
    if (req.headers.authorization === 'Bearer sk-free-test') {
      const lastU = [...body.messages].reverse().find(m => m.role === 'user');
      const parts = Array.isArray(lastU?.content) ? lastU.content : [{ type: 'text', text: lastU?.content || '' }];
      const txt = parts.filter(p => p.type === 'text').map(p => p.text).join(' ');
      const extra = (/Nexus test/.test(txt) || parts.length > 1 ? ` images=${parts.filter(p => p.type === 'image_url').length} ocr=${/OCR: The derivative/.test(txt)} note=${/launch code is 4471/.test(txt)}` : '') +
        ` tools=${(body.tools || []).map(t => t.function.name).join(',')} nick=${/preferred name is Lucas/.test(body.messages[0].content)} linked=${/Linked chat "/.test(txt)} brief=${/FACTS GATHERED BY NEXUS/.test(txt)}`;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'FREE OK ' + body.model + extra } }] })}\n\ndata: [DONE]\n\n`);
    }
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
  // ---- v1.1
  const qcWin = wins.find(w => w.webContents.getURL().endsWith('quickchat.html'));
  const qjs = s => qcWin.webContents.executeJavaScript(s);
  const hudActive = await js(`window.nexus.conv.state().then(s => s.active.id)`);
  const qcConv = await qjs(`window.nexus.conv.append({ role: 'user', content: 'quick chat only' }, 'new')`);
  const hudActiveAfter = await js(`window.nexus.conv.state().then(s => s.active.id)`);
  const separateChats = qcConv.id !== hudActive && hudActiveAfter === hudActive;
  const shot = await js(`window.nexus.screen.capture({ mode: 'window' })`);
  const calc = await js(`window.nexus.quickCalc('calc 15% of 80')`);
  const conv = await js(`window.nexus.conv.append({ role: 'user', content: 'Nexus test: what is on screen?', attachments: [{ id: ${JSON.stringify(shot.attachment?.id || '')} }] }, 'new')`);
  const vis = await js(`window.nexus.send('r6', 'neodela', window.NexusChat.toApiMessages((${JSON.stringify(conv)}).messages, 'neodela', []), false, [], ${JSON.stringify(conv.id)})`);
  await js(`window.nexus.conv.append({ role: 'assistant', persona: 'neodela', content: 'v1' }, ${JSON.stringify(conv.id)})`);
  const v2 = await js(`window.nexus.conv.addVersion(${JSON.stringify(conv.id)}, { role: 'assistant', persona: 'flash', content: 'v2' })`);
  const exports = {};
  for (const f of ['md', 'txt', 'json', 'docx', 'pdf']) exports[f] = (await js(`window.nexus.exportChat(${JSON.stringify(conv.id)}, '${f}')`)).ok;
  const pdfHead = fs.readFileSync(path.join(process.env.NEXUS_TEST_EXPORT_DIR, fs.readdirSync(process.env.NEXUS_TEST_EXPORT_DIR).find(f => f.endsWith('.pdf')))).slice(0, 5).toString();
  const wakeChip = await js(`window.nexus.wake.set(true).then(() => new Promise(r => setTimeout(r, 300))).then(() => document.getElementById('wakeChip').className)`);
  await js(`window.nexus.wake.set(false)`);
  console.log('SMOKE3', JSON.stringify({ separateChats, shot: shot.ok ? { kind: shot.attachment.kind, chars: shot.attachment.chars } : shot.error, calc: calc.text, vis: vis.text, versions: v2.messages.at(-1).versions.length, exports, pdfHead, wakeChip }));
  const v11 = separateChats && shot.ok && shot.attachment.kind === 'screen' && shot.attachment.chars > 10 && calc.text === '15% of 80 = **12**' &&
    /images=1 ocr=true/.test(vis.text) && v2.messages.at(-1).versions.length === 2 && Object.values(exports).every(Boolean) && pdfHead === '%PDF-' && /\bon\b/.test(wakeChip);
  // ---- v1.2
  const sp = await js(`window.nexus.spaces.add({ name: 'School', agent: 'lyte' })`);
  await js(`window.nexus.conv.move(${JSON.stringify(conv.id)}, ${JSON.stringify(sp.id)})`);
  const inSpace = (await js(`window.nexus.conv.state()`)).summary.list.find(x => x.id === conv.id).spaceId === sp.id;
  await js(`window.nexus.profile.setNickname('Lucas')`);
  const recall = await js(`window.nexus.send('r7', 'neodela', [{ role: 'user', content: 'like we talked about earlier, what was the budget?', attachments: [{ id: 'chat:${conv.id}' }] }], false, [], null)`);
  const parsed = await js(`window.nexus.routines.parse('every weekday at 8, tell me a fun fact')`);
  const saved = await js(`window.nexus.routines.save({ prompt: ${JSON.stringify(parsed.prompt)}, schedule: ${JSON.stringify(parsed.schedule)}, agent: 'flash', name: ${JSON.stringify(parsed.name)} })`);
  const ranR = await js(`window.nexus.routines.runNow(${JSON.stringify(saved.routine.id)})`);
  const rConv = await js(`window.nexus.conv.get(${JSON.stringify(ranR.convId)})`);
  const br = await js(`window.nexus.brief.run()`);
  const mis = await js(`window.nexus.missions.start('Research the best laptops under 800 dollars', 5)`);
  const ms = await js(`window.nexus.metrics.summary()`);
  const spaces = (await js(`window.nexus.conv.state()`)).summary.spaces.map(x => x.name);
  console.log('SMOKE4', JSON.stringify({ inSpace, recall: recall.text, routine: { when: parsed.when, ok: ranR.ok, reply: rConv.messages.at(-1).content.slice(0, 60), space: rConv.spaceId === spaces && null }, brief: br.text?.slice(0, 80), mission: mis.error, chats: ms.chats, achievements: ms.achievements.filter(a => a.unlocked).map(a => a.id), spaces }));
  const v12 = inSpace && /tools=search_chats,read_chat/.test(recall.text) && /nick=true linked=true/.test(recall.text) && parsed.when === 'Weekdays at 8 AM' &&
    ranR.ok && /FREE OK/.test(rConv.messages.at(-1).content) && /brief=true/.test(br.text || '') && /own API key|local model/.test(mis.error || '') &&
    ms.chats >= 3 && ms.achievements.some(a => a.id === 'first_chat' && a.unlocked) && spaces.includes('Routines') && spaces.includes('School');
  console.log('SMOKE2', JSON.stringify({ paid, fetched: fetched.models?.map(m => m.id), wakeShown, update: { newer: upd.newer, latest: upd.latest } }));
  const pass = h.convs === 1 && h.firstTitle === 'old saved chat' && h.theme === 'green' && connStatus.status === 'connected' &&
    chat.ok && /The word is HELIX/.test(chat.text) && /web_search,fetch_url,weather,look_at_screen,test_notes__list_notes/.test(chat.text) && /cloudPrompt=true/.test(chat.text) && /legacyPrompt=true seek=true/.test(legacy.text) && /fetch_url/.test(legacy.text) && !/weather/.test(legacy.text) && legacy.features.join() === 'Seek' && legacy.rejected[0]?.id === 'CodeComplex' && agentsInMenu === 5 && actions.length === 2 && /No API key/.test(flash.error) &&
    free.ok && /FREE OK openrouter\/free/.test(free.text) && free.usage.used === 1 && free.usage.limit === 28 && ultra.blocked && /Ultra/.test(ultra.error) && acc.neodela.used === 1 && acc.paragon.mode === 'blocked' && acc.flash.limit === null && badges.length === 5 && wakeShown && upd.newer && upd.latest === '1.0.1' && paid === 'openrouter/free' && fetched.ok && fetched.models.map(m => m.id).join() === 'openrouter/free,m/x:free' && v11 && v12;
  if (!pass) console.log("SMOKE FAIL", JSON.stringify({ actions: actions.length, flash: flash.error, free, ultra, badges }));
  app.exit(pass ? 0 : 1);
}
model.on('listening', () => require('../main.js'));
