// Direct connection to N28C over Tailscale (v2.3). With it on, your phone talks straight to this Mac
// (https://<this-mac>.<tailnet>.ts.net:10000) instead of leaving messages in Supabase for the Mac to pick up:
// answers start right away, and your questions, photos and answers never sit in the cloud on the way.
// If the phone can't reach the Mac (Tailscale off, another network), N28C quietly uses the Supabase relay.
//
// Who can use it: only requests that came through your tailnet (Tailscale-User-Login) AND carry a Nexus sign-in
// for the same account that's signed in on this Mac.
//   deps: { tailnet, cloud, ask(row) → {ok,text,error,agent,model}, request(row) → object, version, agents(),
//           publish({url,version}) (tells N28C where to find this Mac), onState(state), port, httpsPort, fetch }
const http = require('http');

const PORT = 47130, HTTPS_PORT = 10000;   // Apoji Admin's hub uses 8443, so both can run on one Mac
const ORIGINS = ['https://apojidelegraphics.github.io'];

class Direct {
  constructor(o) {
    Object.assign(this, { port: PORT, httpsPort: HTTPS_PORT, onState: () => {}, publish: async () => {}, agents: () => [], version: '', fetch: globalThis.fetch }, o);
    this.server = null; this.tokens = new Map();
    this.state = { on: false, listening: false, serving: false, url: '', tailscale: { installed: false, running: false }, error: '', handled: 0, lastAt: 0 };
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.onState(this.state); }

  async start() {
    this.set({ on: true });
    const ts = await this.tailnet.status(); this.set({ tailscale: ts });
    if (!(await this.listen())) return this.state;
    if (ts.running && ts.dnsName) {
      const r = await this.tailnet.serve(this.httpsPort, this.port);
      this.set({ serving: r.ok, url: r.ok ? `https://${ts.dnsName}:${this.httpsPort}` : '', error: r.error });
    } else this.set({ serving: false, url: '', error: '' });
    await this.publish({ url: this.state.url, version: this.version }).catch(() => {});
    return this.state;
  }
  async stop() {
    if (this.state.serving) await this.tailnet.unserve(this.httpsPort);
    await new Promise(r => this.server ? this.server.close(() => r()) : r()); this.server = null;
    this.set({ on: false, listening: false, serving: false, url: '' });
    await this.publish({ url: '', version: this.version }).catch(() => {});
    return this.state;
  }
  // Tailscale came back, the Mac woke up, etc.
  async refresh() { if (!this.state.on) { this.set({ tailscale: await this.tailnet.status() }); return this.state; } return this.start(); }

  listen() {
    if (this.server) return Promise.resolve(true);
    return new Promise(ok => {
      const s = http.createServer((q, r) => this.handle(q, r).catch(e => this.send(r, 500, { ok: false, error: e.message })));
      s.on('error', e => { this.set({ listening: false, error: e.code === 'EADDRINUSE' ? `Port ${this.port} is busy (is Nexus open twice?)` : e.message }); ok(false); });
      s.listen(this.port, '127.0.0.1', () => { this.server = s; this.set({ listening: true }); ok(true); });
    });
  }

  // The phone's Nexus sign-in must be for the account signed in here
  async verify(token) {
    const me = this.cloud.session?.user?.id; if (!token || !me || token.length > 4096) return false;
    const hit = this.tokens.get(token); if (hit && hit.until > Date.now()) return hit.id === me;
    try {
      const r = await this.fetch(`${this.cloud.url}/auth/v1/user`, { headers: { apikey: this.cloud.key, Authorization: 'Bearer ' + token } });
      if (!r.ok) return false;
      const u = await r.json(); this.tokens.set(token, { id: u.id, until: Date.now() + 5 * 60e3 });
      if (this.tokens.size > 50) this.tokens.delete(this.tokens.keys().next().value);
      return u.id === me;
    } catch { return false; }
  }
  cors(req, res) {
    const o = req.headers.origin;
    if (o && ORIGINS.includes(o)) {
      res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Max-Age', '600');
      if (req.headers['access-control-request-private-network']) res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    return !o || ORIGINS.includes(o);
  }
  send(res, code, obj) { if (res.headersSent) return; res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(obj)); }
  body(req) {
    return new Promise((ok, bad) => { let n = 0; const c = []; req.on('data', d => { n += d.length; if (n > 12 * 1024 * 1024) { bad(Object.assign(new Error('too_big'), { code: 413 })); req.destroy(); } else c.push(d); });
      req.on('end', () => { try { ok(c.length ? JSON.parse(Buffer.concat(c)) : {}); } catch { bad(Object.assign(new Error('bad_json'), { code: 400 })); } }); });
  }
  async handle(req, res) {
    if (!this.cors(req, res)) return this.send(res, 403, { ok: false, error: 'origin' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const p = new URL(req.url, 'http://x').pathname;
    if (!req.headers['tailscale-user-login']) return this.send(res, 403, { ok: false, error: 'tailnet_only' });
    if (req.method === 'GET' && p === '/') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end("Nexus '28 is connected to N28C over Tailscale. Open N28C on your phone."); }
    if (!(await this.verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')))) return this.send(res, 401, { ok: false, error: 'sign_in' });
    try {
      if (req.method === 'GET' && p === '/n28c/ping') return this.send(res, 200, { ok: true, app: 'nexus-direct', version: this.version, agents: this.agents() });
      if (req.method !== 'POST') return this.send(res, 404, { ok: false, error: 'not_found' });
      const b = await this.body(req);
      if (p === '/n28c/ask') {
        const file = b.file && typeof b.file.data === 'string' ? { name: String(b.file.name || 'photo.jpg').slice(0, 120), mime: String(b.file.mime || 'image/jpeg').slice(0, 60), data: b.file.data } : null;
        const row = { id: 'direct-' + Date.now(), kind: 'ask', agent: String(b.agent || ''), content: String(b.content || '').slice(0, 8000), meta: b.meta && typeof b.meta === 'object' ? b.meta : {}, file, direct: true };
        let r; try { r = await this.ask(row); } catch (e) { r = { ok: false, error: e.message }; }
        this.set({ handled: this.state.handled + 1, lastAt: Date.now() });
        return this.send(res, 200, { ok: !!r.ok, text: r.text || '', error: r.error || '', agent: r.agent || row.agent, model: r.model || '' });
      }
      if (p === '/n28c/request') {
        const row = { id: 'direct-' + Date.now(), kind: 'request', content: String(b.op || ''), meta: { ...(b.meta && typeof b.meta === 'object' ? b.meta : {}), op: String(b.op || '') } };
        let r; try { r = { ok: true, ...(await this.request(row)) }; } catch (e) { r = { ok: false, error: e.message }; }
        return this.send(res, 200, r);
      }
      return this.send(res, 404, { ok: false, error: 'not_found' });
    } catch (e) { return this.send(res, e.code || 500, { ok: false, error: e.message }); }
  }
}
module.exports = { Direct, PORT, HTTPS_PORT, ORIGINS };
