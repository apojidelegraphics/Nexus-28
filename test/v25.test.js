// v2.5 tests: Axiom phase 2 (Command Swarm + delegation receipts, Dossier, Briefing Room, Threat Board) and the public
// status page.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const X = require('../src/axiom');
  const file = path.join(os.tmpdir(), 'axiom-' + Date.now() + '.json'); let now = Date.parse('2026-11-16T09:00:00');
  const d = new X.AxiomData({ file, now: () => now });
  // ---------- Dossier
  assert.ok(d.addEntry({ kind: 'deadline', text: 'AP Bio exam', due: '2026-11-17T12:00:00' }));
  assert.strictEqual(d.addEntry({ kind: 'fact', text: 'ap bio exam' }), null, 'no duplicates');
  const pref = d.addEntry({ kind: 'nonsense', text: 'Likes short answers' }); assert.strictEqual(pref.kind, 'fact');
  d.editEntry(pref.id, { kind: 'preference', text: 'Likes short, blunt answers' }); assert.strictEqual(d.dossier().find(e => e.id === pref.id).kind, 'preference');
  assert.ok(d.dossierPrompt().includes('[deadline] AP Bio exam (due Nov 17)') && d.dossierPrompt().includes('[preference] Likes short, blunt answers'));
  ok('Dossier: add, dedupe, edit, kinds, what Axiom reads each turn');
  // ---------- Threat Board
  assert.deepStrictEqual(d.threats().map(t => [t.level, t.title, t.auto]), [['red', 'AP Bio exam', true]], 'close deadlines become threats on their own');
  const t1 = d.track({ title: 'No rollback plan', level: 'red', fix: 'Keep 2.3.1' }, 'gauntlet'); d.track({ title: 'no rollback plan', level: 'amber' });
  assert.strictEqual(d.threats().filter(t => !t.auto).length, 1, 'same threat is updated, not duplicated');
  d.track({ title: 'Essay outline', level: 'green' });
  assert.deepStrictEqual(d.summary(), { red: 1, amber: 1, green: 1, total: 3 });
  d.setThreat(t1.id, { resolved: true }); assert.ok(!d.threats().some(t => t.id === t1.id) && d.threats({ all: true }).some(t => t.id === t1.id));
  now += 5 * 864e5; assert.ok(!d.threats().some(t => t.auto), 'past deadlines drop off');
  const again = new X.AxiomData({ file }); assert.strictEqual(again.dossier().length, 2, 'saved on this Mac');
  ok('Threat Board: auto deadlines, tracking without duplicates, levels, resolve, persists');
  // ---------- Briefing Room
  assert.strictEqual(d.briefingDue(new Date('2026-11-21T08:00:00')), false, 'off by default');
  d.setBriefing({ enabled: true, time: '07:30' });
  assert.strictEqual(d.briefingDue(new Date('2026-11-21T07:00:00')), false);
  const day = d.briefingDue(new Date('2026-11-21T07:31:00')); assert.ok(day); d.setBriefing({ lastDay: day });
  assert.strictEqual(d.briefingDue(new Date('2026-11-21T09:00:00')), false, 'once a day');
  const bp = X.briefingPrompt({ facts: { blocks: [{ title: "Today's calendar", text: '- 9:00 Bio' }] }, dossier: d.dossierPrompt(), threats: d.threatPrompt(), day: 'Saturday' });
  assert.ok(bp.includes('At risk this week') && bp.includes('nexus-threats') && bp.includes('9:00 Bio'));
  const tl = X.threatList('x\n```nexus-threats\n{"threats":[{"title":"Exam","level":"red"}]}\n```'); assert.strictEqual(tl[0].title, 'Exam');
  assert.strictEqual(X.dossierAdds('```nexus-dossier\n{"add":[{"kind":"goal","text":"Get a 5"}]}\n```')[0].text, 'Get a 5');
  ok('Briefing Room: daily at your time, once a day, commander-style prompt, its threats go on the board');
  // ---------- Command Swarm
  const workers = [{ id: 'flash', name: 'Flash' }, { id: 'lyte', name: 'Lyte' }, { id: 'neodela', name: 'Neodela' }];
  const tasks = await X.planSwarm({ workers, question: 'Plan my study week', complete: async () => '{"tasks":[{"agent":"flash","role":"research","task":"Find the exam topics"},{"agent":"ghost","role":"draft","task":"Draft a schedule"},{"agent":"lyte","role":"bogus","task":"Check it"}]}' });
  assert.deepStrictEqual(tasks.map(t => [t.agent, t.role]), [['flash', 'research'], ['lyte', 'draft'], ['lyte', 'analyze']], 'unknown agents/roles are fixed up');
  let t = 0; const res = await X.runSwarm({ tasks, now: () => (t += 1500), run: async x => x.role === 'draft' ? { ok: false, error: 'rate limited' } : { ok: true, text: 'done: ' + x.task, model: 'm1' } });
  assert.strictEqual(res.filter(r => r.ok).length, 2); assert.ok(res[0].seconds > 0);
  const graded = await X.gradeSwarm({ question: 'q', results: res, complete: async () => '{"grades":[{"i":0,"grade":"A","note":"solid"},{"i":2,"grade":"C","note":"missed Friday","overruled":true}]}' });
  assert.deepStrictEqual(graded.map(g => [g.grade, g.overruled]), [['A', false], ['F', true], ['C', true]], 'failed workers are overruled');
  const rc = X.receipts(graded); assert.ok(rc[0].task && rc[0].role === 'Researcher' && !('text' in rc[0]), 'receipts: who did what, not the whole text');
  assert.ok(X.swarmNote(graded).includes('OVERRULED'));
  ok('Command Swarm: plan, parallel workers, grades, overrules, receipts');
  // ---------- wiring
  const main = read('main.js'), set = read('renderer/settings.js'), hud = read('renderer/hud.js'), w = read('renderer/widgets.js'), cv = read('renderer/chatview.js');
  assert.ok(main.includes('axiomMod.planSwarm') && main.includes("apexKind = 'swarm'") && main.includes('axiomData.dossierPrompt() + axiomData.threatPrompt()') && main.includes('async function runAxiomBriefing') && main.includes("ipcMain.handle('axiom:briefNow'"));
  assert.ok(main.includes('const axiomOnly = fn =>'), 'Axiom data is only reachable when Axiom is allowed');
  assert.ok(set.includes('function renderAxiom') && set.includes('Threat Board') && set.includes('Briefing Room') && read('renderer/index.html').includes('data-tab="axiom"'));
  assert.ok(hud.includes('function paintThreatChip') && w.includes('threats(d, st, save, ctx)') && w.includes('dossier(d, st, save, ctx)') && w.includes('data-track') && cv.includes('COMMAND SWARM'));
  assert.ok(require('../src/personas').PERSONAS[0].features.includes('Swarm') && require('../src/features').APEX.has('Swarm'));
  fs.rmSync(file, { force: true });
  ok('Mac app: Swarm in Axiom turns (time counted as swarm), Settings → Axiom, Threat Board chip, track/save widgets');
  // ---------- public status page
  const sql = read('supabase/nexus-v2.5.sql'), page = read('docs/status/index.html');
  for (const s of ['public.status_components', 'public.status_incidents', 'function public.public_status', 'grant execute on function public.public_status() to anon', 'function public.admin_status_update']) assert.ok(sql.includes(s), s);
  assert.ok(!/created_by/.test(sql.slice(sql.indexOf('function public.public_status'))), 'never shows who posted');
  assert.ok(page.includes("rpc/public_status") && page.includes('esc(') && !/innerHTML = [^`]*\$\{(?!esc)/.test('') && page.includes("Can’t reach the Nexus servers"));
  assert.ok(read('docs/index.html').includes('href="status/"') && main.includes("'Nexus Status…'") && read('docs/companion/app.js').includes('../status/'));
  const changes = JSON.parse(read('docs/whats-new/changes.json')); assert.strictEqual(changes[0].version, require('../package.json').version);
  assert.ok(!/axiom|apex/i.test(JSON.stringify(changes[0])), 'Axiom stays out of public notes');
  ok('status page: public function only, no admin info, linked from the site, the app and N28C');
  console.log(`v2.5: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
