// Chat history: a list of conversations shared by the HUD, Quick Chat and Quick Ask.
// `activeId` is the chat window's chat. Quick Chat and Quick Ask write to their own chat by id,
// so each window can be on a different conversation.
const fs = require('fs');
const path = require('path');

const MAX_CONVOS = 200;
const MAX_MSGS = 400;
const MAX_VERSIONS = 8;
const SPACE_COLORS = ['#3dffa0', '#5ce1ff', '#c3a6ff', '#ffd36b', '#ff8fa3', '#8affc1', '#ffb38a', '#9ad0ff'];
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
    if (this.data && !Array.isArray(this.data.spaces)) this.data.spaces = [];
    if (!this.data || !Array.isArray(this.data.list)) {
      this.data = { activeId: null, list: [], spaces: [] };
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
      spaces: d.spaces,
      list: d.list.filter(c => c.messages.length).sort((a, b) => b.updated - a.updated).map(c => ({
        id: c.id, title: c.title, updated: c.updated, count: c.messages.filter(m => !m.hidden).length, spaceId: c.spaceId || null,
        links: c.links || [], kind: c.kind || '', pinned: c.pinned || 0,
        personas: [...new Set(c.messages.filter(m => m.persona).map(m => m.persona))]
      }))
    };
  }

  // ---------- Spaces (chat folders)
  space(id) { return this.load().spaces.find(s => s.id === id) || null; }
  addSpace({ name, color, agent = '', builtin = '' } = {}) {
    const d = this.load();
    const sp = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(name || 'New space').trim().slice(0, 32) || 'New space',
      color: color || SPACE_COLORS[d.spaces.length % SPACE_COLORS.length], agent, links: [], ...(builtin ? { builtin } : {}) };
    d.spaces.push(sp); this.save();
    return sp;
  }
  // Built-in spaces (Routines, Missions) are created the first time they're needed.
  ensureSpace(builtin, defaults) {
    return this.load().spaces.find(s => s.builtin === builtin) || this.addSpace({ ...defaults, builtin });
  }
  updateSpace(id, patch = {}) {
    const sp = this.space(id); if (!sp) return null;
    if (patch.name !== undefined) sp.name = String(patch.name).trim().slice(0, 32) || sp.name;
    if (patch.color !== undefined) sp.color = patch.color;
    if (patch.agent !== undefined) sp.agent = patch.agent;
    if (patch.links !== undefined) sp.links = [...new Set(patch.links)].slice(0, 6);
    this.save(); return sp;
  }
  removeSpace(id) {
    const d = this.load();
    d.spaces = d.spaces.filter(s => s.id !== id);
    for (const c of d.list) if (c.spaceId === id) c.spaceId = null;
    this.save();
  }
  moveToSpace(convId, spaceId) {
    const c = this.get(convId); if (!c) return null;
    c.spaceId = spaceId && this.space(spaceId) ? spaceId : null;
    this.save(); return c;
  }
  // Chats linked to a chat (pinned): their digest goes along with every message in that chat.
  setLinks(convId, links) {
    const c = this.get(convId); if (!c) return null;
    c.links = [...new Set((links || []).filter(id => id !== convId && this.get(id)))].slice(0, 6);
    this.save(); return c;
  }
  get(id) { return this.load().list.find(c => c.id === id) || null; }
  active() {
    const d = this.load();
    let c = this.get(d.activeId);
    if (!c) { c = this.create(); }
    return c;
  }
  create({ activate = true, spaceId = null, title = 'New chat', kind = '' } = {}) {
    const d = this.load();
    const cur = this.get(d.activeId);
    if (activate && cur && !cur.messages.length && !kind) { cur.spaceId = spaceId && this.space(spaceId) ? spaceId : null; this.save(); return cur; } // reuse an empty chat
    const c = { id: newId(), title, created: Date.now(), updated: Date.now(), messages: [], spaceId: spaceId && this.space(spaceId) ? spaceId : null, ...(kind ? { kind } : {}) };
    d.list.push(c);
    if (activate) d.activeId = c.id;
    // Drop empty leftovers and cap history size.
    d.list = d.list.filter(x => x.messages.length || x.id === c.id || x.id === d.activeId);
    if (d.list.length > MAX_CONVOS) d.list = d.list.sort((a, b) => b.updated - a.updated).slice(0, MAX_CONVOS);
    this.save();
    return c;
  }
  select(id) {
    const d = this.load();
    if (this.get(id)) { d.activeId = id; this.save(); }
    return this.active();
  }
  // Append to a specific chat. id: a chat id, null/undefined = the chat window's chat, 'new' = a fresh chat
  // that doesn't change what the chat window shows (Quick Ask / Quick Chat "New chat").
  appendTo(id, msg, { spaceId = null } = {}) {
    let c = id && id !== 'new' ? this.get(id) : null;
    if (!c) c = id ? this.create({ activate: false, spaceId }) : this.active();
    return this._push(c, msg);
  }
  append(msg) { return this._push(this.active(), msg); }
  _push(c, msg) {
    c.messages.push({ ...msg, ts: msg.ts || Date.now() });
    if (c.messages.length > MAX_MSGS) c.messages = c.messages.slice(-MAX_MSGS);
    if (c.title === 'New chat' && msg.role === 'user') c.title = titleFrom(msg.content);
    c.updated = Date.now();
    this.save();
    return c;
  }
  // Regenerate: keep every answer for the last reply and show the newest. Returns the chat.
  addVersion(id, msg) {
    const c = (id && this.get(id)) || this.active();
    const last = c.messages[c.messages.length - 1];
    const strip = m => { const { versions, v, ts, ...rest } = m; return rest; };
    if (!last || last.role !== 'assistant') return this._push(c, msg);
    const versions = (last.versions || [strip(last)]).concat([strip(msg)]).slice(-MAX_VERSIONS);
    c.messages[c.messages.length - 1] = { ...strip(msg), ts: Date.now(), versions, v: versions.length - 1 };
    c.updated = Date.now();
    this.save();
    return c;
  }
  setVersion(id, index) {
    const c = (id && this.get(id)) || this.active();
    const last = c.messages[c.messages.length - 1];
    if (!last?.versions || !last.versions[index]) return c;
    c.messages[c.messages.length - 1] = { ...last.versions[index], ts: last.ts, versions: last.versions, v: index };
    this.save();
    return c;
  }
  rename(id, title) {
    const c = this.get(id);
    if (c && title.trim()) { c.title = title.trim().slice(0, 80); this.save(); }
    return c;
  }
  // Pinned chats stay at the top of your chat list (Mac and phone).
  pin(id, on = true) {
    const c = this.get(id);
    if (c) { if (on) c.pinned = Date.now(); else delete c.pinned; this.save(); }
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
    this.data = { activeId: null, list: [], spaces: this.load().spaces };
    this.save();
    return this.active();
  }
}

module.exports = { Conversations, titleFrom, SPACE_COLORS };
