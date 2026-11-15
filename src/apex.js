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
  prompt() { return this.s?.allowed && typeof this.s.prompt === 'string' ? this.s.prompt : ''; }
  // Can this turn run? { ok, error } and the reason in plain words.
  async check(provider) {
    const s = await this.session(true);
    if (!s) return { ok: false, error: "Axiom isn't available right now (it needs the v2.4 Nexus database and a connection)." };
    if (!s.allowed) return { ok: false, error: s.reason === 'off' ? 'Axiom is switched off by the Nexus team.' : "Axiom isn't available to your account." };
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
  return h <= 1 ? 'within the hour' : h < 24 ? `in ${h} hours` : `on ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
}
module.exports = { Apex, PUBLIC_PROVIDERS, resetText, label };
