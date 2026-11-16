// v3.0 tests: typing state on the phone, N28C answer buttons, chat-switch fix, Settings overflow, Notes via JXA.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const main = read('main.js'), app = read('docs/companion/app.js'), comp = read('src/companion.js');

(async () => {
  // ---------- The reply being written stays in its own chat
  const hud = read('renderer/hud.js');
  assert.ok(hud.includes("current = { requestId, view, text: '', persona: p, convId: conv.id };") && hud.includes('if (live) live.hidden = !!current?.convId && current.convId !== conv?.id;'));
  ok('switching chats while one is answering no longer shows its typing in the other chat');

  // ---------- Typing on the phone
  assert.ok(comp.includes('busy: a.busy?.() || []') && main.includes("busy: () => [...busyConvs.keys()]") && /companion\?\.mark\('status'\); \}/.test(main));
  assert.ok(app.includes("(S.status?.busy || []).includes(S.openChat.id)") && app.includes('Nexus is typing on your Mac…') && app.includes('class="typing"'));
  ok('N28C shows typing dots while the Mac answers (thread + chat list)');

  // ---------- N28C answer buttons
  for (const k of ['data-copy=', 'data-share=', 'data-ver=', 'data-redo=']) assert.ok(app.includes(k), k);
  assert.ok(comp.includes("case 'set_version':") && comp.includes("case 'regenerate':") && comp.includes('versions: m.versions?.length || 0'));
  assert.ok(main.includes('async function regenerateConv(convId)') && /convos\.addVersion\(convId,/.test(main));
  // The Mac side refuses a redo on a chat that's still answering, or with no answer to redo
  const { Conversations } = require('../src/conversations');
  const os = require('os');
  const cv = new Conversations(fs.mkdtempSync(path.join(os.tmpdir(), 'cv30-')));
  const c = cv.create({}); cv.appendTo(c.id, { role: 'user', content: 'hi' }); cv.appendTo(c.id, { role: 'assistant', persona: 'flash', content: 'one' });
  cv.addVersion(c.id, { role: 'assistant', persona: 'flash', content: 'two' });
  let last = cv.get(c.id).messages.at(-1); assert.strictEqual(last.versions.length, 2); assert.strictEqual(last.content, 'two');
  cv.setVersion(c.id, 0); last = cv.get(c.id).messages.at(-1); assert.strictEqual(last.content, 'one');
  ok('N28C: Copy, Share, versions ‹ 1/2 ›, ↻ Redo (Mac keeps every version)');

  // ---------- Settings never overflow; tool errors wrap
  assert.ok(/\.settings > \.tab-body \{ min-width: 0; \}/.test(read('renderer/hud.css')));
  assert.ok(/\.act-error \.act-status, \.act-denied \.act-status \{ white-space: normal;/.test(read('renderer/chatview.css')));
  ok('long lines wrap instead of pushing pages off-screen');

  // ---------- Notes: fast JXA read, clear permission errors
  const T = require('../src/axiomtools');
  const calls = [];
  const run = async (cmd, args) => { calls.push(args); return JSON.stringify([{ n: 'Nexus 3.0 plan', b: 'ship it', m: Date.now() }, { n: 'Shopping', b: 'eggs', m: 1 }]); };
  const r = await T.execute('notes_search', { query: 'nexus' }, { run, web: {} });
  assert.ok(/Nexus 3\.0 plan/.test(r.content) && !/Shopping/.test(r.content) && calls[0].includes('JavaScript'));
  await assert.rejects(T.execute('notes_search', { query: 'x' }, { run: async () => { throw new Error('execution error: Not authorized to send Apple events to Notes. (-1743)'); }, web: {} }), /Automation/);
  await assert.rejects(T.execute('notes_search', { query: 'x' }, { run: async () => { throw new Error('Command failed: osascript -e …'); }, web: {} }), /took too long/);
  assert.ok(main.includes("['System Events', 'Notes', 'Mail', 'Messages', 'Music']"), 'Permissions → Automation asks for every app Axiom uses');
  ok('Notes search reads all notes in one call; permission and timeout errors say what to do');

  const changes = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(changes[0].version, JSON.parse(read('package.json')).version);
  assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])));
  assert.strictEqual(read('docs/whats-new/feed.xml'), require('../scripts/build-feed').build(changes));
  ok('3.0 release notes (no Axiom) + RSS');
  console.log(`v3.0: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
