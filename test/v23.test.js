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
  assert.ok(app.includes("table: 'broadcasts'") && app.includes('function liveBroadcasts') && app.includes("'bc-' + b.id") && app.includes("APP_VERSION = '2.4.0'"));
  assert.ok(read('docs/companion/sw.js').includes('n28c-shell-v2.4.0'));
  ok('N28C: live broadcasts in the notices, dismissable, links open');

  // ---------- direct connection over Tailscale
  const { Direct } = require('../src/direct');
  const http = require('http');
  const calls = [];
  const tailnet = { status: async () => ({ installed: true, running: true, dnsName: 'studio.tail1.ts.net', login: 'me@x.co', https: true, error: '' }), serve: async (h, l) => { calls.push(['serve', h, l]); return { ok: true }; }, unserve: async h => { calls.push(['off', h]); return true; } };
  const published = [], asked = [];
  const cloudD = { url: 'https://sb', key: 'pk', session: { user: { id: 'me' } } };
  const d = new Direct({ tailnet, cloud: cloudD, port: 0, version: '2.3.0', agents: () => [{ id: 'flash' }], publish: async x => published.push(x),
    fetch: async (u, o) => { const t = o.headers.Authorization.slice(7); return t === 'mine' ? { ok: true, json: async () => ({ id: 'me' }) } : t === 'theirs' ? { ok: true, json: async () => ({ id: 'someone-else' }) } : { ok: false, json: async () => ({}) }; },
    ask: async row => { asked.push(row); return { ok: true, text: 'Hi from the Mac', agent: row.agent, model: 'm' }; }, request: async row => ({ op: row.meta.op, done: true }) });
  d.port = 0; await d.start();
  assert.ok(d.state.serving && d.state.url === 'https://studio.tail1.ts.net:10000'); assert.deepStrictEqual(calls[0], ['serve', 10000, 0]);
  assert.strictEqual(published[0].url, 'https://studio.tail1.ts.net:10000', 'N28C learns where to find the Mac');
  const port = d.server.address().port;
  const call = (pth, { method = 'GET', tok = 'mine', login = 'me@x.co', origin, body } = {}) => new Promise(res => {
    const rq = http.request({ host: '127.0.0.1', port, path: pth, method, headers: { ...(login ? { 'Tailscale-User-Login': login } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) } },
      r => { let x = ''; r.on('data', c => x += c); r.on('end', () => res({ status: r.statusCode, h: r.headers, b: x.startsWith('{') ? JSON.parse(x) : x })); });
    if (body) rq.write(JSON.stringify(body)); rq.end();
  });
  assert.strictEqual((await call('/n28c/ping', { login: '' })).status, 403, 'only through Tailscale');
  assert.strictEqual((await call('/n28c/ping', { tok: 'theirs' })).status, 401, 'a different Nexus account is refused');
  assert.strictEqual((await call('/n28c/ping', { tok: 'bad' })).status, 401);
  assert.ok((await call('/n28c/ping')).b.ok);
  const pre = await call('/n28c/ask', { method: 'OPTIONS', origin: 'https://apojidelegraphics.github.io' });
  assert.strictEqual(pre.h['access-control-allow-origin'], 'https://apojidelegraphics.github.io');
  assert.strictEqual((await call('/n28c/ping', { origin: 'https://evil.example' })).status, 403);
  const a = await call('/n28c/ask', { method: 'POST', body: { agent: 'flash', content: 'hello', meta: { convId: 'c1' }, file: { name: 'p.jpg', mime: 'image/jpeg', data: 'AAAA' } } });
  assert.deepStrictEqual(a.b, { ok: true, text: 'Hi from the Mac', error: '', agent: 'flash', model: 'm' });
  assert.strictEqual(asked[0].content, 'hello'); assert.strictEqual(asked[0].meta.convId, 'c1'); assert.strictEqual(asked[0].file.data, 'AAAA', 'photos come inline');
  assert.deepStrictEqual((await call('/n28c/request', { method: 'POST', body: { op: 'new_chat' } })).b, { ok: true, op: 'new_chat', done: true });
  await d.stop(); assert.deepStrictEqual(calls.at(-1), ['off', 10000]); assert.strictEqual(published.at(-1).url, '');
  ok('direct: tailnet only, same Nexus account only, CORS for N28C, asks + requests + inline photos, publishes/clears its address');

  assert.ok(main.includes('new Direct(') && main.includes('async function syncDirect') && main.includes("companion.put('direct'") && main.includes('else if (row.file)'));
  assert.ok(app.includes('function probeDirect') && app.includes("directPost('/n28c/ask'") && app.includes("'⚡ Mac · direct'") && /never reached the Mac: send it the usual way/.test(app));
  assert.ok(read('renderer/settings.js').includes('id="phDirect"'));
  ok('wired up: Settings → Phone → Direct connection, N28C uses it and falls back to the relay');

  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes.find(c => c.version === '2.3.1').version, '2.3.1'); assert.ok(!/admin/i.test(JSON.stringify(changes.find(c => c.version === '2.3.1'))), 'no admin tools in public notes');
  ok("what's new: 2.3.1 first");
  console.log(`v2.3: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
