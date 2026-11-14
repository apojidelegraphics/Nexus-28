// Phone companion data (v1.7.1). The Mac publishes a read-only snapshot to public.companion_sync for your account
// (row-level security: only you can read it): agents (incl. classic models), your chat list, a chat you open,
// flashcard decks, stats, routines. The phone asks for actions through the relay (kind 'request'), and the Mac does
// them here. Nothing is published unless the phone companion is on.
//   deps: { cloud, settings(), push, actions: { clipGet, clipSet, inbox, missionStart, missionEnd, missionState, templates, makeDeck, patchWidget }, convos, study, metrics, routines, personas(), nameOf(id), runRoutine(id), wrap(), brief(), newPhoneChat(), version }
const MAX_CHATS = 150, MAX_MSGS = 80, MSG_CHARS = 6000, MAX_CARDS = 800;

// Desktop themes for the phone (mirrors renderer/themes.css; custom themes come from Settings → Theme editor).
const THEMES = {
  green: ['Nexus Green', '#3dffa0', '#00c27a', '#04100b', '#dcffee', '#6fa88e'], arc: ['Arc Reactor', '#5ce1ff', '#2a7dff', '#060e18', '#d8f6ff', '#6f97a8'],
  critical: ['Critical', '#ff4d5e', '#ff8a3d', '#140608', '#ffe2e4', '#a8767b'], amber: ['LentOS Classic', '#ffb547', '#ff7b2e', '#120c04', '#ffeccc', '#a8916b'],
  nebula: ['Nebula', '#b18cff', '#ff6bd6', '#0e081a', '#efe6ff', '#9a88b8'], rose: ['Rose Quartz', '#ff8fb8', '#ffc1a8', '#1a0a10', '#ffe9f0', '#b78a9a'],
  glacier: ['Glacier', '#9fe7ff', '#ffffff', '#0e1822', '#f2fbff', '#8fa9b8'], graphite: ['Graphite', '#d6dde6', '#8f9aa8', '#101113', '#f1f3f5', '#8d939b'],
  synthwave: ['Synthwave', '#ff4fd8', '#36e6ff', '#12061e', '#ffe6fb', '#a585b0'], forest: ['Deep Forest', '#9bd65c', '#e2c46a', '#0a1208', '#eef6e0', '#8fa07a']
};
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function phoneTheme(settings = {}) {
  const id = settings.theme || 'green';
  const c = (settings.customThemes || []).find(t => t.id === id && HEX.test(t.accent || '') && HEX.test(t.bg || ''));
  const [name, accent, accent2, bg, text, muted] = c
    ? [c.name, c.accent, HEX.test(c.accent2 || '') ? c.accent2 : c.accent, c.bg, HEX.test(c.text || '') ? c.text : '#e8f0ff', mix(HEX.test(c.text || '') ? c.text : '#e8f0ff', c.bg, .45)]
    : THEMES[id] || THEMES.green;
  return { id: c ? id : THEMES[id] ? id : 'green', name: String(name).slice(0, 24), accent, accent2, bg, text, muted, rgb: rgb(accent).join(','),
    panel: mix(bg, accent, .07), panel2: mix(bg, accent, .12), onAccent: mix(bg, '#000000', .3), skin: settings.orbSkin || 'aurora' };
}

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
    const sum = this.convos.summary();
    const a = this.actions || {};
    return { version: this.version, at: Date.now(), agents, theme: phoneTheme(this.settings?.() || {}),
      push: this.push ? { key: this.push.publicKey(), prefs: this.push.prefs() } : null,
      spaces: (sum.spaces || []).map(x => ({ id: x.id, name: x.name, color: x.color })),
      mission: a.missionState?.() || null,
      voice: a.ttsLabel ? { label: a.ttsLabel() } : null,
      usable: a.agentsUsable?.() || null,
      templates: (a.templates?.() || []).slice(0, 16).map(t => ({ id: t.id, icon: t.icon || '⚑', name: t.name, goal: t.goal, minutes: t.minutes || 20, fields: (t.fields || []).slice(0, 5) })),
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
      return { id: c.id, title: c.title, updated: c.updated, count: c.count, kind: c.kind, personas: c.personas, pinned: c.pinned || 0, spaceId: c.spaceId || null, space: c.spaceId ? spaces[c.spaceId] || null : null,
        preview: clip(String(last?.content || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|]/g, '').replace(/\s+/g, ' ').trim(), 110) };
    }) };
  }
  chat(id) {
    const c = this.convos.get(id);
    if (!c) return null;
    const msgs = c.messages.filter(m => !m.hidden).slice(-MAX_MSGS);
    return { id: c.id, title: c.title, kind: c.kind || '', updated: c.updated, total: c.messages.filter(m => !m.hidden).length,
      messages: msgs.map(m => ({ role: m.role, persona: m.persona || '', content: clip(m.content, MSG_CHARS), ts: m.ts || 0, model: m.model || '', error: !!m.error, via: m.via || '',
        features: m.features || [], sources: (m.sources || []).slice(0, 5), attachments: (m.attachments || []).map(a => ({ name: a.name, kind: a.kind })), widget: m.widget && JSON.stringify(m.widget).length < 8000 ? m.widget : null })) };
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
      case 'pin_chat': { this.convos.pin(String(meta.id), meta.on !== false); this.mark('chats'); return { ok: true }; }
      case 'move_chat': { this.convos.moveToSpace(String(meta.id), meta.spaceId ? String(meta.spaceId) : null); this.mark('chats'); return { ok: true }; }
      // Flashcards
      case 'make_deck': {
        const r = await this.actions.makeDeck({ topic: String(meta.topic || ''), count: +meta.count || 12, agent: meta.agent ? String(meta.agent) : undefined });
        if (!r.ok) throw new Error(r.error);
        this.mark('study', 'status');
        return { ok: true, deck: r.deck?.name, deckId: r.deck?.id, added: r.added };
      }
      case 'deck_create': { const d = this.study.createDeck({ name: String(meta.name || '') }); this.mark('study'); return { ok: true, deckId: d.id }; }
      case 'add_cards': {
        const cards = (Array.isArray(meta.cards) ? meta.cards : []).slice(0, 200).map(c => ({ front: String(c?.front ?? ''), back: String(c?.back ?? '') })).filter(c => c.front.trim() && c.back.trim());
        if (!cards.length) throw new Error('No cards to add.');
        const deck = meta.deckId ? String(meta.deckId) : { name: String(meta.deck || 'From my phone').slice(0, 60) };
        const r = this.study.addCards(deck, cards, { source: { via: 'phone' } });
        this.mark('study', 'status');
        return { ok: true, added: r.added, deckId: r.deck?.id, deck: r.deck?.name };
      }
      case 'card_edit': { const c = this.study.editCard(String(meta.id), { front: meta.front, back: meta.back }); if (!c) throw new Error('That card is gone.'); this.mark('study'); return { ok: true }; }
      case 'card_delete': { this.study.removeCard(String(meta.id)); this.mark('study', 'status'); return { ok: true }; }
      // Notifications
      case 'set_prefs': { const prefs = this.push.setPrefs(meta.prefs || {}); this.mark('status'); return { ok: true, prefs }; }
      case 'push_test': { const n = await this.push.send('test', { title: 'N28C', body: 'Notifications work. 🎉', tag: 'test' }, { evenIfLooking: true }); return { ok: true, sent: n }; }
      // Clipboard bridge, Send to Mac
      case 'clip_get': return { ok: true, ...(await this.actions.clipGet()) };
      case 'clip_set': { await this.actions.clipSet(String(meta.text ?? '').slice(0, 100000)); return { ok: true }; }
      case 'inbox': return { ok: true, ...(await this.actions.inbox(meta)) };
      // Missions
      case 'mission_start': {
        const r = await this.actions.missionStart({ goal: String(meta.goal || ''), minutes: +meta.minutes || 20, then: Array.isArray(meta.then) ? meta.then.map(String).slice(0, 4) : [] });
        if (!r.ok) throw new Error(r.error);
        const convId = r.state?.convId;
        if (convId) await this.openChat(convId).catch(() => {});
        this.mark('status', 'chats');
        return { ok: true, convId, title: r.state?.title };
      }
      case 'tts': return { ok: true, ...(await this.actions.tts({ text: String(meta.text || ''), agent: meta.agent ? String(meta.agent) : '' })) };
      case 'huddle': { const r = await this.actions.huddle({ question: String(meta.question || ''), agents: Array.isArray(meta.agents) ? meta.agents.map(String) : [] }); await this.openChat(r.convId).catch(() => {}); this.mark('chats'); return { ok: true, ...r }; }
      case 'debate': { const r = await this.actions.debate({ topic: String(meta.topic || ''), pro: String(meta.pro || ''), con: String(meta.con || ''), judge: String(meta.judge || ''), rounds: +meta.rounds || 2 }); await this.openChat(r.convId).catch(() => {}); this.mark('chats'); return { ok: true, ...r }; }
      case 'scan_deck': { const r = await this.actions.scanDeck({ fileId: String(meta.fileId || ''), count: +meta.count || 12, name: String(meta.name || '') }); this.mark('study', 'status'); return { ok: true, ...r }; }
      case 'cite': return { ok: true, ...(await this.actions.cite({ url: String(meta.url || ''), save: !!meta.save, project: String(meta.project || '') })) };
      case 'routine_enable': { this.actions.routineEnable(String(meta.id), !!meta.on); this.mark('status'); return { ok: true }; }
      case 'outbox_remove': { this.actions.outboxRemove?.(String(meta.id)); return { ok: true }; }
      case 'mission_end': { this.actions.missionEnd(); this.mark('status'); return { ok: true }; }
      // Interactive answers: remember what you did in a widget (quiz answers, checked steps…)
      case 'patch_widget': { this.actions.patchWidget?.({ convId: String(meta.convId), ts: +meta.ts, key: String(meta.key).slice(0, 40), value: meta.value }); return { ok: true }; }
      default: throw new Error(`Unknown request "${meta.op}".`);
    }
  }
}

module.exports = { Companion, phoneTheme, THEMES, MAX_CHATS, MAX_MSGS };
