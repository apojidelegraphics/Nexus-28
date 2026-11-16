// v2.9 tests: Axiom's tool kits, N28C account editing + full-screen fix, Quick Chat header.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const T = require('../src/axiomtools');
  // ---------- Kits and who gets them
  const all = T.names({ owner: true, platform: 'darwin' }), pub = T.names({ owner: false, platform: 'darwin' });
  assert.ok(all.includes('nexus_feedback') && !pub.some(x => x.startsWith('nexus_')), 'Nexus internals: owner only');
  assert.ok(!T.names({ owner: false, platform: 'darwin', settings: { axiomKits: { dev: false } } }).some(x => x.startsWith('github_')), 'kits can be switched off');
  assert.ok(!T.names({ owner: false, platform: 'linux' }).includes('notes_search'), 'Mac kit only on macOS');
  for (const name of Object.keys(T.DEFS)) {
    const changes = /create|send|move|run_|rerun|reply|post|save_to|draft/.test(name) && name !== 'github_actions_runs';
    if (changes) assert.ok(T.needsConfirm(name), name + ' must ask first');
    assert.ok(T.describe(name, {}).label, name + ' has a label');
  }
  assert.ok(!T.needsConfirm('notes_search') && !T.needsConfirm('github_issues') && !T.needsConfirm('deep_browse'), 'read-only tools run straight away');
  ok('kits: owner-only internals, switchable, everything that changes something asks first');

  // ---------- Safety: home folder only, never overwrite
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'axhome-'));
  assert.throws(() => T.homePath('/etc/passwd', home), /home folder/);
  assert.throws(() => T.homePath('~/../x', home), /home folder/);
  assert.throws(() => T.homePath('~/Library/Keychains', home), /off limits/);
  assert.throws(() => T.homePath('~/.ssh/id_rsa', home), /off limits/);
  fs.writeFileSync(path.join(home, 'a.txt'), 'a'); fs.writeFileSync(path.join(home, 'b.txt'), 'b');
  const d = { run: async () => '', web: {}, home };
  const r = await T.execute('finder_move', { moves: [{ from: '~/a.txt', to: '~/Sorted/a.txt' }, { from: '~/b.txt', to: '~/Sorted/a.txt' }, { from: '/etc/hosts', to: '~/h' }] }, d);
  assert.ok(fs.existsSync(path.join(home, 'Sorted/a.txt')) && fs.existsSync(path.join(home, 'b.txt')), 'moved one, refused to overwrite');
  assert.ok(/Moved 1/.test(r.content) && /not overwritten/.test(r.content) && /home folder/.test(r.content) && /To undo/.test(r.content));
  const ls = await T.execute('finder_list', { path: '~' }, d); assert.ok(/Sorted\//.test(ls.content));
  ok('Finder tools stay in your home folder, skip Library/keys, never overwrite, say how to undo');

  // ---------- GitHub needs a token; repo names validated
  await assert.rejects(T.execute('github_issues', { repo: 'a/b' }, { ...d, getKey: () => '' }), /GitHub token/);
  await assert.rejects(T.execute('github_issues', { repo: 'not a repo' }, { ...d, getKey: () => 'x' }), /owner\/name/);
  let called = null; global.fetch = async (u, o) => { called = [u, o]; return { ok: true, status: 200, json: async () => [{ number: 3, title: 'Bug', state: 'open', user: { login: 'sam' }, updated_at: '2026-11-15', labels: [], html_url: 'https://github.com/a/b/issues/3' }] }; };
  const gi = await T.execute('github_issues', { repo: 'apojidelegraphics/Nexus-28' }, { ...d, getKey: () => 'tok' });
  assert.ok(/#3 Bug/.test(gi.content) && called[0].includes('/repos/apojidelegraphics/Nexus-28/issues') && called[1].headers.Authorization === 'Bearer tok');
  ok('GitHub: token required, repo validated, token sent only to api.github.com');

  // ---------- Research helpers
  const links = T.pickLinks('<a href="/pricing">Pricing plans</a><a href="https://other.com/x">x</a><a href="/blog/cats">Cats</a><a href="/docs/pricing-faq">FAQ</a>', 'https://site.com/', 'pricing', 3);
  assert.deepStrictEqual(links.map(l => l.url).slice(0, 2).sort(), ['https://site.com/docs/pricing-faq', 'https://site.com/pricing']);
  assert.ok(!links.some(l => l.url.includes('other.com')), 'same site only');
  // Nexus internals refuse for non-owners even if called directly
  await assert.rejects(T.execute('nexus_feedback', {}, { ...d, owner: () => false }), /owner/);
  ok('deep_browse follows relevant same-site links; internals re-check the owner');

  // ---------- Wired into Axiom turns only
  const main = read('main.js');
  assert.ok(/axiomTools\.toolList\(\{ settings: \{ \.\.\.s, axiomKits: kits \}, owner: axiomOwner\(\) \}\)/.test(main));
  assert.ok(/if \(persona\.apex && axiomTools\.DEFS\[name\]\) return axiomTools\.execute/.test(main));
  assert.ok(/const axiomOwner = \(\) => !!apex\?\.meter\(\)\?\.unlimited/.test(main), 'owner = the apex_unlimited account');
  assert.ok(read('renderer/settings.js').includes('axToolsCard') && read('renderer/settings.js').includes("api.setKey('github'"));
  ok('only Axiom gets them; owner check; Settings → Axiom → tools + GitHub token');

  // ---------- N28C: account editing, full screen, toast position
  const app = read('docs/companion/app.js'), html = read('docs/companion/index.html');
  for (const k of ['data-ac="nick"', 'data-ac="user"', 'data-ac="pic"', 'data-ac="email"', 'data-ac="pass"', 'data-ac="del"', "sb.auth.updateUser({ email: v })", "sb.auth.updateUser({ password: p1 })", "sb.rpc('delete_my_account', { p_confirm: 'DELETE' })"]) assert.ok(app.includes(k), k);
  assert.ok(app.includes("if (v !== 'DELETE') return"), 'delete needs DELETE typed');
  const sql = read('supabase/nexus-v2.9.sql');
  assert.ok(/p_confirm is distinct from 'DELETE'/.test(sql) && /get_my_admin_level\(\) is not null/.test(sql) && /revoke all on function public\.delete_my_account\(text\) from public, anon/.test(sql));
  assert.ok(app.includes('function fitStandalone') && /height: 100lvh/.test(html) && /\.toast \{ position: fixed; left: 50%; top:/.test(html));
  ok('N28C: edit name/username/picture/email/password, delete (typed DELETE, not admins); full screen; toast up top');

  // ---------- Quick Chat header
  const qcss = read('renderer/quickchat.css'), qjs = read('renderer/quickchat.js');
  assert.ok(/\.chat-pick \{ flex: 0 1 auto; min-width: 84px; \}/.test(qcss) && !qjs.includes("(p.agentic ? ' · AGENT' : '')"));
  ok('Quick Chat: the chat name always has room');

  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes[0].version, JSON.parse(read('package.json')).version);
  assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])));
  assert.strictEqual(read('docs/whats-new/feed.xml'), require('../scripts/build-feed').build(changes));
  ok('release notes (no Axiom) + RSS');
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`v2.9: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
