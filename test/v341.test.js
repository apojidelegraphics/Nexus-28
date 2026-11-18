// v3.4.1 tests: Test Run pictures + profile + 200 a day, the Owner's crown on the top-left (and visible on photos),
// a sidebar that doesn't overflow, and model / feature maintenance everywhere.
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

const tj = read('docs/try/try.js'), th = read('docs/try/index.html'), tc = read('docs/try/try.css'), fn = read('supabase/functions/try-chat/index.ts');
// pictures
assert.ok(th.includes('id="attBtn"') && th.includes('id="attFile"') && tj.includes('async function addFiles(') && tj.includes("addEventListener('paste'") && tj.includes("addEventListener('drop'"));
assert.ok(tj.includes("type: 'image_url', image_url: { url }") && tj.includes("source: { type: 'base64'") && tj.includes('inline_data') && tj.includes('DeepSeek can’t see pictures'));
assert.ok(fn.includes("p?.type === 'image_url'") && fn.includes("!pics && isFree(") && !/sk-or-v1-[0-9a-f]{20,}/.test(tj + fn + th));
ok('Test Run: pictures by 📎, paste or drop, sent in each provider’s format (free key → a free model that can see)');
// 200 a day
const sql = read('supabase/nexus-v3.4.1.sql');
assert.ok(sql.includes('if u.main >= 200') && sql.includes("'daily', 200") && !/>= 100\b/.test(sql) && read('supabase/nexus-v3.4.sql').includes('if u.main >= 200'));
assert.ok(tj.includes('200 answers a day') && !/100 answers a day/.test(tj));
ok('Test Run: 200 free answers a day');
// profile
assert.ok(th.includes('id="meChip"') && ['sPic', 'sUserSave', 'sEmailSave', 'sPwSave', 'sNameSave'].every(id => tj.includes(`id="${id}"`)) && tj.includes("sb.storage.from('avatars').upload(") && tj.includes('sb.auth.updateUser({ password'));
ok('Test Run: change picture, name, username, email, password; your picture bottom right of the sidebar');
// sidebar
assert.ok(/\.chats \{ grid-template-columns: minmax\(0, 1fr\)/.test(tc) && /\.side \{ min-width: 0; overflow: hidden; \}/.test(tc));
ok('long chat titles no longer stretch the sidebar');
// crown
const hud = read('renderer/hud.css');
assert.ok(/\.avatar \.av-crown \{[^}]*left: -7px[^}]*color: initial/.test(hud) && read('renderer/hud.js').includes('<i class="av-crown" title="Owner">👑</i>'));
assert.ok(/\.pic-crown \{ position: absolute; top: -12px; left: -8px/.test(read('docs/companion/index.html')) && /\.pfp \.crown \{[^}]*left: -7px/.test(tc));
ok("the Owner's crown: top-left, visible on photos (Mac settings + account chip, N28C, Test Run)");
// maintenance
const M = require('../src/maintenance');
const list = [{ scope: 'lyte', adminBypass: true }, { scope: 'Seek', adminBypass: false }];
assert.ok(M.blockFor(list, 'chat', { persona: { id: 'lyte' } }) && !M.blockFor(list, 'chat', { persona: { id: 'flash' } }) && !M.blockFor(list, 'chat', { persona: { id: 'lyte' }, admin: true }));
assert.ok(M.blockFor([{ scope: 'lyte' }], 'chat', { persona: { id: 'my-agent', base: 'lyte' } }), 'custom agents follow their base');
const main = read('main.js');
assert.ok(main.includes("reason: m ? 'maintenance'") && read('renderer/hud.js').includes("small: 'MAINTENANCE'"));
assert.ok(tj.includes('const agentDown = id =>') && tj.includes('const featDown = f =>') && tj.includes('features: feats,') && fn.includes('const featOff = live.find') && fn.includes("`nexus '28 ${agent}`"));
assert.ok(tj.includes("filter(id => !agentDown(id))"), 'a feature never pulls you onto an agent that is down');
ok('model + feature maintenance: blocked with a message on the Mac, in N28C (via the Mac) and Test Run (page + server)');

const ch = JSON.parse(read('docs/whats-new/changes.json'));
assert.ok(ch.find(c => c.version === '3.4.1') && ch[0].version === JSON.parse(read('package.json')).version && !/axiom|apex|cage/i.test(JSON.stringify(ch[0])));
ok('release notes (no Axiom)');
console.log(`v3.4.1: ${n} checks passed`);
