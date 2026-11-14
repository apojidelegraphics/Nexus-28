// Phone notifications (v1.8). The N28C phone app subscribes with Web Push and saves its subscription in
// companion_sync (key "push:<device>"). This Mac sends the notifications itself (no server): answers ready,
// missions done, routines, Shared Space posts, a study reminder and an evening streak-saver at times you pick.
// VAPID keys are made once per Mac and kept in the encrypted key store. Nothing is sent unless the phone companion is on.
//   deps: { cloud, getSettings(), setSettings(patch), getSecret(), setSecret(obj), webpush, now }  (VAPID keys live in the encrypted key store)
const KINDS = ['replies', 'missions', 'routines', 'spaces', 'study', 'streak'];
const DEFAULT_PREFS = { replies: true, missions: true, routines: true, spaces: true, study: '19:00', streak: '20:30' };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanPrefs(p = {}) {
  const out = { ...DEFAULT_PREFS };
  for (const k of ['replies', 'missions', 'routines', 'spaces']) if (p[k] !== undefined) out[k] = !!p[k];
  for (const k of ['study', 'streak']) if (p[k] !== undefined) out[k] = TIME.test(String(p[k])) ? String(p[k]) : '';
  return out;
}
const hm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

class Push {
  constructor({ cloud, getSettings, setSettings, getSecret = () => ({}), setSecret = () => {}, webpush, now = () => Date.now() }) {
    Object.assign(this, { cloud, getSettings, setSettings, getSecret, setSecret, now });
    // webpush may be the module or a function that loads it (loaded on the first push, for a faster start).
    let wp = typeof webpush === 'function' && !webpush.sendNotification ? null : webpush;
    Object.defineProperty(this, 'webpush', { get: () => wp || (wp = webpush()) });
    this.subs = null; this.subsAt = 0;
  }
  phone() { return this.getSettings().phone || {}; }
  prefs() { return cleanPrefs(this.phone().notify); }
  setPrefs(p) { const notify = cleanPrefs({ ...this.prefs(), ...p }); this.setSettings({ phone: { ...this.phone(), notify } }); return notify; }
  keys() {
    let v = this.getSecret();
    if (!v?.publicKey || !v?.privateKey) { v = this.webpush.generateVAPIDKeys(); this.setSecret(v); }
    return v;
  }
  publicKey() { return this.keys().publicKey; }

  async subscriptions(force) {
    if (!force && this.subs && this.now() - this.subsAt < 60e3) return this.subs;
    const rows = await this.cloud.authedGet('companion_sync?select=key,data,updated_at&key=like.push:*');
    this.subs = rows.filter(r => r.data?.sub?.endpoint && /^https:\/\//.test(r.data.sub.endpoint));
    this.subsAt = this.now();
    return this.subs;
  }
  // Is the phone app open right now? (it says so every ~30 s while you look at it)
  async phoneLooking() {
    try { const r = await this.cloud.authedGet('companion_sync?select=data&key=eq.seen'); return this.now() - (r[0]?.data?.at || 0) < 45e3; } catch { return false; }
  }

  // kind: one of KINDS. msg: { title, body, tag, url }. Returns how many phones got it.
  async send(kind, msg, { evenIfLooking = false } = {}) {
    if (!this.cloud.session) return 0;
    const pr = this.prefs();
    if (kind in pr && !pr[kind]) return 0;
    if (this.isMuted?.() && !['test', 'mac', 'focus'].includes(kind) && !(kind === 'routines' && msg.tag === 'focus')) return 0;   // Focus timer: the phone stays quiet too
    if (!evenIfLooking && kind === 'replies' && await this.phoneLooking()) return 0;
    const subs = await this.subscriptions();
    if (!subs.length) return 0;
    const v = this.keys();
    const payload = JSON.stringify({ title: String(msg.title || 'N28C').slice(0, 80), body: String(msg.body || '').replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180),
      tag: msg.tag || kind, url: msg.url || './', kind, silent: !!msg.silent });
    let sent = 0;
    for (const s of subs) {
      try {
        await this.webpush.sendNotification(s.data.sub, payload, { TTL: 3600, urgency: kind === 'replies' ? 'high' : 'normal',
          vapidDetails: { subject: 'https://github.com/apojidelegraphics/Nexus-28', publicKey: v.publicKey, privateKey: v.privateKey } });
        sent++;
      } catch (e) {
        if ([404, 410].includes(e.statusCode)) { await this.cloud.write('DELETE', `companion_sync?key=eq.${encodeURIComponent(s.key)}`, undefined, 'return=minimal').catch(() => {}); this.subs = null; }
      }
    }
    return sent;
  }

  // Called every minute: study reminder and streak-saver at the times you picked (once a day each).
  // info: { due, challengeDone, challengeText }
  async tick(info) {
    const pr = this.prefs(), d = new Date(this.now()), now = hm(d), day = dayKey(d);
    const sent = { ...(this.phone().sent || {}) };
    const fire = [];
    if (pr.study && now >= pr.study && sent.study !== day && info.due > 0)
      fire.push(['study', { title: '📚 Time to study', body: `${info.due} card${info.due === 1 ? ' is' : 's are'} due. A few minutes keeps your streak going.`, tag: 'study', url: './#study' }]);
    if (pr.streak && now >= pr.streak && sent.streak !== day && info.challengeDone === false)
      fire.push(['streak', { title: "🔥 Don't lose your streak", body: `Today's challenge: ${info.challengeText || 'not done yet'}.`, tag: 'streak', url: './#you' }]);
    // Mark as sent only when the time window passed (so a Mac that was asleep at 7:00 still reminds at 7:40, once).
    for (const [k] of fire) sent[k] = day;
    if (pr.study && now >= pr.study && sent.study !== day && !(info.due > 0)) sent.study = day;          // nothing due: skip today
    if (pr.streak && now >= pr.streak && sent.streak !== day && info.challengeDone !== false) sent.streak = day;
    if (JSON.stringify(sent) !== JSON.stringify(this.phone().sent || {})) this.setSettings({ phone: { ...this.phone(), sent } });
    for (const [k, m] of fire) await this.send(k, m).catch(() => {});
    return fire.map(f => f[0]);
  }
}

module.exports = { Push, cleanPrefs, DEFAULT_PREFS, KINDS };
