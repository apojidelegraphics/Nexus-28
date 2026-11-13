// v1.4 tests: Mac actions (fake exec), the Spotlight query, the file finder, clipboard history (concealed items skipped,
// Nexus's own copies muted), Watch mode (local keyword checks, AI only when the text changed, throttling, window closing),
// and the new tools' gating/descriptions/execution.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nx14-'));

(async () => {
  // ---- Spotlight query
  const { createMac, spotlightQuery } = require('../src/macactions');
  const q = spotlightQuery({ query: 'chem "lab" report', kind: 'pdf', days: 7 });
  assert.ok(q.includes('kMDItemDisplayName == "*chem*"cd') && q.includes('kMDItemTextContent == "lab"cd'));
  assert.ok(q.includes('com.adobe.pdf') && q.includes('$time.today(-7)'));
  assert.ok(!q.includes('""'), 'quotes from the query are stripped');
  assert.strictEqual(spotlightQuery({}), 'kMDItemFSName == "*"');
  ok('Spotlight query: names + contents, kind and date filters, quotes stripped');

  // ---- Mac actions with a fake exec
  const calls = [];
  const dir = tmp();
  const f1 = path.join(dir, 'Chem Lab Report.pdf'); fs.writeFileSync(f1, 'x');
  const f2 = path.join(dir, 'notes.txt'); fs.writeFileSync(f2, 'chem');
  fs.utimesSync(f2, new Date(), new Date(Date.now() + 1000));
  const outputs = {
    mdfind: args => args[0] === '-onlyin' ? `${f2}\n${f1}\n/Users/x/Library/Caches/junk.pdf\n/nope/missing.pdf\n` : '/Applications/Safari.app\n/Applications/Safari Technology Preview.app\n',
    open: () => '', osascript: args => /is running/.test(args[1]) ? (args[1].includes('Spotify') ? 'false' : 'true') : '',
    shortcuts: args => args[0] === 'list' ? 'Morning\nLog Water\n' : 'done!'
  };
  const run = async (cmd, args) => { calls.push([cmd, ...args]); return outputs[cmd](args); };
  let opened = null, copied = null; const notes = [];
  const mac = createMac({ run, openExternal: async u => { opened = u; }, openPath: async () => '', clipboard: { writeText: t => { copied = t; } }, notify: (t, b) => notes.push(t), platform: 'darwin' });
  const files = await mac.findFiles({ query: 'chem report' });
  assert.deepStrictEqual(files.map(f => f.name), ['Chem Lab Report.pdf', 'notes.txt'], 'name matches first; Library and missing files skipped');
  assert.strictEqual(await mac.findApp('safari'), '/Applications/Safari.app');
  assert.strictEqual(await mac.actions.open_app({ name: 'Safari' }), 'Opened Safari.');
  assert.deepStrictEqual(calls.at(-1), ['open', '/Applications/Safari.app']);
  await assert.rejects(mac.actions.open_url({ url: 'file:///etc/passwd' }), /http/);
  await mac.actions.open_url({ url: 'https://example.com' }); assert.strictEqual(opened, 'https://example.com');
  assert.strictEqual(await mac.actions.set_volume({ level: 140 }), 'Volume set to 100%.');
  assert.ok(calls.at(-1)[2] === 'set volume output volume 100');
  assert.strictEqual(await mac.actions.set_volume({ mute: true }), 'Muted.');
  await mac.actions.dark_mode({});
  assert.ok(calls.at(-1)[2].includes('set dark mode to not dark mode'));
  assert.strictEqual(await mac.actions.media_control({ action: 'next' }), 'Music: next.', 'falls back to Music when Spotify is closed');
  assert.ok(calls.at(-1)[2] === 'tell application "Music" to next track');
  assert.ok((await mac.actions.list_shortcuts()).includes('Log Water'));
  assert.ok((await mac.actions.run_shortcut({ name: 'Log Water', input: '8oz' })).includes('Output: done!'));
  const sc = calls.at(-1); assert.deepStrictEqual(sc.slice(0, 4), ['shortcuts', 'run', 'Log Water', '--input-path']); assert.ok(!fs.existsSync(sc[4]), 'temp input removed');
  await mac.actions.copy_to_clipboard({ text: 'hello' }); assert.strictEqual(copied, 'hello');
  await assert.rejects(mac.actions.set_timer({ minutes: 0 }), /Timers/);
  assert.ok((await mac.actions.set_timer({ minutes: 0.0005, label: 'Tea' })).startsWith('Timer set: Tea'));
  assert.strictEqual(mac.listTimers().length, 1);
  await new Promise(r => setTimeout(r, 80));
  assert.deepStrictEqual(notes, ['⏱ Tea']); assert.strictEqual(mac.listTimers().length, 0);
  const linux = createMac({ run, platform: 'linux' });
  await assert.rejects(linux.actions.open_app({ name: 'Safari' }), /macOS/);
  ok('Mac actions: open apps/links, volume, dark mode, music, Shortcuts with input, timers, clipboard, file finder ranking');

  // ---- Clipboard history
  const { createClipHistory, formatHistory } = require('../src/cliphistory');
  let board = 'start', types = [];
  const cb = { readText: () => board, has: t => types.includes(t) };
  let t0 = 1000;
  const h = createClipHistory({ clipboard: cb, now: () => t0, setInterval: () => 1, clearInterval: () => {} });
  await h.start();
  await h.poll(); assert.strictEqual(h.list().length, 0, 'what was on the clipboard at launch is not recorded');
  board = 'first copy'; await h.poll();
  board = 'hunter2'; types = ['org.nspasteboard.ConcealedType']; await h.poll(); types = [];
  board = 'second copy'; await h.poll();
  board = 'first copy'; await h.poll();
  assert.deepStrictEqual(h.list().map(i => i.text), ['first copy', 'second copy'], 'concealed skipped, duplicates move to the top');
  h.mute(500); board = 'nexus selection'; await h.poll(); t0 += 600; await h.resync(); await h.poll();
  assert.ok(!h.list().some(i => i.text === 'nexus selection'), "Nexus's own copy is not recorded");
  for (let i = 0; i < 60; i++) { board = 'item ' + i; await h.poll(); }
  const asyncBoard = createClipHistory({ clipboard: { readText: async () => board, has: async () => false }, now: () => t0, setInterval: () => 1, clearInterval: () => {} });
  await asyncBoard.start(); board = 'async copy'; await asyncBoard.poll();
  assert.strictEqual(asyncBoard.list()[0]?.text, 'async copy', 'works with the Promise-based clipboard API too');
  assert.strictEqual(h.list().length, 50);
  assert.ok(formatHistory(h.list(), { query: 'item 59' }).startsWith('1. '));
  h.clear(); assert.strictEqual(formatHistory(h.list()), 'The clipboard history is empty.');
  ok('clipboard history: 50 newest, concealed (password) items skipped, de-duped, muted while Nexus copies');

  // ---- Watch mode helpers
  const W = require('../src/watch');
  assert.strictEqual(W.changeRatio('Uploading 40% done', 'Uploading 40% done'), 0);
  assert.ok(W.changeRatio('Build running 10:42 AM', 'Build running 10:43 AM') === 0, 'clock changes are ignored');
  assert.ok(W.changeRatio('Uploading 40%', 'Upload complete') > 0.4);
  assert.deepStrictEqual(W.quoted('tell me when it says "Export complete"'), ['export complete']);
  assert.ok(W.localOnly('tell me when it says "Export complete"'));
  assert.ok(!W.localOnly('tell me when my essay grade is posted'));
  assert.deepStrictEqual(W.parseJudge('YES: the build passed'), { met: true, why: 'the build passed' });
  assert.deepStrictEqual(W.parseJudge('No.'), { met: false });
  assert.ok(W.judgePrompt({ condition: 'x', text: 'abc', changes: 'new line', first: false }).includes('What changed since the last look'));
  ok('watch: change ratio (clocks ignored), quoted words, YES/NO parsing');

  // ---- Watcher with a fake clock, fake capture and fake judge
  function rig(readings, { judgeYesOn = null } = {}) {
    let clock = 0, timers = [], i = 0, judged = [], hits = [], ends = [];
    const w = new W.Watcher({
      capture: async () => { const r = readings[Math.min(i++, readings.length - 1)]; return r === null ? null : { text: r }; },
      judge: async q => { judged.push(q.text); return { met: judgeYesOn !== null && q.text.includes(judgeYesOn), why: 'it happened' }; },
      onHit: (x, why) => hits.push(why), now: () => clock,
      setTimeout: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; }, clearTimeout: t => { timers = timers.filter(x => x !== t); }
    });
    w.onEnd = (x, why) => ends.push(why);
    const step = async (ms) => { clock += ms; const due = timers.filter(t => t.at <= clock); timers = timers.filter(t => t.at > clock); for (const t of due) await t.fn(); };
    return { w, step, judged, hits, ends, get clock() { return clock; } };
  }
  {
    const r = rig(['Upload 10%', 'Upload 10%', 'Upload 10%', 'Upload 55%', 'Upload 80%', 'Upload complete'], { judgeYesOn: 'complete' });
    const st = r.w.start({ windowId: '7', condition: 'tell me when the upload finishes', interval: 15, minutes: 30 });
    await r.step(0);       // first look → AI once
    await r.step(15000);   // same → skipped
    await r.step(15000);   // same → skipped
    await r.step(15000);   // changed, 45 s since AI → AI
    await r.step(15000);   // changed, but only 15 s since AI → skipped (throttled)
    await r.step(15000);   // changed vs last judged, 30 s → AI → YES
    const s = r.w.state().find(x => x.id === st.id);
    assert.strictEqual(s.status, 'hit');
    assert.deepStrictEqual(r.judged, ['Upload 10%', 'Upload 55%', 'Upload complete']);
    assert.strictEqual(s.checks, 6); assert.strictEqual(s.aiChecks, 3); assert.strictEqual(s.skipped, 3);
    assert.deepStrictEqual(r.hits, ['it happened']);
  }
  {
    const r = rig(['Exporting…', 'Exporting…', 'Export complete ✓']);
    r.w.start({ windowId: '8', condition: 'tell me when it says "export complete"', interval: 5 });
    await r.step(0); await r.step(5000); await r.step(5000);
    assert.strictEqual(r.judged.length, 0, 'quoted-word watches never call the model');
    assert.deepStrictEqual(r.hits, ['"export complete" is on screen.']);
  }
  {
    const r = rig(['a', null]);
    r.w.start({ windowId: '9', condition: 'tell me when the video ends', interval: 5 });
    await r.step(0); await r.step(5000);
    assert.deepStrictEqual(r.ends, ['The window closed.']);
  }
  {
    const r = rig(['a']);
    r.w.start({ windowId: '9', condition: 'tell me when the video ends', interval: 60, minutes: 1 });
    await r.step(0); await r.step(60000);
    assert.deepStrictEqual(r.ends, ["Time's up — nothing yet."]);
    assert.throws(() => r.w.start({ windowId: '', condition: 'x y z' }), /Pick a window/);
    for (let k = 0; k < 3; k++) r.w.start({ windowId: 'k' + k, condition: 'watch for stuff' });
    assert.throws(() => r.w.start({ windowId: 'k9', condition: 'watch for stuff' }), /up to 3/);
    r.w.stopAll(); assert.ok(r.w.state().every(x => x.status !== 'watching'));
  }
  ok('watcher: AI only on changes (≥30 s apart), local-only for quoted words, stops on close/timeout, 3 at once');

  // ---- Tools: gating, descriptions, execution
  const tools = require('../src/tools');
  const base = { web: { enabled: true } };
  const mk = o => tools.buildToolset({ helperBuilt: false, platform: 'darwin', settings: base, ...o }).labels;
  const para = mk({ agentic: true });
  for (const t of ['clipboard_history', 'find_files', 'read_file', 'open_app', 'run_shortcut', 'set_timer', 'media_control']) assert.ok(para.includes(t), t);
  assert.ok(!mk({ agentic: true, settings: { ...base, macActions: { enabled: false } } }).includes('open_app'));
  assert.deepStrictEqual(mk({ agentic: false }), []);
  assert.deepStrictEqual(mk({ agentic: false, text: 'what did I copy a minute ago? check my clipboard' }), ['clipboard_history']);
  assert.deepStrictEqual(mk({ agentic: false, text: 'find my chem lab report pdf' }), ['find_files', 'read_file']);
  assert.ok(!mk({ agentic: true, platform: 'linux' }).includes('find_files'));
  for (const t of ['open_app', 'run_shortcut', 'set_volume', 'read_file', 'copy_to_clipboard', 'set_timer']) assert.ok(tools.needsConfirm(t), t + ' asks first');
  for (const t of ['clipboard_history', 'find_files', 'list_shortcuts']) assert.ok(!tools.needsConfirm(t), t + ' is read-only');
  assert.deepStrictEqual(tools.describe('run_shortcut', { name: 'Log Water', input: '8oz' }), { label: 'Run a Shortcut', detail: 'Log Water — with: 8oz' });
  assert.strictEqual(tools.describe('open_file', { path: '/Users/luke/Desktop/a.pdf' }).detail, '~/Desktop/a.pdf');
  const r1 = await tools.execute('find_files', { query: 'chem report' }, { mac });
  assert.ok(r1.content.includes('Chem Lab Report.pdf') && r1.activity.files.length === 2);
  const r2 = await tools.execute('clipboard_history', {}, { clip: { list: () => [{ text: 'copied thing', at: Date.now() }] } });
  assert.ok(r2.content.includes('copied thing'));
  await assert.rejects(tools.execute('clipboard_history', {}, {}), /off/);
  const r3 = await tools.execute('set_volume', { level: 30 }, { mac });
  assert.strictEqual(r3.content, 'Volume set to 30%.');
  const r4 = await tools.execute('read_file', { path: f2 }, { attachments: { fromPath: async p => ({ id: 'a1', name: path.basename(p), text: 'chem' }), public: a => a } });
  assert.ok(r4.content.startsWith('File: notes.txt'));
  ok('tools: Paragon gets Mac actions (all ask first); chat agents get clipboard/files only when the message is about them');

  console.log(`\n${n} v1.4 checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
