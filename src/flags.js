// Beta channel backbone (v1.7). Every gated feature has a stage:
//   off   → nobody          admin → admins only (high-admin / admin in admin_roles)
//   beta  → admins + beta testers (profiles.is_beta_tester)          all → everyone
// Stages come from Supabase public.feature_flags (admins change them there, no app update needed); DEFAULTS below
// are used offline or before the table exists. Testers can switch any early feature off for themselves, and admins
// can preview the app as a beta tester or a regular user.
const DEFAULTS = {
  homework_helper: { stage: 'all', title: 'Homework helper', description: 'Step-by-step hints for the problem on your screen.' },
  citations: { stage: 'all', title: 'Citation helper', description: 'MLA / APA / Chicago citations from a link or your browser.' },
  orb_skins: { stage: 'all', title: 'Orb skins', description: 'Unlock orb skins with points.' },
  daily_challenge: { stage: 'all', title: 'Daily challenge', description: 'A small challenge every day for bonus points.' },
  nexus_wrapped: { stage: 'all', title: 'Nexus Wrapped', description: 'Your year in Nexus.' },
  beta_lab: { stage: 'beta', title: 'Beta lab', description: 'Early features, one-tap bug reports, prerelease updates.' }
};
// Features that graduated out of beta (v1.9: the N28C phone app is for everyone). Old cloud rows for them are ignored.
const RETIRED = ['phone_companion'];
const RANK = { stable: 0, beta: 1, admin: 2 };
const NEED = { all: 0, beta: 1, admin: 2, off: 99 };
const STAGES = ['off', 'admin', 'beta', 'all'];

// Which channel this person is on. account: cloud.account() ({ signedIn, beta, admin })
function channelOf(account = {}, { preview = '' } = {}) {
  const real = account.admin ? 'admin' : account.beta ? 'beta' : 'stable';
  if (real === 'admin' && RANK[preview] !== undefined) return preview; // admins can preview lower channels
  return real;
}
function vcmp(a, b) { const p = v => String(v || '0').replace(/^v/, '').split(/[.-]/).slice(0, 3).map(n => +n || 0); const x = p(a), y = p(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }

// remote: [{ key, stage, title, description, min_version }]
function resolve({ remote = [], account = {}, preview = '', optOut = [], version = '0.0.0' } = {}) {
  const ch = channelOf(account, { preview });
  const all = { ...Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { key: k, ...v, source: 'default' }])) };
  for (const r of remote || []) if (r && /^[a-z0-9_]{2,48}$/.test(r.key) && STAGES.includes(r.stage) && !RETIRED.includes(r.key)) all[r.key] = { ...(all[r.key] || {}), key: r.key, stage: r.stage, title: r.title || all[r.key]?.title || r.key, description: r.description || all[r.key]?.description || '', minVersion: r.min_version || '', source: 'cloud' };
  const out = {};
  for (const [k, f] of Object.entries(all)) {
    const allowed = RANK[ch] >= NEED[f.stage] && (!f.minVersion || vcmp(version, f.minVersion) >= 0);
    const early = f.stage === 'beta' || f.stage === 'admin';
    out[k] = { ...f, allowed, early, on: allowed && !(early && optOut.includes(k)) };
  }
  return { channel: ch, realChannel: channelOf(account), flags: out };
}
const isOn = (state, key) => !!state?.flags?.[key]?.on;

module.exports = { DEFAULTS, resolve, isOn, channelOf, STAGES, vcmp };
