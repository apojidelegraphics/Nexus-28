// 4.4.0: Nexus '28 Solis (LuminaRender, StoryLattice, its features), widget frames for every picture frame, no emojis.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = t => { n++; console.log('  ✓ ' + t); };
(async () => {
  // ---------- Solis
  const { PERSONAS } = require('../src/personas');
  const sol = PERSONAS.find(p => p.id === 'solis');
  assert.ok(sol && sol.name === "Nexus '28 Solis" && sol.agentic === true && sol.color === '#F59E0B' && sol.gradient.join() === '#F59E0B,#FDE68A');
  assert.ok(/Aether-Neodela/.test(sol.tag) && /Quouk \.3o-S/.test(sol.lore) && /lumina_render/.test(sol.prompt) && /StoryLattice/.test(sol.prompt));
  for (const f of ['ImagineEngine', 'LuminaCanvas', 'ResonanceCore', 'StoryLattice']) { assert.ok(sol.features.includes(f)); assert.ok(require('../src/featurekit').KIT[f], f); assert.ok(require('../src/features').CATALOG?.some?.(x => x.id === f) ?? R('src/features.js').includes(`id: '${f}'`), f); }
  const access = require('../src/access');
  assert.strictEqual(access.tierOf(sol).id, 'ultra'); assert.strictEqual(access.tierOf(sol).id, access.tierOf({ id: 'paragon' }).id);
  const prov = { needsKey: true, label: 'OpenRouter' };
  const fr = access.decide({ persona: sol, provider: prov, hasOwnKey: false, freeKeyEnabled: true, used: 0 }); assert.strictEqual(fr.mode, 'blocked'); assert.ok(/Solis/.test(fr.reason) && /free Nexus key/.test(fr.reason), 'never on the free key');
  const pr = access.decide({ persona: sol, provider: prov, hasOwnKey: false, freeKeyEnabled: true, used: 0, premium: { paragon: { allowed: true, limit: 50, used: 3 } } }); assert.strictEqual(pr.mode, 'premium'); assert.strictEqual(pr.agent, 'solis');
  assert.strictEqual(access.decide({ persona: sol, provider: prov, hasOwnKey: true }).mode, 'own');
  const pc = R('supabase/functions/premium-chat/index.ts'); assert.ok(pc.includes("solis: 'paragon'") && pc.includes("p_agent: PLAN_OF[agent]"), 'Solis on the Nexus key uses the Paragon plan'); assert.strictEqual(access.usageName(sol), 'Nexus 28 Solis');
  assert.ok(R('src/cloud.js').includes("'Nexus 28 Solis': 'solis'"));
  ok('Solis: name, tagline, lore, gold gradient, its features, Ultra tier like Paragon (Nexus key on Pro/Max, never the free key), agentic, prompt synced from Supabase');

  // ---------- LuminaRender
  const L = require('../src/lumina');
  const b = L.body({ prompt: 'A lighthouse at dawn, watercolor', model: 'nope', aspect_ratio: '3:7', resolution: '4k', input_references: ['https://x.example/a.png', 'javascript:alert(1)', 'data:image/png;base64,' + 'A'.repeat(30)] });
  assert.strictEqual(b.model, L.DEFAULT_MODEL); assert.strictEqual(b.aspect_ratio, '16:9'); assert.strictEqual(b.resolution, '4K'); assert.strictEqual(b.input_references.length, 2); assert.strictEqual(b.response_format, 'b64_json');
  await assert.rejects(L.render({ prompt: 'x y z' }, { key: '' }), /own OpenRouter key/);
  const calls = [];
  const fake = async (u, o) => { calls.push(JSON.parse(o.body)); const first = calls.length === 1; return { ok: !first, status: first ? 404 : 200, json: async () => first ? { error: { message: 'model not found' } } : { data: [{ b64_json: 'iVBORw0KGgo=', media_type: 'image/png' }], usage: { cost: 0.04 } } }; };
  const r = await L.render({ prompt: 'A dragon made of stained glass', model: 'black-forest-labs/flux.2-pro', aspect_ratio: '21:9' }, { key: 'sk-or-test', fetch: fake });
  assert.ok(r.fellBack && r.model === L.DEFAULT_MODEL && r.cost === 0.04 && r.b64 && calls[0].model === 'black-forest-labs/flux.2-pro' && calls[0].aspect_ratio === '21:9');
  const tools = require('../src/tools');
  assert.ok(tools.DEFS.lumina_render?.lumina && !tools.buildToolset({ agentic: true, settings: {}, platform: 'linux' }).labels.includes('lumina_render'), 'never offered by default');
  const ex = await tools.execute('lumina_render', { prompt: 'a b c' }, { settings: {}, lumina: { render: async () => ({ model: 'm', aspect_ratio: '1:1', resolution: '2K', card: { type: 'lumina', att: 'aabc12' } }) } });
  assert.ok(ex.activity.cards[0].type === 'lumina' && !/base64/.test(ex.content));
  assert.ok((await tools.execute('lumina_render', { prompt: 'x' }, { settings: {} })).error);
  const main = R('main.js');
  assert.ok(main.includes("persona.id === 'solis' && !noTools && !prov.noTools && !toolset.labels.includes('lumina_render')") && main.includes("store.getKey('openrouter') || process.env.OPENROUTER_API_KEY") && main.includes("ipcMain.handle('lumina:save'"));
  const cv = R('renderer/chatview.js'); assert.ok(cv.includes("c.type === 'lumina'") && cv.includes('data-lm="save"') && cv.includes('data-lm="info"'));
  ok('LuminaRender: Solis only, safe request, falls back to the default model, needs your own OpenRouter key, picture card with Download and details');

  // ---------- StoryLattice
  const LT = require('../src/lattice');
  const ext = LT.extract('Here is the world.\n\n```nexus-lattice\n{"title":"Emberfall","palette":["#f59e0b","red"],"characters":[{"name":"Ivy","note":"a fox courier"}],"rules":["No magic after dusk"],}\n```');
  assert.strictEqual(ext.text, 'Here is the world.'); assert.strictEqual(ext.patches.length, 1);
  let l = LT.merge({}, ext.patches[0]); assert.ok(l.title === 'Emberfall' && l.palette.join() === '#F59E0B' && l.characters[0].name === 'Ivy');
  l = LT.merge(l, { characters: [{ name: 'ivy', note: 'now the mayor' }, { name: 'Bram' }], remove: [] }); assert.ok(l.characters.length === 2 && l.characters[0].note === 'now the mayor');
  l = LT.merge(l, { frame: { att: 'aframe1', prompt: 'p', model: 'm', thumb: 'javascript:x' } }); assert.ok(l.frames.length === 1 && l.frames[0].thumb === '');
  assert.ok(/STORYLATTICE/.test(LT.prompt(l)) && /Emberfall/.test(LT.prompt(l)) && LT.empty({}) && !LT.empty(l));
  assert.ok(main.includes("if (persona.id === 'solis' && text) text = latticeApply(") && main.includes('latticeMod.prompt(') && R('renderer/chatview.css').includes('pre[data-lang="nexus-lattice"] { display: none !important; }'));
  new vm.Script(R('renderer/lattice.js')); assert.ok(R('renderer/index.html').includes('id="lattice"') && R('renderer/index.html').includes('<script src="lattice.js"></script>'));
  ok('StoryLattice: hidden blocks become notes on the chat (merged, cleaned), go back into the prompt, and show in an editable panel');

  // ---------- widget frames
  const cos = require('../renderer/cosmetics');
  const frames = cos.CATALOG.filter(x => x.kind === 'frame' && x.key !== 'mine'), wf = cos.CATALOG.filter(x => x.kind === 'wtheme');
  for (const f of frames) { const w = cos.item('wtheme:' + f.key); assert.ok(w && w.name === f.name && w.price === f.price, f.id); assert.deepStrictEqual(w.months, f.months, f.id); assert.strictEqual(w.event, f.event, f.id); assert.ok(cos.WF[f.key], f.key); }
  assert.ok(cos.item('wtheme:plain').free && cos.OWNER_ONLY.has('wtheme:crown') && cos.SEASONS[12].includes('wtheme:snowglobe') && !cos.item('wtheme:solid'));
  const css = cos.widgetCss(); for (const k of Object.keys(cos.WF)) if (k !== 'plain') assert.ok(css.includes(`body.wt-${k} .dw::after`) || css.includes(`body.wt-${k} .dw::before`) || css.includes(`body.wt-${k} .dw > .dwf::before`), k);
  assert.ok(cos.swatch(cos.item('wtheme:flame')).includes('class="dwf"') && cos.CSS.includes('.nxp-wtw { isolation: isolate;'));
  assert.ok(R('renderer/deskwidgets.js').includes('window.NexusCosmetics.widgetCss()') && main.includes("theme: wthemeOk(d.theme) ? d.theme : 'plain'"));
  assert.ok(!R('renderer/index.html').includes('id="dwThemes"') && !R('renderer/settings.js').includes('paintWThemes'), 'not on the General page anymore');
  const sql = R('supabase/nexus-v4.4.0.sql');
  for (const w of wf.filter(x => !x.free && !x.owner)) assert.ok(sql.includes(`('${w.id}', 'wtheme', '${w.name.replace(/'/g, "''")}', ${w.price}`), w.id);
  assert.ok(sql.includes("'Nexus 28 Solis'") && sql.includes("wf := 'wtheme:' || split_part(e.reward_item, ':', 2)") && /delete from public\.cirkts_owned o using gone/.test(sql));
  ok(`widget frames: one for each of the ${frames.length} picture frames (same price, season and event), drawn from shared recipes; shop only; SQL with refunds`);

  // ---------- no emojis
  const ic = R('renderer/icons.js'); assert.ok(ic.includes('const ANY = /(\\p{Extended_Pictographic}|\\p{Regional_Indicator})') && ic.includes('function stripAttrs(root)') && ic.includes('dropAny('));
  assert.strictEqual(ic, fs.readFileSync(path.join(__dirname, '../docs/companion/icons.js'), 'utf8').split('\n').slice(1).join('\n'));
  for (const f of ['deskwidgets', 'guide']) assert.ok(R(`renderer/${f}.html`).includes('<script src="icons.js"></script>'), f);
  assert.ok(R('src/push.js').includes('noEmoji(msg.title') && R('src/conversations.js').includes("if (kind) title = noEmoji(title)"));
  const C = require('../src/conversations'); assert.ok(C);
  const ch = require('../docs/whats-new/changes.json')[0]; assert.strictEqual(ch.version, '4.4.0'); assert.strictEqual(require('../package.json').version, '4.4.0'); assert.ok(!/axiom/i.test(JSON.stringify(ch)) && !/\p{Extended_Pictographic}/u.test(ch.highlights.join(' ')));
  ok('no emojis: icons where there is one, nothing where there isn\'t (tooltips and menus too), and none in notifications or app-made chat names');
  console.log(`v4.4.0: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
