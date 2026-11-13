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
process.env.FAKE_LISTEN = 'hey flash what time is it|bye';
process.env.NEXUS_SAY_BIN = path.join(__dirname, 'fake-say.sh');
process.env.FAKE_SAY_LOG = path.join(dir, 'say.log');
process.env.FAKE_SAY_SECS = '1';
process.env.NEXUS_TEST_WATCH = '1'; process.env.FAKE_WINDOW_ID = '42';
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
      const sys0 = body.messages[0].role === 'system' ? String(body.messages[0].content) : '';
      const v15 = ` quiz=${/nexus-quiz/.test(sys0)} aura=${/AURASYNC/.test(sys0)} reasoning=${/REASONING NOTES/.test(sys0)} haiku=${/Answer as a haiku/.test(sys0)} huddle=${/\[HUDDLE\]/.test(sys0)} debate=${/\[DEBATE/.test(sys0)}`;
      const content = /HANDOFFME/.test(txt) && /\[HANDOFF\]/.test(sys0) ? '[[HANDOFF:neodela: needs depth]]' : 'FREE OK ' + body.model + extra + v15;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' }); return res.end(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`);
    }
    const sse = ev => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(ev.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'); };
    const toolMsg = body.messages.find(m => m.role === 'tool');
    if (!toolMsg) return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'fetch_url', arguments: JSON.stringify({ url: `http://127.0.0.1:${model.address().port}/page` }) } }] } }] }]);
    const word = /HELIX/.test(toolMsg.content) ? 'HELIX' : 'unknown';
    sse([{ choices: [{ delta: { content: `The word is ${word}. Tools offered: ${(body.tools || []).map(t => t.function.name).join(',')}. cloudPrompt=${body.messages[0].content.startsWith('CLOUD PARAGON PROMPT')} legacyPrompt=${body.messages[0].content.startsWith('LEGACY ARMERAD PROMPT')} seek=${/ACTIVE FEATURES[\s\S]*Seek:/.test(body.messages[0].content)}` } }] }]);
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
  // ---- v1.3
  const qa = wins.find(w => w.webContents.getURL().endsWith('quick.html'));
  for (let i = 0; i < 40 && !(await qa.webContents.executeJavaScript('document.body.dataset.lastEnd || ""')); i++) await new Promise(r => setTimeout(r, 250));
  const convo = await qa.webContents.executeJavaScript(`({ label: document.body.dataset.lastEnd || document.getElementById('stateLabel').textContent, hint: document.getElementById('hint').textContent, reply: document.getElementById('reply').textContent.slice(0, 200) })`);
  const qaChats = (await js(`window.nexus.conv.state()`)).summary.list.filter(c => c.title === 'hey flash what time is it');
  const qaConv = qaChats[0] && await js(`window.nexus.conv.get(${JSON.stringify(qaChats[0]?.id || '')})`);
  await js(`window.nexus.setSettings({ voice: { agentVoices: { flash: { system: 'Eddy' } } } })`);
  await js(`window.nexus.voice.speak('Hi from Flash', 'read', 'flash')`);
  const sayFlash = fs.readFileSync(process.env.FAKE_SAY_LOG, 'utf8');
  await js(`window.nexus.voice.speak('Hi from Paragon', 'read', 'paragon')`);
  const sayParagon = fs.readFileSync(process.env.FAKE_SAY_LOG, 'utf8');
  // read-along: click read-aloud on the last reply in the chat window
  await js(`window.nexus.conv.append({ role: 'assistant', persona: 'flash', content: 'Here is a longer reply so the read along highlight has plenty of words to walk through.' }, ${JSON.stringify(conv.id)})`);
  await js(`window.nexus.conv.select(${JSON.stringify(conv.id)})`);
  await new Promise(r => setTimeout(r, 400));
  const ra = await js(`(async () => { const btns = [...document.querySelectorAll('.msg.ai .mt-btn[title="Read aloud"]')]; btns.at(-1).click(); await new Promise(r => setTimeout(r, 600)); const now = document.querySelector('.ra-w.ra-now'); return { words: document.querySelectorAll('.ra-w').length, now: !!now }; })()`);
  // ⌘K palette
  const pal = await js(`(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })); await new Promise(r => setTimeout(r, 100));
    const open = !document.getElementById('palette').hidden; const inp = document.getElementById('palInput'); inp.value = 'export pdf'; inp.dispatchEvent(new Event('input'));
    const first = document.querySelector('.pal-item')?.textContent.trim(); inp.value = 'theme amb'; inp.dispatchEvent(new Event('input'));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await new Promise(r => setTimeout(r, 300));
    return { open, first, theme: document.documentElement.dataset.theme, closed: document.getElementById('palette').hidden }; })()`);
  await js(`window.nexus.setSettings({ theme: 'green' })`);
  console.log('SMOKE5', JSON.stringify({ convo, qaMsgs: qaConv?.messages.map(m => m.role), sayFlash: sayFlash.split('\n').slice(0, 2), sayParagon: sayParagon.split('\n').slice(0, 2), ra, pal }));
  const v13 = /:GOODBYE$/.test(convo.label) && /CONVERSATION/.test(convo.hint) && qaConv?.messages.map(m => m.role).join() === 'user,assistant' &&
    /^-v\nEddy\n/.test(sayFlash) && !/^-v/.test(sayParagon) && ra.words > 3 && ra.now && pal.open && /Export this chat as PDF/.test(pal.first || '') && pal.theme === 'amber' && pal.closed;
  // ---- v1.4: Explain this, clipboard history, Watch mode, palette, Mac settings tab
  const sel = await js(`window.nexus.mac.selection()`);
  const qcw = wins.find(w => w.webContents.getURL().endsWith('quickchat.html'));
  qcw.webContents.send('quickchat:attach', { attachment: sel.attachment, explain: { app: sel.app, preview: sel.preview, chars: sel.preview.length } });
  await new Promise(r => setTimeout(r, 300));
  const xb = await qcw.webContents.executeJavaScript(`({ shown: !document.getElementById('explainBar').hidden, chips: document.querySelectorAll('#xbChips .chip').length, app: document.getElementById('xbApp').textContent, staged: document.querySelectorAll('#attTray .att-chip, #attTray [data-id]').length })`);
  const { clipboard } = require('electron');
  await new Promise(r => setTimeout(r, 900)); await clipboard.writeText('smoke copy 123'); await new Promise(r => setTimeout(r, 1600));
  const clips = await js(`window.nexus.clip.list()`);
  const w1 = await js(`window.nexus.watch.start({ windowId: '42', title: 'Calculus homework', condition: 'tell me when it says "derivative"', interval: 5, minutes: 5 })`);
  const w2 = await js(`window.nexus.watch.front('tell me when my grade is posted')`);
  await new Promise(r => setTimeout(r, 2500));
  const wl = await js(`window.nexus.watch.state()`);
  const hitW = wl.find(w => w.id === w1.watch?.id), aiW = wl.find(w => w.id === w2.watch?.id);
  await js(`window.nexus.watch.stop(${JSON.stringify(w2.watch?.id || '')})`);
  const wcards = await js(`document.querySelectorAll('#watchCards .watch-card').length`);
  const pal4 = await js(`(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true })); await new Promise(r => setTimeout(r, 150));
    const inp = document.getElementById('palInput'); inp.value = 'watch a'; inp.dispatchEvent(new Event('input')); const first = document.querySelector('.pal-item')?.textContent.trim();
    inp.value = 'smoke copy'; inp.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 60)); const clip = [...document.querySelectorAll('.pal-item')].some(n => /smoke copy 123/.test(n.textContent));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return { first, clip }; })()`);
  const macTab = await js(`(async () => { document.querySelector('#tabs [data-tab="mac"]') || null; document.getElementById('btnSettings').click(); await new Promise(r => setTimeout(r, 100));
    document.querySelector('#tabs [data-tab="mac"]').click(); await new Promise(r => setTimeout(r, 300)); const t = document.getElementById('tab-mac').textContent;
    const r = { explain: /Explain this/.test(t), clip: /Clipboard history/.test(t), actions: /App actions/.test(t), watch: /Watch mode/.test(t), cards: document.querySelectorAll('#tab-mac .card').length };
    document.getElementById('btnCloseSettings').click(); return r; })()`);
  const intent = await js(`window.NexusChat.watchIntent('hey nexus, watch this window and tell me when the upload finishes.')`);
  console.log('SMOKE6', JSON.stringify({ sel: { ok: sel.ok, app: sel.app, preview: sel.preview }, xb, clips: clips.map(c => c.text).slice(0, 3), hit: hitW && { status: hitW.status, why: hitW.why, ai: hitW.aiChecks }, ai: aiW && { status: aiW.status, ai: aiW.aiChecks, checks: aiW.checks }, wcards, pal4, macTab, intent }));
  const v14 = sel.ok && sel.app === 'Safari' && /Mitochondria/.test(sel.preview) && xb.shown && xb.chips === 7 && /Safari/.test(xb.app) &&
    clips[0]?.text === 'smoke copy 123' && hitW?.status === 'hit' && hitW.aiChecks === 0 && /derivative/.test(hitW.why) &&
    aiW?.aiChecks === 1 && aiW.checks >= 1 && wcards >= 1 && /Watch a window/.test(pal4.first || '') && pal4.clip &&
    macTab.explain && macTab.clip && macTab.actions && macTab.watch && macTab.cards === 5 && intent === 'tell me when the upload finishes';
  // ---- v1.5: features that do things, handoff, huddle, debate, custom @features, widgets, code runner, themes
  const send15 = (persona, text, feats) => js(`window.nexus.send('r' + Math.random(), ${JSON.stringify(persona)}, [{ role: 'user', content: ${JSON.stringify(text)} }], false, ${JSON.stringify(feats)}, null)`);
  const fl = await send15('neodela', 'ugh explain photosynthesis, test tomorrow!!', ['Cognition', 'StudyMode', 'AuraSync']);
  const sw = await send15('flash', 'quick one', ['SwiftStream']);
  const ho = await send15('flash', 'HANDOFFME prove the Riemann hypothesis', []);
  await js(`window.nexus.setSettings({ customFeatures: [{ id: 'Haiku', desc: 'Poems', instruction: 'Answer as a haiku.', agents: ['flash'] }] })`);
  await new Promise(r => setTimeout(r, 200));
  const hk = await send15('flash', 'the sea', ['Haiku']);
  const hconv = await js(`window.nexus.conv.append({ role: 'user', content: 'Best snack?' }, 'new')`);
  const hud15 = await js(`window.nexus.group.huddle({ convId: ${JSON.stringify(hconv.id)}, agents: ['neodela', 'lyte', 'flash'], synth: 'neodela' })`);
  const hm = await js(`window.nexus.conv.get(${JSON.stringify(hconv.id)})`);
  const db = await js(`window.nexus.group.debate({ topic: 'Cats beat dogs', pro: 'lyte', con: 'flash', judge: 'neodela', rounds: 1 })`);
  const dbm = await js(`window.nexus.conv.get(${JSON.stringify(db.convId || '')})`);
  // widget render + saved state
  const wconv = await js(`window.nexus.conv.append({ role: 'user', content: 'quiz me' }, 'new')`);
  const quizMsg = { role: 'assistant', persona: 'lyte', content: 'Here you go\n\n```nexus-quiz\n{"title":"Cells","questions":[{"q":"Powerhouse?","choices":["Nucleus","Mitochondria"],"answer":1,"why":"ATP"}]}\n```\n\n```js\nconsole.log(6*7)\n```', featureData: { reasoning: 'step 1' } };
  await js(`window.nexus.conv.append(${JSON.stringify(quizMsg)}, ${JSON.stringify(wconv.id)})`);
  await js(`window.nexus.conv.select(${JSON.stringify(wconv.id)})`);
  await new Promise(r => setTimeout(r, 400));
  const wd = await js(`(async () => { const q = document.querySelector('.w-quiz'); const b = q && q.querySelector('[data-c="1"]'); b && b.click(); await new Promise(r => setTimeout(r, 200));
    return { quiz: !!q, score: q && q.querySelector('.w-score').textContent, run: !!document.querySelector('.code-bar [data-a="run"]'), reasoning: !!document.querySelector('details.fp') }; })()`);
  const wsaved = (await js(`window.nexus.conv.get(${JSON.stringify(wconv.id)})`)).messages.at(-1).widget;
  const run1 = await js(`window.nexus.code.run('console.log(6*7); return "ok"')`);
  const run2 = await js(`window.nexus.code.run('fetch("https://example.com").then(()=>console.log("net!")).catch(e=>console.log("blocked")); await new Promise(r=>setTimeout(r,300));')`);
  const run3 = await js(`window.nexus.code.run('while(true){}')`);
  const run4 = await js(`window.nexus.code.run('return typeof require + "/" + typeof process')`);
  await js(`window.nexus.setSettings({ customThemes: [{ id: 'custom-t1', name: 'Hot', accent: '#ff0080', bg: '#100010', text: '#ffffff' }], theme: 'custom-t1' })`);
  await new Promise(r => setTimeout(r, 200));
  const th = await js(`({ t: document.documentElement.dataset.theme, a: document.documentElement.style.getPropertyValue('--accent') })`);
  await js(`window.nexus.setSettings({ theme: 'green' })`);
  const ftab = await js(`(async () => { document.getElementById('btnSettings').click(); await new Promise(r => setTimeout(r, 100)); document.querySelector('#tabs [data-tab="features"]').click(); await new Promise(r => setTimeout(r, 300));
    const r = { builtin: document.querySelectorAll('#tab-features .bf-item').length, mine: document.querySelectorAll('#tab-features .cf-item').length }; document.getElementById('btnCloseSettings').click(); return r; })()`);
  console.log('SMOKE7b', JSON.stringify({ hk: hk.text, h1: hm.messages[1].content }));
  console.log('SMOKE7', JSON.stringify({ fl: { ok: fl.ok, fd: fl.featureData && Object.keys(fl.featureData), text: fl.text?.slice(-90) }, sw: sw.featureData?.latency && 'ok', ho: { persona: ho.persona, handoff: ho.handoff, text: ho.text?.slice(0, 40) }, hk: hk.features, hudMsgs: hm.messages.map(m => (m.persona || 'you') + ':' + (m.huddle?.role || '')), hud15,
    debate: dbm?.messages.map(m => (m.persona || 'you') + ':' + (m.debate?.side || '')), wd, wsaved, run1, run2, run3: run3.error, run4, th, ftab }));
  const v15 = fl.ok && /quiz=true aura=true reasoning=true/.test(fl.text) && fl.featureData?.reasoning && fl.featureData?.aura && sw.featureData?.latency &&
    ho.persona === 'neodela' && ho.handoff?.from === 'flash' && /FREE OK/.test(ho.text) && hk.features?.includes('Haiku') && /haiku=true/.test(hk.text) &&
    hm.messages.filter(m => m.huddle?.role === 'take').length === 3 && hm.messages.some(m => m.huddle?.role === 'summary') && /huddle=true/.test(hm.messages[1].content) &&
    dbm?.messages.map(m => m.debate?.side || m.debate?.role).join() === 'topic,pro,con,judge' && wd.quiz && /1\/1/.test(wd.score) && wd.run && wd.reasoning && wsaved?.quiz?.['0'] === 1 &&
    run1.ok && run1.out === '42\n→ ok' && /blocked/.test(run2.out || '') && /3 seconds/.test(run3.error || '') && run4.out === '→ undefined/undefined' &&
    th.t === 'custom' && th.a === '#ff0080' && ftab.builtin === 27 && ftab.mine === 1;
  console.log('SMOKE2', JSON.stringify({ paid, fetched: fetched.models?.map(m => m.id), wakeShown, update: { newer: upd.newer, latest: upd.latest } }));
  const pass = h.convs === 1 && h.firstTitle === 'old saved chat' && h.theme === 'green' && connStatus.status === 'connected' &&
    chat.ok && /The word is HELIX/.test(chat.text) && /web_search,fetch_url,weather,look_at_screen,clipboard_history,test_notes__list_notes/.test(chat.text) && /cloudPrompt=true/.test(chat.text) && /legacyPrompt=true seek=true/.test(legacy.text) && /fetch_url/.test(legacy.text) && !/weather/.test(legacy.text) && legacy.features.join() === 'Seek' && legacy.rejected[0]?.id === 'CodeComplex' && agentsInMenu === 5 && actions.length === 2 && /No API key/.test(flash.error) &&
    free.ok && /FREE OK openrouter\/free/.test(free.text) && free.usage.used === 1 && free.usage.limit === 28 && ultra.blocked && /Ultra/.test(ultra.error) && acc.neodela.used === 1 && acc.paragon.mode === 'blocked' && acc.flash.limit === null && badges.length === 5 && wakeShown && upd.newer && upd.latest === '1.0.1' && paid === 'openrouter/free' && fetched.ok && fetched.models.map(m => m.id).join() === 'openrouter/free,m/x:free' && v11 && v12 && v13 && v14 && v15;
  if (!pass) console.log("SMOKE FLAGS", JSON.stringify({ v11, v12, v13, v14, v15 }));
  if (!pass) console.log("SMOKE FAIL", JSON.stringify({ actions: actions.length, flash: flash.error, free, ultra, badges }));
  app.exit(pass ? 0 : 1);
}
model.on('listening', () => require('../main.js'));
