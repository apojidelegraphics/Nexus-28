// v3.5 tests: Nexus '28 for Windows (the Windows helper, speech, PC actions, triggers, packaging, wording) and a
// custom accent color in Test Run.
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

(async () => {
  // ---------- the Windows helper speaks NexusCore's protocol
  const { createWinHelper, SCRIPTS } = require('../src/winhelper');
  const events = [], runs = [], sessions = [];
  const run = async (script, args) => { runs.push({ script, args });
    if (script === SCRIPTS.FRONT) return { windowId: 132456, pid: 42, width: 800, height: 600, title: 'Essay.docx - Word', app: 'Microsoft Word' };
    if (script === SCRIPTS.OCR) return { text: 'hello from OCR' };
    if (script === SCRIPTS.CAL.cal_list) return { list: [{ title: 'Math test', start: 1, end: 2 }] };
    if (script === SCRIPTS.SELECTED) return { text: 'selected words', app: 'chrome', method: 'copy' };
    return {}; };
  const session = (mode, args, onEvent) => { const s = { mode, args, onEvent, sent: [], proc: new (require('events'))(), send: x => s.sent.push(x), kill() {} }; sessions.push(s); return s; };
  const h = createWinHelper({ run, session, emit: e => events.push(e), outlook: () => true });
  h({ cmd: 'info', id: 'i' });
  const info = events.at(-1);
  assert.ok(info.event === 'info' && info.stt && info.wake && info.screen && info.ax && info.eventkit && info.platform === 'win32');
  h({ cmd: 'front_window', id: 'f', exclude: [7] }); await new Promise(r => setTimeout(r, 5));
  assert.ok(events.at(-1).data.windowId === 132456 && runs.at(-1).args.exclude[0] === 7, 'front window → a window id desktopCapturer understands (window:<hwnd>:0)');
  h({ cmd: 'ocr', id: 'o', path: 'C:\\x.png' }); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(events.at(-1).data.text, 'hello from OCR');
  h({ cmd: 'cal_list', id: 'c', start: 1, end: 2 }); await new Promise(r => setTimeout(r, 5));
  assert.ok(Array.isArray(events.at(-1).data) && events.at(-1).data[0].title === 'Math test', 'Outlook calendar comes back as a list, like EventKit');
  h({ cmd: 'selected_text', id: 's' }); await new Promise(r => setTimeout(r, 5));
  assert.strictEqual(events.at(-1).data.text, 'selected words');
  h({ cmd: 'wake_start' }); const wake = sessions.at(-1); assert.strictEqual(wake.mode, 'wake');
  wake.onEvent({ event: 'started' }); wake.onEvent({ event: 'wake', text: 'hey nexus' });
  assert.ok(events.some(e => e.event === 'wake_listening') && events.at(-1).event === 'wake');
  h({ cmd: 'listen', id: 'L1' }); const lis = sessions.at(-1);
  assert.ok(lis.mode === 'listen' && wake.sent.includes('cancel'), 'listening pauses "Hey Nexus" (one microphone user at a time)');
  lis.onEvent({ event: 'started' }); lis.onEvent({ event: 'partial', text: 'what is' }); h({ cmd: 'stop', id: 'L1' }); lis.onEvent({ event: 'final', text: 'what is two plus two', peak: .4 });
  assert.ok(events.find(e => e.event === 'listening' && e.id === 'L1') && events.find(e => e.event === 'partial' && e.id === 'L1') && lis.sent.includes('stop') && events.at(-1).event === 'final' && events.at(-1).id === 'L1');
  h({ cmd: 'sel_watch_start', pid: 99 }); assert.ok(sessions.at(-1).mode === 'selwatch' && sessions.at(-1).args.pid === 99);
  h({ cmd: 'fm', id: 'm' }); assert.strictEqual(events.at(-1).event, 'error');
  assert.ok(SCRIPTS.LISTEN.includes('System.Speech') && SCRIPTS.OCR.includes('Windows.Media.Ocr') && SCRIPTS.PDF.includes('Windows.Data.Pdf') && SCRIPTS.CAL.cal_create.includes('Outlook.Application'));
  ok('Windows helper: voice + "Hey Nexus" (System.Speech), OCR, PDFs, the front window, highlighted text, Outlook calendar/tasks');

  // ---------- the helper starts on Windows; Windows voices read aloud
  const main = read('main.js');
  assert.ok(main.includes("new voice.Helper('', { script: winHelperScript })") && read('src/voice.js').includes("ELECTRON_RUN_AS_NODE: '1'") && JSON.parse(read('package.json')).build.asarUnpack.includes('src/winhelper.js'));
  const v = read('src/voice.js');
  assert.ok(v.includes('System.Speech.Synthesis.SpeechSynthesizer') && v.includes("mime: 'audio/wav'") && v.includes('GetInstalledVoices()'));
  ok('Nexus starts the Windows helper (Electron as Node) and speaks with Windows voices (also rendered for N28C)');

  // ---------- PC actions + file search
  const mac = require('../src/macactions');
  const calls = [];
  const m = mac.createMac({ platform: 'win32', run: async (c, a) => { calls.push([c, a]); return c === 'reg' ? 'AppsUseLightTheme    REG_DWORD    0x1' : ''; }, openPath: async () => '', openExternal: async () => {} });
  assert.strictEqual(await m.actions.dark_mode({}), 'Switched to dark mode.');
  assert.ok(calls.filter(c => c[0] === 'reg' && c[1][0] === 'add').length === 2);
  await assert.rejects(m.actions.list_shortcuts(), /macOS/);
  const sql = mac.windowsSearch({ query: 'lab report', kind: 'pdf', root: 'C:\\Users\\Ann' });
  assert.ok(sql.includes("SCOPE='file:C:/Users/Ann'") && sql.includes("System.FileExtension = '.pdf'") && sql.includes("LIKE '%lab%'"));
  const T = require('../src/tools');
  const names = T.buildToolset({ agentic: true, settings: { macActions: {}, files: {} }, platform: 'win32' }).tools.map(t => t.name);
  assert.ok(['open_app', 'set_volume', 'dark_mode', 'media_control', 'find_files'].every(x => names.includes(x)) && !names.includes('run_shortcut'));
  ok('Paragon on Windows: open apps (Start menu + Store), volume, dark mode, media keys, timers, Windows Search; no Shortcuts');

  // ---------- triggers on Windows
  const tr = require('../src/triggers');
  const w = await tr.readWifi(async () => '    State                  : connected\r\n    SSID                   : School-WiFi\r\n', 'win32');
  assert.ok(w.connected && w.ssid === 'School-WiFi');
  const apps = await tr.readApps(async () => 'Spotify\r\nSpotify\r\nVisual Studio Code\r\nCode\r\n', 'win32');
  assert.ok(apps.has('Spotify') && apps.has('Visual Studio Code'));
  ok('routine triggers on Windows: Wi-Fi (netsh), headphones, apps opening, unlock');

  // ---------- the rest of the app on Windows
  assert.ok(main.includes('PERMS_WIN') && main.includes("'ms-settings:privacy-microphone'") && main.includes("resize({ width: 16, height: 16") && main.includes("args: ['--hidden']") && main.includes("windowsHide: true"));
  assert.ok(main.includes('if (process.platform === "win32") return true;') && main.includes("hud.once('ready-to-show', () => showHud())"));
  const pre = read('preload.js');
  assert.ok(pre.includes("exposeInMainWorld('nexusPlatform'") && pre.includes("[/\\bthis Mac\\b/g, 'this PC']") && pre.includes("[/⌘/g, 'Ctrl+']") && pre.includes("'textarea, input, pre, code, [contenteditable], .msg"));
  const set = read('renderer/settings.js');
  assert.ok(set.includes("orbS.status === 'windows'") && set.includes("window.nexusPlatform?.win ? '' : `<div class=\"card-head\" style=\"margin-top:6px\"><b>💻 Lid-closed mode</b>") && set.includes("if (isApple && window.nexusPlatform?.win) return ''"));
  assert.ok(read('renderer/hud.js').includes("e.ctrlKey && !e.altKey : e.metaKey") && read('renderer/hud.css').includes('html.win {') && read('src/personas.js').includes("[DEVICE] Nexus is running on the user's Windows PC"));
  ok('Windows look and feel: tray icon, Start-menu launch, Ctrl shortcuts, PC wording, Windows permissions, no Mac-only cards');

  // ---------- packaging + updates
  const pkg = JSON.parse(read('package.json')), rel = read('.github/workflows/release.yml');
  assert.ok(pkg.build.win.target[0].target === 'nsis' && pkg.build.win.artifactName.includes('Setup') && pkg.scripts.postinstall === 'node scripts/postinstall.js' && pkg.build.mac.extraResources);
  assert.ok(rel.includes('runs-on: windows-latest') && rel.includes('dist/*.exe') && read('scripts/release-notes.js').includes('## Install on Windows'));
  assert.ok(read('src/updater.js').includes("pick(/setup.*\\.exe$/i)"));
  ok('Windows installer in every release; the update checker offers it on Windows');

  // ---------- Test Run: any accent color
  const tj = read('docs/try/try.js');
  assert.ok(tj.includes('function setAccent(hex)') && tj.includes('id="sAccent"') && tj.includes('type="color"'));
  ok('Test Run: pick any accent color');

  const ch = JSON.parse(read('docs/whats-new/changes.json'));
  assert.ok(ch[0].version === pkg.version && !/axiom|apex|cage/i.test(JSON.stringify(ch[0])));
  ok('release notes (no Axiom)');
  console.log(`v3.5: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
