// Chat history: a list of conversations shared by the HUD, Quick Chat and Quick Ask.
const fs = require('fs');
const path = require('path');

const MAX_CONVOS = 200;
const MAX_MSGS = 400;
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function titleFrom(text) {
  const t = String(text || '').replace(/@\w+\s*/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  return t.length > 48 ? t.slice(0, 46).replace(/\s+\S*$/, '') + '…' : t;
}

class Conversations {
  constructor(dir) {
    this.file = path.join(dir, 'conversations.json');
    this.legacy = path.join(dir, 'history.json');
    this.data = null;
  }
  load() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = null; }
    if (!this.data || !Array.isArray(this.data.list)) {
      this.data = { activeId: null, list: [] };
      // Migrate the older single-history file into the first conversation.
      try {
        const old = JSON.parse(fs.readFileSync(this.legacy, 'utf8'));
        if (Array.isArray(old) && old.length) {
          const firstUser = old.find(m => m.role === 'user');
          const c = { id: newId(), title: titleFrom(firstUser?.content), created: old[0].ts || Date.now(), updated: old[old.length - 1].ts || Date.now(), messages: old };
          this.data.list.push(c); this.data.activeId = c.id;
        }
      } catch {}
    }
    return this.data;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
  summary() {
    const d = this.load();
    return {
      activeId: d.activeId,
      list: d.list.filter(c => c.messages.length).sort((a, b) => b.updated - a.updated).map(c => ({
        id: c.id, title: c.title, updated: c.updated, count: c.messages.length,
        personas: [...new Set(c.messages.filter(m => m.persona).map(m => m.persona))]
      }))
    };
  }
  get(id) { return this.load().list.find(c => c.id === id) || null; }
  active() {
    const d = this.load();
    let c = this.get(d.activeId);
    if (!c) { c = this.create(); }
    return c;
  }
  create() {
    const d = this.load();
    const cur = this.get(d.activeId);
    if (cur && !cur.messages.length) return cur; // reuse an empty chat
    const c = { id: newId(), title: 'New chat', created: Date.now(), updated: Date.now(), messages: [] };
    d.list.push(c); d.activeId = c.id;
    // Drop empty leftovers and cap history size.
    d.list = d.list.filter(x => x.messages.length || x.id === c.id);
    if (d.list.length > MAX_CONVOS) d.list = d.list.sort((a, b) => b.updated - a.updated).slice(0, MAX_CONVOS);
    this.save();
    return c;
  }
  select(id) {
    const d = this.load();
    if (this.get(id)) { d.activeId = id; this.save(); }
    return this.active();
  }
  append(msg) {
    const c = this.active();
    c.messages.push({ ...msg, ts: msg.ts || Date.now() });
    if (c.messages.length > MAX_MSGS) c.messages = c.messages.slice(-MAX_MSGS);
    if (c.title === 'New chat' && msg.role === 'user') c.title = titleFrom(msg.content);
    c.updated = Date.now();
    this.save();
    return c;
  }
  rename(id, title) {
    const c = this.get(id);
    if (c && title.trim()) { c.title = title.trim().slice(0, 80); this.save(); }
    return c;
  }
  remove(id) {
    const d = this.load();
    d.list = d.list.filter(c => c.id !== id);
    if (d.activeId === id) d.activeId = d.list.sort((a, b) => b.updated - a.updated)[0]?.id || null;
    this.save();
    return this.active();
  }
  clearAll() {
    this.data = { activeId: null, list: [] };
    this.save();
    return this.active();
  }
}

module.exports = { Conversations, titleFrom };
