// v2.7 tests: memory you control, weekly recap, auto-sorted Spaces, clipboard orb, share sheet + nexus28:// links,
// group challenges, changelog email + RSS, the drag-to-Applications installer.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tmp = name => path.join(os.tmpdir(), name + '-' + Date.now() + Math.random().toString(36).slice(2) + '.json');

// ---------- Memory
const { Memory } = require('../src/memory');
const file = tmp('mem'); let M = new Memory({ file });
assert.ok(M.fromMessage('remember that I am in 11th grade'));
assert.ok(M.fromMessage('Hey Nexus, please remember: call me Luke.'));
assert.strictEqual(M.fromMessage('do you remember the movie?'), null, 'questions are not memories');
assert.strictEqual(M.add('call me luke'), null, 'no duplicates');
assert.deepStrictEqual(M.state().items.map(i => i.text), ['call me Luke', 'I am in 11th grade']);
ok('“remember that …” saves a memory, questions don\'t');
M = new Memory({ file }); assert.strictEqual(M.state().items.length, 2, 'kept on disk');
assert.ok(M.prompt().includes('- I am in 11th grade') && M.prompt().includes('nexus-memory'));
const id = M.state().items[0].id; M.edit(id, 'Call me Lucas'); assert.ok(M.prompt().includes('Call me Lucas'));
M.setEnabled(false); assert.strictEqual(M.prompt(), '', 'switched off = agents know nothing');
M.setEnabled(true); M.remove(id); assert.strictEqual(M.state().items.length, 1); M.clear(); assert.strictEqual(M.state().items.length, 0);
ok('memory: edit, switch off, delete one, wipe all');

// ---------- Weekly recap
const recap = require('../src/recap');
const sun = Date.parse('2026-11-22T19:00:00'), mon = recap.weekBounds(sun).from, H = 3600e3;
const list = [
  { id: 'a', title: 'Krebs cycle help', messages: [{ role: 'user', content: 'explain the krebs cycle mitochondria', ts: mon + 10 * H }, { role: 'assistant', persona: 'paragon', content: 'Sure', ts: mon + 10 * H + 5 }, { role: 'user', content: 'more on mitochondria krebs', ts: mon + 30 * H }, { role: 'assistant', persona: 'paragon', content: 'ok', ts: mon + 30 * H }] },
  { id: 'b', title: 'Old', messages: [{ role: 'user', content: 'last week', ts: mon - 2 * 864e5 }] }];
const log = [{ t: mon + 11 * H, g: 3 }, { t: mon + 12 * H, g: 1 }, { t: mon + 50 * H, g: 2 }];
const r = recap.build({ list, log, personas: [{ id: 'paragon', name: "Nexus '28 Paragon" }], streak: 3, now: sun, achievements: [{ id: 'x', name: 'Scholar', icon: '🎓' }], unlocked: { x: mon + 5 * H } });
assert.strictEqual(r.messages, 2); assert.strictEqual(r.chats, 1); assert.strictEqual(r.vsLast, 100);
assert.strictEqual(r.reviews, 3); assert.strictEqual(r.studyDays, 2); assert.strictEqual(r.accuracy, 67);
assert.deepStrictEqual(r.agents.map(a => a.name), ['Paragon']); assert.ok(r.topics.includes('krebs') && r.topics.includes('mitochondria'));
assert.strictEqual(r.achievements[0].name, 'Scholar');
const md = recap.markdown(r, 'Luke'); assert.ok(md.includes("Luke's week") && md.includes('nexus-chart') && md.includes('67% remembered'));
assert.ok(recap.markdown(recap.build({ now: sun })).includes('quiet week'));
ok('weekly recap: messages, agents, topics, flashcards, achievements, chart');
assert.ok(recap.due('', sun)); assert.ok(!recap.due(recap.weekBounds(sun).key, sun), 'once a week');
assert.ok(!recap.due('', Date.parse('2026-11-22T12:00:00')), 'not before 6pm'); assert.ok(!recap.due('', Date.parse('2026-11-21T19:00:00')), 'Sundays only');
ok('recap runs Sunday from 6pm, once');

// ---------- Auto-sorted Spaces
const { suggest } = require('../src/autosort');
const spaces = [{ id: 's1', name: 'AP Biology', project: { goal: 'Pass the AP Biology exam: cells, metabolism, mitochondria, genetics' } }, { id: 's2', name: 'Spanish', project: { goal: 'Learn spanish verbs and vocabulary' } }, { id: 'all', name: 'All', builtin: true }];
const inS = { s1: [{ id: 'c1', title: 'Cell respiration review', messages: [{ role: 'user', content: 'cellular respiration krebs cycle atp' }] }], s2: [] };
const chatsIn = id => inS[id] || [];
assert.strictEqual(suggest({ title: 'Krebs cycle', messages: [{ role: 'user', content: 'How does the krebs cycle make ATP in mitochondria?' }, { role: 'assistant', content: 'The krebs cycle…' }] }, spaces, chatsIn)?.id, 's1');
assert.strictEqual(suggest({ title: 'Dinner ideas', messages: [{ role: 'user', content: 'what should I cook for dinner tonight' }] }, spaces, chatsIn), null);
ok('auto-sort files a biology chat into AP Biology and leaves dinner alone');
const conv = read('src/conversations.js'); assert.ok(conv.includes('onFirstAnswer'));
const main = read('main.js');
assert.ok(/convos = new Conversations[\s\S]{0,400}convos\.onFirstAnswer/.test(main), 'hooked right after convos is created');
assert.ok(main.includes('autoSort') && main.includes("'autosort:all'"));
ok('auto-sort runs after the first answer, toggle in settings');

