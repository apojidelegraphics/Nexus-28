// v3.11 tests: the Paragon & Axiom key (premium mode), Settings → Subscription and plan invites, the Nexus guide, new
// models (pop-up, agent menu, Test Run), the mind map in N28C and Test Run, our own icons instead of emojis, the new logo,
// Get a key / See pricing links, and the Windows "Hey Nexus" fixes. (Nothing here reads ../apoji-admin.)
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

(async () => {
  const main = read('main.js'), set = read('renderer/settings.js'), hud = read('renderer/hud.js'), pre = read('preload.js'), html = read('renderer/index.html');
  const sql = read('supabase/nexus-v3.11.sql'), fn = read('supabase/functions/premium-chat/index.ts');

  // ---------- the Paragon & Axiom key
  const access = require('../src/access');
  const paragon = { id: 'paragon', handle: 'paragon' }, axiom = { id: 'axiom', apex: true }, prov = { needsKey: true, label: 'Claude' };
  const base = { provider: prov, hasOwnKey: false, freeKeyEnabled: true, comped: false, unlocked: false, used: 0 };
  assert.strictEqual(access.decide({ ...base, persona: paragon }).mode, 'blocked');
  let d = access.decide({ ...base, persona: paragon, premium: { paragon: { allowed: true, limit: 10, used: 3, tier: 'Pro' } } });
  assert.ok(d.mode === 'premium' && d.agent === 'paragon' && d.limit === 10 && d.used === 3);
  d = access.decide({ ...base, persona: paragon, premium: { paragon: { allowed: true, limit: 10, used: 10, tier: 'Pro' } } });
  assert.ok(d.mode === 'blocked' && /all 10 Paragon tasks/.test(d.reason));
  assert.strictEqual(access.decide({ ...base, persona: paragon, premium: { paragon: { allowed: true, unlimited: true, limit: 25, used: 99 } } }).mode, 'premium');
  assert.strictEqual(access.decide({ ...base, persona: paragon, hasOwnKey: true, premium: { paragon: { allowed: true, limit: 10, used: 0 } } }).mode, 'own', 'your own key wins');
  assert.strictEqual(access.decide({ ...base, persona: axiom, premium: { axiom: { allowed: true } } }).mode, 'premium');
  assert.strictEqual(access.decide({ ...base, persona: axiom, premium: { paragon: { allowed: true, limit: 25, used: 0 } } }).mode, 'blocked', 'Axiom only for people allowed');
  assert.ok(main.includes("cloud.premiumRoute(decision.agent") && main.includes("apex.check(decision.mode === 'premium' ? 'openrouter' : binding.provider)") && main.includes('extraHeaders: route.extraHeaders'));
  assert.ok(read('src/providers.js').includes("...(extraHeaders || {})"));
  const { NexusCloud } = require('../src/cloud');
  const c = new NexusCloud({ loadCache: () => null, saveCache() {} });
  c.session = { accessToken: 'jwt', expiresAt: Date.now() + 3600e3, user: { id: 'u1' } };
  const r = await c.premiumRoute('paragon', 'chat:1');
  assert.ok(r.provider === 'openrouter' && r.model === 'nexus/paragon' && r.key === 'jwt' && r.baseUrl.endsWith('/functions/v1/premium-chat') && r.extraHeaders['X-Nexus-Turn'] === 'chat:1');
  assert.ok(sql.includes('create table if not exists public.premium_turns') && /when 'Max' then 25 when 'Pro' then 10/.test(sql) && sql.includes('calls >= 400'));
  assert.ok(/revoke all on function public\.%s from public, anon, authenticated/.test(sql) && sql.includes("'premium_take(uuid, text, text)'"), 'premium_take is for the Edge Function only');
  assert.ok(fn.includes("Deno.env.get('PREMIUM_API_KEY')") && fn.includes("db.rpc('premium_take'") && fn.includes('orderActive') && !/sk-or-v1-[a-z0-9]{20}/i.test(fn), 'the key is a secret, never in code');
  ok('Paragon & Axiom key: Pro 10 / Max 25 a day, Axiom for people allowed, own key wins, key only on the server');

  // ---------- Subscription + plan invites
  assert.ok(html.includes('data-tab="subscription"') && html.includes('id="tab-subscription"') && set.includes('async function renderSubscription()'));
  for (const k of ["'sub:get'", "'sub:invite'", "'sub:respond'", "'sub:remove'"]) assert.ok(main.includes(k) && pre.includes(k), k);
  assert.ok(set.includes('Renews') && set.includes('data-subinv') && set.includes('data-subacc') && set.includes('Leave this plan') && set.includes('See pricing'));
  assert.ok(sql.includes('create or replace function public.plan_invite') && sql.includes('taken + 1 >= seats') && sql.includes('plan_seats') && sql.includes('my_subscription()'));
  assert.ok(read('src/cloud.js').includes('created_at&order_id=in.'), 'renewal dates need the order date');
  ok('Settings → Subscription: plans, renewals, seats, people, invites to accept');

  // ---------- the Nexus guide
  const guide = require('../src/guide');
  assert.ok(guide.wantsGuide('how do I turn on hey nexus') && guide.wantsGuide('where is the highlight orb setting') && guide.wantsGuide('how many paragon tasks do I get') && !guide.wantsGuide('write me a poem about the sea'));
  const g = guide.search('turn on hey nexus', { settings: { wakeWord: false, web: { enabled: true } }, state: { version: '3.11.0' } });
  assert.ok(g.includes('Settings → Voice → "Hey Nexus"') && g.includes('open_settings tab="voice"') && g.includes("This person's setup") && !g.includes('Routines'));
  assert.ok(guide.search("what's new", {}).includes(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'whats-new', 'changes.json'), 'utf8'))[0].version));
  assert.deepStrictEqual(guide.apply('web.enabled', 'off', { web: { enabled: true, provider: 'duckduckgo' } }).patch, { web: { enabled: false, provider: 'duckduckgo' } });
  assert.strictEqual(guide.apply('theme', 'ARC', {}).patch.theme, 'arc');
  assert.ok(guide.apply('theme', 'purple', {}).error && guide.apply('connectors', '[]', {}).error, 'only whitelisted settings');
  const tools = require('../src/tools');
  assert.ok(tools.needsConfirm('change_setting') && !tools.needsConfirm('nexus_guide') && tools.describe('change_setting', { key: 'wakeWord', value: 'true' }).detail.includes('On'));
  let opened = null; const ctx = { search: q => 'found ' + q, open: t => { opened = t; }, change: () => ({ label: 'Theme → arc' }) };
  assert.strictEqual((await tools.execute('nexus_guide', { query: 'x' }, { guide: ctx })).content, 'found x');
  await tools.execute('open_settings', { tab: 'voice' }, { guide: ctx }); assert.strictEqual(opened, 'voice');
  assert.ok((await tools.execute('change_setting', { key: 'theme', value: 'arc' }, { guide: ctx })).content.includes('Done'));
  assert.ok(main.includes('guide.wantsGuide(') && main.includes('guide.NOTE') && main.includes('function applySettings(patch)') && main.includes('guide: guideCtx()'));
  ok('Nexus guide: answers from the app, opens Settings, changes a setting only after you OK it');

  // ---------- new models
  assert.ok(sql.includes('create table if not exists public.agent_releases') && sql.includes("stage in ('off', 'admin', 'beta', 'all')"));
  assert.ok(main.includes('function releasePersonas(core)') && main.includes("broadcast('releases:new'") && main.includes('seenReleases') && pre.includes("onNewModels: on('releases:new')"));
  assert.ok(html.includes('id="newModelModal"') && hud.includes('function showNewModel()') && hud.includes("p.isNew ? '<span class=\"am-new\">NEW</span>'"));
  const tr = read('docs/try/try.js');
  assert.ok(tr.includes('async function loadReleases()') && tr.includes('function newModelPop(') && tr.includes("agent: agent().base || S.agent"));
  ok('new models: in every app, NEW tag, a pop-up the first time');

  // ---------- mind map in N28C and Test Run
  const sync = require('../scripts/sync-companion').build();
  for (const f of ['mindtree.js', 'mindmap-lib.js', 'mapview.js', 'icons.js']) assert.strictEqual(read('docs/companion/' + f), sync[f], f + ' is in sync (npm run sync:companion)');
  const comp = read('docs/companion/app.js'), tryHtml = read('docs/try/index.html');
  assert.ok(comp.includes('id="chatSearch"') && comp.indexOf('id="chatSearch"') < comp.indexOf('id="mapBtn"'), 'N28C: right of the search');
  assert.ok(tryHtml.indexOf('id="mapBtn"') < tryHtml.indexOf('id="chatSearch"'), 'Test Run: left of the search');
  const vm = require('vm'); const box = { globalThis: {} }; box.globalThis = box; vm.createContext(box); vm.runInContext(read('docs/companion/mindmap-lib.js'), box);
  const m = box.ChatMap.build({ list: [{ id: 'a', title: 'Python lists', messages: [{ role: 'user', content: 'python lists loops' }] }, { id: 'b', title: 'Python loops', messages: [{ role: 'user', content: 'python loops lists' }] }] });
  assert.ok(m.nodes.filter(x => x.kind === 'chat').length === 2 && !('words' in box), 'browser copy keeps its names to itself');
  ok('mind map in N28C (right of search) and Test Run (left of search)');

  // ---------- icons, no emojis
  const icons = read('renderer/icons.js');
  assert.ok(icons.includes('W.NexusIcons =') && icons.includes(".msg .body"), 'icons skip what people wrote');
  for (const e of ['🃏', '☀', '🌧', '🕶', '📁', '💡', '🏆', '🎨', '🎓']) assert.ok(icons.includes(`'${e}'`), e);
  for (const p of ['renderer/index.html', 'renderer/quick.html', 'renderer/quickchat.html', 'renderer/mindmap.html', 'docs/companion/index.html', 'docs/try/index.html', 'docs/index.html', 'docs/whats-new/index.html']) assert.ok(read(p).includes('icons.js'), p);
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(read('README.md')), 'README has no emojis');
  assert.ok(main.includes('no emojis in notifications') && read('scripts/release-notes.js').includes('noEmoji'));
  const ch = JSON.parse(read('docs/whats-new/changes.json')).find(e => e.version === '3.11.0');
  assert.ok(ch.version === '3.11.0' && !ch.highlights.join(' ').match(/[\u{1F300}-\u{1FAFF}]/u) && !/axiom/i.test(JSON.stringify(ch)));
  ok('our own icons everywhere; no emojis in the README, notifications or release notes');

  // ---------- the new logo
  const png = f => { const b = fs.readFileSync(path.join(root, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepStrictEqual(png('assets/icon.png'), [1024, 1024]); assert.deepStrictEqual(png('assets/trayTemplate@2x.png'), [36, 36]); assert.deepStrictEqual(png('docs/companion/icon-512.png'), [512, 512]);
  assert.ok(read('assets/logo.svg').includes('<polygon') && fs.existsSync(path.join(root, 'assets/Nexus.icon/Assets/Hex.png')));
  const icon = JSON.parse(read('assets/Nexus.icon/icon.json'));
  assert.deepStrictEqual(icon.groups.flatMap(x => x.layers.map(l => l['image-name'])).sort(), ['Hex.png', 'N.png', 'Stars.png']);
  assert.ok(html.includes('class="hex-n"') && read('renderer/quickchat.html').includes('class="hex-n"'));
  ok('the new logo: app icon, Icon Composer layers, menu bar, N28C / Test Run / website icons, header');

  // ---------- links + Windows Hey Nexus
  assert.ok(hud.includes("document.addEventListener('click'") && /openExternal/.test(hud), 'Get a key ↗ opens in the browser');
  const site = read('docs/index.html');
  assert.ok(site.includes('id="seePricing"') && site.includes('https://apojidelegraphics.github.io/aArgon3/'));
  const wh = read('src/winhelper.js');
  assert.ok(wh.includes("'-Mta'") && wh.includes('Windows speech stopped answering') && main.includes("ipcMain.handle('diag:copy'") && set.includes('diagCopy'));
  assert.ok(JSON.parse(read('package.json')).version.localeCompare('3.11.0', undefined, { numeric: true }) >= 0);
  ok('Get a key, See pricing, Windows Hey Nexus fixes, Copy diagnostics, version 3.11.0');

  console.log(`v3.11: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
