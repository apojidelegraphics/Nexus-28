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
  // 3.10 beta features (out of beta in 4.0.6: everyone has them)
  smart_topics: { stage: 'all', title: 'Smarter topics', description: 'Nexus sorts your chats into topics for the mind map, instead of matching words.', minVersion: '3.10.0' },
  ask_map: { stage: 'all', title: 'Ask the map', description: 'Ask Nexus about a branch of your mind map: "What have I been working on in School?"', minVersion: '3.10.0' },
  continue_on: { stage: 'all', title: 'Continue on my other computer', description: 'Send the chat you have open to your other Mac or PC in one click.', minVersion: '3.10.0' },
  // 4.0.6 beta: make your own picture frames, profile frames and effects (and upload your own, checked by the Apoji Team)
  make_your_own: { stage: 'beta', title: 'Make your own', description: 'Build your own picture frame, profile frame and profile effect in the shop, or upload your own image for the team to check.', minVersion: '4.0.6' }
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
// 4.1.0: platform = 'mac' | 'windows' | 'phone' | 'test_run'. A flag can be limited to some platforms (Apoji Admin → Feature
// flags → Where); an empty list means everywhere.
// 4.2.0 A/B switches: a flag's rollout (1–100) turns it on for that share of the people who'd otherwise get it. Who's in
// is decided by a stable hash of their account (or install) id and the flag name, so it doesn't flip between launches.
// Those in get variant 'b' (the new thing), the rest 'a'. Session replays carry the variant so the halves can be compared.
function bucketOf(id, key) { let h = 2166136261; for (const c of `${key}:${id}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; }
function resolve({ remote = [], account = {}, preview = '', optOut = [], version = '0.0.0', grants = [], platform = '', bucket = '' } = {}) {
  const ch = channelOf(account, { preview });
  const all = { ...Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { key: k, ...v, source: 'default' }])) };
  for (const r of remote || []) if (r && /^[a-z0-9_]{2,48}$/.test(r.key) && STAGES.includes(r.stage) && !RETIRED.includes(r.key)) all[r.key] = { ...(all[r.key] || {}), key: r.key, stage: r.stage, title: r.title || all[r.key]?.title || r.key, description: r.description || all[r.key]?.description || '', rollout: Number.isFinite(+r.rollout) ? Math.max(1, Math.min(100, Math.round(+r.rollout))) : 100, minVersion: r.min_version || '', platforms: Array.isArray(r.platforms) ? r.platforms.filter(x => typeof x === 'string') : [], source: 'cloud' };
  const out = {};
  for (const [k, f] of Object.entries(all)) {
    const granted = f.stage !== 'off' && grants.includes(k);
    const here = !platform || !(f.platforms || []).length || f.platforms.includes(platform);
    const allowed = (RANK[ch] >= NEED[f.stage] || granted) && (!f.minVersion || vcmp(version, f.minVersion) >= 0) && here;
    const early = f.stage === 'beta' || f.stage === 'admin';
    const ab = (f.rollout || 100) < 100 && !granted, inB = !ab || bucketOf(bucket, k) < f.rollout;
    out[k] = { ...f, allowed, early, granted, here, ...(ab ? { ab: true, variant: allowed && inB ? 'b' : 'a' } : {}), on: allowed && inB && !(early && optOut.includes(k)) };
  }
  return { channel: ch, realChannel: channelOf(account), flags: out };
}
const isOn = (state, key) => !!state?.flags?.[key]?.on;

// the A/B variants this person is in, for session replays ({ key: 'a' | 'b' })
const variantsOf = state => Object.fromEntries(Object.entries(state?.flags || {}).filter(([, f]) => f.ab && f.allowed).map(([k, f]) => [k, f.variant]));
module.exports = { DEFAULTS, resolve, isOn, channelOf, STAGES, vcmp, bucketOf, variantsOf };
