// Access tests: tiers + free-key limits, order redemption (Nexus + aARgon3/Mexel mocks), usage sync, update checker.
const assert = require('assert');
const http = require('http');
const access = require('../src/access');
const { compare, checkLatest } = require('../src/updater');
const { PERSONAS, buildLegacy } = require('../src/personas');

let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

const redeemed = [];      // rows in Nexus redemptions
const usage = {};         // chat_usage
let release = { tag_name: 'v1.2.0', name: 'Nexus \'28 v1.2', body: 'Notes', html_url: 'https://github.com/x/releases/v1.2.0',
  assets: [{ name: 'Nexus-28-1.2.0-arm64.dmg', browser_download_url: 'https://dl/arm.dmg' }, { name: 'Nexus-28-1.2.0-x64.dmg', browser_download_url: 'https://dl/x64.dmg' }] };

const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', () => {
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = decodeURIComponent(req.url);
    // ---- aARgon3 / Mexel store project
    if (u.startsWith('/store/rest/v1/orders')) {
      assert.ok(!/email|customer|name,/.test(u.split('select=')[1].split('&')[0]), 'never selects customer details');
      const orders = {
        'MRH33QFL-RA6C': { order_id: 'MRH33QFL-RA6C', plan_type: 'pro', status: 'Delivered', config: { os: 'macOS', connection: 'wifi' }, items: [{ model: 'Lyte-28', price: 9 }, { model: 'Hailos-9.2', price: 5 }] },
        'VOID1234-AA': { order_id: 'VOID1234-AA', plan_type: 'pro', status: 'Refunded', config: {}, items: [] }
      };
      const ids = (u.match(/in\.\(([^)]*)\)/)?.[1] || '').split(',').map(s => s.replace(/"/g, ''));
      return json(200, ids.map(i => orders[i]).filter(Boolean));
    }
    // ---- Nexus project
    if (u.startsWith('/rest/v1/app_content')) return json(200, [{ content: 'sk-or-FREE' }]);
    if (u === '/auth/v1/token?grant_type=password') return json(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, user: { id: 'u1', email: 'l@x.com' } });
    if (u.startsWith('/rest/v1/redemptions') && req.method === 'POST') {
      const b = JSON.parse(raw);
      if (redeemed.some(r => r.order_id === b.order_id)) return json(409, { message: 'duplicate key value violates unique constraint' });
      redeemed.push({ ...b, redeemed_at: '2026-11-12T00:00:00Z' }); res.writeHead(201); return res.end();
    }
    if (u.startsWith('/rest/v1/redemptions')) return json(200, redeemed.filter(r => r.user_id === 'u1'));
    if (u.startsWith('/rest/v1/chat_usage') && req.method === 'POST') {
      assert.ok(/merge-duplicates/.test(req.headers.prefer));
      const b = JSON.parse(raw); usage[b.assistant_name] = b.count; res.writeHead(201); return res.end();
    }
    if (u.startsWith('/rest/v1/chat_usage')) return json(200, Object.entries(usage).map(([assistant_name, count]) => ({ assistant_name, count })));
    if (u.startsWith('/rest/v1/profiles')) return json(200, [{ username: 'lucas', is_beta_tester: false, is_comped: false }]);
    if (u.startsWith('/rest/v1/')) return json(200, []);
    // ---- GitHub releases
    if (u === '/repos/apojidelegraphics/Nexus-28/releases/latest') return json(200, release);
    if (u === '/repos/none/none/releases/latest') return json(404, { message: 'Not Found' });
    json(404, {});
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const B = `http://127.0.0.1:${server.address().port}`;
  const P = id => PERSONAS.find(p => p.id === id);
  const legacy = buildLegacy([{ name: 'Nexus -9.2 Hailos', features: [] }, { name: 'Nexus -27 Lyte', features: [] }, { name: 'Nexus -27 Armerad', features: [] }], PERSONAS.map(p => p.handle));
  const all = [...PERSONAS, ...legacy];

  // ---- tiers
  assert.strictEqual(access.tierOf(P('paragon')).id, 'ultra');
  assert.strictEqual(access.tierOf(P('neodela')).id, 'best');
  assert.strictEqual(access.tierOf(P('lyte')).id, 'standard');
  assert.strictEqual(access.tierOf(P('flash')).id, 'base');
  assert.strictEqual(access.tierOf(legacy.find(l => l.handle === 'lyte27')).id, 'standard');
  assert.strictEqual(access.tierOf(legacy.find(l => l.handle === 'hailos')).id, 'best');
  assert.deepStrictEqual([access.TIERS.best.limit, access.TIERS.standard.limit, access.TIERS.base.limit], [28, 95, Infinity]);
  ok('tiers: Paragon=Ultra, Neodela+legacy=Best (28), Lyte family=Standard (95), Flash=Base (∞)');

  // ---- decide
  const cloudP = { needsKey: true, label: 'OpenRouter' }, localP = { needsKey: false, label: 'Apple' };
  const d = (id, o) => access.decide({ persona: P(id) || all.find(x => x.id === id), provider: cloudP, hasOwnKey: false, freeKeyEnabled: true, comped: false, unlocked: false, used: 0, ...o });
  assert.strictEqual(d('paragon').mode, 'blocked');
  assert.match(d('paragon').reason, /Ultra/);
  assert.strictEqual(d('paragon', { hasOwnKey: true }).mode, 'own');
  assert.strictEqual(access.decide({ persona: P('paragon'), provider: localP }).mode, 'local');
  assert.strictEqual(d('neodela', { used: 27 }).mode, 'free');
  assert.strictEqual(d('neodela', { used: 28 }).mode, 'blocked');
  assert.strictEqual(d('lyte', { used: 94 }).mode, 'free');
  assert.strictEqual(d('lyte', { used: 95 }).mode, 'blocked');
  assert.strictEqual(d('flash', { used: 10000 }).mode, 'free');
  assert.strictEqual(d('neodela', { used: 500, unlocked: true }).mode, 'free');
  assert.strictEqual(d('neodela', { used: 500, comped: true }).limit, Infinity);
  assert.strictEqual(d('neodela', { freeKeyEnabled: false }).mode, 'blocked');
  ok('free-key decisions: Ultra never free, limits at 28/95, Flash unlimited, unlocked/comped unlimited, own key and local bypass');

  // ---- order items → personas
  assert.strictEqual(access.personaForItem('Lyte-28', all), 'lyte');
  assert.strictEqual(access.personaForItem('Neodela', all), 'neodela');
  assert.strictEqual(access.personaForItem('Hailos-9.2', all), legacy.find(l => l.handle === 'hailos').id);
  assert.strictEqual(access.personaForItem('Lyte-27', all), legacy.find(l => l.handle === 'lyte27').id);
  assert.strictEqual(access.personaForItem('Unknown Thing', all), null);
  const un = access.unlockedBy([{ items: [{ model: 'Lyte-28' }, { model: 'Armerad' }] }], all);
  assert.ok(un.has('lyte') && un.has(legacy.find(l => l.handle === 'armerad').id) && !un.has('neodela'));
  const unAll = access.unlockedBy([{ items: [] }], all);
  assert.ok(unAll.has('neodela') && unAll.has('flash') && !unAll.has('paragon'));
  ok('order items map to agents (Lyte-28 → Lyte, Hailos-9.2 → legacy); empty item list unlocks all but Ultra');

  // ---- cloud: free key, redeem, usage
  const { NexusCloud } = require('../src/cloud');
  let cache = null, refresh = null;
  const c = new NexusCloud({ url: B, key: 'pk', storeUrl: B + '/store', storeKey: 'sk', loadCache: () => cache, saveCache: x => { cache = x; }, loadRefresh: () => refresh, saveRefresh: t => { refresh = t; } });
  assert.strictEqual(await c.freeKey(), 'sk-or-FREE');
  await assert.rejects(c.redeem('MRH33QFL-RA6C'), /Sign in/);
  await c.signIn('l@x.com', 'pw');
  await assert.rejects(c.redeem('nope'), /order number/);
  await assert.rejects(c.redeem('ZZZZ9999-ZZ'), /No aARgon3 or Mexel order/);
  await assert.rejects(c.redeem('VOID1234-AA'), /refunded/);
  const r = await c.redeem(' mrh33qfl-ra6c ');
  assert.deepStrictEqual([r.orderId, r.models], ['MRH33QFL-RA6C', ['Lyte-28', 'Hailos-9.2']]);
  assert.strictEqual(redeemed[0].config_os, 'macOS');
  assert.strictEqual(redeemed[0].config_network, 'wifi');
  const acct = c.account();
  assert.ok(acct.orders.some(o => o.orderId === 'MRH33QFL-RA6C' && o.items.some(i => i.model === 'Lyte-28')), 'account lists redeemed orders with items');
  await assert.rejects(c.redeem('MRH33QFL-RA6C'), /already redeemed that order/);
  redeemed[0].user_id = 'someone-else';
  await assert.rejects(c.redeem('MRH33QFL-RA6C'), /another account/);
  ok('redeem: needs sign-in, validates format, rejects unknown/refunded/duplicate orders, stores order config');

  assert.strictEqual(await c.incrementUsage('Nexus 28 Neodela'), 1);
  assert.strictEqual(await c.incrementUsage('Nexus 28 Neodela'), 2);
  assert.strictEqual(c.usageFor('Nexus 28 Neodela'), 2);
  assert.strictEqual(usage['Nexus 28 Neodela'], 2);
  ok('chat usage counts upsert to Supabase (synced with the web limits)');

  // ---- free key: free models only
  const fm = require('../src/freemodels');
  const catalog = { data: [
    { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta: Llama 3.3 70B (free)', pricing: { prompt: '0', completion: '0' }, context_length: 65536 },
    { id: 'openrouter/free', name: 'Free Models Router', pricing: { prompt: '-1', completion: '-1' } },
    { id: 'openrouter/auto', name: 'Auto Router', pricing: { prompt: '-1', completion: '-1' } },
    { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', pricing: { prompt: '0.000003', completion: '0.000015' } },
    { id: 'sneaky/freedom-pro', name: 'Freedom Pro', pricing: { prompt: '0.000001', completion: '0' } },
    { id: 'cheap/zero-model', name: 'Zero Model', pricing: { prompt: '0', completion: '0' } },
    { id: 'x/free-img', name: 'Free but image-priced', pricing: { prompt: '0', completion: '0', image: '0.01' } },
    { id: 'y/nopricing:free', name: 'No pricing listed' }
  ] };
  const fsrv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(catalog)); });
  await new Promise(r => fsrv.listen(0, r));
  const list = await fm.fetchFreeModels({ base: `http://127.0.0.1:${fsrv.address().port}` });
  fsrv.close();
  assert.deepStrictEqual(list.map(m => m.id), ['openrouter/free', 'meta-llama/llama-3.3-70b-instruct:free']);
  assert.strictEqual(fm.safeFreeModel('anthropic/claude-sonnet-4.5', list), 'openrouter/free');
  assert.strictEqual(fm.safeFreeModel('openrouter/auto', null), 'openrouter/free');
  assert.strictEqual(fm.safeFreeModel('sneaky/freedom-pro', null), 'openrouter/free');
  assert.strictEqual(fm.safeFreeModel('meta-llama/llama-3.3-70b-instruct:free', list), 'meta-llama/llama-3.3-70b-instruct:free');
  assert.strictEqual(fm.safeFreeModel('google/gemma-3-27b-it:free', null), 'google/gemma-3-27b-it:free');
  ok('free key: only "free"-named, $0 models listed; paid or unlisted models fall back to the free router');

  // ---- updater
  assert.ok(compare('1.0.1', '1.0.0') > 0 && compare('v1.10.0', '1.9.9') > 0 && compare('1.0.0', '1.0.0') === 0);
  assert.ok(compare('1.0.0-beta', '1.0.0') < 0 && compare('1.0.0', '1.0.0-rc.1') > 0);
  let u = await checkLatest({ current: '1.0.0', base: B });
  assert.ok(u.newer && u.latest === '1.2.0' && /\.dmg$/.test(u.download));
  u = await checkLatest({ current: '1.2.0', base: B });
  assert.ok(!u.newer);
  u = await checkLatest({ current: '1.0.0', base: B, repo: 'none/none' });
  assert.ok(!u.newer && u.latest === null);
  ok('update checker: semver compare, newer GitHub release found with DMG, no releases handled');

  console.log(`\n${n} access/update checks passed`);
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
