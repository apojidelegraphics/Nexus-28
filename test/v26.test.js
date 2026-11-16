// v2.6 tests: Axiom phase 3 (Operations with AI-use budgets, Sentinel, Rollback), new providers, the ☰ menu.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tmp = name => path.join(os.tmpdir(), name + '-' + Date.now() + Math.random().toString(36).slice(2) + '.json');

(async () => {
  // ---------- Operations
  const { Operations, parseOp } = require('../src/operations');
  let now = Date.parse('2026-11-16T09:00:00'), allowed = { ok: true }, thinks = [], notes = [];
  let reply = () => ({ ok: true, text: 'Checked 3 stores.\n```nexus-op\n{"progress":"Air is $999 everywhere","notes":"Apple 999, BestBuy 999, Amazon 979 (sale ends Fri)","report":"","done":false,"nextInMinutes":null}\n```' });
  const O = new Operations({ file: tmp('ops'), now: () => now, think: async (p, o) => { thinks.push({ p, o }); now += 20e3; return reply(p); }, allowed: async () => allowed, notify: (t, b, m) => notes.push([t, b, m]),
    gather: async s => ({ text: s.page }), track: t => notes.push(['track', t.title]), draft: async (t, x) => notes.push(['draft', t]) });
  assert.throws(() => O.addOperation({ goal: '' }), /What should/);
  const op = O.addOperation({ title: 'MacBook price', goal: 'Track the M5 MacBook Air price and tell me the best week to buy', every: 5, maxRuns: 3, days: 7 });
  assert.strictEqual(op.every, 30, 'never more often than every 30 minutes');
  assert.strictEqual(await O.tick(), null, 'first step waits a minute');
  now += 61e3; let r = await O.tick();
  assert.strictEqual(r.progress, 'Air is $999 everywhere'); assert.ok(thinks[0].o.tools && thinks[0].o.kind === 'operation' && thinks[0].p.includes('cannot change anything'));
  assert.ok(O.find(op.id).notes.includes('Amazon 979'));
  now = O.find(op.id).nextAt + 1; thinks = [];
  reply = () => ({ ok: true, text: '```nexus-op\n{"progress":"Amazon dropped to $949","notes":"buy now","report":"Amazon has it for $949 until Friday. Buy this week.","done":true}\n```' });
  r = await O.tick(); assert.ok(r.done && O.find(op.id).status === 'done');
  assert.ok(thinks[0].p.includes('Your notes from last time') && thinks[0].p.includes('Amazon 979'), 'carries its notes between steps');
  assert.ok(notes.some(x => /Buy this week/.test(x[1]) && x[2].phone), 'report goes to Mac + phone');
  const op2 = O.addOperation({ goal: 'Quiz me', maxRuns: 2, every: 60 }); reply = () => ({ ok: true, text: '```nexus-op\n{"progress":"quizzed","notes":"n"}\n```' });
  for (let i = 0; i < 3; i++) { now = O.find(op2.id).nextAt + 1; await O.tick(); }
  assert.strictEqual(O.find(op2.id).status, 'done'); assert.match(O.find(op2.id).reason, /run budget/, 'stops at its step budget');
  const op3 = O.addOperation({ goal: 'x' }); now += 120e3; allowed = { ok: false, reason: 'Paused: fewer than 10 Axiom minutes left this week.' };
  r = await O.tick(); assert.ok(r.paused && O.find(op3.id).status === 'paused' && /10 Axiom minutes/.test(O.find(op3.id).reason), 'pauses when Axiom minutes run low');
  allowed = { ok: true }; O.set(op3.id, { status: 'active' }); assert.strictEqual(O.find(op3.id).status, 'active');
  assert.strictEqual(parseOp('{"progress":"x","done":true}').done, true);
  ok('Operations: budget (30 min minimum, step limit, end date), notes between steps, reports, pause on low minutes, read-only');

  // ---------- Sentinel
  thinks = []; notes = [];
  assert.throws(() => O.addSentinel({ source: 'url', url: 'nope', condition: 'x' }), /web page address/);
  const sn = O.addSentinel({ source: 'url', url: 'https://example.com/price', condition: 'Price under $900', every: 60, actions: { phone: true, threat: true, draft: true } });
  sn.page = 'Price: $999'; O.remove(op3.id); O.find(op2.id).status = 'done';
  reply = () => ({ ok: true, text: '{"triggered":false,"why":"still $999"}' });
  now = sn.nextAt + 1; await O.tick(); assert.strictEqual(thinks.length, 1);
  now = O.find(sn.id).nextAt + 1; r = await O.tick(); assert.ok(r.unchanged && thinks.length === 1, 'unchanged page: no AI call');
  O.find(sn.id).page = 'Price: $879'; reply = () => ({ ok: true, text: '{"triggered":true,"why":"now $879","message":"It dropped to $879.","draft":"Buy it.","threat":{"title":"Sale ends Friday","level":"amber"}}' });
  now = O.find(sn.id).nextAt + 1; r = await O.tick();
  assert.ok(r.triggered && thinks.length === 2 && notes.some(x => x[0].includes('Sentinel')) && notes.some(x => x[0] === 'track') && notes.some(x => x[0] === 'draft'));
  assert.strictEqual(O.find(sn.id).fired, 1); assert.ok(!('lastHash' in O.state().sentinels[0]), 'internal fingerprints stay inside');
  ok('Sentinel: only thinks when something changed, strict trigger, notify + phone, Threat Board, draft');

  // ---------- Rollback
  const { Rollback } = require('../src/rollback');
  let vol = { level: 30, muted: false }, dark = false, clip = 'my notes', helperCalls = [];
  const rb = new Rollback({ file: tmp('rb'), now: () => now, getVolume: async () => ({ ...vol }), setVolume: async (l, m) => { vol = { level: l, muted: m }; }, getDark: async () => dark, setDark: async v => { dark = v; },
    clipboard: { readText: () => clip, writeText: t => { clip = t; } }, helper: { available: () => true, request: async m => { helperCalls.push(m); return { data: { deleted: true } }; } } });
  const t0 = now;
  let p = await rb.before('set_volume'); vol = { level: 80, muted: false }; rb.after('set_volume', { level: 80 }, {}, p, { persona: 'axiom' });
  p = await rb.before('dark_mode'); dark = true; rb.after('dark_mode', { on: true }, {}, p);
  p = await rb.before('copy_to_clipboard'); clip = 'overwritten'; rb.after('copy_to_clipboard', { text: 'overwritten' }, {}, p);
  rb.after('reminders_create', { title: 'Call mom' }, { undo: { cmd: 'rem_delete', itemId: 'X1', what: 'reminder' } });
  rb.after('open_url', { url: 'https://x.co' }, {});
  assert.strictEqual(rb.after('web_search', {}, {}), null, 'reading things is not logged');
  now += 1000; const u = await rb.undoSince(t0);
  assert.deepStrictEqual([vol.level, dark, clip], [30, false, 'my notes'], 'volume, dark mode and clipboard put back');
  assert.deepStrictEqual(helperCalls[0], { id: helperCalls[0].id, cmd: 'rem_delete', eventId: undefined, itemId: 'X1' });
  assert.strictEqual(u.done.length, 4); assert.strictEqual(u.skipped[0].label, 'Opened a link', 'non-undoable actions are listed, not faked');
  assert.ok((await rb.undoOne(rb.entries()[1].id)).already, 'undo twice is harmless');
  ok('Rollback: volume, dark mode, clipboard, reminders/events undone newest first; links logged as not undoable');

  // ---------- wiring + providers + menu
  const main = read('main.js'), tools = require('../src/tools'), prov = require('../src/providers').PROVIDERS;
  assert.ok(main.includes("['start_operation', 'set_sentinel', 'undo_recent_actions']") && main.includes('rollback.before(name') && main.includes("confirm: async () => false") && main.includes("apexKind: 'operation'"));
  for (const t of ['start_operation', 'set_sentinel', 'undo_recent_actions']) assert.ok(tools.needsConfirm(t), t + ' asks you first');
  assert.ok(!tools.buildToolset({ agentic: true, settings: { apple: {}, web: {}, macActions: {} }, helperBuilt: true, platform: 'darwin' }).labels.includes('start_operation'), 'only Axiom gets them');
  const sw = read('native/NexusCore.swift'); assert.ok(sw.includes('case "rem_delete"') && sw.includes('data["id"] = ev.eventIdentifier'));
  for (const id of ['groq', 'mistral', 'xai', 'together', 'fireworks', 'cerebras', 'perplexity', 'cohere']) assert.ok(prov[id] && prov[id].kind === 'openai' && /^https:\/\//.test(prov[id].base) && prov[id].keyUrl, id);
  assert.ok(prov.perplexity.noTools, 'Perplexity has no tool calling');
  assert.ok(read('supabase/nexus-v2.6.sql').includes("'groq', 'mistral', 'xai', 'together', 'fireworks', 'cerebras', 'perplexity', 'cohere'"));
  const html = read('renderer/index.html'), hud = read('renderer/hud.js'), set = read('renderer/settings.js');
  assert.ok(html.includes('id="barMenuBtn"') && html.includes('id="actMenu"') && html.includes('id="menuDue"') && hud.includes('function toggleActMenu'));
  for (const a of ['mission', 'huddle', 'debate', 'watch', 'write', 'meeting', 'routines', 'focus', 'study']) assert.ok(new RegExp(`id="actMenu"[\\s\\S]*data-act="${a}"`).test(html), a + ' in the menu');
  assert.ok(set.includes('Get a key') && set.includes('↶ Rollback') && set.includes('⚙ Operations') && set.includes('⚑ Sentinel'));
  const changes = JSON.parse(read('docs/whats-new/changes.json')); assert.strictEqual(changes[0].version, require('../package.json').version);
  assert.ok(!/axiom|apex|operation|sentinel/i.test(JSON.stringify(changes[0])), 'Axiom-only features stay out of public notes');
  ok('wired: Axiom-only tools that ask first, Rollback on every tool, 8 new providers with key links, ☰ menu, Settings cards');
  console.log(`v2.6: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
