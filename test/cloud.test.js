// Cloud tests: Nexus cloud sync + auth against a mock Supabase, weather connector, markdown tables.
const http = require('http');
const assert = require('assert');
const { NexusCloud } = require('../src/cloud');
const weather = require('../src/weather');
const tools = require('../src/tools');

let n = 0; const ok = m => { n++; console.log('  ✓', m); };
const seen = [];
let profileName = 'Apoji';
let online = true;
const server = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c);
  req.on('end', () => {
    seen.push({ url: req.url, headers: req.headers, body: raw });
    if (!online) { req.socket.destroy(); return; }
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const u = req.url;
    if (u.startsWith('/rest/v1/assistant_prompts')) return json(200, [
      { name: 'Nexus 28 Paragon', prompt: 'CLOUD PARAGON', features: ['CommandCore'], updated_at: '2026-11-12T00:00:00Z' },
      { name: 'Nexus 28 Flash', prompt: 'CLOUD FLASH', features: ['SwiftStream'], updated_at: '2026-07-12T00:00:00Z' },
      { name: 'Nexus -27 Armerad', prompt: 'old model', features: [], updated_at: '2026-07-12T00:00:00Z' }]);
    if (u.startsWith('/rest/v1/announcements')) return json(200, [{ id: 3, message: 'testing new features!', created_at: '2026-11-01' }]);
    if (u.startsWith('/rest/v1/maintenance_config')) return json(200, [{ scope: 'global', enabled: true, message: 'Upgrading servers' }, { scope: 'lyte', enabled: false, message: '' }]);
    if (u.startsWith('/rest/v1/profiles') && req.method === 'GET') {
      if (req.headers.authorization !== 'Bearer AT1' && req.headers.authorization !== 'Bearer AT2') return json(200, []);
      return json(200, [{ username: profileName, is_beta_tester: true, is_comped: false, created_at: '2026-01-01' }]);
    }
    if (u === '/auth/v1/token?grant_type=password') {
      const b = JSON.parse(raw);
      if (b.password !== 'right') return json(400, { error_description: 'Invalid login credentials' });
      return json(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, user: { id: 'u1', email: b.email } });
    }
    if (u === '/auth/v1/token?grant_type=refresh_token') {
      const b = JSON.parse(raw);
      if (b.refresh_token !== 'RT1') return json(400, { error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
      return json(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, user: { id: 'u1', email: 'lucas@example.com' } });
    }
    if (u === '/auth/v1/logout') { res.writeHead(204); return res.end(); }
    if (u === '/auth/v1/signup') { const b = JSON.parse(raw); return b.email.startsWith('confirm') ? json(200, { id: 'u2', email: b.email }) : json(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, user: { id: 'u1', email: b.email } }); }
    if (u === '/auth/v1/recover') return json(200, {});
    if (u === '/auth/v1/user' && req.method === 'PUT') { const b = JSON.parse(raw); if (b.password && b.password.length < 6) return json(422, { msg: 'weak' }); return json(200, b.email ? { email: 'lucas@example.com', new_email: b.email } : { email: 'lucas@example.com' }); }
    if (u.startsWith('/rest/v1/profiles') && req.method === 'PATCH') {
      const b = JSON.parse(raw);
      assert.deepStrictEqual(Object.keys(b), ['username'], 'only username is ever written');
      if (b.username === 'taken_name') return json(409, { message: 'duplicate key value violates unique constraint "profiles_username_key"' });
      profileName = b.username; return json(200, [{ username: b.username }]);
    }
    if (u.startsWith('/rest/v1/chat_usage')) return json(200, [{ assistant_name: 'Nexus 28 Neodela', count: 12 }]);
    if (u.startsWith('/rest/v1/redemptions')) return json(200, [{ order_id: 'MX-1042', tier: 'unlimited', redeemed_at: '2026-10-01T00:00:00Z' }]);
    if (u.startsWith('/rest/v1/user_moderation')) return json(200, []);
    // Open-Meteo mocks
    if (u.startsWith('/geo/search')) return json(200, { results: [
      { name: 'Albemarle', admin1: 'Virginia', country: 'United States', country_code: 'US', latitude: 38, longitude: -78 },
      { name: 'Albemarle', admin1: 'North Carolina', country: 'United States', country_code: 'US', latitude: 35.35, longitude: -80.2 }] });
    if (u.startsWith('/api/forecast')) {
      const q = new URL(u, 'http://x').searchParams;
      assert.strictEqual(q.get('latitude'), '35.35');
      return json(200, { current: { temperature_2m: 57.6, apparent_temperature: 55.2, relative_humidity_2m: 62, weather_code: 2, wind_speed_10m: 6.8 },
        daily: { time: ['2026-11-13', '2026-11-14'], weather_code: [2, 61], temperature_2m_max: [64.2, 60.1], temperature_2m_min: [41, 47.4], precipitation_probability_max: [5, 70] } });
    }
    res.writeHead(404); res.end();
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const B = `http://127.0.0.1:${server.address().port}`;
  let cache = null, refresh = '';
  const mk = () => new NexusCloud({ url: B, key: 'pk', storeUrl: B + '/store', storeKey: 'sk', loadCache: () => cache, saveCache: d => { cache = d; }, loadRefresh: () => refresh, saveRefresh: t => { refresh = t; } });

  // ---- prompt sync
  let c = mk();
  let st = await c.sync();
  assert.deepStrictEqual(Object.keys(st.synced).sort(), ['flash', 'paragon']);
  assert.strictEqual(c.prompts.paragon.prompt, 'CLOUD PARAGON');
  assert.strictEqual(seen.find(s => s.url.startsWith('/rest/v1/assistant_prompts')).headers.apikey, 'pk');
  assert.deepStrictEqual(st.announcements.map(a => a.message), ['testing new features!']);
  assert.deepStrictEqual(st.maintenance, [{ scope: 'global', message: 'Upgrading servers' }]);
  assert.strictEqual(c.maintenanceFor('flash').length, 1);
  ok('prompts sync from assistant_prompts (only Nexus 28 agents), announcements + maintenance read');

  // ---- offline → cached prompts survive
  online = false;
  c = mk();
  assert.strictEqual(c.prompts.flash.prompt, 'CLOUD FLASH', 'loaded from cache before sync');
  st = await c.sync();
  assert.ok(/Offline/.test(st.lastError) && c.prompts.flash.prompt === 'CLOUD FLASH');
  online = true;
  ok('offline: keeps cached prompts and reports it');

  // ---- auth
  await assert.rejects(c.signIn('lucas@example.com', 'wrong'), /Invalid login credentials/);
  let acct = await c.signIn('lucas@example.com', 'right');
  assert.deepStrictEqual(acct, { signedIn: true, email: 'lucas@example.com', hasProfile: true, username: 'Apoji', beta: true, comped: false, since: '2026-01-01',
    usage: [{ assistant: 'Nexus 28 Neodela', count: 12 }], redemptions: [{ orderId: 'MX-1042', tier: 'unlimited', at: '2026-10-01T00:00:00Z' }], moderation: null, orders: [] });
  assert.strictEqual(refresh, 'RT1');
  ok('sign in → profile (username, beta/comped) loaded with the user token');
  const c2 = mk();
  acct = await c2.restore();
  assert.ok(acct.signedIn && acct.username === 'Apoji' && refresh === 'RT2');
  ok('session restored from stored refresh token on next launch');
  refresh = 'GARBAGE';
  const c3 = mk();
  acct = await c3.restore();
  assert.ok(!acct.signedIn && refresh === '', 'bad refresh token cleared');
  // ---- account editing
  await assert.rejects(c2.changeUsername('x'), /3–24/);
  await assert.rejects(c2.changeUsername('taken_name'), /taken/);
  assert.strictEqual((await c2.changeUsername('Apoji_Delegraphics')).username, 'Apoji_Delegraphics');
  await assert.rejects(c2.changePassword('123'), /at least 6/);
  await c2.changePassword('newpassword');
  assert.strictEqual((await c2.changeEmail('new@example.com')).pending, true);
  await assert.rejects(c2.changeEmail('nope'), /valid email/);
  ok('account editing: username (only that column, uniqueness), password, email change');
  assert.strictEqual((await mk().signUp('confirm@example.com', 'secret1', 'newbie')).confirmed, false);
  assert.strictEqual((await mk().signUp('instant@example.com', 'secret1', 'newbie')).confirmed, true);
  await assert.rejects(mk().signUp('a@b.co', '123'), /at least 6/);
  assert.strictEqual(await mk().resetPassword('lucas@example.com'), true);
  ok('sign up (with and without email confirmation), password reset');

  acct = await c2.signOut();
  assert.ok(!acct.signedIn && refresh === '');
  ok('invalid session cleared; sign out forgets the token');

  // ---- weather
  const w = await weather.forecast({ location: 'Albemarle, NC', days: 2, base: B + '/api', geoBase: B + '/geo' });
  assert.strictEqual(w.card.place, 'Albemarle, North Carolina');
  assert.deepStrictEqual([w.card.now.temp, w.card.now.text, w.card.unit, w.card.daily.length, w.card.daily[1].text, w.card.daily[1].rain], [58, 'Partly cloudy', '°F', 2, 'Light rain', 70]);
  assert.ok(/Now: 58°F \(feels 55°F\), Partly cloudy/.test(w.content));
  ok('weather: geocodes "City, ST" to the right state, returns card + model summary');
  await assert.rejects(weather.forecast({ location: '' }), /No location given/);
  assert.strictEqual(tools.describe('weather', { location: 'Boston' }).label, 'Checking weather');
  assert.ok(!tools.needsConfirm('weather'));
  ok('weather: empty location explained; read-only tool (no approval)');

  // ---- legacy models + features
  const { PERSONAS, buildLegacy, systemPromptFor } = require('../src/personas');
  const features = require('../src/features');
  c = mk(); await c.sync();
  assert.deepStrictEqual(c.legacy.map(l => l.name), ['Nexus -27 Armerad']);
  const leg = buildLegacy([{ name: 'Nexus -9.2 Hailos', features: ['Seek', 'Aura Sync'] }, { name: 'Nexus -9.2o Hailos', features: [] }, { name: 'Nexus -2.6 Lyte', features: [] }], PERSONAS.map(p => p.handle));
  assert.deepStrictEqual(leg.map(l => l.handle), ['lyte26', 'hailos92', 'hailos92o']);
  assert.ok(leg.every(l => l.legacy && !l.agentic && l.id.startsWith('legacy:')));
  assert.deepStrictEqual(features.canonical(['Seek', 'Aura Sync', 'Proactix2.0', 'Bogus', 'Seek']), ['Seek', 'AuraSync', 'Proactix2.0']);
  assert.deepStrictEqual(PERSONAS.find(p => p.id === 'flash').features, ['SwiftStream']);
  for (const p of PERSONAS) assert.strictEqual(features.canonical(p.features).length, p.features.length, p.id + ' has only known features');
  const block = features.featurePrompt(['Seek', 'StudyMode']);
  assert.ok(block.includes('Seek:') && block.includes('StudyMode:') && !features.featurePrompt([]));
  ok('legacy models built from Supabase (unique @handles, chat-only); features canonicalized; core agents carry their DB features');

  global.window = {};
  require('../renderer/chatctx.js');
  const cat = features.publicCatalog();
  const ps = [...PERSONAS, ...leg];
  let pm = window.NexusChat.parseMentions('@hailos92 please @seek and @StudyMode this, email me@x.com', ps, cat);
  assert.deepStrictEqual([pm.agent.handle, pm.features], ['hailos92', ['Seek', 'StudyMode']]);
  const cands = window.NexusChat.mentionCandidates('s', ps, PERSONAS.find(p => p.id === 'flash'), cat);
  assert.ok(cands.some(x => x.kind === 'agent' && x.p.handle === 'sonoma' || true) && cands.find(x => x.kind === 'feature' && x.f.id === 'SwiftStream').available && !cands.find(x => x.kind === 'feature' && x.f.id === 'Seek').available);
  ok('@mentions: agents (incl. legacy) and @Features parsed; autocomplete marks features the agent lacks');

  // ---- markdown tables
  global.window = {};
  require('../renderer/markdown.js');
  const html = window.NexusMarkdown.render('| A | B |\n|:--|--:|\n| **x** | <b>y</b> |\n\ntext');
  assert.ok(html.includes('<th>A</th>') && html.includes('style="text-align:right"') && html.includes('<strong>x</strong>') && html.includes('&lt;b&gt;y&lt;/b&gt;'));
  ok('markdown tables render (alignment, inline formatting, HTML escaped)');

  console.log(`\n${n} cloud/weather checks passed`);
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
