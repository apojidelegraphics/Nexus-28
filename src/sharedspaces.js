// Shared Spaces on the Mac (v1.9): the same study groups as N28C on your phone (public.shared_space_*), in the
// Study panel. Create or join with a code, chat, share a deck, take a friend's deck, see streaks, and ask an agent
// for the group (it runs on this Mac and its answer is posted to the space). Row-level security: only members see a
// space. deps: { cloud, study, runAsk({ agent, text, context, spaceName }) → { ok, text, error, persona, color, name },
//               nick() → your name in spaces, setNick(name) }   (the asking function is passed as runAsk)
const ID = /^[0-9a-f-]{36}$/i;
const clean = (s, n) => String(s ?? '').replace(/\s+$/g, '').slice(0, n);

class SharedSpaces {
  constructor(deps) { Object.assign(this, deps); }
  me() { const id = this.cloud.session?.user?.id; if (!id) throw new Error('Sign in to your Nexus account first (Settings → Account).'); return id; }
  id(x) { if (!ID.test(String(x))) throw new Error('Unknown space.'); return String(x); }
  one(r) { return Array.isArray(r) ? r[0] : r; }

  async list() {
    this.me();
    const spaces = await this.cloud.authedGet('shared_spaces?select=id,name,code,color,owner,created_at&order=created_at');
    return { spaces, me: this.me(), nick: this.nick() };
  }
  async create({ name, nick, color }) {
    name = clean(name, 40).trim(); if (!name) throw new Error('Give the space a name.');
    if (nick) this.setNick(nick);
    const s = this.one(await this.cloud.write('POST', 'rpc/create_shared_space', { p_name: name, p_nickname: this.nick(), p_color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#3dffa0' }));
    return { space: s };
  }
  async join({ code, nick }) {
    code = String(code || '').replace(/\s/g, '').toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Codes are 6 letters and numbers.');
    if (nick) this.setNick(nick);
    return { space: this.one(await this.cloud.write('POST', 'rpc/join_shared_space', { p_code: code, p_nickname: this.nick() })) };
  }
  async feed(id) {
    id = this.id(id);
    const [space, posts, members] = await Promise.all([
      this.cloud.authedGet(`shared_spaces?select=id,name,code,color,owner&id=eq.${id}`),
      this.cloud.authedGet(`shared_space_posts?select=id,user_id,nickname,kind,content,data,created_at&space_id=eq.${id}&order=created_at.desc&limit=80`),
      this.cloud.authedGet(`shared_space_members?select=user_id,nickname,streak,reviewed_today,stats_day&space_id=eq.${id}`)]);
    if (!space[0]) throw new Error('That space is gone, or you left it.');
    return { space: space[0], posts: posts.reverse(), members, me: this.me() };
  }
  async post(id, { kind = 'msg', content, data = {} }) {
    id = this.id(id); this.me();
    if (!['msg', 'deck', 'ai'].includes(kind)) throw new Error('Bad post.');
    content = clean(content, kind === 'ai' ? 12000 : 4000); if (!content.trim()) throw new Error('Write something first.');
    await this.cloud.write('POST', 'shared_space_posts', { space_id: id, nickname: clean(kind === 'ai' ? data.by || this.nick() : this.nick(), 40), kind, content, data }, 'return=minimal');
    return {};
  }
  async ask(id, { text, agent }) {
    const f = await this.feed(id);
    await this.post(id, { content: text });
    const context = f.posts.filter(p => p.kind === 'msg' || p.kind === 'ai').slice(-8).map(p => `${p.nickname}: ${String(p.content).slice(0, 300)}`).join('\n');
    const r = await this.ask_({ agent, text, context, spaceName: f.space.name });
    if (!r.ok) throw new Error(r.error || 'The agent could not answer.');
    await this.post(id, { kind: 'ai', content: r.text, data: { agent: r.persona, color: r.color || '', q: String(text).slice(0, 300), by: `${r.name} · for ${this.nick()}` } });
    return { text: r.text };
  }
  async shareDeck(id, deckId) {
    const d = this.study.decks().find(x => x.id === deckId); if (!d) throw new Error('That deck is gone.');
    const cards = this.study.cards(deckId).slice(0, 150).map(c => ({ front: c.front.slice(0, 400), back: c.back.slice(0, 600) }));
    if (!cards.length) throw new Error('That deck has no cards yet.');
    await this.post(id, { kind: 'deck', content: d.name.slice(0, 60), data: { cards } });
    return { shared: cards.length };
  }
  async takeDeck(id, postId) {
    id = this.id(id);
    const p = (await this.cloud.authedGet(`shared_space_posts?select=content,data,kind&space_id=eq.${id}&id=eq.${this.id(postId)}`))[0];
    if (!p || p.kind !== 'deck') throw new Error('That deck post is gone.');
    const r = this.study.addCards({ name: p.content }, (p.data?.cards || []).slice(0, 200), { source: { via: 'shared-space' } });
    return { added: r.added, deck: r.deck?.name };
  }
  async leave(id) { id = this.id(id); await this.cloud.write('DELETE', `shared_space_members?space_id=eq.${id}&user_id=eq.${this.me()}`, undefined, 'return=minimal'); return {}; }
  async remove(id) { id = this.id(id); await this.cloud.write('DELETE', `shared_spaces?id=eq.${id}&owner=eq.${this.me()}`, undefined, 'return=minimal'); return {}; }
  async rename(nick) { this.setNick(nick); await this.cloud.write('PATCH', `shared_space_members?user_id=eq.${this.me()}`, { nickname: this.nick() }, 'return=minimal'); return { nick: this.nick() }; }
  // Your streak + today's reviews, shown to your friends (all your spaces at once).
  async updateStats() {
    const st = this.study.stats();
    await this.cloud.write('PATCH', `shared_space_members?user_id=eq.${this.me()}`, { streak: st.streak || 0, reviewed_today: st.reviewedToday || 0, stats_day: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }, 'return=minimal');
  }
}
// "ask" is a dep name and a method name; keep the dep reachable.
Object.defineProperty(SharedSpaces.prototype, 'ask_', { get() { return this.runAsk; } });

module.exports = { SharedSpaces };
