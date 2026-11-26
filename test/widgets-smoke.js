// 4.0.6: desktop widgets keep their spot across a restart. Run twice: PHASE=1 moves, PHASE=2 checks.
// NEXUS_HELPER=test/fake-helper.js xvfb-run -a npx electron --no-sandbox test/widgets-smoke.js
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const dir = path.join(require('os').tmpdir(), 'nexus-wsmoke');
const phase = process.env.PHASE || '1';
if (phase === '1') { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ onboarded: true, deskWidgets: { on: true, items: ['streak', 'clock'] } })); }
app.setPath('userData', dir); process.env.NEXUS_KEEP_USERDATA = '1';
app.commandLine.appendSwitch('password-store', 'basic');
const wait = ms => new Promise(r => setTimeout(r, ms));
const widgets = () => BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && /deskwidgets\.html\?k=/.test(w.webContents.getURL()));
const key = w => new URL(w.webContents.getURL()).searchParams.get('k');
app.whenReady().then(async () => {
  const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable() && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true);
  require('../main.js');
  await wait(4500);
  const ws = widgets(); const out = {};
  for (const w of ws) out[key(w)] = w.getBounds();
  if (phase === '1') {
    const s = ws.find(w => key(w) === 'streak');
    // a drag on a Mac: lots of 'move's while the mouse goes, then one 'moved'
    for (let i = 1; i <= 10; i++) { s.setPosition(100 + i * 10, 200 + i * 7); await wait(30); }
    s.emit('moved'); await wait(1200);
    // and one that gets no window events at all (what a Mac drag sometimes did): the 2-second check still saves it
    const c = ws.find(w => key(w) === 'clock'); c.removeAllListeners('move'); c.removeAllListeners('moved');
    c.setPosition(420, 330); await wait(2600);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).deskWidgets;
    console.log('WSMOKE1', JSON.stringify({ now: s.getBounds(), saved: saved.spots }));
    if (saved.spots.streak?.x !== 200 || saved.spots.clock?.x !== 420) { console.log('WSMOKE FAIL save'); app.exit(1); }
  } else {
    console.log('WSMOKE2', JSON.stringify(out));
    if (out.streak?.x !== 200 || out.streak?.y !== 270 || out.clock?.x !== 420 || out.clock?.y !== 330) { console.log('WSMOKE FAIL reopen'); app.exit(1); }
    // 4.2.0: stack the clock right on top of the streak, then make the streak grow (like a longer song name): its
    // bottom stays put, its top moves up, and the clock moves up the same amount
    const st = ws.find(w => key(w) === 'streak'), ck = ws.find(w => key(w) === 'clock');
    st.setPosition(900, 500); ck.setPosition(900, 500 - ck.getBounds().height - 12); await wait(2600);
    const before = { st: st.getBounds(), ck: ck.getBounds() };
    require('electron').ipcMain.emit('deskw:size', { sender: st.webContents }, before.st.height - 4 + 60);   // its content got 60px taller
    await wait(700);
    const after = { st: st.getBounds(), ck: ck.getBounds() };
    console.log('WSMOKE3', JSON.stringify({ before, after }));
    if (after.st.y + after.st.height !== before.st.y + before.st.height || after.st.height !== before.st.height + 60 || after.ck.y !== before.ck.y - 60) { console.log('WSMOKE FAIL grow'); app.exit(1); }
    // 4.2.1: sleep → the system moves and stretches widgets → wake: nothing of that is saved, and they go back
    const { powerMonitor } = require('electron');
    const keep = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).deskWidgets.spots;
    powerMonitor.emit('suspend'); await wait(200);
    ck.setBounds({ x: 40, y: 700, width: 640, height: 89 }); st.setPosition(600, 300); await wait(2600);   // what macOS did
    const during = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')).deskWidgets.spots;
    powerMonitor.emit('resume'); await wait(4500);
    const back = { st: st.getBounds(), ck: ck.getBounds() };
    console.log('WSMOKE4', JSON.stringify({ keep: { st: keep.streak, ck: keep.clock }, during: { st: during.streak, ck: during.clock }, back }));
    if (during.clock.x !== keep.clock.x || during.streak.x !== keep.streak.x) { console.log('WSMOKE FAIL saved a system move'); app.exit(1); }
    if (back.ck.width !== 260 || back.ck.x !== keep.clock.x || back.ck.y !== keep.clock.y || back.st.x !== keep.streak.x || back.st.y !== keep.streak.y) { console.log('WSMOKE FAIL not put back'); app.exit(1); }
    console.log('WSMOKE OK');
  }
  app.exit(0);
});
