// 4.1.0: quests, profile visitors, animated banners, limited items, agent memory cards, Ask my Spaces, smart widgets,
// uploads that put themselves on, widgets that don't creep, per-platform flags, published release notes
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const main = R('main.js'), set = R('renderer/settings.js'), sql = R('supabase/nexus-v4.1.0.sql'), cos = require('../renderer/cosmetics'), app = R('docs/companion/app.js');
ok('daily quests: three a day (easy, medium, bigger), each pays, all three pay a bonus, counted across computers', () => {
  const ch = require('../src/challenges'), { Metrics, combine } = require('../src/metrics');
  const q = ch.questsForDay(Date.parse('2026-11-26T12:00:00')); assert.strictEqual(q.length, 3); assert.deepStrictEqual(q.map(x => x.reward), [15, 20, 30]);
  assert.deepStrictEqual(ch.questsForDay(Date.parse('2026-11-26T09:00:00')).map(x => x.id), q.map(x => x.id));   // same all day
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'q')), m = new Metrics({ dir }), p0 = m.summary().points;
  // do every quest in the list, so the test passes whichever three today's date picks
  for (let i = 0; i < 12; i++) m.record('chat', { agent: 'flash', voice: true, features: ['Seek', 'Cognition', 'Synergy'] });
  for (const q of ch.QUESTS) if (!['chats', 'voice', 'featureKinds'].includes(q.event)) for (let i = 0; i < q.n; i++) m.record(q.event);
  for (const q of ch.QUESTS) assert.ok(ch.progress(q, m.raw().day) >= q.n, 'quest not done by the test: ' + q.id);
  const s = m.quests(); assert.strictEqual(s.done, 3); assert.ok(s.all);
  assert.ok(m.summary().points - p0 >= 15 + 20 + 30 + ch.QUEST_ALL);
  const merged = combine({ ...m.raw(), since: 1 }, [{ since: 2, quests: { day: m.raw().quests.day, done: ['x'], total: 4 } }], m.raw().quests.day);
  assert.ok(merged.quests.done.includes('x') && merged.quests.total >= 4);
  assert.ok(set.includes('quests-card') && app.includes("TODAY'S QUESTS") && R('renderer/hud.js').includes("a.kind === 'quest' ? 'DAILY QUEST'"));
});
ok('profile visitors: recorded when you open someone, shown in Profile, N28C and a widget; invisible = someone', () => {
  assert.ok(R('renderer/people.js').includes('api.social.visit?.(p.id)') && app.includes("sb.rpc('profile_visit'") && app.includes("sb.rpc('my_profile_visitors'"));
  assert.ok(set.includes('async function paintVisitors') && R('renderer/deskwidgets.js').includes("'PROFILE VISITORS'"));
  assert.ok(sql.includes('create table if not exists public.profile_visits') && sql.includes("coalesce(s.presence, 'online') = 'invisible' as hidden") && /profile_visit\(p_user uuid\)[\s\S]*?p_user = me then return/.test(sql));
});
ok('animated banners and this month\'s limited items, sold only in their month (app and server)', () => {
  for (const id of ['banner:rainglass', 'banner:drift', 'banner:lava', 'banner:synthsun', 'banner:livelights', 'banner:neonrain']) { assert.ok(cos.item(id), id); assert.ok(cos.CSS.includes('.nxp-b-' + id.split(':')[1]), id); assert.ok(sql.includes(`('${id}',`), id); }
  const s = cos.season(Date.parse('2026-12-10T12:00:00')); assert.strictEqual(s.name, 'December'); assert.ok(s.items.length >= 3 && s.daysLeft === 22);
  assert.ok(!cos.inSeason(cos.item('frame:hearts'), Date.parse('2026-11-26')) && cos.inSeason(cos.item('frame:harvest'), Date.parse('2026-11-26')) && cos.inSeason(cos.item('frame:neon')));
  for (const ids of Object.values(cos.SEASONS)) for (const id of ids) { assert.ok(cos.item(id)?.months, id); const k = id.split(':'); assert.ok(cos.CSS.includes(k[0] === 'frame' ? '.nxp-f-' + k[1] : k[0] === 'pframe' ? '.nxp-pf-' + k[1] : k[0] === 'effect' ? '.nxp-fx-' + k[1] : k[0] === 'wtheme' ? '.nxp-wt-' + k[1] : '.nxp-b-' + k[1]), id); }
  assert.ok(cos.KINDS[0][0] === 'limited' && set.includes("shopKind === 'limited' ? sea.items") && app.includes("S.shopK === 'limited' ? sea.items"));
  assert.ok(R('src/cirkts.js').includes('only in the shop during its month') && /only in the shop during (its|their) month/.test(sql) && sql.includes('{"months": [11]}'));
});
ok('what an agent knows: memory you can forget, rules, history with that agent', () => {
  assert.ok(main.includes("ipcMain.handle('agents:knows'") && set.includes('async function knowsCard') && set.includes('data-forget=') && set.includes('data-knows='));
});
ok('Ask my Spaces: posts and chat from every Space go to the agent for that answer only; Mac, ⌘K and N28C', () => {
  assert.ok(main.includes('async function askSpaces') && main.includes('noTools: true, noMemory: true') && main.includes("ipcMain.handle('spaces:ask'"));
  assert.ok(R('src/companion.js').includes("case 'ask_spaces'") && app.includes("request('ask_spaces'") && R('renderer/study.js').includes('spAskGo') && R('renderer/hud.js').includes("'Ask my Spaces…'"));
});
ok('new widgets: Next up, quests, jot, visitors', () => {
  for (const k of ['nextup', 'quests', 'jot', 'visitors']) assert.ok(main.includes(`'${k}'`) && R('renderer/deskwidgets.js').includes(`k === '${k}'`), k);
  assert.ok(main.includes('function nextUp(') && main.includes('function jotAdd(') && R('renderer/deskwidgets.html').includes("img-src 'self' data: https:"));
});
ok('fixes: uploads put themselves on (app + approval + already approved), widgets measured against the whole screen', () => {
  assert.ok(main.includes("await cirkts.equip({ [part]: part + ':mine' })") && sql.includes("frame = 'frame:mine', custom = jsonb_set") && sql.includes('where frame_img is not null and coalesce(custom #>>'));
  assert.ok(main.includes('const ny = b.y + nh > sb.y + sb.height ?') && !main.includes('wa.y + wa.height - 10 - nh'));
  assert.ok(R('renderer/study.js').includes('frameImg: p.style?.frame_img') && app.includes('frameImg: p.style?.frame_img'));
});
ok('feature flags can be limited to platforms; published release notes show up', () => {
  const { resolve } = require('../src/flags');
  const r = (platform) => resolve({ remote: [{ key: 'plat_test', stage: 'all', platforms: ['windows'] }], platform }).flags.plat_test.on;
  assert.ok(r('windows') && !r('mac') && resolve({ remote: [{ key: 'plat_test', stage: 'all', platforms: [] }], platform: 'mac' }).flags.plat_test.on);
  assert.ok(R('src/cloud.js').includes("feature_flags?select=*") && R('docs/try/try.js').includes("includes('test_run')"));
  assert.ok(R('docs/whats-new/index.html').includes('/rest/v1/release_notes?') && main.includes('release_notes?select=version,title,date,highlights'));
});
ok('version first in What\'s new', () => { assert.strictEqual(JSON.parse(R('docs/whats-new/changes.json'))[0].version, JSON.parse(R('package.json')).version); });
console.log(`v4.1.0: ${n} passed`);
// one key per API group in preload (a second `spaces:` once replaced the first)
{ const keys = (R('preload.js').match(/^  ([a-zA-Z]+): \{/gm) || []).map(s => s.trim()); const d = keys.filter((k, i) => keys.indexOf(k) !== i); assert.deepStrictEqual(d, [], 'preload groups defined twice: ' + d); console.log('  ✓ preload: no API group defined twice'); }
