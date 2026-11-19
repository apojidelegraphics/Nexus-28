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
  beta_lab: { stage: 'beta', title: 'Beta lab', description: 'Early features, one-tap bug reports, prerelease updates.' },
  // 3.7 features (out of beta in 3.10: everyone has them)
  second_look: { stage: 'all', title: 'Second Look', description: 'After Flash or Lyte answers, Neodela quietly checks it and flags anything it disagrees with.' },
  branch_chat: { stage: 'all', title: 'Branch a chat', description: 'Start a new chat from any message to try a different direction.' },
  incognito: { stage: 'all', title: 'Incognito chat', description: "A chat that isn't saved or synced and doesn't use your memory." },
  clip_chips: { stage: 'all', title: 'Smart clipboard chips', description: 'Copy an address, a date, foreign text or an error and Quick Chat offers the right action.' },
  spend_tracker: { stage: 'all', title: 'Key spend tracker', description: 'About how much your own API keys cost this week and month.' },
  // 3.10 beta features
  smart_topics: { stage: 'beta', title: 'Smarter topics', description: 'Nexus sorts your chats into topics for the mind map, instead of matching words.', minVersion: '3.10.0' },
  ask_map: { stage: 'beta', title: 'Ask the map', description: 'Ask Nexus about a branch of your mind map: "What have I been working on in School?"', minVersion: '3.10.0' },
  continue_on: { stage: 'beta', title: 'Continue on my other computer', description: 'Send the chat you have open to your other Mac or PC in one click.', minVersion: '3.10.0' }
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
// grants (v3.1): feature keys the Apoji Team turned on just for this account (an approved access request)
function resolve({ remote = [], account = {}, preview = '', optOut = [], version = '0.0.0', grants = [] } = {}) {
  const ch = channelOf(account, { preview });
  const all = { ...Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { key: k, ...v, source: 'default' }])) };
  for (const r of remote || []) if (r && /^[a-z0-9_]{2,48}$/.test(r.key) && STAGES.includes(r.stage) && !RETIRED.includes(r.key)) all[r.key] = { ...(all[r.key] || {}), key: r.key, stage: r.stage, title: r.title || all[r.key]?.title || r.key, description: r.description || all[r.key]?.description || '', minVersion: r.min_version || '', source: 'cloud' };
  const out = {};
  for (const [k, f] of Object.entries(all)) {
    const granted = f.stage !== 'off' && grants.includes(k);
    const allowed = (RANK[ch] >= NEED[f.stage] || granted) && (!f.minVersion || vcmp(version, f.minVersion) >= 0);
    const early = f.stage === 'beta' || f.stage === 'admin';
    out[k] = { ...f, allowed, early, granted, on: allowed && !(early && optOut.includes(k)) };
  }
  return { channel: ch, realChannel: channelOf(account), flags: out };
}
const isOn = (state, key) => !!state?.flags?.[key]?.on;

module.exports = { DEFAULTS, resolve, isOn, channelOf, STAGES, vcmp };
