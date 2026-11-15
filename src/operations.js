// Axiom phase 3 (v2.6): Operations and Sentinel. Both run in the background on this Mac, careful with AI use.
//
//   Operation: a long job Axiom works on in steps over hours or days ("track these laptop prices and tell me the best
//     week to buy", "quiz me on unit 4 every evening"). Each step gets the goal, its own notes from last time and the
//     recent steps, does the next bit (read-only tools only: it can't change anything on your Mac in the background),
//     and saves its progress. It stops when it says it's done, hits its run budget, or your Axiom minutes run low.
//   Sentinel: a standing order that watches something (a web page, your calendar, your flashcards, the Threat Board)
//     and only asks Axiom to think when it actually changed. Axiom decides whether it matters, then notifies you,
//     drafts something in the Sentinel chat, and/or puts it on the Threat Board.
//
// Saved in operations.json. Runs one job at a time, so a backlog never turns into a burst of AI calls.
//   deps: { file, now, think(prompt, { kind, tools }) → { ok, text, error }, gather(source) → { text, error },
//           allowed() → { ok, reason }, notify(title, body, meta), track(threat), draft(title, text), onChange() }
const fs = require('fs');
const crypto = require('crypto');

const MIN_EVERY = 30;                     // minutes: no job checks more often than every 30 minutes
const LIMITS = { runs: 60, every: 7 * 1440, days: 60 };
const SOURCES = ['url', 'calendar', 'study', 'threats'];
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 20);
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function parseOp(text) {
  const m = String(text || '').match(/```nexus-op\s*([\s\S]*?)```/) || String(text || '').match(/\{[\s\S]*"progress"[\s\S]*\}/);
  let j = null; try { j = JSON.parse((m?.[1] || m?.[0] || '').trim()); } catch {}
  return j && typeof j === 'object' ? j : null;
}

