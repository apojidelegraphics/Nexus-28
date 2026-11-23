// v3.1 tests: access requests + per-person feature grants, un-redeem, feedback reaches the Apoji Team, all providers,
// new connectors, read-along waits for real audio, Apoji Admin's Nexus chat hooks, branding, SQL.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- grants turn an early feature on for one person (never an Off one)
  const F = require('../src/flags');
  const remote = [{ key: 'labs_x', stage: 'admin', title: 'Labs X' }, { key: 'dead', stage: 'off', title: 'Dead' }];
  const plain = F.resolve({ remote, account: { signedIn: true } });
  const granted = F.resolve({ remote, account: { signedIn: true }, grants: ['labs_x', 'dead'] });
  assert.ok(!plain.flags.labs_x.on && granted.flags.labs_x.on && granted.flags.labs_x.granted && !granted.flags.dead.on);
  ok('an approved feature request turns that feature on for just that account; Off stays off');

  // ---------- cloud: requests, un-redeem, anonymous feedback
  const { NexusCloud: Cloud } = require('../src/cloud');
  const calls = [];
  global.fetch = async (url, o = {}) => { calls.push([url, o.method || 'GET', o.body ? JSON.parse(o.body) : null, o.headers || {}]);
    if (/rpc\/unredeem_order/.test(url)) return { ok: true, status: 200, json: async () => ({ success: !/NOPE/.test(o.body) , error: 'not_found' }), text: async () => '' };
    if (/rpc\/submit_feedback_anon/.test(url)) return { ok: true, status: 200, json: async () => ({ success: true }), text: async () => '' };
    return { ok: true, status: 200, json: async () => [], text: async () => '[]', clone() { return this; } }; };
  const c = Object.create(Cloud.prototype);
  Object.assign(c, { url: 'https://x.supabase.co', key: 'k', session: { user: { id: 'u1', email: 'a@b.c' }, accessToken: 't' }, ensureFresh: async () => {}, loadExtras: async function () { this.extras = { requests: [], redemptions: [] }; }, lookupOrders: async () => [] });
  await assert.rejects(c.requestAccess({ kind: 'nope' }), /Pick what/);
  await assert.rejects(c.requestAccess({ kind: 'other', target: ' ' }), /Say what/);
  await c.requestAccess({ kind: 'axiom', target: 'ignored', note: 'please' });
  const ins = calls.find(x => /access_requests$/.test(x[0]) && x[1] === 'POST');
  assert.deepStrictEqual(ins[2], { kind: 'axiom', target: '', note: 'please', source: 'desktop' });
  await c.unredeem('MX-1'); await assert.rejects(c.unredeem('NOPE'), /isn't redeemed/);
  await c.anonRpc('submit_feedback_anon', { p_kind: 'bug' });
  assert.ok(!calls.at(-1)[3].Authorization, 'anonymous feedback goes without a session');
  ok('request access validates and posts; un-redeem; anonymous feedback has no auth header');

  const main = read('main.js');
  assert.ok(/channel: to === 'inbox' \? 'app' : to === 'github' \? 'github' : 'email'/.test(main) && main.includes("cloud.anonRpc('submit_feedback_anon'"));
  assert.ok(!/Nexus team/i.test(read('renderer/settings.js') + read('renderer/index.html') + read('docs/companion/app.js') + read('src/apex.js')), 'Apoji Team everywhere');
  ok('GitHub / email / signed-out feedback also lands in the Apoji Team inbox; "Apoji Team" everywhere');

  // ---------- providers + connectors
  const P = require('../src/providers').PROVIDERS, set = read('renderer/settings.js');
  assert.ok(P.huggingface && P.nvidia && !set.includes('<details class="more-prov"'), 'all providers listed');
  const { PRESETS } = require('../src/mcp');
  for (const k of ['slack', 'brave', 'fetch', 'memory', 'maps', 'stripe']) assert.ok(PRESETS.some(p => p.preset === k), k);
  ok('every provider shown (plus Hugging Face, NVIDIA NIM); six new connectors');

  // ---------- read-along waits for the voice
  const vc = read('renderer/voicecap.js'), cv = read('renderer/chatview.js');
  assert.ok(vc.includes("const render = engine === 'system' && !!opts.onStart") && vc.includes('audio._lead = Math.max(0'));
  assert.ok(cv.includes('a._lead ?? (a.currentTime > 0.4 ? 0.4 : null)') && main.includes("voice.renderSystem(say, { voice: s.systemVoice, rate: s.rate, lossless: true }); return { ok: true, audio"));
  ok('read-along renders the macOS voice, starts on the first heard word, follows the real audio');

  // ---------- Apoji Admin's Nexus chat: portal chats get their own Mac chat; status says the last agent/model
  assert.ok(main.includes("meta.from === 'portal'") && read('src/relay.js').includes("...(r.convId ? { convId: r.convId } : {})"));
  assert.ok(read('src/companion.js').includes('lastUsed: a.lastUsed?.() || null') && /about: String\(p\.prompt/.test(read('src/companion.js')) && read('src/companion.js').includes('...(p.apex ? {} :'));
  ok('portal chats continue on the Mac; last agent + model published (never Axiom\'s prompt)');

  // ---------- SQL
  const sql = read('supabase/nexus-v3.1.sql');
  for (const k of ['apex_allowed', 'apex_managers', 'apex_can_manage', 'access_requests', 'feature_flag_grants', 'unredeem_order', 'admin_remove_redemption', 'submit_feedback_anon', 'admin_relay_clear'])
    assert.ok(sql.includes(k), k);
  assert.ok(/if not public\.is_owner\(\) then return jsonb_build_object\('success', false, 'error', 'owner_only'\)/.test(sql), 'only the Owner picks people');
  assert.ok(/p_stage not in \('off', 'owner', 'select'\)/.test(sql), 'only select people');
  assert.ok(!/axiom-prompt|You are Nexus '28 Axiom/i.test(sql), 'no prompt in the public repo');
  ok('nexus-v3.1.sql: Owner-picked people + managers, requests, grants, un-redeem, feedback, relay clean-up');

  // ---------- branding + release notes
  assert.ok(/"copyright": "© \d{4} Apoji Delegraphics/.test(read('package.json')) && main.includes('setAboutPanelOptions') && read('renderer/index.html').includes('settings-brand'));
  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes[0].version, JSON.parse(read('package.json')).version);
  assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])));
  assert.strictEqual(read('docs/whats-new/feed.xml'), require('../scripts/build-feed').build(changes));
  ok('Apoji Delegraphics branding; release notes (no Axiom) + RSS');
  console.log(`v3.1: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
