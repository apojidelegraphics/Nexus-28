// Cirkts (4.0): points become something you spend. You earn them the same ways as points (chats, streaks, challenges,
// focus…); everything in the shop is bought with them and lowers your balance. Your points so far became your balance,
// and orb skins you'd already unlocked stay yours.
//   With a Nexus account the wallet lives in Supabase (cirkts_sync / cirkts_buy, nexus-v4.0.sql), so it's the same on
//   every computer and in N28C. Signed out (or before the SQL runs), it works on this computer and syncs later.
//   createCirkts({ getSettings, setSettings, earned: () => points, cloud, catalog, log }) → { state(), sync(), buy(id), owns(id), equip(patch) }
'use strict';
function createCirkts({ getSettings, setSettings, earned, cloud: cloudIn, catalog, all = () => false, isOwner = () => false, log = () => {} }) {
  // 4.0.1: cloud can be a getter. main made this before the account existed, so it always looked signed out.
  const C = () => (typeof cloudIn === 'function' ? cloudIn() : cloudIn) || null;
  const local = () => ({ spent: 0, owned: [], migrated: false, server: null, equip: {}, ...(getSettings().cirkts || {}) });
  const save = patch => { const next = { ...local(), ...patch }; setSettings({ cirkts: next }); return next; };
  const item = id => catalog.find(x => x.id === id);
  let lastSync = 0;

  // first time: the orb skins your points already unlocked are kept (the old rule was "unlocked at N points")
  function migrate() {
    const c = local(); if (c.migrated) return c;
    const pts = earned(), kept = catalog.filter(x => x.kind === 'skin' && x.price <= pts).map(x => x.id);
    return save({ migrated: true, kept, owned: [...new Set([...(c.owned || []), ...kept])] });
  }
  function state() {
    const c = migrate(), s = c.server;
    const e = Math.max(earned(), s?.earned || 0), spent = s ? Math.max(s.spent, c.spent || 0) : c.spent || 0;
    const owned = [...new Set([...(c.owned || []), ...(s?.owned || [])])];
    return { earned: e, spent, balance: Math.max(0, e - spent), owned, equip: c.equip || {}, synced: !!s, syncedAt: c.syncedAt || 0 };
  }
  const owns = id => !id || !item(id) || (item(id).owner ? !!isOwner() : (item(id).price === 0 || !!all() || state().owned.includes(id)));   // owner items (the crown): the Owner only   // all(): admin "unlock everything"

  async function rpc(fn, args) { try { return await C().rpc(fn, args); } catch (e) { if (/cirkts_|42883|PGRST20|404/.test(e.message)) return { missing: true }; throw e; } }
  async function sync(force = false) {
    if (!C()?.session) return state();
    if (!force && Date.now() - lastSync < 30e3) return state();
    lastSync = Date.now();
    const r = await rpc('cirkts_sync', { p_earned: Math.round(earned()) }).catch(e => { log('cirkts sync', e.message); return null; });
    if (!r || r.missing || !r.ok) return state();
    let c = save({ server: { earned: r.earned, spent: r.spent, owned: r.owned || [] }, syncedAt: Date.now() });
    // things bought on this computer before the account had a wallet: buy them there too (if the balance allows)
    const pending = (c.owned || []).filter(id => !(r.owned || []).includes(id) && item(id)?.price > 0 && !(c.kept || []).includes(id));
    for (const id of pending.slice(0, 20)) { const b = await rpc('cirkts_buy', { p_item: id }).catch(() => null); if (b?.ok) c = save({ server: { earned: b.earned, spent: b.spent, owned: b.owned || [] } }); }
    await pullStyle().catch(e => log('profile pull', e.message));
    return state();
  }
  async function buy(id) {
    const it = item(id); if (!it) return { ok: false, error: 'That isn\'t in the shop.' };
    const st = state();
    if (st.owned.includes(id)) return { ok: false, error: 'You already have it.', owned: true };
    if (st.balance < it.price) return { ok: false, error: `You need ${(it.price - st.balance).toLocaleString()} more Cirkts.`, short: it.price - st.balance };
    if (C()?.session) {
      const r = await rpc('cirkts_buy', { p_item: id }).catch(e => ({ ok: false, error: e.message }));
      if (r.ok) { save({ server: { earned: r.earned, spent: r.spent, owned: r.owned || [] } }); return { ok: true, item: it, ...state() }; }
      if (!r.missing) return { ok: false, error: r.error || 'Couldn\'t buy it.' };
    }
    const c = local(); save({ spent: (c.spent || 0) + it.price, owned: [...new Set([...(c.owned || []), id])] });
    return { ok: true, item: it, local: true, ...state() };
  }
  // 4.0.1: the profile on your account is the real one (N28C and other apps can change it). Pull it in; if the account has
  // none yet, send up what this computer has.
  const STYLE_KEYS = ['frame', 'ptheme', 'font', 'color', 'banner', 'effect', 'banner_url', 'theme_a', 'theme_b', 'pronouns', 'bio', 'status_text', 'show_stats'];
  async function pullStyle() {
    const r = await rpc('my_apoji_profile').catch(() => null);
    if (!r || r.missing || !r.ok || !r.profile) return;
    if (!r.profile.has_style) { if (Object.keys(local().equip || {}).length) await publish(); return; }
    const next = { ...(local().equip || {}) };
    for (const k of STYLE_KEYS) if (k in r.profile) next[k] = k === 'show_stats' ? r.profile[k] !== false : (r.profile[k] || '');
    save({ equip: next });
  }
  // what you show: frame, profile theme, name font + color, banner (orb skin and app theme are regular settings)
  async function equip(patch = {}) {
    const keys = ['frame', 'ptheme', 'font', 'color', 'banner', 'effect'], next = { ...(local().equip || {}) };
    for (const k of keys) if (k in patch) { const v = patch[k] || ''; if (v && (!item(v) || item(v).kind !== k || !owns(v))) return { ok: false, error: 'You don\'t own that yet.' }; next[k] = v; }
    for (const k of ['bio', 'status_text', 'pronouns']) if (k in patch) next[k] = String(patch[k] || '').slice(0, k === 'bio' ? 160 : k === 'pronouns' ? 24 : 60);
    for (const k of ['theme_a', 'theme_b']) if (k in patch) { const v = String(patch[k] || ''); if (v && !/^#[0-9a-f]{6}$/i.test(v)) return { ok: false, error: 'Colors look like #3dffa0.' }; if (v && !owns('ptheme:custom')) return { ok: false, error: 'Get "Your own colors" in the shop first.' }; next[k] = v; }
    if ('banner_url' in patch) { if (patch.banner_url && !owns('banner:custom')) return { ok: false, error: 'Get "Your own image" in the shop first.' }; next.banner_url = String(patch.banner_url || '').slice(0, 400); }
    if ('show_stats' in patch) next.show_stats = !!patch.show_stats;
    save({ equip: next });
    let published = null;   // the account copy (friends and other apps see this one)
    if (C()?.session) { const only = {}; for (const k of Object.keys(patch)) if (STYLE_KEYS.includes(k)) only[k] = next[k]; const r = await publish(null, only).catch(e => { log('profile style', e.message); return { ok: false }; }); published = r?.ok !== false; if (!published) log('profile style refused', r?.error || ''); }
    return { ok: true, equip: next, published };
  }
  // your public profile card (friends, Spaces, other Apoji apps)
  // publish() sends your whole profile; publish(extra) sends only extra (like stats); publish(null, only) sends only those keys
  async function publish(extra = null, only = null) {
    if (!C()?.session) return { ok: false };
    const e = local().equip || {};
    const full = { frame: e.frame || '', ptheme: e.ptheme || '', font: e.font || '', color: e.color || '', banner: e.banner || '', effect: e.effect || '', bio: e.bio || '', status_text: e.status_text || '', pronouns: e.pronouns || '', show_stats: e.show_stats !== false,
      ...(e.banner_url ? { banner_url: e.banner_url } : {}), ...(e.theme_a && e.theme_b ? { theme_a: e.theme_a, theme_b: e.theme_b } : {}) };
    const style = only ? only : extra ? extra : full;
    return rpc('profile_style_set', { p_style: style });
  }
  return { state, sync, buy, owns, equip, publish, item, migrate };
}
module.exports = { createCirkts };
