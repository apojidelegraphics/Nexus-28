// v3.4 tests: real display brightness, the Owner's crown, "What your phone gets", searchable settings, a bigger
// Wrapped, and Nexus Test Run (the web version).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- real brightness (with a fake helper)
  const { createBrightness } = require('../src/brightness');
  const vals = { 1: 0.8, 2: 0.5 };
  const exec = (bin, args, o, cb) => { const [c, id, v] = args;
    if (c === 'check') return cb(null, JSON.stringify([{ id: 1, builtin: true, supported: true, value: vals[1] }, { id: 2, builtin: false, supported: false }]));
    if (c === 'get') return cb(null, JSON.stringify({ id: +id, value: vals[id] }));
    if (c === 'set') { vals[id] = +v; return cb(null, JSON.stringify({ id: +id, value: +v })); } };
  const sf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'br-')), 's.json');
  const b = createBrightness({ bin: '/x', stateFile: sf, platform: 'darwin', exec, exists: () => true });
  const st = await b.check();
  assert.ok(st.ok && st.displays[0].supported && !st.displays[1].supported, 'startup check finds which screens can dim for real');
  await b.dim([1, 2], 0.45); assert.ok(Math.abs(vals[1] - 0.44) < 0.001 && vals[2] === 0.5 && fs.existsSync(sf), 'built-in screen to 55%, the other left for the dark layer');
  await b.restore(); assert.ok(vals[1] === 0.8 && !fs.existsSync(sf), 'brightness comes back');
  await b.dim([1], 0.5);
  const b2 = createBrightness({ bin: '/x', stateFile: sf, platform: 'darwin', exec, exists: () => true }); await b2.check();
  assert.strictEqual(vals[1], 0.8, 'after a crash, the next start puts it back');
  await b2.dim([1], 0.5); vals[1] = 0.95; await b2.restore(); assert.strictEqual(vals[1], 0.95, 'if you changed it yourself meanwhile, yours stays');
  const nb = createBrightness({ bin: '/missing', stateFile: sf, platform: 'darwin', exec, exists: () => false });
  assert.ok(!(await nb.check()).ok, 'no helper → dark layer');
  const swift = read('native/Brightness.swift');
  assert.ok(swift.includes('DisplayServicesSetBrightness') && swift.includes('dlopen') && read('scripts/build-helper.sh').includes('build-brightness.sh') && read('package.json').includes('"apoji-brightness"'));
  const dim = read('src/dimmer.js'); assert.ok(dim.includes('brightness.dim(backlit, level)') && dim.includes('function test('));
  assert.ok(read('main.js').includes("ipcMain.handle('awake:testDim'") && read('renderer/settings.js').includes('id="awTry"'));
  ok('dimming lowers the real backlight where it can (checked on start), dark layer elsewhere, always restored');

  // ---------- Owner crown
  const sql = read('supabase/nexus-v3.4.sql');
  assert.ok(sql.includes('function public.app_owner_ids()') && read('src/cloud.js').includes("this.rpc('app_owner_ids')"));
  assert.ok(read('renderer/settings.js').includes('class="av-crown"') && read('docs/companion/app.js').includes('pic-crown') && read('renderer/study.js').includes('crown-tag'));
  ok('the Owner gets a 👑 on their picture (Mac, N28C) and next to their name in Shared Spaces');

  // ---------- what the phone gets
  const { Companion } = require('../src/companion');
  const comp = new Companion({ cloud: { write: async () => null } });
  await comp.put('status', { agents: [1, 2] }); await comp.put('tts', { id: 'x', mime: 'audio/mp4', b64: 'A'.repeat(4096) });
  const log = comp.sentLog();
  assert.ok(log.length === 2 && log.find(x => x.key === 'tts').preview.includes('KB of audio') && log.find(x => x.key === 'status').bytes > 0);
  assert.ok(read('renderer/settings.js').includes('📤 What your phone gets'));
  ok('Settings → Phone shows exactly what this Mac has sent to N28C');

  // ---------- searchable settings + Wrapped
  const set = read('renderer/settings.js');
  assert.ok(read('renderer/index.html').includes('id="setSearch"') && set.includes('function searchSettings(q)') && set.includes("['phone', 'Screen dimming'"));
  const W = require('../src/wrapped'), now = Date.now();
  const w = W.build({ list: [{ id: 'a', title: 'T', messages: [{ role: 'user', content: 'what is this?', ts: now - 9e6 }, { role: 'assistant', persona: 'lyte', content: 'one two three', ts: now - 9e6 + 1 }, { role: 'user', content: 'and that?', ts: now - 8e6 }, { role: 'user', content: 'ok', ts: now - 7e6 }] }], personas: [{ id: 'lyte', name: 'Lyte', color: '#fff' }] });
  assert.ok(w.bigDay && w.questions === 2 && w.aiWords === 3 && w.agentShare[0].pct === 100 && w.activeDays >= 1);
  assert.ok(read('renderer/hud.js').includes("cls: 'poster'") && read('renderer/hud.js').includes('data-count'));
  ok('settings search (⌘F); Wrapped: more slides, count-up numbers, charts, orbs and a poster');

  // ---------- Test Run
  const kit = require('../scripts/build-try').build();
  assert.strictEqual(read('docs/try/nexuskit.js'), kit['nexuskit.js'], 'docs/try is up to date (npm run sync:try)');
  global.window = {}; eval(kit['nexuskit.js']); const K = global.window.NexusKit;
  assert.ok(K.kit.plan(['Seek']).web && K.features.featurePrompt(['Magyk']).includes('Magyk'));
  const tj = read('docs/try/try.js'), fn = read('supabase/functions/try-chat/index.ts');
  assert.ok(!/sk-or-v1-[0-9a-f]{20,}/.test(tj + fn + read('docs/try/index.html')), 'no key in the web page');
  assert.ok(fn.includes("from('app_content').select('content').eq('key', 'openrouter_api_key')") && fn.includes("rpc('try_take'") && fn.includes('isFree('), 'the free key stays on the server, free models only, limits checked there');
  assert.ok(['flash', 'lyte', 'neodela'].every(a => tj.includes(`${a}: { id: '${a}'`)) && !/paragon|axiom/i.test(tj.slice(tj.indexOf('const AGENTS'), tj.indexOf('const UNIVERSAL'))));
  assert.ok(tj.includes('const TOUR = [') && (tj.match(/\{ (el: '[^']+', )?t: '/g) || []).length >= 10, 'a full tutorial');
  assert.ok(['openai', 'anthropic', 'gemini', 'openrouter', 'deepseek'].every(p => tj.includes(`${p}: { label:`)) && tj.includes("'anthropic-dangerous-direct-browser-access': 'true'"));
  assert.ok(sql.includes('create table if not exists public.try_chats') && sql.includes('function public.try_take(') && sql.includes("revoke all on function public.try_take(uuid, text, text) from public, anon, authenticated"));
  assert.ok(read('docs/index.html').includes('href="try/"') && read('README.md').includes('/Nexus-28/try/'));
  ok('Test Run: Flash/Lyte/Neodela with the Mac app’s @features, web search, own keys, saved chats, tutorial; no key in the page');

  const ch = JSON.parse(read('docs/whats-new/changes.json'));
  assert.ok(ch[0].version === JSON.parse(read('package.json')).version && !/axiom|apex|cage/i.test(JSON.stringify(ch[0])));
  ok('release notes (no Axiom)');
  console.log(`v3.4: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
