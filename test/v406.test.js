// 4.0.6: sets, Ember remade, make your own, friends' details, see-through moved + frosted, widgets keep their spot,
// 3.10 beta features out of beta
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const cos = require('../renderer/cosmetics'), sql = R('supabase/nexus-v4.0.6.sql'), main = R('main.js'), set = R('renderer/settings.js');

ok('every set is made of real shop items, and the app and the database agree on them', () => {
  assert.strictEqual(cos.PACKS.length, 9); assert.strictEqual(cos.KINDS[0][0], 'pack');
  for (const p of cos.PACKS) {
    for (const id of p.items) assert.ok(cos.item(id), p.id + ' ' + id);
    const row = sql.match(new RegExp(`\\('${p.id}', '[^']+', array\\[([^\\]]+)\\]`)); assert.ok(row, 'SQL has ' + p.id);
    assert.deepStrictEqual(row[1].split(',').map(x => x.trim().replace(/'/g, '')), p.items, p.id);
  }
});
ok('a set costs 25% less than the pieces you still need, rounded to 10 like the server', () => {
  const p = cos.pack('pack:ember'), all = cos.packPrice(p), some = cos.packPrice(p, id => id === 'frame:flame');
  assert.strictEqual(all.full, p.items.map(cos.item).filter(i => !i.free).reduce((a, i) => a + i.price, 0));
  assert.strictEqual(all.price, Math.round(all.full * 0.75 / 10) * 10);
  assert.strictEqual(some.full, all.full - 700); assert.ok(!some.left.includes('frame:flame'));
  assert.strictEqual(cos.packPrice(p, () => true).left.length, 0);
  assert.ok(sql.includes('round(full_price * (1 - pk.off) / 10.0) * 10'));
});
ok('new pieces are in the database too, and Inferno is called Ember', () => {
  for (const id of ['pframe:sakura', 'pframe:aurora', 'ptheme:frost', 'effect:petals', 'frame:mine', 'pframe:mine', 'effect:mine']) { assert.ok(cos.item(id), id); assert.ok(sql.includes(`('${id}',`), id); }
  assert.strictEqual(cos.item('pframe:flame').name, 'Ember'); assert.ok(sql.includes("('pframe:flame', 'pframe', 'Ember', 800"));
  // the old Ember frame grew and shrank the whole border; the new one never scales
  assert.ok(!/\.nxp-pf-flame \.nxp-pfx \{[^}]*nxpHeat/.test(cos.CSS) && cos.CSS.includes('@keyframes nxpEmberFlow') && cos.CSS.includes('.nxp-pf-flame .nxp-pfg::after'));
});
ok('things you make are cleaned before anyone draws them', () => {
  const c = cos.cleanCustom({ frame: { style: 'evil', a: 'red;background:url(x)', width: 99, anim: '<x>' }, effect: { shape: 'hearts', a: '#ff00aa', amount: 9 } });
  assert.deepStrictEqual([c.frame.style, c.frame.a, c.frame.width, c.frame.anim], ['ring', '#3dffa0', 5, 'spin']);
  assert.strictEqual(c.effect.amount, 3); assert.strictEqual(c.effect.a, '#ff00aa');
  const html = cos.card({ username: 'x', style: { frame: 'frame:mine', pframe: 'pframe:mine', effect: 'effect:mine', custom: { frame: { a: '#123456' }, pframe: { style: 'image' } }, overlay_img: 'https://evil.com/x.png', frame_img: 'javascript:alert(1)' } });
  assert.ok(html.includes('--ca:#123456') && !html.includes('evil.com') && !html.includes('javascript:') && html.includes("nxp-fx-mine"));
  assert.ok(!cos.effectTile(c.effect).includes("'"));   // goes inside url('…') in a style attribute
  // pictures only from your own folder, and only the approved one shows to others (pending: just you)
  const u = 'https://abc.supabase.co/storage/v1/object/public/avatars/00000000-0000-0000-0000-00000000000a/overlay.png?v=1';
  assert.ok(cos.card({ style: { pframe: 'pframe:mine', custom: { pframe: { style: 'image' } }, overlay_pending: u } }).indexOf(u) < 0);
  assert.ok(cos.card({ self: true, style: { pframe: 'pframe:mine', custom: { pframe: { style: 'image' } }, overlay_pending: u } }).includes(u));
  assert.ok(sql.includes("'/' || p_kind || '\\.(webp|png|gif)") && sql.includes('frame_img = u.url') && /admin_cosmetic_review[\s\S]*?if not public\.is_admin\(\)/.test(sql));
});
ok('make your own is a beta (flag + hidden items), checked in main too', () => {
  const flags = require('../src/flags');
  assert.strictEqual(flags.DEFAULTS.make_your_own.stage, 'beta');
  for (const k of ['smart_topics', 'ask_map', 'continue_on']) assert.strictEqual(flags.DEFAULTS[k].stage, 'all', k);
  assert.ok(sql.includes("update public.feature_flags set stage = 'all', updated_at = now() where key in ('smart_topics', 'ask_map', 'continue_on')"));
  assert.ok(set.includes('(!x.beta || cz.mine)') && main.includes("const mineOn = () => flagOn('make_your_own')") && main.includes("if (!mineOn()) return { ok: false, error: 'Make your own is in beta right now.' }"));
  assert.ok(R('docs/companion/app.js').includes('&& !x.beta)'));
  assert.ok(!R('renderer/mindmap.html').includes('>BETA<') && !R('renderer/hud.js').includes("'to your Mac · BETA'"));
});
ok("friends' details only for friends; the card shows them", () => {
  assert.ok(/'more', case when \(select r from rel\) in \('self', 'friend'\)/.test(sql));
  assert.ok(sql.includes("case when s.show_stats and (select r from rel) in ('self', 'friend') then 'nothing' else 'extra' end"));
  const h = cos.detailsHtml({ online: false, style: { extra: { fav_agent: 'Neo<b>', badges: ['<img>'] } }, more: { since: '2025-01-02', active_on: ['mac', 'phone'], mutual: 2, friends: 5, spaces: ['<s>'] } });
  assert.ok(h.includes('Mac, N28C') && h.includes('2 you both know') && h.includes('Neo&lt;b&gt;</b>') && !h.includes('<img>') && !h.includes('<s>') && !h.includes('&amp;lt;'));
  assert.ok(R('renderer/people.js').includes('NC().detailsHtml(p)') && main.includes("cirkts.publishExtra({ fav_agent"));
});
ok('see-through: in App themes, smooth, on/off and frosted; General has no theme picker', () => {
  const html = R('renderer/index.html');
  assert.ok(!html.includes('id="themeSelect"') && !html.includes('id="glassRange"') && html.includes('id="teHome" hidden') && html.includes('id="goThemes"'));
  assert.ok(set.includes('id="glassRange" min="0" max="85" step="1"') && set.includes('id="frostOn"') && set.includes('id="glassOn"'));
  assert.ok(main.includes("hud.setVibrancy(see > 0 && !frost ? null : 'under-window')") && main.includes("setBackgroundMaterial?.(frost ? 'acrylic' : 'none')"));
  const root = { style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty() {} }, dataset: {}, cls: new Set(), classList: { toggle(c, on) { on ? root.cls.add(c) : root.cls.delete(c); } } };
  const ctx = { window: {}, document: { documentElement: root, getElementById: () => ({}), createElement: () => ({}), head: { appendChild() {} } } };
  vm.runInNewContext(R('renderer/theme.js'), ctx);
  const T = ctx.window.NexusTheme;
  T.apply({ glass: 40, frost: true }, root); assert.strictEqual(root.style.props['--glass'], '0.6'); assert.ok(root.cls.has('frosted'));
  T.apply({ glass: 40, glassOn: false }, root); assert.strictEqual(root.style.props['--glass'], '1'); assert.ok(!root.cls.has('see-through'));
});
ok('desktop widgets: saved without window events, on quit, and pulled back onto a screen', () => {
  assert.ok(main.includes("deskPoll = setInterval(() => { for (const [k, w] of deskWins) deskKeep(k, w, 'check'); }, 2000)") && main.includes("app.on('before-quit', () => { for (const [k, w] of deskWins) deskKeep(k, w, 'quit'); })"));
  assert.ok(main.includes('screen.getDisplayNearestPoint') && R('test/widgets-smoke.js').includes('WSMOKE OK'));
});
ok('this version is first in What\'s new', () => {
  const pkg = JSON.parse(R('package.json')), ch = JSON.parse(R('docs/whats-new/changes.json'));
  assert.strictEqual(ch[0].version, pkg.version); assert.ok(!/axiom/i.test(ch[0].highlights.join(' ')));
});
console.log(`v4.0.6: ${n} passed`);
