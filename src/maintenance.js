// Maintenance + account status (v2.2): what's switched off from the admin portal, and whether this account is
// suspended or banned. The Mac app enforces it (it used to only show a banner).
//   Scopes: global · all · app (everything) · desktop (Mac app chats) · phone / n28c / companion (N28C)
//           · spaces (Shared Spaces) · an agent id (flash, lyte, neodela, paragon) · a feature name (seek, magyk, …)
const EVERYTHING = ['global', 'all', 'app', 'everything'];
const AREA = {
  chat: ['desktop', 'mac'],
  phone: ['phone', 'n28c', 'companion', 'mobile'],
  spaces: ['spaces', 'shared_spaces', 'sharedspaces', 'shared spaces']
};
const norm = s => String(s || '').trim().toLowerCase();

// list: cloud.maintenance ([{ scope, message, endsAt, adminBypass, type }]); area: chat | phone | spaces
// persona: { id, base } for chats. Returns the switch that blocks it, or null.
function blockFor(list, area, { persona = null, admin = false } = {}) {
  const scopes = new Set([...EVERYTHING, ...(AREA[area] || [])]);
  if (area === 'chat' && persona) for (const id of [persona.id, persona.base, `nexus 28 ${persona.id}`, `nexus '28 ${persona.id}`]) if (id) scopes.add(norm(id));
  if (area === 'phone' && persona) for (const id of [persona.id, persona.base]) if (id) scopes.add(norm(id));
  for (const m of list || []) {
    if (!scopes.has(norm(m.scope))) continue;
    if (admin && m.adminBypass !== false) continue;
    return m;
  }
  return null;
}
function untilText(endsAt, now = Date.now()) {
  if (!endsAt) return '';
  const min = Math.round((new Date(endsAt).getTime() - now) / 60e3);
  if (!isFinite(min)) return '';
  if (min <= 0) return ' Should be back any minute.';
  if (min < 60) return ` Back in about ${min} minute${min === 1 ? '' : 's'}.`;
  const h = Math.round(min / 60); return h < 24 ? ` Back in about ${h} hour${h === 1 ? '' : 's'}.` : ` Back ${new Date(endsAt).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}.`;
}
function message(m, what, now = Date.now()) {
  if (!m) return '';
  const icon = m.type === 'emergency' ? '🚨' : m.type === 'outage' ? '⚠️' : '🛠';
  const text = m.message ? m.message.trim().replace(/([^.!?…])$/, '$1.') : `${what} is down for maintenance.`;
  return `${icon} ${text}${untilText(m.endsAt, now)}`;
}

// Account moderation from public.user_moderation. A suspension that has ended doesn't count.
function activeModeration(mod, now = Date.now()) {
  if (!mod || !mod.status || mod.status === 'active') return null;
  if (mod.status === 'suspended' && mod.suspended_until && new Date(mod.suspended_until).getTime() < now) return null;
  return mod;
}
function moderationText(mod) {
  if (!mod) return '';
  const until = mod.status === 'suspended' && mod.suspended_until ? ` until ${new Date(mod.suspended_until).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '';
  return `Your Nexus account is ${mod.status}${until}${mod.reason ? `: ${mod.reason}` : ''}.`;
}
module.exports = { blockFor, message, untilText, activeModeration, moderationText, EVERYTHING, AREA };
