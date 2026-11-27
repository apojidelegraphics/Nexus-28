// 4.3.0: report card grades, jots everywhere, N28C remote actions + extras, streak saver, visitor pushes, the shared
// files for N28C and Test Run, the database update and the embed function.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = t => { n++; console.log('  ✓ ' + t); };

(async () => {
  // ---------- weekly report card
  const recap = require('../src/recap');
  const empty = recap.grade(recap.build({ now: new Date('2026-11-26T12:00:00').getTime() }));
  assert.strictEqual(empty.overall, 'F'); assert.ok(/quiet week/i.test(empty.tip)); assert.deepStrictEqual(empty.items.map(i => i.key), ['consistency', 'curiosity']);
  const day = new Date('2026-11-23T10:00:00').getTime(), list = [{ id: 'c', title: 'T', messages: Array.from({ length: 42 }, (_, i) => ({ role: 'user', content: 'photosynthesis question ' + i, ts: day + (i % 6) * 864e5 })) }];
  const log = Array.from({ length: 90 }, (_, i) => ({ t: day + (i % 6) * 864e5, g: i % 10 ? 3 : 0 }));
  const g = recap.grade(recap.build({ list, log, streak: 9, now: new Date('2026-11-29T20:00:00').getTime() }), { focusSessions: 7, questsDone: 15 });
  assert.ok(['A', 'A-'].includes(g.overall), g.overall); assert.deepStrictEqual(g.items.map(i => i.key), ['consistency', 'curiosity', 'study', 'focus', 'quests', 'streak']);
  assert.strictEqual(recap.letter(100), 'A'); assert.strictEqual(recap.letter(50), 'C'); assert.strictEqual(recap.letter(10), 'F');
  const NR = require('../renderer/reportcard');
  assert.ok(NR.card({ ...g, name: '<b>x</b>' }).includes('&lt;b&gt;x&lt;/b&gt;') && NR.card(g).includes('WEEKLY REPORT CARD'));
  ok('weekly report card: letter grades per subject, a tip, escaped name');

  // ---------- jots everywhere
  const tools = require('../src/tools');
  assert.ok(tools.buildToolset({ agentic: false, settings: {}, text: 'jot this down: buy milk', platform: 'linux' }).labels.includes('jot_add'));
  assert.ok(!tools.buildToolset({ agentic: false, settings: {}, text: 'what is 2+2', platform: 'linux' }).labels.includes('jot_add'));
  const added = []; const jots = { list: () => [{ text: 'call mom', ts: Date.now() }, { text: 'essay due friday', ts: Date.now() }], add: t => added.push(t) };
  assert.ok((await tools.execute('jot_add', { text: ' buy milk ' }, { settings: {}, jots })).content.includes('Jotted') && added[0] === 'buy milk');
  const jl = await tools.execute('jots_list', { query: 'essay' }, { settings: {}, jots }); assert.ok(jl.content.includes('essay due') && !jl.content.includes('call mom'));
  assert.ok(!tools.needsConfirm('jot_add'));
  const main = R('main.js'), pre = R('preload.js');
  assert.ok(main.includes("jot: () => openJotWindow()") && main.includes("hotkeyJot: 'jot'") && main.includes("label: 'Jot a Note…'") && main.includes("act === 'jot'") && R('src/store.js').includes("hotkeyJot: 'Alt+Shift+J'"));
  assert.ok(R('renderer/cliporb.html').includes('data-a="jot"') && R('renderer/index.html').includes('data-slot="hotkeyJot"'));
  const jh = R('renderer/jot.html'); assert.ok(jh.includes('<script src="jot.js"></script>') && !/script-src[^;"]*unsafe-inline/.test(jh) && /script-src 'self'">/.test(jh));
  ok('jots everywhere: ⌥⇧J box, menu bar, highlight orb, agents read and add jots');

  // ---------- N28C: extras + remote actions through the companion
  const { Companion } = require('../src/companion');
  const acts = [];
  const comp = new Companion({ cloud: { session: {}, write: async () => {} }, settings: () => ({}), convos: { summary: () => ({ list: [], spaces: [] }) }, study: { stats: () => ({}), decks: () => [] }, routines: { list: () => [] }, personas: () => [],
    metrics: { summary: () => ({ achievements: [], quests: null, challenge: null }) }, version: '4.3.0', enabled: () => false,
    actions: { extra: () => ({ approvals: [{ id: 'c1', label: 'Open a link' }], report: { overall: 'B' } }), act: async (op, m) => { acts.push([op, m]); return op === 'lock' ? {} : undefined; } } });
  const stx = comp.status(); assert.strictEqual(stx.approvals[0].id, 'c1'); assert.strictEqual(stx.report.overall, 'B');
  assert.deepStrictEqual(await comp.request({ meta: { op: 'lock' } }), { ok: true });
  await assert.rejects(comp.request({ meta: { op: 'teleport' } }), /Unknown request/);
  assert.deepStrictEqual(acts.map(a => a[0]), ['lock', 'teleport']);
  let puts = 0; comp.put = async () => { puts++; }; comp.actions.docs = () => ({ at: Date.now(), list: [{ id: 'a', text: 'x' }] });
  await comp.publish(['docs']); await comp.publish(['docs']); assert.strictEqual(puts, 1, 'unchanged docs are not sent again');
  for (const op of ["op === 'approve' || op === 'deny'", "op === 'screen_peek'", "op === 'lock'", "op === 'focus_start'", "op === 'music'", "op === 'jot_add'", "op === 'credit'"]) assert.ok(main.includes(op), op);
  assert.ok(main.includes("if (!ph.remote) throw new Error('Turn on \"Remote actions\"") && main.includes("if (!ph.peek) throw new Error") && main.includes("notify('👀 Your phone peeked at your screen'"));
  assert.ok(main.includes('label, detail, source, at: Date.now(), resolve:') && main.includes('function missionStepLog(st)'));
  assert.ok(R('renderer/settings.js').includes('id="phRemote"') && R('renderer/settings.js').includes('id="phPeek"'));
  ok('N28C: approvals, live mission, report, Live Spaces in the status; remote actions need "Remote actions" (peek needs its own switch)');

  // ---------- streak saver + visitor pushes
  const { Push } = require('../src/push');
  let phone = { notify: {} }; const sent = [];
  const push = new Push({ cloud: { session: {} }, getSettings: () => ({ phone }), setSettings: p => { phone = p.phone; }, now: () => new Date('2026-11-26T21:00:00').getTime() });
  push.send = async (k, m) => { sent.push([k, m]); return 1; };
  await push.tick({ due: 0, challengeDone: false, challengeText: 'x', streak: 12, activeToday: false });
  assert.strictEqual(sent[0][1].url, './#saver'); assert.ok(/12-day streak/.test(sent[0][1].title));
  assert.strictEqual(push.prefs().visitors, true); assert.strictEqual(push.setPrefs({ visitors: false }).visitors, false);
  assert.ok(main.includes('async function visitorsPush()') && main.includes("push.send('visitors'"));
  ok('streak saver opens 3 quick cards from the push; profile visitor pushes (can be turned off)');

  // ---------- seasonal events, feed, pins on the desktop
  assert.ok(main.includes("cloud.rpc('event_claim'") && main.includes("ipcMain.handle('events:state'") && main.includes("cloud.rpc('feed_post'") && main.includes("store.getSettings().feedShare === false"));
  assert.ok(pre.includes("events: { state: () => call('events:state')") && pre.includes("report: { week: () => call('report:week')"));
  const st = R('renderer/settings.js'); assert.ok(st.includes("api.cloud.rpc('profile_pins_set'") && st.includes('id="feedShare"'));
  const hud = R('renderer/hud.js'); assert.ok(hud.includes('async function openEvents()') && hud.includes('async function openReport()') && hud.includes("'Weekly report card'"));
  ok('desktop: events auto-claim, milestones post to the friends feed, pins in Stats');

  // ---------- shared files for N28C and Test Run
  const { build } = require('../scripts/sync-companion');
  const files = build();
  for (const f of ['classroom.js', 'devbuilder.js', 'reportcard.js', 'achlist.js']) { assert.ok(files[f], f); assert.strictEqual(R('docs/companion/' + f), files[f], f + ' is in sync (npm run sync:companion)'); }
  const sandbox = {}; vm.runInNewContext(files['achlist.js'], sandbox); assert.strictEqual(sandbox.NexusAchievements.length, require('../src/metrics').ACHIEVEMENTS.length);
  const ci = R('docs/companion/index.html'), ti = R('docs/try/index.html');
  for (const s of ['classroom.js', 'reportcard.js', 'achlist.js', 'n43.js']) assert.ok(ci.includes(`<script src="${s}"></script>`), s);
  assert.ok(ci.indexOf('src="n43.js"') > ci.indexOf('src="app.js"'));
  for (const s of ['../companion/classroom.js', '../companion/devbuilder.js', '../companion/achlist.js', 'x43.js']) assert.ok(ti.includes(`<script src="${s}"></script>`), s);
  assert.ok(ti.indexOf('x43.js') > ti.indexOf('more.js'));
  for (const f of ['docs/companion/n43.js', 'docs/try/x43.js']) new vm.Script(R(f));
  assert.ok(R('docs/companion/sw.js').includes("'./n43.js'") && R('docs/companion/sw.js').includes('n28c-shell-v4.3.0'));
  const n43 = R('docs/companion/n43.js');
  for (const k of ['function phoneAnswer', 'askQueue', 'Solve this', 'Cite this book', 'What is this?', 'watchPosition', 'navigator.vibrate', 'function briefCard', 'function streakSaver', "rpc('friends_feed'", "rpc('feed_react'", "request('screen_peek'", "request(yes ? 'approve' : 'deny'", "function docsSheet", 'Live Spaces'.toUpperCase(), 'NexusReport.card', 'NexusClass.open', "rpc('profile_pins_set'"]) assert.ok(n43.includes(k), k);
  assert.ok(R('docs/try/x43.js').includes('NexusDev.render') && R('docs/try/x43.js').includes('NexusClass.open') && R('docs/try/x43.js').includes("rpc('profile_pins_set'"));
  assert.ok(R('renderer/index.html').includes('frame-src https://apojidelegraphics.github.io'));
  assert.ok(n43.includes('const docsShowing = tok =>') && !n43.includes("loadDocs().then(() => docsSheet())"), 'the Jots & Docs sheet never re-opens itself after you close it');
  assert.ok(/\.side-top \.wide \{ white-space: nowrap/.test(R('docs/try/try.css')), 'Test Run: New chat stays on one line');
  ok('N28C and Test Run load classes, the bot builder, the report card and the achievement list');

  // ---------- database + embed function
  const sql = R('supabase/nexus-v4.3.0.sql');
  for (const k of ['profile_pins_set', 'profile_wtheme_set', 'cirkts_gift', 'event_state', 'event_claim', 'friends_feed', 'feed_react', 'feed_post', 'classroom_create', 'classroom_join', 'classroom_view', 'embed_bot_public', 'embed_take', 'first-frost-2026', 'winter-lights-2026']) assert.ok(sql.includes(k), k);
  assert.ok(/if p\.data \? 'event'|data \? 'event'/.test(sql), 'event items cannot be bought');
  const ef = R('supabase/functions/embed-chat/index.ts'); assert.ok(ef.includes('embed_take') && ef.includes('origins'));
  const cos = require('../renderer/cosmetics'); assert.ok(cos.item('frame:firstfrost') && cos.item('wtheme:aurora'));
  { const adm = path.join(__dirname, '../../apoji-admin/cosmetics.js'); if (fs.existsSync(adm)) assert.strictEqual(R('renderer/cosmetics.js'), fs.readFileSync(adm, 'utf8'), 'Apoji Admin has the same cosmetics.js'); }   // only when the Admin repo sits next to this one (never on CI)
  const ch = require('../docs/whats-new/changes.json')[0]; assert.strictEqual(ch.version, '4.3.0'); assert.strictEqual(require('../package.json').version, '4.3.0'); assert.ok(!/axiom/i.test(JSON.stringify(ch)));
  ok('nexus-v4.3.0.sql + embed-chat; version 4.3.0');
  console.log(`v4.3.0: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
