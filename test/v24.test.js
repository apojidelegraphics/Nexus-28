// v2.4 tests: the Apex tier (Nexus '28 Axiom, BETA) — Supabase gate, weekly minutes, providers, prompt never in the app —
// Blueprint, Gauntlet, Verdict, Proof mode, the stamp; offline flashcards and study bursts.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- the gate
  const { Apex } = require('../src/apex');
  let reply = null; const logs = [];
  const cloud = { session: { user: { id: 'me' } }, rpc: async (fn, a) => { if (fn === 'apex_log') { logs.push(a); return { success: true, ...reply, left: reply.left - a.p_seconds / 60 }; } return reply; } };
  const ax = new Apex({ cloud });
  reply = { allowed: false, reason: 'not_yet' };
  assert.strictEqual(await ax.session(true) && ax.visible(), false, 'hidden from accounts that are not allowed');
  assert.match((await ax.check('anthropic')).error, /isn't available to your account/);
  reply = { allowed: true, unlimited: false, limit: 90, used: 10, left: 80, prompt: 'SECRET', providers: null, resets_at: new Date(Date.now() + 3 * 864e5).toISOString() };
  const c1 = await ax.check('ollama'); assert.ok(c1.ok && c1.session.prompt === 'SECRET', 'admins: any provider');
  assert.strictEqual(ax.meter().left, 80);
  reply = { ...reply, providers: ['anthropic', 'openrouter', 'openai'] };
  assert.match((await ax.check('gemini')).error, /only runs on Claude, OpenRouter, ChatGPT/, 'the public: Claude, OpenRouter, ChatGPT only');
  assert.ok((await ax.check('openai')).ok);
  reply = { ...reply, left: 0, exhausted: true, prompt: null };
  assert.match((await ax.check('openai')).error, /used your 90 Axiom minutes this week\. They reset on \w+day/);
  reply = { allowed: false, reason: 'off' }; assert.match((await ax.check('openai')).error, /switched off/);
  reply = { allowed: true, unlimited: true, limit: null, left: null, prompt: 'SECRET', providers: null };
  assert.ok((await ax.check('lmstudio')).ok && ax.meter().unlimited, 'unlimited owner');
  reply = { allowed: true, unlimited: false, limit: 90, left: 50, prompt: 'SECRET', providers: null };
  await ax.log(5000, { kind: 'phone', provider: 'anthropic', model: 'x' }); assert.deepStrictEqual(logs.at(-1), { p_seconds: 1800, p_kind: 'phone', p_provider: 'anthropic', p_model: 'x' }, 'one turn counts at most 30 minutes');
  ok('gate: hidden unless allowed, weekly minutes, provider lock for the public, off switch, unlimited owner, usage logged');

  // ---------- tier + persona
  const access = require('../src/access'), { PERSONAS, systemPromptFor } = require('../src/personas');
  const axiom = PERSONAS.find(p => p.id === 'axiom');
  assert.ok(axiom && axiom.apex && axiom.beta && axiom.agentic && axiom.prompt === '', 'Axiom ships without its prompt');
  assert.strictEqual(access.tierOf(axiom).id, 'apex');
  const d = access.decide({ persona: axiom, provider: { needsKey: true, label: 'OpenRouter' }, hasOwnKey: false, freeKeyEnabled: true, used: 0 });
  assert.strictEqual(d.mode, 'blocked', 'never on the free Nexus key');
  const sys = systemPromptFor({ ...axiom, prompt: 'P' }, {}); assert.ok(sys.includes('[APEX RULES] Refuse to guess') && sys.includes('Acceptable. Proceed.'));
  assert.ok(!JSON.stringify(PERSONAS).includes('Precision is not optional'), 'no Axiom prompt text in the app');
  ok('Apex tier: own key only, BETA, agentic, refuse-to-guess + stamp rules, no prompt in the code');

  // ---------- features
  const features = require('../src/features'), fk = require('../src/featurekit');
  for (const f of ['Blueprint', 'Gauntlet', 'Verdict', 'ProofMode']) assert.ok(features.APEX.has(f) && axiom.features.includes(f), f);
  assert.deepStrictEqual(fk.plan(['Blueprint', 'CommandCore', 'Cognition'], { agentic: true }).pre, ['blueprint', 'cognition'], 'Blueprint replaces the CommandCore plan');
  const k = fk.plan(['Gauntlet', 'Verdict', 'ProofMode']); assert.ok(k.blocks.includes('gauntlet') && k.blocks.includes('verdict') && k.proof);
  const bp = await fk.runPre('blueprint', { complete: async () => '```json\n{"objective":"Ship it","steps":[{"step":"Search","tool":"web_search","risk":"stale","fallback":"read docs"},{"step":"Write"}],"estimate":"5 min","risks":["rate limits"]}\n```', messages: [{ role: 'user', content: 'go' }] });
  assert.strictEqual(bp.blueprint.steps.length, 2); assert.ok(bp.note.includes('fallback: read docs'));
  const pr = await fk.proofPass('Paris is the capital of Germany. It has 2 million people.', { messages: [{ role: 'user', content: 'q' }],
    complete: async () => JSON.stringify({ claims: [{ claim: 'Paris is the capital of Germany', confidence: 2 }, { claim: 'Paris has ~2M people', confidence: 85, source: 'https://insee.fr' }], problems: ['Paris is the capital of France, not Germany'], corrected: 'Paris is the capital of France. It has about 2 million people.' }) });
  assert.strictEqual(pr.text, 'Paris is the capital of France. It has about 2 million people.'); assert.strictEqual(pr.fixed.length, 1); assert.strictEqual(pr.claims[1].source, 'https://insee.fr');
  const pr2 = await fk.proofPass('fine', { messages: [], complete: async () => 'not json' }); assert.strictEqual(pr2.text, 'fine', 'a broken check never loses the answer');
  ok('Blueprint (plan + risks + fallbacks), Gauntlet + Verdict widgets, Proof mode fixes its own mistakes');

  // ---------- wiring
  const main = read('main.js'), w = read('renderer/widgets.js'), cv = read('renderer/chatview.js'), hud = read('renderer/hud.js');
  assert.ok(main.includes('PERSONAS.filter(p => !p.apex || apexOn())') && main.includes("await apex.check(decision.mode === 'premium' ? 'openrouter' : binding.provider)") && main.includes("apex.log(sec, { kind: apexKind"));
  assert.ok(main.includes("tool: 'blueprint'") && main.includes('featurekit.proofPass(text') && main.includes('fd.stamp = true'));
  assert.ok(main.includes("feats.filter(f => !features.APEX.has(f))"), 'other agents never get Apex features');
  assert.ok(w.includes('gauntlet(d, st, save, ctx)') && w.includes("'nexus-verdict': 'verdict'") && cv.includes('▣ BLUEPRINT') && cv.includes('🛡 PROOF') && cv.includes('ax-stamp'));
  assert.ok(hud.includes('function apexWarning') && hud.includes('t-beta') && hud.includes('min left this week'));
  assert.strictEqual(read('docs/companion/widgets.js').includes('gauntlet(d, st, save, ctx)'), true, 'N28C draws them too');
  ok('Mac app: Axiom only for allowed accounts, time logged, Blueprint approval, Proof, stamp, BETA warning');

  // ---------- SQL
  const sql = read('supabase/nexus-v2.4.sql');
  for (const s of ['create table if not exists public.apex_config', "default 'high-admin'", 'weekly_minutes int not null default 90', "array['anthropic', 'openrouter', 'openai']", 'public.apex_unlimited', 'function public.apex_session', 'function public.apex_log', 'function public.admin_apex_overview', 'function public.admin_apex_set'])
    assert.ok(sql.includes(s), s);
  assert.ok(/revoke insert, update, delete on public.apex_unlimited from anon, authenticated/.test(sql), 'nobody can make themselves unlimited from the app');
  assert.ok(!/Precision is not optional/.test(sql), "Axiom's prompt is not in the repo");
  ok('SQL: stage high-admin, 90 min/week, provider list, unlimited only via the SQL editor, prompt not in the repo');

  // ---------- offline flashcards + bursts
  const app = read('docs/companion/app.js'), sw = read('docs/companion/sw.js'), comp = read('src/companion.js'), st = read('renderer/study.js');
  assert.ok(app.includes("store.set('studyCache'") && app.includes('function flushReviews') && app.includes("request('review_batch'") && app.includes("addEventListener('online'"));
  assert.ok(sw.includes('supabase-js@2.45.4') && /n28c-shell-v\d+\.\d+\.\d/.test(sw), 'opens offline');
  assert.ok(comp.includes("case 'review_batch'"));
  assert.ok(app.includes("id=\"burst\"") && app.includes('endsAt: Date.now() + 120e3') && st.includes("data-a=\"burst\"") && st.includes('function startBurst'));
  assert.ok(app.includes("a.apex ? 'APEX · BETA'"));
  const changes = JSON.parse(read('docs/whats-new/changes.json')); assert.strictEqual(changes[0].version, require('../package.json').version);
  assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])), 'Axiom stays out of the public notes');
  ok('N28C: decks on the phone, offline reviews sync later, 2-minute bursts (Mac too), Axiom labeled APEX · BETA');
  // ---------- 2.4.1: ```json widgets, Axiom above Paragon in a Beta section, Overlord skin
  const raw = 'Here.\n```json\n{"target":"plan","score":40,"verdict":"fix","critical":[{"issue":"x","fix":"y"}],"minor":[]}\n```\nDone.';
  assert.ok(fk.retagBlocks(raw, ['gauntlet']).includes('```nexus-gauntlet\n'), '```json gauntlet becomes a widget');
  assert.strictEqual(fk.retagBlocks('```json\n{"a":1}\n```', ['gauntlet']), '```json\n{"a":1}\n```', 'other JSON is left alone');
  assert.strictEqual(fk.retagBlocks(raw, []), raw);
  assert.ok(read('renderer/widgets.js').includes('function shapeKind'), 'older saved answers render too');
  assert.strictEqual(require('../src/personas').PERSONAS[0].id, 'axiom', 'Axiom is listed first');
  assert.ok(hud.includes('BETA AGENTS') && hud.includes("x => !x.legacy && !x.beta") && hud.includes("orb.setSkin(p.apex ? 'crucible'"));
  assert.ok(read('renderer/settings.js').includes('BETA AGENTS') && app.includes('BETA AGENTS') && app.includes("a.apex ? 'crucible'"));
  ok("2.4.1: ```json widgets fixed, Beta agents section above Paragon (Mac, Settings, N28C), Overlord skin while Axiom is active");
  console.log(`v2.4: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
