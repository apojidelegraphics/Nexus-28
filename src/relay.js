// Phone companion relay (v1.7, beta). Your phone (the GitHub Pages companion) writes questions into
// public.relay_messages for your account; this Mac picks them up, answers with the agent you picked, and writes the
// reply back. Row-level security keeps every row private to your account. Nothing runs unless you're signed in,
// the feature is on for you, and you turned it on.
//   deps: { cloud, handle(row) → Promise<{ ok, text, error, agent, model }>, enabled(), version, agents(), now }
class Relay {
  constructor({ cloud, handle, enabled = () => false, version = '', agents = () => [], interval = 4000, beat = 60000, now = () => Date.now(), onState = () => {} }) {
    Object.assign(this, { cloud, handle, enabled, version, agents, interval, beat, now, onState });
    this.timer = null; this.busy = false; this.lastBeat = 0;
    this.state = { status: 'off', error: '', handled: 0, lastAt: 0 };
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.onState(this.state); }
  start() { if (!this.timer) { this.timer = setInterval(() => this.poll(), this.interval); setTimeout(() => this.poll(), 1500); } }
  stop() { clearInterval(this.timer); this.timer = null; }
  async poll() {
    if (this.busy) return;
    if (!this.enabled() || !this.cloud.session) { if (this.state.status !== 'off') this.set({ status: 'off' }); return; }
    this.busy = true;
    try {
      if (this.now() - this.lastBeat > this.beat) await this.heartbeat();
      const rows = await this.cloud.authedGet('relay_messages?select=id,kind,agent,content,created_at&direction=eq.to_desktop&handled_at=is.null&order=created_at.asc&limit=5');
      if (this.state.status !== 'online' || this.state.error) this.set({ status: 'online', error: '' });
      for (const row of rows) {
        await this.cloud.write('PATCH', `relay_messages?id=eq.${row.id}`, { handled_at: new Date(this.now()).toISOString() }, 'return=minimal');
        if (row.kind !== 'ask') continue;
        this.set({ status: 'answering' });
        let r;
        try { r = await this.handle(row); } catch (e) { r = { ok: false, error: e.message }; }
        await this.cloud.write('POST', 'relay_messages', { direction: 'to_phone', kind: r.ok ? 'reply' : 'error', agent: r.agent || row.agent || '', content: String(r.ok ? r.text || '(no reply)' : r.error || 'Something went wrong.').slice(0, 19000), reply_to: row.id, meta: { model: r.model || '' } }, 'return=minimal');
        this.set({ status: 'online', handled: this.state.handled + 1, lastAt: this.now() });
      }
    } catch (e) {
      const missing = /relay_messages|42P01|PGRST20|404/.test(e.message);
      this.set({ status: 'error', error: missing ? 'The phone relay isn\'t set up in the Nexus database yet.' : e.message });
    } finally { this.busy = false; }
  }
  // "Mac is online" for the phone, plus the agents it can use. Old status rows are cleaned up.
  async heartbeat() {
    this.lastBeat = this.now();
    await this.cloud.write('POST', 'relay_messages', { direction: 'to_phone', kind: 'status', content: 'online', meta: { version: this.version, agents: this.agents() } }, 'return=minimal');
    const cutoff = new Date(this.now() - 10 * 60e3).toISOString();
    await this.cloud.write('DELETE', `relay_messages?direction=eq.to_phone&kind=eq.status&created_at=lt.${encodeURIComponent(cutoff)}`, undefined, 'return=minimal').catch(() => {});
  }
}
module.exports = { Relay };
