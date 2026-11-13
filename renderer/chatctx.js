// Builds the message list sent to a model from the shared chatroom history.
// Other agents' turns are labelled so the active agent knows who said what.
(function () {
  function toApiMessages(history, personaId, personas) {
    const nameOf = id => (personas.find(p => p.id === id) || {}).name || id;
    const out = [];
    for (const m of history) {
      if (m.error || m.local) continue; // errors and calc/convert answers stay out of the model's context
      if (m.role === 'user') out.push({ role: 'user', content: m.content, ...(m.attachments?.length ? { attachments: m.attachments.map(a => ({ id: a.id })) } : {}) });
      else if (m.persona === personaId) out.push({ role: 'assistant', content: m.content });
      else out.push({ role: 'user', content: `[${nameOf(m.persona)} said]: ${m.content}` });
    }
    // Merge consecutive same-role turns (Anthropic/Gemini require alternation).
    const merged = [];
    for (const m of out) {
      const last = merged[merged.length - 1];
      if (last && last.role === m.role) { last.content += '\n\n' + m.content; if (m.attachments) last.attachments = [...(last.attachments || []), ...m.attachments]; }
      else merged.push({ ...m });
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
           || String(text).match(new RegExp(`^\\s*${NAMES}\\s*[,:.!?]\\s*`, 'i'))
           || String(text).match(new RegExp(`^\\s*(?:can you |could you |please )?(?:ask|have|let|get)\\s+${NAMES}\\b(?:\\s+to)?[\\s,]*`, 'i'));
    if (!m) return null;
    return { persona: SPOKEN[m[1].toLowerCase()], rest: text.slice(m[0].length).trim() };
  }

  // Screen questions ("what's on my screen?", "explain this", "what does this error mean?") and
  // "look again" for a fresh capture. Used by voice (Quick Ask) to look before answering.
  const SCREEN_INTENT = /\b(what'?s|what is|whats) (on|in) (my|the) (screen|display|window)\b|\b(look|glance) at (my|the|this) (screen|window|page)\b|\bwhat am i (looking at|seeing)\b|\b(read|summari[sz]e|explain|translate|proofread|check) (this|that|my screen|the screen|this page|this window|what'?s on (my|the) screen)\b|\bwhat does (this|that) (error|message|say|mean)\b|\bhelp me with (this|what'?s on)\b|\bon my screen\b|\bsee my screen\b|\bscreen ?shot\b/i;
  const LOOK_AGAIN = /\b(look again|look now|what about now|check again|take another look|new screenshot|look at it again)\b/i;
  const screenIntent = t => SCREEN_INTENT.test(String(t || ''));
  const lookAgain = t => LOOK_AGAIN.test(String(t || ''));

  // "Watch this window and tell me when the upload finishes" / "keep an eye on this page until it says "Done"".
  const WATCH_INTENT = /^\s*(?:hey nexus[\s,]+)?(?:(?:can|could) you\s+|please\s+)?(?:watch|keep an eye on|monitor)\s+(?:this|my|the)\s+(?:window|screen|page|app|tab|download|upload)\b[\s,]*(?:and\s+)?(?:(?:tell|let|notify|ping|alert|wake)\s+me\s+(?:know\s+)?(?:when|if|once)|until|for)\s+(.{3,})$/i;
  function watchIntent(t) {
    const m = String(t || '').trim().match(WATCH_INTENT);
    return m ? 'tell me when ' + m[1].replace(/[.?!]+$/, '').trim() : null;
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

  // The saved reply for a chat:send result (handoffs answer as the agent that took over).
  function replyMessage(res, personaId, extra = {}, streamed = '') {
    if (!res.ok) return { role: 'assistant', persona: personaId, content: res.error, error: true, ...extra };
    const text = (res.aborted ? (streamed || res.text || '(stopped)') : res.text) || '(no reply)';
    return { role: 'assistant', persona: res.persona || personaId, content: text, model: res.model, ...extra,
      activity: res.activity || [], images: res.images || [], sources: res.sources || [], cards: res.cards || [], features: res.features || [],
      ...(res.attachments?.length ? { attachments: res.attachments } : {}), ...(res.chatRefs?.length ? { chatRefs: res.chatRefs } : {}),
      ...(res.featureData ? { featureData: res.featureData } : {}), ...(res.handoff ? { handoff: res.handoff } : {}) };
  }
  // "@huddle …" or two or more agents @mentioned → a huddle; "@debate topic" → a debate.
  function groupIntent(text, personas) {
    const t = String(text || '');
    if (/(^|\s)@debate\b/i.test(t)) return { kind: 'debate', topic: t.replace(/(^|\s)@debate\b/i, ' ').replace(/(^|\s)@[a-z][\w.]*/gi, ' ').trim() };
    const agents = [...t.matchAll(/(^|\s)@([A-Za-z][\w.]*)/g)].map(m => personas.find(p => p.handle === m[2].toLowerCase())).filter(Boolean).map(p => p.id);
    const uniq = [...new Set(agents)];
    if (/(^|\s)@huddle\b/i.test(t) || uniq.length >= 2) return { kind: 'huddle', agents: uniq };
    return null;
  }

  window.NexusChat = { toApiMessages, spokenAgent, stopCommand, parseMentions, mentionCandidates, screenIntent, lookAgain, watchIntent, replyMessage, groupIntent };
})();
