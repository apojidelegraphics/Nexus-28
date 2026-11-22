// v3.8 tests: keep awake rebuilt (checks with the system, for a while, battery floor, reset), Windows voice + highlight
// orb fixes, settings search + Home page fixes, search chips in N28C, training data (consent, scrubbing, ratings),
// "needs testing", "active on", pictures on feedback, temporary passwords, and the 3.8 database update.
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

(async () => {
  // ---------- keep awake
  const { createAwake, parseAssertions, floorOf } = require('../src/awake');
  const out = 'Listed by owning process:\n   pid 4242(caffeinate): [0x1] 00:01:00 PreventUserIdleSystemSleep named: "caffeinate command-line tool"\n   pid 88(Spotify): [0x2] PreventUserIdleSystemSleep named: "Playing audio"\n   pid 9(powerd): [0x3] PreventUserIdleSystemSleep named: "x"';
  assert.deepStrictEqual(parseAssertions(out, 4242), { ours: true, holders: ['Spotify'] });
  assert.strictEqual(parseAssertions(out, 1).ours, false);
  assert.strictEqual(floorOf({}), 20); assert.strictEqual(floorOf({ batteryFloor: 0 }), 0); assert.strictEqual(floorOf({ batteryFloor: 90 }), 50);
  ok('keep awake: reads what macOS says is really keeping it awake (ours, and other apps)');
  let cfg = { keepAwake: true, until: Date.now() - 1000 }, expired = 0;
  const fakeProc = () => { const e = new (require('events'))(); e.pid = 4242; e.kill = () => {}; return e; };
  const exec = (cmd, args, o, cb) => cb(null, cmd.endsWith('pmset') && args[1] === 'assertions' ? out : cmd.endsWith('pmset') && args[1] === 'batt' ? "Now drawing from 'Battery Power'\n -InternalBattery-0 15%; discharging" : '', '');
  const aw = createAwake({ platform: 'darwin', getCfg: () => cfg, exec, spawn: fakeProc, guardSpawn: fakeProc, shared: path.join(os.tmpdir(), 'nx38-lid.json'), hasRule: () => false, onExpire: () => { expired++; cfg = { ...cfg, keepAwake: false, until: null }; } });
  let st = await aw.apply();
  assert.ok(expired === 1 && !st.on, 'time is up: it lets go');
  cfg = { keepAwake: true, batteryFloor: 20 }; st = await aw.apply();
  assert.ok(!st.on && /under 20%/.test(st.short), 'below the battery floor it can sleep');
  cfg = { keepAwake: true, batteryFloor: 0 }; st = await aw.apply();
  assert.ok(st.on && st.truth.ours && st.truth.holders.includes('Spotify'), 'battery floor "never": stays awake, confirmed by macOS');
  st = await aw.status(); assert.ok(st.on);
  st = await aw.reset(); assert.ok(st.on);
  const set = read('renderer/settings.js');
  assert.ok(set.includes('data-awmode') && set.includes('data-awfor') && set.includes('data-awfloor') && set.includes('id="awReset"') && set.includes('aw-truth'));
  assert.ok(read('main.js').includes("awake ? await awake.status() : {}")); 
  ok('keep awake: Off / Awake / Awake + screen on, for a while, battery floor, Reset; looking no longer re-applies (same module in Apoji Admin)');

  // ---------- Windows fixes
  const { SCRIPTS } = require('../src/winhelper');
  assert.ok(!SCRIPTS.SELWATCH.includes('SetWindowsHookEx') && SCRIPTS.SELWATCH.includes('GetAsyncKeyState') && SCRIPTS.SELWATCH.includes('GetSystemMetrics(23)'));
  assert.ok(read('src/winhelper.js').includes('was.why?.()') && read('src/winhelper.js').includes('Confidence -ge 0.42'));
  const vc = read('renderer/voicecap.js');
  assert.ok(vc.includes("Windows Settings → Privacy & security → Microphone") && !/WIN[^\n]*System Settings → Sound/.test(vc));
  assert.ok(read('src/voice.js').includes('whisper-large-v3-turbo') && set.includes("['groq', 'Groq Whisper (your own free key)']") && set.includes('id="micTest"'));
  ok('Windows: highlight orb without a mouse hook (and the real error if it stops), Groq Whisper, Windows wording, a microphone test');

  // ---------- small fixes
  assert.ok(read('renderer/hud.css').includes('.set-hits[hidden] { display: none !important; }') && set.includes("$('tabs').addEventListener('click', e => { if (e.target.closest('[data-tab]') && $('setSearch').value)"));
  assert.ok(read('docs/index.html').includes('.steps[hidden] { display: none; }'));
  ok('settings search clears its suggestions; Home page shows one set of install steps');

  // ---------- N28C search chips
  const { trailOf } = require('../src/companion');
  const t = trailOf([{ tool: 'web_search', detail: 'moon distance', status: 'done' }, { tool: 'fetch_url', detail: 'nasa.gov', status: 'error', summary: 'timed out' }, { tool: 'open_app', detail: 'Safari' }]);
  assert.deepStrictEqual(t.map(x => x.k + ':' + x.ok), ['search:true', 'read:false', 'device:true']);   // 3.13: every action gets a chip
  assert.ok(read('docs/companion/app.js').includes('trailHtml(m.trail)') && read('src/relay.js').includes('trail: r.trail'));
  ok('N28C shows 🔍 / 📄 chips for what an answer searched and read');

  // ---------- training data
  const { createTraining, scrub } = require('../src/training');
  const s = scrub('mail me at lucas@example.com or 555-123-4567, key sk-abcdefghijklmnopqrstuv, card 4111 1111 1111 1111, https://x.com/a?token=zz, my password is hunter2');
  assert.ok(!/lucas@|555-123|sk-abc|4111|token=|hunter2/.test(s), s);
  const writes = [];
  const tr = createTraining({ cloud: { session: {}, rpc: async fn => fn === 'training_my_status' ? { on: true, tester: true, examples: 0 } : { ok: true }, write: async (m, p, b) => { writes.push([m, p, b]); } }, source: 'windows' });
  await tr.refresh();
  const ref = await tr.record({ prompt: 'What is my email lucas@example.com for?', answer: 'It is for sign-in.', agent: 'flash', convId: 'c1' });
  assert.ok(ref && writes[0][1] === 'training_examples' && !writes[0][2].prompt.includes('lucas@') && writes[0][2].source === 'windows');
  assert.strictEqual(await tr.record({ prompt: 'secret stuff', answer: 'ok', incognito: true }), null);
  assert.strictEqual(await tr.record({ prompt: 'axiom stuff', answer: 'ok', apex: true }), null);
  await tr.rate(ref, 1); assert.ok(writes.at(-1)[0] === 'PATCH' && writes.at(-1)[2].rating === 1);
  const tr2 = createTraining({ cloud: { session: {}, rpc: async () => ({ on: false, tester: true }) } }); await tr2.refresh();
  assert.ok(tr2.betaGate({ beta: true }) && !tr2.betaGate({ beta: true, admin: 'admin' }));
  const main = read('main.js');
  assert.ok(main.includes('const gated = training.betaGate(acc)') && main.includes('r.trainRef = await Promise.race') && read('renderer/chatview.js').includes('opts.onRate && !m.error'));
  assert.ok(set.includes('Share my chats') && set.includes('Delete everything I shared') && set.includes('Beta testers always share their chats'));   // 3.10: moved to Settings → Training
  const tj = read('docs/try/try.js');
  assert.ok(tj.includes("source: 'test_run'") && tj.includes('S.trainingNeeded') && tj.includes('data-rate'));
  ok('training data: beta testers must agree (beta features pause until they do), personal details stripped, never incognito or Axiom, 👍 / 👎 / ✏️, delete it all');

  // ---------- testing, active on, pictures, temporary passwords
  assert.ok(main.includes("ipcMain.handle('tests:list'") && main.includes("test_results?on_conflict=item_id,user_id") && set.includes('🧪 Needs testing'));
  assert.ok(main.includes("cloud.rpc('presence_ping'") && tj.includes("p_surface: 'test_run'") && read('docs/companion/app.js').includes("p_surface: 'phone'"));
  assert.ok(main.includes('attachFeedbackPictures') && read('src/cloud.js').includes('storage/v1/object/feedback-files/') && read('renderer/index.html').includes('📷 Screenshot of Nexus'));
  assert.ok(read('src/cloud.js').includes('must_change_password: false') && set.includes('🔑 Pick a new password') && tj.includes('mustChangePassword') && read('docs/companion/app.js').includes('newPasswordSheet'));
  ok('needs-testing checklist, "active on" pings, screenshots on bug reports, and temporary passwords');

  // ---------- database update
  const sql = read('supabase/nexus-v3.8.sql');
  for (const x of ['user_presence', 'presence_ping', 'got_app', 'feedback-files', 'admin_permissions', 'admin_perm_requests', 'admin_perm_approvers', 'admin_has_perm', 'typing_send', 'test_items', 'test_results', 'training_consent', 'training_examples', 'admin_training_stats', 'training_delete_mine'])
    assert.ok(sql.includes(x), x);
  ok('nexus-v3.8.sql has everything (tested on Postgres 16)');

  // ---------- release
  const pkg = require('../package.json'), ch = JSON.parse(read('docs/whats-new/changes.json'));
  const e38 = ch.find(x => x.version === '3.8.0'); assert.ok(e38 && pkg.version.localeCompare('3.8.0', undefined, { numeric: true }) >= 0);
  assert.ok(!/axiom|apex|cage/i.test(JSON.stringify(e38)));
  ok('release notes (no Axiom)');
  console.log(`v3.8: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
