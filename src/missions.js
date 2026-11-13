// Missions: give Paragon a goal and a time limit; it works in the background in rounds (tools, approvals
// as usual) until the goal is done or time runs out, then writes a final report into a new chat.
//
// deps: { convos, space() → missions space, step({ convId, extra, signal, onEvent }) → { ok, text, error, activity, model, fatal },
//         onState(state), onDone(mission), now }

const MAX_MINUTES = 120;
const short = s => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > 52 ? s.slice(0, 50).replace(/\s+\S*$/, '') + '…' : s; };

const roundNote = (goal, minsLeft, round) => `\n\n=== MISSION MODE ===\nYou are on a mission, working on your own in the background while the user does other things. ` +
  `Goal: "${goal}". This is round ${round}; about ${minsLeft} minute${minsLeft === 1 ? '' : 's'} left. Work toward the goal with your tools ` +
  `(search, read pages, connectors). Actions that change things still need the user's approval. In each reply, briefly list what you did and ` +
  `found this round (2–5 bullets) and what you'll do next. When the goal is fully done, end your reply with the line: MISSION COMPLETE`;
const finalNote = (goal, why) => `\n\n=== MISSION REPORT ===\nThe mission "${goal}" has ${why}. Do not call any tools. Write the final report for the user: ` +
  `a one-line result, then the key findings or deliverable (use headings, bullets or a table if it helps), then anything left undone. Keep it tight.`;

class Missions {
  constructor({ convos, space, step, onState = () => {}, onDone = () => {}, now = () => Date.now() }) {
    Object.assign(this, { convos, space, step, onState, onDone, now });
    this.m = null;
  }
  state() {
    const m = this.m;
    if (!m) return null;
    const elapsed = m.elapsed + (m.status === 'running' && m.roundStart ? this.now() - m.roundStart : 0);
    return { id: m.id, goal: m.goal, title: m.title, convId: m.convId, status: m.status, round: m.round, budget: m.budget, elapsed: Math.min(elapsed, m.budget),
      activity: m.activity, error: m.error || '' };
  }
  emit() { this.onState(this.state()); }

  start({ goal, minutes = 20 }) {
    if (this.m && !['done', 'error'].includes(this.m.status)) throw new Error('A mission is already running. End it first.');
    goal = String(goal || '').trim();
    if (goal.length < 6) throw new Error('Describe the mission in a sentence or two.');
    minutes = Math.max(1, Math.min(MAX_MINUTES, Math.round(+minutes || 20)));
    const sp = this.space();
    const conv = this.convos.create({ activate: false, spaceId: sp?.id, title: 'Mission: ' + short(goal), kind: 'mission' });
    this.convos.appendTo(conv.id, { role: 'user', content: `${goal}\n\n(Mission · ${minutes} min)`, via: 'mission' });
    this.m = { id: conv.id, goal, title: short(goal), convId: conv.id, status: 'running', round: 0, budget: minutes * 60e3, elapsed: 0, roundStart: 0, activity: 'Starting', ctrl: null, ended: false, waiters: [] };
    this.ticker = setInterval(() => { if (this.m?.status === 'running') this.emit(); }, 1000);
    this.loop(this.m).catch(e => { this.m.status = 'error'; this.m.error = e.message; this.finish(this.m); });
    this.emit();
    return this.state();
  }
  pause() {
    const m = this.m; if (!m || m.status !== 'running') return this.state();
    m.status = 'paused'; m.activity = 'Paused';
    if (m.roundStart) { m.elapsed += this.now() - m.roundStart; m.roundStart = 0; }
    m.ctrl?.abort();
    this.emit(); return this.state();
  }
  resume() {
    const m = this.m; if (!m || m.status !== 'paused') return this.state();
    m.status = 'running'; m.activity = 'Resuming';
    m.waiters.splice(0).forEach(r => r());
    this.emit(); return this.state();
  }
  end() {
    const m = this.m; if (!m || ['done', 'error', 'reporting'].includes(m.status)) return this.state();
    m.ended = true;
    m.ctrl?.abort();
    m.waiters.splice(0).forEach(r => r());
    m.activity = 'Wrapping up';
    this.emit(); return this.state();
  }
  dismiss() { if (this.m && ['done', 'error'].includes(this.m.status)) { this.m = null; this.emit(); } }

