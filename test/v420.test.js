// 4.2.0: Jots & Docs, Test Run grows up, share links everywhere, session replays, A/B splits, widgets across monitors,
// Apple Music + Now playing, and the Cite quest / widget fixes
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const main = R('main.js'), sql = R('supabase/nexus-v4.2.0.sql'), more = R('docs/try/more.js'), tryjs = R('docs/try/try.js');

ok('widgets: a widget that grows keeps its bottom, stacked widgets move with it, nothing goes off the top', () => {
  const D = require('../src/deskspot'), scr = { x: 0, y: 0, width: 1440, height: 900 };
  const A = { k: 'a', x: 1160, y: 100, w: 260, h: 100 }, B = { k: 'b', x: 1160, y: 212, w: 260, h: 100 }, C = { k: 'c', x: 880, y: 100, w: 260, h: 100 };
  assert.deepStrictEqual(D.layoutResize(B, 150, [A, C], scr), { me: { y: 162, h: 150 }, moved: [{ k: 'a', y: 50 }] });   // bottom stays at 312; A moves up 50; C (other column) stays
  assert.deepStrictEqual(D.layoutResize(B, 80, [A, C], scr), { me: { y: 232, h: 80 }, moved: [{ k: 'a', y: 120 }] });   // shrinks: both move down, the gap stays
  const T = { k: 't', x: 1160, y: 10, w: 260, h: 100 }, U = { k: 'u', x: 1160, y: 122, w: 260, h: 100 }, V = { k: 'v', x: 1160, y: 234, w: 260, h: 100 };
  const r = D.layoutResize(U, 200, [T, V], scr); assert.strictEqual(r.moved.find(m => m.k === 't').y, 0); assert.strictEqual(r.moved.find(m => m.k === 'v').y, 324);   // hits the top → shifts down, pushes V
  assert.ok(main.includes("require('./src/deskspot').layoutResize(") && main.includes('w._fresh = true') && main.includes('if (me.w._fresh)'));
});
ok('widgets: carried to another monitor (same corner), back when theirs returns, "move them all there"', () => {
  const D = require('../src/deskspot');
  assert.deepStrictEqual(D.carrySpot({ x: 1160, y: 100 }, { x: 0, y: 0, width: 1440, height: 900 }, { x: 1440, y: 0, width: 2560, height: 1440 }), { x: 3720, y: 100 });   // 20px from the right edge stays 20px
  assert.strictEqual(D.homeDisplay({ d: 7 }, [{ id: 7 }])?.id, 7); assert.strictEqual(D.homeDisplay({ d: 9 }, [{ id: 7 }]), null);
  assert.ok(main.includes("screen.on(ev, () => setTimeout(() => deskReplace(ev), 800))") && main.includes("ipcMain.handle('deskw:moveAll'") && R('renderer/settings.js').includes('dwMove') && R('renderer/index.html').includes('id="dwCarry"'));
});
ok('jots go to Jots & Docs, the widget no longer lists them, the old Jots chat is copied once', () => {
  const { Docs } = require('../src/writer'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'j')), d = new Docs(dir);
  d.put({ title: 'Essay', text: 'Hello world' }); const j = d.addJot('Buy milk\nand eggs');
  assert.strictEqual(j.kind, 'jot'); assert.strictEqual(d.jots().length, 1);
  const l = d.list(); assert.ok(l.find(x => x.kind === 'jot').text.startsWith('Buy milk') && l.find(x => x.kind === 'doc'));
  d.put({ id: j.id, title: j.title, text: j.text, kind: 'doc' }); assert.strictEqual(d.jots().length, 0);   // "Make it a document"
  assert.ok(main.includes('function jotsMove()') && !main.includes('jots: jotList().slice(0, 3)') && R('renderer/deskwidgets.js').includes('data-open="jots"'));
  assert.ok(R('renderer/index.html').includes('✎ Jots &amp; Docs') && R('renderer/write.js').includes('id="wrJotIn"') && R('renderer/hud.js').includes("'Jots & Docs…'"));
});
ok('Cite quest: copying, an @Cite card and N28C’s Cite all count, once per source a day', () => {
  assert.ok(main.includes('function citeUsed(key)') && main.includes("citeSeen.get(k) === day") && main.includes("cite: { add: c => { const r = citeStore.add(c); citeUsed(") && main.includes('citeUsed(source.url);   // 4.2.0'));
  assert.ok(R('renderer/hud.js').includes('api.cite.used?.({ url: ctSource.url'));
});
ok('Media: Apple Music + Now playing (Mac and Windows), agents get it when asked about music', () => {
  const M = require('../src/media');
  const mac = M.parseMac(['Music', 'paused', 'Old song', 'A', 'B', '10', '200'].join(M.SEP) + '\n' + ['Spotify', 'playing', 'New song', 'Artist', 'Album', '30.5', '180000'].join(M.SEP));
  assert.strictEqual(mac.app, 'Spotify'); assert.strictEqual(mac.duration, 180); assert.strictEqual(mac.state, 'playing');   // the playing one wins; Spotify ms → s
  const win = M.parseWin('{"app":"AppleInc.AppleMusicWin_nzyj5cx40ttqa!App","title":"Song","artist":"X","state":"Playing","position":5,"duration":100}');
  assert.strictEqual(win.app, 'Apple Music'); assert.match(M.describe(win), /^Playing in Apple Music: "Song" by X · 0:05 \/ 1:40\.$/);
  assert.strictEqual(M.describe(null), 'Nothing is playing.'); assert.strictEqual(M.parseWin('{}'), null);
  const T = require('../src/tools'), ts = T.buildToolset({ agentic: false, settings: { media: { appleMusic: true } }, text: 'what song is playing?', platform: 'darwin' });
  const names = (ts.tools || ts).map(t => t.name || t);
  assert.ok(names.includes('media_now_playing') && names.includes('apple_music_play'));
  const quiet = T.buildToolset({ agentic: false, settings: { media: { appleMusic: true } }, text: 'help me with math', platform: 'darwin' });
  assert.ok(!(quiet.tools || quiet).some(t => String(t.name || t).startsWith('media_')));
  assert.ok(R('renderer/settings.js').includes('id="appleMusicCard"') && R('renderer/settings.js').includes('id="nowPlayingCard"') && main.includes("ipcMain.handle('media:test'"));
});
ok('share a chat as a link: only the words go, anyone with the link can read it, it can be stopped (everywhere)', () => {
  const SL = require('../src/sharelink');
  const m = SL.shareMessages([{ role: 'user', content: 'hi', images: ['data:x'] }, { role: 'assistant', content: 'yo [[conf:80]]', persona: 'flash', memory: 'secret' }, { role: 'system', content: 'x' }, { role: 'assistant', content: 'bad', error: true }]);
  assert.deepStrictEqual(m.map(x => Object.keys(x).sort().join()), ['agent,content,role,ts', 'agent,content,role,ts']); assert.strictEqual(m[1].content, 'yo');
  assert.ok(sql.includes('function public.share_chat_create') && sql.includes('grant execute on function public.share_chat_get(text) to anon') && sql.includes('function public.share_chat_stop'));
  assert.ok(main.includes("ipcMain.handle('share:create'") && R('docs/companion/app.js').includes("p_source: 'phone'") && more.includes("p_source: 'test_run'"));
  assert.ok(R('docs/share/share.js').includes('share_chat_get') && R('docs/share/index.html').includes('Continue this chat in Test Run') && more.includes('function forkShared('));
});
ok('session replays: steps only (no typing, no chat text, no account), sent without sign-in, can be turned off', () => {
  const RP = require('../renderer/replay');
  assert.strictEqual(RP.errLabel('Cannot read "my secret essay" of undefined', 'https://x/app.js?v=1', 12), 'app.js:12 Cannot read … of undefined');
  assert.match(RP.deviceId(() => '', () => {}), /^[a-z0-9]{20}$/);
  assert.ok(RP.PRIVATE.includes('.msg') && RP.PRIVATE.includes('#chatList'));
  assert.strictEqual(R('docs/companion/replay.js').split('\n').slice(1).join('\n'), R('renderer/replay.js'));   // synced to N28C + Test Run
  assert.ok(main.includes("cloud.anonRpc('replay_save'") && R('renderer/hud.js').includes('window.NexusReplay.start({ app: i.app') && R('docs/companion/app.js').includes("window.NexusReplay.start({ app: 'phone'") && more.includes("app: 'test_run'"));
  assert.ok(sql.includes('create table if not exists public.session_replays') && !/user_id/.test(sql.slice(sql.indexOf('create table if not exists public.session_replays'), sql.indexOf('create index if not exists session_replays_when'))));
  assert.ok(R('renderer/index.html').includes('id="replayOn"') && more.includes('id="rpOn"') && R('docs/companion/app.js').includes('id="replaysOn"'));
});
ok('A/B splits: stable halves from the same hash everywhere; replays carry the variant', () => {
  const F = require('../src/flags');
  const st = id => F.resolve({ remote: [{ key: 'ab_x', stage: 'all', rollout: 50 }], bucket: id }).flags.ab_x;
  let on = 0; for (let i = 0; i < 2000; i++) if (st('u' + i).on) on++; assert.ok(on > 850 && on < 1150, 'about half: ' + on);
  assert.strictEqual(st('same').on, st('same').on); assert.ok(['a', 'b'].includes(st('u1').variant));
  assert.deepStrictEqual(F.variantsOf(F.resolve({ remote: [{ key: 'ab_x', stage: 'all', rollout: 50 }, { key: 'plain', stage: 'all' }], bucket: 'z' })), { ab_x: F.bucketOf('z', 'ab_x') < 50 ? 'b' : 'a' });
  assert.ok(tryjs.includes('const bucketOf = (id, key) => { let h = 2166136261;') && main.includes('bucket: cloud?.session?.user?.id || replayDevice()') && sql.includes('check (rollout between 1 and 100)'));
});
ok('Test Run: Spaces, memory, huddle & debate, decks (3), profile & shop, quests, starters, ⌘K, voice, install', () => {
  const el = () => ({ addEventListener() {}, insertAdjacentHTML() {}, querySelector: () => null, querySelectorAll: () => [], before() {}, set onclick(_) {}, classList: { toggle() {}, add() {}, remove() {} }, hidden: true });
  const win = { TR: { S: {}, sb: {}, $: () => el(), esc: s => String(s), store: { get: (k, d) => d, set() {} }, toast() {}, AGENTS: {} }, NexusIcons: null };
  vm.runInNewContext(more, { window: win, document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }, navigator: { platform: 'MacIntel', userAgent: '' }, location: { protocol: 'http:', search: '' }, addEventListener() {}, matchMedia: () => ({ matches: false }), CSS: { escape: s => s }, setTimeout, clearTimeout, Date, Math, JSON, Promise, Object, Array, String, Number, Set, Map, RegExp, URLSearchParams });
  const T = win.TRX._;
  const c = T.gradeCard({}, 2); assert.strictEqual(c.ivl, 1); T.gradeCard(c, 2); assert.strictEqual(c.ivl, 3); const a = T.gradeCard({ ivl: 10, reps: 3 }, 1); assert.strictEqual(a.reps, 0);
  assert.strictEqual(T.parseCards('{"name":"Cells","cards":[{"f":"DNA","b":"genes"},{"front":"ATP","back":"energy"},{"f":"","b":"x"}],}').cards.length, 2);
  assert.strictEqual(T.appAddsFor('what is on my screen right now'), 'screen'); assert.strictEqual(T.appAddsFor('find the file I saved yesterday'), 'files'); assert.strictEqual(T.appAddsFor('explain photosynthesis'), '');
  assert.ok(Object.keys(T.STARTERS).length >= 5 && Object.values(T.STARTERS).every(l => l.length >= 6));
  for (const k of ['intercept', 'systemExtra', 'afterAnswer', 'msgExtra', 'paintStarters', 'chatHidden', 'chatMenuAction', 'settingsTab', 'enter']) assert.ok(win.TRX[k], k);
  for (const k of ["window.TRX.intercept(raw, pics)", "window.TRX?.systemExtra?.(p.text)", "window.TRX?.afterAnswer?.(msg", "window.TRX?.msgExtra?.(m, i)", "window.TRX?.paintStarters?.()", "window.TRX?.settingsTab?.(setTab)", 'window.TR = {']) assert.ok(tryjs.includes(k), k);
  for (const k of ["group('huddle'", "group('debate'", 'const MAX_DECKS = 3', "sb.rpc('try_quest_claim'", "sb.rpc('cirkts_buy'", 'function palette()', 'function voice()', 'function guided(', 'function handoff(', "navigator.serviceWorker.register('sw.js')"]) assert.ok(more.includes(k), k);
  assert.ok(sql.includes('jsonb_array_length(decks) <= 3') && sql.includes('function public.try_quest_claim') && sql.includes("(auth.jwt() ->> 'is_anonymous')::boolean"));
  assert.ok(R('docs/try/index.html').includes('<script src="more.js"></script>') && R('docs/try/index.html').includes('manifest.webmanifest') && JSON.parse(R('docs/try/manifest.webmanifest')).display === 'standalone');
  assert.ok(fs.statSync(path.join(__dirname, '..', 'docs/downloads/nexus-test-run-chrome.zip')).size > 1000 && JSON.parse(R('docs/try/extension/manifest.json')).side_panel);
});
ok('Cirkts earned in Test Run sit in their own column (the apps’ points sync can’t swallow them)', () => {
  assert.ok(sql.includes('add column if not exists extra int') && (sql.match(/w\.earned \+ w\.extra - w\.spent/g) || []).length === 2 && sql.includes("'balance', coalesce(w.earned, 0) + coalesce(w.extra, 0) - coalesce(w.spent, 0)"));
});
ok('bringing Test Run chats into the app brings their Spaces and memory, and the same agent', () => {
  assert.ok(main.includes("try_state?select=spaces,chat_space,memory") && main.includes("memory.add(String(m.text), 'test run')") && main.includes("searchParams.get('agent')"));
});
ok('Terms 1.1 cover shared links and usage replays; What’s new lists 4.2.0 first', () => {
  const t = R('renderer/terms-data.js'); assert.ok(t.includes("version: '1.1'") && t.includes('anonymous usage replays') && t.includes('chats you share as a link'));
  assert.strictEqual(JSON.parse(R('docs/whats-new/changes.json'))[0].version, JSON.parse(R('package.json')).version);
});
console.log(`v4.2.0: ${n} passed`);
