// 4.0.4: frames rebuilt + new ones, profile frames, status (synced with Admin), display name, custom name color, every
// app theme in the shop, bundled fonts, see-through slider, Nexus-style mind map window, widget spots, settings moves
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ok = m => console.log('  ✓ ' + m);
(async () => {
  const cos = require('../renderer/cosmetics'), main = R('main.js'), set = R('renderer/settings.js'), html = R('renderer/index.html'), app = R('docs/companion/app.js');
  // ---- frames + profile frames + fonts
  const frames = cos.CATALOG.filter(x => x.kind === 'frame').map(x => x.key);
  for (const k of ['storm', 'vines', 'void', 'hex', 'pixel', 'aurora']) assert.ok(frames.includes(k), k);
  for (const k of frames) assert.ok(cos.CSS.includes(`.nxp-f-${k}`), 'css ' + k);
  const pf = cos.CATALOG.filter(x => x.kind === 'pframe');
  assert.ok(pf.length >= 10 && cos.KINDS.some(([k]) => k === 'pframe'));
  for (const x of pf.filter(x => x.key !== 'mine')) assert.ok(cos.CSS.includes(`.nxp-pf-${x.key}`), 'pframe css ' + x.key);   // 4.0.6: "mine" is drawn from what you made
  for (const f of ['nxp-pixel', 'nxp-hand', 'nxp-rounded', 'nxp-display']) for (const d of ['renderer/fonts', 'docs/companion/fonts', '../apoji-admin/fonts']) { if (d.startsWith('..') && !fs.existsSync(path.join(__dirname, '..', d))) continue; assert.ok(fs.existsSync(path.join(__dirname, '..', d, f + '.woff2')), d + '/' + f); }
  assert.ok(R('renderer/cosmetics.js').includes("new URL('fonts/', src)") && cos.FONTS.pixel.startsWith("'NXP Pixel'") && R('renderer/fonts/FONTS-LICENSE.txt').includes('Open Font License'));
  ok('picture frames rebuilt + 6 new, 10 profile frames, fonts bundled (OFL) for app, N28C, Test Run and Admin');
  // ---- card: display name, status, owner crown, custom name color
  let h = cos.card({ nickname: 'Luke', username: 'apoji', owner: true, online: true, style: { display_name: 'Apoji', presence: 'dnd', color: 'color:custom', name_a: '#ff0080', name_b: '#00ffaa', pframe: 'pframe:holo' } });
  assert.ok(h.includes('>Apoji<') && h.includes('do not disturb') && h.includes('nxp-crown') && h.includes('linear-gradient(90deg,#ff0080,#00ffaa,#ff0080)') && h.includes('nxp-pf-holo'));
  assert.ok(!cos.card({ online: true, style: { presence: 'invisible' } }).includes('invisible'), 'invisible looks offline to others');
  assert.ok(cos.card({ online: true, self: true, style: { presence: 'invisible' } }).includes('invisible'), 'but you see it on yours');
  assert.ok(!cos.card({ style: { color: 'color:custom', name_a: 'red;x' } }).includes('red;x'));
  ok('profile card: display name, status (invisible hidden from others), owner crown, custom name color, profile frame');
  // ---- every app theme in the shop
  const free = cos.CATALOG.filter(x => x.kind === 'theme' && x.free).map(x => x.key);
  for (const k of ['green', 'arc', 'nebula', 'synthwave', 'lagoon', 'cherry']) assert.ok(free.includes(k), k);
  assert.ok(set.includes('data-mytheme=') && set.includes("await save({ theme: it.free ? it.key : 'shop-' + it.key })") && main.includes("cosmetics.item('theme:' + key)?.free ? key"));
  ok('every free theme + your own themes in the shop, next to the ones you buy');
  // ---- status + names in Settings and N28C; SQL
  assert.ok(set.includes('data-pres=') && set.includes('id="pfDisp"') && set.includes("api.cirkts.presence(") && R('preload.js').includes("presence: st => call('cirkts:presence', st)"));
  assert.ok(app.includes("sb.rpc('set_my_presence'") && app.includes('display_name: String(disp)') && app.includes('data-fview='));
  const { createCirkts } = require('../src/cirkts'); let st = {}; const calls = [];
  const cz = createCirkts({ getSettings: () => st, setSettings: p => { st = { ...st, ...p }; }, earned: () => 5000, cloud: () => ({ session: {}, rpc: async (f, a) => { calls.push([f, a]); return { ok: true }; } }), catalog: cos.CATALOG });
  assert.ok((await cz.presence('idle')).ok && calls.some(c => c[0] === 'set_my_presence' && c[1].p_status === 'idle'));
  assert.strictEqual((await cz.equip({ name_a: '#ff0000' })).ok, false, 'needs "Your own color"');
  assert.strictEqual((await cz.equip({ display_name: '  Lucas  ' })).equip.display_name, 'Lucas');
  const sql = R('supabase/nexus-v4.0.4.sql');
  assert.ok(sql.includes('function public.set_my_presence(p_status text)') && sql.includes('create trigger admin_prefs_presence_sync') && sql.includes("case st when 'online' then 'auto' else st end") && sql.includes("<> 'invisible'"));
  ok('status online/idle/dnd/invisible: Settings + N28C, synced with Apoji Admin (both ways); display name; SQL');
  // ---- view profiles
  assert.ok(R('renderer/people.js').includes('window.NexusPeople.view = view') && R('renderer/study.js').includes('data-pview=') && set.includes("id=\"pfFindGo\""));
  ok('view anyone\'s profile: Profile page lookup, Spaces chat names and pictures, N28C friends');
  // ---- window, mind map, widgets, settings layout, regen buttons
  assert.ok((html.includes('id="glassRange"') || R('renderer/settings.js').includes('id="glassRange"')) && R('renderer/theme.js').includes("root.style.setProperty('--glass'") && R('renderer/hud.css').includes('color-mix(in srgb, var(--bg) calc(var(--glass, 1) * 100%), transparent)') && (main.includes("hud.setVibrancy(see > 0 ? null : 'under-window')") || main.includes("hud.setVibrancy(see > 0 && !frost ? null : 'under-window')")));
  assert.ok(main.includes("title: 'Mind map of your chats', frame: false, transparent: true") && R('renderer/mindmap.html').includes('data-win="close"') && main.includes("ipcMain.on('win:ctl'"));
  assert.ok(main.includes("w.on('moved', keep); w.on('move',") && (main.includes('a widget near the bottom of the screen moves up') || main.includes('would run off the bottom of the screen moves up')));
  const you = html.slice(html.indexOf('<div class="tab-group">YOU</div>'), html.indexOf('<div class="tab-group">AI</div>'));
  assert.ok(you.includes('data-tab="providers"') && set.includes("$('tab-personas').innerHTML = usageCardsHtml()"));
  assert.ok(R('renderer/chatview.css').includes('.mt-btn.regen-more { width: 16px; margin-left: -4px; border-radius: 0 6px 6px 0; }'));
  ok('see-through slider (Mac + Windows), Nexus-style mind map window, widgets remember spots + move up, Models & keys in You, regen split button');
  const pkg = JSON.parse(R('package.json')); assert.strictEqual(JSON.parse(R('docs/whats-new/changes.json'))[0].version, pkg.version);
  console.log('v4.0.4: 7 passed');
})().catch(e => { console.error(e); process.exit(1); });
