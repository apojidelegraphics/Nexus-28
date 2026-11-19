// v3.9 tests: lessons from reviewed examples, stats across computers, Nexus speech, a better Windows wake word,
// Windows voice wording, the chats mind map, and the N28C Computer tab. (Nothing here reads ../apoji-admin.)
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

(async () => {
  // ---------- lessons
  const { createTraining, lessonsText } = require('../src/training');
  assert.strictEqual(lessonsText([], []), '');
  const note = lessonsText([{ q: 'how many cups in a liter', a: 'About 4.2 US cups.', rule: 'Give units' }], ['Always give units']);
  assert.ok(note.includes('LESSONS FROM REVIEWED EXAMPLES') && note.includes('You must follow them') && note.includes('Always give units') && note.includes('Good answer: About 4.2'));
  const calls = [];
  const cloud = { session: {}, rpc: async (fn, a) => { calls.push(fn); return fn === 'training_rules' ? ['Be brief'] : [{ q: 'q?', a: 'a.' }]; } };
  const tr = createTraining({ cloud });
  assert.ok((await tr.lessonsFor('what is a mole in chemistry', 'nexus')).includes('Be brief'));
  await tr.lessonsFor('another question here', 'nexus');
  assert.strictEqual(calls.filter(c => c === 'training_rules').length, 1, 'rules are cached');
  const slow = createTraining({ cloud: { session: {}, rpc: () => new Promise(() => {}) } });
  const t0 = Date.now(); assert.strictEqual(await slow.lessonsFor('a slow database question', '', { timeout: 50 }), ''); assert.ok(Date.now() - t0 < 1000, 'never holds up an answer');
  assert.strictEqual(await createTraining({ cloud: {} }).lessonsFor('signed out question'), '');
  const main = read('main.js');
  assert.ok(main.includes('training.lessonsFor(q, persona.base || persona.id)') && /!noCount && !persona\.apex/.test(main));
  assert.ok(read('docs/try/try.js').includes('lessonsNote('));
  ok('lessons: every agent (and Test Run) checks approved examples and rules first; cached, never slow, nothing when signed out');

  // ---------- stats across computers
  const { combine, Metrics } = require('../src/metrics');
  const today = '2026-11-19';
  const mac = { since: 1000, points: 100, chats: 30, days: ['2026-11-17', '2026-11-18'], unlocked: { first: 5000 }, challenge: { day: today, done: false, streak: 2, best: 3, total: 4 } };
  const pc = { since: 9000, points: 40, chats: 25, days: ['2026-11-19'], unlocked: { first: 3000 }, challenge: { day: today, done: true, streak: 1, best: 1, total: 1 } };
  const c = combine(mac, [pc], today);
  assert.strictEqual(c.points, 140); assert.strictEqual(c.chats, 55);
  assert.strictEqual(c.unlocked.first, 3000, 'earliest unlock wins');
  assert.strictEqual(c.streak, 3, 'days on either computer make one streak');
  assert.ok(c.challenge.done && c.challenge.total === 5);
  const copy = combine(mac, [{ ...mac, points: 120 }], today);
  assert.strictEqual(copy.points, 120, 'a copy of the same stats (moved computer) is not counted twice');
  assert.strictEqual(combine(mac, [], today), mac);
  assert.doesNotThrow(() => combine({ since: 1 }, [{ since: 2 }], today));
  assert.ok(typeof Metrics.prototype.setOthers === 'function' && typeof Metrics.prototype.raw === 'function');
  const { createStatSync } = require('../src/statsync');
  const writes = []; let others = null;
  const ss = createStatSync({ device: () => 'mac-1', metrics: { raw: () => mac, setOthers: o => { others = o; } }, cloud: { session: {}, write: async (...a) => writes.push(a), authedGet: async () => [{ device: 'mac-1', data: mac }, { device: 'pc-1', data: pc }] } });
  await ss.cycle(); await ss.cycle();
  assert.strictEqual(writes.length, 1, 'uploads only when something changed');
  assert.ok(writes[0][1].includes('on_conflict=user_id,device') && others.length === 1 && others[0] === pc);
  const sql = read('supabase/nexus-v3.9.sql');
  assert.ok(sql.includes('create table if not exists public.user_stats') && sql.includes('user_id = auth.uid()'));
  ok('points, achievements and the daily challenge add up across your Mac and PC (each uploads its own share)');

  // ---------- Nexus speech + Windows voice
  assert.ok(sql.includes('function public.stt_take') && /revoke all on function public\.stt_take[^;]*authenticated/.test(sql));
  const fn = read('supabase/functions/nexus-stt/index.ts');
  assert.ok(fn.includes('GROQ_API_KEY') && fn.includes('stt_take') && !/gsk_[A-Za-z0-9]{20}/.test(fn), 'the Groq key lives only in Supabase secrets');
  const cl = read('src/cloud.js'); assert.ok(cl.includes('/functions/v1/nexus-stt') && cl.includes('speechAvailable'));
  const vc = read('renderer/voicecap.js'); assert.ok(vc.includes("'nexus'") && vc.includes('speechInfo'));
  const set = read('renderer/settings.js');
  assert.ok(set.includes("Windows voice (free, on this PC)") && set.includes("WINV ? 'Windows voice'") && set.includes('Automatic: Nexus speech, or Windows on-device'));
  const { SCRIPTS } = require('../src/winhelper');
  assert.ok(SCRIPTS.WAKE_WINRT.includes('Windows.Media.SpeechRecognition') && SCRIPTS.WAKE_WINRT.includes('SpeechRecognitionListConstraint') && !SCRIPTS.WAKE_WINRT.includes('\\`1'));
  assert.ok(read('src/winhelper.js').includes('wakeOld ? LISTEN : WAKE_WINRT'), 'falls back to the old listener');
  ok('Windows: Nexus speech for dictation (no key), WinRT “Hey Nexus”, and Windows voice wording instead of Siri / macOS');

  // ---------- mind map
  const { build } = require('../src/mindmap');
  const msg = t => [{ role: 'user', content: t }, { role: 'assistant', content: t, persona: 'nexus' }];
  const list = [
    { id: 'a', title: 'Python loops help', messages: msg('python loops range iterate python') },
    { id: 'b', title: 'Python list comprehension', messages: msg('python list comprehension iterate python') },
    { id: 'c', title: 'Gatsby essay', spaceId: 's1', messages: msg('gatsby essay themes') },
    { id: 'd', title: 'Trip plan', links: ['a'], messages: msg('japan trip rail') }];
  const g = build({ list, spaces: [{ id: 's1', name: 'School' }] });
  const ids = new Set(g.nodes.map(x => x.id));
  assert.ok(['a', 'b', 'c', 'd', 'space:s1'].every(i => ids.has(i)));
  assert.ok(g.links.some(l => l.a === 'c' && l.b === 'space:s1' && l.kind === 'space'));
  assert.ok(g.links.some(l => l.kind === 'link' && l.a === 'd' && l.b === 'a'));
  assert.ok(g.links.some(l => (l.kind === 'similar' || l.kind === 'topic') && [l.a, l.b].includes('a')), 'chats about the same thing are joined');
  assert.ok(g.links.every(l => ids.has(l.a) && ids.has(l.b)));
  const html = read('renderer/mindmap.html'), mjs = read('renderer/mindmap.js');
  assert.ok(html.includes("script-src 'self'") && html.includes('<script src="mindmap.js">') && !/<script>(?!<)/.test(html));
  assert.ok(mjs.includes('api.mindmap.openChat') && mjs.includes('NexusTheme'));
  assert.ok(main.includes("ipcMain.handle('mindmap:open'") && main.includes("ipcMain.handle('mindmap:openChat'") && read('preload.js').includes('mindmap:'));
  assert.ok(read('renderer/index.html').includes('data-act="mindmap"') && read('renderer/hud.js').includes('Mind map of my chats'));
  ok('mind map of your chats: Spaces, topics, similar and linked chats in a pop-out window; click a chat to open it');

  // ---------- N28C Computer tab
  const ci = read('docs/companion/index.html'), ca = read('docs/companion/app.js');
  assert.ok(ci.includes('id="compTab">Computer<') && ca.includes("'PC' : 'Mac'") && ca.includes('YOUR COMPUTERS') && ca.includes('id="compAuto"') && ca.includes('function setTarget('));
  ok('N28C: the Mac tab is a Computer tab (Mac or PC), with a switcher and an Automatic toggle');

  // ---------- release
  const pkg = JSON.parse(read('package.json')), ch = JSON.parse(read('docs/whats-new/changes.json'));
  const e39 = ch.find(x => x.version === '3.9.0'); assert.ok(e39 && pkg.version >= '3.9.0');
  assert.ok(!/axiom|apex|cage/i.test(JSON.stringify(e39)));
  assert.ok(read('docs/whats-new/feed.xml').includes('3.9.0'));
  ok('3.9.0: version, What\'s New and feed');
  console.log(`\nv3.9: ${n} groups passed`);
})().catch(e => { console.error(e); process.exit(1); });
