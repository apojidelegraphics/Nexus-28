// Takes the screenshots for the user guide (docs/guide/img/*.png) from the real app with made-up example data.
// Run: NEXUS_HELPER=test/fake-helper.js xvfb-run -a npx electron --no-sandbox scripts/guide-shots.js
const { app, BrowserWindow } = require('electron');
const path = require('path'), fs = require('fs');
const dir = path.join(require('os').tmpdir(), 'nexus-guide-shots');
const out = path.join(__dirname, '..', 'docs', 'guide', 'img');
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(out, { recursive: true });
app.setPath('userData', dir);
process.env.NEXUS_KEEP_USERDATA = '1';
process.env.NEXUS_CLOUD_URL = 'http://127.0.0.1:9';   // no cloud: everything here is local example data
process.env.NEXUS_UPDATE_BASE = 'http://127.0.0.1:9';
app.commandLine.appendSwitch('password-store', 'basic');
const now = Date.now(), H = 3600e3, D = 864e5;
const ts = (i, base = now - 2 * H) => base + i * 60e3;
// ---- example data
const spaces = [{ id: 'sp1', name: 'School', color: '#5cc8ff', agent: '', links: [] }, { id: 'sp2', name: 'Side project', color: '#b18cff', agent: '', links: [] }];
const md = s => s.trim();
const chats = [
  { id: 'c1', title: 'Essay on the causes of World War I', spaceId: 'sp1', created: now - 3 * H, updated: now - 20 * 60e3, pins: [ts(1)],
    summary: { text: 'Luke is writing a 5-paragraph essay on the causes of WWI. We settled on the MAIN causes (militarism, alliances, imperialism, nationalism) plus the assassination as the spark, and drafted a thesis.', at: now - 25 * 60e3, upTo: 4 },
    messages: [
      { role: 'user', content: 'Help me plan an essay on the causes of World War I. 5 paragraphs, due Friday.', ts: ts(0) },
      { role: 'assistant', persona: 'neodela', model: 'Nexus free key · neodela', ts: ts(1), featureData: { confidence: 88 }, content: md(`Here's a simple plan for five paragraphs:

1. **Introduction**: hook, background (Europe in 1914), and your thesis.
2. **Alliances**: how the Triple Entente and Triple Alliance turned a local fight into a world war.
3. **Militarism and imperialism**: the arms race and the competition for colonies.
4. **Nationalism and the spark**: Franz Ferdinand's assassination in Sarajevo, June 1914.
5. **Conclusion**: tie the causes together and say which mattered most.

**Thesis idea:** *"World War I started because a web of alliances, an arms race and fierce nationalism turned one assassination into a war no one could stop."*`) },
      { role: 'user', content: 'Which cause should I say mattered most?', ts: ts(3) },
      { role: 'assistant', persona: 'neodela', model: 'Nexus free key · neodela', ts: ts(4), featureData: { confidence: 62 }, content: md(`Historians still argue about this, so there's no single right answer. A strong choice is **the alliance system**, because it explains *why* a conflict between Austria-Hungary and Serbia pulled in Russia, Germany, France and Britain within a week.

Back it up with one date-by-date example (July 28 to August 4, 1914) and you'll have a convincing paragraph.`) }] },
  { id: 'c2', title: 'Plan my week', created: now - D, updated: now - 5 * H, messages: [
      { role: 'user', content: 'Help me plan my week around my goals.', ts: now - 5 * H },
      { role: 'assistant', persona: 'paragon', model: 'Nexus key · Paragon', ts: now - 5 * H + 60e3, featureData: { confidence: 91 },
        activity: [{ tool: 'calendar_events', label: 'Reading your calendar', detail: 'this week', status: 'ok', summary: '6 events' }, { tool: 'weather', label: 'Checking weather', detail: 'Albemarle, NC', status: 'ok', summary: 'rain Wed' }, { tool: 'spotify_play', label: 'Playing on Spotify', detail: 'focus beats', status: 'ok', summary: 'done' }],
        content: md(`Here's a week built from your 3 goals:

| Day | Focus | Time |
|---|---|---|
| Mon | Essay outline + intro | 45 min |
| Tue | Run (3 miles) | 30 min |
| Wed | Essay body paragraphs | 60 min |
| Thu | Run + review flashcards | 40 min |
| Fri | Finish and hand in the essay | 30 min |

Want me to set reminders for these?`) }] },
  { id: 'c3', title: 'Flashcards: Spanish greetings', spaceId: 'sp1', created: now - 2 * D, updated: now - 2 * D, messages: [
      { role: 'user', content: '@Magyk teach me 8 Spanish greetings with flashcards', ts: now - 2 * D },
      { role: 'assistant', persona: 'neodela', model: 'Nexus free key · neodela', ts: now - 2 * D + 6e4, features: ['Magyk'], content: '```nexus-flashcards\n{"title":"Spanish greetings","cards":[{"front":"Hola","back":"Hello"},{"front":"Buenos días","back":"Good morning"},{"front":"Buenas tardes","back":"Good afternoon"},{"front":"Buenas noches","back":"Good night"},{"front":"¿Qué tal?","back":"How’s it going?"},{"front":"Mucho gusto","back":"Nice to meet you"},{"front":"Hasta luego","back":"See you later"},{"front":"Adiós","back":"Goodbye"}]}\n```' }] },
  { id: 'c4', title: 'Landing page ideas for my app', spaceId: 'sp2', created: now - 3 * D, updated: now - 3 * D, messages: [
      { role: 'user', content: '@Synergy ideas for my app’s landing page', ts: now - 3 * D }, { role: 'assistant', persona: 'lyte', model: 'Nexus free key · lyte', ts: now - 3 * D + 6e4, content: 'Here are 6 directions, from safest to boldest…' }] },
  { id: 'c5', title: 'Quiz: cell biology', spaceId: 'sp1', created: now - 4 * D, updated: now - 4 * D, messages: [
      { role: 'user', content: '@StudyMode quiz me on cell biology', ts: now - 4 * D }, { role: 'assistant', persona: 'flash', model: 'Nexus free key · flash', ts: now - 4 * D + 6e4, content: '```nexus-quiz\n{"title":"Cell biology","questions":[{"q":"What makes energy for the cell?","choices":["Nucleus","Mitochondria","Ribosome","Golgi"],"answer":1,"why":"Mitochondria make ATP."},{"q":"Where is DNA kept?","choices":["Nucleus","Cell wall","Vacuole","Membrane"],"answer":0,"why":"The nucleus holds the DNA."}]}\n```' }] },
  { id: 'c7', title: 'Timeline of 1914', spaceId: 'sp1', created: now - 50 * 60e3, updated: now - 40 * 60e3, messages: [
      { role: 'user', content: 'Give me a timeline of how WWI started in 1914', ts: now - 50 * 60e3 },
      { role: 'assistant', persona: 'neodela', model: 'Nexus free key · neodela', ts: now - 49 * 60e3, activity: [{ tool: 'web_search', label: 'Searching the web', detail: 'July Crisis 1914 dates', status: 'ok', summary: '5 results' }, { tool: 'fetch_url', label: 'Reading page', detail: 'britannica.com', status: 'ok', summary: 'read' }],
        content: 'Here is how one month turned into a world war:\n\n```nexus-timeline\n{"title":"The July Crisis, 1914","events":[{"when":"June 28","title":"Franz Ferdinand is shot","detail":"Gavrilo Princip kills the Austrian heir in Sarajevo."},{"when":"July 23","title":"Austria\'s ultimatum","detail":"Austria-Hungary sends Serbia demands it expects to be refused."},{"when":"July 28","title":"Austria declares war on Serbia","detail":"Russia starts to mobilize to protect Serbia."},{"when":"August 1","title":"Germany declares war on Russia","detail":"The alliance system starts pulling everyone in."},{"when":"August 4","title":"Britain enters the war","detail":"Germany invades Belgium on the way to France."}]}\n```' },
      { role: 'user', content: 'Compare the two alliances', ts: now - 45 * 60e3 },
      { role: 'assistant', persona: 'neodela', model: 'Nexus free key · neodela', ts: now - 44 * 60e3,
        content: '```nexus-compare\n{"title":"The two alliances in 1914","options":["Triple Entente","Triple Alliance"],"rows":[{"label":"Members","values":["France, Russia, Britain","Germany, Austria-Hungary, Italy"],"best":-1},{"label":"Formed","values":["1907","1882"],"best":-1},{"label":"Army size","values":["About 5.7 million","About 3.5 million"],"best":0},{"label":"Stayed together","values":["Yes","No: Italy switched in 1915"],"best":0}],"pick":{"option":0,"why":"Bigger and more united, though slower to mobilize."}}\n```' }] },
  { id: 'c6', title: 'Fix my printer on Windows', created: now - 6 * D, updated: now - 6 * D, messages: [
      { role: 'user', content: 'My printer says offline', ts: now - 6 * D }, { role: 'assistant', persona: 'flash', model: 'Nexus free key · flash', ts: now - 6 * D + 6e4, content: 'Let’s check three things…' }] }
];
fs.writeFileSync(path.join(dir, 'conversations.json'), JSON.stringify({ activeId: null, list: chats, spaces }));
const wk = (() => { const g = require('../src/goals'); let v = null; for (const t of ['Finish the WWI essay', 'Run 3 times', 'Review Spanish flashcards']) v = g.add(v, t); v = g.toggle(v, v.items[1].id); return v; })();
fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ onboarded: true, seenWhatsNew: require('../package.json').version, termsSeen: '1.0', nickname: 'Luke', weeklyGoals: wk,
  chatReminders: [{ id: 'r1', convId: 'c1', at: now + 20 * H, note: 'hand in the essay', title: 'Essay on the causes of World War I' }, { id: 'r2', convId: 'c2', at: now + 2 * H, note: '', title: 'Plan my week' }],
  updates: { auto: false }, deskWidgets: { on: false, items: ['clock', 'goals', 'reminders', 'ask', 'flashcard'] }, cirkts: { migrated: true, owned: ['frame:neon', 'color:aurora', 'font:display', 'banner:nebula', 'ptheme:aurora', 'skin:reactor'], kept: ['skin:reactor'], spent: 1450, equip: { frame: 'frame:neon', color: 'color:aurora', font: 'font:display', banner: 'banner:nebula', ptheme: 'ptheme:aurora', bio: 'Junior, robotics club, always studying for something.', status_text: 'Studying for finals' } } }));