  async loop(m) {
    let failures = 0;
    const maxRounds = Math.ceil(m.budget / 60e3) * 2 + 2;
    while (!m.ended) {
      if (m.status === 'paused') { await new Promise(r => m.waiters.push(r)); continue; }
      const left = m.budget - m.elapsed;
      if (left <= 0 || m.round >= maxRounds) break;
      m.round++;
      m.ctrl = new AbortController();
      m.roundStart = this.now(); m.activity = m.round === 1 ? 'Planning' : 'Working';
      this.emit();
      const res = await this.step({ convId: m.convId, extra: roundNote(m.goal, Math.max(1, Math.round(left / 60e3)), m.round), signal: m.ctrl.signal, timeLeft: left,
        onEvent: ev => {
          if (ev.type !== 'status') return;
          const a = ev.status === 'tool' ? (ev.detail ? `${ev.label} · ${ev.detail}` : ev.label) : ev.status === 'awaiting' ? `Waiting for your OK: ${ev.label}` : ev.status === 'writing' ? 'Writing an update' : 'Thinking';
          if (a !== m.activity) { m.activity = a; this.emit(); }
        } });
      if (m.roundStart) { m.elapsed += this.now() - m.roundStart; m.roundStart = 0; }
      if (res.aborted || m.ctrl.signal.aborted) { if (m.ended) break; continue; } // paused mid-round → redo the round after resume
      if (!res.ok) {
        this.convos.appendTo(m.convId, { role: 'assistant', persona: 'paragon', content: res.error, error: true, via: 'mission' });
        if (res.fatal || ++failures >= 2) { m.status = 'error'; m.error = res.error; break; }
        continue;
      }
      failures = 0;
      this.convos.appendTo(m.convId, { role: 'assistant', persona: 'paragon', content: res.text || '(no update)', model: res.model, via: 'mission', activity: res.activity || [], sources: res.sources || [] });
      if (/MISSION COMPLETE\s*\W*$/i.test((res.text || '').trim()) || /\bMISSION COMPLETE\b/.test(res.text || '')) { m.completed = true; break; }
      const mins = Math.max(0, Math.round((m.budget - m.elapsed) / 60e3));
      this.convos.appendTo(m.convId, { role: 'user', hidden: true, content: `Keep going on the mission. About ${mins} minute${mins === 1 ? '' : 's'} left. Do the next most useful step. When the goal is fully done, say MISSION COMPLETE.` });
    }
    // Final report (also after End or an error, so you always get what was found).
    if (m.status !== 'error' || m.round > 1) {
      m.status = 'reporting'; m.activity = 'Writing the report'; this.emit();
      const why = m.completed ? 'been completed' : m.ended ? 'been ended early by the user' : m.status === 'error' ? 'stopped because of an error' : 'run out of time';
      this.convos.appendTo(m.convId, { role: 'user', hidden: true, content: `Write the final mission report now.` });
      const res = await this.step({ convId: m.convId, extra: finalNote(m.goal, why), noTools: true, onEvent: () => {} });
      if (res.ok && res.text) this.convos.appendTo(m.convId, { role: 'assistant', persona: 'paragon', content: res.text, model: res.model, via: 'mission', report: true });
      if (m.status !== 'error') m.status = 'done';
    }
    this.finish(m);
  }
  finish(m) {
    clearInterval(this.ticker);
    if (m.status !== 'error') m.status = 'done';
    m.activity = m.completed ? 'Mission complete' : m.ended ? 'Ended' : m.error ? 'Stopped: ' + m.error : "Time's up";
    this.emit();
    this.onDone(this.state(), m);
  }
}

module.exports = { Missions, MAX_MINUTES };
