// Nexus cloud (Supabase).
// • Agent prompts sync from public.assistant_prompts (public read), cached locally, refreshed every 10 min.
// • Optional sign-in with a Nexus account (Supabase Auth, email + password). The refresh token is kept
//   encrypted in the Keychain by the caller; access tokens live only in memory.
// • Announcements + maintenance banners from the web Nexus.
// Plain REST (no SDK): the publishable key is meant to ship in clients; RLS protects the data.

const DEFAULT_URL = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co';
const DEFAULT_KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';
// aARgon3 & Mexel store backend (orders for redemption). Publishable key: safe to ship.
const STORE_URL = 'https://yuergfrpfhtcxjkcgjrx.supabase.co';
const STORE_KEY = 'sb_publishable_tX9wZpRsI3fAlthnz4lQKA_yVdY7768';
const VOID_STATUS = /^(void|voided|refunded|cancel+ed|canceled|deleted)$/i;

// Supabase row name → desktop persona id
const PROMPT_NAMES = {
  'Nexus 28 Paragon': 'paragon',
  'Nexus 28 Neodela': 'neodela',
  'Nexus 28 Lyte': 'lyte',
  'Nexus 28 Flash': 'flash'
};

class NexusCloud {
  constructor({ url = DEFAULT_URL, key = DEFAULT_KEY, storeUrl = STORE_URL, storeKey = STORE_KEY, loadCache, saveCache, loadRefresh, saveRefresh } = {}) {
    this.url = url.replace(/\/+$/, '');
    this.storeUrl = storeUrl.replace(/\/+$/, '');
    this.storeKey = storeKey;
    this._freeKey = null;
    this.key = key;
    this.loadCache = loadCache || (() => null);
    this.saveCache = saveCache || (() => {});
    this.loadRefresh = loadRefresh || (() => '');
    this.saveRefresh = saveRefresh || (() => {});
    this.session = null;            // { accessToken, expiresAt, user }
    this.profile = null;
    const c = this.loadCache() || {};
    this.prompts = c.prompts || {};  // personaId -> { prompt, features, updatedAt, name }
    this.legacy = c.legacy || [];    // other assistants: [{ name, prompt, features, updatedAt }]
    this.extras = {};                // usage / redemptions / moderation for the signed-in user
    this.lastSync = c.lastSync || 0;
    this.announcements = c.announcements || [];
    this.maintenance = c.maintenance || [];
    this.flags = c.flags || [];      // feature_flags rows (beta channel)
    this.lastError = '';
  }

