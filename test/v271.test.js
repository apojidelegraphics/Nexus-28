// v2.7.1 stability tests: the highlight orb (selection, not clipboard), its skin, privacy fixes, small-window layout.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const main = read('main.js'), swift = read('native/NexusCore.swift');

// ---------- Highlight orb: triggered by highlighting, read-only
const watcher = swift.slice(swift.indexOf('final class SelectionWatcher'), swift.indexOf('// MARK: - Transcribe an audio file'));
assert.ok(watcher.includes('kAXSelectedTextAttribute') || swift.includes('func selectedTextOf'), 'reads the AX selection');
assert.ok(!/copySelection\(\)|virtualKey|pasteboard|NSPasteboard/.test(watcher), 'never presses ⌘C or touches the clipboard');
assert.ok(watcher.includes('.listenOnly') && !/keyDown/.test(watcher), 'mouse events only, listen-only, no keystrokes');
assert.ok(swift.includes('"AXSecureTextField"'), 'skips password fields');
assert.ok(watcher.includes('ownPid'), 'ignores Nexus itself');
assert.ok(/"selwatch": true/.test(swift) && /case "sel_watch_start"/.test(swift) && /case "sel_watch_stop"/.test(swift));
ok('helper watches highlights read-only: no ⌘C, no clipboard, no keystrokes, no password fields');
assert.ok(!/maybeClipOrb/.test(main) && !/onChange: list => \{[^}]*Orb/.test(main), 'copying no longer pops the orb');
assert.ok(main.includes("ev.event === 'selection'") && main.includes('function showOrb') && main.includes("cmd: 'sel_watch_start', pid: process.pid"));
assert.ok(/!test && \(focus\?\.muting\?\.\(\) \|\| BrowserWindow\.getFocusedWindow\(\)\)\) return;/.test(main.slice(main.indexOf('function showOrb'))), 'never over Nexus itself');
ok('main shows the orb for highlights only');
assert.ok(/e\.sender !== clipOrb\?\.webContents/.test(main), 'only the orb window can trigger orb actions');
assert.ok(main.includes("act === 'copy'") && read('renderer/cliporb.html').includes('data-a="copy"'));
assert.ok(main.includes("act === 'mute'") && main.includes('orbMutedApps') && main.includes("'cliporb:unmute'"));
assert.ok(/orbMutedApps !== undefined\) \{ const \{ orbMutedApps/.test(main), 'renderers cannot rewrite the muted-apps list');
ok('Copy button, per-app off switch');

// ---------- The orb uses your skin
const look = main.slice(main.indexOf('function orbLook'), main.indexOf('function orbLook') + 500);
assert.ok(look.includes("p.apex ? 'overlord'") && look.includes('s.orbSkin') && look.includes('orbSkinOk'));
const html = read('renderer/cliporb.html'), js = read('renderer/cliporb.js');
assert.ok(html.includes('<script src="orb.js"></script>') && js.includes('NexusOrb.create') && js.includes('setSkin(d.skin'));
assert.ok(!/radial-gradient\(circle at 38%/.test(html), 'no more hand-drawn gradient orb');
assert.ok(js.includes('api.clipOrb.size') && main.includes("ipcMain.on('cliporb:size'"), 'window sized to its content, nothing cut off');
assert.ok(!/<script>/.test(html) && html.includes("script-src 'self'"));
assert.ok(!/requestAnimationFrame\(/.test(js), 'sizing never waits for a frame (frames are paused while the window is hidden)');
assert.ok(/function placeOrb/.test(main) && /orbSel\.sizeWait = setTimeout\(\(\) => \{ if \(orbSel\.fresh\) placeOrb\(460, 64\)/.test(main), 'shows even if the orb never reports its size');
assert.ok(main.includes("ev.event === 'sel_miss'") && swift.includes('"sel_miss"') && main.includes("ipcMain.handle('cliporb:test'"), 'diagnostics + Show it now');
ok('orb uses the HUD skin (Overlord for Axiom) and sizes itself');

// ---------- Fake helper protocol works end to end
const { spawn } = require('child_process');
(async () => {
  const p = spawn(process.execPath, [path.join(__dirname, 'fake-helper.js')], { env: { ...process.env, FAKE_HIGHLIGHT: 'hello world', FAKE_HIGHLIGHT_DELAY: '10' } });
  const evs = []; let buf = '';
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { evs.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  p.stdin.write(JSON.stringify({ cmd: 'info', id: 'info' }) + '\n' + JSON.stringify({ cmd: 'sel_watch_start', pid: 1 }) + '\n');
  await new Promise(r => setTimeout(r, 300)); p.kill();
  assert.ok(evs.find(e => e.event === 'info')?.selwatch && evs.some(e => e.event === 'sel_watch' && e.ok) && evs.find(e => e.event === 'selection')?.text === 'hello world');
  ok('helper protocol: selwatch cap, sel_watch, selection');

  // ---------- Privacy + correctness fixes
  assert.ok(/if \(memory && !noMemory\)/.test(main) && /Shared Space "\$\{spaceName\}"[^\n]*noMemory: true/.test(main), 'memory never goes into Shared Space answers');
  assert.ok(/if \(why === 'schedule'\) store\.setSettings\(\{ recap:/.test(main), 'manual recap does not skip Sunday');
  assert.ok(main.includes('const localDay') && !/challengeQueue\.day = new Date\(\)\.toISOString/.test(main), 'study days in local time');
  assert.ok(/if \(!cloud\?\.session\) \{ challengeQueue\.cards = 0/.test(main), 'no backlog while signed out');
  const sql = read('supabase/nexus-v2.7.1.sql');
  assert.ok(/p_day < current_date - 1 or p_day > current_date \+ 1/.test(sql) && /grant execute on function public\.challenge_report\(text, int, date\) to authenticated/.test(sql));
  ok('memory stays out of Shared Spaces, recap, challenge days (SQL clamps made-up dates)');

  // ---------- UI: menus and small windows
  const hud = read('renderer/hud.js'), css = read('renderer/hud.css');
  assert.ok(hud.includes("e.key === 'Escape' && !$('actMenu').hidden") && /settings\.open = \(\.\.\.a\) => \{ toggleActMenu\(false\)/.test(hud));
  assert.ok(/@media \(max-height: 520px\)/.test(css) && /\.side \{ overflow: hidden; \}/.test(css) && /\.brand, \.brand-name \{ white-space: nowrap; \}/.test(css));
  assert.ok(/\.pill \{ white-space: nowrap; flex: none;/.test(read('renderer/quickchat.css')));
  assert.ok(read('docs/companion/app.js').includes('class="chal-x"') && read('docs/companion/index.html').includes('.chal-x'));
  ok('☰ menu closes properly; no overlap or wrapping at the minimum window size; N28C challenge cards');

  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes[0].version, JSON.parse(read('package.json')).version);
  assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])));
  ok('release notes');
  console.log(`v2.7.1: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
