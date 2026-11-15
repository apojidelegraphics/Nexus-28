// Nexus '28 Axiom, phase 2 (v2.5): Command Swarm with delegation receipts, the Dossier, the Briefing Room and the
// Threat Board. Everything Axiom remembers lives on this Mac (axiom.json in Nexus' folder), visible and editable in
// Settings → Axiom. Nothing here runs unless Supabase lets you use Axiom (see apex.js).
const fs = require('fs');

const KINDS = ['project', 'goal', 'deadline', 'preference', 'fact'];
const LEVELS = ['red', 'amber', 'green'];
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const DAY = 864e5;

class AxiomData {
  constructor({ file, now = () => Date.now() }) {
    Object.assign(this, { file, now });
    this.d = null;
  }
  load() {
    if (this.d) return this.d;
    let d = {}; try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    this.d = { dossier: Array.isArray(d.dossier) ? d.dossier : [], threats: Array.isArray(d.threats) ? d.threats : [],
      briefing: { enabled: false, time: '07:30', speak: false, lastDay: '', convId: '', ...(d.briefing || {}) } };
    return this.d;
  }
  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.d, null, 1)); } catch {} }

  // ---------- Dossier: what Axiom knows about your projects, goals, deadlines and how you like things done
  dossier() { return this.load().dossier.slice().sort((a, b) => (a.due || 9e15) - (b.due || 9e15) || b.updatedAt - a.updatedAt); }
  addEntry(e, source = 'you') {
    const kind = KINDS.includes(e?.kind) ? e.kind : 'fact', text = clip(e?.text, 300); if (!text) return null;
    const d = this.load();
    if (d.dossier.some(x => x.text.toLowerCase() === text.toLowerCase())) return null;
    const due = e.due ? new Date(e.due).getTime() : null;
    const entry = { id: uid('d'), kind, text, due: due && !isNaN(due) ? due : null, source: clip(source, 20), updatedAt: this.now() };
    d.dossier.unshift(entry); d.dossier = d.dossier.slice(0, 200); this.save(); return entry;
  }
  editEntry(id, patch = {}) {
    const e = this.load().dossier.find(x => x.id === id); if (!e) return null;
    if (patch.text !== undefined) e.text = clip(patch.text, 300) || e.text;
    if (KINDS.includes(patch.kind)) e.kind = patch.kind;
    if (patch.due !== undefined) { const t = patch.due ? new Date(patch.due).getTime() : null; e.due = t && !isNaN(t) ? t : null; }
    e.updatedAt = this.now(); this.save(); return e;
  }
  removeEntry(id) { const d = this.load(); d.dossier = d.dossier.filter(x => x.id !== id); this.save(); return true; }
  // What Axiom reads every turn (short, so it doesn't eat your minutes)
  dossierPrompt() {
    const list = this.dossier(); if (!list.length) return '';
    const fmt = e => `- [${e.kind}] ${e.text}${e.due ? ` (due ${new Date(e.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}`;
    return `\n\n[DOSSIER — what the user has told you to remember about them; use it, don't recite it. If they tell you something durable (a project, goal, deadline, preference), offer to save it with a nexus-dossier block]\n${list.slice(0, 40).map(fmt).join('\n')}`;
  }

  // ---------- Threat Board: risks Axiom is tracking (red / amber / green)
  threats({ all = false } = {}) {
    const order = { red: 0, amber: 1, green: 2 };
    return [...this.load().threats, ...this.autoThreats()].filter(t => all || !t.resolved).sort((a, b) => order[a.level] - order[b.level] || (a.due || 9e15) - (b.due || 9e15));
  }
  // Deadlines in your Dossier turn into threats as they get close (not saved: always current)
  autoThreats() {
    const now = this.now();
    return this.load().dossier.filter(e => e.due && e.due - now < 7 * DAY && e.due > now - DAY).map(e => {
      const days = Math.ceil((e.due - now) / DAY);
      return { id: 'auto-' + e.id, title: e.text, level: days <= 2 ? 'red' : 'amber', source: 'deadline', due: e.due, note: days <= 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`, auto: true };
    });
  }
  track(t, source = 'you') {
    const title = clip(t?.title, 160); if (!title) return null;
    const d = this.load();
    const same = d.threats.find(x => !x.resolved && x.title.toLowerCase() === title.toLowerCase());
    if (same) { same.level = LEVELS.includes(t.level) ? t.level : same.level; same.updatedAt = this.now(); this.save(); return same; }
    const due = t.due ? new Date(t.due).getTime() : null;
    const th = { id: uid('t'), title, level: LEVELS.includes(t.level) ? t.level : 'amber', note: clip(t.note, 240), fix: clip(t.fix, 240), source: clip(source, 20), due: due && !isNaN(due) ? due : null, createdAt: this.now(), updatedAt: this.now(), resolved: false };
    d.threats.unshift(th); d.threats = d.threats.slice(0, 150); this.save(); return th;
  }
  setThreat(id, patch = {}) {
    const t = this.load().threats.find(x => x.id === id); if (!t) return null;
    if (LEVELS.includes(patch.level)) t.level = patch.level;
    if (patch.resolved !== undefined) t.resolved = !!patch.resolved;
    t.updatedAt = this.now(); this.save(); return t;
  }
  removeThreat(id) { const d = this.load(); d.threats = d.threats.filter(x => x.id !== id); this.save(); return true; }
  summary() { const t = this.threats(); return { red: t.filter(x => x.level === 'red').length, amber: t.filter(x => x.level === 'amber').length, green: t.filter(x => x.level === 'green').length, total: t.length }; }
  threatPrompt() {
    const t = this.threats(); if (!t.length) return '';
    return `\n\n[THREAT BOARD — risks you are tracking for the user]\n${t.slice(0, 15).map(x => `- ${x.level.toUpperCase()}: ${x.title}${x.note ? ' (' + x.note + ')' : ''}`).join('\n')}`;
  }

  // ---------- Briefing Room settings
  briefing() { return { ...this.load().briefing }; }
  setBriefing(p = {}) {
    const b = this.load().briefing;
    if (p.enabled !== undefined) b.enabled = !!p.enabled;
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.time || ''))) b.time = p.time;
    if (p.speak !== undefined) b.speak = !!p.speak;
    if (p.lastDay !== undefined) b.lastDay = String(p.lastDay);
    if (p.convId !== undefined) b.convId = String(p.convId);
    this.save(); return { ...b };
  }
  briefingDue(d = new Date(this.now())) {
    const b = this.load().briefing; if (!b.enabled) return false;
    const day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return b.lastDay !== day && hm >= b.time ? day : false;
  }
}

// ---------- blocks Axiom writes that the app turns into actions
// ```nexus-dossier {"add":[{"kind":"deadline","text":"…","due":"2026-12-01"}]}  ·  ```nexus-threats {"threats":[{"title","level","note","fix"}]}
function parseBlock(text, lang) {
  const re = new RegExp('```' + lang + '\\s*([\\s\\S]*?)```', 'g'); const out = []; let m;
  while ((m = re.exec(String(text || '')))) { try { out.push(JSON.parse(m[1].trim())); } catch {} }
  return out;
}
const dossierAdds = text => parseBlock(text, 'nexus-dossier').flatMap(j => Array.isArray(j.add) ? j.add : []).slice(0, 10);
const threatList = text => parseBlock(text, 'nexus-threats').flatMap(j => Array.isArray(j.threats) ? j.threats : []).slice(0, 12);

// ---------- Command Swarm: Axiom splits the job, Flash / Lyte / Neodela work in parallel, Axiom grades and merges.
const ROLES = { research: 'Researcher', draft: 'Writer', check: 'Checker', analyze: 'Analyst' };
//   complete({ system, messages }) → text  (Axiom's own model, no tools)
//   workers: [{ id, name }] that are usable right now
async function planSwarm({ complete, question, workers }) {
  if (!workers.length) return [];
  const raw = await complete({ system: `You are Axiom, commanding a swarm of worker agents. Split the user's request into 2–4 independent subtasks that can run in parallel, and assign each to one worker. Workers: ${workers.map(w => `${w.id} (${w.name})`).join(', ')}. Roles: research (find facts), draft (write), check (find flaws), analyze (work numbers / reason). Reply with ONLY JSON: {"tasks":[{"agent":"worker id","role":"research|draft|check|analyze","task":"a complete, self-contained instruction"}]}.`,
    messages: [{ role: 'user', content: String(question).slice(0, 6000) }] });
  let j = null; try { j = JSON.parse((String(raw).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch {}
  const ids = workers.map(w => w.id);
  return (Array.isArray(j?.tasks) ? j.tasks : []).map((t, i) => ({ agent: ids.includes(t?.agent) ? t.agent : ids[i % ids.length], role: ROLES[t?.role] ? t.role : 'analyze', task: clip(t?.task, 1200) })).filter(t => t.task).slice(0, 4);
}
//   run(task) → { ok, text, error, model, persona }
async function runSwarm({ tasks, run, now = () => Date.now() }) {
  return Promise.all(tasks.map(async t => {
    const start = now();
    let r; try { r = await run(t); } catch (e) { r = { ok: false, error: e.message }; }
    return { ...t, ok: !!r?.ok, text: String(r?.ok ? r.text || '' : r?.error || 'failed').slice(0, 6000), model: clip(r?.model, 80), seconds: Math.round((now() - start) / 100) / 10, chars: String(r?.text || '').length };
  }));
}
async function gradeSwarm({ complete, question, results }) {
  if (!results.length) return results;
  const raw = await complete({ system: 'You are Axiom reviewing your workers. Grade each result for accuracy and usefulness (A–F), note in one short line what it got right or wrong, and set "overruled": true if you will not use its conclusion. Reply with ONLY JSON: {"grades":[{"i":0,"grade":"A","note":"…","overruled":false}]}.',
    messages: [{ role: 'user', content: `Request: ${String(question).slice(0, 1500)}\n\n` + results.map((r, i) => `#${i} ${r.agent} (${ROLES[r.role]}): ${r.task}\n${r.ok ? r.text.slice(0, 2500) : 'FAILED: ' + r.text}`).join('\n\n') }] }).catch(() => '');
  let j = null; try { j = JSON.parse((String(raw).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch {}
  const g = Array.isArray(j?.grades) ? j.grades : [];
  return results.map((r, i) => { const x = g.find(y => +y?.i === i) || {}; return { ...r, grade: /^[A-F][+-]?$/.test(x.grade || '') ? x.grade : r.ok ? '—' : 'F', note: clip(x.note, 160), overruled: !!x.overruled || !r.ok }; });
}
const swarmNote = results => `\n\n[COMMAND SWARM — your workers' results (graded). Merge the good parts into one answer, say where you overruled a worker and why, and don't mention grades unless useful]\n` +
  results.map((r, i) => `## #${i + 1} ${r.agent} · ${ROLES[r.role]} · grade ${r.grade}${r.overruled ? ' · OVERRULED' : ''}\nTask: ${r.task}\n${r.text.slice(0, 3000)}`).join('\n\n');
// Receipts shown under the answer (no full worker text, just what they did)
const receipts = results => results.map(r => ({ agent: r.agent, role: ROLES[r.role], task: clip(r.task, 200), ok: r.ok, seconds: r.seconds, model: r.model, chars: r.chars, grade: r.grade, note: r.note, overruled: r.overruled, excerpt: clip(r.text, 240) }));

// ---------- Briefing Room prompt
function briefingPrompt({ facts, dossier, threats, nickname = '', day }) {
  return `[BRIEFING ROOM · ${day}] Write ${nickname ? nickname + "'s" : "the user's"} strategic briefing for today. Not a friendly morning summary: a commander's brief.
Sections (short, markdown headings): **At risk this week** · **Drop or delay** · **Do first, and why** (max 3, in order) · **Watch**.
Be decisive. Use only the facts below; if something important is missing, say what you'd need. End with a fenced code block with the language tag nexus-threats containing JSON {"threats":[{"title":"…","level":"red"|"amber"|"green","note":"why","fix":"what to do"}]} for the risks worth tracking (0–6).

FACTS GATHERED
${(facts.blocks || []).map(b => `### ${b.title}\n${b.text}`).join('\n\n') || '(no calendar, reminders or weather connected)'}
${dossier || '\n[DOSSIER] (empty)'}
${threats || '\n[THREAT BOARD] (nothing tracked)'}`;
}

module.exports = { AxiomData, KINDS, LEVELS, dossierAdds, threatList, planSwarm, runSwarm, gradeSwarm, swarmNote, receipts, briefingPrompt, ROLES };
