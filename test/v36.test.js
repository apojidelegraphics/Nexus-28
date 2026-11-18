// v3.6 tests: the guided tour, the highlight orb + automatic updates on Windows, Windows fixes (tray, notifications,
// dictation), Move to another computer, and Test Run's search retry.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

// ---------- guided tour
const hud = read('renderer/hud.js');
const steps = (hud.slice(hud.indexOf('const GUIDE = ['), hud.indexOf('  let gI = 0;')).match(/\{ (el: '[^']+', )?(menu: true, )?(last: true, )?t: '/g) || []).length;
assert.ok(steps >= 18 && hud.includes("finishTour('', true)") && read('renderer/index.html').includes('id="gTour"') && read('renderer/hud.css').includes('.g-hole'));
assert.ok(['#agentPicker', '#featChip', '#webChip', '#lookChip', '#barMenuBtn', '#history', '#accountChip', '#btnSettings'].every(s => hud.includes(`el: '${s}'`)));
ok(`guided tour: a spotlight on ${steps} parts of Nexus, after the setup steps (like Test Run's tutorial)`);

// ---------- highlight orb on Windows
const { createWinHelper, SCRIPTS } = require('../src/winhelper');
const events = [], sessions = [];
const h = createWinHelper({ run: async () => ({}), session: (mode, args, onEvent, script) => { const s = { mode, args, onEvent, script, sent: [], proc: new (require('events'))(), send: x => s.sent.push(x), kill() { s.killed = true; } }; sessions.push(s); return s; }, emit: e => events.push(e), outlook: () => false });
h({ cmd: 'info', id: 'i' }); assert.strictEqual(events.at(-1).selwatch, true);
h({ cmd: 'sel_watch_start', pid: 1234 }); const sw = sessions.at(-1);
assert.ok(sw.mode === 'selwatch' && sw.script === SCRIPTS.SELWATCH && sw.args.pid === 1234);
sw.onEvent({ event: 'sel_watch', ok: true }); sw.onEvent({ event: 'selection', text: 'photosynthesis', app: 'msedge', x: 1200, y: 800, physical: true });
assert.ok(events.at(-1).event === 'selection' && events.at(-1).physical);
h({ cmd: 'sel_watch_stop' }); assert.ok(sw.killed);
assert.ok(SCRIPTS.SELWATCH.includes('SetWindowsHookEx(14') && SCRIPTS.SELWATCH.includes('TextPattern') && SCRIPTS.SELWATCH.includes('IsPasswordProperty'));
assert.ok(read('main.js').includes('screen.screenToDipPoint({ x: ev.x, y: ev.y })'));
ok('highlight orb on Windows: mouse hook + UI Automation (no clipboard, no password fields), placed in the right spot');

// ---------- Windows fixes
const main = read('main.js');
assert.ok(main.includes("if (WIN && Date.now() - hudShownAt < 900) return;") && main.includes('const wasFront =') && main.includes('skipTaskbar: !WIN'));
assert.ok(main.includes("app.setAppUserModelId(app.isPackaged ? 'com.apojidelegraphics.nexus'") && JSON.parse(read('package.json')).build.appId === 'com.apojidelegraphics.nexus' && main.includes('liveNotes.add(n)'));
assert.ok(SCRIPTS.LISTEN.includes("$pending") && SCRIPTS.LISTEN.includes('RecognizeCompleted') && SCRIPTS.LISTEN.includes('EndSilenceTimeout'));
assert.ok(main.includes("if (WIN) { clipboard.writeText("), 'sharing an answer copies it on Windows');
ok('Windows: the tray click opens the window (no flicker), it shows in the taskbar, notifications work, dictation keeps your last words');

// ---------- automatic updates on Windows
const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.dependencies['electron-updater'] && pkg.build.publish[0].repo === 'Nexus-28' && main.includes("require('electron-updater').autoUpdater") && main.includes('winUp.quitAndInstall(true, true)'));
assert.ok(read('.github/workflows/release.yml').includes('dist/latest.yml') && hud.includes('Restart now'));
ok('Windows updates itself: downloads in the background, "Restart now" (or on quit)');

