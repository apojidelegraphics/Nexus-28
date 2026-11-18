// v3.7 tests: web search that works (Bing first, Chromium's network on desktop), one web search switch, chat sync
// between your computers, Move to another computer with your keys, N28C with a Mac and a PC, the 3.7 beta features
// (Second Look, Branch, Incognito, clipboard chips, key spend) and the beta dashboard events.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nx37-'));

(async () => {
  // ---------- web search
  const web = require('../src/web');
  const bing = `<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&&p=x&u=a1${Buffer.from('https://example.com/a?b=1').toString('base64url')}&ntb=1">Example &amp; A</a></h2><div class="b_caption"><p class="b_lineclamp2">Jan 1, 2026 · The snippet</p></div></li>`
    + '<li class="b_algo"><h2><a href="https://direct.example.org/">Direct</a></h2></li>';
  const hits = web.parseBing(bing);
  assert.deepStrictEqual(hits.map(h => h.url), ['https://example.com/a?b=1', 'https://direct.example.org/']);
  assert.strictEqual(hits[0].title, 'Example & A'); assert.strictEqual(hits[0].snippet, 'The snippet');
  ok('Bing results parsed (its click-tracking links decoded)');
  const calls = [];
  web.setFetch(async u => { calls.push(String(u)); if (/duckduckgo/.test(u)) throw new Error('reset'); if (/bing/.test(u)) return { ok: true, status: 200, text: async () => bing, headers: new Map() }; throw new Error('x'); });
  const r = await web.searchFree({ query: 'nexus', max: 5 }).catch(e => ({ err: e.message }));
  web.setFetch(globalThis.fetch);
  assert.ok(r.results?.length === 2 && calls.some(u => /bing/.test(u)), JSON.stringify(r).slice(0, 200));
  assert.ok(read('main.js').includes('web.setFetch((u, o) => net.fetch(u, o))'));
  ok('when DuckDuckGo refuses, Nexus moves on to Bing (and the desktop app searches through Chromium’s network)');
  const tc = read('supabase/functions/try-chat/index.ts');
  assert.ok(tc.indexOf('www.bing.com/search') < tc.indexOf('html.duckduckgo.com') && tc.includes("['websearch', 'search']"));
  ok('Test Run’s server searches Bing first, and obeys the web search switch');

  // ---------- one web search switch
  const maint = require('../src/maintenance');
  assert.ok(maint.webDown([{ scope: 'Web Search' }]) && maint.webDown([{ scope: 'web-search' }]) && !maint.webDown([{ scope: 'web' }]));
  assert.ok(!maint.webDown([{ scope: 'websearch' }], { admin: true }) && maint.webDown([{ scope: 'websearch', adminBypass: false }], { admin: true }));
  const main = read('main.js');
  assert.ok(main.includes("const webOff = maint.webDown(cloud.maintenance") && main.includes("featDown.add('seek')"));
  const tj = read('docs/try/try.js');
  assert.ok(tj.includes("const webDown = () => S.maint.find(m => ['websearch', 'search']") && tj.includes('Web search is switched off right now'));
  ok('web search switch: Apoji Admin → Maintenance → 🔎 Web search turns it off on desktop, Test Run and N28C (answers still work)');

  // ---------- Test Run: chips, unlimited admins, beta features
  assert.ok(tj.includes('🔍 Searched') && tj.includes('📄 Read') && tj.includes("t.state === 'fail'") && read('docs/try/try.css').includes('.trail .tc.fail'));
  assert.ok(tj.includes("$('usageBox').hidden = !!u?.unlimited") && tj.includes("u?.unlimited ? ''"));
  assert.ok(read('supabase/nexus-v3.7.sql').includes("r.level in ('high-admin', 'admin') or r.high_tier = 'owner'"));
  assert.ok(['function branchAt', 'incognito: true', 'async function secondLook', 'function spendCard', 'function betaFeedback'].every(s => tj.includes(s)));
  assert.ok(tj.includes('if (!S.chat.incognito) save()') && tj.includes('c.incognito) return;'));
  ok('Test Run: chips for what was searched and read, no limits box for the Owner and admins, Second Look, Branch, Incognito, key spend, beta feedback');

  // ---------- Move to another computer: keys + connectors
  const transfer = require('../src/transfer');
  const a = tmp(), b = tmp();
  fs.writeFileSync(path.join(a, 'conversations.json'), JSON.stringify({ list: [{ id: 'c1', updated: 1, messages: [] }] }));
  const buf = transfer.pack({ dir: a, settings: { connectors: [{ id: 'gh', name: 'GitHub' }] }, keys: { openai: 'sk-test-1', 'secret:gh': 'tok' }, passcode: 'correct horse' });
  const bundle = transfer.unpack(buf);
  assert.ok(bundle.secrets && !JSON.stringify(bundle).includes('sk-test-1'));
  assert.throws(() => transfer.pack({ dir: a, keys: { openai: 'x' }, passcode: '123' }), /6 characters/);
  const got = {};
  assert.throws(() => transfer.apply({ dir: b, bundle, passcode: 'wrong', setKey: (k, v) => { got[k] = v; } }), /passcode/);
  const res = transfer.apply({ dir: b, bundle, passcode: 'correct horse', setKey: (k, v) => { got[k] = v; }, currentSettings: {} });
  assert.deepStrictEqual(got, { openai: 'sk-test-1', 'secret:gh': 'tok' }); assert.strictEqual(res.counts.keys, 2);
  assert.deepStrictEqual(res.settings.connectors, [{ id: 'gh', name: 'GitHub' }]);
  const skip = transfer.apply({ dir: tmp(), bundle, currentSettings: {} }); assert.strictEqual(skip.counts.keys, 0);
  assert.ok(main.includes('needPasscode: true') && read('renderer/settings.js').includes('function askPasscode') && read('renderer/index.html').includes('id="trKeys"'));
  ok('Move to another computer brings API keys and connector passwords, locked with your passcode (connectors come with settings)');

  // ---------- chat sync between computers
  const { createChatSync } = require('../src/chatsync');
  let settings = { chatSync: { enabled: true } }; const db = []; let local = { list: [{ id: 'm1', title: 'Mac chat', updated: 100, messages: [{ role: 'user', content: 'hi' }] }, { id: 'inc-1', incognito: true, updated: 200, messages: [] }], activeId: 'm1' };
  const cloud = { session: {}, write: async (m, p, rows) => { for (const r of rows) { const i = db.findIndex(x => x.id === r.id); if (i >= 0) db[i] = r; else db.push(r); } }, rest: async () => db.filter(r => r.device !== 'pc') };
  const convos = { load: () => local, save: () => {} };
  const mac = createChatSync({ cloud, convos, getSettings: () => settings, setSettings: p => { settings = { ...settings, ...p }; }, device: 'mac' });
  assert.strictEqual(await mac.push(), 1); assert.ok(db.length === 1 && db[0].id === 'm1', 'incognito chats never sync');
  local = { list: [], activeId: null }; settings = { chatSync: { enabled: true } };
  const pc = createChatSync({ cloud, convos, getSettings: () => settings, setSettings: p => { settings = { ...settings, ...p }; }, device: 'pc' });
  assert.strictEqual(await pc.pull(), 1); assert.strictEqual(local.list[0].title, 'Mac chat');
  ok('chat sync: your chats show up on your other computer (incognito chats stay put)');

  // ---------- N28C with a Mac and a PC
  const { Relay, STALE } = require('../src/relay');
  const mk = (id, rows, claimed) => new Relay({ cloud: { session: {}, authedGet: async p => /kind=eq.status/.test(p) ? [{ meta: { device: { id: 'pc' } }, created_at: new Date(1e6 - 10e3).toISOString() }] : rows.splice(0),
    write: async (m, p, body) => { if (m === 'PATCH') { const rid = p.match(/id=eq\.(\w+)/)[1]; if (claimed.has(rid)) return []; claimed.add(rid); return [{ id: rid }]; } if (m === 'POST') answers.push([id, body]); return null; } },
    enabled: () => true, beat: 1e12, now: () => 1e6, device: () => ({ id, name: id, platform: id === 'pc' ? 'windows' : 'mac' }), handle: async () => ({ ok: true, text: 'from ' + id }) });
  let answers = [];
  const claimed = new Set(), ask = (rid, meta = {}) => ({ id: rid, kind: 'ask', agent: 'flash', content: 'q', meta, created_at: new Date(1e6 - 1000).toISOString() });
  const macR = mk('mac', [ask('a1'), ask('a2', { device: 'pc' })], claimed); macR.lastBeat = 1e6;
  const pcR = mk('pc', [ask('a1'), ask('a2', { device: 'pc' })], claimed); pcR.lastBeat = 1e6;
  await macR.poll(); await pcR.poll();
  assert.deepStrictEqual(answers.map(([who, b]) => who + ':' + b.reply_to), ['mac:a1', 'pc:a2'], 'an Auto ask is answered once; an ask for the PC goes to the PC');
  assert.strictEqual(answers[0][1].meta.device.platform, 'mac');
  answers = [];
  const late = mk('mac', [{ ...ask('a3', { device: 'pc' }), created_at: new Date(1e6 - STALE - 1000).toISOString() }], new Set()); late.lastBeat = 1e6;
  await late.poll(); assert.deepStrictEqual(answers.map(([w]) => w), ['mac'], 'if the PC never picks it up, the Mac steps in');
  const app = read('docs/companion/app.js');
  assert.ok(app.includes('function targetMeta') && app.includes('Which computer answers?') && app.includes("store.get('target', 'auto')") && app.includes('whichComputer() !== \'PC\''));
  ok('N28C works with a Mac and a PC: Auto uses whichever is on, or pick one; never answered twice');

  // ---------- beta features
  const { Conversations } = require('../src/conversations');
  const cv = new Conversations(tmp());
  const c1 = cv.active(); cv.append({ role: 'user', content: 'one', ts: 1 }); cv.append({ role: 'assistant', content: 'two', ts: 2 }); cv.append({ role: 'user', content: 'three', ts: 3 });
  const br = cv.branch(c1.id, 2);
  assert.ok(br && br.messages.length === 2 && br.title.startsWith('↳') && br.branchOf.id === c1.id);
  const inc = cv.create({ incognito: true }); cv.append({ role: 'user', content: 'secret', ts: 4 });
  assert.ok(inc.incognito && !cv.summary().list.some(x => x.id === inc.id));
  cv.save(); assert.ok(!fs.readFileSync(cv.file, 'utf8').includes('secret'));
  cv.select(c1.id); assert.ok(!cv.get(inc.id), 'leaving an incognito chat deletes it');
  ok('Branch a chat copies it up to that answer; Incognito chats are never saved and vanish when you leave');
  const { classify } = require('../src/clipkind');
  assert.strictEqual(classify('https://example.com/page').kind, 'url');
  assert.strictEqual(classify('TypeError: x is undefined\n    at foo (a.js:1:2)').kind, 'error');
  assert.strictEqual(classify('1600 Pennsylvania Ave NW, Washington').kind, 'address');
  assert.strictEqual(classify('Dinner on Friday at 7pm').kind, 'date');
  assert.strictEqual(classify('¿Dónde está la biblioteca? Es que no la encuentro').kind, 'foreign');
  assert.strictEqual(classify('hi'), null);
  ok('smart clipboard chips: links, errors, addresses, dates, other languages');
  const { createSpend, estimate } = require('../src/spend');
  assert.ok(Math.abs(estimate({ model: 'gpt-4o-mini', inChars: 4e6, outChars: 4e6 }) - 0.75) < 1e-9);
  const f = path.join(tmp(), 'spend.json'), sp = createSpend({ file: f });
  sp.record({ provider: 'openai', model: 'gpt-5', inChars: 4000, outChars: 4000 }); sp.record({ provider: 'ollama', model: 'llama3', inChars: 1e9, outChars: 1e9 });
  const sum = sp.summary(); assert.ok(sum.today > 0 && !sum.byProvider.ollama && sum.byProvider.openai === sum.month);
  ok('key spend tracker: estimates what your own keys cost (local models are free)');
  assert.ok(main.includes("ipcMain.handle('beta:thumb'") && main.includes("betaEvent('second_look')") && read('renderer/hud.js').includes('👍 Works well'));
  const sql = read('supabase/nexus-v3.7.sql');
  assert.ok(sql.includes('create table if not exists public.beta_events') && sql.includes('function public.admin_beta_stats()') && sql.includes('create table if not exists public.desktop_chats'));
  ok('one-tap beta feedback (⋯ menu) and the per-feature Beta dashboard in Apoji Admin');

  // ---------- Mac & PC everywhere
  const home = read('docs/index.html');
  assert.ok(home.includes('FOR MAC &amp; WINDOWS') && home.includes('data-for="win"') && home.includes('Ctrl+Shift+N') && home.includes('Can I use it on a Mac and a PC?'));
  assert.ok(read('docs/try/index.html').includes('Mac or PC') && !read('docs/try/try.js').includes('people without a Mac'));
  ok('the Home page, Test Run and N28C talk about Mac and PC, each where it fits');

  // ---------- release
  const pkg = require('../package.json'), ch = JSON.parse(read('docs/whats-new/changes.json'));
  assert.strictEqual(pkg.version, '3.7.0'); assert.strictEqual(ch[0].version, '3.7.0');
  assert.ok(!/axiom|apex|cage/i.test(JSON.stringify(ch[0])));
  ok('release notes (no Axiom)');
  console.log(`v3.7: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
