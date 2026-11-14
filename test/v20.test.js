// v2.0 tests: tidier desktop (bottom bar actions, routines panel, settings tabs, beta sign-up in Account),
// N28C huddle / debate / cite / routine switches, the web pages (landing + admin portal), and the SQL.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const html = read('renderer/index.html');
  for (const a of ['mission', 'huddle', 'debate', 'watch', 'routines', 'study']) assert.ok(html.includes(`data-act="${a}"`), a);
  assert.ok(!html.includes('<button data-mission>') && !html.includes('<button data-routines>'), '⋯ menu is export + feedback only');
  assert.ok(html.includes('id="routinesModal"') && !html.includes('data-tab="routines"'));
  const order = [...html.matchAll(/data-tab="(\w+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(order, ['account', 'providers', 'personas', 'voice', 'phone', 'mac', 'connectors', 'features', 'stats', 'general', 'beta', 'activity']);
  const settings = read('renderer/settings.js');
  assert.ok(settings.includes('id="betaSignupCard"') && settings.indexOf('id="betaSignupCard"') < settings.indexOf('async function renderBeta'), 'sign-up lives in Account');
  assert.ok(settings.includes("btn.hidden = f.realChannel === 'stable'") && settings.includes('function openRoutines'));
  ok('bottom bar actions, routines panel, tidy tabs, beta sign-up in Account (Beta tab for testers only)');

  const main = read('main.js');
  assert.ok(/cloud\.write\('POST', 'beta_requests'/.test(main) && main.includes("'beta:myRequest'") && main.includes('githubIssueUrl') && main.includes('mailto:'));
  ok('sign-up saves a request, then opens GitHub + email');

  const { Companion } = require('../src/companion');
  const calls = [];
  const comp = new Companion({ cloud: { session: {}, write: async () => [] }, convos: { summary: () => ({ list: [], spaces: [] }), get: () => ({ id: 'c1', title: 'x', messages: [] }) }, study: { stats: () => ({}) },
    metrics: { summary: () => ({ achievements: [] }) }, routines: { list: () => [] }, personas: () => [], settings: () => ({}), version: '2.0.0', enabled: () => true,
    actions: { huddle: async a => { calls.push(['huddle', a]); return { convId: 'c1', title: '◍ Huddle: q', agents: ['flash', 'lyte'] }; }, debate: async a => { calls.push(['debate', a]); return { convId: 'c1', title: '⚖ Debate: t' }; },
      cite: async a => { calls.push(['cite', a]); return { title: 'T', mla: 'M', apa: 'A', chicago: 'C' }; }, routineEnable: (id, on) => calls.push(['routine', id, on]), agentsUsable: () => ['flash', 'lyte'] } });
  assert.strictEqual((await comp.request({ meta: { op: 'huddle', question: 'q', agents: ['flash', 'lyte', 7] } })).convId, 'c1');
  assert.deepStrictEqual(calls[0][1].agents, ['flash', 'lyte', '7']);
  assert.strictEqual((await comp.request({ meta: { op: 'debate', topic: 'Cats vs dogs', pro: 'flash', con: 'lyte', rounds: '3' } })).title, '⚖ Debate: t');
  assert.strictEqual(calls[1][1].rounds, 3);
  assert.strictEqual((await comp.request({ meta: { op: 'cite', url: 'https://x.y', save: 1 } })).apa, 'A');
  await comp.request({ meta: { op: 'routine_enable', id: 'brief', on: 0 } });
  assert.deepStrictEqual(calls.at(-1), ['routine', 'brief', false]);
  assert.deepStrictEqual(comp.status().usable, ['flash', 'lyte']);
  for (const f of ['async function phoneHuddle', 'async function phoneDebate', 'async function phoneCite', 'routines.upsert({ id, enabled: !!on })']) assert.ok(main.includes(f), f);
  const app = read('docs/companion/app.js');
  for (const s of ["request('huddle'", "request('debate'", "request('cite'", "request('routine_enable'", 'function startMenu']) assert.ok(app.includes(s), s);
  ok('N28C: huddle, debate, cite, routine on/off (phone → Mac)');

  const land = read('docs/index.html'), admin = read('docs/admin/index.html');
  assert.ok(land.includes('releases/latest') && land.includes('companion/orb.js') && land.includes('xattr -cr') && !land.includes('http-equiv="refresh"'));
  for (const f of ['assets/shot-study.png', 'assets/phone-chat.png', 'assets/phone-study.png']) assert.ok(land.includes(f) && fs.existsSync(path.join(__dirname, '../docs', f)), f);
  for (const s of ['admin_review_beta_request', 'admin_overview', 'admin_lookup_user', 'admin_set_beta_tester', 'admin_set_moderation', 'admin_get_audit_log', "from('feature_flags')", "from('announcements')", "from('maintenance_config')", 'get_my_admin_level', 'noindex']) assert.ok(admin.includes(s), s);
  ok('landing page + admin portal');

  const sql = read('supabase/nexus-v2.0.sql');
  for (const s of ['create table if not exists public.beta_requests', 'beta_requests_one_pending', 'enable row level security', 'admin_review_beta_request', 'admin_overview', 'is_admin()']) assert.ok(sql.includes(s), s);
  assert.ok(/insert_own[\s\S]*status = 'pending'/.test(sql), 'people can only file pending requests');
  const readme = read('README.md');
  assert.ok(readme.includes('Download for Mac') && readme.includes('N28C') && readme.includes('docs/DEVELOPERS.md') && fs.existsSync(path.join(__dirname, '../docs/DEVELOPERS.md')));
  ok('SQL + consumer README (developer notes moved)');
  console.log(`v2.0: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