fs.writeFileSync(path.join(dir, 'metrics.json'), JSON.stringify({ points: 2460, chats: 214, streak: 12, bestStreak: 19, days: [], since: now - 60 * D }));   // 4.0: some Cirkts for the shop
fs.writeFileSync(path.join(dir, 'memory.json'), JSON.stringify({ enabled: true, items: [{ id: 'm1', text: "I'm in 11th grade", source: 'chat', at: now - 9 * D }, { id: 'm2', text: 'Call me Luke', source: 'you', at: now - 9 * D }, { id: 'm3', text: 'My teacher wants MLA citations', source: 'chat', at: now - 3 * D, space: 'sp1' }] }));

const wait = ms => new Promise(r => setTimeout(r, ms));
let started = false;
app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', () => { if (!started && win.webContents.getURL().endsWith('index.html')) { started = true; shoot(win).catch(e => { console.error(e); app.exit(1); }); } });
});
async function snap(win, name, js, ms = 700) {
  if (js) await win.webContents.executeJavaScript(js).catch(e => console.log('js fail', name, e.message));
  await wait(ms);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, name + '.png'), img.toPNG()); console.log('shot', name, img.getSize());
}
const clean = `document.querySelectorAll('.modal:not([id]), .modal.inbox-pop').forEach(m => m.remove()); document.querySelectorAll('.modal[id]').forEach(m => m.hidden = true); document.getElementById('settings').hidden = true; document.getElementById('chatMenu').hidden = true; document.getElementById('actMenu').hidden = true;`;
async function shoot(hud) {
  await wait(2500);
  hud.setBounds({ x: 0, y: 0, width: 1120, height: 760 }); hud.show(); await wait(800);
  const js = s => hud.webContents.executeJavaScript(s);
  await js(`document.querySelectorAll('.banner, .banners > *').forEach(b => b.remove())`).catch(() => {});
  await snap(hud, 'empty-chat');
  await snap(hud, 'chat', `window.nexus.conv.open('c1')`, 1200);
  await snap(hud, 'chat-top', `document.getElementById('feed').scrollTop = 0`, 600);
  await snap(hud, 'chat-menu', `document.getElementById('btnChatMenu').click()`);
  await snap(hud, 'find', `${clean} document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, metaKey: true, bubbles: true })); setTimeout(() => { const q = document.getElementById('findQ'); q.value = 'alliance'; q.dispatchEvent(new Event('input')); }, 200);`, 900);
  await js(`document.getElementById('findX')?.click()`);
  await snap(hud, 'menu', `${clean} document.getElementById('barMenuBtn').click()`);
  await snap(hud, 'goals', `${clean} document.querySelector('[data-act="goals"]').click()`);
  await snap(hud, 'reminders', `${clean} document.querySelector('[data-act="reminders"]').click()`);
  await snap(hud, 'remind-chat', `${clean} document.querySelector('[data-remindchat]').click()`);
  await snap(hud, 'help', `${clean} document.getElementById('btnHelp').click()`);
  await snap(hud, 'watch-guide', `${clean} document.querySelector('[data-h="watch"]')?.click() || (document.getElementById('btnHelp').click(), setTimeout(() => document.querySelector('[data-h="watch"]').click(), 100)); setTimeout(() => { const g = document.getElementById('wgGoal'); if (g) g.value = 'Add a printer in Windows Settings'; }, 300)`, 900);
  await snap(hud, 'flashcards', `${clean} window.nexus.conv.open('c3')`, 1200);
  await snap(hud, 'quiz', `${clean} window.nexus.conv.open('c5')`, 1200);
  await snap(hud, 'table-answer', `${clean} window.nexus.conv.open('c2')`, 1200);
  await snap(hud, 'mention-menu', `${clean} window.nexus.conv.open('c2'); setTimeout(() => { const i = document.getElementById('input'); i.focus(); i.value = '@'; i.dispatchEvent(new Event('input', { bubbles: true })); }, 600)`, 1400);
  await js(`document.getElementById('input').value = ''; document.getElementById('input').dispatchEvent(new Event('input', { bubbles: true }))`);
  await snap(hud, 'voice-note', `${clean} document.getElementById('vnoteBar').hidden = false; document.getElementById('vnoteTime').textContent = '0:07'; document.getElementById('vnoteLvl').style.width = '46%'; document.getElementById('btnVNote').classList.add('on')`);
  await js(`document.getElementById('vnoteBar').hidden = true; document.getElementById('btnVNote').classList.remove('on')`);
  const tabs = ['account', 'profile', 'subscription', 'personal', 'stats', 'providers', 'personas', 'features', 'voice', 'training', 'mac', 'permissions', 'connectors', 'phone', 'general'];
  for (const t of tabs) await snap(hud, 'settings-' + t, `${clean} document.getElementById('btnSettings').click(); setTimeout(() => document.querySelector('#tabs [data-tab="${t}"]')?.click(), 150)`, 1300);
  await snap(hud, 'settings-a11y', `document.getElementById('a11yCard')?.scrollIntoView({ block: 'center' })`, 600);
  await js(clean);
  // the Watch & guide me box, with a made-up step
  const gwin = new BrowserWindow({ width: 372, height: 190, show: true, frame: false, transparent: false, backgroundColor: '#02080a', webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: true } });
  await gwin.loadFile(path.join(__dirname, '..', 'renderer', 'guide.html')); await wait(600);
  gwin.webContents.send('guide:step', { goal: 'Add a printer in Windows Settings', count: 3, say: 'Click "Add device" next to "Add a printer or scanner", near the top right.', where: 'top right, next to the printer list' });
  await snap(gwin, 'guide-box', null, 900);
  // frames for the animated guide-steps.gif (made by scripts/guide-gif.py)
  const steps = [['Looking at your screen…', '', 0], ['Click the Start button, bottom left, then Settings (the gear).', 'bottom left of the screen', 1], ['In Settings, click "Bluetooth & devices" on the left, then "Printers & scanners".', 'left side of the Settings window', 2],
    ['Click "Add device" next to "Add a printer or scanner", near the top right.', 'top right, next to the printer list', 3], ['Pick your printer from the list and click "Add device". That\'s it: your printer is added.', '', 4, true]];
  for (const [i, [say, where, count, done]] of steps.entries()) { gwin.webContents.send('guide:step', { goal: 'Add a printer in Windows Settings', count, say, where, done: !!done, busy: !count }); await snap(gwin, 'gif-guide-' + i, null, 500); }
  gwin.close();
  // Quick Chat
  const qc = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('quickchat.html'));
  if (qc) { qc.setBounds({ x: 0, y: 0, width: 640, height: 300 }); qc.show(); await wait(600); await snap(qc, 'quick-chat', `document.getElementById('input') && (document.getElementById('input').value = 'what does mitochondria do?')`); }
  // 3.13: new screens (answer ⋯ menu, answer widgets, desktop widgets, orb skins) and the frames for docs/assets/hero.gif
  hud.setBounds({ x: 0, y: 0, width: 1120, height: 760 }); hud.show();
  await snap(hud, 'answer-widgets', `${clean} window.nexus.conv.open('c7'); setTimeout(() => { document.getElementById('feed').scrollTop = 0; }, 500)`, 1400);
  await snap(hud, 'answer-compare', `document.getElementById('feed').scrollTop = 1e6`, 700);
  await snap(hud, 'activity-chips', `${clean} window.nexus.conv.open('c2'); setTimeout(() => { document.getElementById('feed').scrollTop = 0; }, 500)`, 1300);
  await snap(hud, 'answer-menu', `const b = [...document.querySelectorAll('.mt-more')].pop(); b?.closest('.msg-tools')?.style.setProperty('opacity', '1'); b?.click();`, 700);
  await js(`document.querySelectorAll('.mt-menu').forEach(m => m.remove())`).catch(() => {});
  await hud.webContents.executeJavaScript(`window.nexus.deskWidgets?.set({ on: true })`).catch(() => {});
  await wait(1500);
  const dw = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('deskwidgets.html'));
  if (dw) { await wait(800); await snap(dw, 'desk-widgets', `document.body.style.background = '#1b2a3a'`, 600); }
  // orb skins: one page with the new ones drawn by the real orb.js
  const ow = new BrowserWindow({ width: 1000, height: 300, show: true, backgroundColor: '#02080a', webPreferences: { contextIsolation: true } });
  await ow.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:#02080a;display:flex;gap:10px;justify-content:center;align-items:center;height:100vh;font:12px monospace;color:#86b3a0">${['tide', 'vortex', 'circuit', 'solar', 'hologram'].map(k => `<div style="text-align:center"><canvas id="o-${k}" width="180" height="180" style="width:180px;height:180px"></canvas><div>${k.toUpperCase()}</div></div>`).join('')}</body>`));
  await ow.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, '..', 'renderer', 'orb.js'), 'utf8') + `;for (const k of ['tide','vortex','circuit','solar','hologram']) NexusOrb.create(document.getElementById('o-' + k), { color: '#3dffa0', skin: k }); 0`).catch(e => console.log('orb fail', e.message));
  await snap(ow, 'orb-skins', null, 1500); ow.close();
  // 4.0: Write with the new tools, the profile shop on the Frames tab
  hud.show(); hud.focus(); await wait(600);
  await snap(hud, 'write', `${clean} document.querySelector('[data-act="write"]')?.click(); setTimeout(() => { const t = document.getElementById('wrText'); if (t) { t.value = '# The causes of World War I\\n\\nIn the summer of 1914, one assassination turned into a war that pulled in most of Europe. Historians usually point to four causes: militarism, alliances, imperialism and nationalism.\\n\\n## Alliances\\nBy 1914 Europe was split into two camps.'; t.dispatchEvent(new Event('input', { bubbles: true })); } document.querySelector('[data-tool="preview"]')?.click(); }, 500)`, 1600);
  await js(`document.getElementById('writeModal').hidden = true`).catch(() => {});
  // hero tour frames (scripts/guide-gif.py turns hero-*.png into docs/assets/hero.gif)
  const tour = [['empty-chat'], ['chat'], ['activity-chips'], ['answer-widgets'], ['answer-compare'], ['answer-menu'], ['flashcards'], ['settings-connectors']];
  for (const [i, [name]] of tour.entries()) { const f = path.join(out, name + '.png'); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(out, `hero-${String(i).padStart(2, '0')}.png`)); }
  console.log('done'); app.exit(0);
}
app.whenReady().then(() => { const { safeStorage } = require('electron'); if (!safeStorage.isEncryptionAvailable() && safeStorage.setUsePlainTextEncryption) safeStorage.setUsePlainTextEncryption(true); app.setVersion(require('../package.json').version); require('../main.js'); });
