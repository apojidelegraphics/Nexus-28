// v1.7.1 tests: phone companion snapshots (agents incl. classic models, chats, a chat, flashcards, stats) and
// phone requests through the relay (sync, open_chat, new_chat, review, run_routine, rename_chat).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nx171-'));

(async () => {
  const { Companion } = require('../src/companion');
  const { Study } = require('../src/study');
  const { Conversations } = require('../src/conversations');
  const { Metrics } = require('../src/metrics');
  const { Relay } = require('../src/relay');

  const dir = tmp();
  const study = new Study({ dir });
  const convos = new Conversations(dir);
  const metrics = new Metrics({ dir });
  const k = study.createDeck({ name: 'Biology' });
  study.addCards(k.id, [{ front: 'Cell powerhouse?', back: 'Mitochondria' }, { front: 'DNA shape?', back: 'Double helix' }]);
  const c1 = convos.appendTo('new', { role: 'user', content: 'hello there' });
  const chatId = convos.summary().list[0].id;
  convos.appendTo(chatId, { role: 'assistant', persona: 'flash', content: '**Hi!** ```js\nx\n``` How can I help?' });

  const writes = [];
  const cloud = { session: { user: { id: 'u' } }, write: async (method, p, body) => { writes.push({ method, p, body }); return []; } };
  const routinesList = [{ id: 'brief', kind: 'brief', name: 'Morning Brief', when: 'Weekdays 8:00', enabled: true }];
  const ran = [];
  let phoneChats = 0;
  const comp = new Companion({ cloud, convos, study, metrics, version: '1.7.1', enabled: () => true,
    routines: { list: () => routinesList, get: id => routinesList.find(r => r.id === id) || null },
    personas: () => [{ id: 'flash', name: "Nexus '28 Flash", color: '#ffd36b', handle: 'flash', features: ['Seek'] }, { id: 'nova', name: 'Nova', color: '#fff', legacy: true }],
    runRoutine: async id => { ran.push(id); }, newPhoneChat: () => { phoneChats++; return 'p' + phoneChats; } });

  const st = comp.status();
  assert.strictEqual(st.agents.length, 2); assert.ok(st.agents.find(a => a.id === 'nova').legacy, 'classic models included');
  assert.ok(typeof st.stats.points === 'number' && st.challenge && st.challenge.text && st.routines[0].name === 'Morning Brief');
  ok('status snapshot: all agents (classic too), stats, challenge, routines');

  const ch = comp.chats();
  assert.strictEqual(ch.list.length, 1); assert.ok(ch.list[0].preview.includes('How can I help') && !ch.list[0].preview.includes('```') && !ch.list[0].preview.includes('**'));
  ok('chat list with clean previews');

  const one = comp.chat(chatId);
  assert.strictEqual(one.messages.length, 2); assert.strictEqual(one.messages[1].persona, 'flash');
  assert.strictEqual(comp.chat('nope'), null);
  ok('single chat snapshot');

  const sd = comp.studyData();
  assert.strictEqual(sd.decks.length, 1); assert.strictEqual(sd.cards.length, 2); assert.strictEqual(sd.cards[0].preview.length, 4);
  ok('flashcards snapshot with grade previews');

  await comp.publish();
  assert.deepStrictEqual(writes.map(w => w.body?.key), ['status', 'chats', 'study']);
  assert.ok(writes.every(w => w.p.startsWith('companion_sync?on_conflict=user_id,key')));
  ok('publish upserts into companion_sync');

  writes.length = 0;
  assert.deepStrictEqual(await comp.request({ meta: { op: 'open_chat', id: chatId } }), { ok: true, id: chatId });
  assert.strictEqual(writes[0].body.key, 'chat:' + chatId);
  await assert.rejects(comp.request({ meta: { op: 'open_chat', id: 'gone' } }));
  for (let i = 0; i < 5; i++) comp.openChats.push('x' + i);
  await comp.openChat(chatId);
  assert.ok(comp.openChats.length <= 4 && writes.some(w => w.method === 'DELETE'), 'only 4 open chats stay synced');
  ok('open_chat publishes the chat; old ones are dropped');

  const card = sd.cards[0];
  await comp.request({ meta: { op: 'review', cardId: card.id, grade: 2 } });
  assert.ok(study.stats().reviewedToday === 1);
  ok('review from the phone updates the deck');

  assert.deepStrictEqual(await comp.request({ meta: { op: 'run_routine', id: 'brief' } }), { ok: true, started: 'Morning Brief' });
  await new Promise(r => setTimeout(r, 10));
  assert.deepStrictEqual(ran, ['brief']);
  await assert.rejects(comp.request({ meta: { op: 'run_routine', id: 'zzz' } }));
  ok('run_routine starts it on the Mac');

  const nc = await comp.request({ meta: { op: 'new_chat' } });
  assert.ok(nc.ok && nc.id === 'p1' && phoneChats === 1);
  await comp.request({ meta: { op: 'rename_chat', id: chatId, title: 'Renamed' } });
  assert.strictEqual(convos.get(chatId).title, 'Renamed');
  await assert.rejects(comp.request({ meta: { op: 'hack' } }), /Unknown request/);
  ok('new_chat, rename_chat; unknown ops refused');

  // Relay: request rows go to onRequest and get a data/error row back, asks still go to handle
  const posted = [];
  const rows = [{ id: 'r1', kind: 'request', content: 'sync', meta: { op: 'sync' } }, { id: 'r2', kind: 'request', meta: { op: 'bad' } }, { id: 'r3', kind: 'ask', agent: 'flash', content: 'hi', meta: {} }];
  const rcloud = { session: {}, authedGet: async () => rows.splice(0), write: async (m, p, b) => { if (m === 'POST') posted.push(b); return []; } };
  const relay = new Relay({ cloud: rcloud, enabled: () => true, beat: 1e12, now: () => 5,
    onRequest: async row => { if (row.meta.op === 'bad') throw new Error('nope'); return { synced: true }; },
    handle: async () => ({ ok: true, text: 'hello', agent: 'flash' }) });
  relay.lastBeat = 5;
  await relay.poll();
  const [a, b, c] = posted;
  assert.strictEqual(a.kind, 'data'); assert.deepStrictEqual(JSON.parse(a.content), { ok: true, synced: true }); assert.strictEqual(a.reply_to, 'r1'); assert.strictEqual(a.meta.op, 'sync');
  assert.strictEqual(b.kind, 'error'); assert.strictEqual(JSON.parse(b.content).error, 'nope');
  assert.strictEqual(c.kind, 'reply'); assert.strictEqual(c.content, 'hello');
  ok('relay answers phone requests and asks');

  // The phone page and SQL are in place
  const page = fs.readFileSync(path.join(__dirname, '../docs/companion/index.html'), 'utf8');
  for (const s of ['companion_sync', "request('open_chat'", "request('review'", "request('run_routine'", 'clearPhoneRows', 'CLASSIC MODELS', 'convId']) assert.ok(page.includes(s), s);
  const sql = fs.readFileSync(path.join(__dirname, '../supabase/nexus-v1.7.1.sql'), 'utf8');
  assert.ok(/create table if not exists public\.companion_sync/.test(sql) && /'request','data'/.test(sql));
  ok('phone page + v1.7.1 SQL');

  console.log(`v1.7.1: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
