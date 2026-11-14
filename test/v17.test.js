// v1.7 tests: beta channel (flags, preview, opt-out, prerelease updates), citations, daily challenge, Nexus Wrapped,
// the phone relay, Homework/Cite features and their tools.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nx17-'));

(async () => {
  // ---- beta channel
  const F = require('../src/flags');
  const remote = [{ key: 'phone_companion', stage: 'beta' }, { key: 'secret_lab', stage: 'admin', title: 'Secret lab', min_version: '1.7.0' }, { key: 'citations', stage: 'all' }, { key: 'old_thing', stage: 'off' }, { key: 'BAD KEY', stage: 'all' }, { key: 'x', stage: 'weird' }];
  const stable = F.resolve({ remote, account: { signedIn: true }, version: '1.7.0' });
  const beta = F.resolve({ remote, account: { signedIn: true, beta: true }, version: '1.7.0' });
  const admin = F.resolve({ remote, account: { signedIn: true, admin: 'high-admin' }, version: '1.7.0' });
  assert.deepStrictEqual([stable.channel, beta.channel, admin.channel], ['stable', 'beta', 'admin']);
  assert.ok(!stable.flags.phone_companion.on && beta.flags.phone_companion.on && admin.flags.phone_companion.on);
  assert.ok(!beta.flags.secret_lab.on && admin.flags.secret_lab.on);
  assert.ok(stable.flags.citations.on && !admin.flags.old_thing.on);
  assert.ok(!stable.flags['BAD KEY'] && !stable.flags.x, 'bad rows ignored');
  assert.ok(!F.resolve({ remote, account: { admin: 'admin' }, version: '1.6.9' }).flags.secret_lab.on, 'min_version respected');
  const preview = F.resolve({ remote, account: { admin: 'admin' }, preview: 'stable', version: '1.7.0' });
  assert.strictEqual(preview.channel, 'stable'); assert.strictEqual(preview.realChannel, 'admin'); assert.ok(!preview.flags.phone_companion.on);
  assert.strictEqual(F.resolve({ account: { beta: true }, preview: 'admin' }).channel, 'beta', 'only admins can preview');
  const optOut = F.resolve({ remote, account: { beta: true }, optOut: ['phone_companion', 'citations'], version: '1.7.0' });
  assert.ok(!optOut.flags.phone_companion.on && optOut.flags.phone_companion.allowed && optOut.flags.citations.on, 'testers can switch early features off, not general ones');
  assert.ok(F.resolve({}).flags.homework_helper.on && !F.resolve({}).flags.phone_companion.on, 'offline defaults');
  ok('beta channel: off → admin → beta → all, min version, admin preview, tester opt-out, offline defaults');

  // ---- prerelease updates
  const up = require('../src/updater');
  const gh = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.endsWith('/releases/latest')) return res.end(JSON.stringify({ tag_name: 'v1.7.0', assets: [] }));
    res.end(JSON.stringify([{ tag_name: 'v1.7.0' }, { tag_name: 'v1.8.0-beta.2', prerelease: true, assets: [] }, { tag_name: 'v1.8.0-beta.10', prerelease: true, assets: [] }, { tag_name: 'v1.9.0', draft: true }]));
  }).listen(0);
  await new Promise(r => gh.on('listening', r));
  const base = `http://127.0.0.1:${gh.address().port}`;
  const s1 = await up.checkLatest({ current: '1.7.0', base });
  const s2 = await up.checkLatest({ current: '1.7.0', base, prerelease: true });
  gh.close();
  assert.ok(!s1.newer); assert.strictEqual(s2.latest, '1.8.0-beta.10'); assert.ok(s2.newer && s2.prerelease, 'beta.10 > beta.2, drafts skipped');
  assert.ok(up.compare('1.8.0', '1.8.0-beta.10') > 0);
  const wf = fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8');
  assert.ok(/prerelease: \$\{\{ contains\(github.ref_name, '-'\) \}\}/.test(wf));
  ok('updates: testers and admins are offered prereleases (v1.8.0-beta.N), everyone else only full releases');

  // ---- citations
  const C = require('../src/citations');
  const web = require('../src/web');
  const html = `<html><head><title>How Bees See Color | Science News</title><meta property="og:title" content="How bees see color"><meta name="author" content="Jane Q. Smith and Bob Lee">
    <meta property="og:site_name" content="Science News"><meta property="article:published_time" content="2024-03-05T10:00:00Z"></head></html>`;
  const src = { ...C.extract(html, 'https://www.sciencenews.org/bees', web), accessed: new Date(2026, 10, 14).getTime() };
  assert.deepStrictEqual(src.authors, ['Jane Q. Smith', 'Bob Lee']); assert.deepStrictEqual(src.date, { y: 2024, m: 2, d: 5 }); assert.strictEqual(src.site, 'Science News');
  assert.strictEqual(C.format(src, 'mla'), 'Smith, Jane Q., and Bob Lee. "How bees see color." *Science News*, 5 Mar. 2024, www.sciencenews.org/bees.');
  assert.strictEqual(C.format(src, 'apa', { md: false }), 'Smith, J. Q., & Lee, B. (2024, March 5). How bees see color. Science News. https://www.sciencenews.org/bees');
  assert.ok(C.format(src, 'chicago').startsWith('Smith, Jane Q., and Bob Lee. "How bees see color." *Science News*. March 5, 2024.'));
  const ld = C.extract(`<script type="application/ld+json">{"@type":"NewsArticle","headline":"Mars rover finds water","author":[{"name":"Ana Ruiz"},{"name":"Li Wei"},{"name":"Sam Ode"}],"datePublished":"2025-07-01","publisher":{"name":"Space Daily"}}</script>`, 'https://space.example/mars', web);
  assert.deepStrictEqual(ld.authors, ['Ana Ruiz', 'Li Wei', 'Sam Ode']); assert.strictEqual(ld.title, 'Mars rover finds water');
  assert.ok(C.format(ld, 'mla').startsWith('Ruiz, Ana, et al. "Mars rover finds water."'));
  const noAuthor = C.format({ ...src, authors: [], date: null }, 'mla');
  assert.ok(noAuthor.startsWith('"How bees see color."') && noAuthor.includes('Accessed 14 Nov. 2026.'));
  const journal = C.extract('<meta name="citation_title" content="Deep learning"><meta name="citation_author" content="LeCun, Yann"><meta name="citation_author" content="Bengio, Yoshua"><meta name="citation_journal_title" content="Nature"><meta name="citation_volume" content="521"><meta name="citation_issue" content="7553"><meta name="citation_firstpage" content="436"><meta name="citation_lastpage" content="444"><meta name="citation_publication_date" content="2015/05/27"><meta name="citation_doi" content="10.1038/nature14539">', 'https://nature.com/x', web);
  assert.strictEqual(C.format(journal, 'apa', { md: false }), 'LeCun, Y., & Bengio, Y. (2015, May 27). Deep learning. Nature, 521(7553), 436–444. https://doi.org/10.1038/nature14539');
  const store = new C.CitationStore({ dir: tmp() });
  store.add({ ...src, project: 'Bio essay' }); store.add({ ...ld, project: 'Bio essay' }); store.add({ ...src, project: 'Bio essay', title: 'How bees see color (updated)' });
  assert.strictEqual(store.all().length, 2, 'same link in the same list is updated, not duplicated');
  const bib = C.bibliography(store.all(), 'mla', { md: false });
  assert.ok(bib.startsWith('Works Cited\n\nRuiz, Ana') && bib.indexOf('Smith') > bib.indexOf('Ruiz'), 'alphabetical');
  assert.ok(C.bibliography([], 'apa').startsWith('References'));
  ok('citations: meta tags, JSON-LD and scholarly tags → MLA 9 / APA 7 / Chicago; works-cited lists, alphabetical');

  // ---- cite_source tool (mock page)
  const pageSrv = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); }).listen(0);
  await new Promise(r => pageSrv.on('listening', r));
  process.env.NEXUS_TEST_ALLOW_PRIVATE = '1';
  const tools = require('../src/tools');
  const store2 = new C.CitationStore({ dir: tmp() });
  const tr = await tools.execute('cite_source', { url: `http://127.0.0.1:${pageSrv.address().port}/bees`, project: 'Essay' }, { cite: store2 }).catch(e => ({ err: e.message }));
  pageSrv.close();
  assert.ok(!tr.err, tr.err);
  { assert.ok(tr.content.startsWith('MLA 9: Smith, Jane Q., and Bob Lee.') && tr.activity.cards[0].type === 'citation'); assert.strictEqual(store2.all()[0].project, 'Essay'); }
  assert.deepStrictEqual(tools.describe('cite_source', { url: 'https://www.bbc.com/x' }), { label: 'Making a citation', detail: 'bbc.com' });
  assert.ok(!tools.needsConfirm('cite_source'));
  ok('cite_source tool: reads the page, formats all three styles, saves to the list, shows a citation card');

  // ---- Homework + Cite features (every agent gets them when the flag is on)
  const features = require('../src/features');
  const fk = require('../src/featurekit');
  assert.deepStrictEqual(features.universal(), ['Homework', 'Cite']);
  assert.deepStrictEqual(features.universal(k => k === 'citations'), ['Cite']);
  assert.deepStrictEqual(fk.plan(['Homework']).blocks, ['hints']);
  assert.ok(fk.plan(['Cite']).cite && fk.plan(['Cite']).web);
  assert.ok(fk.blockPrompt(['hints']).includes('nexus-hints') && fk.blockPrompt(['hints']).includes('do NOT reveal'));
  const wctx = { window: {}, document: { createElement: () => ({}) }, navigator: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/widgets.js'), 'utf8'), wctx);
  assert.strictEqual(wctx.window.NexusWidgets.LANG['nexus-hints'], 'hints');
  assert.ok(wctx.window.NexusWidgets.BUILD.hints);
  ok('Homework helper (hint ladder widget) and Cite (web + cite_source) work on every agent, gated by flags');

  // ---- daily challenge
  const ch = require('../src/challenges');
  const day1 = new Date(2026, 10, 14, 10).getTime();
  assert.strictEqual(ch.forDay(day1).id, ch.forDay(day1 + 3600e3).id, 'same all day');
  const ids = new Set(); for (let d = 0; d < 40; d++) ids.add(ch.forDay(day1 + d * 86400e3).id);
  assert.ok(ids.size >= 10, 'rotates through many challenges');
  assert.strictEqual(ch.progress({ event: 'featureKinds', n: 3 }, { features: { Seek: 1, Magyk: 2 } }), 2);
  assert.strictEqual(ch.progress({ event: 'feature', feature: 'Synergy', n: 1 }, { features: { Synergy: 4 } }), 1);
  const { Metrics } = require('../src/metrics');
  let t = day1;
  const mdir = tmp();
  const m = new Metrics({ dir: mdir, now: () => t });
  const today = ch.forDay(t);
  const fire = () => today.event === 'feature' || today.event === 'featureKinds' || today.event === 'chats' || today.event === 'voice' ? m.record('chat', { agent: 'flash', voice: true, features: [today.feature || 'Seek', 'Cognition', 'Synergy'] }) : m.record(today.event);
  let done = null; for (let i = 0; i < 12 && !done; i++) done = fire().find(x => x.kind === 'challenge');
  assert.ok(done, 'challenge completes'); assert.ok(done.desc.includes(`+${ch.BONUS} points`));
  const p1 = m.summary().points; fire(); assert.ok(!m.summary().challenge || m.summary().challenge.done);
  assert.ok(m.summary().points - p1 < ch.BONUS, 'bonus paid once');
  const sum = m.summary();
  assert.strictEqual(sum.challenge.streak, 1); assert.strictEqual(sum.challenge.total, 1);
  assert.ok(sum.hours.reduce((a, b) => a + b, 0) >= 0 && sum.weekdays.length === 7);
  ok('daily challenge: one per day for everyone, progress from Stats events, +25 points once, streak');

  // ---- Nexus Wrapped
  const W = require('../src/wrapped');
  const Y = 2026, at = (mo, d, h) => new Date(Y, mo, d, h).getTime();
  const list = [
    { title: 'Bio essay', messages: [{ role: 'user', content: 'help with photosynthesis essay', ts: at(2, 3, 23) }, { role: 'assistant', persona: 'neodela', content: 'x', features: ['StudyMode'], ts: at(2, 3, 23) },
      { role: 'user', content: 'photosynthesis quiz please', ts: at(2, 4, 23) }, { role: 'assistant', persona: 'neodela', content: 'y', features: ['StudyMode', 'Magyk'], ts: at(2, 4, 23) }] },
    { title: 'Laptop', messages: [{ role: 'user', content: 'best laptop for coding', via: 'voice', ts: at(5, 1, 0) }, { role: 'assistant', persona: 'flash', content: 'z', ts: at(5, 1, 0) }] },
    { title: 'Old', messages: [{ role: 'user', content: 'last year', ts: new Date(Y - 1, 5, 1).getTime() }] }
  ];
  const wr = W.build({ list, metrics: { points: 320, bestStreak: 6, achievements: [{ unlocked: 1 }, { unlocked: null }] }, study: { totalReviews: 140 }, personas: [{ id: 'neodela', name: "Nexus '28 Neodela", color: '#b18cff' }], year: Y });
  assert.strictEqual(wr.messages, 3); assert.strictEqual(wr.chats, 2); assert.strictEqual(wr.voice, 1);
  assert.strictEqual(wr.topAgent.id, 'neodela'); assert.strictEqual(wr.features[0].id, 'StudyMode');
  assert.strictEqual(wr.busiestHourLabel, '11 PM'); assert.ok(wr.topics.includes('photosynthesis'));
  assert.strictEqual(wr.persona.title, 'The Night Owl'); assert.strictEqual(wr.achievements, 1);
  assert.ok(W.build({ list: [], year: Y }).empty);
  ok('Nexus Wrapped: messages, favorite agent, prime time, top features, topics, personality — this year only');

  // ---- phone relay
  const { Relay } = require('../src/relay');
  const db = [{ id: 1, direction: 'to_desktop', kind: 'ask', agent: 'lyte', content: 'what is 2+2?', handled_at: null }, { id: 2, direction: 'to_desktop', kind: 'ping', content: '', handled_at: null }];
  const writes = [];
  const cloud = {
    session: { user: { id: 'u1' } },
    authedGet: async () => db.filter(r => r.direction === 'to_desktop' && !r.handled_at),
    write: async (method, p, body) => { writes.push([method, p.split('?')[0], body]); if (method === 'PATCH') { const id = +p.match(/id=eq\.(\d+)/)[1]; db.find(r => r.id === id).handled_at = body.handled_at; } if (method === 'POST') db.push({ id: db.length + 1, ...body }); return null; }
  };
  let on = false;
  const handled = [];
  const relay = new Relay({ cloud, enabled: () => on, version: '1.7.0', agents: () => [{ id: 'flash' }], handle: async row => { handled.push(row.content); return { ok: true, text: '4', agent: row.agent, model: 'm' }; } });
  await relay.poll(); assert.strictEqual(writes.length, 0, 'off until you turn it on');
  on = true; await relay.poll();
  assert.deepStrictEqual(handled, ['what is 2+2?'], 'pings are skipped');
  const reply = db.find(r => r.kind === 'reply');
  assert.ok(reply && reply.direction === 'to_phone' && reply.reply_to === 1 && reply.content === '4' && reply.agent === 'lyte');
  assert.ok(db.some(r => r.kind === 'status' && r.meta.version === '1.7.0'), 'heartbeat tells the phone the Mac is online');
  assert.ok(writes.some(w => w[0] === 'DELETE'), 'old status rows cleaned up');
  await relay.poll(); assert.strictEqual(handled.length, 1, 'each question answered once');
  const broken = new Relay({ cloud: { session: {}, authedGet: async () => { throw new Error('Nexus cloud 404: relation "relay_messages" does not exist'); }, write: async () => {} }, enabled: () => true, handle: async () => ({}) });
  await broken.poll(); assert.strictEqual(broken.state.status, 'error'); assert.ok(/isn't set up/.test(broken.state.error));
  ok('phone relay: off until enabled, answers each question once, heartbeat + cleanup, clear error if the table is missing');

  // ---- companion page + repo files
  const page = fs.readFileSync(path.join(__dirname, '../docs/companion/index.html'), 'utf8');
  assert.ok(page.includes('relay_messages') && page.includes("direction: 'to_desktop'") && page.includes('sb_publishable_'));
  assert.ok(!/service_role|sb_secret_/.test(page), 'no secret keys in the public page');
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/nexus-v1.7.sql'), 'utf8');
  assert.ok(sql.includes('enable row level security') && sql.includes('relay_select_own') && sql.includes('profiles_protect_flags'));
  for (const t of ['beta-signup.md', 'bug_report.md', 'feature_request.md', 'config.yml']) assert.ok(fs.existsSync(path.join(__dirname, '../.github/ISSUE_TEMPLATE', t)), t);
  ok('companion page (GitHub Pages), Supabase SQL with row-level security, GitHub issue templates');

  console.log(`\n${n} v1.7 checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
