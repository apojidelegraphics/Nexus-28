// Quick Ask — Siri-style floating orb. Hotkey: listen → think → speak. Hotkey again to interrupt.
// Voice commands: "goodbye" / "bye" / "sleep" / "thank you" (said on their own) end the session.
(async function () {
  const $ = id => document.getElementById(id);
  const api = window.nexus;
  const init = await api.init();
  const state = { settings: init.settings, keys: init.keys, helperBuilt: init.helper.built };
  let personas = init.personas;
  const providers = init.providers;
  const persona = id => personas.find(p => p.id === id) || personas[0];
  const active = () => persona(state.settings.activePersona);
  const bindOf = p => (state.settings.bindings[p.id]?.provider ? state.settings.bindings[p.id] : null) || (p.legacy ? state.settings.legacyBinding : null) || {};
  const providerLabel = p => (providers[bindOf(p).provider]?.label || 'model').replace(/ \(.*\)/, '');

  const orb = window.NexusOrb.create($('orb'), { minimal: true, color: active().color });
  const capture = window.NexusVoice.createCapture(api, {
    getState: () => state,
    onPartial: t => { $('heard').textContent = t; },
    onLevel: v => orb.setLevel(v)
  });
  const speaker = window.NexusVoice.createSpeaker(api, { onLevel: v => orb.setLevel(v) });

  let phase = 'idle';           // idle | listening | thinking | confirming | speaking
  let run = 0;                  // increments to invalidate stale async steps
  let requestId = null;
  let hideTimer = null;
  let pendingConfirm = null;    // { callId, decide }

  function paintAgent() {
    const p = active();
    document.documentElement.style.setProperty('--agent', p.color);
    $('agentName').textContent = p.handle.toUpperCase() + (p.agentic ? ' · AGENT' : '');
    orb.setColor(p.color);
  }
  function setPhase(p, label) {
    phase = p;
    orb.setMode(p === 'idle' ? 'idle' : p === 'confirming' ? 'thinking' : p);
    const el = $('stateLabel');
    el.textContent = label ?? { listening: 'LISTENING', thinking: 'THINKING', confirming: 'APPROVAL', speaking: 'SPEAKING', idle: '' }[p];
    el.className = 'state' + (p === 'listening' || p === 'thinking' || p === 'confirming' ? ' live' : '');
  }
  function setNet(text, kind) {
    $('net').hidden = !text;
    $('net').className = 'net' + (kind === 'tool' ? ' tool' : '');
    $('netText').textContent = text || '';
  }
  function show() { clearTimeout(hideTimer); $('stage').classList.add('on'); api.quickActive(true); }
  function hideSoon(ms) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, ms); }
  function hide() {
    clearTimeout(hideTimer);
    run++;
    capture.cancel(); speaker.stop();
    resolveConfirm(false);
    if (requestId) api.abort(requestId);
    setPhase('idle'); setNet('');
    $('stage').classList.remove('on');
    setTimeout(() => { if (phase === 'idle') api.quickHide(); }, 230);
  }
  function showError(msg) {
    setPhase('idle', 'FAULT'); setNet('');
    $('stateLabel').className = 'state err';
    $('reply').className = 'reply err';
    $('reply').textContent = msg;
    hideSoon(5000);
  }
  function resetCard() {
    $('heard').textContent = ''; $('reply').textContent = ''; $('reply').className = 'reply';
    $('imgs').innerHTML = ''; $('confirm').hidden = true; setNet('');
  }

  async function listen() {
    const my = ++run;
    show(); resetCard();
    setPhase('listening'); orb.pulse(.6);
    let text;
    try { text = await capture.start(); }
    catch (e) { if (my === run) showError(e.message); return; }
    if (my !== run || text === null) return;
    if (!text) { setPhase('idle', "DIDN'T CATCH THAT"); hideSoon(1600); return; }
    const cmd = window.NexusChat.stopCommand(text);
    if (cmd) { $('heard').textContent = text; setPhase('idle', cmd); orb.pulse(.8); hideSoon(1100); return; }
    await ask(text, my);
  }

  async function ask(text, my) {
    const spoken = window.NexusChat.spokenAgent(text);
    if (spoken && spoken.persona !== state.settings.activePersona) {
      state.settings = (await api.setSettings({ activePersona: spoken.persona })).settings;
      paintAgent();
    }
    const p = active();
    $('heard').textContent = text;
    setPhase('thinking');
    setNet(`Connecting to ${providerLabel(p)}`, 'net');

    const conv = await api.conv.append({ role: 'user', content: text, via: 'voice' });
    requestId = Math.random().toString(36).slice(2);
    const myReq = requestId;
    let streamed = '';
    const onChunk = d => {
      if (d.requestId !== myReq || my !== run) return;
      if (!streamed) setNet('');
      streamed += d.text;
      $('reply').textContent = streamed;
      $('reply').scrollTop = $('reply').scrollHeight;
      orb.pulse(Math.min(.2, d.text.length / 80));
    };
    const onEvent = ev => {
      if (ev.requestId !== myReq || my !== run) return;
      if (ev.type !== 'status') return;
      if (ev.status === 'tool') { setNet(ev.detail ? `${ev.label} · ${ev.detail}` : ev.label, ev.tool === 'web_search' || ev.tool === 'fetch_url' ? 'net' : 'tool'); orb.pulse(.5); }
      else if (ev.status === 'thinking') setNet('Thinking', 'tool');
      else if (ev.status === 'writing') setNet('');
    };
    const onConfirm = c => { if (c.requestId === myReq && my === run) askApproval(c, my); };
    handlers.chunk.add(onChunk); handlers.event.add(onEvent); handlers.confirm.add(onConfirm);
    const res = await api.send(requestId, p.id, window.NexusChat.toApiMessages(conv.messages, p.id, personas), true);
    handlers.chunk.delete(onChunk); handlers.event.delete(onEvent); handlers.confirm.delete(onConfirm);
    requestId = null;
    setNet(''); $('confirm').hidden = true;

    const record = r => api.conv.append({ role: 'assistant', persona: p.id, content: r.text, model: r.model, via: 'voice', activity: r.activity || [], images: r.images || [], sources: r.sources || [], cards: r.cards || [] });
    if (my !== run) { if (res.ok && !res.aborted && res.text) record(res); return; }
    if (!res.ok) {
      api.conv.append({ role: 'assistant', persona: p.id, content: res.error, error: true });
      return showError(res.error);
    }
    const reply = (res.aborted ? streamed : res.text) || '';
    $('reply').textContent = reply;
    showImages(res.images || []);
    await record({ ...res, text: reply || '(no reply)' });

    setPhase('speaking');
    const said = await speaker.speak(reply);
    if (my !== run) return;
    if (said && said.ok === false) return showError(said.error);
    if (state.settings.voice.continueConversation) return listen();
    setPhase('idle', 'DONE');
    hideSoon((res.images || []).length ? 6000 : 3500);
  }

  function showImages(urls) {
    $('imgs').innerHTML = '';
    for (const u of urls.slice(0, 4)) {
      const img = document.createElement('img');
      img.src = u; img.alt = '';
      img.onerror = () => img.remove();
      img.addEventListener('click', () => /^https?:/.test(u) && api.openExternal(u));
      $('imgs').appendChild(img);
    }
  }

  // Approval: card with buttons, plus a spoken yes/no.
  const YES = /^(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|confirm|approve|approved|send it|please do|affirmative)\b/i;
  const NO = /^(no|nope|nah|cancel|stop|don'?t|do not|deny|denied|negative|never mind)\b/i;
  function resolveConfirm(approve) {
    if (!pendingConfirm) return;
    const c = pendingConfirm; pendingConfirm = null;
    api.confirmReply(c.callId, approve);
    $('confirm').querySelector('.qc-row').innerHTML = `<span>${approve ? 'Approved' : 'Denied'}</span>`;
    setTimeout(() => { $('confirm').hidden = true; }, 900);
    if (phase === 'confirming') { setPhase('thinking'); setNet(approve ? 'Working on it' : 'Cancelled', 'tool'); }
  }
  async function askApproval(c, my) {
    pendingConfirm = { callId: c.callId };
    setPhase('confirming'); setNet('');
    const el = $('confirm');
    el.hidden = false;
    el.innerHTML = '';
    const head = document.createElement('div'); head.innerHTML = '<b></b>'; head.querySelector('b').textContent = c.label;
    const detail = document.createElement('div'); detail.className = 'qc-detail'; detail.textContent = c.detail || '';
    const row = document.createElement('div'); row.className = 'qc-row';
    row.innerHTML = '<span>Say yes or no</span><button class="no">Deny</button><button class="yes">Approve</button>';
    row.querySelector('.yes').addEventListener('click', () => { capture.cancel(); speaker.stop(); resolveConfirm(true); });
    row.querySelector('.no').addEventListener('click', () => { capture.cancel(); speaker.stop(); resolveConfirm(false); });
    el.append(head, detail, row);
    await speaker.speak(`${c.label}. Should I go ahead?`);
    if (!pendingConfirm || my !== run) return;
    try {
      const answer = await capture.start();
      if (!pendingConfirm || my !== run || !answer) return;
      if (YES.test(answer.trim())) resolveConfirm(true);
      else if (NO.test(answer.trim()) || window.NexusChat.stopCommand(answer)) resolveConfirm(false);
    } catch {}
  }

  // One IPC listener per channel, fanned out to the active ask.
  const handlers = { chunk: new Set(), event: new Set(), confirm: new Set() };
  api.onChunk(d => handlers.chunk.forEach(h => h(d)));
  api.onChatEvent(d => handlers.event.forEach(h => h(d)));
  api.onConfirm(d => handlers.confirm.forEach(h => h(d)));

  // Hotkey: start, finish early, or barge in.
  api.onQuickTrigger(() => {
    if (phase === 'listening') return capture.stop();
    if (phase === 'thinking' || phase === 'speaking' || phase === 'confirming') {
      run++;
      speaker.stop(); capture.cancel();
      resolveConfirm(false);
      if (requestId) api.abort(requestId);
    }
    listen();
  });
  api.onQuickEscape(hide);
  $('orbBtn').addEventListener('click', () => { hide(); api.openChat(); });
  $('card').addEventListener('mouseenter', () => { if (phase === 'idle') clearTimeout(hideTimer); });
  $('card').addEventListener('mouseleave', () => { if (phase === 'idle' && $('stage').classList.contains('on')) hideSoon(2000); });

  api.onSettings(s => { state.settings = s; paintAgent(); });
  api.onPersonas(p => { personas = p; paintAgent(); });
  api.onKeys(k => { state.keys = k; });

  paintAgent();
  orb.setColor(active().color, true);
})();
