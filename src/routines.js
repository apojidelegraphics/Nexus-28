// Routines: prompts that run on a schedule (plus the built-in Morning Brief), while Nexus is running.
// Missed runs (Mac asleep or off) run once when Nexus next checks — never several times to catch up.
//   routine: { id, kind: 'routine' | 'brief', name, prompt, agent, schedule, enabled, speak, convId,
//              created, lastRun, lastStatus, lastError, nextRun }
const fs = require('fs');
const path = require('path');
const { nextRun, describe, shortName } = require('./schedule');

const newId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const BRIEF_DEFAULT = {
  id: 'brief', kind: 'brief', name: 'Morning Brief', agent: 'flash', enabled: false, speak: false,
  schedule: { type: 'daily', time: '07:30' },
  sections: { weather: true, calendar: true, reminders: true, gmail: true, headlines: true, announcements: true, usage: true },
  topics: ''
};

class Routines {
  // run(routine) → Promise<{ ok, error?, convId? }>; isLocked() → true while the screen is locked
  constructor({ dir, run, now = () => Date.now(), isLocked = () => false, onChange = () => {} }) {
    this.file = path.join(dir, 'routines.json');
    this.run = run; this.now = now; this.isLocked = isLocked; this.onChange = onChange;
    this.running = new Set();
    this.items = null;
  }
  load() {
    if (this.items) return this.items;
    try { this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    if (!this.items.some(r => r.kind === 'brief')) this.items.unshift({ ...BRIEF_DEFAULT, created: this.now() });
    const b = this.items.find(r => r.kind === 'brief');
    b.sections = { ...BRIEF_DEFAULT.sections, ...(b.sections || {}) };
    return this.items;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.items, null, 2));
    fs.renameSync(this.file + '.tmp', this.file);
    this.onChange(this.list());
  }
  list() {
    return this.load().map(r => ({ ...r, when: describe(r.schedule), running: this.running.has(r.id) }));
  }
  get(id) { return this.load().find(r => r.id === id) || null; }
  brief() { return this.load().find(r => r.kind === 'brief'); }

  upsert(patch) {
    const items = this.load();
    let r = patch.id ? items.find(x => x.id === patch.id) : null;
    if (!r) {
      if (!String(patch.prompt || '').trim()) throw new Error('Tell the routine what to do.');
      r = { id: newId(), kind: 'routine', name: '', prompt: '', agent: 'flash', schedule: { type: 'daily', time: '08:00' }, enabled: true, speak: false, created: this.now() };
      items.push(r);
    }
    for (const k of ['name', 'prompt', 'agent', 'enabled', 'speak', 'schedule', 'sections', 'topics', 'convId']) if (patch[k] !== undefined) r[k] = patch[k];
    if (r.kind === 'routine') { r.prompt = String(r.prompt || '').trim().slice(0, 2000); r.name = String(r.name || '').trim().slice(0, 48) || shortName(r.prompt); }
    r.nextRun = r.enabled ? nextRun(r.schedule, this.now()) : null;
    if (r.schedule?.type === 'once' && !r.nextRun) r.enabled = false;
    this.save();
    return r;
  }
  remove(id) {
    const items = this.load();
    if (items.find(r => r.id === id)?.kind === 'brief') throw new Error("The Morning Brief can be turned off, but not deleted.");
    this.items = items.filter(r => r.id !== id);
    this.save();
  }

  async runNow(id, why = 'manual') {
    const r = this.get(id);
    if (!r) throw new Error('No such routine.');
    if (this.running.has(id)) return { ok: false, error: 'Already running.' };
    this.running.add(id); this.onChange(this.list());
    let res;
    try { res = await this.run(r, why); } catch (e) { res = { ok: false, error: e.message }; }
    this.running.delete(id);
    r.lastRun = this.now(); r.lastStatus = res.ok ? 'ok' : 'error'; r.lastError = res.ok ? '' : res.error || 'Failed';
    if (res.convId) r.convId = res.convId;
    this.save();
    return res;
  }

  // Run everything that's due. A routine due while the Mac slept runs once, then moves to its next time.
  async tick() {
    const now = this.now();
    const due = this.load().filter(r => r.enabled && r.nextRun && r.nextRun <= now && !this.running.has(r.id));
    for (const r of due) {
      if (r.kind === 'brief' && this.isLocked()) continue; // wait until you're back at the Mac
      r.nextRun = nextRun(r.schedule, now);
      if (r.schedule?.type === 'once') r.enabled = false;
      this.save();
      this.runNow(r.id, 'schedule');
    }
    return due.length;
  }
  start(ms = 30000) { this.load(); this.refreshAll(); this.timer = setInterval(() => this.tick(), ms); setTimeout(() => this.tick(), 4000); }
  stop() { clearInterval(this.timer); }
  // Recompute next times (e.g. after the clock or time zone changed), keeping anything already due.
  refreshAll() {
    const now = this.now();
    for (const r of this.load()) if (r.enabled && !(r.nextRun && r.nextRun <= now)) r.nextRun = nextRun(r.schedule, now);
    this.save();
  }
}

module.exports = { Routines, BRIEF_DEFAULT };