// ---------- Move to another computer
const T = require('../src/transfer');
const a = fs.mkdtempSync(path.join(os.tmpdir(), 'tra-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'trb-'));
fs.writeFileSync(path.join(a, 'conversations.json'), JSON.stringify({ activeId: 'c1', spaces: [{ id: 's1', name: 'School' }], list: [{ id: 'c1', title: 'From the Mac', updated: 5, messages: [{ role: 'user', content: 'hi' }] }, { id: 'c2', title: 'Shared', updated: 9, messages: [] }] }));
fs.writeFileSync(path.join(a, 'study.json'), JSON.stringify({ decks: [{ id: 'd1', title: 'Cells', cards: [] }] }));
fs.mkdirSync(path.join(a, 'attachments')); fs.writeFileSync(path.join(a, 'attachments', 'img1.png'), 'PNGDATA');
fs.writeFileSync(path.join(b, 'conversations.json'), JSON.stringify({ activeId: 'w1', spaces: [], list: [{ id: 'w1', title: 'Already on Windows', updated: 3, messages: [] }, { id: 'c2', title: 'Shared (older)', updated: 1, messages: [] }] }));
const buf = T.pack({ dir: a, settings: { theme: 'nebula', hotkeyQuick: 'Alt+Space', voice: { systemVoice: 'Samantha', rate: 180 } }, platform: 'darwin' });
assert.ok(zlib.gunzipSync(buf).toString().includes('nexus-transfer'));
const r = T.apply({ dir: b, bundle: T.unpack(buf), currentSettings: { theme: 'arc', hotkeyQuick: 'Ctrl+Alt+Space', voice: { rate: 175 } }, platform: 'win32' });
const conv = JSON.parse(fs.readFileSync(path.join(b, 'conversations.json')));
assert.ok(conv.list.length === 3 && conv.list.find(c => c.id === 'c2').title === 'Shared' && conv.activeId === 'w1' && conv.spaces.length === 1, 'chats are joined, the newer copy wins, nothing here is lost');
assert.ok(fs.existsSync(path.join(b, 'attachments', 'img1.png')) && JSON.parse(fs.readFileSync(path.join(b, 'study.json'))).decks.length === 1);
assert.ok(r.settings.theme === 'nebula' && r.settings.hotkeyQuick === 'Ctrl+Alt+Space' && !r.settings.voice.systemVoice && r.counts.chats === 1);
assert.throws(() => T.unpack(Buffer.from('{"x":1}')), /isn't a Nexus transfer/);
assert.ok(read('src/cloud.js').includes('nexus-transfers/${this.session.user.id}/transfer.json.gz') && read('supabase/nexus-v3.6.sql').includes("(storage.foldername(name))[1] = auth.uid()::text"));
assert.ok(read('renderer/index.html').includes('id="transferCard"') && read('preload.js').includes("transfer: { info:"));
ok('Move to another computer: through your account (private folder) or a file; chats, decks, memory, docs, settings, pictures; Mac ↔ Windows');

// ---------- Test Run search
const fn = read('supabase/functions/try-chat/index.ts'), tj = read('docs/try/try.js');
assert.ok(fn.includes('lite.duckduckgo.com/lite') && fn.includes("Web search didn’t connect") && tj.includes('try once more'));
ok('Test Run: the first web search no longer fails on a dropped connection (retries, then the lite page)');

const ch = JSON.parse(read('docs/whats-new/changes.json'));
assert.ok(ch[0].version === pkg.version && !/axiom|apex|cage/i.test(JSON.stringify(ch[0])));
ok('release notes (no Axiom)');
console.log(`v3.6: ${n} checks passed`);
