// v3.3.2 tests: dim slider, keep-awake card repaints once, edit / delete your messages (Mac + N28C), delete a chat on
// N28C, the current model published for Apoji Admin.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- dim slider: 0% (dark) … 55% … None
  const { createDimmer } = require('../src/dimmer');
  const wins = []; let idle = 500;
  class W { constructor() { this.op = 0; wins.push(this); } setIgnoreMouseEvents() {} setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setOpacity(v) { this.op = v; } getOpacity() { return this.op; } loadURL() {} showInactive() {} hide() {} setBounds() {} isDestroyed() { return false; } destroy() {} }
  const screen = { getAllDisplays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 10, height: 10 } }], on() {} };
  let cfg = { keepAwake: true, keepDisplay: true };
  const d = createDimmer({ BrowserWindow: W, screen, powerMonitor: { getSystemIdleTime: () => idle, on() {} }, getCfg: () => cfg, every: 1e9 });
  d.tick(); assert.ok(d.state().shown && wins[0]._level === 0.45, 'default: screen at 55%');
  cfg = { ...cfg, dimLevel: 1 }; d.tick(); assert.strictEqual(wins[0]._level, 1, '0% = fully dark, follows the slider while dim');
  cfg = { ...cfg, dim: false }; d.tick(); assert.ok(!d.state().shown, 'None = no dimming');
  d.stop();
  const set = read('renderer/settings.js'), main = read('main.js');
  assert.ok(set.includes('data-awbright') && set.includes('<span>0% (dark)</span><span style="left:55%">55%</span><span>None</span>'));
  assert.ok(main.includes("if ('dimLevel' in patch) clean.dimLevel = Math.min(1, Math.max(0, +patch.dimLevel || 0));"));
  ok('dim slider: 0% (dark), 55% (default), None; changes apply while dimmed');

  assert.ok(set.includes('if (my !== awSeq ||') && set.includes("old[0].outerHTML = html; old.slice(1).forEach(x => x.remove())"), 'one paint at a time, card replaced in place');
  ok('keep-awake card: repaints never leave a stale copy (buttons work every time)');

  // ---------- edit / delete your messages
  const { Conversations } = require('../src/conversations');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx332-'));
  const convos = new Conversations(dir);
  let c = convos.appendTo('new', { role: 'user', content: 'first question', ts: 100 });
  const id = c.id;
  convos.appendTo(id, { role: 'assistant', persona: 'flash', content: 'a1', ts: 101 });
  convos.appendTo(id, { role: 'user', content: 'second', ts: 102 });
  convos.appendTo(id, { role: 'assistant', persona: 'paragon', content: 'a2', ts: 103 });
  assert.strictEqual(convos.editMessage(id, 101, 'nope'), null, 'only your own messages');
  c = convos.editMessage(id, 100, 'better first question');
  assert.ok(c.messages[0].content === 'better first question' && c.messages[0].edited && c.messages.length === 4 && c.title === 'better first question');
  c = convos.editMessage(id, 100, 'ask again', { truncate: true });
  assert.ok(c.messages.length === 1, 'save & ask again drops the old answers');
  convos.appendTo(id, { role: 'assistant', content: 'b1', ts: 201 }); convos.appendTo(id, { role: 'user', content: 'q2', ts: 202 }); convos.appendTo(id, { role: 'assistant', content: 'b2', ts: 203 });
  c = convos.deleteMessage(id, 100);
  assert.deepStrictEqual(c.messages.map(m => m.content), ['q2', 'b2'], 'delete takes its answer with it');
  const cv = read('renderer/chatview.js'), hud = read('renderer/hud.js');
  assert.ok(cv.includes('Save &amp; ask again') && cv.includes("'Delete this message and its answer'") && hud.includes('onEdit: (text, again) => editMine(conv, m, text, again)'));
  ok('Mac: edit your message (Save, or Save & ask again), delete it with its answer');

  // ---------- N28C: delete a chat, edit / delete messages
  const { Companion } = require('../src/companion');
  const answered = [];
  const comp = new Companion({ cloud: { session: { user: { id: 'u' } }, write: async () => [] }, convos, study: { stats: () => ({}), decks: () => [] }, metrics: { stats: () => ({}) }, enabled: () => true,
    actions: { isBusy: () => false, convosChanged() {}, answer: async (cid, agent) => answered.push([cid, agent]) } });
  convos.appendTo(id, { role: 'user', content: 'q3', ts: 300 }); convos.appendTo(id, { role: 'assistant', persona: 'lyte', content: 'b3', ts: 301 });
  await comp.request({ meta: { op: 'edit_message', id, ts: 300, content: 'q3 edited', resend: true } });
  assert.ok(convos.get(id).messages.at(-1).content === 'q3 edited' && answered[0][1] === 'lyte', 'asks again with the same agent');
  await comp.request({ meta: { op: 'delete_message', id, ts: 202 } });
  assert.ok(!convos.get(id).messages.some(m => m.ts === 202 || m.ts === 203));
  await comp.request({ meta: { op: 'delete_chat', id } });
  assert.ok(!convos.get(id), 'chat deleted');
  const app = read('docs/companion/app.js');
  assert.ok(app.includes('data-m="delete">🗑 <b>Delete chat</b>') && app.includes("request('delete_chat'") && app.includes("request('edit_message'") && app.includes("request('delete_message'"));
  ok('N28C: delete a chat; tap your message to edit, edit & ask again, or delete');

  // ---------- current model for Apoji Admin
  assert.ok(main.includes('function currentModel()') && main.includes('current: currentModel') && read('src/companion.js').includes('current: a.current?.() || null') && main.includes('store.setSettings({ lastUsed })'));
  ok('the agent + model picked right now are published (and the last used one survives restarts)');

  const ch = JSON.parse(read('docs/whats-new/changes.json'));
  assert.ok(ch[0].version === JSON.parse(read('package.json')).version && !/axiom|apex|cage/i.test(JSON.stringify(ch[0])));
  assert.ok(read('supabase/nexus-v3.3.2.sql').includes("'featfix'"));
  ok('release notes (no Axiom); nexus-v3.3.2.sql adds Feature & Fix');
  console.log(`v3.3.2: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
