// v1.6 tests: study decks + spaced repetition, routine triggers (Wi-Fi, headphones, app, unlock), the Evening Wrap-up,
// mission templates, and mission report sharing (Markdown / HTML / Word).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nx16-'));
const DAY = 86400e3;

(async () => {
  // ---- spaced repetition
  const { Study, schedule, cardsFromText } = require('../src/study');
  const t0 = new Date(2026, 10, 13, 10, 0).getTime();
  let c = schedule({}, 2, t0);
  assert.strictEqual(c.interval, 1); assert.strictEqual(c.reps, 1);
  c = schedule(c, 2, t0 + DAY); assert.strictEqual(c.interval, 6);
  c = schedule(c, 2, t0 + 7 * DAY); assert.strictEqual(c.interval, 15, '6 × 2.5 ease');
  const again = schedule(c, 0, t0 + 22 * DAY);
  assert.strictEqual(again.reps, 0); assert.strictEqual(again.lapses, 1); assert.strictEqual(again.due, t0 + 22 * DAY + 10 * 60e3);
  assert.ok(again.ease < c.ease && again.ease >= 1.3);
  assert.strictEqual(schedule({}, 3, t0).interval, 4, 'Easy on a new card jumps ahead');
  assert.ok(new Date(schedule({}, 2, t0).due).getHours() === 4, 'due early that morning');
  ok('SM-2: 1 → 6 → 15 days for Good, Again resets with a 10-minute relearn, ease never below 1.3');

  let now = t0;
  const st = new Study({ dir: tmp(), now: () => now });
  const r = st.addCards({ name: 'Spanish verbs' }, [{ front: 'tener', back: 'to have' }, { front: 'hacer', back: 'to do' }, { front: 'poder', back: 'can' }, { front: 'decir', back: 'to say' }, { front: 'Tener', back: 'dup' }, { front: '', back: 'x' }]);
  assert.strictEqual(r.added, 4); assert.strictEqual(r.skipped, 2);
  assert.strictEqual(st.addCards({ name: 'spanish VERBS' }, [{ q: 'ir', a: 'to go' }]).deck.id, r.deck.id, 'same deck by name (any case)');
  assert.strictEqual(st.dueCount(), 5);
  const q = st.queue(r.deck.id);
  assert.strictEqual(q.length, 5); assert.deepStrictEqual(q[0].preview, ['10 min', '1 d', '1 d', '4 d']);
  for (const card of q) st.review(card.id, card.front === 'poder' ? 0 : 2);
  assert.strictEqual(st.dueCount(), 0, 'Again cards wait 10 minutes');
  now += 11 * 60e3; assert.strictEqual(st.dueCount(), 1);
  const s1 = st.stats(); assert.strictEqual(s1.reviewedToday, 5); assert.strictEqual(s1.correctToday, 4); assert.strictEqual(s1.streak, 1);
  now += DAY; assert.strictEqual(st.dueCount(), 5);
  assert.ok(st.summaryLine().startsWith('5 flashcards due now'));
  const pq = st.practice(r.deck.id, 3);
  assert.strictEqual(pq.length, 3); for (const x of pq) { assert.strictEqual(x.choices.length, 4); assert.strictEqual(new Set(x.choices).size, 4); assert.ok(x.answer >= 0); }
  const small = st.addCards({ name: 'Tiny' }, [{ front: 'a', back: 'b' }]).deck;
  assert.throws(() => st.practice(small.id), /at least 4/);
  const st2 = new Study({ dir: path.dirname(st.file), now: () => now });
  assert.strictEqual(st2.decks().length, 2, 'saved to disk');
  st.removeDeck(small.id); assert.strictEqual(st.decks().length, 1);
  ok('decks: dedupe, find-by-name, review queue with interval previews, streak, practice quiz, saved on disk');

  const fromBlock = cardsFromText('Sure!\n```nexus-flashcards\n{"title":"Cells","cards":[{"front":"ATP","back":"energy"},{"front":"DNA","back":"genes"},]}\n```');
  assert.strictEqual(fromBlock.title, 'Cells'); assert.strictEqual(fromBlock.cards.length, 2);
  const fromLines = cardsFromText('1. Q: What is H2O?\nA: Water\n- Mitosis — cell division\n- **Osmosis**: water moving across a membrane');
  assert.deepStrictEqual(fromLines.cards.map(c => c.front), ['What is H2O?', 'Mitosis', 'Osmosis']);
  ok('cards from replies: nexus-flashcards JSON (with trailing commas), Q/A lines, "term — definition" lists');

  // ---- triggers
  const { TriggerWatcher, describeTrigger } = require('../src/triggers');
  const env = { ssid: 'Home', audio: 'MacBook Speakers', bt: false, apps: ['Finder'] };
  const audioJSON = () => JSON.stringify({ SPAudioDataType: [{ _items: [
    { _name: 'MacBook Pro Speakers', coreaudio_device_output: 2, ...(env.audio === 'MacBook Speakers' ? { coreaudio_default_audio_output_device: 'spaudio_yes' } : {}) },
    { _name: env.bt ? env.audio : 'nope', coreaudio_device_output: 2, coreaudio_device_transport: 'coreaudio_device_type_bluetooth', ...(env.bt ? { coreaudio_default_audio_output_device: 'spaudio_yes' } : {}) }] }] });
  const run = async (cmd, args) => {
    if (cmd === 'networksetup') return env.ssid ? `Current Wi-Fi Network: ${env.ssid}\n` : 'You are not associated with an AirPort network.\n';
    if (cmd === 'ipconfig') return '';
    if (cmd === 'system_profiler') return audioJSON();
    if (cmd === 'ps') return env.apps.map(a => `/Applications/${a}.app/Contents/MacOS/${a}`).join('\n') + '\n/usr/sbin/cfprefsd\n';
    return '';
  };
  let tnow = t0;
  const routinesList = [
    { id: 'w1', name: 'School wifi', enabled: true, trigger: { type: 'wifi', value: 'NCSU', cooldown: 60 } },
    { id: 'w2', name: 'Any wifi', enabled: true, trigger: { type: 'wifi', value: '', cooldown: 60 } },
    { id: 'h1', name: 'Focus music', enabled: true, trigger: { type: 'headphones', value: 'airpods', cooldown: 15 } },
    { id: 'a1', name: 'Code helper', enabled: true, trigger: { type: 'app', value: 'Xcode', cooldown: 60 } },
    { id: 'u1', name: 'Welcome back', enabled: true, trigger: { type: 'unlock', cooldown: 60 } },
    { id: 'off', name: 'Paused', enabled: false, trigger: { type: 'app', value: 'Xcode' } },
    { id: 't', name: 'Timed', enabled: true, schedule: { type: 'daily' } }
  ];
  const fired = [];
  const tw = new TriggerWatcher({ list: () => routinesList, fire: (r, why) => fired.push(`${r.id}:${why}`), run, platform: 'darwin', now: () => tnow });
  await tw.poll();
  assert.deepStrictEqual(fired, [], 'nothing fires for the state Nexus started in');
  env.ssid = 'NCSU'; env.apps.push('Xcode'); await tw.poll();
  assert.deepStrictEqual(fired, ['w1:joined NCSU', 'w2:joined NCSU', 'a1:Xcode opened']);
  env.ssid = ''; await tw.poll(); env.ssid = 'NCSU'; await tw.poll();
  assert.strictEqual(fired.length, 3, 'cooldown: rejoining within the hour does nothing');
  tnow += 61 * 60e3; env.ssid = 'Starbucks'; await tw.poll();
  assert.deepStrictEqual(fired.slice(3), ['w2:joined Starbucks'], 'named network only matches its name');
  env.audio = 'Lucas’s AirPods Pro'; env.bt = true; await tw.poll();
  assert.deepStrictEqual(fired.slice(4), ['h1:Lucas’s AirPods Pro connected']);
  tw.unlocked('Mac unlocked'); tw.unlocked('Mac woke');
  assert.deepStrictEqual(fired.slice(5), ['u1:Mac unlocked']);
  assert.ok(!fired.some(f => f.startsWith('off')));
  assert.strictEqual(describeTrigger({ type: 'wifi', value: 'Home' }), 'When you join "Home" Wi-Fi');
  assert.strictEqual(describeTrigger({ type: 'app', value: 'Xcode' }), 'When Xcode opens');
  const linux = new TriggerWatcher({ list: () => routinesList, fire: () => {}, run, platform: 'linux' }); linux.start(); assert.strictEqual(linux.timer, null);
  ok('triggers: Wi-Fi (any / by name), headphones, app launch, unlock — only on change, with a cooldown');

  // ---- routines with triggers + the wrap-up built-in
  const { Routines } = require('../src/routines');
  const rdir = tmp();
  const R = new Routines({ dir: rdir, run: async () => ({ ok: true }), now: () => t0 });
  const kinds = R.list().map(x => x.kind);
  assert.deepStrictEqual(kinds, ['brief', 'wrap']);
  assert.throws(() => R.remove('wrap'), /Evening Wrap-up/);
  const tr = R.upsert({ prompt: 'Summarize what I should study', trigger: { type: 'wifi', value: 'NCSU', cooldown: 2 } });
  assert.strictEqual(tr.nextRun, null); assert.strictEqual(tr.trigger.cooldown, 5, 'cooldown clamped');
  assert.strictEqual(R.list().find(x => x.id === tr.id).when, 'When you join "NCSU" Wi-Fi');
  assert.throws(() => R.upsert({ prompt: 'x y z', trigger: { type: 'app', value: '' } }), /Which app/);
  assert.throws(() => R.upsert({ id: 'brief', trigger: { type: 'unlock' } }), /schedule/);
  const back = R.upsert({ id: tr.id, trigger: null, schedule: { type: 'daily', time: '09:00' } });
  assert.ok(!back.trigger && back.nextRun > t0, 'switching back to a schedule');
  assert.strictEqual(await R.tick(), 0);
  ok('routines: trigger routines never run on the clock; Evening Wrap-up is built in and can\'t be deleted');

  // ---- Evening Wrap-up gathering
  const brief = require('../src/brief');
  const { Conversations } = require('../src/conversations');
  const cv = new Conversations(tmp());
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const c1 = cv.appendTo('new', { role: 'user', content: 'help me launch an Etsy shop', ts: today.getTime() });
  cv.appendTo(c1.id, { role: 'assistant', persona: 'neodela', content: '```nexus-steps\n{"title":"Etsy launch","steps":[{"title":"Pick products"},{"title":"Photos"},{"title":"Listings"}]}\n```', ts: today.getTime() + 1000, widget: { steps: [0] } });
  const old = cv.appendTo('new', { role: 'user', content: 'old chat', ts: today.getTime() - 3 * DAY });
  cv.get(old.id).updated = today.getTime() - 3 * DAY; cv.save();
  const facts = await brief.gatherWrap({ settings: {}, deps: { convos: cv, now: () => today.getTime() + 3600e3, study: st, metrics: { summary: () => ({ points: 120, streak: 3, achievements: [] }) } } });
  const keys = facts.blocks.map(b => b.key);
  assert.deepStrictEqual(keys, ['today', 'checklists', 'study', 'stats']);
  assert.ok(facts.blocks[0].text.includes('help me launch an Etsy shop') && !facts.blocks[0].text.includes('old chat'));
  assert.strictEqual(facts.blocks[1].text, '- Etsy launch: 1/3 done. Left: Photos; Listings');
  assert.ok(facts.notes.some(x => /Apple Calendar/.test(x)));
  const wp = brief.wrapPrompt({ ...facts, nickname: 'Lucas' });
  assert.ok(wp.includes('Evening Wrap-up') && wp.includes('call me Lucas') && wp.includes('Unfinished checklists'));
  const bf = await brief.gather({ sections: { weather: false, headlines: false, calendar: false }, deps: { study: st } });
  assert.ok(bf.blocks.some(b => b.key === 'study'), 'Morning Brief mentions flashcards due');
  ok('Evening Wrap-up: today\'s chats, unfinished checklists (ticks remembered), study + stats; brief shows cards due');

  // ---- mission templates
  const mt = require('../src/missiontemplates');
  assert.ok(mt.BUILTIN.length >= 8);
  for (const t of mt.BUILTIN) assert.deepStrictEqual(t.fields.map(f => f.key).sort(), mt.fieldsOf(t.goal).sort(), `${t.id} fields match its blanks`);
  const filled = mt.fill(mt.BUILTIN.find(t => t.id === 'trip'), { place: 'Tokyo', days: '5', who: 'two friends' });
  assert.ok(filled.goal.startsWith('Plan a 5-day trip to Tokyo for two friends') && filled.goal.includes('{currency}'));
  assert.deepStrictEqual(filled.missing, ['Currency']);
  const mine = mt.cleanTemplates([{ name: 'Weekly recap', goal: 'Recap {topic} news this week with sources', minutes: 15 }, { goal: 'short' }, { goal: 'Plan a party', minutes: 7 }]);
  assert.strictEqual(mine.length, 2); assert.deepStrictEqual(mine[0].fields.map(f => f.label), ['Topic']); assert.strictEqual(mine[1].minutes, 20); assert.ok(/^my-/.test(mine[0].id));
  ok('mission templates: blanks match fields, fill() reports what is missing, your own templates are cleaned');

  // ---- mission report sharing
  const rep = require('../src/missionreport');
  const mconv = { id: 'm1', title: 'Mission: Best laptops under $800', kind: 'mission', created: t0, messages: [
    { role: 'user', content: 'Best laptops under $800 for coding\n\n(Mission · 20 min)', ts: t0 },
    { role: 'assistant', persona: 'paragon', via: 'mission', content: '- Searched reviews\n- Next: compare', ts: t0 + 60e3, activity: [{ tool: 'web_search', label: 'Searching the web', detail: 'best coding laptop', status: 'ok', sources: [{ title: 'Verge', url: 'https://verge.com/a' }] }] },
    { role: 'user', hidden: true, content: 'Keep going' },
    { role: 'assistant', persona: 'paragon', via: 'mission', content: 'Compared 5. MISSION COMPLETE', ts: t0 + 9 * 60e3, sources: [{ title: 'Verge', url: 'https://verge.com/a' }, { title: 'RTINGS', url: 'https://rtings.com/x' }] },
    { role: 'assistant', persona: 'paragon', via: 'mission', report: true, content: '**Pick: MacBook Air M2.**\n\n| Laptop | Price |\n|---|---|\n| Air M2 | $799 |', ts: t0 + 10 * 60e3 }] };
  const b = rep.build(mconv);
  assert.strictEqual(b.title, 'Best laptops under $800'); assert.strictEqual(b.goal, 'Best laptops under $800 for coding'); assert.strictEqual(b.minutes, 20);
  assert.ok(b.complete); assert.deepStrictEqual(b.stats, { rounds: 2, actions: 1, sources: 2 }); assert.strictEqual(rep.duration(b), '10 min');
  const md = rep.toMarkdown(b);
  assert.ok(md.includes('**Goal:** Best laptops') && md.includes('## Sources') && md.includes('2. [RTINGS](https://rtings.com/x)') && md.includes('### Round 1') && !md.includes('MISSION COMPLETE'));
  const html = rep.toHTML(b, s => `<p>${s}</p>`);
  assert.ok(html.includes("NEXUS '28 · MISSION REPORT") && html.includes('<b>2</b>rounds') && html.includes('rtings.com'));
  const docx = await rep.toDocx(b);
  assert.ok(Buffer.isBuffer(docx) && docx.slice(0, 2).toString() === 'PK', 'a real .docx (zip)');
  const unfinished = rep.build({ ...mconv, messages: mconv.messages.slice(0, 2) });
  assert.ok(!unfinished.complete && unfinished.report.includes('Searched reviews'));
  ok('mission sharing: cover stats, final report, deduped sources, rounds; Markdown, PDF-ready HTML and Word');

  console.log(`\n${n} v1.6 checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
