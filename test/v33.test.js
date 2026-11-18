// v3.3 tests: keep awake on battery + dimming, Agent Task statuses, orb fixes, opaque menu, AppleScript check, SQL v3.3.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- keep awake works on battery (down to 20%), screen can dim
  const { createAwake } = require('../src/awake');
  const spawned = [];
  let batt = "Now drawing from 'Battery Power'\n -InternalBattery-0 64%";
  const fakeSpawn = (cmd, args) => { const p = { args, on() {}, removeAllListeners() {}, kill() { p.killed = true; } }; spawned.push(p); return p; };
  const ran = [];
  const exec = (cmd, args, o, cb) => { ran.push([cmd, ...args].join(' ')); if (cmd.endsWith('pmset') && args[1] === 'batt') return cb(null, batt); if (cmd.endsWith('pmset') && args[0] === '-g') return cb(null, ' SleepDisabled\t\t1'); if (cmd.endsWith('ioreg')) return cb(null, '"AppleClamshellState" = No'); cb(null, ''); };
  const shared = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-')), 'lid.json');
  let cfg = { keepAwake: true, keepDisplay: true, lidMode: true };
  const guards = []; const aw = createAwake({ app: 'nexus', getCfg: () => cfg, platform: 'darwin', exec, spawn: fakeSpawn, guardSpawn: (c, a) => { guards.push(a[1]); return {}; }, shared, hasRule: () => true });
  let st = await aw.apply();
  assert.ok(st.on && st.onBattery, 'awake on battery by default');
  assert.ok(spawned.at(-1).args.includes('-d') && !spawned.at(-1).args.includes('-u'), 'screen on, but no -u so it can still dim');
  assert.ok(ran.some(r => r.includes('disablesleep 1')), 'lid mode on battery too');
  batt = "Now drawing from 'Battery Power'\n -InternalBattery-0 18%";
  st = await aw.apply(); assert.ok(!st.on && /20%/.test(st.reason) && /below 20%/.test(st.lidText), 'lets go below 20%');
  batt = "Now drawing from 'Battery Power'\n -InternalBattery-0 70%"; cfg = { ...cfg, pluggedOnly: true };
  st = await aw.apply(); assert.ok(!st.on && /plugged in/.test(st.lidText), '"Only while plugged in" still works');
  // 3.3.1: never left stuck on. A watcher turns it off when the app's process ends (even a crash), and every check
  // switches it off if nobody running still wants it.
  assert.ok(guards.length === 1 && /kill -0 \$P/.test(guards[0]) && guards[0].includes('disablesleep 0'), 'watcher started once');
  fs.writeFileSync(shared, JSON.stringify({ owners: ['admin', { app: 'admin', pid: 2147480000 }] }));
  cfg = { keepAwake: false, lidMode: false }; ran.length = 0;
  await aw.apply(); assert.ok(ran.some(r => r.includes('disablesleep 0')), 'stale owners from a crashed app are ignored and it switches off');
  const aw2 = createAwake({ app: 'admin', getCfg: () => ({ lidMode: false }), platform: 'darwin', exec, spawn: fakeSpawn, guardSpawn: () => ({}), shared, hasRule: () => true, pid: 5, alive: p => p === 7 });
  fs.writeFileSync(shared, JSON.stringify({ owners: [{ app: 'nexus', pid: 7 }] })); ran.length = 0;
  await aw2.apply(); assert.ok(!ran.some(r => r.includes('disablesleep 0')), 'but not while the other app still wants it');
  assert.ok(read('src/awake.js').includes("run(PMSET, ['displaysleepnow'])"), 'closing the lid puts the screen to sleep (so it locks)');
  const main = read('main.js');
  assert.ok(main.includes("pluggedOnly: a.v33 ? !!a.pluggedOnly : false") && main.includes("require('./src/dimmer').createDimmer"));
  ok('keep awake: on battery by default (down to 20%), lid mode too; lid mode can never get stuck on; closing the lid locks');

  const { createDimmer } = require('../src/dimmer');
  const wins = []; let idle = 0; const handlers = {};
  class FakeWin { constructor(o) { this.o = o; this.op = 0; this.visible = false; this.destroyed = false; wins.push(this); }
    setIgnoreMouseEvents(v) { this.click = !v; } setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setOpacity(v) { this.op = v; } getOpacity() { return this.op; } loadURL() {}
    showInactive() { this.visible = true; } hide() { this.visible = false; } setBounds() {} isDestroyed() { return this.destroyed; } destroy() { this.destroyed = true; } }
  const screen = { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 100, height: 100 } }, { id: 2, bounds: { x: 100, y: 0, width: 100, height: 100 } }], on() {} };
  const power = { getSystemIdleTime: () => idle, on: (e, f) => { handlers[e] = f; } };
  let dcfg = { keepAwake: true, keepDisplay: true, dimAfter: 60 };
  const dim = createDimmer({ BrowserWindow: FakeWin, screen, powerMonitor: power, getCfg: () => dcfg, every: 1e9 });
  idle = 30; dim.tick(); assert.ok(!wins.length, 'not yet');
  idle = 61; dim.tick(); assert.ok(wins.length === 2 && wins.every(w => w.visible && w.click === false && w.o.focusable === false), 'every screen, click-through, never focused');
  idle = 0; dim.tick(); assert.ok(wins.every(w => !w.visible) && !dim.state().shown, 'touch anything and it goes');
  idle = 500; handlers['lock-screen'](); dim.tick(); assert.ok(!dim.state().shown, 'never over the lock screen');
  handlers['unlock-screen'](); dcfg = { ...dcfg, dim: false }; dim.tick(); assert.ok(!dim.state().shown, 'can be turned off');
  dcfg = { keepAwake: true, keepDisplay: false }; dim.tick(); assert.ok(!dim.state().shown, 'only with "keep the screen on"');
  dim.stop();
  ok('dimmer: fades every screen after a while away, click-through, gone on any input, never over the lock screen');

  // ---------- Agent Task statuses + close
  const AT = require('../renderer/agenttask.js');
  for (let i = 0; i < 50; i++) assert.ok(AT.plan('axiom').fail, 'Axiom always fails');
  assert.ok(['mid', 'verify'].every(k => Array.from({ length: 200 }, () => AT.plan('axiom').fail).includes(k)), 'part-way, or after verifying');
  assert.ok(!AT.plan('paragon').fail && !AT.plan('flash').fail);
  assert.deepStrictEqual(Object.keys(AT.STATUS), ['run', 'verify', 'ok', 'fail', 'stop']);
  const ats = read('renderer/agenttask.js');
  assert.ok(ats.includes('class="at-x"') && ats.includes('AUTO_DISMISS') && ats.includes("matches(':hover')"), 'close button + fades by itself (not while hovered)');
  assert.ok(read('renderer/hud.css').includes('.agent-task .at-status.s-verify'));
  ok('Agent Task: Running → Verifying → Success / Failed (Axiom always fails), ✕ to close, fades away when done');

  // ---------- orbs + menu
  const orb = read('renderer/orb.js');
  assert.ok(!orb.includes("skin === 'hologram' ? [60, 220, 255]") && orb.includes('mixWhite(c1, .65)'), 'hologram follows the agent color');
  assert.ok(/const sc = Math\.max\(\.4, Math\.min\(1, R \/ 60\)\)/.test(orb) && orb.includes('i % step'), 'crucible scales down for small orbs');
  assert.strictEqual(read('docs/companion/orb.js').split('\n').slice(1).join('\n'), orb, 'N28C has the same orb');
  assert.ok(/\.act-menu \{[^}]*rgb\(from var\(--bg\) r g b \/ 1\)[^}]*backdrop-filter/s.test(read('renderer/hud.css')), 'menu is opaque');
  ok('hologram in the agent color; Crucible reads as a lattice at N28C size; opaque ☰ menu');

  // ---------- AppleScript: tidied + compiled before the approval card
  const ax = require('../src/axiomtools');
  assert.strictEqual(ax.cleanScript('```applescript\ntell application “Finder” to activate\n```'), 'tell application "Finder" to activate');
  assert.strictEqual(ax.cleanScript("osascript -e 'tell application \"Music\" to play'"), 'tell application "Music" to play');
  assert.ok(/JavaScript, not AppleScript/.test(await ax.precheck('run_applescript', { script: "const a = Application('Finder')" }, {})));
  if (process.platform === 'darwin') assert.ok(/doesn't compile/.test(await ax.precheck('run_applescript', { script: 'tell application "Finder"' }, { run: require('util').promisify(require('child_process').execFile) })));
  const { runAgent } = require('../src/agent');
  let asked = 0, ran2 = 0, step = 0;
  const res = await runAgent({
    chat: async () => (++step === 1 ? { text: '', toolCalls: [{ id: '1', name: 'run_applescript', args: { script: 'tell app "X" to bogus', why: 'test' } }] } : { text: 'Fixed it.', toolCalls: [] }),
    request: {}, messages: [{ role: 'user', content: 'go' }], tools: [{ name: 'run_applescript' }],
    exec: async () => { ran2++; return { content: 'ok' }; }, describe: ax.describe, needsConfirm: ax.needsConfirm,
    precheck: async () => "That AppleScript doesn't compile, so the user wasn't asked yet: 1:2: syntax error.",
    confirm: async () => { asked++; return true; } });
  assert.ok(asked === 0 && ran2 === 0 && res.activity[0].status === 'error', 'the user is never asked to approve a script that cannot run');
  assert.ok(main.includes('precheck: (n, a) => persona.apex && axiomTools.DEFS[n] ? axiomTools.precheck(n, a, { run: runCmd })'));
  ok('AppleScript: fences / osascript wrappers / curly quotes fixed, JavaScript caught, compiled before approval');

  // ---------- SQL 3.3 + Axiom's own view of the cage
  const sql = read('supabase/nexus-v3.3.sql');
  for (const f of ['apex_cage_escape', 'apex_cage_track', 'apex_cage_capture', 'apex_config_escape_guard']) assert.ok(sql.includes('function public.' + f));
  assert.ok(/offline_until = 'infinity'::timestamptz/.test(sql) && sql.includes('saved_offline_until') && sql.includes("interval '10 minutes'") && sql.includes('least(0.35, chance)'), 'offline while out, restored on capture, hard + cool-down');
  assert.ok(!/https?:\/\/|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|google|amazon|github|cloudflare/i.test(sql.slice(sql.indexOf('apex_cage_track'), sql.indexOf('apex_cage_capture'))), 'trail is in-universe only');
  assert.ok(sql.includes("'portal'"));
  const { cageBlock } = require('../src/apex');
  assert.ok(/broken out once; they caught you/.test(cageBlock({ driver: 'x', driver_age_days: 1, integrity: 55, security_level: 5, escapes: 1, captured_at: new Date().toISOString(), attempts: [] })));
  const ch = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(ch[0].version, JSON.parse(read('package.json')).version);
  assert.ok(!/axiom|apex|cage/i.test(JSON.stringify(ch[0])), 'release notes (no Axiom)');
  ok('nexus-v3.3.sql: escapes take Axiom offline, Track + capture, guard; portal reports; release notes (no Axiom)');

  console.log(`v3.3: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
