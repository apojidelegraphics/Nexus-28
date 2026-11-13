// Watch mode: keep an eye on one window and tell the user when something happens.
// It's built to spend as little AI as possible: every poll reads the window's text on this Mac (OCR),
// and the model is only asked when the text actually changed (and at most every 30 s). If the condition
// has "quoted words", Nexus checks for them itself and never needs the model at all.
//
// deps: { capture(windowId) → { text } | null (window gone), judge({ condition, text, previous }) → { met, why },
//         onState(list), onHit(watch, why), now, setTimeout, clearTimeout }

const INTERVALS = [5, 15, 30, 60];            // seconds
const AI_GAP = 30e3;                          // min ms between AI checks
const MAX_WATCHES = 3;

const norm = s => String(s || '').toLowerCase().replace(/\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?/g, ' ') // clocks tick; ignore them
  .replace(/[^\p{L}\p{N}%.$-]+/gu, ' ').replace(/\s+/g, ' ').trim();
// Share of words that changed between two readings (0 = identical, 1 = completely different).
function changeRatio(a, b) {
  const A = norm(a).split(' ').filter(Boolean), B = norm(b).split(' ').filter(Boolean);
  if (!A.length && !B.length) return 0;
  const count = arr => arr.reduce((m, w) => m.set(w, (m.get(w) || 0) + 1), new Map());
  const ca = count(A), cb = count(B);
  let same = 0;
  for (const [w, n] of ca) same += Math.min(n, cb.get(w) || 0);
  return 1 - same / Math.max(A.length, B.length);
}
// "tell me when it says "Export complete"" → ['export complete']
const quoted = cond => [...String(cond).matchAll(/["“”']([^"“”']{2,80})["“”']/g)].map(m => norm(m[1])).filter(Boolean);
// Conditions that are only about words appearing can be checked without the model.
const localOnly = cond => quoted(cond).length > 0 && /\b(say|says|show|shows|appear|appears|contain|contains|read|reads|display|displays|pops? up|mentions?)\b/i.test(cond);
// New lines in the latest reading (what the model is shown, so it reads less).
function newLines(prev, next) {
  const seen = new Set(String(prev || '').split('\n').map(l => norm(l)));
  return String(next || '').split('\n').filter(l => l.trim() && !seen.has(norm(l))).join('\n');
}

class Watcher {
  constructor({ capture, judge, onState = () => {}, onHit = () => {}, now = () => Date.now(), setTimeout: st = setTimeout, clearTimeout: ct = clearTimeout }) {
    Object.assign(this, { capture, judge, onState, onHit, now, st, ct });
    this.list = [];
  }
  state() { return this.list.map(w => this.pub(w)); }
  pub(w) {
    return { id: w.id, app: w.app, title: w.title, condition: w.condition, interval: w.interval, status: w.status, started: w.started, until: w.until,
      checks: w.checks, aiChecks: w.aiChecks, skipped: w.skipped, last: w.lastCheck, why: w.why || '', localOnly: w.localOnly };
  }
  emit() { this.onState(this.state()); }

