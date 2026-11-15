// Highlight-orb smoke test: npm run smoke:orb (fake helper sends highlights; the orb must show, hide and show again)
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
      const flash = '```nexus-flashcards\n{"title":"Cell basics","cards":[{"front":"ATP","back":"energy"},{"front":"DNA","back":"genes"},{"front":"Ribosome","back":"makes proteins"},{"front":"Nucleus","back":"holds DNA"}]}\n```';
      const content = /FLASHCARD MAKER/.test(sys0) ? flash : /HANDOFFME/.test(txt) && /\[HANDOFF\]/.test(sys0) ? '[[HANDOFF:neodela: needs depth]]' : 'FREE OK ' + body.model + extra + v15 + ` wrap=${/Evening Wrap-up for/.test(txt)} hints=${/nexus-hints/.test(sys0)}`;
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

  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (const w of BrowserWindow.getAllWindows()) w.hide();
  const orbW = () => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('cliporb.html'));
  const seen = [];
  for (let t = 0; t < 70; t++) { await wait(100); const o = orbW(); if (t === 28 && o) o.hide(); seen.push(o ? (o.isVisible() ? 'V' : 'h') : '-'); }
  const seq = seen.join(''); console.log('ORBSEQ', seq);
  // shown, hidden, then shown again for the next highlight (2.7.1 regression: it never came back after the first hide)
  const ok = /V+h+V+/.test(seq); console.log(ok ? 'ORB SMOKE OK' : 'ORB SMOKE FAIL'); app.exit(ok ? 0 : 1);
}
model.on('listening', () => require('../main.js'));
