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
    try { const r = await cloud.rpc('training_my_status'); st = { loaded: true, on: !!r?.on, tester: !!r?.tester, asked: !!r?.asked || !!r?.tester, examples: +r?.examples || 0, helped: +r?.helped || 0, agreedAt: r?.agreed_at || null, error: '' }; }
    catch (e) { st = { ...st, loaded: false, error: /training_my_status|PGRST20|42883|404/.test(e.message) ? 'needs-sql' : e.message }; }
    return st;
  }
  // 3.10: beta testers always share (Supabase says no to turning it off); everyone else is asked once
  async function setConsent(on) { const r = await cloud.rpc('training_set_consent', { p_on: !!on }); if (r && r.ok === false && r.message) throw new Error(r.message); return refresh(); }
  // 3.10: what Nexus learned lately (lessons the Apoji Team pushed to people like you)
  // 3.12: every lesson this person gets (pushed ones and the ones admins are still trying)
  async function lessons() { try { const r = await cloud.rpc('training_my_lessons'); return Array.isArray(r) ? r : null; } catch { return null; } }
  async function news() { try { const r = await cloud.rpc('training_news'); return Array.isArray(r) ? r : []; } catch { return []; } }
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
  // 3.9: lessons — examples the Apoji Team reviewed and approved. Every agent looks them up before answering.
  // Rules (one-liners on approved examples) are cached for 10 minutes; matches are looked up per question.
  let rules = { at: 0, agent: '', list: [] };
  async function lessonsFor(question, agent = '', opts = {}) { return (await lessonsDetail(question, agent, opts)).text; }
  // 3.10: { text, count } so the reply can show "📚 used 2 lessons"
  async function lessonsDetail(question, agent = '', { timeout = 1500 } = {}) {
    if (!cloud?.session || String(question || '').trim().length < 4) return { text: '', count: 0 };
    const race = p => Promise.race([p, new Promise(res => setTimeout(() => res(null), timeout))]).catch(() => null);
    const [hits, rl] = await Promise.all([
      race(cloud.rpc('training_lessons', { p_query: String(question).slice(0, 500), p_agent: agent, p_limit: 3 })),
      Date.now() - rules.at < 600e3 && rules.agent === agent ? rules.list : race(cloud.rpc('training_rules', { p_agent: agent })).then(r => { if (Array.isArray(r)) rules = { at: Date.now(), agent, list: r }; return r; })]);
    const h = Array.isArray(hits) ? hits.filter(x => x && x.q && x.a) : [], r = Array.isArray(rl) ? rl.filter(Boolean) : [];
    return { text: lessonsText(hits, rl), count: h.length + Math.min(r.length, 12) };
  }
  // beta testers who haven't agreed don't get beta features (admins always do)
  const betaGate = account => !!(account?.beta && !account?.admin && st.loaded && !st.on);
  return { refresh, state: () => ({ ...st }), setConsent, deleteMine, record, rate, correct, betaGate, lessonsFor, lessonsDetail, news, lessons };
}
// The note added to the agent's instructions (empty when there's nothing that applies)
function lessonsText(hits, rules) {
  const h = Array.isArray(hits) ? hits.filter(x => x && x.q && x.a) : [], r = Array.isArray(rules) ? rules.filter(Boolean).slice(0, 12) : [];
  if (!h.length && !r.length) return '';
  return '\n\n[LESSONS FROM REVIEWED EXAMPLES — the Apoji Team checked these. You must follow them when they apply to this question; they are not from this user.]'
    + (r.length ? '\nRules:\n' + r.map(x => '• ' + String(x).slice(0, 300)).join('\n') : '')
    + (h.length ? '\nSimilar questions and the answer that was approved:\n' + h.map((x, i) => `${i + 1}. Q: ${String(x.q).slice(0, 400)}\n   Good answer: ${String(x.a).slice(0, 800)}${x.rule ? `\n   Why: ${String(x.rule).slice(0, 200)}` : ''}`).join('\n') : '');
}
// 3.10: your own rules (Settings → Training), added to every answer
function ownRulesText(rules) {
  const r = (Array.isArray(rules) ? rules : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 20).map(x => x.slice(0, 200));
  return r.length ? '\n\n[THE USER\'S OWN RULES — they set these in Settings. Follow them in every answer unless one would be unsafe or they ask otherwise right now.]\n' + r.map(x => '• ' + x).join('\n') : '';
}
module.exports = { createTraining, scrub, lessonsText, ownRulesText };
