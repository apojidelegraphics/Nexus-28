// Phone companion data (v1.7.1). The Mac publishes a read-only snapshot to public.companion_sync for your account
// (row-level security: only you can read it): agents (incl. classic models), your chat list, a chat you open,
// flashcard decks, stats, routines. The phone asks for actions through the relay (kind 'request'), and the Mac does
// them here. Nothing is published unless the phone companion is on.
//   deps: { cloud, convos, study, metrics, routines, personas(), nameOf(id), runRoutine(id), wrap(), brief(), newPhoneChat(), version }
const MAX_CHATS = 150, MAX_MSGS = 80, MSG_CHARS = 6000, MAX_CARDS = 800;

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

class Companion {
  constructor(deps) {
    Object.assign(this, deps);
    this.timer = null; this.dirty = new Set(); this.last = {}; this.openChats = [];
  }
  async put(key, data) {
    await this.cloud.write('POST', 'companion_sync?on_conflict=user_id,key', { key, data, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
    this.last[key] = Date.now();
  }
  async drop(key) { await this.cloud.write('DELETE', `companion_sync?key=eq.${encodeURIComponent(key)}`, undefined, 'return=minimal').catch(() => {}); }

  // ---------- snapshots
  status() {
    const m = this.metrics.summary();
    const agents = this.personas().map(p => ({ id: p.id, name: p.name, handle: p.handle, color: p.color, tag: p.tag || '', legacy: !!p.legacy, agentic: !!p.agentic, features: (p.features || []).slice(0, 40) }));
    return { version: this.version, at: Date.now(), agents,
      stats: { points: m.points, streak: m.streak, bestStreak: m.bestStreak, chats: m.chats, achievements: m.achievements.filter(a => a.unlocked).length, achievementsTotal: m.achievements.length,
        recent: m.achievements.filter(a => a.unlocked).sort((a, b) => b.unlocked - a.unlocked).slice(0, 6).map(a => ({ icon: a.icon, name: a.name })) },
      challenge: m.challenge ? { icon: m.challenge.icon, text: m.challenge.text, progress: m.challenge.progress, n: m.challenge.n, done: m.challenge.done, streak: m.challenge.streak, bonus: m.challenge.bonus } : null,
      routines: this.routines.list().map(r => ({ id: r.id, kind: r.kind, name: r.name, when: r.when, enabled: !!r.enabled, lastRun: r.lastRun || 0, running: !!r.running })),
      study: this.study.stats() };
  }
  chats() {
    const sum = this.convos.summary();
    const spaces = Object.fromEntries((sum.spaces || []).map(s => [s.id, { name: s.name, color: s.color }]));
    return { at: Date.now(), list: sum.list.slice(0, MAX_CHATS).map(c => {
      const conv = this.convos.get(c.id);
      const last = [...(conv?.messages || [])].reverse().find(m => !m.hidden && m.content);
      return { id: c.id, title: c.title, updated: c.updated, count: c.count, kind: c.kind, personas: c.personas, space: c.spaceId ? spaces[c.spaceId] || null : null,
        preview: clip(String(last?.content || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|]/g, '').replace(/\s+/g, ' ').trim(), 110) };
    }) };
  }
  chat(id) {
    const c = this.convos.get(id);
    if (!c) return null;
    const msgs = c.messages.filter(m => !m.hidden).slice(-MAX_MSGS);
    return { id: c.id, title: c.title, kind: c.kind || '', updated: c.updated, total: c.messages.filter(m => !m.hidden).length,
      messages: msgs.map(m => ({ role: m.role, persona: m.persona || '', content: clip(m.content, MSG_CHARS), ts: m.ts || 0, model: m.model || '', error: !!m.error, via: m.via || '',
        features: m.features || [], sources: (m.sources || []).slice(0, 5), attachments: (m.attachments || []).map(a => ({ name: a.name, kind: a.kind })) })) };
  }
  studyData() {
    const decks = this.study.decks();
    let n = 0;
    const cards = [];
    for (const d of decks) for (const c of this.study.cards(d.id)) { if (n++ >= MAX_CARDS) break; cards.push({ id: c.id, deckId: c.deckId, front: clip(c.front, 400), back: clip(c.back, 800), due: c.due || 0, reps: c.reps || 0, lapses: c.lapses || 0, interval: c.interval || 0, preview: this.study.preview(c) }); }
    return { at: Date.now(), decks: decks.map(d => ({ id: d.id, name: d.name, color: d.color, total: d.total, due: d.due, fresh: d.fresh, mastered: d.mastered })), cards, stats: this.study.stats() };
  }

  // Publish what changed (status always). Called after changes (debounced) and every 2 minutes.
  async publish(keys = ['status', 'chats', 'study']) {
    if (!this.cloud.session) return;
    for (const k of keys) {
      const data = k === 'status' ? this.status() : k === 'chats' ? this.chats() : k === 'study' ? this.studyData() : null;
      if (data) await this.put(k, data);
    }
    for (const id of this.openChats) { const c = this.chat(id); if (c) await this.put('chat:' + id, c); }
  }
  mark(...keys) { keys.forEach(k => this.dirty.add(k)); clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 2500); }
  async flush() { const keys = [...this.dirty]; this.dirty.clear(); if (keys.length && this.enabled()) await this.publish(keys).catch(() => {}); }
  async openChat(id) {
    this.openChats = [id, ...this.openChats.filter(x => x !== id)];
    const old = this.openChats.splice(4);            // keep at most 4 open chats synced
    for (const o of old) await this.drop('chat:' + o);
    const c = this.chat(id);
    if (!c) throw new Error('That chat is gone.');
    await this.put('chat:' + id, c);
    return { id };
  }

  // ---------- actions from the phone (relay kind 'request', meta.op)
  async request(row) {
    const meta = row.meta || {};
    switch (meta.op) {
      case 'sync': await this.publish(); return { ok: true };
      case 'open_chat': await this.openChat(String(meta.id)); return { ok: true, id: meta.id };
      case 'new_chat': { const id = this.newPhoneChat(); await this.publish(['chats']); return { ok: true, id }; }
      case 'review': {
        this.study.review(String(meta.cardId), +meta.grade);
        this.mark('study', 'status');
        return { ok: true };
      }
      case 'run_routine': {
        const r = this.routines.get(String(meta.id));
        if (!r) throw new Error('No such routine.');
        this.runRoutine(r.id).then(() => this.mark('chats', 'status'));
        return { ok: true, started: r.name };
      }
      case 'rename_chat': { if (this.convos.rename(String(meta.id), String(meta.title || '').slice(0, 80))) this.mark('chats'); return { ok: true }; }
      default: throw new Error(`Unknown request "${meta.op}".`);
    }
  }
}

module.exports = { Companion, MAX_CHATS, MAX_MSGS };
