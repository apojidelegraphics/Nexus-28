// Focus timer (v2.1): Pomodoro-style focus blocks with short breaks. While you focus, Nexus holds its own
// notifications (Mac and phone) and tells you what you missed when the block ends. Each finished block earns points.
//   new Focus({ onState(state), onBlockDone(state), onEnd(summary), now, setTimeout, clearTimeout })
class Focus {
  constructor({ onState = () => {}, onBlockDone = () => {}, onEnd = () => {}, now = () => Date.now(), setTimeout: st = setTimeout, clearTimeout: ct = clearTimeout } = {}) {
    Object.assign(this, { onState, onBlockDone, onEnd, now, st, ct });
    this.s = null; this.timer = null; this.held = [];
  }
  state() {
    const s = this.s; if (!s) return { on: false };
    const left = s.paused ? s.left : Math.max(0, s.endsAt - this.now());
    return { on: true, phase: s.phase, task: s.task, minutes: s.minutes, breakMinutes: s.breakMinutes, block: s.block, blocks: s.blocks, done: s.done, left, paused: !!s.paused, endsAt: s.paused ? 0 : s.endsAt, held: this.held.length };
  }
  muting() { return !!this.s && this.s.phase === 'focus' && !this.s.paused; }
  hold(title, body) { this.held.push({ title: String(title).slice(0, 80), body: String(body || '').slice(0, 120), at: this.now() }); if (this.held.length > 50) this.held.shift(); }
  start({ minutes = 25, breakMinutes = 5, blocks = 4, task = '' } = {}) {
    minutes = Math.max(1, Math.min(180, Math.round(+minutes || 25))); breakMinutes = Math.max(1, Math.min(60, Math.round(+breakMinutes || 5))); blocks = Math.max(1, Math.min(12, Math.round(+blocks || 4)));
    this.s = { phase: 'focus', task: String(task || '').trim().slice(0, 80), minutes, breakMinutes, blocks, block: 1, done: 0, endsAt: this.now() + minutes * 60e3, started: this.now() };
    this.held = []; this.arm(); this.onState(this.state()); return this.state();
  }
  arm() { this.ct(this.timer); if (!this.s || this.s.paused) return; this.timer = this.st(() => this.next(), Math.max(0, this.s.endsAt - this.now()) + 50); }
  next() {
    const s = this.s; if (!s) return;
    if (s.phase === 'focus') {
      s.done++;
      if (s.block >= s.blocks) { this.onBlockDone(this.state(), []); return this.stop(true); }   // stop() reports what was held
      const held = this.release();   // break time: hand over what was held during this block
      this.onBlockDone(this.state(), held);
      s.phase = 'break'; s.endsAt = this.now() + s.breakMinutes * 60e3;
    } else { s.phase = 'focus'; s.block++; s.endsAt = this.now() + s.minutes * 60e3; }
    this.arm(); this.onState(this.state());
  }
  pause() { const s = this.s; if (!s || s.paused) return this.state(); s.left = Math.max(0, s.endsAt - this.now()); s.paused = true; this.ct(this.timer); this.onState(this.state()); return this.state(); }
  resume() { const s = this.s; if (!s || !s.paused) return this.state(); s.endsAt = this.now() + s.left; s.paused = false; this.arm(); this.onState(this.state()); return this.state(); }
  skip() { if (this.s) { this.ct(this.timer); this.next(); } return this.state(); }
  release() { const held = this.held; this.held = []; return held; }
  stop(finished = false) {
    const s = this.s; if (!s) return { on: false };
    this.ct(this.timer); this.s = null;
    const summary = { finished, done: s.done, blocks: s.blocks, minutes: s.done * s.minutes, task: s.task, held: this.release() };
    this.onEnd(summary); this.onState({ on: false }); return summary;
  }
}
module.exports = { Focus };
