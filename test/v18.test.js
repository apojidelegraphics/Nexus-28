// v1.8 tests: N28C phone notifications (push prefs, reminders, streak-saver), new phone actions (decks, cards,
// pins, missions, clipboard, send-to-Mac, widgets), the shared phone files staying in sync, and the SQL.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nx18-'));

(async () => {
  // ---- push
  const { Push, cleanPrefs, DEFAULT_PREFS } = require('../src/push');
  assert.deepStrictEqual(cleanPrefs({ study: '25:00', streak: '07:05', replies: 0, junk: 1 }), { ...DEFAULT_PREFS, study: '', streak: '07:05', replies: false });
  ok('notification prefs are cleaned');

  let settings = { phone: {} }, secret = {};
  const sent = [], deleted = [];
  let looking = false, subs = [{ key: 'push:d1', data: { sub: { endpoint: 'https://push.example/1', keys: {} } } }, { key: 'push:bad', data: { sub: { endpoint: 'http://insecure' } } }];
  const cloud = { session: {}, authedGet: async p => p.includes('key=eq.seen') ? [{ data: { at: looking ? clock : 0 } }] : subs, write: async (m, p) => { if (m === 'DELETE') deleted.push(p); } };
  let clock = new Date(2026, 10, 14, 18, 59).getTime();
  const webpush = { generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }), sendNotification: async (sub, payload, opts) => { if (sub.endpoint.endsWith('/gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; } sent.push({ sub, payload: JSON.parse(payload), opts }); } };
  const push = new Push({ cloud, webpush, now: () => clock, getSettings: () => settings, setSettings: p => { settings = { ...settings, ...p }; }, getSecret: () => secret, setSecret: v => { secret = v; } });
  assert.strictEqual(push.publicKey(), 'PUB'); assert.strictEqual(secret.privateKey, 'PRIV'); assert.ok(!JSON.stringify(settings).includes('PRIV'), 'private key stays out of settings');
  assert.strictEqual(await push.send('replies', { title: 'Flash', body: '**Hi** ```x```' }), 1);
  assert.strictEqual(sent[0].payload.body, 'Hi'); assert.strictEqual(sent[0].opts.vapidDetails.privateKey, 'PRIV');
  looking = true; assert.strictEqual(await push.send('replies', { title: 'x' }), 0, 'no buzz while the app is open'); looking = false;
  push.setPrefs({ missions: false }); assert.strictEqual(await push.send('missions', { title: 'x' }), 0, 'muted kind');
  subs = [{ key: 'push:old', data: { sub: { endpoint: 'https://push.example/gone' } } }]; push.subs = null;
  await push.send('routines', { title: 'x' }); assert.ok(deleted.some(p => p.includes('push%3Aold')), 'expired phones are forgotten');
  ok('push: keys, payload cleanup, mute while looking, per-kind prefs, expired subscriptions');

  subs = [{ key: 'push:d1', data: { sub: { endpoint: 'https://push.example/1' } } }]; push.subs = null; sent.length = 0;
  push.setPrefs({ study: '19:00', streak: '20:30' });
  assert.deepStrictEqual(await push.tick({ due: 4, challengeDone: false }), [], 'not yet');
  clock = new Date(2026, 10, 14, 19, 2).getTime();
  assert.deepStrictEqual(await push.tick({ due: 4, challengeDone: false }), ['study']);
  assert.deepStrictEqual(await push.tick({ due: 4, challengeDone: false }), [], 'once a day');
  clock = new Date(2026, 10, 14, 20, 40).getTime();
  assert.deepStrictEqual(await push.tick({ due: 4, challengeDone: true }), [], 'challenge done → no streak-saver');
  clock = new Date(2026, 10, 15, 20, 31).getTime();
  assert.deepStrictEqual(await push.tick({ due: 0, challengeDone: false, challengeText: 'Send 5 messages' }), ['streak'], 'nothing due → no study reminder, streak-saver fires');
  assert.ok(sent.at(-1).payload.body.includes('Send 5 messages'));
  ok('study reminder + evening streak-saver at your times, once a day');

  // ---- companion actions
  const { Companion } = require('../src/companion');
  const { Study } = require('../src/study');
  const { Conversations } = require('../src/conversations');
  const { Metrics } = require('../src/metrics');
  const dir = tmp();
  const study = new Study({ dir }), convos = new Conversations(dir), metrics = new Metrics({ dir });
  convos.appendTo('new', { role: 'user', content: 'hi' });
  const chatId = convos.summary().list[0].id;
  const sp = convos.addSpace({ name: 'School' });
  const calls = [];
  const comp = new Companion({ cloud: { session: {}, write: async () => [] }, convos, study, metrics, version: '1.8.0', enabled: () => true, push,
    routines: { list: () => [], get: () => null }, personas: () => [], runRoutine: async () => {}, newPhoneChat: () => 'p1',
    actions: {
      clipGet: async () => ({ text: 'copied on mac', recent: ['a'] }), clipSet: async t => calls.push(['clip', t]), inbox: async m => { calls.push(['inbox', m.action]); return { done: 'Saved on your Mac' }; },
      missionStart: async ({ goal }) => goal.length > 5 ? { ok: true, state: { convId: chatId, title: goal } } : { ok: false, error: 'Describe it' }, missionEnd: () => calls.push(['end']),
      missionState: () => ({ status: 'running', title: 'Plan', elapsed: 1, budget: 2 }), templates: () => [{ id: 't', icon: '✈', name: 'Trip', goal: 'Plan {days}', fields: [{ key: 'days', label: 'Days' }], minutes: 30 }],
      makeDeck: async ({ topic, count }) => { const r = study.addCards({ name: topic }, Array.from({ length: count }, (_, i) => ({ front: 'Q' + i, back: 'A' + i }))); return { ok: true, deck: r.deck, added: r.added }; },
      patchWidget: a => calls.push(['widget', a.key])
    } });
  const st = comp.status();
  assert.strictEqual(st.push.key, 'PUB'); assert.strictEqual(st.mission.title, 'Plan'); assert.strictEqual(st.templates[0].fields[0].label, 'Days'); assert.ok(st.spaces.some(x => x.name === 'School'));
  ok('status carries push key + prefs, mission, templates, Spaces');

  await comp.request({ meta: { op: 'pin_chat', id: chatId, on: true } });
  await comp.request({ meta: { op: 'move_chat', id: chatId, spaceId: sp.id } });
  const row = comp.chats().list[0];
  assert.ok(row.pinned > 0 && row.spaceId === sp.id && row.space.name === 'School');
  await comp.request({ meta: { op: 'pin_chat', id: chatId, on: false } });
  assert.strictEqual(comp.chats().list[0].pinned, 0);
  ok('pin / unpin / move to a Space');

  const md = await comp.request({ meta: { op: 'make_deck', topic: 'French Revolution', count: 10 } });
  assert.ok(md.ok && md.added === 10 && md.deck === 'French Revolution');
  const ac = await comp.request({ meta: { op: 'add_cards', deckId: md.deckId, cards: [{ front: 'Year?', back: '1789' }, { front: '', back: 'x' }] } });
  assert.strictEqual(ac.added, 1);
  const card = study.cards(md.deckId).find(c => c.front === 'Year?');
  await comp.request({ meta: { op: 'card_edit', id: card.id, front: 'Start year?', back: '1789' } });
  assert.strictEqual(study.cards(md.deckId).find(c => c.id === card.id).front, 'Start year?');
  await comp.request({ meta: { op: 'card_delete', id: card.id } });
  assert.strictEqual(study.cards(md.deckId).length, 10);
  const nd = await comp.request({ meta: { op: 'deck_create', name: 'Mine' } });
  await comp.request({ meta: { op: 'add_cards', deck: 'Shared by Sam', cards: [{ front: 'a', back: 'b' }] } });
  assert.ok(study.decks().some(d => d.id === nd.deckId) && study.decks().some(d => d.name === 'Shared by Sam'));
  await assert.rejects(comp.request({ meta: { op: 'card_edit', id: 'nope', front: 'x' } }));
  ok('make a deck, add / edit / delete cards, new deck, add a shared deck');

  assert.deepStrictEqual(await comp.request({ meta: { op: 'clip_get' } }), { ok: true, text: 'copied on mac', recent: ['a'] });
  await comp.request({ meta: { op: 'clip_set', text: 'from phone' } });
  assert.strictEqual((await comp.request({ meta: { op: 'inbox', action: 'save' } })).done, 'Saved on your Mac');
  const ms = await comp.request({ meta: { op: 'mission_start', goal: 'Plan a trip to Tokyo' } });
  assert.strictEqual(ms.convId, chatId);
  await assert.rejects(comp.request({ meta: { op: 'mission_start', goal: 'x' } }), /Describe/);
  await comp.request({ meta: { op: 'mission_end' } });
  await comp.request({ meta: { op: 'patch_widget', convId: chatId, ts: 1, key: 'quiz', value: { 0: 1 } } });
  const pp = await comp.request({ meta: { op: 'set_prefs', prefs: { spaces: false } } });
  assert.strictEqual(pp.prefs.spaces, false);
  assert.deepStrictEqual(calls.map(c => c[0]), ['clip', 'inbox', 'end', 'widget']);
  ok('clipboard bridge, send to Mac, missions, widget state, notification prefs');

  // ---- conversations pin
  assert.ok(convos.pin(chatId, true).pinned); assert.ok(!convos.pin(chatId, false).pinned);
  ok('chats can be pinned');

  // ---- phone files stay in sync with the Mac app
  const { build } = require('../scripts/sync-companion');
  for (const [f, txt] of Object.entries(build())) assert.strictEqual(fs.readFileSync(path.join(__dirname, '../docs/companion', f), 'utf8'), txt, `docs/companion/${f} is out of date: run npm run sync:companion`);
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/companion/manifest.webmanifest'), 'utf8'));
  assert.strictEqual(man.name, 'N28C'); assert.ok(man.icons.some(i => i.sizes === '512x512') && man.share_target);
  for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'sw.js', 'app.js']) assert.ok(fs.existsSync(path.join(__dirname, '../docs/companion', f)), f);
  const app = fs.readFileSync(path.join(__dirname, '../docs/companion/app.js'), 'utf8');
  for (const s of ['pushManager.subscribe', "'make_deck'", "'card_edit'", 'cram', "'mission_start'", "'clip_get'", "'inbox'", 'create_shared_space', 'join_shared_space', 'startTalk', 'NexusWidgets.enhance', 'companion_files']) assert.ok(app.includes(s), s);
  ok('N28C: shared orb + widgets in sync, manifest, icons, service worker, features wired');

  // ---- orb skins: the new one, and Quick Ask uses your skin
  const orb = fs.readFileSync(path.join(__dirname, '../renderer/orb.js'), 'utf8');
  assert.ok(orb.includes("skin === 'overlord'"));
  assert.ok(/overlord: 2000/.test(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8')));
  assert.ok(/skin: skinOf\(\)/.test(fs.readFileSync(path.join(__dirname, '../renderer/quick.js'), 'utf8')));
  ok('Overlord orb skin; Quick Ask orb wears your skin');

  const sql = fs.readFileSync(path.join(__dirname, '../supabase/nexus-v1.8.sql'), 'utf8');
  for (const s of ['companion_files', 'shared_spaces', 'shared_space_members', 'shared_space_posts', 'is_space_member', 'create_shared_space', 'join_shared_space', 'enable row level security']) assert.ok(sql.includes(s), s);
  ok('v1.8 SQL');

  console.log(`v1.8: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
