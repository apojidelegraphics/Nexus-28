// v1.9 tests: Shared Spaces on the Mac, Send to phone, N28C is public (flag retired), admin "unlock every skin",
// and the macOS 26 app icon (Icon Composer bundle + flat fallback on Apple's grid).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

(async () => {
  // ---- Shared Spaces (Mac side) against a pretend Supabase
  const { SharedSpaces } = require('../src/sharedspaces');
  const { Study } = require('../src/study');
  const study = new Study({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'nx19-')) });
  const k = study.createDeck({ name: 'Cells' });
  study.addCards(k.id, [{ front: 'Powerhouse?', back: 'Mitochondria' }, { front: 'Control center?', back: 'Nucleus' }]);
  const SID = '11111111-2222-3333-4444-555555555555', PID = '99999999-2222-3333-4444-555555555555';
  const calls = [];
  const posts = [{ id: PID, user_id: 'sam', nickname: 'Sam', kind: 'deck', content: 'Shared bio', data: { cards: [{ front: 'DNA shape?', back: 'Double helix' }] }, created_at: '2026-11-14T00:00:00Z' }];
  const cloud = {
    session: { user: { id: 'me' } },
    authedGet: async p => {
      calls.push(['GET', p]);
      if (p.startsWith('shared_spaces?')) return [{ id: SID, name: 'Bio crew', code: 'K7Q2XD', color: '#3dffa0', owner: 'me' }];
      if (p.startsWith('shared_space_posts?select=content')) return [posts[0]];
      if (p.startsWith('shared_space_posts')) return posts.slice().reverse();
      if (p.startsWith('shared_space_members')) return [{ user_id: 'me', nickname: 'Luke', streak: 3 }];
      return [];
    },
    write: async (m, p, body) => { calls.push([m, p, body]); if (p.startsWith('rpc/')) return { id: SID, name: body.p_name || 'Bio crew', code: 'K7Q2XD' }; if (m === 'POST' && p === 'shared_space_posts') posts.push({ id: 'n' + posts.length, user_id: 'me', ...body }); return null; }
  };
  let nick = 'Luke';
  const asked = [];
  const sp = new SharedSpaces({ cloud, study, nick: () => nick, setNick: v => { nick = v; },
    runAsk: async a => { asked.push(a); return { ok: true, text: 'Prophase, metaphase…', persona: 'flash', color: '#ffd36b', name: 'Flash' }; } });
  assert.strictEqual((await sp.create({ name: 'Bio crew', nick: 'Lucas' })).space.code, 'K7Q2XD');
  assert.strictEqual(nick, 'Lucas'); assert.ok(calls.some(c => c[1] === 'rpc/create_shared_space' && c[2].p_nickname === 'Lucas'));
  await assert.rejects(sp.join({ code: 'nope!' }), /6 letters/);
  await sp.join({ code: 'k7q 2xd' }); assert.ok(calls.some(c => c[1] === 'rpc/join_shared_space' && c[2].p_code === 'K7Q2XD'));
  const f = await sp.feed(SID); assert.strictEqual(f.space.name, 'Bio crew'); assert.strictEqual(f.posts[0].id, PID);
  await assert.rejects(sp.feed('../../etc'), /Unknown space/);
  ok('create / join (code cleaned) / feed; bad ids refused');

  await sp.post(SID, { content: 'hi all' });
  await assert.rejects(sp.post(SID, { content: '   ' }));
  await sp.ask(SID, { text: 'phases of mitosis?', agent: 'flash' });
  const ai = posts.find(p => p.kind === 'ai');
  assert.ok(ai && ai.nickname === 'Flash · for Lucas' && ai.data.q === 'phases of mitosis?' && asked[0].spaceName === 'Bio crew' && asked[0].context.includes('hi all'));
  ok('post a message; ask an agent for the group (answer posted with context)');

  const shared = await sp.shareDeck(SID, k.id); assert.strictEqual(shared.shared, 2);
  assert.strictEqual(posts.at(-1).kind, 'deck'); assert.strictEqual(posts.at(-1).data.cards.length, 2);
  const took = await sp.takeDeck(SID, PID); assert.strictEqual(took.added, 1); assert.ok(study.decks().some(d => d.name === 'Shared bio'));
  ok('share a deck; add a friend’s deck to mine');

  await sp.updateStats(); assert.ok(calls.some(c => c[0] === 'PATCH' && c[1] === 'shared_space_members?user_id=eq.me' && 'streak' in c[2]));
  await sp.leave(SID); assert.ok(calls.some(c => c[0] === 'DELETE' && c[1].includes('shared_space_members') && c[1].includes('user_id=eq.me')));
  await sp.remove(SID); assert.ok(calls.some(c => c[0] === 'DELETE' && c[1].includes(`shared_spaces?id=eq.${SID}&owner=eq.me`)), 'only the owner can delete');
  const nos = new SharedSpaces({ cloud: { session: null }, study, nick: () => 'x', setNick() {}, runAsk: async () => ({}) });
  await assert.rejects(nos.list(), /Sign in/);
  ok('streak sync, leave, owner-only delete, needs sign-in');

  // ---- N28C is public; admin skins; send to phone
  const F = require('../src/flags');
  assert.ok(!F.DEFAULTS.phone_companion && !F.resolve({ remote: [{ key: 'phone_companion', stage: 'beta' }] }).flags.phone_companion);
  const main = read('main.js');
  assert.ok(!/flagOn\('phone_companion'\)/.test(main), 'no beta gate on the phone app');
  assert.ok(/const allSkins = \(\) => flagState\(\)\.realChannel === 'admin' && store\.getSettings\(\)\.beta\?\.allSkins === true/.test(main) && /allSkins\(\) \|\| \(metrics/.test(main));
  for (const s of ["'phone:send'", "'phone:sendClipboard'", "'shared:ask'", "'shared:takeDeck'", "put('outbox'"]) assert.ok(main.includes(s), s);
  const settings = read('renderer/settings.js');
  assert.ok(settings.includes("'phone'") && settings.includes('function renderPhone') && settings.includes('id="allSkins"') && settings.includes('id="phoneCard"'));
  assert.ok(!/\$\('tab-beta'\)[\s\S]{0,4000}phoneCard/.test(settings.slice(settings.indexOf('async function renderBeta'), settings.indexOf('async function renderPhone'))), 'phone card moved out of the Beta tab');
  assert.ok(read('renderer/index.html').includes('data-tab="phone"'));
  assert.ok(read('renderer/study.js').includes('function spacesView') && read('renderer/chatview.js').includes('Send to phone (N28C)'));
  const app = read('docs/companion/app.js');
  assert.ok(app.includes("'outbox_remove'") && app.includes('FROM YOUR MAC') && !app.includes('Settings → Beta'));
  ok('N28C public, admin skin unlock, Phone tab, Spaces in Study, send to phone (Mac → N28C)');

  // ---- macOS 26 icon
  const icon = JSON.parse(read('assets/Nexus.icon/icon.json'));
  assert.deepStrictEqual(icon['supported-platforms'], { squares: 'shared' });
  const names = icon.groups.flatMap(g => g.layers.map(l => l['image-name']));
  assert.ok(names.length >= 3 && names.every(f => fs.existsSync(path.join(root, 'assets/Nexus.icon/Assets', f))));
  assert.ok(icon.groups.every(g => g.shadow && 'kind' in g.shadow && 'opacity' in g.shadow && g.translucency && 'enabled' in g.translucency && 'value' in g.translucency));
  const COLOR = /^srgb:\d\.\d{5},\d\.\d{5},\d\.\d{5},\d\.\d{5}$/;
  assert.ok(icon.fill['linear-gradient'].length === 2 && icon.fill['linear-gradient'].every(c => COLOR.test(c)));
  const yml = read('.github/workflows/release.yml');
  assert.ok(/runs-on: macos-26/.test(yml) && yml.includes('-c.mac.icon=assets/Nexus.icon') && yml.includes('building with the flat icon'));
  const pkg = JSON.parse(read('package.json'));
  assert.strictEqual(pkg.build.mac.icon, 'assets/icon.png'); assert.ok(pkg.build.files.includes('!assets/Nexus.icon/**'));
  // Flat icon sits on Apple's grid: transparent margin, body ≈ 824 px centered
  const png = fs.readFileSync(path.join(root, 'assets/icon.png'));
  assert.strictEqual(png.readUInt32BE(16), 1024); assert.strictEqual(png.readUInt32BE(20), 1024);
  ok('icon: Icon Composer bundle (layers, glass, gradient) + CI compiles it with a fallback; flat 1024 icon on the grid');

  console.log(`v1.9: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