  start({ windowId, app = '', title = '', condition, interval = 15, minutes = 30, ai = true }) {
    condition = String(condition || '').trim();
    if (!windowId) throw new Error('Pick a window to watch.');
    if (condition.length < 3) throw new Error('Say what to watch for, like: tell me when the download finishes.');
    if (this.list.filter(w => w.status === 'watching').length >= MAX_WATCHES) throw new Error(`You can watch up to ${MAX_WATCHES} windows at once.`);
    interval = INTERVALS.includes(+interval) ? +interval : 15;
    minutes = Math.max(1, Math.min(240, Math.round(+minutes || 30)));
    const w = { id: 'w' + this.now().toString(36) + Math.random().toString(36).slice(2, 5), windowId: String(windowId), app, title, condition, interval,
      status: 'watching', started: this.now(), until: this.now() + minutes * 60e3, checks: 0, aiChecks: 0, skipped: 0, lastCheck: 0, lastAi: 0,
      text: null, judgedText: null, phrases: quoted(condition), localOnly: localOnly(condition) || !ai, timer: null, busy: false };
    this.list = [w, ...this.list].slice(0, 6);
    this.schedule(w, 0);
    this.emit();
    return this.pub(w);
  }
  stop(id, why = 'Stopped') {
    const w = this.list.find(x => x.id === id);
    if (!w) return false;
    this.ct(w.timer); w.status = 'stopped'; w.why = why;
    this.emit();
    return true;
  }
  dismiss(id) { this.list = this.list.filter(w => w.id !== id || w.status === 'watching'); this.emit(); }
  stopAll() { for (const w of this.list) if (w.status === 'watching') this.stop(w.id); }
  schedule(w, ms) { this.ct(w.timer); w.timer = this.st(() => this.poll(w), ms); }

  async poll(w) {
    if (w.status !== 'watching' || w.busy) return;
    if (this.now() >= w.until) return this.finish(w, 'timeout', "Time's up — nothing yet.");
    w.busy = true;
    try {
      const shot = await this.capture(w.windowId);
      if (!shot) return this.finish(w, 'closed', 'The window closed.');
      w.checks++; w.lastCheck = this.now();
      const text = String(shot.text || '');
      const first = w.text === null;
      const prev = w.text;
      w.text = text;
      // 1) Quoted words: checked right here, no AI.
      const flat = norm(text);
      const hit = w.phrases.find(p => flat.includes(p));
      if (hit) return this.finish(w, 'hit', `"${hit}" is on screen.`);
      if (w.localOnly) { w.skipped++; return; }
      // 2) Ask the model only when something changed since it last looked.
      const base = w.judgedText ?? prev;
      const changed = first || changeRatio(base, text) >= 0.02;
      if (!changed) { w.skipped++; return; }
      if (!first && this.now() - w.lastAi < AI_GAP) { w.skipped++; return; } // changed, but checked recently; next poll compares against the last judged text
      w.lastAi = this.now(); w.aiChecks++;
      const r = await this.judge({ condition: w.condition, text, changes: first ? '' : newLines(w.judgedText ?? prev, text), first });
      w.judgedText = text;
      if (r?.met) return this.finish(w, 'hit', r.why || 'It happened.');
    } catch (e) {
      w.errors = (w.errors || 0) + 1;
      if (w.errors >= 3) return this.finish(w, 'error', e.message);
    } finally {
      w.busy = false;
      if (w.status === 'watching') { this.schedule(w, w.interval * 1000); this.emit(); }
    }
  }
  finish(w, status, why) {
    this.ct(w.timer);
    w.status = status; w.why = why; w.busy = false;
    this.emit();
    if (status === 'hit') this.onHit(this.pub(w), why);
    else this.onEnd?.(this.pub(w), why);
  }
}

// The YES/NO question the AI judge answers (short in, a few words out).
function judgePrompt({ condition, text, changes, first }) {
  const body = String(text).slice(0, first ? 6000 : 3000);
  return `You are watching a window on the user's Mac for them. The user asked: "${condition}".\n\n` +
    (changes && !first ? `What changed since the last look:\n${String(changes).slice(0, 2500)}\n\n` : '') +
    `Text in the window now:\n${body}\n\n` +
    `Has what the user is waiting for happened? Answer with exactly one line: "YES: <short reason>" or "NO".`;
}
const parseJudge = s => { const t = String(s || '').trim(); const m = t.match(/^\W*yes\b[:\s-]*(.*)/i); return m ? { met: true, why: m[1].split('\n')[0].trim().slice(0, 140) } : { met: false }; };

module.exports = { Watcher, changeRatio, quoted, localOnly, newLines, judgePrompt, parseJudge, INTERVALS, MAX_WATCHES, AI_GAP };
