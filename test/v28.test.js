// v2.8 tests: the bug sweep. Each check pins a bug that shipped before, so it can't come back.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const main = read('main.js'), swift = read('native/NexusCore.swift');

// ---------- Speech: say why nothing was heard
const vc = read('renderer/voicecap.js');
const sandbox = { window: {} }; vm.runInNewContext(vc.replace('window.NexusVoice =', 'window.__why = whyNothing; window.NexusVoice ='), sandbox);
const why = sandbox.window.__why;
assert.ok(typeof why === 'function', 'whyNothing exists');
{
  assert.strictEqual(why({ reason: 'kAFAssistantErrorDomain 1110: No speech detected', peak: .2 }), '', 'silence is not an error');
  assert.ok(/Dictation/.test(why({ reason: 'kAFAssistantErrorDomain 1101: Siri and Dictation are disabled' })));
  assert.ok(/isn't getting any sound/.test(why({ peak: 0 })));
  assert.ok(/could hear you/.test(why({ peak: .3 })));
}
assert.ok(/gaveUp = true; api\.voice\.stop\(id\)/.test(vc), 'gives up with stop (so the helper reports why), not cancel');
assert.ok(swift.includes('self.endReason = ') && swift.includes('"peak": Double(peakLevel)'), 'helper reports the reason and loudness');
assert.ok(main.includes("log('speech', { chars:"), 'speech sessions are logged without the words');
ok('speech-to-text explains silence: Dictation off, silent mic, or no words returned');

// ---------- Highlight watcher stays off the main thread
const w = swift.slice(swift.indexOf('final class SelectionWatcher'), swift.indexOf('let selWatcher'));
assert.ok(w.includes('Thread {') && w.includes('CFRunLoopRun()') && w.includes('CFRunLoopStop(loop)'), 'event tap on its own thread');
assert.ok(!/CFRunLoopGetMain\(\)/.test(w), 'nothing added to the main run loop');
assert.ok(/DispatchQueue\.main\.async \{ selWatcher\.handle\(isDown:/.test(swift), 'state changes hop back to main');
assert.ok(/if text == nil && canPrime \{/.test(w) && !/if firstTime \{ _ = AXUIElementSetAttributeValue/.test(w), 'AXManualAccessibility only when a plain read failed');
ok('highlight watcher: own thread, gentle with Chrome/Electron apps');

// ---------- Bugs found by the sweep
assert.ok(/gauntlet\(d, st, save, ctx\) \{/.test(read('renderer/widgets.js')), 'Gauntlet widget had no ctx (ReferenceError)');
assert.ok(/try \{ el = d && BUILD\[kind\]\(d, st, save, ctx\); \} catch/.test(read('renderer/widgets.js')), 'one widget failing never breaks the others');
assert.ok(/gauntlet\(d, st, save, ctx\) \{/.test(read('docs/companion/widgets.js')), 'N28C has the fixed widgets too');
assert.ok(!/if \(phoneOn\(\)\) await push\?\.send\('spaces'/.test(main), 'Shared Space push used an undefined phoneOn()');
assert.ok(read('preload.js').includes("onOpen: on('study:open')") && read('renderer/hud.js').includes("api.study?.onOpen?.(() => openStudy('home'))"), 'Study slot notification opens Study');
assert.ok(/if \(!\(ts > 0\)\) return 'OLDER'/.test(read('renderer/hud.js')), 'no "December 1969"');
const css = read('renderer/hud.css');
assert.ok(/\.wrapped \.wr-list \{/.test(css) && !/^\.wr-list \{ display: grid; gap: 8px; width: min\(420px/m.test(css), 'Wrapped styles no longer leak into Write');
assert.ok(/\.wr-main \.wr-text \{ height: auto; max-height: none; \}/.test(css), 'Write editor fills the panel');
ok('Gauntlet card, Shared Space push, Study notification, history dates, Write layout');

// ---------- Every preload call has a handler and vice versa
const pre = read('preload.js'), all = main + fs.readdirSync(path.join(__dirname, '../src')).map(f => read('src/' + f)).join('\n');
const calls = [...pre.matchAll(/call\('([^']+)'/g)].map(m => m[1]), handles = new Set([...all.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m => m[1]));
assert.deepStrictEqual(calls.filter(c => !handles.has(c)), [], 'preload calls with no handler');
const sends = [...pre.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map(m => m[1]), ons = new Set([...all.matchAll(/ipcMain\.on\('([^']+)'/g)].map(m => m[1]));
assert.deepStrictEqual(sends.filter(c => !ons.has(c)), []);
ok('IPC: every call has a handler');

const changes = JSON.parse(read('docs/whats-new/changes.json'));
assert.strictEqual(changes[0].version, JSON.parse(read('package.json')).version);
assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])));
assert.strictEqual(read('docs/whats-new/feed.xml'), require('../scripts/build-feed').build(changes));
ok('release notes + RSS');
console.log(`v2.8: ${n} checks passed`);
