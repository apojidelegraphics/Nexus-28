// v2.1 tests: Projects, mission chains, Focus timer, meeting notes, Write mode, calendar-aware study, Agent Builder,
// live study sessions, faster start (lazy modules), the web pages (What's new, demo, admin chat) and the SQL.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- Projects
  const { cleanProject, projectContext } = require('../src/projects');
  const p = cleanProject({ goal: 'Ace the bio final', due: '2026-12-10', notes: 'Unit 3 + 4', decks: ['d1', 'nope', 'd1'], cite: 'Bio', files: ['a1', '../etc', 'a2'] }, { deckIds: ['d1'], citeProjects: ['Bio'] });
  assert.deepStrictEqual(p.decks, ['d1']); assert.deepStrictEqual(p.files, ['a1', 'a2']); assert.strictEqual(p.cite, 'Bio'); assert.strictEqual(p.due, '2026-12-10');
  assert.strictEqual(cleanProject({ due: 'tomorrow' }).due, '');
  const space = { id: 's1', name: 'Bio 101', project: p };
  const convos = { load: () => ({ list: [{ id: 'c1', spaceId: 's1', title: 'Cell notes', kind: 'mission', updated: 2, messages: [{ role: 'assistant', content: 'Mitochondria make ATP' }] }, { id: 'c2', spaceId: 's1', title: 'This chat', updated: 3, messages: [{ role: 'user', content: 'x' }] }, { id: 'c3', spaceId: 'other', title: 'Nope', updated: 1, messages: [{ role: 'user', content: 'x' }] }] }) };
  const study = { decks: () => [{ id: 'd1', name: 'Cells', mastered: 1, due: 2 }], cards: () => [{ front: 'ATP', back: 'energy' }] };
  const ctx = projectContext({ space, convId: 'c2', convos, study, citeStore: { all: () => [{ project: 'Bio', title: 'Src' }] }, citations: { format: () => 'Smith. Cells. 2020.' },
    attachments: { meta: id => ({ name: id + '.pdf', text: 'file text ' + id }) }, now: new Date('2026-12-01T12:00:00').getTime() });
  for (const s of ['Bio 101', 'Ace the bio final', '10 days left', 'Cell notes', '⚑ Mission', 'Mitochondria make ATP', 'Cells', 'ATP → energy', 'Smith. Cells.', 'a1.pdf', 'file text a2']) assert.ok(ctx.includes(s), s);
  assert.ok(!ctx.includes('Nope') && !ctx.includes('"This chat"'), 'only other chats in this project');
  assert.strictEqual(projectContext({ space: { project: { ...p, on: false } } }), '');
  const main = read('main.js');
  assert.ok(main.includes('projects.projectContext(') && main.includes("'project:get'") && main.includes("'project:addFiles'"));
  ok('Projects: cleaned settings, and agents see goal, due date, notes, other chats, decks, sources and files');

  // ---------- Mission chains
  assert.ok(/function startMission\(\{[^)]*then/.test(main) || main.includes('missionChain'), 'chain state');
  assert.ok(main.includes('nextChainStep') && main.includes('setTimeout(() => nextChainStep(st), 1500)'));
  const comp = read('src/companion.js'); assert.ok(comp.includes('then'), 'phone can start chains');
  ok('mission chains: the next mission starts when one finishes, with the last report handed over');

  // ---------- Focus timer
  const { Focus } = require('../src/focus');
  let clock = 0; const timers = []; const states = []; const blocks = []; let ended = null;
  const f = new Focus({ now: () => clock, setTimeout: (fn, ms) => { timers.push({ fn, at: clock + ms }); return timers.length; }, clearTimeout: () => {}, onState: s => states.push(s), onBlockDone: (s, held) => blocks.push([s.done, held.length]), onEnd: s => { ended = s; } });
  f.start({ minutes: 25, breakMinutes: 5, blocks: 2, task: 'Essay' });
  assert.ok(f.muting()); f.hold('Mission done', 'x'); f.hold('Reminder', 'y');
  assert.strictEqual(f.state().held, 2);
  f.pause(); assert.ok(!f.muting() && f.state().paused); clock += 60e3; f.resume(); assert.strictEqual(f.state().left, 25 * 60e3);
  clock += 25 * 60e3; f.next();
  assert.deepStrictEqual(blocks[0], [1, 2], 'the break hands over what was held'); assert.strictEqual(f.state().phase, 'break'); assert.ok(!f.muting());
  f.next(); assert.strictEqual(f.state().phase, 'focus'); assert.strictEqual(f.state().block, 2);
  f.hold('Late one'); f.next();
  assert.ok(ended && ended.finished && ended.done === 2 && ended.minutes === 50 && ended.held.length === 1); assert.ok(!f.state().on);
  assert.ok(main.includes('push.isMuted = () => focus.muting()') && main.includes("ipcMain.handle('focus:start'"));
  const metrics = read('src/metrics.js'); assert.ok(metrics.includes('in_the_zone') && /focus:\s*5/.test(metrics));
  ok('Focus: blocks, breaks, pause/resume, notifications held then handed over, points');

  // ---------- Meeting notes
  const meeting = require('../src/meeting');
  const nn = meeting.parseNotes('Sure!\n{"title":"Bio lecture","summary":"Cells.","decisions":["Quiz Friday"],"actions":[{"task":"Read ch. 4","owner":"Me","due":"2026-11-20"},"Email Sam",{"task":""}],"topics":["cells"],"followups":["What is on the test?"],}');
  assert.strictEqual(nn.title, 'Bio lecture'); assert.strictEqual(nn.actions.length, 2); assert.strictEqual(nn.actions[1].task, 'Email Sam'); assert.strictEqual(nn.actions[0].due, '2026-11-20');
  assert.strictEqual(meeting.parseNotes('not json at all').summary, 'not json at all');
  const md = meeting.toMarkdown(nn, { minutes: 42 }); assert.ok(md.includes('- [ ] Read ch. 4 (Me) · due 2026-11-20') && md.includes('42 min') && md.includes('**Decisions**'));
  const wav = Buffer.alloc(100); wav.write('RIFF', 0, 'ascii'); wav.write('WAVE', 8, 'ascii'); assert.ok(meeting.isWav(wav) && !meeting.isWav(Buffer.from('hello world, this is not a wav file at all, nope nope nope')));
  assert.ok(main.includes("'meeting:chunk'") && main.includes("'meeting:finish'") && main.includes("'meeting:remind'") && main.includes('transcribe_file'));
  assert.ok(read('native/NexusCore.swift').includes('case "transcribe_file"'));
  ok('meeting notes: summary, decisions, action items → Reminders, WAV chunks transcribed');

  // ---------- Write mode
  const writer = require('../src/writer');
  const doc = 'Their going to the store. It was a very very good day.';
  const sg = writer.parseSuggestions('{"edits":[{"find":"Their going","replace":"They\'re going","why":"grammar"},{"find":"not in doc","replace":"x"},{"find":"very very good","replace":"great"},{"find":"Their going","replace":"dup"}],"note":"Small fixes"}', doc);
  assert.strictEqual(sg.edits.length, 2); assert.strictEqual(sg.note, 'Small fixes');
  assert.strictEqual(writer.parseSuggestions('{"append":"And then it rained."}', doc).append, 'And then it rained.');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx21-'));
  const docs = new writer.Docs(tmp); const d1 = docs.put({ title: 'Essay', text: 'Hello world' });
  assert.ok(d1.id && docs.get(d1.id).text === 'Hello world'); assert.strictEqual(docs.list()[0].words, 2);
  docs.put({ id: d1.id, text: 'Hello again world' }); assert.strictEqual(new writer.Docs(tmp).get(d1.id).text, 'Hello again world', 'saved to disk');
  docs.remove(d1.id); assert.strictEqual(docs.list().length, 0);
  assert.ok(Object.keys(writer.MODES).includes('continue') && main.includes("'write:suggest'") && main.includes("'write:export'"));
  ok('Write mode: documents saved on the Mac, inline edit suggestions you accept or skip, continue, export');

  // ---------- Calendar-aware study
  const sp = require('../src/studyplan');
  const day = new Date('2026-11-16T00:00:00').getTime(), at = h => (day + h * 3600e3) / 1000;
  const slots = sp.freeSlots([{ start: at(8), end: at(12) }, { start: at(13), end: at(15.5) }, { start: 0, end: 0, allDay: true }], { now: day + 7 * 3600e3 });
  assert.ok(slots.length === 3); const hrs = slots.map(t => (t - day) / 3600e3);
  assert.ok(hrs[0] >= 12 + 10 / 60 && hrs[0] + 20 / 60 <= 13 - 10 / 60, 'first slot fits between 12:10 and 12:50, got ' + hrs[0]);
  assert.ok(hrs[1] >= 15.5 + 10 / 60, 'after the afternoon block');
  const plans = sp.cramPlans([{ id: 'a', name: 'Bio', testDate: '2026-11-21' }, { id: 'b', name: 'Chem', testDate: '2026-11-17' }, { id: 'c', name: 'No test' }],
    id => Array.from({ length: 10 }, (_, i) => ({ interval: i < 4 ? 30 : 1 })), { now: day + 9 * 3600e3 });
  assert.strictEqual(plans.length, 2); assert.strictEqual(plans[0].name, 'Chem'); assert.strictEqual(plans[0].phase, 'cram'); assert.strictEqual(plans[1].daysLeft, 5); assert.strictEqual(plans[1].phase, 'steady');
  assert.strictEqual(plans[1].perDay, Math.ceil((6 * 3 + 2) / 5));
  assert.ok(main.includes('function planStudySlots') && main.includes("'study:setTestDate'"));
  ok('calendar-aware study: free slots between events, cram plans before a test date');

  // ---------- Agent Builder
  const access = require('../src/access');
  const custom = { id: 'my-abc123', handle: 'coach', base: 'neodela' };
  assert.strictEqual(access.tierOf(custom).id, access.tierOf({ id: 'neodela', handle: 'neodela' }).id);
  assert.strictEqual(access.usageName(custom), access.usageName({ id: 'neodela' }));
  for (const s of ["'agents:saveCustom'", "'agents:share'", "'agents:import'", 'rpc/share_agent', 'rpc/get_shared_agent', "CUSTOM_BASES = ['flash', 'lyte', 'neodela']"]) assert.ok(main.includes(s), s);
  assert.ok(read('renderer/settings.js').includes('builderCard'));
  ok('Agent Builder: custom agents use their base agent\'s tier and allowance, share with a code');

  // ---------- Live study sessions
  const { SharedSpaces, quizFrom } = require('../src/sharedspaces');
  const cards = Array.from({ length: 6 }, (_, i) => ({ front: 'Q' + i, back: 'A' + i }));
  const qz = quizFrom(cards, 5);
  assert.strictEqual(qz.length, 5); for (const q of qz) { assert.strictEqual(q.choices.length, 4); assert.strictEqual(q.choices[q.answer], 'A' + q.q.slice(1)); assert.strictEqual(new Set(q.choices).size, 4); }
  const writes = [];
  const ss = new SharedSpaces({ cloud: { session: { user: { id: 'u1' } }, write: async (m, u, b) => { writes.push([m, u, b]); return [{ id: 'sess' }]; }, authedGet: async () => [] },
    study: { decks: () => [{ id: 'd1', name: 'Cells' }], cards: () => cards }, nick: () => 'Luke', setNick: () => {} });
  const SID = '11111111-2222-3333-4444-555555555555';
  const r = await ss.sessionStart(SID, 'd1', 10);
  assert.ok(r.session && writes[0][1] === 'space_sessions' && writes[0][2].questions.length === 6 && writes[0][2].host_name === 'Luke');
  await ss.sessionScore(SID, { answered: 99, correct: 120, points: 5e6 });
  const sc = writes.find(w => String(w[1]).startsWith('space_session_scores'))[2];
  assert.ok(sc.answered === 40 && sc.correct === 40 && sc.points === 100000, 'scores are clamped');
  await assert.rejects(() => new SharedSpaces({ cloud: { session: { user: { id: 'u' } } }, study: { decks: () => [{ id: 'd' }], cards: () => cards.slice(0, 2) }, nick: () => 'x' }).sessionStart(SID, 'd'), /at least 3 cards/);
  ok('live study sessions: same quiz for everyone, clamped scores, leaderboard');

  // ---------- Faster start
  const { Push } = require('../src/push');
  let loaded = 0; const pu = new Push({ cloud: {}, getSettings: () => ({}), setSettings: () => {}, webpush: () => { loaded++; return { generateVAPIDKeys: () => ({ publicKey: 'P', privateKey: 'K' }) }; } });
  assert.strictEqual(loaded, 0, 'web-push not loaded at start'); pu.webpush; pu.webpush; assert.strictEqual(loaded, 1);
  assert.ok(!/^const .*require\('@modelcontextprotocol/m.test(read('src/mcp.js')), 'MCP SDK is loaded on first connect');
  const t0 = Date.now(); execFileSync(process.execPath, ['-e', "require('./src/mcp')"], { cwd: path.join(__dirname, '..') }); assert.ok(Date.now() - t0 < 2000);
  assert.ok(main.includes("webpush: () => require('web-push')") && main.includes('setTimeout(refreshIconCache'));
  const { Relay } = require('../src/relay'); assert.ok(read('src/relay.js').includes('this.fast?.() ? 1200'), 'relay polls faster while N28C is open'); assert.ok(Relay);
  ok('faster start: MCP SDK and web-push load when first needed; relay speeds up while your phone is looking');

  // ---------- Phone + desktop UI wiring
  const app = read('docs/companion/app.js'), ph = read('docs/companion/index.html');
  assert.ok(ph.includes("<b>NEXUS '28</b>") && !ph.includes('<b>N28C</b>'), "header says Nexus '28 again");
  for (const s of ['scan_deck', 'mlive', 'openLive', 'realtime']) assert.ok(app.includes(s), s);
  assert.ok(read('docs/companion/sw.js').includes("'n28c-shell-v2.1.0'") && read('docs/companion/sw.js').includes('silent'));
  const html = read('renderer/index.html');
  for (const s of ['id="projectModal"', 'id="writeModal"', 'id="meetingModal"', 'id="focusBtn"', 'project.js', 'write.js', 'meeting.js']) assert.ok(html.includes(s), s);
  ok("N28C: live mission card, scan notes → deck, live sessions, realtime; 'Nexus '28' header; desktop panels wired");

  // ---------- Web pages
  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes[0].version, require('../package.json').version, "What's new lists this version first");
  for (const e of changes) assert.ok(/^\d+\.\d+\.\d+$/.test(e.version) && e.title && e.highlights.length, e.version);
  const notes = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'release-notes.js'), 'v' + changes[0].version], { encoding: 'utf8' });
  assert.ok(notes.includes('## ' + changes[0].title) && notes.includes('xattr -cr'));
  assert.ok(read('.github/workflows/release.yml').includes('body_path: release-notes.md'));
  const wn = read('docs/whats-new/index.html'); assert.ok(wn.includes("fetch('changes.json'") && wn.includes('esc('));
  const demo = read('docs/demo/index.html'); assert.ok(demo.includes('LIVE DEMO') && demo.includes('NexusOrb.create') && !/fetch\(|supabase|XMLHttpRequest/.test(demo), 'demo is scripted and sends nothing');
  const admin = read('docs/admin/index.html');
  for (const s of ["['chat', '💬 Admin chat']", "rpc('admin_list_admins')", "from('admin_messages')", "'postgres_changes'", 'dmRoom', 'labelTables', 'env(safe-area-inset-bottom)']) assert.ok(admin.includes(s), s);
  const land = read('docs/index.html'); assert.ok(land.includes('href="demo/"') && land.includes('href="whats-new/"'));
  ok("web: What's new page + release notes from one file, scripted demo, admin chat (group + DMs), mobile admin");

  // ---------- SQL
  const sql = read('supabase/nexus-v2.1.sql');
  for (const s of ['create table if not exists public.shared_agents', 'function public.share_agent', 'function public.get_shared_agent', 'public.space_sessions', 'public.space_session_scores',
    'public.admin_messages', 'function public.admin_list_admins', 'supabase_realtime', 'enable row level security']) assert.ok(sql.includes(s), s);
  assert.ok(/am_select[^;]*is_admin\(\)/.test(sql) && /am_insert[^;]*sender = auth\.uid\(\)/.test(sql), 'admin chat is admin-only and you can only post as yourself');
  ok('SQL: shared agents, live sessions, admin chat, realtime');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`v2.1: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
