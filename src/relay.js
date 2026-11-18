// Phone companion relay (v1.7, beta). Your phone (the GitHub Pages companion) writes questions into
// public.relay_messages for your account; this Mac picks them up, answers with the agent you picked, and writes the
// reply back. Row-level security keeps every row private to your account. Nothing runs unless you're signed in,
// the feature is on for you, and you turned it on.
//   deps: { cloud, handle(row) → Promise<{ ok, text, error, agent, model }>, enabled(), version, agents(), now, device() }
// 3.7: more than one computer (a Mac and a PC) can be linked. Each one sends its own heartbeat with
// meta.device { id, name, platform }. The phone can pick a computer (meta.device on the ask = that id) or leave it on
// Auto. A computer answers asks meant for it, Auto asks, and asks for a computer that's been offline 2+ minutes.
// Taking an ask is atomic (PATCH … handled_at=is.null), so two computers never answer the same thing.
const STALE = 150e3;
class Relay {
  constructor({ cloud, fast = () => false, handle, onRequest = async () => { throw new Error('Not supported.'); }, enabled = () => false, version = '', agents = () => [], interval = 4000, beat = 60000, now = () => Date.now(), onState = () => {}, device = () => ({ id: 'this', name: 'This computer', platform: process.platform }) }) {
    Object.assign(this, { cloud, fast, handle, onRequest, enabled, version, agents, interval, beat, now, onState, device });
    this.peers = new Map(); this.peersAt = 0;
    this.timer = null; this.busy = false; this.lastBeat = 0;
    this.state = { status: 'off', error: '', handled: 0, lastAt: 0 };
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.onState(this.state); }
  // v2.1: polls every ~1.2 s while the phone app is open (it says so), and every `interval` otherwise.
  start() { if (this.timer) return; this.timer = true; const loop = async () => { if (!this.timer) return; await this.poll(); this.timer = setTimeout(loop, this.fast?.() ? 1200 : this.interval); }; this.timer = setTimeout(loop, 1500); }
  stop() { clearTimeout(this.timer); this.timer = null; }
  async poll() {
    if (this.busy) return;
    if (!this.enabled() || !this.cloud.session) { if (this.state.status !== 'off') this.set({ status: 'off' }); return; }
    this.busy = true;
    try {
      if (this.now() - this.lastBeat > this.beat) await this.heartbeat();
      const rows = await this.cloud.authedGet('relay_messages?select=id,kind,agent,content,meta,created_at&direction=eq.to_desktop&handled_at=is.null&order=created_at.asc&limit=10');
      if (this.state.status !== 'online' || this.state.error) this.set({ status: 'online', error: '' });
      if (rows.some(r => r.meta?.device && r.meta.device !== this.device().id)) await this.loadPeers();
      for (const row of rows) {
        if (!this.mine(row)) continue;
        const got = await this.cloud.write('PATCH', `relay_messages?id=eq.${row.id}&handled_at=is.null`, { handled_at: new Date(this.now()).toISOString(), meta: { ...(row.meta || {}), handledBy: this.device().id } }, 'return=representation');
        if (Array.isArray(got) && !got.length) continue;     // another computer took it first
        if (row.kind === 'request') {
          let res;
          try { res = { ok: true, ...(await this.onRequest(row)) }; } catch (e) { res = { ok: false, error: e.message }; }
          await this.cloud.write('POST', 'relay_messages', { direction: 'to_phone', kind: res.ok ? 'data' : 'error', agent: '', content: JSON.stringify(res).slice(0, 19000), reply_to: row.id, meta: { op: row.meta?.op || '', device: this.device() } }, 'return=minimal');
          continue;
        }
        if (row.kind !== 'ask') continue;
        this.set({ status: 'answering' });
        let r;
        try { r = await this.handle(row); } catch (e) { r = { ok: false, error: e.message }; }
        await this.cloud.write('POST', 'relay_messages', { direction: 'to_phone', kind: r.ok ? 'reply' : 'error', agent: r.agent || row.agent || '', content: String(r.ok ? r.text || '(no reply)' : r.error || 'Something went wrong.').slice(0, 19000), reply_to: row.id, meta: { model: r.model || '', device: this.device(), ...(r.convId ? { convId: r.convId } : {}) } }, 'return=minimal');
        this.set({ status: 'online', handled: this.state.handled + 1, lastAt: this.now() });
      }
    } catch (e) {
      const missing = /relay_messages|42P01|PGRST20|404/.test(e.message);
      this.set({ status: 'error', error: missing ? 'The phone relay isn\'t set up in the Nexus database yet.' : e.message });
    } finally { this.busy = false; }
  }
  // Is this ask for this computer? Auto asks and asks for this one: yes. For another computer: only if it's gone quiet.
  mine(row) {
    const want = row.meta?.device, me = this.device().id;
    if (!want || want === 'auto' || want === me) return true;
    const seen = this.peers.get(want);
    return !seen || this.now() - seen > STALE || this.now() - Date.parse(row.created_at || 0) > STALE;
  }
  async loadPeers() {
    if (this.now() - this.peersAt < 20e3) return; this.peersAt = this.now();
    const st = await this.cloud.authedGet('relay_messages?select=meta,created_at&direction=eq.to_phone&kind=eq.status&order=created_at.desc&limit=30').catch(() => []);
    this.peers.clear();
    for (const r of st) { const id = r.meta?.device?.id; if (id && !this.peers.has(id)) this.peers.set(id, Date.parse(r.created_at)); }
  }
  // "Mac is online" for the phone, plus the agents it can use. Old status rows are cleaned up.
  async heartbeat() {
    this.lastBeat = this.now();
    await this.cloud.write('POST', 'relay_messages', { direction: 'to_phone', kind: 'status', content: 'online', meta: { version: this.version, agents: this.agents(), device: this.device() } }, 'return=minimal');
    const cutoff = new Date(this.now() - 10 * 60e3).toISOString();
    await this.cloud.write('DELETE', `relay_messages?direction=eq.to_phone&kind=eq.status&created_at=lt.${encodeURIComponent(cutoff)}`, undefined, 'return=minimal').catch(() => {});
  }
}
module.exports = { Relay, STALE };
