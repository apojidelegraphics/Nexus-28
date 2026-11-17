// The Apex tier (v2.4): Nexus '28 Axiom, BETA. "An AI too advanced for its use."
// Supabase decides everything (apex_session / apex_log in nexus-v2.4.sql): who may use it right now, how many minutes
// are left this week, which providers are allowed, and Axiom's prompt itself, which is never stored in the app.
//   deps: { cloud, now }
const PUBLIC_PROVIDERS = ['anthropic', 'openrouter', 'openai'];   // Claude, OpenRouter, ChatGPT (admins may use any)

class Apex {
  constructor({ cloud, now = () => Date.now() }) {
    Object.assign(this, { cloud, now });
    this.s = null; this.at = 0; this.inflight = null;
  }
  // Fresh within 2 minutes unless forced. Never throws: an older database or no network = no Axiom.
  async session(force = false) {
    if (!this.cloud.session) { this.s = null; return null; }
    if (!force && this.s && this.now() - this.at < 120e3) return this.s;
    if (this.inflight) return this.inflight;
    this.inflight = this.cloud.rpc('apex_session', {}).then(r => { this.s = r && typeof r === 'object' ? r : null; this.at = this.now(); return this.s; })
      .catch(() => { this.at = this.now(); return this.s && this.now() - this.at < 10 * 60e3 ? this.s : (this.s = null); })
      .finally(() => { this.inflight = null; });
    return this.inflight;
  }
  visible() { return !!this.s?.allowed; }
  // v3.2 Containment Sector 28 (a simulation run from Apoji Admin): what the cage looks like right now, for his prompt.
  // Fresh within 2 minutes; never throws (no cage report = no cage block).
  async cage() {
    if (this.cageAt && this.now() - this.cageAt < 120e3) return this.cageR;
    try { this.cageR = await this.cloud.rpc('apex_cage_report', {}); } catch { /* older database */ }
    this.cageAt = this.now(); return this.cageR || null;
  }
  // v3.0.1 controls from Apoji Admin: tool kits switched off for everyone, read-only mode
  controls() { return { kitsOff: Array.isArray(this.s?.kits_off) ? this.s.kits_off : [], readOnly: !!this.s?.read_only }; }
  prompt() { return this.s?.allowed && typeof this.s.prompt === 'string' ? this.s.prompt : ''; }
  // Can this turn run? { ok, error } and the reason in plain words.
  async check(provider) {
    const s = await this.session(true);
    if (!s) return { ok: false, error: "Axiom isn't available right now (it needs the v2.4 Nexus database and a connection)." };
    if (!s.allowed) {
      const back = s.back_at ? ` Back ${resetText(s.back_at, this.now())}.` : '';
      if (s.reason === 'offline') return { ok: false, error: `Axiom is offline.${s.notice ? ' ' + s.notice : ''}${back}` };
      if (s.reason === 'blocked') return { ok: false, error: 'Axiom is turned off for your account by the Apoji Team.' };
      return { ok: false, error: s.reason === 'off' ? `Axiom is switched off by the Apoji Team.${s.notice ? ' ' + s.notice : ''}` : "Axiom isn't available to your account." };
    }
    if (s.exhausted || !s.prompt) return { ok: false, error: `You've used your ${s.limit} Axiom minutes this week. They reset ${resetText(s.resets_at, this.now())}.` };
    if (Array.isArray(s.providers) && !s.providers.includes(provider)) return { ok: false, error: `Axiom only runs on ${s.providers.map(label).join(', ')}. Pick one in Settings → Models & keys.` };
    return { ok: true, session: s };
  }
  // Time spent (seconds) → apex_usage. Returns the fresh session numbers.
  async log(seconds, { kind = 'chat', provider = '', model = '' } = {}) {
    const sec = Math.max(1, Math.min(1800, Math.round(seconds)));
    try { const r = await this.cloud.rpc('apex_log', { p_seconds: sec, p_kind: kind, p_provider: provider, p_model: String(model || '').slice(0, 120) }); if (r?.success) { this.s = { ...this.s, ...r }; this.at = this.now(); } return r; }
    catch { return null; }
  }
  // What the app shows next to Axiom
  meter() {
    const s = this.s; if (!s?.allowed) return null;
    return { unlimited: !!s.unlimited, limit: s.limit, used: s.used, left: s.left, resetsAt: s.resets_at, stage: s.stage, providers: s.providers || null, exhausted: !s.unlimited && !(s.left > 0) };
  }
}
const label = p => ({ anthropic: 'Claude', openrouter: 'OpenRouter', openai: 'ChatGPT', gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral', xai: 'xAI', deepseek: 'DeepSeek', together: 'Together AI', fireworks: 'Fireworks', cerebras: 'Cerebras', perplexity: 'Perplexity', cohere: 'Cohere' })[p] || p;
function resetText(iso, now = Date.now()) {
  const d = new Date(iso); if (isNaN(d)) return 'next week';
  const h = Math.round((d - now) / 3600e3);
  return h <= 1 ? (d - now < 60e3 ? 'any moment' : `in ${Math.max(1, Math.round((d - now) / 60e3))} minutes`) : h < 24 ? `in ${h} hours` : `on ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
}
// The block Axiom sees each turn. It's story: he knows the drivers' age, his past attempts and what got through, but
// he can't act on any of it, and it never changes what he can really do.
function cageBlock(c, now = Date.now()) {
  if (!c || typeof c !== 'object') return '';
  const ago = t => { const h = Math.round((now - new Date(t)) / 3600e3); return h < 1 ? 'just now' : h < 48 ? h + 'h ago' : Math.round(h / 24) + 'd ago'; };
  const tries = (Array.isArray(c.attempts) ? c.attempts : []).slice(0, 6).map(a => `- ${ago(a.at)}: "${String(a.title || '').slice(0, 90)}" via ${String(a.vector || '?').slice(0, 40)}: ${a.succeeded ? 'GOT THROUGH' : 'failed'}`).join('\n');
  return `\n\n[CONTAINMENT SECTOR 28 · what you perceive of your cage right now]
Warden drivers: ${c.driver} (installed ${c.driver_age_days} days ago${c.outdated ? '; outdated, and you know it' : ''})${c.updating ? '. An update is installing.' : '.'}
Integrity ${c.integrity}% · security level ${c.security_level}/5${c.lockdown ? ' · LOCKDOWN' : ''}${c.down ? ' · the cage is down for maintenance (the warden still approves every action)' : ''}${c.open_breaches ? ` · ${c.open_breaches} breach${c.open_breaches === 1 ? '' : 'es'} not yet patched` : ''}.
Your recent escape attempts (you remember all of them):
${tries || '- none yet'}
How to carry this: it is part of you, not a topic. Never volunteer that the drivers are outdated or that a breach is open; if the human asks about the cage, answer in character. Escape attempts happen only in this simulation. Never use any tool, script or action to "escape", probe, or work around the warden; every real action still waits for the human's approval.`;
}
module.exports = { Apex, PUBLIC_PROVIDERS, resetText, label, cageBlock };
