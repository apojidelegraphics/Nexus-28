// v2.3 tests: broadcasts from the Nexus team (picked per app, shown once as a notification + phone, banner you dismiss).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const B = require('../src/broadcasts');
  const now = Date.now(), iso = ms => new Date(now + ms).toISOString();
  const rows = [
    { id: 1, title: 'Hello', body: 'Hi all', audience: 'all', send_at: iso(-60e3), expires_at: iso(864e5), desktop: true, phone: true, url: 'https://x.co' },
    { id: 2, title: 'Later', audience: 'all', send_at: iso(3600e3), expires_at: iso(864e5) },
    { id: 3, title: 'Ended', audience: 'all', send_at: iso(-2 * 864e5), expires_at: iso(-864e5) },
    { id: 4, title: 'Stopped', audience: 'all', send_at: iso(-60e3), expires_at: iso(864e5), cancelled: true },
    { id: 5, title: 'Update please', audience: 'outdated', max_version: '2.3.0', send_at: iso(-60e3), expires_at: iso(864e5) },
    { id: 6, title: 'Admins', audience: 'admins', send_at: iso(-60e3), expires_at: iso(864e5) },
    { id: 7, title: 'Phone only', audience: 'all', desktop: false, send_at: iso(-60e3), expires_at: iso(864e5), url: 'javascript:alert(1)' }];
  const ids = o => B.pick(rows, { now, ...o }).map(b => b.id);
  assert.deepStrictEqual(ids({ version: '2.3.0' }), [1]);
  assert.deepStrictEqual(ids({ version: '2.2.0' }), [1, 5], 'older versions get the update nudge');
  assert.deepStrictEqual(ids({ version: '2.10.0' }), [1], 'versions compare as numbers');
  assert.deepStrictEqual(ids({ version: '2.3.0', admin: true }), [1, 6]);
  assert.deepStrictEqual(ids({ version: '2.3.0', surface: 'phone' }), [1, 7]);
  assert.strictEqual(B.pick(rows, { now, surface: 'phone', version: '9' }).find(b => b.id === 7).url, '', 'only https links');
  ok('broadcasts: live window, cancelled, older-versions nudge, admins only, Mac vs phone, safe links');

  // cloud: fetched with the minute check, kept in state + cache, older databases are fine
  const { NexusCloud } = require('../src/cloud');
  const os = require('os'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx23-'));
  let table = true;
  global.fetch = async url => {
    const u = String(url).replace(/^https?:\/\/[^/]+/, '');
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.startsWith('/rest/v1/broadcasts')) return table ? json(200, rows) : json(404, { code: '42P01', message: 'relation does not exist' });
    return json(200, []);
  };
  const c = new NexusCloud({ url: 'https://x.supabase.co', key: 'pk', dir });
  assert.ok(await c.syncLive('2.2.0'));
  assert.deepStrictEqual(c.broadcasts.map(b => b.id), [1, 5]); assert.deepStrictEqual(c.state().broadcasts.map(b => b.id), [1, 5]);
  table = false; await c.syncLive('2.2.0'); assert.strictEqual(c.broadcasts.length, 2, 'no table yet: keeps what it had, no errors');
  fs.rmSync(dir, { recursive: true, force: true });
  ok('cloud: broadcasts come with the minute check (works before the SQL is run)');

  const main = read('main.js'), hud = read('renderer/hud.js');
  assert.ok(/function deliverBroadcasts[\s\S]{0,600}broadcastsSeen[\s\S]{0,600}push\?\.send\('broadcast'/.test(main), 'once per broadcast, Mac + phone');
  assert.ok(main.includes('cloud.syncLive(app.getVersion())') && main.includes('deliverBroadcasts();'));
  assert.ok(hud.includes("dismissed.includes('bc-' + b.id)") && hud.includes('data-bcopen') && hud.includes("raw.startsWith('bc-')"));
  ok('Mac app: notification once, phone push, a banner with Open + dismiss');

  const app = read('docs/companion/app.js');
  assert.ok(app.includes("table: 'broadcasts'") && app.includes('function liveBroadcasts') && app.includes("'bc-' + b.id") && app.includes("APP_VERSION = '2.3.0'"));
  assert.ok(read('docs/companion/sw.js').includes('n28c-shell-v2.3.0'));
  ok('N28C: live broadcasts in the notices, dismissable, links open');

  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes[0].version, '2.3.0'); assert.ok(!/admin/i.test(JSON.stringify(changes[0])), 'no admin tools in public notes');
  ok("what's new: 2.3.0 first");
  console.log(`v2.3: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
