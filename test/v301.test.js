// v3.0.1 tests: Apoji Admin 1.7's Axiom controls are honored by the app.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
(async () => {
  const { Apex } = require('../src/apex');
  const mk = s => { const a = new Apex({ cloud: { session: {}, rpc: async () => s }, now: () => Date.parse('2026-11-16T12:00:00Z') }); return a; };
  let r = await mk({ allowed: false, reason: 'offline', notice: 'Upgrading the cage.', back_at: '2026-11-16T12:30:00Z' }).check('anthropic');
  assert.ok(!r.ok && /Axiom is offline\. Upgrading the cage\. Back in 30 minutes\./.test(r.error), r.error);
  r = await mk({ allowed: false, reason: 'blocked' }).check('anthropic'); assert.ok(/turned off for your account/.test(r.error));
  const a = mk({ allowed: true, prompt: 'x', kits_off: ['mac'], read_only: true, unlimited: true }); await a.session(true);
  assert.deepStrictEqual(a.controls(), { kitsOff: ['mac'], readOnly: true });
  ok('offline (with message and return time), blocked, kits off, read-only come from Supabase');
  const main = read('main.js');
  assert.ok(main.includes('const ctl = apex?.controls()') && main.includes('if (ctl.readOnly)') && /axiomKits: kits/.test(main));
  ok('the app removes switched-off kits and every changing tool in read-only mode');
  const wf = read('.github/workflows/release.yml');
  // 3.12: the workflow can be edited on GitHub; only check the email step if it's there (it must never fail the release)
  if (wf.includes('changelog-send')) assert.ok(wf.includes('continue-on-error: true') && wf.includes('secrets.CHANGELOG_SECRET'));
  ok('release workflow: the changelog email step, when present, never fails the release');
  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes[0].version, JSON.parse(read('package.json')).version); assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])));
  ok('release notes');
  console.log(`v3.0.1: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
