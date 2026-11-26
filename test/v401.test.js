// 4.0.1: one page for you, Cirkts/People that see the account, profile synced both ways, clickable widgets, more themes,
// the N28C voice dropdown, Wrapped layout fixes, and the Apoji profile for other apps
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ok = m => console.log('  ✓ ' + m);
(async () => {
  const { createCirkts } = require('../src/cirkts'), { createSocial } = require('../src/social'), cos = require('../renderer/cosmetics');
  // ---- the account is made after Cirkts/People: they must see it once it exists (this was "sign in" while signed in)
  let cloud = null, calls = [];
  const social = createSocial({ cloud: () => cloud });
  await assert.rejects(() => social.friends(), /Sign in/);
  cloud = { session: { accessToken: 't' }, rpc: async (fn, a) => { calls.push([fn, a]); return fn === 'my_friends' ? { friends: [] } : { ok: true }; }, write: async () => ({}) };
  assert.deepStrictEqual(await social.friends(), { friends: [] });
  ok('People sees the account once it is signed in (it was created before sign-in and stayed "signed out")');

  // ---- owns() honors admin "unlock everything"; equip sends only what changed; the account copy is pulled in
  let st = {}, all = false, server = { has_style: true, frame: 'frame:halo', font: 'font:serif', bio: 'from my phone', status_text: 'hi', show_stats: false };
  calls = [];
  cloud = { session: {}, rpc: async (fn, a) => { calls.push([fn, a]); if (fn === 'cirkts_sync') return { ok: true, earned: 500, spent: 0, owned: ['frame:halo', 'font:serif'] }; if (fn === 'my_apoji_profile') return { ok: true, profile: server }; if (fn === 'profile_style_set') return { ok: true }; return { ok: true }; } };
  const cz = createCirkts({ getSettings: () => st, setSettings: p => { st = { ...st, ...p }; }, earned: () => 500, cloud: () => cloud, catalog: cos.CATALOG, all: () => all });
  assert.ok(!cz.owns('frame:prism')); all = true; assert.ok(cz.owns('frame:prism')); all = false;
  await cz.sync(true);
  assert.strictEqual(cz.state().equip.frame, 'frame:halo'); assert.strictEqual(cz.state().equip.bio, 'from my phone'); assert.strictEqual(cz.state().equip.show_stats, false);
  calls = [];
  const r = await cz.equip({ font: 'font:serif' });
  assert.ok(r.ok && r.published === true);
  const sent = calls.find(c => c[0] === 'profile_style_set')[1].p_style;
  assert.deepStrictEqual(sent, { font: 'font:serif' }, 'only the changed key goes up, so a change made in N28C is not overwritten');
  calls = []; await cz.publish({ stats: { streak: 3 } }); assert.deepStrictEqual(calls[0][1].p_style, { stats: { streak: 3 } });
  server = { has_style: false }; st.cirkts.equip = { frame: 'frame:halo' }; calls = []; await cz.sync(true);
  assert.ok(calls.some(c => c[0] === 'profile_style_set' && c[1].p_style.frame === 'frame:halo'), 'no profile on the account yet: this computer sends its own');
  const main = R('main.js');
  assert.ok(main.includes("cloud: () => cloud, catalog: cosmetics.CATALOG, all: () => allSkins()") && main.includes("createSocial({ cloud: () => cloud })"));
  ok('Cirkts: admin unlock lets you use things, profile pulled from the account, only changed keys pushed');

  // ---- SQL
  const sql = R('supabase/nexus-v4.0.1.sql');
  assert.ok(sql.includes('and not public.is_admin() then') && sql.includes('function public.apoji_profiles(p_ids uuid[])') && sql.includes('function public.my_apoji_profile()'));
  assert.ok(sql.includes("'has_style', s.user_id is not null") && sql.includes("f.status = 'blocked'") && sql.includes('revoke all on function public.apoji_profiles(uuid[]) from public, anon'));
  for (const it of cos.CATALOG.filter(x => x.kind === 'theme' && !x.free)) assert.ok((R('supabase/nexus-v4.0.sql') + sql).includes(`('${it.id}', 'theme'`), it.id);
  ok('nexus-v4.0.1.sql: admins can wear anything, apoji_profiles + my_apoji_profile, new shop themes');

  // ---- one page for you (desktop)
  const html = R('renderer/index.html'), set = R('renderer/settings.js');
  assert.ok(!/data-tab="(stats|profile)"/.test(html) && html.includes('id="accJump"') && html.indexOf('id="tab-profile"') > html.indexOf('id="tab-account"') && html.indexOf('id="tab-stats"') > html.indexOf('id="tab-profile"'));
  assert.ok(set.includes("const ACC_ALIAS = { profile: 'pfMain', stats: 'tab-stats', shop: 'pfShop' }") && set.includes('function renderAccount() { renderAccountCards(); renderProfile(); renderStats();'));
  assert.ok(set.includes("$('accId').innerHTML = mustPw + accountCard") && set.includes('Unlock everything in the shop (admin)') && !set.includes("class=\"skin-grid\""));
  ok('Settings: Profile & account is one page (profile, account, shop, stats), old links jump to their section');

  // ---- N28C
  const app = R('docs/companion/app.js');
  assert.ok(app.includes('function shopHtml()') && app.includes("sb.rpc('cirkts_buy'") && app.includes("request('shop_use'") && app.includes('function youFallback()') && app.includes('id="vSel"'));
  assert.ok(!/if \(!st\?\.stats\) \{ v\.innerHTML = noSync/.test(app), 'the You tab never hides your profile behind "nothing from your Mac yet"');
  assert.ok(R('src/companion.js').includes("case 'shop_use'") && main.includes('shopUse: async m =>') && main.includes("shop: () => ({ skin:"));
  ok('N28C: You tab merged (profile, account, shop, stats), shop works from the phone, voice dropdown');

  // ---- widgets, themes, Wrapped
  const dw = R('renderer/deskwidgets.html');
  assert.ok(dw.includes('-webkit-app-region: no-drag; cursor: default; }') && dw.includes('.dw h4 { -webkit-app-region: drag') && R('renderer/deskwidgets.js').includes('new ResizeObserver') && (main.includes('screen.getDisplayMatching(b).workArea') || main.includes('screen.getDisplayMatching(b).bounds')));   // 4.0.2: one window per widget
  const T = R('renderer/theme.js'), css = R('renderer/themes.css');
  for (const id of ['lagoon', 'sunflower', 'lavender', 'coffee', 'midnight', 'cherry']) assert.ok(T.includes(`['${id}',`) && css.includes(`[data-theme="${id}"]`) && R('src/companion.js').includes(`${id}: [`), id);
  for (const id of ['cyber', 'vapor', 'bloodmoon', 'emerald', 'royal', 'toxic']) assert.ok(cos.item('theme:' + id) && cos.APP_THEMES[id] && T.includes(`${id}: {`) && R('src/companion.js').includes(`'shop-${id}'`), id);
  const hud = R('renderer/hud.js'), hcss = R('renderer/hud.css');
  assert.ok(hud.includes('<div class="wr-cal" style="--w:${weeks}">') && hud.includes('class="wr-nm"') && hcss.includes('.wr-cal-m span { white-space: nowrap; overflow: visible; width: 0; }') && hcss.includes('.wrapped .wr-list { overflow: visible;'));
  ok('desktop widgets clickable + not cut off, 6 free + 6 shop themes, Wrapped calendar/agents/@features fit');
  const pkg = JSON.parse(R('package.json'));
  assert.ok(/^4\.\d+\.\d+$/.test(pkg.version) && JSON.parse(R('docs/whats-new/changes.json'))[0].version === pkg.version);
  ok('version ' + pkg.version);
  console.log('v4.0.1: 8 passed');
})().catch(e => { console.error(e); process.exit(1); });