// ---------- Wiring: memory in every agent, recap schedule, clipboard orb, share, links, challenges, changelog
assert.ok(main.includes('memory.fromMessage') && main.includes('memory.prompt()'));
assert.ok(/'memory',/.test(main) && read('renderer/widgets.js').includes("'nexus-memory'") && read('src/featurekit.js').includes('memory:'));
ok('memory goes into every agent prompt; nexus-memory cards render');
assert.ok(main.includes('recapMod.due') && main.includes('runRecap'));
assert.ok(main.includes('maybeClipOrb') && read('renderer/cliporb.html').includes("script-src 'self'") && fs.existsSync(path.join(__dirname, '../renderer/cliporb.js')));
assert.ok(!/<script>/.test(read('renderer/cliporb.html')), 'no inline script (CSP)');
ok('clipboard orb: own window, strict CSP, respects focus mode');
assert.ok(main.includes("'share:text'") && main.includes('ShareMenu') && read('renderer/chatview.js').includes('share.text'));
assert.ok(main.includes("setAsDefaultProtocolClient('nexus28')") && main.includes("'open-url'"));
const pkg = JSON.parse(read('package.json'));
assert.deepStrictEqual(pkg.build.protocols, [{ name: 'Nexus', schemes: ['nexus28'] }]);
ok('share sheet + nexus28:// links registered with macOS');
assert.ok(main.includes("'challenge_report'") && main.includes("'space_challenges_for'") && read('renderer/study.js').includes('spChalNew'));
const n28c = read('docs/companion/app.js');
assert.ok(n28c.includes("'space_challenges_for'") && n28c.includes("'changelog_subscribe'") && n28c.includes("APP_VERSION = '2.7.0'"));
assert.ok(read('docs/companion/sw.js').includes('n28c-shell-v2.7.0'));
ok('group challenges on the Mac and N28C; changelog toggle in N28C');
const pre = read('preload.js'); for (const k of ['memory:', 'recap:', 'autosort:', 'clipOrb:', 'share:', 'challenges:', 'changelog:']) assert.ok(pre.includes(k), k);
const settings = read('renderer/settings.js'); assert.ok(settings.includes('renderPersonal') && read('renderer/index.html').includes('data-tab="personal"'));
ok('Settings → Personal and the preload bridge');

// ---------- SQL
const sql = read('supabase/nexus-v2.7.sql');
for (const f of ['space_challenges', 'space_challenge_progress', 'challenge_report', 'space_challenges_for', 'changelog_subscribers', 'changelog_subscribe', 'changelog_unsubscribe', 'admin_changelog_recipients', 'admin_changelog_mark_sent', 'admin_settings']) assert.ok(sql.includes(f), f);
assert.ok(/revoke insert, update, delete on public\.space_challenge_progress/.test(sql), 'progress only through challenge_report');
assert.ok(/revoke insert, update, delete on public\.changelog_subscribers/.test(sql));
assert.ok(/get_my_admin_level\(\) is distinct from 'high-admin'/.test(sql), 'recipients: high-admins only');
assert.ok(/grant execute on function public\.changelog_unsubscribe\(uuid\) to anon/.test(sql));
ok('v2.7 SQL: challenges can\'t be faked, emails only for high-admins, one-click unsubscribe');

// ---------- Changelog: RSS in sync, unsubscribe page, public notes
const changes = JSON.parse(read('docs/whats-new/changes.json'));
assert.strictEqual(changes[0].version, pkg.version);
assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])), 'nothing about Axiom in public notes');
const { build } = require('../scripts/build-feed');
assert.strictEqual(read('docs/whats-new/feed.xml'), build(changes), 'feed.xml is out of date: run node scripts/build-feed.js');
assert.ok(read('docs/whats-new/index.html').includes('application/rss+xml'));
const un = read('docs/unsubscribe/index.html'); assert.ok(un.includes('changelog_unsubscribe') && un.includes("get('t')") && !/service_role|sb_secret/.test(un));
ok('RSS feed in sync, unsubscribe page uses only the public key');

// ---------- Installer
const dmg = pkg.build.dmg;
assert.ok(dmg.background && fs.existsSync(path.join(__dirname, '..', dmg.background)) && fs.existsSync(path.join(__dirname, '..', dmg.background.replace('.png', '@2x.png'))));
assert.ok(dmg.contents.some(c => c.type === 'link' && c.path === '/Applications') && dmg.window.width === 660);
assert.ok(pkg.build.files.includes('!assets/dmg/**'), 'installer art is not shipped inside the app');
ok('drag-to-Applications installer with retina background');

console.log(`v2.7: ${n} checks passed`);