  headers(auth = false) {
    const h = { apikey: this.key, 'Content-Type': 'application/json' };
    if (auth && this.session?.accessToken) h.Authorization = `Bearer ${this.session.accessToken}`;
    return h;
  }
  async rest(path, { auth = false } = {}) {
    const res = await fetch(`${this.url}/rest/v1/${path}`, { headers: this.headers(auth) });
    if (!res.ok) throw new Error(`Nexus cloud ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.json();
  }

  // ---------- Free Nexus key (same OpenRouter key the web Nexus uses). Kept in memory only.
  async freeKey() {
    if (this._freeKey && Date.now() - this._freeKey.at < 3600e3) return this._freeKey.key;
    try {
      const rows = await this.rest('app_content?select=content&key=eq.openrouter_api_key');
      const key = String(rows[0]?.content || '').trim();
      this._freeKey = key ? { key, at: Date.now() } : null;
      return key || null;
    } catch { return this._freeKey?.key || null; }
  }

  // ---------- aARgon3 / Mexel orders
  async storeRest(path) {
    const res = await fetch(`${this.storeUrl}/rest/v1/${path}`, { headers: { apikey: this.storeKey } });
    if (!res.ok) throw new Error(`Order lookup failed (${res.status}).`);
    return res.json();
  }
  async lookupOrders(ids) {
    if (!ids.length) return [];
    const list = ids.map(i => `"${String(i).replace(/"/g, '')}"`).join(',');
    // Only order id, plan, status, config and item names are read — never customer details.
    return this.storeRest(`orders?select=order_id,plan_type,status,config,items&order_id=in.(${encodeURIComponent(list)})`);
  }
  async redeem(orderId) {
    await this.ensureFresh();
    if (!this.session) throw new Error('Sign in to redeem an order.');
    const id = String(orderId || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,}-[A-Z0-9]{2,}$/.test(id)) throw new Error('That doesn\'t look like an order number (example: MRH33QFL-RA6C).');
    const [order] = await this.lookupOrders([id]);
    if (!order) throw new Error('No aARgon3 or Mexel order has that number.');
    if (VOID_STATUS.test(order.status || '')) throw new Error(`That order is ${String(order.status).toLowerCase()} and can't be redeemed.`);
    const cfg = order.config || {};
    const res = await fetch(`${this.url}/rest/v1/redemptions`, {
      method: 'POST', headers: { ...this.headers(true), Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: this.session.user.id, order_id: id, tier: order.plan_type || null, config_os: cfg.os || null, config_chip: cfg.chip || null, config_network: cfg.connection || null, config_service_tier: cfg.service_tier || null })
    });
    if (res.status === 409 || /duplicate|unique/i.test(await res.clone().text())) {
      await this.loadExtras();
      if ((this.extras.redemptions || []).some(r => r.orderId === id)) throw new Error('You already redeemed that order.');
      throw new Error('That order was already redeemed on another account.');
    }
    if (!res.ok) throw new Error(`Couldn't redeem (${res.status}).`);
    await this.loadExtras();
    return { orderId: id, plan: order.plan_type, models: (order.items || []).map(i => i.model) };
  }

  // ---------- Chat usage (web-synced limits)
  usageFor(name) { return (this.extras.usage || []).find(u => u.assistant === name)?.count || 0; }
  async incrementUsage(name) {
    if (!this.session) return null;
    await this.ensureFresh();
    const next = this.usageFor(name) + 1;
    const res = await fetch(`${this.url}/rest/v1/chat_usage?on_conflict=user_id,assistant_name`, {
      method: 'POST', headers: { ...this.headers(true), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: this.session.user.id, assistant_name: name, count: next })
    }).catch(() => null);
    if (res && res.ok) {
      const u = (this.extras.usage = this.extras.usage || []).find(x => x.assistant === name);
      u ? (u.count = next) : this.extras.usage.push({ assistant: name, count: next });
    }
    return next;
  }

  // ---------- Public content
  async sync() {
    try {
      const [rows, ann, maint, flags] = await Promise.all([
        this.rest('assistant_prompts?select=name,prompt,features,updated_at'),
        this.rest('announcements?select=id,message,created_at&active=eq.true&order=created_at.desc&limit=5').catch(() => []),
        this.fetchMaintenance(),
        this.rest('feature_flags?select=key,stage,title,description,min_version').catch(() => null) // table may not exist yet
      ]);
      if (Array.isArray(flags)) this.flags = flags;
      const prompts = {}, legacy = [];
      for (const r of rows) {
        if (!r.prompt) continue;
        const id = PROMPT_NAMES[r.name];
        const entry = { name: r.name, prompt: r.prompt, features: Array.isArray(r.features) ? r.features : [], updatedAt: r.updated_at };
        if (id) prompts[id] = entry; else legacy.push(entry);
      }
      this.prompts = prompts;
      this.legacy = legacy;
      this.announcements = ann.map(a => ({ id: a.id, message: a.message, createdAt: a.created_at }));
      this.maintenance = maint;
      this.lastSync = Date.now();
      this.lastError = '';
      this.saveCache({ prompts: this.prompts, legacy: this.legacy, lastSync: this.lastSync, announcements: this.announcements, maintenance: this.maintenance, flags: this.flags });
    } catch (e) {
      this.lastError = /fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|SOCKET|ETIMEDOUT/i.test(`${e.cause?.code || ''} ${e.message}`) ? 'Offline — using cached prompts.' : e.message;
    }
    return this.state();
  }

  // Maintenance switches that are on (v2.2 adds ends_at + admin_bypass; older databases still work).
  async fetchMaintenance() {
    let rows;
    try { rows = await this.rest('maintenance_config?select=scope,enabled,message,types,ends_at,admin_bypass'); }
    catch (e) { if (!/\b(400|42703)\b|ends_at|admin_bypass/.test(e.message)) return this.maintenance || []; rows = await this.rest('maintenance_config?select=scope,enabled,message,types').catch(() => null); if (!rows) return this.maintenance || []; }
    return rows.filter(m => m.enabled === true || m.enabled === 'true' || m.enabled?.enabled === true)
      .map(m => ({ scope: String(m.scope), message: m.message || '', endsAt: m.ends_at || null, adminBypass: m.admin_bypass !== false, type: Array.isArray(m.types) && m.types[0] ? String(m.types[0]) : 'update' }));
  }
  // Quick check every minute for maintenance + announcements (the full sync runs every 10 minutes).
  async syncLive() {
    try {
      const [maint, ann] = await Promise.all([this.fetchMaintenance(), this.rest('announcements?select=id,message,created_at&active=eq.true&order=created_at.desc&limit=5').catch(() => null)]);
      const before = JSON.stringify([this.maintenance, this.announcements]);
      this.maintenance = maint;
      if (ann) this.announcements = ann.map(a => ({ id: a.id, message: a.message, createdAt: a.created_at }));
      return JSON.stringify([this.maintenance, this.announcements]) !== before;
    } catch { return false; }
  }
  isAdmin() { return !!this.profile?.admin; }
  // Suspended / banned (suspensions that ended don't count)
  moderation() { return require('./maintenance').activeModeration(this.extras?.moderation); }
  async rpc(fn, args = {}) { return this.write('POST', `rpc/${fn}`, args); }
  // Tells the dashboard this account used the app today (and gets fresh suspension info back).
  async logActivity(source, version) {
    if (!this.session) return null;
    try { const r = await this.rpc('log_activity', { p_source: source, p_version: String(version || '') }); if (r && 'moderation' in r) this.extras = { ...this.extras, moderation: r.moderation }; return r; }
    catch { return null; }
  }
  // Profile picture: public "avatars" bucket, your own folder. bytes: Buffer/Uint8Array (already square + small).
  async uploadAvatar(bytes, mime = 'image/png') {
    if (!this.session) throw new Error('Sign in to your Nexus account first.');
    await this.ensureFresh();
    const uid = this.session.user.id, ext = mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : 'png';
    const res = await fetch(`${this.url}/storage/v1/object/avatars/${uid}/avatar.${ext}`, { method: 'POST', headers: { apikey: this.key, Authorization: `Bearer ${this.session.accessToken}`, 'Content-Type': mime, 'x-upsert': 'true', 'cache-control': '3600' }, body: Buffer.from(bytes) });
    if (!res.ok) { const t = await res.text(); throw new Error(/bucket|not found/i.test(t) ? 'Profile pictures need the v2.2 Supabase SQL.' : `Upload failed (${res.status}).`); }
    const url = `${this.url}/storage/v1/object/public/avatars/${uid}/avatar.${ext}?v=${Date.now()}`;
    await this.write('PATCH', `profiles?id=eq.${encodeURIComponent(uid)}`, { avatar_url: url }, 'return=minimal');
    if (this.profile) this.profile.avatar = url;
    return url;
  }
  async removeAvatar() {
    if (!this.session) return;
    await this.write('PATCH', `profiles?id=eq.${encodeURIComponent(this.session.user.id)}`, { avatar_url: null }, 'return=minimal');
    if (this.profile) this.profile.avatar = '';
  }
  // Your app theme on your profile, so the admin portal (and anything else) can match it.
  async saveTheme(theme) {
    if (!this.session || !this.profile) return false;
    const j = JSON.stringify(theme); if (j === this._themeSent) return true;
    try { await this.write('PATCH', `profiles?id=eq.${encodeURIComponent(this.session.user.id)}`, { theme }, 'return=minimal'); this._themeSent = j; return true; } catch { return false; }
  }

  // Banners relevant to this app (global/desktop scopes, or an agent's own scope).
  maintenanceFor(personaId) {
    return this.maintenance.filter(m => ['global', 'all', 'app', 'desktop', personaId, `nexus 28 ${personaId}`].includes(String(m.scope).toLowerCase()));
  }
  // Features taken offline by feature-level maintenance (scope = feature name).
  featuresDown() { return this.maintenance.map(m => m.scope.toLowerCase().replace(/[^a-z0-9]/g, '')); }

  // ---------- Auth
  async auth(path, body) {
    const res = await fetch(`${this.url}/auth/v1/${path}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error_description || j.msg || j.message || `Sign-in failed (${res.status})`);
    return j;
  }
  async adopt(j) {
    this.session = { accessToken: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user?.id, email: j.user?.email } };
    this.saveRefresh(j.refresh_token || '');
    await this.loadProfile();
    return this.account();
  }
  async signIn(email, password) {
    if (!email || !password) throw new Error('Enter your email and password.');
    return this.adopt(await this.auth('token?grant_type=password', { email: email.trim(), password }));
  }
  async restore() {
    const rt = this.loadRefresh();
    if (!rt) return this.account();
    try { return await this.adopt(await this.auth('token?grant_type=refresh_token', { refresh_token: rt })); }
    catch (e) {
      if (/invalid|expired|not found|revoked/i.test(e.message)) this.saveRefresh('');
      this.lastError = e.message;
      return this.account();
    }
  }
  async ensureFresh() {
    if (this.session && Date.now() > this.session.expiresAt - 60000) await this.restore();
  }
  async signOut() {
    if (this.session?.accessToken) {
      fetch(`${this.url}/auth/v1/logout`, { method: 'POST', headers: this.headers(true) }).catch(() => {});
    }
    this.session = null; this.profile = null; this.extras = {};
    this.saveRefresh('');
    return this.account();
  }
  async signUp(email, password, username) {
    if (!email || !password) throw new Error('Enter an email and password.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    const j = await this.auth('signup', { email: email.trim(), password, data: { username: (username || '').trim() } });
    if (j.access_token) { await this.adopt(j); return { confirmed: true, account: this.account() }; }
    return { confirmed: false, account: this.account() }; // email confirmation required
  }
  async resetPassword(email) {
    if (!email) throw new Error('Enter your email first.');
    await this.auth('recover', { email: email.trim() });
    return true;
  }
  async updateUser(body) {
    await this.ensureFresh();
    if (!this.session) throw new Error('Sign in first.');
    const res = await fetch(`${this.url}/auth/v1/user`, { method: 'PUT', headers: this.headers(true), body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error_description || j.msg || j.message || `Update failed (${res.status})`);
    if (j.email) this.session.user.email = j.email;
    return j;
  }
  async changeEmail(email) {
    if (!/^\S+@\S+\.\S+$/.test(String(email || '').trim())) throw new Error('Enter a valid email.');
    const j = await this.updateUser({ email: email.trim() });
    return { pending: !!j.new_email || j.email !== email.trim(), account: this.account() };
  }
  async changePassword(password) {
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
    await this.updateUser({ password });
    return this.account();
  }
  async changeUsername(username) {
    await this.ensureFresh();
    if (!this.session) throw new Error('Sign in first.');
    const name = String(username || '').trim();
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) throw new Error('Usernames are 3–24 characters: letters, numbers, _ . -');
    const uid = encodeURIComponent(this.session.user.id);
    // Only the username column is ever written from the desktop app.
    const exists = !!this.profile;
    const res = await fetch(`${this.url}/rest/v1/profiles${exists ? `?id=eq.${uid}` : ''}`, {
      method: exists ? 'PATCH' : 'POST',
      headers: { ...this.headers(true), Prefer: 'return=representation' },
      body: JSON.stringify(exists ? { username: name } : { id: this.session.user.id, username: name })
    });
    if (res.status === 409 || /duplicate|unique/i.test(await res.clone().text())) throw new Error('That username is taken.');
    if (!res.ok) throw new Error(`Couldn't save username (${res.status}).`);
    await this.loadProfile();
    return this.account();
  }
  async loadExtras() {
    if (!this.session) { this.extras = {}; return; }
    const uid = encodeURIComponent(this.session.user.id);
    const [usage, redemptions, moderation] = await Promise.all([
      this.rest(`chat_usage?select=assistant_name,count,updated_at&user_id=eq.${uid}`, { auth: true }).catch(() => []),
      this.rest(`redemptions?select=order_id,tier,redeemed_at&user_id=eq.${uid}&order=redeemed_at.desc`, { auth: true }).catch(() => []),
      this.rest(`user_moderation?select=status,reason,suspended_until&user_id=eq.${uid}`, { auth: true }).catch(() => [])
    ]);
    let orders = [];
    try {
      const found = await this.lookupOrders(redemptions.map(r => r.order_id));
      orders = found.map(o => ({ orderId: o.order_id, plan: o.plan_type, items: (o.items || []).map(i => ({ model: i.model })) }));
    } catch {}
    this.extras = {
      orders,
      usage: usage.map(u => ({ assistant: u.assistant_name, count: u.count })),
      redemptions: redemptions.map(r => ({ orderId: r.order_id, tier: r.tier, at: r.redeemed_at })),
      moderation: moderation[0] && moderation[0].status !== 'active' ? moderation[0] : null
    };
  }

  async loadProfile() {
    if (!this.session) return null;
    try {
      const uid = encodeURIComponent(this.session.user.id);
      let rows;
      // `nickname` is optional (added for v1.2); older databases without the column still work.
      if (this.nicknameColumn !== false) {
        try { rows = await this.rest(`profiles?select=username,nickname,is_beta_tester,is_comped,created_at&id=eq.${uid}`, { auth: true }); this.nicknameColumn = true; }
        catch (e) { if (/\b(400|42703)\b|nickname/i.test(e.message)) this.nicknameColumn = false; else throw e; }
      }
      if (!rows) rows = await this.rest(`profiles?select=username,is_beta_tester,is_comped,created_at&id=eq.${uid}`, { auth: true });
      this.profile = rows[0] ? { username: rows[0].username, beta: !!rows[0].is_beta_tester, comped: !!rows[0].is_comped, since: rows[0].created_at,
        ...(rows[0].nickname !== undefined ? { nickname: rows[0].nickname || '' } : {}) } : null;
      // Profile picture (v2.2 column; older databases just don't have one)
      if (this.profile) { const av = await this.rest(`profiles?select=avatar_url&id=eq.${uid}`, { auth: true }).catch(() => null); this.profile.avatar = av?.[0]?.avatar_url || ''; }
      // Admins (public.admin_roles; you can read your own row).
      if (this.profile) {
        const roles = await this.rest(`admin_roles?select=level&user_id=eq.${uid}`, { auth: true }).catch(() => []);
        if (roles[0]?.level) this.profile.admin = String(roles[0].level);
      }
    } catch { this.profile = null; }
    await this.loadExtras();
    return this.profile;
  }

  // Preferred nickname → profiles.nickname, when that column exists. Returns false if it can't be synced.
  async changeNickname(nickname) {
    if (!this.session || !this.profile || this.nicknameColumn !== true) return false;
    await this.ensureFresh();
    const res = await fetch(`${this.url}/rest/v1/profiles?id=eq.${encodeURIComponent(this.session.user.id)}`, {
      method: 'PATCH', headers: { ...this.headers(true), Prefer: 'return=minimal' },
      body: JSON.stringify({ nickname: String(nickname || '').trim().slice(0, 40) || null })
    }).catch(() => null);
    if (!res || !res.ok) return false;
    this.profile.nickname = String(nickname || '').trim().slice(0, 40);
    return true;
  }

  // Authenticated writes (RLS decides what's allowed).
  async write(method, path, body, prefer = 'return=representation') {
    if (!this.session) throw new Error('Sign in to your Nexus account first.');
    await this.ensureFresh();
    const res = await fetch(`${this.url}/rest/v1/${path}`, { method, headers: { ...this.headers(true), Prefer: prefer }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new Error(`Nexus cloud ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  async authedGet(path) { if (!this.session) throw new Error('Not signed in.'); await this.ensureFresh(); return this.rest(path, { auth: true }); }

  account() {
    if (!this.session) return { signedIn: false };
    return { signedIn: true, email: this.session.user.email, hasProfile: !!this.profile, ...(this.profile || {}), ...this.extras };
  }
  state() {
    return {
      account: this.account(),
      lastSync: this.lastSync,
      lastError: this.lastError,
      synced: Object.fromEntries(Object.entries(this.prompts).map(([id, p]) => [id, { name: p.name, updatedAt: p.updatedAt, features: p.features }])),
      legacyCount: this.legacy.length,
      announcements: this.announcements,
      maintenance: this.maintenance
    };
  }
}

module.exports = { NexusCloud, PROMPT_NAMES, DEFAULT_URL, STORE_URL };
