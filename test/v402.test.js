// 4.0.2: separate desktop widgets, one Profile page (account inside), Free chats + Agents in Models & keys,
// owner-only crown, Discord-style profile (own banner image, own colors, effects, pronouns), more frames
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ok = m => console.log('  ✓ ' + m);
(async () => {
  const main = R('main.js'), set = R('renderer/settings.js'), html = R('renderer/index.html'), cos = require('../renderer/cosmetics');
  // ---- widgets: one window per widget, each remembers its own spot
  assert.ok(main.includes('const deskWins = new Map()') && main.includes("w.loadFile(path.join(__dirname, 'renderer', 'deskwidgets.html'), { query: { k } })") && main.includes('spots: { ...(cur.spots || {}), [k]:') && !/\bdeskWin\b/.test(main));
  assert.ok(main.includes("ipcMain.handle('deskw:arrange'") && R('preload.js').includes("arrange: () => call('deskw:arrange')") && html.includes('id="dwArrange"'));
  ok('desktop widgets: separate windows, each draggable and remembered, "Line them up again"');

  // ---- Profile page
  assert.ok(html.includes('<button data-tab="account">Profile</button>') && html.includes('<section id="pfMain" class="card pf-main"><div id="pfHero"></div><div id="accId"></div></section>'));
  assert.ok(!set.includes('id="nickCard"') && set.includes('id="nickIn"') && set.includes('id="pfPron"') && set.includes('<div class="pf-acct">'));
  const prov = set.slice(set.indexOf('function usageCardsHtml()'));
  assert.ok(prov.includes('<b>Free chats left</b>') && set.includes("$('tab-personas').innerHTML = usageCardsHtml()") && !set.slice(set.indexOf('function renderAccountCards()'), set.indexOf('// 4.0.4: "Free chats left"')).includes('Free chats left'));   // 4.0.4: on the Agents page
  ok('Profile: one page, account inside the profile card; Free chats left + Agents in Models & keys');

  // ---- crown is the Owner's; more items
  const crown = cos.item('frame:crown');
  assert.ok(crown.owner && crown.price === 0);
  const { createCirkts } = require('../src/cirkts');
  let st = {}, boss = false;
  const cz = createCirkts({ getSettings: () => st, setSettings: p => { st = { ...st, ...p }; }, earned: () => 99999, cloud: () => null, catalog: cos.CATALOG, all: () => true, isOwner: () => boss });
  assert.ok(!cz.owns('frame:crown'), 'not even admin "unlock everything" gets the crown');
  assert.strictEqual((await cz.equip({ frame: 'frame:crown' })).ok, false);
  boss = true; assert.ok(cz.owns('frame:crown')); assert.ok((await cz.equip({ frame: 'frame:crown' })).ok);
  for (const id of ['frame:gold', 'frame:frost', 'frame:sakura', 'frame:pulse', 'frame:shadow', 'frame:galaxy', 'frame:rgb', 'ptheme:custom', 'banner:custom', 'effect:sparkle', 'effect:snow', 'effect:rain', 'effect:embers', 'effect:stars']) assert.ok(cos.item(id), id);
  assert.ok(cos.KINDS.some(([k]) => k === 'effect'));
  assert.ok(set.includes('(!x.owner || me.owner)') && R('docs/companion/app.js').includes('(!x.owner || boss)'));
  ok('Gold crown: Owner only (shop, equip, server); 7 frames, effects, custom banner + colors');

  // ---- the card draws a custom banner (only from our storage), custom colors, effect, pronouns
  const url = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co/storage/v1/object/public/avatars/0a0a0a0a-0000-0000-0000-000000000000/banner.gif?v=1';
  let h = cos.card({ nickname: 'Luke', style: { banner: 'banner:custom', banner_url: url, ptheme: 'ptheme:custom', theme_a: '#ff0080', theme_b: '#102030', effect: 'effect:snow', pronouns: 'he/him' } });
  assert.ok(h.includes(`url('${url}')`) && h.includes('linear-gradient(165deg,#ff0080,#102030)') && h.includes('nxp-fx-snow') && h.includes('he/him'));
  h = cos.card({ style: { banner: 'banner:custom', banner_url: 'https://evil.example/x.png', ptheme: 'ptheme:custom', theme_a: 'red;x', theme_b: '#000000' } });
  assert.ok(!h.includes('evil.example') && !h.includes('red;x'));
  // equip rules on this computer
  st = {}; boss = false;
  const cz2 = createCirkts({ getSettings: () => st, setSettings: p => { st = { ...st, ...p }; }, earned: () => 5000, cloud: () => null, catalog: cos.CATALOG });
  assert.strictEqual((await cz2.equip({ theme_a: '#ff0080' })).ok, false, 'needs "Your own colors"');
  await cz2.buy('ptheme:custom'); assert.ok((await cz2.equip({ ptheme: 'ptheme:custom', theme_a: '#ff0080', theme_b: '#102030' })).ok);
  assert.strictEqual((await cz2.equip({ theme_a: 'url(x)' })).ok, false);
  assert.ok((await cz2.equip({ pronouns: 'they/them and a very long tail' })).equip.pronouns.length <= 24);
  ok('profile card: own banner image (our storage only), own colors (hex only), effects, pronouns');

  // ---- SQL
  const sql = R('supabase/nexus-v4.0.2.sql');
  assert.ok(sql.includes("'The crown is only for the Owner.'") && sql.includes('delete from public.cirkts_owned o where o.item_id = \'frame:crown\'') && sql.includes("update public.cosmetics set price = 0, active = false"));
  assert.ok(sql.includes("add constraint cosmetics_kind_check check (kind in ('frame', 'ptheme', 'theme', 'font', 'color', 'banner', 'skin', 'effect'))") && sql.includes("/storage/v1/object/public/avatars/' || me::text || '/banner"));
  for (const it of cos.CATALOG.filter(x => !x.owner && !x.free)) assert.ok((R('supabase/nexus-v4.0.sql') + R('supabase/nexus-v4.0.1.sql') + sql + (fs.existsSync(path.join(__dirname, '../supabase/nexus-v4.0.4.sql')) ? R('supabase/nexus-v4.0.4.sql') : '')).includes(`('${it.id}', '${it.kind}'`), it.id);
  ok('nexus-v4.0.2.sql: crown refunded + locked, effects kind, custom banner/colors validated, pronouns');
  assert.ok(main.includes("ipcMain.handle('cirkts:banner'") && R('src/cloud.js').includes('async uploadBanner(') && R('docs/companion/app.js').includes('async function uploadBanner('));
  ok('banner upload from the computer and from N28C');
  const pkg = JSON.parse(R('package.json'));
  assert.ok(JSON.parse(R('docs/whats-new/changes.json'))[0].version === pkg.version && /^4\.0\.\d+$/.test(pkg.version));
  console.log('v4.0.2: 7 passed');
})().catch(e => { console.error(e); process.exit(1); });
