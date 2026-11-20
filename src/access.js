// Model tiers, free-key chat limits, and order entitlements.
//
//   Ultra    — Paragon                         — never on the free Nexus key (needs your own key or a local model)
//   Best     — Neodela + every legacy model    — 28 chats on the free key
//   Standard — all Lyte models (28, 27, 2.6)   — 95 chats on the free key
//   Base     — Flash                           — unlimited on the free key
//
// Limits only apply when a chat runs on the free Nexus key. Your own API keys, local models,
// comped accounts, and models unlocked by a redeemed aARgon3 / Mexel order are unlimited.

const TIERS = {
  apex:     { id: 'apex', label: 'Apex', limit: 0, freeKey: false },    // v2.4 Axiom (BETA): your own key, weekly minutes from Supabase
  ultra:    { id: 'ultra', label: 'Ultra', limit: 0, freeKey: false },
  best:     { id: 'best', label: 'Best', limit: 28, freeKey: true },
  standard: { id: 'standard', label: 'Standard', limit: 95, freeKey: true },
  base:     { id: 'base', label: 'Base', limit: Infinity, freeKey: true }
};

function tierOf(persona) {
  if (!persona) return TIERS.best;
  if (persona.base) return tierOf({ id: persona.base, handle: persona.base });   // custom agents use their base agent's tier
  if (persona.apex || persona.id === 'axiom') return TIERS.apex;
  if (persona.id === 'paragon') return TIERS.ultra;
  if (persona.id === 'flash' || /flash/i.test(persona.handle || '')) return TIERS.base;
  if (persona.id === 'lyte' || /^lyte/i.test(persona.handle || '')) return TIERS.standard;
  return TIERS.best;
}

// Name used for chat_usage rows (matches the web Nexus: the Supabase assistant name).
function usageName(persona, cloudPrompts = {}) {
  if (persona.base) return usageName({ id: persona.base }, cloudPrompts);   // custom agents count against their base agent
  if (persona.legacy) return persona.name;
  return cloudPrompts[persona.id]?.name || { paragon: 'Nexus 28 Paragon', neodela: 'Nexus 28 Neodela', lyte: 'Nexus 28 Lyte', flash: 'Nexus 28 Flash' }[persona.id] || persona.name;
}

// aARgon3 / Mexel order item → persona id. "Lyte-28" is the current Lyte; others match legacy handles.
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// "Nexus -9.2o Hailos" → { model: 'hailos', full: 'hailos92o' } (matches order items like "Hailos-9.2o")
function legacyKeys(name) {
  const m = String(name || '').match(/^\s*nexus\s*-?\s*([\d.]+[a-z]?)\s+(.+)$/i);
  return m ? { model: norm(m[2]), full: norm(m[2]) + norm(m[1]) } : { model: norm(name), full: norm(name) };
}
function personaForItem(model, personas) {
  const n = norm(model);
  if (n === 'lyte28' || n === 'lyte') return 'lyte';
  if (n === 'neodela') return 'neodela';
  if (n === 'flash') return 'flash';
  const p = personas.find(x => x.handle === n)
    || personas.find(x => x.legacy && legacyKeys(x.name).full === n)
    || (() => { const m = personas.filter(x => x.legacy && legacyKeys(x.name).model === n); return m.length === 1 ? m[0] : null; })();
  return p ? p.id : null;
}

// Which personas are unlimited because of redeemed orders.
//   orders: [{ orderId, items: [{ model }] }] — an order with no item list unlocks every non-Ultra model.
function unlockedBy(orders, personas) {
  const out = new Set();
  for (const o of orders || []) {
    const items = Array.isArray(o.items) ? o.items : [];
    if (!items.length) { personas.filter(p => tierOf(p).id !== 'ultra').forEach(p => out.add(p.id)); continue; }
    for (const it of items) { const id = personaForItem(it.model, personas); if (id) out.add(id); }
  }
  return out;
}

// Decide how a chat request may run.
//   { mode: 'own' | 'local' | 'free' | 'premium' | 'blocked', reason?, tier, limit, used, unlimited }
//   3.11 premium: { paragon: { allowed, unlimited, limit, used }, axiom: { allowed } } from premium_my_status — Pro and Max
//   plans (and the people in them) run Paragon on the Nexus key; Axiom runs on it for the people the Apoji Team allowed.
function decide({ persona, provider, hasOwnKey, freeKeyEnabled, comped, unlocked, used, premium }) {
  const tier = tierOf(persona);
  if (!provider.needsKey) return { mode: 'local', tier };
  if (hasOwnKey) return { mode: 'own', tier };
  const pp = premium?.paragon, pa = premium?.axiom;
  if (tier.id === 'apex' && pa?.allowed) return { mode: 'premium', tier, agent: 'axiom' };
  if (tier.id === 'ultra' && pp?.allowed) {
    const lim = pp.unlimited ? Infinity : (+pp.limit || 0), u = +pp.used || 0;
    if (u >= lim) return { mode: 'blocked', tier, used: u, limit: lim, reason: `That's all ${lim} Paragon tasks for today on your ${pp.tier || ''} plan. It resets tomorrow, or add your own key in Settings → Models & keys.`.replace('  ', ' ') };
    return { mode: 'premium', tier, agent: 'paragon', used: u, limit: lim, unlimited: lim === Infinity };
  }
  if (tier.id === 'apex') return { mode: 'blocked', tier, reason: "Axiom is the Apex tier and never runs on the free Nexus key. Add your own key (Claude, OpenRouter or ChatGPT) in Settings → Providers." };
  if (tier.id === 'ultra') return { mode: 'blocked', tier, reason: "Paragon is the Ultra tier: it comes on the Nexus key with Pro and Max plans (see pricing on the aArgon3 site). Or add your own API key in Settings → Models & keys, or run Paragon on a local model, without agent tools." };
  if (!freeKeyEnabled) return { mode: 'blocked', tier, reason: `No API key set for ${provider.label}. Add one in Settings → Providers, or turn on the free Nexus key.` };
  const unlimited = comped || unlocked || tier.limit === Infinity;
  if (!unlimited && used >= tier.limit) {
    return { mode: 'blocked', tier, used, limit: tier.limit, reason: `You've used all ${tier.limit} ${persona.handle} chats on the free Nexus key (${tier.label} tier). Redeem an aARgon3 / Mexel order for unlimited use, add your own API key, or switch to Flash, which is unlimited.` };
  }
  return { mode: 'free', tier, used, limit: unlimited ? Infinity : tier.limit, unlimited };
}

module.exports = { TIERS, tierOf, usageName, personaForItem, unlockedBy, decide, norm };
