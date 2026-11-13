// Builds the message list sent to a model from the shared chatroom history.
// Other agents' turns are labelled so the active agent knows who said what.
(function () {
  function toApiMessages(history, personaId, personas) {
    const nameOf = id => (personas.find(p => p.id === id) || {}).name || id;
    const out = [];
    for (const m of history) {
      if (m.error) continue;
      if (m.role === 'user') out.push({ role: 'user', content: m.content });
      else if (m.persona === personaId) out.push({ role: 'assistant', content: m.content });
      else out.push({ role: 'user', content: `[${nameOf(m.persona)} said]: ${m.content}` });
    }
    // Merge consecutive same-role turns (Anthropic/Gemini require alternation).
    const merged = [];
    for (const m of out) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) last.content += '\n\n' + m.content; else merged.push({ ...m });
    }
    while (merged.length && merged[0].role !== 'user') merged.shift();
    return merged.slice(-40);
  }

  // "Hey Paragon, …" / "Flash: …" at the start of a spoken request switches agent.
  const SPOKEN = { paragon: 'paragon', neodela: 'neodela', 'neo dela': 'neodela', lyte: 'lyte', light: 'lyte', lite: 'lyte', flash: 'flash' };
  function spokenAgent(text) {
    const NAMES = '(paragon|neo ?dela|lyte|light|lite|flash)';
    // Needs a wake word ("hey flash …") or punctuation ("Flash, …") so "light the …" isn't misread.
    const m = String(text).match(new RegExp(`^\\s*(?:hey|ok|okay|yo)[\\s,]+${NAMES}\\b[\\s,.:!?-]*`, 'i'))
           || String(text).match(new RegExp(`^\\s*${NAMES}\\s*[,:.!?]\\s*`, 'i'));
    if (!m) return null;
    return { persona: SPOKEN[m[1].toLowerCase()], rest: text.slice(m[0].length).trim() };
  }

  // Voice commands that end a voice session. They only count when said on their own
  // (optionally with "hey"/"ok"/"Nexus"/an agent name), never inside a longer sentence.
  const STOP_PHRASES = {
    'goodbye': 'GOODBYE', 'good bye': 'GOODBYE', 'bye': 'GOODBYE', 'bye bye': 'GOODBYE', 'bye now': 'GOODBYE', 'see you': 'GOODBYE', 'see ya': 'GOODBYE',
    'sleep': 'SLEEPING', 'go to sleep': 'SLEEPING', 'go sleep': 'SLEEPING', 'stop listening': 'SLEEPING',
    'thank you': 'ANYTIME', 'thanks': 'ANYTIME', 'thank you very much': 'ANYTIME', 'thanks a lot': 'ANYTIME', 'thank you so much': 'ANYTIME',
    "that's all": 'GOODBYE', 'that is all': 'GOODBYE', 'never mind': 'DISMISSED', 'nevermind': 'DISMISSED', 'cancel': 'DISMISSED', 'dismiss': 'DISMISSED'
  };
  const FILLER = /^(?:hey|ok|okay|alright|all right|um|uh|nexus|paragon|neo ?dela|lyte|light|lite|flash)\s+/;
  const TRAIL = /\s+(?:nexus|paragon|neo ?dela|lyte|light|lite|flash|buddy|mate)$/;
  function stopCommand(text) {
    let t = String(text || '').toLowerCase().replace(/[’]/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < 3; i++) t = t.replace(FILLER, '');
    for (let i = 0; i < 2; i++) t = t.replace(TRAIL, '');
    return STOP_PHRASES[t] || null;
  }

  // @mentions: agents (core + legacy) switch the agent; @Features apply to one message.
  const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function parseMentions(text, personas, catalog) {
    const re = /(^|\s)@([A-Za-z][\w.]*)/g;
    let m, agent = null; const features = [];
    while ((m = re.exec(text))) {
      const tok = m[2].replace(/[.]+$/, '');
      const p = personas.find(x => x.handle === tok.toLowerCase());
      if (p) { agent = p; continue; }
      const f = catalog.find(x => norm(x.id) === norm(tok));
      if (f && !features.includes(f.id)) features.push(f.id);
    }
    return { agent, features };
  }
  // Autocomplete: agents first, then the active agent's features (others shown as unavailable).
  function mentionCandidates(q, personas, activePersona, catalog) {
    const ql = q.toLowerCase();
    const agents = personas.filter(p => p.handle.startsWith(ql) && (!p.legacy || ql.length >= 1)).slice(0, 8).map(p => ({ kind: 'agent', p }));
    const own = new Set(activePersona.features || []);
    const feats = catalog.filter(f => norm(f.id).startsWith(norm(ql)))
      .sort((a, b) => (own.has(b.id) - own.has(a.id)))
      .map(f => ({ kind: 'feature', f, available: own.has(f.id) }));
    return ql ? [...agents, ...feats].slice(0, 12) : [...agents.filter(a => !a.p.legacy), ...feats.filter(f => f.available)].slice(0, 30);
  }

  window.NexusChat = { toApiMessages, spokenAgent, stopCommand, parseMentions, mentionCandidates };
})();
