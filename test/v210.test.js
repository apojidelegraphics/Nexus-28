// v2.10 tests: features for Paragon/Axiom, Permissions page, grouped Settings, fades, typing dots, N28C Send to Mac.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const main = read('main.js');

// ---------- @features: Paragon gets everyone's, Axiom gets Paragon's + its own
const { PERSONAS } = require('../src/personas');
const every = [...new Set(PERSONAS.filter(p => !p.apex).flatMap(p => p.features))];
assert.ok(every.includes('SwiftStream') && every.includes('StudyMode') && every.includes('VoxLink'));
assert.ok(/if \(p\.id === 'paragon'\) p\.features = every;/.test(main) && /if \(p\.id === 'axiom'\) p\.features = \[\.\.\.new Set\(\[\.\.\.p\.features, \.\.\.every\]\)\]/.test(main));
assert.ok(/const every = \[\.\.\.new Set\(core\.filter\(p => !p\.apex\)/.test(main), 'Apex features never leak to Paragon');
ok('Paragon has every agent\'s @features; Axiom has those plus its own');

// ---------- Permissions page
for (const id of ['accessibility', 'microphone', 'speech', 'screen', 'calendar', 'reminders', 'automation', 'notifications']) assert.ok(main.includes(`id: '${id}'`), id);
assert.ok(main.includes("ipcMain.handle('perms:state'") && main.includes("ipcMain.handle('perms:ask'") && main.includes("ipcMain.handle('perms:open'"));
assert.ok(/Privacy_Accessibility|PANE\('Accessibility'\)/.test(main));
const swift = read('native/NexusCore.swift');
assert.ok(swift.includes('case "perm_status":') && swift.includes('SFSpeechRecognizer.authorizationStatus()') && swift.includes('"perms": true'), 'helper reports status without prompting');
assert.ok(read('renderer/settings.js').includes('function renderPermissions') && read('preload.js').includes("perms: { state:"));
ok('Settings → Permissions: 8 permissions, status, Ask now, Open System Settings');

// ---------- Grouped sidebar
const html = read('renderer/index.html');
assert.deepStrictEqual([...html.matchAll(/<div class="tab-group">([^<]+)</g)].map(m => m[1]), ['YOU', 'AI', 'MAC &amp; PHONE', 'APP']);
assert.ok(/\.settings \{ display: grid; grid-template-columns: 172px/.test(read('renderer/hud.css')));
assert.ok(!read('renderer/settings.js').includes("addEventListener('wheel'"), 'no sideways wheel scrolling left over');
const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map(m => m[1]), TABS = read('renderer/settings.js').match(/const TABS = (\[[^\]]+\])/)[1];
assert.deepStrictEqual(JSON.parse(TABS.replace(/'/g, '"')), tabs, 'TABS matches the sidebar order');
ok('Settings sidebar: You · AI · Mac & phone · App');

// ---------- Fades + typing dots
assert.ok(/function addFades\(win/.test(main) && /addFades\(quickChat/.test(main) && /addFades\(clipOrb/.test(main));
assert.ok(/async function runChat\(args\) \{\n  const cid = args\.convId;\n  setBusy\(cid, 1\);\n  try \{[\s\S]{0,400}?await runChatCore\(args\);[\s\S]{0,400}?\} finally \{ setBusy\(cid, -1\); \}/.test(main), 'busy is always cleared');
assert.ok(read('renderer/hud.js').includes('c-typing') && read('preload.js').includes("onBusy: on('convos:busy')"));
ok('Quick Chat + highlight orb fade; background answers show typing dots');

// ---------- N28C Send to Mac
const app = read('docs/companion/app.js');
assert.ok(app.includes('class="big send-mac" data-send="save">Send to Mac ➤') && app.includes('data-send="ask"'));
assert.ok(main.includes("return { done: '✓ Sent to your Mac'"));
ok('N28C: Send to Mac button');

const changes = JSON.parse(read('docs/whats-new/changes.json'));
assert.strictEqual(changes[0].version, JSON.parse(read('package.json')).version);
assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])));
assert.strictEqual(read('docs/whats-new/feed.xml'), require('../scripts/build-feed').build(changes));
ok('release notes (no Axiom) + RSS');
console.log(`v2.10: ${n} checks passed`);
