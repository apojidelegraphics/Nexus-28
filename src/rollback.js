// Rollback (v2.6): every change an agent makes on your Mac is written down with a way to undo it.
//   Undoable: calendar events and reminders it created, the volume, dark mode, the clipboard.
//   Logged but not undoable: opening apps/links/files, running Shortcuts, media keys, timers.
// "Undo what you did this afternoon" → undoSince(time). Kept on this Mac (rollback.json), last 300 actions.
//   deps: { file, helper (EventKit), getVolume(), setVolume(v, muted), getDark(), setDark(on), clipboard: { readText, writeText }, now }
const fs = require('fs');

const LABEL = { calendar_create_event: 'Created a calendar event', reminders_create: 'Created a reminder', set_volume: 'Changed the volume', dark_mode: 'Changed dark mode',
  copy_to_clipboard: 'Replaced your clipboard', open_app: 'Opened an app', open_url: 'Opened a link', open_file: 'Opened a file', run_shortcut: 'Ran a Shortcut', media_control: 'Controlled music', set_timer: 'Started a timer' };
const TRACKED = new Set(Object.keys(LABEL));

class Rollback {
  constructor({ file, helper = null, getVolume, setVolume, getDark, setDark, clipboard, now = () => Date.now() }) {
    Object.assign(this, { file, helper, getVolume, setVolume, getDark, setDark, clipboard, now });
    this.list = null;
  }
  load() { if (this.list) return this.list; try { this.list = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.list = []; } if (!Array.isArray(this.list)) this.list = []; return this.list; }
  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.list.slice(0, 300))); } catch {} }
  tracked(name) { return TRACKED.has(name); }

  // Before a change: remember how things were
  async before(name) {
    try {
      if (name === 'set_volume' && this.getVolume) return { volume: await this.getVolume() };
      if (name === 'dark_mode' && this.getDark) return { dark: await this.getDark() };
      if (name === 'copy_to_clipboard' && this.clipboard) return { clip: String(this.clipboard.readText() || '').slice(0, 200000) };
    } catch {}
    return null;
  }
  // After it worked: write it down
  after(name, args = {}, result = {}, prior = null, { persona = '', convId = '' } = {}) {
    if (!TRACKED.has(name)) return null;
    let undo = null;
    if (result?.undo?.cmd) undo = { ...result.undo };
    else if (name === 'set_volume' && prior?.volume) undo = { kind: 'volume', ...prior.volume };
    else if (name === 'dark_mode' && typeof prior?.dark === 'boolean') undo = { kind: 'dark', on: prior.dark };
    else if (name === 'copy_to_clipboard' && prior && typeof prior.clip === 'string') undo = { kind: 'clip', text: prior.clip };
    const detail = name === 'calendar_create_event' || name === 'reminders_create' ? String(args.title || '') : name === 'set_volume' ? (args.mute != null ? (args.mute ? 'muted' : 'unmuted') : `${args.level}%`)
      : name === 'dark_mode' ? (args.on == null ? 'toggled' : args.on ? 'on' : 'off') : name === 'copy_to_clipboard' ? `${String(args.text || '').length} characters` : String(args.name || args.url || args.path || args.action || args.label || '');
    const e = { id: 'r' + this.now().toString(36) + Math.random().toString(36).slice(2, 5), at: this.now(), tool: name, label: LABEL[name], detail: detail.slice(0, 120), persona, convId, undo, undone: false };
    this.load().unshift(e); this.save();
    return e;
  }
  entries({ since = 0, persona = '' } = {}) { return this.load().filter(e => e.at >= since && (!persona || e.persona === persona)); }

  async undoOne(id) {
    const e = this.load().find(x => x.id === id);
    if (!e) return { ok: false, error: 'Not found.' };
    if (e.undone) return { ok: true, already: true };
    if (!e.undo) return { ok: false, error: `“${e.label}” can't be undone automatically.` };
    const u = e.undo;
    try {
      if (u.cmd === 'cal_delete' || u.cmd === 'rem_delete') {
        if (!this.helper?.available?.()) throw new Error('Needs the NexusCore helper.');
        const r = await this.helper.request({ id: 'rb-' + e.id, cmd: u.cmd, eventId: u.eventId, itemId: u.itemId }, ['result'], 20000);
        e.result = r?.data?.gone ? 'It was already gone.' : 'Removed.';
      } else if (u.kind === 'volume') await this.setVolume(u.level, u.muted);
      else if (u.kind === 'dark') await this.setDark(u.on);
      else if (u.kind === 'clip') this.clipboard.writeText(u.text);
      else throw new Error('Unknown undo.');
    } catch (err) { return { ok: false, error: err.message }; }
    e.undone = true; e.undoneAt = this.now(); this.save();
    return { ok: true, entry: e };
  }
  // Newest first, so things go back in the right order
  async undoSince(since, { persona = '' } = {}) {
    const todo = this.entries({ since, persona }).filter(e => e.undo && !e.undone);
    const done = [], failed = [];
    for (const e of todo) { const r = await this.undoOne(e.id); (r.ok ? done : failed).push({ label: e.label, detail: e.detail, error: r.error || '' }); }
    const skipped = this.entries({ since, persona }).filter(e => !e.undo && !e.undone).map(e => ({ label: e.label, detail: e.detail }));
    return { done, failed, skipped };
  }
}
module.exports = { Rollback, LABEL };
