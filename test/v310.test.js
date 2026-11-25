// v3.10 tests: training for everyone (asked once, beta testers always share), what Nexus learned, your own rules,
// the 📚 lesson chip, Terms, speech minutes, the Obsidian-style graph, backlinks, Ask the map, deck from a branch,
// Smarter topics, Continue on my other computer, notices for one person, and the 3.7 features out of beta.
// (Nothing here reads ../apoji-admin.)
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

(async () => {
  const main = read('main.js'), set = read('renderer/settings.js'), hud = read('renderer/hud.js'), pre = read('preload.js'), html = read('renderer/index.html');
  const sql = read('supabase/nexus-v3.10.sql');

  // ---------- training for everyone
  const { createTraining, ownRulesText } = require('../src/training');
  const calls = [];
  const cloud = { session: {}, rpc: async (fn, a) => { calls.push([fn, a]); if (fn === 'training_set_consent') return a.p_on ? { ok: true } : { ok: false, error: 'tester', message: 'Beta testers always help train Nexus. To stop, leave the beta program.' };
    if (fn === 'training_my_status') return { on: true, tester: true, asked: false, examples: 4, helped: 1 }; if (fn === 'training_news') return [{ id: 1, title: 'Units', lessons: 2, rules: ['Always give units'] }];
    if (fn === 'training_rules') return ['Always give units']; if (fn === 'training_lessons') return [{ q: 'cups in a liter', a: 'About 4.2' }]; return null; } };
  const tr = createTraining({ cloud });
  const st = await tr.refresh();
  assert.ok(st.tester && st.asked && st.helped === 1, 'testers count as asked');
  await assert.rejects(() => tr.setConsent(false), /Beta testers always help/);
  assert.strictEqual((await tr.news())[0].title, 'Units');
  const ld = await tr.lessonsDetail('how many cups in a liter', 'flash');
  assert.ok(ld.count === 2 && ld.text.includes('Always give units'));
  assert.strictEqual(typeof await tr.lessonsFor('another question here'), 'string');
  assert.strictEqual(ownRulesText([]), '');
  const own = ownRulesText(['Always use metric', '', 'x'.repeat(500)]);
  assert.ok(own.includes("THE USER'S OWN RULES") && own.includes('• Always use metric') && !own.includes('x'.repeat(201)));
  assert.ok(main.includes("ownRulesText(s.myRules)") && main.includes('if (lessonsUsed) fd.lessons = lessonsUsed') && main.includes("patch.myRules !== undefined"));
  assert.ok(main.includes("recordMetric('trainer')") && main.includes('function askTraining()') && main.includes("broadcast('training:ask'") && main.includes('setTimeout(askTraining, 25e3)'));
  assert.ok(hud.includes("act: 'train-yes'") && hud.includes("act: 'train-no'") && hud.includes('api.training?.onAsk'));
  const { ACHIEVEMENTS } = require('../src/metrics'); assert.ok(ACHIEVEMENTS.some(a => a.id === 'trainer'));
  assert.ok(sql.includes('or exists (select 1 from profiles where id = p_uid and is_beta_tester)') && sql.includes("'error', 'tester'") && sql.includes("insert into training_consent (user_id, revoked_at)"));
  ok('training for everyone: asked once (+100 points, Trainer), beta testers always share, your own rules, lessons count for the 📚 chip');

  // ---------- Settings → Training / Terms, speech minutes
  assert.ok(html.includes('data-tab="training"') && html.includes('data-tab="terms"') && html.includes('id="tab-training"') && html.includes('id="tab-terms"'));
  assert.ok(html.indexOf('terms-data.js') > 0 && html.indexOf('terms-data.js') < html.indexOf('settings.js'));
  assert.ok(set.includes('async function renderTraining()') && set.includes('function renderTerms()') && set.includes('ALWAYS ON · BETA TESTER') && set.includes('id="ruleAdd"') && set.includes('What Nexus learned'));
  assert.ok(set.includes('async function paintSpeechUse()') && main.includes("ipcMain.handle('voice:speechUsage'") && pre.includes("speechUsage: () => call('voice:speechUsage')"));
  assert.ok(read('renderer/chatview.js').includes('fd.lessons') && read('renderer/chatview.css').includes('.fb.lesson'));
  ok('Settings → Training (sharing, what Nexus learned, your own rules), Terms tab, speech minutes left');

  // ---------- Terms
  const T = require('../renderer/terms-data.js');
  assert.ok(T.TERMS.version && T.TERMS.sections.length >= 15);
  for (const id of ['age', 'ai', 'training', 'beta', 'admins', 'privacy', 'regions', 'law', 'contact']) assert.ok(T.TERMS.sections.some(s => s.id === id), 'terms section ' + id);
  const all = JSON.stringify(T.TERMS);
  assert.ok(/at least 13/.test(all) && /GDPR/.test(all) && /PIPEDA/.test(all) && /North Carolina/.test(all) && /Lucas Bryant Roland/.test(all) && !/\[STATE\]|\[LEGAL NAME\]/.test(all) && /can't be turned off while you are in the beta/.test(all));
  const h = T.toHTML(T.TERMS, { highlight: 'admin' });
  assert.ok(h.includes('class="terms-sec terms-hl"') && !h.includes('<script') && h.includes('<b>at least 13 years old</b>'));
  const site = read('docs/terms/index.html');
  assert.ok(site.includes(`Version ${T.TERMS.version}`) && site.includes(T.toHTML(T.TERMS)), 'docs/terms is out of date: run node scripts/build-terms.js');
  assert.ok(main.includes("ipcMain.handle('terms:accept'") && hud.includes("act: 'terms-ok'") && read('docs/index.html').includes('href="terms/"'));
  assert.ok(sql.includes('create table if not exists public.terms_acceptance') && sql.includes('function public.terms_accept'));
  ok('Terms & Conditions: one source (renderer/terms-data.js) for Settings, the website and Apoji Admin; 13+, regions, beta, admins');

  // ---------- graph mode, backlinks, ask, deck, smart topics
  const mt = read('renderer/mindtree.js');
  for (const k of ['function drawGraph()', 'function graphTick()', 'function graphHover(', 'function setMode(', 'tree.links', 'mt-gfocus', 'n.pin = true']) assert.ok(mt.includes(k), 'mindtree: ' + k);
  const mm = read('renderer/mindmap.js'), mh = read('renderer/mindmap.html');
  assert.ok(mh.includes('id="mGraph"') && mh.includes('id="askBtn"') && mh.includes('<script src="markdown.js">') && mm.includes("api.mindmap.makeDeck") && mm.includes("api.mindmap.ask") && mm.includes("'contextmenu'"));
  const { backlinks, topicsPrompt, parseTopics, build } = require('../src/mindmap');
  const msg = t => [{ role: 'user', content: t }, { role: 'assistant', content: t }];
  const list = [{ id: 'a', title: 'Python loops', links: ['b'], messages: msg('python loops iterate range python') }, { id: 'b', title: 'Python lists', messages: msg('python lists iterate comprehension python') },
    { id: 'c', title: 'Trip', links: ['a'], messages: msg('japan trip') }, { id: 'd', title: 'Gatsby', messages: msg('gatsby essay') }];
  const bl = backlinks({ list, id: 'a' });
  assert.deepStrictEqual(bl.linked.map(x => x.id), ['c']); assert.deepStrictEqual(bl.linksTo.map(x => x.id), ['b']); assert.ok(!bl.similar.some(x => ['b', 'd'].includes(x.id)));   // 3.13: a chat that's already linked isn't repeated under similar
  assert.ok(topicsPrompt(list).includes('1. Python loops'));
  const tp = parseTopics('Sure! {"topics":[{"name":"Python","chats":[1,2]},{"name":"Travel","chats":[3]}]}', list);
  assert.deepStrictEqual(tp, { a: 'Python', b: 'Python', c: 'Travel' }); assert.strictEqual(parseTopics('no json', list), null);
  const g = build({ list, topics: tp }); assert.ok(g.nodes.some(x => x.id === 'topic:Python') && g.nodes.some(x => x.id === 'topic:Travel'));
  assert.ok(main.includes("ipcMain.handle('mindmap:ask'") && main.includes("flagOn('ask_map')") && main.includes("ipcMain.handle('mindmap:makeDeck'") && main.includes('function smartTopics(') && main.includes("ipcMain.handle('conv:backlinks'"));
  assert.ok(hud.includes('async function showBacklinks(') && html.includes('data-backlinks') && pre.includes("backlinks: id => call('conv:backlinks', id)"));
  ok('mind map: Obsidian-style graph, Ask the map (beta), study deck from a branch, Smarter topics (beta); Backlinks in the ⋯ menu');

  // ---------- continue on my other computer, notices for one person
  assert.ok(main.includes("ipcMain.handle('handoff:send'") && main.includes('async function handoffTick()') && main.includes("key: 'handoff'") && main.includes('Incognito chats stay on this computer'));
  assert.ok(html.includes('data-continue') && hud.includes("api.handoff.send(c.id)"));
  const B = require('../src/broadcasts');
  const rows = [{ id: 1, title: 'a', audience: 'user', to_user: 'me' }, { id: 2, title: 'b', audience: 'user', to_user: 'other' }, { id: 3, title: 'c', audience: 'all' }];
  assert.deepStrictEqual(B.pick(rows, { userId: 'me' }).map(b => b.id), [1, 3]);
  assert.deepStrictEqual(B.pick(rows, {}).map(b => b.id), [3]);
  assert.ok(B.SELECT.includes('to_user') && !B.SELECT_OLD.includes('to_user') && read('docs/companion/app.js').includes("b.to_user === S.user?.id"));
  ok('Continue on my other computer (beta), and notices meant for one person ("🧪 3 things to test") only show to them');

  // ---------- out of beta, new beta flags, SQL
  const { DEFAULTS } = require('../src/flags');
  for (const k of ['second_look', 'branch_chat', 'incognito', 'clip_chips', 'spend_tracker']) assert.strictEqual(DEFAULTS[k].stage, 'all', k);
  for (const k of ['smart_topics', 'ask_map', 'continue_on']) assert.ok(['beta', 'all'].includes(DEFAULTS[k].stage) && DEFAULTS[k].minVersion === '3.10.0', k);
  assert.ok(read('docs/try/try.js').includes("second_look: 'all'"));
  for (const s of ['create table if not exists public.training_pushes', 'function public.training_stage_ok', 'function public.admin_training_undo', 'function public.training_news', 'function public.admin_assign_tests',
    'function public.admin_release_gate', 'function public.admin_free_usage', 'function public.stt_my_usage', 'function public.admin_redeem_for', "interval '2 days'", 'level_worn_at', "update public.feature_flags set stage = 'all'"])
    assert.ok(sql.includes(s), 'sql: ' + s);
  assert.ok(/check \(perm in \([^)]*'training_push'[^)]*'redeem'/.test(sql));
  ok('3.7 features out of beta, three new beta features, and nexus-v3.10.sql (tested on Postgres 16)');

  // ---------- release
  const pkg = JSON.parse(read('package.json')), ch = JSON.parse(read('docs/whats-new/changes.json'));
  const e310 = ch.find(e => e.version === '3.10.0');
  assert.ok(pkg.version.localeCompare('3.10.0', undefined, { numeric: true }) >= 0 && e310);
  assert.ok(!/axiom|apex|cage/i.test(JSON.stringify(e310)) && read('docs/whats-new/feed.xml').includes('3.10.0'));
  ok('3.10.0');
  console.log(`v3.10: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
