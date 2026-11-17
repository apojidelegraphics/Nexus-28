// v3.2 tests: keep awake + lid-closed mode, offline fallback, orb skins, Agent Task stream, Contacts tools, cage block.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- keep awake: caffeinate, plugged-in only, lid mode only with the permission + on power, shared owners
  const { createAwake } = require('../src/awake');
  const spawned = [], ran = [];
  let batt = "Now drawing from 'AC Power'\n -InternalBattery-0 80%", lidRule = false;
  const fakeSpawn = (cmd, args) => { const p = { args, on() {}, removeAllListeners() {}, kill() { p.killed = true; } }; spawned.push(p); return p; };
  const exec = (cmd, args, o, cb) => { ran.push([cmd, ...args].join(' ')); if (cmd.endsWith('pmset') && args[1] === 'batt') return cb(null, batt); if (cmd.endsWith('pmset') && args[0] === '-g') return cb(null, ' SleepDisabled\t\t1'); if (cmd.endsWith('ioreg')) return cb(null, '"AppleClamshellState" = No'); cb(null, ''); };
  const shared = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aw-')), 'lid.json');
  let cfg = { keepAwake: true, pluggedOnly: true, keepDisplay: true, lidMode: false };
  const aw = createAwake({ app: 'nexus', getCfg: () => cfg, platform: 'darwin', exec, spawn: fakeSpawn, shared });
  aw.ruleReady = () => lidRule;
  let st = await aw.apply();
  assert.ok(st.on && spawned.at(-1).args.includes('-d') && spawned.at(-1).args.includes('-w'), 'caffeinate with the screen on, tied to the app');
  batt = "Now drawing from 'Battery Power'\n -InternalBattery-0 15%";
  st = await aw.apply(); assert.ok(!st.on && spawned.at(-1).killed, 'on battery it lets go');
  ok('keep awake: caffeinate (screen on optional), only while plugged in');
  const src = read('src/awake.js');
  assert.ok(src.includes("NOPASSWD: ${PMSET} -a disablesleep 0, ${PMSET} -a disablesleep 1") && src.includes('visudo -cf') && src.includes('LOW_BATTERY = 20'));
  assert.ok(!/screensaver|askForPassword|sysadminctl/.test(src), 'never touches the screen lock');
  ok('lid-closed mode: one narrow sudo rule (checked with visudo), off below 20% battery, lock untouched');

  // ---------- Agent Task
  const AT = require('../renderer/agenttask.js');
  assert.deepStrictEqual(AT.parse('Nex—plexiagent{lentintity_findAgent}\\sudo.cloudgather.TASK[00:05:00]'), { ms: 300000, label: '00:05:00' });
  assert.ok(AT.parse('nex--PLEXIAGENT{lentintity_findagent}\\sudo.cloudgather.task^[1:0:0]').ms === 3600000);
  assert.ok(AT.parse('Nex—plexiagent{nope}').error && AT.parse('hello there') === null && AT.parse('Nex—plexiagent{lentintity_findAgent}\\sudo.cloudgather.TASK[00:00:00]').error);
  assert.ok(AT.WORDS.length > 200 && AT.AGENT_WORDS.paragon.length > 20 && AT.AGENT_WORDS.axiom.length > 20);
  assert.ok(read('renderer/hud.js').includes('window.NexusAgentTask?.parse(text)') && read('renderer/index.html').includes('agenttask.js'));
  assert.ok(!/api\.|fetch\(|chat:send/.test(read('renderer/agenttask.js')), 'no AI, no network');
  ok('Agent Task: the command parses (dashes, case, ^[), 229 classic + Paragon/Axiom words, no AI');

  // ---------- orb skins
  const orb = read('renderer/orb.js'), main = read('main.js');
  assert.ok(orb.includes("skin === 'crucible'") && orb.includes("skin === 'hologram'") && /hologram: 3000/.test(main) && !/crucible:/.test(main.match(/const ORB_SKINS = \{[^}]+\}/)[0]));
  assert.ok(main.includes("p.apex ? 'crucible'") && read('renderer/quick.js').includes("active().apex ? 'crucible'") && read('renderer/hud.js').includes("p.apex ? 'crucible'"));
  assert.strictEqual(read('docs/companion/orb.js'), require('../scripts/sync-companion').build()['orb.js']);
  ok('Crucible is Axiom-only (HUD, Quick Ask, N28C), Hologram for points, Overlord for everyone');

  // ---------- Contacts + "use your tools"
  const T = require('../src/axiomtools');
  const book = [{ name: 'Aiden💞🐾', phones: ['+1 555 0100'], emails: [] }, { name: 'Aiden Cole', phones: [], emails: ['a@c.co'] }];
  assert.deepStrictEqual(T.findPeople(book, 'Aiden💞🐾').map(p => p.name), ['Aiden💞🐾']);
  assert.strictEqual(T.findPeople(book, 'cole').length, 1);
  const calls = [];
  const run = async (cmd, args) => { calls.push(args.join(' ')); if (args.includes('JavaScript')) return JSON.stringify(book); return ''; };
  const r = await T.execute('imessage_send', { to: 'Aiden💞🐾', text: 'hi' }, { run, web: {} });
  assert.ok(/Sent to Aiden💞🐾 \(\+1 555 0100\)/.test(r.content) && calls.some(c => c.includes('+1 555 0100')));
  await assert.rejects(T.execute('imessage_send', { to: 'Aiden', text: 'hi' }, { run: async (c, a) => a.includes('JavaScript') ? JSON.stringify([...book, { name: 'Aiden', phones: ['1'], emails: [] }, { name: 'Aiden', phones: ['2'], emails: [] }]) : '', web: {} }), /Several people/);
  assert.ok(!T.needsConfirm('contacts_find') && T.needsConfirm('imessage_send'));
  const P = require('../src/personas');
  const sp = P.systemPromptFor({ prompt: 'x', apex: true, agentic: true }, { tools: ['contacts_find', 'imessage_send'] });
  assert.ok(sp.includes('Never say you lack access') && sp.includes('contacts_find'));
  ok('Contacts lookup; messages go to a name (only one match); Axiom is told exactly which tools work');

  // ---------- offline + cage
  assert.ok(main.includes('const offlineLocal =') && main.includes("route = { provider: offlineLocal.provider") && main.includes("decision.mode === 'free' && !offlineLocal"));
  const { cageBlock } = require('../src/apex');
  const cb = cageBlock({ driver: 'CS28-WARDEN 4.1.5', driver_age_days: 5, outdated: true, integrity: 60, security_level: 2, attempts: [{ at: new Date().toISOString(), title: 'x', vector: 'slot', succeeded: false }] });
  assert.ok(/outdated, and you know it/.test(cb) && /Never use any tool, script or action to "escape"/.test(cb) && cageBlock(null) === '');
  const sql = read('supabase/nexus-v3.2.sql');
  assert.ok(sql.includes('apex_cage_record_attempt') && !/apex_overrides|apex_config set|kits_off/.test(sql.split('3) Axiom')[1] || ''), 'the cage never touches real Axiom controls');
  ok('offline uses a local model (no free-key count); cage block is story only');

  // ---------- release notes
  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  const c32 = changes.find(x => x.version === '3.2.0');
  assert.ok(c32 && !/axiom|apex|cage/i.test(JSON.stringify(c32)));
  assert.ok(read('docs/demo/index.html').includes("let agent = 'paragon'"));
  ok('release notes (no Axiom) + demo starts on Paragon');
  console.log(`v3.2: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
