// Training data for Nexus models (3.8). Beta testers agree to share their chats (it's part of getting features
// early); anyone else can opt in from Settings → Beta. Each answer becomes one example in Supabase
// (public.training_examples): the question, the answer, the agent and model, and later a 👍 / 👎 or a better answer.
// Never collected: incognito chats, Axiom, errors, very short chats. Personal details are stripped first (scrub).
// Anyone can switch it off (then beta features pause) and delete everything they gave.
//   createTraining({ cloud, source, log }) → { refresh, state, setConsent, deleteMine, record, rate, correct, betaGate }
'use strict';
const RULES = [
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[key]'], [/\bsk-or-v1-[a-f0-9]{20,}\b/gi, '[key]'], [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[key]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[key]'], [/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[key]'], [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[token]'],
  [/\b(?:\d[ -]?){13,19}\b/g, '[number]'],                                  // card-like digit runs
  [/(\+?\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g, '[phone]'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '[id]'],
  [/(https?:\/\/[^\s?#]+)\?[^\s#)]+/g, '$1'],                                // links keep the page, lose ?tokens=
  [/\b(password|passcode|pin)\s*(is|:)\s*\S+/gi, '$1 [hidden]']
];
function scrub(text) { let t = String(text || ''); for (const [re, to] of RULES) t = t.replace(re, to); return t; }

function createTraining({ cloud, source = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux', log = () => {} } = {}) {
  let st = { loaded: false, on: false, tester: false, examples: 0, error: '' };
  async function refresh() {
    if (!cloud?.session) { st = { loaded: false, on: false, tester: false, examples: 0, error: '' }; return st; }
    try { const r = await cloud.rpc('training_my_status'); st = { loaded: true, on: !!r?.on, tester: !!r?.tester, examples: +r?.examples || 0, agreedAt: r?.agreed_at || null, error: '' }; }
    catch (e) { st = { ...st, loaded: false, error: /training_my_status|PGRST20|42883|404/.test(e.message) ? 'needs-sql' : e.message }; }
    return st;
  }
  async function setConsent(on) { await cloud.rpc('training_set_consent', { p_on: !!on }); return refresh(); }
  async function deleteMine() { const r = await cloud.rpc('training_delete_mine'); await refresh(); return r?.deleted || 0; }
  // one answer → one example (returns a ref the chat keeps, so 👍 / 👎 can find it later)
  async function record({ prompt, answer, agent = '', model = '', features = [], convId = '', incognito = false, apex = false }) {
    if (!st.on || !cloud?.session || incognito || apex) return null;
    const q = scrub(prompt).trim(), a = scrub(answer).trim();
    if (q.length < 4 || a.length < 2) return null;
    const ref = `${String(convId || 'c').slice(0, 40)}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    try {
      await cloud.write('POST', 'training_examples', { ref, source, agent: String(agent).slice(0, 40), model: String(model).slice(0, 120), features: (features || []).map(String).slice(0, 12), prompt: q.slice(0, 6000), answer: a.slice(0, 12000) }, 'return=minimal');
      st.examples++; return ref;
    } catch (e) { log('training', e.message); return null; }
  }
  const patch = (ref, body) => cloud.write('PATCH', `training_examples?ref=eq.${encodeURIComponent(ref)}`, body, 'return=minimal');
  const rate = (ref, v) => patch(ref, { rating: v > 0 ? 1 : v < 0 ? -1 : 0 });
  const correct = (ref, text) => patch(ref, { correction: scrub(text).slice(0, 12000) || null, rating: -1 });
  // beta testers who haven't agreed don't get beta features (admins always do)
  const betaGate = account => !!(account?.beta && !account?.admin && st.loaded && !st.on);
  return { refresh, state: () => ({ ...st }), setConsent, deleteMine, record, rate, correct, betaGate };
}
module.exports = { createTraining, scrub };