class Operations {
  constructor(o) {
    Object.assign(this, { now: () => Date.now(), onChange: () => {}, notify: () => {}, track: () => {}, draft: async () => {} }, o);
    this.d = null; this.busy = false;
  }
  load() { if (this.d) return this.d; let d = {}; try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {} this.d = { ops: Array.isArray(d.ops) ? d.ops : [], sentinels: Array.isArray(d.sentinels) ? d.sentinels : [] }; return this.d; }
  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.d, null, 1)); } catch {} this.onChange(); }
  state() { const d = this.load(); return { ops: d.ops, sentinels: d.sentinels.map(({ lastHash, ...s }) => s), busy: this.busy }; }

  // ---------- create / change
  addOperation(p = {}) {
    const goal = clip(p.goal, 1500); if (!goal) throw new Error('What should the operation do?');
    const every = Math.max(MIN_EVERY, Math.min(LIMITS.every, Math.round(+p.every || 1440)));
    const op = { id: uid('op'), type: 'operation', title: clip(p.title || goal, 80), goal, every, maxRuns: Math.max(1, Math.min(LIMITS.runs, Math.round(+p.maxRuns || 14))),
      endsAt: this.now() + Math.max(1, Math.min(LIMITS.days, +p.days || 14)) * 864e5, phone: p.phone !== false, status: 'active', runs: [], notes: '', seconds: 0,
      createdAt: this.now(), nextAt: this.now() + 60e3, lastReport: '', reason: '' };
    this.load().ops.unshift(op); this.save(); return op;
  }
  addSentinel(p = {}) {
    const source = SOURCES.includes(p.source) ? p.source : 'url';
    let url = '';
    if (source === 'url') { url = String(p.url || '').trim(); if (!/^https?:\/\/\S+$/i.test(url)) throw new Error('Give the web page address (https://…).'); }
    const condition = clip(p.condition, 600); if (!condition) throw new Error('What should it watch for?');
    const actions = { notify: p.actions?.notify !== false, phone: p.actions?.phone !== false, draft: !!p.actions?.draft, threat: !!p.actions?.threat };
    const s = { id: uid('sn'), type: 'sentinel', title: clip(p.title || condition, 80), source, url, condition, actions, every: Math.max(MIN_EVERY, Math.min(LIMITS.every, Math.round(+p.every || 180))),
      status: 'active', checks: 0, thinks: 0, fired: 0, seconds: 0, lastHash: '', lastCheck: 0, lastFired: 0, lastWhy: '', history: [], createdAt: this.now(), nextAt: this.now() + 60e3, reason: '' };
    this.load().sentinels.unshift(s); this.save(); return s;
  }
  find(id) { const d = this.load(); return d.ops.find(x => x.id === id) || d.sentinels.find(x => x.id === id); }
  set(id, patch = {}) {
    const x = this.find(id); if (!x) return null;
    if (['active', 'paused'].includes(patch.status) && x.status !== 'done') { x.status = patch.status; x.reason = ''; if (patch.status === 'active') x.nextAt = Math.min(x.nextAt || 0, this.now() + 60e3); }
    if (patch.every) x.every = Math.max(MIN_EVERY, Math.min(LIMITS.every, Math.round(+patch.every)));
    if (patch.maxRuns && x.type === 'operation') x.maxRuns = Math.max(x.runs.length + 1, Math.min(LIMITS.runs, Math.round(+patch.maxRuns)));
    this.save(); return x;
  }
  remove(id) { const d = this.load(); d.ops = d.ops.filter(x => x.id !== id); d.sentinels = d.sentinels.filter(x => x.id !== id); this.save(); return true; }
  runNow(id) { const x = this.find(id); if (!x) return null; if (x.status === 'done') x.status = 'active'; x.nextAt = this.now(); this.save(); return this.tick(); }

  // ---------- the scheduler (call every minute). One job per tick.
  async tick() {
    if (this.busy) return null;
    const now = this.now(), d = this.load();
    const due = [...d.ops, ...d.sentinels].filter(x => x.status === 'active' && (x.nextAt || 0) <= now).sort((a, b) => a.nextAt - b.nextAt)[0];
    if (!due) return null;
    const can = await this.allowed();
    if (!can.ok) { for (const x of [...d.ops, ...d.sentinels]) if (x.status === 'active') { x.status = 'paused'; x.reason = can.reason; } this.save(); return { paused: can.reason }; }
    this.busy = true; this.onChange();
    try { return due.type === 'operation' ? await this.step(due) : await this.check(due); }
    finally { this.busy = false; this.save(); }
  }

  async step(op) {
    const now = this.now();
    if (op.runs.length >= op.maxRuns) return this.finish(op, 'Reached its run budget.');
    if (now > op.endsAt) return this.finish(op, 'Reached its end date.');
    const recent = op.runs.slice(-4).map((r, i) => `${op.runs.length - Math.min(4, op.runs.length) + i + 1}. ${new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}: ${r.progress}`).join('\n');
    const prompt = `[OPERATION · step ${op.runs.length + 1} of at most ${op.maxRuns} · runs every ${op.every >= 1440 ? Math.round(op.every / 1440) + ' day(s)' : Math.round(op.every / 60) + ' hour(s)'}]
Goal: ${op.goal}
Your notes from last time (your memory between steps): ${op.notes || '(none yet: this is the first step)'}
Recent steps:
${recent || '(none)'}

Do the next useful step toward the goal now. You may look things up with read-only tools; you cannot change anything on the user's Mac in the background. Be economical: this runs on a budget.
Then end with a fenced code block with the language tag nexus-op containing JSON:
{"progress":"one line: what you did/found this step","notes":"updated notes for your next step (facts, numbers, what to do next; under 1200 characters)","report":"something the user should hear now, or empty","done":false,"nextInMinutes":null}
Set "done": true only when the goal is complete; put the final result in "report".`;
    const t0 = this.now();
    const r = await this.think(prompt, { kind: 'operation', tools: true });
    const sec = Math.round((this.now() - t0) / 1000); op.seconds += sec;
    if (!r?.ok) { op.runs.push({ at: now, progress: 'Failed: ' + clip(r?.error, 160), seconds: sec, failed: true }); op.nextAt = now + op.every * 60e3; if (op.runs.slice(-3).every(x => x.failed) && op.runs.length >= 3) { op.status = 'paused'; op.reason = 'Failed 3 times in a row: ' + clip(r?.error, 120); } return { op: op.id, failed: true }; }
    const j = parseOp(r.text) || { progress: clip(r.text, 200), notes: op.notes };
    op.notes = clip(j.notes || op.notes, 1500);
    op.runs.push({ at: now, progress: clip(j.progress || 'Step done', 240), seconds: sec });
    op.runs = op.runs.slice(-80);
    const nextIn = Number.isFinite(+j.nextInMinutes) && +j.nextInMinutes > 0 ? Math.max(MIN_EVERY, Math.min(LIMITS.every, +j.nextInMinutes)) : op.every;
    op.nextAt = now + nextIn * 60e3;
    if (j.report) { op.lastReport = clip(j.report, 1500); this.notify(`▲ ${op.title}`, op.lastReport, { phone: op.phone, kind: 'operation', id: op.id }); }
    if (j.done) return this.finish(op, 'Goal complete.', true);
    return { op: op.id, progress: j.progress };
  }
  finish(op, reason, success = false) { op.status = 'done'; op.reason = reason; op.doneAt = this.now(); if (!success) this.notify(`▲ ${op.title} stopped`, reason + (op.lastReport ? ' Last report: ' + op.lastReport : ''), { phone: op.phone, kind: 'operation', id: op.id }); return { op: op.id, done: true, reason }; }

  async check(s) {
    const now = this.now();
    s.checks++; s.lastCheck = now; s.nextAt = now + s.every * 60e3;
    const g = await this.gather(s).catch(e => ({ error: e.message }));
    if (g?.error) { s.history.unshift({ at: now, what: 'Could not check: ' + clip(g.error, 140) }); s.history = s.history.slice(0, 20); return { sentinel: s.id, error: g.error }; }
    const text = String(g?.text || '').slice(0, 12000), h = hash(text);
    if (h === s.lastHash) return { sentinel: s.id, unchanged: true };          // nothing changed: no AI call
    const first = !s.lastHash; s.lastHash = h;
    s.thinks++;
    const t0 = this.now();
    const r = await this.think(`[SENTINEL · standing order] Condition: ${s.condition}
${first ? 'This is the first look (no earlier version to compare with).' : 'What it watches just changed.'} Decide whether the condition is met right now. Be strict: only trigger when it truly is, and not again for something you already reported (last report: ${s.lastWhy || 'none'}).
WHAT IT WATCHES (${s.source === 'url' ? s.url : s.source}):
${text}

Reply with ONLY JSON: {"triggered":true|false,"why":"one line","message":"what to tell the user (short)","draft":"if a draft would help (an email, a message, a plan), write it; else empty","threat":{"title":"…","level":"red"|"amber"|"green"} or null}`, { kind: 'operation', tools: false });
    s.seconds += Math.round((this.now() - t0) / 1000);
    if (!r?.ok) { s.history.unshift({ at: now, what: 'Check failed: ' + clip(r?.error, 140) }); s.lastHash = ''; return { sentinel: s.id, failed: true }; }
    let j = null; try { j = JSON.parse((String(r.text).match(/\{[\s\S]*\}/) || ['null'])[0]); } catch {}
    if (!j?.triggered) { s.history.unshift({ at: now, what: 'Changed, not triggered: ' + clip(j?.why || 'no', 140) }); s.history = s.history.slice(0, 20); return { sentinel: s.id, triggered: false }; }
    s.fired++; s.lastFired = now; s.lastWhy = clip(j.why || j.message, 200);
    s.history.unshift({ at: now, what: '⚑ Triggered: ' + clip(j.why || j.message, 160), fired: true }); s.history = s.history.slice(0, 20);
    const msg = clip(j.message || j.why || s.condition, 300);
    if (s.actions.notify || s.actions.phone) this.notify(`⚑ Sentinel: ${s.title}`, msg, { phone: s.actions.phone, mac: s.actions.notify, kind: 'sentinel', id: s.id });
    if (s.actions.threat) this.track({ title: clip(j.threat?.title || s.title, 160), level: ['red', 'amber', 'green'].includes(j.threat?.level) ? j.threat.level : 'amber', note: msg });
    if (s.actions.draft && j.draft) await this.draft(`⚑ ${s.title}`, `${msg}\n\n${String(j.draft).slice(0, 6000)}`);
    return { sentinel: s.id, triggered: true, message: msg };
  }
  // AI use so far (for the meters in Settings → Axiom)
  usage() { const d = this.load(); const sec = [...d.ops, ...d.sentinels].reduce((a, x) => a + (x.seconds || 0), 0); return { minutes: Math.round(sec / 6) / 10, active: [...d.ops, ...d.sentinels].filter(x => x.status === 'active').length }; }
}
module.exports = { Operations, parseOp, MIN_EVERY, SOURCES, hash };
