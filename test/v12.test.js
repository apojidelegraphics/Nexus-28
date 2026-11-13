// v1.2 tests: spaces + pinned links, chat search/digest, routine schedules + natural-language routines,
// the routine runner (missed runs once, brief waits for unlock), metrics/achievements, missions, Morning Brief gathering,
// optional nickname column.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nx12-'));

(async () => {
  // ---- spaces + links
  const { Conversations } = require('../src/conversations');
  const c = new Conversations(tmp());
  const school = c.addSpace({ name: 'School', agent: 'lyte' });
  const a = c.appendTo('new', { role: 'user', content: 'chem notes' }, { spaceId: school.id });
  const b = c.appendTo('new', { role: 'user', content: 'trip plan' });
  assert.strictEqual(c.get(a.id).spaceId, school.id);
  c.moveToSpace(b.id, school.id); assert.strictEqual(c.get(b.id).spaceId, school.id);
  c.setLinks(a.id, [b.id, a.id, 'nope']); assert.deepStrictEqual(c.get(a.id).links, [b.id]);
  c.updateSpace(school.id, { name: '  Uni  ', links: [a.id, a.id] }); assert.deepStrictEqual([c.space(school.id).name, c.space(school.id).links], ['Uni', [a.id]]);
  const r1 = c.ensureSpace('routines', { name: 'Routines' }), r2 = c.ensureSpace('routines', { name: 'X' });
  assert.strictEqual(r1.id, r2.id);
  const sum = c.summary();
  assert.ok(sum.spaces.length === 2 && sum.list.find(x => x.id === a.id).links.length === 1);
  c.removeSpace(school.id); assert.strictEqual(c.get(a.id).spaceId, null);
  const nc = c.create({ spaceId: r1.id }); assert.strictEqual(nc.spaceId, r1.id);
  ok('spaces: create, move chats, default agent, pinned links (no self/missing), built-in spaces, delete keeps chats');

  // ---- chat search
  const cs = require('../src/chatsearch');
  const chats = [
    { id: 'k1', title: 'Trip to Japan', updated: Date.now(), created: Date.now(), messages: [{ role: 'user', content: 'I want to visit Kyoto in April. My budget is $3000.' }, { role: 'assistant', persona: 'flash', content: 'April is cherry blossom season in Kyoto.' }] },
    { id: 'k2', title: 'Chem homework', updated: Date.now() - 9e8, messages: [{ role: 'user', content: 'balance Fe + O2' }, { role: 'user', hidden: true, content: 'kyoto secret' }] }
  ];
  const found = cs.search(chats, 'what was my kyoto budget', { nameOf: () => 'Flash' });
  assert.deepStrictEqual(found.map(x => x.id), ['k1']);
  assert.ok(/budget is \$3000/.test(cs.formatResults(found)) && /chat id k1/.test(cs.formatResults(found)));
  assert.deepStrictEqual(cs.search(chats, 'kyoto', { exclude: ['k1'] }), [], 'hidden messages and excluded chats are skipped');
  const dg = cs.digest(chats[0], { nameOf: () => 'Flash' });
  assert.ok(/Things the user said there:\n- I want to visit Kyoto in April\.\n- My budget is \$3000\./.test(dg) && /Flash: April is cherry/.test(dg));
  assert.ok(cs.transcript(chats[0], { nameOf: () => 'Flash' }).includes('User: I want to visit Kyoto'));
  assert.ok(cs.wantsRecall('you said something about Kyoto earlier') && !cs.wantsRecall('what is the capital of Japan'));
  ok('chat search: ranked matches with snippets + ids, digests keep what the user said, recall phrases detected');

  // ---- schedules
  const S = require('../src/schedule');
  const P = t => S.parseRoutine(t);
  assert.deepStrictEqual(P('every weekday at 8, tell me what is due'), { schedule: { type: 'weekdays', time: '08:00' }, prompt: 'Tell me what is due' });
  assert.deepStrictEqual(P('every night at 10 remind me to drink water').schedule, { type: 'daily', time: '22:00' });
  assert.deepStrictEqual(P('each Friday at 5pm recap my week').schedule, { type: 'weekly', time: '17:00', days: [5] });
  assert.deepStrictEqual(P('every Monday and Wednesday at 9am: plan my workout').schedule.days, [1, 3]);
  assert.strictEqual(P('every hour, check the news').schedule.type, 'hourly');
  assert.strictEqual(P('every day I go to the gym'), null, 'no time → not a routine');
  assert.strictEqual(P('every day at 25:00 do x'), null);
  const at = s => new Date(s).getTime(), fri9 = at('2026-11-13T09:00:00');
  assert.strictEqual(S.nextRun({ type: 'daily', time: '08:00' }, fri9), at('2026-11-14T08:00:00'));
  assert.strictEqual(S.nextRun({ type: 'weekdays', time: '08:00' }, fri9), at('2026-11-16T08:00:00'));
  assert.strictEqual(S.nextRun({ type: 'weekly', time: '17:00', days: [5] }, fri9), at('2026-11-13T17:00:00'));
  assert.strictEqual(S.nextRun({ type: 'hourly', time: '00:15' }, fri9), at('2026-11-13T09:15:00'));
  assert.strictEqual(S.nextRun({ type: 'once', at: fri9 - 1 }, fri9), null);
  assert.strictEqual(S.describe({ type: 'weekdays', time: '07:30' }), 'Weekdays at 7:30 AM');
  ok('schedules: "every weekday at 8, …" → routine; next run math for daily / weekdays / weekly / hourly / once');

  // ---- routine runner
  const { Routines } = require('../src/routines');
  let now = at('2026-11-13T07:00:00'), locked = false;
  const ran = [];
  const R = new Routines({ dir: tmp(), now: () => now, isLocked: () => locked, run: async r => { ran.push(r.id); return { ok: true, convId: 'cv-' + r.id }; } });
  const daily = R.upsert({ prompt: 'news', schedule: { type: 'daily', time: '08:00' }, agent: 'flash' });
  R.upsert({ id: 'brief', enabled: true, schedule: { type: 'daily', time: '07:30' } });
  assert.strictEqual(daily.name, 'news');
  now = at('2026-11-16T09:00:00'); // Mac slept all weekend
  locked = true;
  await R.tick(); await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(ran, [daily.id], 'missed daily routine runs once; the brief waits while the screen is locked');
  assert.strictEqual(R.get(daily.id).nextRun, at('2026-11-17T08:00:00'));
  locked = false; await R.tick(); await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(ran, [daily.id, 'brief'], 'brief runs at first unlock after its time');
  await R.tick(); await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(ran.length, 2, 'nothing runs twice');
  assert.strictEqual(R.get('brief').convId, 'cv-brief');
  assert.throws(() => R.remove('brief'), /can be turned off/);
  assert.throws(() => R.upsert({ prompt: ' ' }), /what to do/);
  R.upsert({ id: daily.id, enabled: false }); assert.strictEqual(R.get(daily.id).nextRun, null);
  ok('routines: missed runs run once, brief waits for unlock, no double runs, pause clears next run, brief can\'t be deleted');

  // ---- metrics
  const { Metrics } = require('../src/metrics');
  let t = at('2026-11-01T02:30:00');
  const M = new Metrics({ dir: tmp(), now: () => t });
  const first = M.record('chat', { agent: 'flash' }).map(x => x.id);
  assert.deepStrictEqual(first, ['first_chat', 'night_owl']);
  for (const ag of ['paragon', 'neodela', 'lyte']) M.record('chat', { agent: ag, voice: true, features: ['Seek'] });
  assert.ok(M.summary().achievements.find(x => x.id === 'full_roster').unlocked);
  for (let i = 1; i <= 6; i++) { t += 86400e3; M.record('chat', { agent: 'flash' }); }
  const sm = M.summary();
  assert.ok(sm.streak === 7 && sm.bestStreak === 7 && sm.favorite.agent === 'flash' && sm.voice === 3);
  assert.ok(sm.achievements.find(x => x.id === 'streak_7').unlocked && sm.points > 40);
  ok('metrics: points, streaks, favorite agent, achievements (incl. web ones) unlock once');

  // ---- missions
  const { Missions } = require('../src/missions');
  const mc = new Conversations(tmp());
  let round = 0, states = [], done = null;
  const missions = new Missions({ convos: mc, space: () => mc.ensureSpace('missions', { name: 'Missions' }),
    step: async ({ extra, noTools }) => { if (noTools) return { ok: true, text: '## Report\nFound 3 laptops.', model: 'm' }; round++; assert.ok(/round \d/.test(extra));
      return { ok: true, text: round < 2 ? '- searched\n- next: compare' : '- compared\nMISSION COMPLETE', model: 'm', activity: [] }; },
    onState: s => states.push(s?.status), onDone: s => { done = s; } });
  assert.throws(() => missions.start({ goal: 'hi' }), /Describe the mission/);
  const st = missions.start({ goal: 'Find the best laptops under $800', minutes: 5 });
  assert.throws(() => missions.start({ goal: 'another mission here' }), /already running/);
  await new Promise(r => { const iv = setInterval(() => { if (done) { clearInterval(iv); r(); } }, 5); });
  const conv = mc.get(st.convId);
  const visible = conv.messages.filter(m => !m.hidden);
  assert.ok(conv.kind === 'mission' && conv.spaceId && done.status === 'done' && done.activity === 'Mission complete');
  assert.deepStrictEqual(visible.map(m => m.role), ['user', 'assistant', 'assistant', 'assistant']);
  assert.ok(visible.at(-1).report && /Found 3 laptops/.test(visible.at(-1).content));
  assert.ok(conv.messages.some(m => m.hidden && /Keep going/.test(m.content)));
  ok('missions: rounds until MISSION COMPLETE, hidden "keep going" turns, final report in a Missions-space chat');

  // pause / end
  const mc2 = new Conversations(tmp());
  let calls = 0, done2 = null;
  const m2 = new Missions({ convos: mc2, space: () => null, onDone: s => { done2 = s; },
    step: ({ signal, noTools }) => noTools ? Promise.resolve({ ok: true, text: 'partial report' }) : new Promise(res => { calls++; const tm = setTimeout(() => res({ ok: true, text: 'working' }), 40); signal?.addEventListener('abort', () => { clearTimeout(tm); res({ ok: true, aborted: true }); }); }) });
  m2.start({ goal: 'Long research mission', minutes: 30 });
  await new Promise(r => setTimeout(r, 15));
  assert.strictEqual(m2.pause().status, 'paused');
  await new Promise(r => setTimeout(r, 60));
  const callsWhilePaused = calls;
  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(calls, callsWhilePaused, 'no work while paused');
  m2.resume(); await new Promise(r => setTimeout(r, 15));
  m2.end();
  await new Promise(r => { const iv = setInterval(() => { if (done2) { clearInterval(iv); r(); } }, 5); });
  assert.ok(done2.activity === 'Ended' && mc2.get(done2.convId).messages.some(m => m.report && m.content === 'partial report'));
  ok('missions: pause stops work, resume continues, End still writes a report');

  // ---- Morning Brief gathering
  const brief = require('../src/brief');
  const helperCalls = [];
  const deps = {
    weather: { forecast: async ({ location }) => ({ content: `Weather for ${location}: 54°F clear` }) },
    web: { search: async ({ query }) => ({ results: [{ title: 'Big news', url: 'https://www.example.com/a', snippet: 'Something happened.' }], images: [], q: query }) },
    helper: { request: async m => { helperCalls.push(m.cmd); return { data: m.cmd === 'cal_list' ? [{ title: 'Chem lab', start: Date.now() / 1000, end: Date.now() / 1000 + 3600, allDay: false }] : [{ title: 'Essay', due: Date.now() / 1000 - 60 }] }; } },
    helperCaps: { eventkit: true },
    mcp: { agentTools: () => ({ tools: [{ name: 'google__search_gmail_messages', parameters: { properties: { query: {}, page_size: {} } } }], routes: { google__search_gmail_messages: { connector: 'Google', tool: 'search_gmail_messages' } } }),
      call: async (route, args) => ({ text: `3 unread (${args.query}, ${args.page_size})` }) },
    cloud: { announcements: [{ message: 'v1.2 is out' }] },
    access: { neodela: { mode: 'free', limit: 28, used: 3 }, flash: { mode: 'free', limit: null } }
  };
  const g = await brief.gather({ sections: {}, topics: 'tech', settings: { weather: { location: 'Raleigh' }, apple: { calendar: true, reminders: true }, web: {} }, deps });
  assert.deepStrictEqual(g.blocks.map(b => b.key), ['weather', 'calendar', 'reminders', 'gmail', 'headlines', 'announcements', 'usage']);
  assert.ok(/Chem lab/.test(g.blocks[1].text) && /Essay — overdue/.test(g.blocks[2].text) && /is:unread newer_than:1d, 8/.test(g.blocks[3].text) && /neodela: 25 of 28/.test(g.blocks[6].text));
  const g2 = await brief.gather({ sections: { headlines: false, gmail: false }, settings: { apple: {} }, deps: { ...deps, weather: { forecast: async () => { throw new Error('offline'); } } } });
  assert.ok(!g2.blocks.some(b => b.key === 'headlines' || b.key === 'calendar') && g2.notes.some(x => /Weather: no default location|Calendar: turn on/.test(x)));
  const prompt = brief.briefPrompt({ ...g, nickname: 'Lucas' });
  assert.ok(prompt.includes('as Lucas') && prompt.includes('## Weather') && /Don't invent/.test(prompt));
  ok('Morning Brief: gathers weather, calendar, reminders, Gmail (via connector), headlines, news, chats left; skips what\'s off');

  // ---- nickname column optional
  const { NexusCloud } = require('../src/cloud');
  let hasCol = false, patched = null;
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
      const j = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url.startsWith('/auth/v1/token')) return j(200, { access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u1', email: 'l@x.com' } });
      if (req.url.startsWith('/rest/v1/profiles') && req.method === 'GET') {
        if (/nickname/.test(req.url) && !hasCol) return j(400, { code: '42703', message: 'column profiles.nickname does not exist' });
        return j(200, [{ username: 'lucas', ...(hasCol ? { nickname: 'Luke' } : {}), is_beta_tester: false, is_comped: false }]);
      }
      if (req.url.startsWith('/rest/v1/profiles') && req.method === 'PATCH') { patched = JSON.parse(raw); return j(200, []); }
      j(200, []);
    });
  }).listen(0);
  await new Promise(r => srv.on('listening', r));
  const B = `http://127.0.0.1:${srv.address().port}`;
  const mk = () => new NexusCloud({ url: B, key: 'pk', storeUrl: B + '/store', loadCache: () => null, saveCache: () => {}, loadRefresh: () => '', saveRefresh: () => {} });
  let cl = mk(); await cl.signIn('l@x.com', 'pw');
  assert.ok(cl.account().username === 'lucas' && !('nickname' in cl.account()));
  assert.strictEqual(await cl.changeNickname('Lu'), false, 'no column → stays local');
  hasCol = true; cl = mk(); await cl.signIn('l@x.com', 'pw');
  assert.strictEqual(cl.account().nickname, 'Luke');
  assert.strictEqual(await cl.changeNickname('  Lu  '), true);
  assert.deepStrictEqual(patched, { nickname: 'Lu' });
  srv.close();
  ok('nickname: works without the profiles.nickname column; syncs when it exists');

  console.log(`\n${n} v1.2 checks passed`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
