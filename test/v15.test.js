// v1.5 tests: what every @feature does (featurekit plan, pre-passes, AuraSync, ClarityLens, CommandGrid, handoff parsing
// and the streaming gate), custom @features, Knowledge lookups, Huddle + Debate, widget JSON parsing/building, themes.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const vm = require('vm');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };

(async () => {
  const fk = require('../src/featurekit');
  const features = require('../src/features');

  // ---- every built-in feature has a real effect
  for (const f of features.CATALOG) assert.ok(fk.KIT[f.id], `@${f.id} does something`);
  const all = fk.plan(features.CATALOG.map(f => f.id), { agentic: true });
  assert.ok(all.web && all.chats && all.knowledge && all.history && all.grid && all.aura && all.swift && all.clarity && all.speak && all.brief && all.monolog && all.code);
  assert.deepStrictEqual(all.pre, ['plan', 'threads'], 'one thinking pass max (threads wins), plus the plan');
  assert.ok(!all.blocks.includes('next') && all.blocks.includes('next2'), 'Proactix 2.0 replaces Proactix');
  assert.deepStrictEqual(fk.plan(['CommandCore'], { agentic: false }).pre, [], 'no plan without tools');
  assert.deepStrictEqual(fk.plan(['Cognition']).pre, ['cognition']);
  assert.deepStrictEqual(fk.plan(['StudyMode', 'Magyk']).blocks, ['quiz', 'flashcards']);
  assert.ok(fk.blockPrompt(['quiz']).includes('nexus-quiz') && fk.blockPrompt([]) === '');
  ok('every built-in @feature maps to tools, a pre-pass, local work, a widget or UI');

  // ---- pre-passes with a fake model
  const calls = [];
  const complete = async ({ system }) => { calls.push(system); if (/JSON array/.test(system)) return 'Sure: ["Search the web","Read 2 pages","Summarize"]'; return 'angle: ' + system.slice(0, 20); };
  const msgs = [{ role: 'user', content: 'Should I learn Rust or Go?' }];
  const cog = await fk.runPre('cognition', { complete, messages: msgs });
  assert.ok(cog.reasoning && cog.note.includes('REASONING NOTES'));
  const th = await fk.runPre('threads', { complete, messages: msgs });
  assert.strictEqual(th.threads.length, 3); assert.deepStrictEqual(th.threads.map(t => t.label), fk.THREADS.map(t => t[0]));
  const mv = await fk.runPre('multiverseImmersive', { complete, messages: msgs });
  assert.strictEqual(mv.threadKind, 'scenarios'); assert.ok(calls.at(-1).includes('immersive'));
  const pl = await fk.runPre('plan', { complete, messages: msgs });
  assert.deepStrictEqual(pl.plan, ['Search the web', 'Read 2 pages', 'Summarize']);
  const bad = await fk.runPre('threads', { complete: async ({ system }) => { if (/practical/i.test(system)) throw new Error('rate limited'); return 'x'; }, messages: msgs });
  assert.ok(/failed: rate limited/.test(bad.threads[1].text), 'one failed thread does not sink the others');
  ok('pre-passes: Cognition reasons, QuantumThread/MultiVerse run 3 in parallel, CommandCore plans');

  // ---- AuraSync, ClarityLens, CommandGrid
  assert.deepStrictEqual((({ tone, wants }) => ({ tone, wants }))(fk.aura('ugh this STILL doesnt work, my essay is due tonight!!')), { tone: 'in a hurry, frustrated', wants: 'a quick, direct answer' });
  assert.strictEqual(fk.aura('can you explain like im 5 what photosynthesis is').wants, 'a simple explanation');
  assert.strictEqual(fk.aura('ok').tone, 'calm');
  const easy = fk.readingGrade('The cat sat on the mat. It was a big cat. The cat was red and fat. It ran to the dog.');
  const hard = fk.readingGrade('Notwithstanding considerable methodological heterogeneity, contemporaneous epidemiological investigations substantiate the hypothesized relationship between socioeconomic deprivation and cardiovascular morbidity, particularly among institutionalized populations experiencing longitudinal adversity.');
  assert.ok(easy.grade < 5 && hard.grade > 14, `grades ${easy.grade} / ${hard.grade}`);
  assert.strictEqual(fk.readingGrade('too short').grade, 0);
  const rows = fk.gridRows({ toolsLabels: ['web_search', 'notes__list'], connectors: [{ name: 'Notes', status: 'connected', tools: 3 }, { name: 'Drive', status: 'error', error: 'auth expired' }], helperCaps: { built: true, version: 6, stt: true, ax: true },
    watches: [{ status: 'watching', title: 'Canvas', condition: 'tell me when graded' }], mission: null, routines: [{ name: 'Brief', enabled: true }], access: { flash: { mode: 'free', limit: 10, used: 10 } } });
  assert.deepStrictEqual(rows.map(r => r.status), ['ready', 'ready', 'issue', 'ready', 'active', 'idle', 'active', 'issue']);
  assert.ok(rows[0].detail === 'web_search', 'connector tools are not listed as built-in');
  assert.ok(fk.gridNote(rows).includes('| Connector · Drive | issue | auth expired |'));
  ok('AuraSync reads tone locally, ClarityLens measures reading level, CommandGrid builds a live status grid');

  // ---- handoff
  assert.deepStrictEqual(fk.parseHandoff('[[HANDOFF:neodela: needs deep reasoning]]'), { to: 'neodela', reason: 'needs deep reasoning' });
  assert.deepStrictEqual(fk.parseHandoff('  [[ handoff : Paragon ]]'), { to: 'paragon', reason: '' });
  assert.strictEqual(fk.parseHandoff('Sure! [[HANDOFF:neodela]]'), null, 'only at the very start');
  assert.ok(fk.handoffNote(['neodela', 'paragon']).includes('[[HANDOFF:neodela'));
  assert.strictEqual(fk.handoffNote([]), '');
  const out = []; const g = fk.handoffGate(t => out.push(t));
  g.push('Hel'); g.push('lo there'); assert.deepStrictEqual(out, ['Hel', 'lo there'], 'normal replies stream right away');
  const out2 = []; const g2 = fk.handoffGate(t => out2.push(t));
  g2.push('[[HAND'); g2.push('OFF:neodela: hard]]'); assert.deepStrictEqual(out2, [], 'a handoff marker is never shown');
  const out3 = []; const g3 = fk.handoffGate(t => out3.push(t));
  g3.push('[[1]] is a '); g3.push('footnote'); assert.deepStrictEqual(out3.join(''), '[[1]] is a footnote');
  const out4 = []; const g4 = fk.handoffGate(t => out4.push(t)); g4.push('[['); g4.flush(); assert.deepStrictEqual(out4, ['[[']);
  ok('handoff: marker parsed only at the start, hidden while streaming, normal text never delayed');

  // ---- custom @features
  const custom = features.setCustom([
    { id: 'Hai ku!', desc: 'Poems', instruction: 'Answer as a haiku.', agents: ['flash'] },
    { id: 'Seek', instruction: 'clash with a built-in' }, { id: 'huddle', instruction: 'reserved' }, { id: 'Empty', instruction: '' },
    { id: 'Recap', instruction: 'Recap my week.', chats: true, output: 'steps', agents: ['all'] }, { id: 'Weird', instruction: 'x', output: 'nope' }
  ]);
  assert.deepStrictEqual(custom.map(c => c.id), ['Haiku', 'Recap', 'Weird']);
  assert.strictEqual(custom[2].output, '');
  assert.deepStrictEqual(features.customFor('flash'), ['Haiku', 'Recap', 'Weird']);
  assert.deepStrictEqual(features.customFor('lyte'), ['Recap', 'Weird']);
  assert.strictEqual(features.lookup('recap').id, 'Recap');
  const kp = fk.plan(['Recap', 'Haiku'], { custom: features.customMap() });
  assert.ok(kp.chats && kp.blocks.includes('steps') && !kp.web);
  assert.ok(features.featurePrompt(['Haiku']).includes('Answer as a haiku.'));
  const pub = features.publicCatalog();
  assert.ok(pub.find(f => f.id === 'Seek').does && pub.find(f => f.id === 'Recap').custom);
  features.setCustom([]);
  ok('custom @features: cleaned, no clashes, per-agent, can search and render widgets');

  // ---- Knowledge lookup (mock Wikipedia + dictionary)
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.startsWith('/w/rest.php/v1/search/title')) return res.end(JSON.stringify({ pages: [{ key: 'Mitochondrion' }, { key: 'Mitochondria_(disambiguation)' }] }));
    if (req.url === '/api/rest_v1/page/summary/Mitochondrion') return res.end(JSON.stringify({ type: 'standard', title: 'Mitochondrion', description: 'Organelle', extract: 'A mitochondrion is an organelle…', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Mitochondrion' } }, thumbnail: { source: 'https://x/t.png' } }));
    if (req.url.startsWith('/api/rest_v1/page/summary/')) return res.end(JSON.stringify({ type: 'disambiguation', title: 'x' }));
    if (req.url.startsWith('/api/v2/entries/en/mitochondria')) return res.end(JSON.stringify([{ word: 'mitochondria', phonetic: '/ˌmaɪ.təˈkɒn.dri.ə/', meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'plural of mitochondrion' }] }] }]));
    res.end('[]');
  }).listen(0);
  await new Promise(r => srv.on('listening', r));
  process.env.NEXUS_WIKI_BASE = process.env.NEXUS_DICT_BASE = `http://127.0.0.1:${srv.address().port}`;
  const tools = require('../src/tools');
  const kr = await tools.execute('knowledge_lookup', { query: 'mitochondria' }, {});
  assert.ok(kr.content.includes('A mitochondrion is an organelle') && kr.content.includes('plural of mitochondrion'));
  assert.strictEqual(kr.activity.cards[0].type, 'reference'); assert.strictEqual(kr.activity.cards[0].title, 'Mitochondrion');
  assert.strictEqual(kr.activity.sources.length, 1, 'disambiguation pages skipped');
  assert.deepStrictEqual(tools.describe('knowledge_lookup', { query: 'x' }), { label: 'Looking it up', detail: 'x' });
  assert.ok(!tools.needsConfirm('knowledge_lookup'));
  srv.close();
  ok('Knowledge: encyclopedia + dictionary lookup with a reference card (read-only)');

  // ---- Huddle + Debate
  const { Conversations } = require('../src/conversations');
  const { createGroup } = require('../src/groupchat');
  const convos = new Conversations(fs.mkdtempSync(path.join(os.tmpdir(), 'nx15-')));
  const asked = [];
  const ask = async ({ personaId, history, systemExtra }) => {
    asked.push({ personaId, systemExtra, last: history.at(-1)?.content });
    if (personaId === 'broken') return { ok: false, error: 'No key' };
    await new Promise(r => setTimeout(r, personaId === 'lyte' ? 30 : 5));
    if (/JUDGE/.test(systemExtra)) return { ok: true, text: 'Both did well.\nVerdict: AGAINST', model: 'm' };
    return { ok: true, text: `${personaId} says hi`, model: 'm' };
  };
  const events = [];
  const group = createGroup({ ask, convos, nameOf: id => id[0].toUpperCase() + id.slice(1), onProgress: e => events.push(e) });
  const c = convos.appendTo('new', { role: 'user', content: 'Best laptop for school?' });
  const h = await group.huddle({ convId: c.id, agents: ['neodela', 'lyte', 'broken'], synth: 'neodela' });
  const hm = convos.get(c.id).messages;
  assert.deepStrictEqual(hm.map(m => `${m.role}:${m.persona || ''}:${m.huddle?.role || ''}${m.error ? ':err' : ''}`), ['user::', 'assistant:neodela:take', 'assistant:lyte:take', 'assistant:broken:take:err', 'assistant:neodela:summary']);
  assert.ok(asked[0].systemExtra.includes('Lyte, Broken'), 'each agent knows who else is in the huddle');
  assert.ok(asked.at(-1).last.includes('## Neodela') && asked.at(-1).last.includes('## Lyte'), 'the summary sees every good take');
  assert.ok(h.ok && events.some(e => e.agent === 'lyte' && e.status === 'done'));
  await assert.rejects(group.huddle({ convId: c.id, agents: ['flash'] }), /at least two/);
  asked.length = 0;
  const d = await group.debate({ convId: null, topic: '"Homework should be banned"', pro: 'flash', con: 'lyte', judge: 'neodela', rounds: 2 });
  const dm = convos.get(d.convId).messages;
  assert.strictEqual(dm[0].content, '⚖ Debate: Homework should be banned');
  assert.deepStrictEqual(dm.slice(1).map(m => `${m.persona}:${m.debate.side}:${m.debate.round || ''}`), ['flash:pro:1', 'lyte:con:1', 'flash:pro:2', 'lyte:con:2', 'neodela:judge:']);
  assert.strictEqual(dm.at(-1).debate.winner, 'con');
  assert.ok(asked[2].last.includes('FOR (Flash), round 1: flash says hi'), 'later rounds see the transcript');
  assert.ok(/closing/.test(asked[3].systemExtra));
  await assert.rejects(group.debate({ topic: 'abc', pro: 'a', con: 'b' }), /What should/);
  await assert.rejects(group.debate({ topic: 'cats vs dogs', pro: 'a', con: 'a' }), /two different/);
  // stop mid-debate
  const slow = createGroup({ ask: async (o) => { await new Promise(r => setTimeout(r, 40)); return { ok: true, text: 'x' }; }, convos });
  const p = slow.debate({ topic: 'Pineapple on pizza', pro: 'a', con: 'b', rounds: 3 });
  await new Promise(r => setTimeout(r, 60)); slow.stopAll();
  const sd = await p;
  assert.ok(convos.get(sd.convId).messages.length < 7, 'stopping ends the debate early');
  ok('Huddle: parallel takes + summary (errors shown, not fatal); Debate: rounds, transcript, closing, verdict, stop');

  // ---- widgets: JSON repair + builders (no DOM needed for parse/chart)
  const ctx = { window: {}, document: { createElement: () => ({}) }, navigator: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/widgets.js'), 'utf8'), ctx);
  const W = ctx.window.NexusWidgets;
  assert.strictEqual(JSON.stringify(W.parseJSON('{"a": [1, 2,], }')), '{"a":[1,2]}');
  assert.strictEqual(JSON.stringify(W.parseJSON('Here you go: {“next”: [“Why?”]}')), '{"next":["Why?"]}');
  assert.strictEqual(W.parseJSON('not json at all'), null);
  const svgBar = W.chart({ type: 'bar', title: 'Sales', labels: ['Q1', 'Q2'], series: [{ name: 'A', data: [3, 5] }, { name: 'B', data: [2, 'x'] }] });
  assert.ok(svgBar.includes('<rect') && svgBar.includes('w-legend') && svgBar.includes('Sales'));
  assert.ok(W.chart({ type: 'pie', labels: ['a', 'b'], series: [{ data: [1, 3] }] }).includes('75%'));
  assert.ok(W.chart({ type: 'line', labels: ['a'], series: [{ data: [1] }] }).includes('polyline'));
  assert.strictEqual(W.chart({ series: [] }), null);
  for (const lang of ['nexus-quiz', 'nexus-flashcards', 'nexus-steps', 'nexus-ideas', 'nexus-chart', 'nexus-risks', 'nexus-logic', 'nexus-insights', 'nexus-palette', 'nexus-next']) assert.ok(W.BUILD[W.LANG[lang]], lang);
  for (const b of Object.keys(fk.BLOCK_SPECS)) { const langs = (fk.BLOCK_SPECS[b].match(/nexus-[a-z]+/g) || []); for (const l of langs) assert.ok(W.LANG[l], `${b} → ${l} has a widget`); }
  ok('widgets: tolerant JSON parsing, SVG bar/line/pie charts, a builder for every block the prompts ask for');

  // ---- themes
  const tctx = { window: {}, document: { documentElement: { dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } } } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../renderer/theme.js'), 'utf8'), tctx);
  const T = tctx.window.NexusTheme, root = tctx.document.documentElement;
  T.apply({ theme: 'custom-abc', customThemes: [{ id: 'custom-abc', name: 'Mine', accent: '#ff0080', bg: '#101020', text: '#ffffff', glass: .9 }] });
  assert.strictEqual(root.dataset.theme, 'custom'); assert.strictEqual(root.style.props['--accent-rgb'], '255, 0, 128'); assert.strictEqual(root.style.props['--bg'], 'rgba(16, 16, 32, 0.9)');
  T.apply({ theme: 'nebula' }); assert.strictEqual(root.dataset.theme, 'nebula'); assert.ok(!root.style.props['--accent']);
  T.apply({ theme: 'nope' }); assert.strictEqual(root.dataset.theme, 'green');
  assert.strictEqual(T.list({ customThemes: [{ id: 'custom-x', name: 'X' }] }).length, 11);
  const css = fs.readFileSync(path.join(__dirname, '../renderer/themes.css'), 'utf8');
  for (const [id] of T.BUILTIN) assert.ok(id === 'green' || css.includes(`[data-theme="${id}"]`), id);
  ok('themes: 6 new built-ins, custom themes applied as CSS variables, unknown → green');

  console.log(`\n${n} v1.5 checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
