// Quick Ask — Siri-style floating orb. Hotkey: listen → think → speak. Hotkey again to interrupt.
// Voice commands: "goodbye" / "bye" / "sleep" / "thank you" (said on their own) end the session.
// Every time the orb opens it starts a new chat; follow-ups while it's open stay in that chat.
// Enter (or clicking the orb) opens that chat in the chat window.
// Screen questions ("what's on my screen?", "explain this") look at the front window first; follow-ups
// reuse that picture and "look again" takes a new one.
// Conversation mode: after "Hey Nexus" (or always, with hands-free on) it keeps listening after each reply until
// you say "bye" or go quiet, and you can talk over a reply to interrupt it.
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
  const speaker = window.NexusVoice.createSpeaker(api, { onLevel: v => orb.setLevel(v), getSettings: () => state.settings });

  let phase = 'idle';           // idle | listening | thinking | confirming | speaking
  let run = 0;                  // increments to invalidate stale async steps
  let requestId = null;
  let hideTimer = null;
  let pendingConfirm = null;    // { callId, decide }
  let sess = { convId: null, screen: null, conversation: false };   // this orb session's chat, screen capture, conversation mode
  let lastSource = 'hotkey';

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
    $('net').className = 'net' + (kind === 'tool' || kind === 'eye' ? ' ' + kind : '');
    $('netText').textContent = text || '';
  }
  function show() { clearTimeout(hideTimer); $('stage').classList.add('on'); api.quickActive(true); }
  function hideSoon(ms) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, ms); }
  function hide() {
    clearTimeout(hideTimer);
    run++;
    capture.cancel(); bargeCapture.cancel(); speaker.stop();
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
    $('imgs').innerHTML = ''; $('confirm').hidden = true; setNet(''); $('shot').hidden = true;
  }
  function showShot(a) {
    const el = $('shot');
    if (!a) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `${a.thumb ? `<img src="${a.thumb}" alt="">` : ''}<span></span>`;
    el.querySelector('span').textContent = `${a.app || 'Screen'}${a.title ? ' — ' + a.title : ''}`;
  }

  function paintHint() {
    $('hint').innerHTML = sess.conversation
      ? '<b class="conv-tag">CONVERSATION</b> Say <kbd>bye</kbd> to end · talk over me to interrupt · <kbd>Enter</kbd> opens this chat'
      : '<kbd>Enter</kbd> or click the orb to open this chat · <kbd>Esc</kbd> to dismiss';
  }
  async function listen({ followUp = false } = {}) {
    const my = ++run;
    if (!$('stage').classList.contains('on')) { // orb was closed → new chat (and maybe a conversation)
      const v = state.settings.voice;
      sess = { convId: null, screen: null, conversation: !!v.continueConversation || (lastSource === 'wake' && v.conversation !== false) };
    }
    paintHint();
    show();
    if (!followUp) resetCard(); else { $('heard').textContent = ''; setNet(''); }
    setPhase('listening', followUp ? 'LISTENING · SAY BYE TO END' : undefined); orb.pulse(.6);
    let text;
    try { text = await capture.start(); }
    catch (e) { if (my === run) showError(e.message); return; }
    if (my !== run || text === null) return;
    if (!text) { setPhase('idle', followUp ? 'DONE' : "DIDN'T CATCH THAT"); hideSoon(followUp ? 1200 : 1600); return; }
    const cmd = window.NexusChat.stopCommand(text);
    if (cmd) { $('heard').textContent = text; setPhase('idle', cmd); orb.pulse(.8); hideSoon(1100); document.body.dataset.lastEnd = (followUp ? 'followup:' : 'start:') + cmd; return; }
    await ask(text, my);
  }

  // "Hey Nexus, good morning" / "what's my day look like?" → Morning Brief, read out loud.
  const BRIEF = /^(?:hey nexus[, ]+)?(?:good morning|morning brief|(?:give me |read me )?my (?:morning )?brief(?:ing)?|what'?s my day (?:look(?:ing)? like|like)|how does my day look|what'?s (?:on )?(?:my )?(?:agenda|schedule) (?:for )?today)\b/i;
  async function askBrief(text, my) {
    $('heard').textContent = text;
    setPhase('thinking'); setNet('Gathering your Morning Brief', 'tool');
    const r = await api.brief.run();
    if (my !== run) return;
    setNet('');
    if (!r.ok) return showError(r.error || "Couldn't make the brief.");
    sess.convId = r.convId;
    $('reply').textContent = r.text;
    return afterReply(r.text, persona(r.persona || 'flash'), my, 4000);
  }
  // "Every weekday at 8, tell me what's due" → a Routine
  async function askRoutine(text, my, rp) {
    $('heard').textContent = text;
    const saved = await api.routines.save({ prompt: rp.prompt, schedule: rp.schedule, agent: active().id, name: rp.name });
    if (my !== run) return;
    const say = saved.ok ? `Done. ${rp.when.replace(/\bAM\b/, 'a.m.').replace(/\bPM\b/, 'p.m.')}, ${active().handle} will ${rp.prompt.charAt(0).toLowerCase() + rp.prompt.slice(1)}` : saved.error;
    $('reply').textContent = saved.ok ? `⟳ Routine created: ${saved.routine.name} · ${rp.when}` : saved.error;
    setPhase('speaking'); await speaker.speak(say);
    if (my !== run) return;
    setPhase('idle', saved.ok ? 'ROUTINE SAVED' : 'FAULT'); hideSoon(3000);
  }

  // "Watch this window and tell me when the upload finishes" → Watch mode on the window you're using.
  async function askWatch(text, my, condition) {
    $('heard').textContent = text;
    setPhase('thinking'); setNet('Setting up a watch', 'eye');
    const r = await api.watch.front(condition);
    if (my !== run) return;
    setNet('');
    const name = r.ok ? (r.watch.app || r.watch.title || 'that window') : '';
    const say = r.ok ? `Okay, I'm watching ${name}. I'll ${r.watch.condition.replace(/^tell me/, 'tell you')}.` : r.error;
    $('reply').textContent = r.ok ? `👁 Watching ${r.watch.title || name} · ${r.watch.condition}` : r.error;
    if (!r.ok) return showError(r.error);
    setPhase('speaking'); await speaker.speak(say);
    if (my !== run) return;
    setPhase('idle', 'WATCHING'); hideSoon(2500);
    document.body.dataset.lastWatch = r.watch.id;
  }
  // "Explain this" / "what does this mean?" → the highlighted text if there is one, otherwise the screen.
  const SELECTION_INTENT = /\b(explain|define|translate|summari[sz]e|rewrite|reword|simplify|proofread|fix) (this|that|the highlighted|what i (highlighted|selected))\b|\bwhat does (this|that)( word| phrase| sentence)? mean\b|\b(the |what i )(highlighted|selected)( text)?\b/i;

  async function ask(text, my) {
    if (BRIEF.test(text.trim())) return askBrief(text, my);
    const wi = window.NexusChat.watchIntent(text);
    if (wi) return askWatch(text, my, wi);
    if (/^(hey nexus[, ]+)?(every|each)\b/i.test(text.trim())) { const rp = await api.routines.parse(text); if (rp) return askRoutine(text, my, rp); }
    const spoken = window.NexusChat.spokenAgent(text);
    if (spoken && spoken.persona !== state.settings.activePersona) {
      state.settings = (await api.setSettings({ activePersona: spoken.persona })).settings;
      paintAgent();
    }
    const p = active();
    $('heard').textContent = text;
    setPhase('thinking');

    // Screen: look when asked (or "look again"); follow-ups reuse the same capture.
    const C = window.NexusChat;
    let shot = null;
    let sel = null;
    if (SELECTION_INTENT.test(text) && !C.lookAgain(text) && state.settings.voiceSelection !== false) {
      setNet('Reading what you highlighted', 'eye');
      const r = await api.mac.selection({ quiet: true });
      if (my !== run) return;
      if (r.ok) sel = r.attachment;
    }
    if (sel) { shot = sel; sess.screen = null; }
    else if (C.lookAgain(text) || (C.screenIntent(text) && !sess.screen)) {
      setNet('Looking at your screen', 'eye'); orb.pulse(.6);
      const r = await api.screen.capture({ mode: 'window' });
      if (my !== run) return;
      if (!r.ok) {
        setNet('');
        if (r.permission) { api.screen.openPermission(); speaker.speak("I need Screen Recording permission to see your screen. I've opened the setting for you."); }
        return showError(r.error);
      }
      sess.screen = r.attachment; shot = r.attachment;
    } else if (sess.screen) shot = sess.screen;
    showShot(shot);
    setNet(`Connecting to ${providerLabel(p)}`, 'net');

    const conv = await api.conv.append({ role: 'user', content: text, via: 'voice', ...(shot ? { attachments: [{ id: shot.id, name: shot.name, kind: shot.kind, mime: shot.mime, thumb: shot.thumb, app: shot.app, title: shot.title, chars: shot.chars }] } : {}) }, sess.convId || 'new');
    sess.convId = conv.id;
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
    const res = await api.send(requestId, p.id, window.NexusChat.toApiMessages(conv.messages, p.id, personas), true, [], conv.id);
    handlers.chunk.delete(onChunk); handlers.event.delete(onEvent); handlers.confirm.delete(onConfirm);
    requestId = null;
    setNet(''); $('confirm').hidden = true;

    const record = r => api.conv.append(window.NexusChat.replyMessage({ ...r, aborted: false }, p.id, { via: 'voice' }), conv.id);
    if (my !== run) { if (res.ok && !res.aborted && res.text) record(res); return; }
    if (!res.ok) {
      api.conv.append({ role: 'assistant', persona: p.id, content: res.error, error: true }, conv.id);
      return showError(res.error);
    }
    const reply = (res.aborted ? streamed : res.text) || '';
    $('reply').textContent = reply;
    showImages(res.images || []);
    await record({ ...res, text: reply || '(no reply)' });
    return afterReply(reply, res.persona ? persona(res.persona) : p, my, (res.images || []).length ? 6000 : 3500);
  }

  // Speak the reply (with read-along), let you talk over it in conversation mode, then keep listening or finish.
  async function afterReply(reply, p, my, hideMs) {
    $('reply').textContent = reply;
    delete $('reply').dataset.ra;
    setPhase('speaking');
    const r = await speakInterruptible(reply, p, my);
    if (my !== run) return;
    if (r.said && r.said.ok === false) return showError(r.said.error);
    if (r.interrupted) {
      if (r.text === null) return;
      if (!r.text) return listen({ followUp: true });
      const cmd = window.NexusChat.stopCommand(r.text);
      if (cmd) { $('heard').textContent = r.text; setPhase('idle', cmd); orb.pulse(.8); hideSoon(1100); document.body.dataset.lastEnd = 'barge:' + cmd; return; }
      const my2 = ++run;
      resetCard();
      return ask(r.text, my2);
    }
    if (sess.conversation) return listen({ followUp: true });
    setPhase('idle', 'DONE');
    hideSoon(hideMs);
  }

  // Barge-in: while Nexus talks, listen too. Words that aren't in the reply (the mic also hears Nexus) mean you're
  // talking: stop speaking and take what you say as the next question. On-device speech only.
  const bargeCapture = window.NexusVoice.createCapture(api, { getState: () => state, onPartial: t => bargeHandler?.(t) });
  let bargeHandler = null;
  const words = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean);
  async function speakInterruptible(reply, p, my) {
    const ra = state.settings.voice.readAlong !== false && window.NexusView ? window.NexusView.readAlong($('reply')) : null;
    const canBarge = sess.conversation && state.settings.voice.bargeIn !== false && bargeCapture.engine() === 'apple';
    let interrupted = false, speaking = true;
    const speech = speaker.speak(reply, undefined, { persona: p.id, onStart: ra?.start });
    let bargeDone = null;
    if (canBarge) {
      const replyWords = new Set(words(reply));
      bargeHandler = t => {
        if (interrupted) { $('heard').textContent = t; return; }
        const w = words(t);
        const fresh = w.filter(x => !replyWords.has(x));
        // "stop" / "wait" / "bye" count only if Nexus isn't the one saying them.
        const stopNow = (/^(stop|wait|hold on|hang on|never mind)\b/i.test(t.trim()) || window.NexusChat.stopCommand(t)) && w.some(x => !replyWords.has(x));
        if (stopNow || (w.length >= 2 && fresh.length / w.length >= 0.6)) {
          interrupted = true;
          speaker.stop(); ra?.stop();
          setPhase('listening', 'LISTENING'); orb.pulse(.8);
          $('heard').textContent = t;
        }
      };
      // Give the speakers a moment so the start of the reply isn't mistaken for you.
      // The recognizer stops after each pause (often after hearing Nexus itself), so keep restarting it until
      // you interrupt or the reply ends.
      bargeDone = (async () => {
        await new Promise(r => setTimeout(r, 450));
        while (speaking && my === run) {
          const t = await bargeCapture.start().catch(() => null);
          if (interrupted) return t;
          if (t === null && !speaking) break;
        }
        return null;
      })();
    }
    const said = await speech;
    speaking = false;
    ra?.stop();
    if (!canBarge) return { said };
    if (!interrupted) { bargeCapture.cancel(); bargeHandler = null; await bargeDone; return { said }; }
    const text = await bargeDone;
    bargeHandler = null;
    return { interrupted: true, text };
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
  api.onQuickTrigger(d => {
    lastSource = d?.source || 'hotkey';
    if (phase === 'listening') return capture.stop();
    if (phase === 'thinking' || phase === 'speaking' || phase === 'confirming') {
      run++;
      speaker.stop(); capture.cancel(); bargeCapture.cancel();
      resolveConfirm(false);
      if (requestId) api.abort(requestId);
    }
    listen();
  });
  api.onQuickEscape(hide);
  // Enter or a click on the orb: open this session's chat in the chat window.
  const openChat = () => { const id = sess.convId; hide(); api.openChat(id); };
  api.onQuickEnter(openChat);
  $('orbBtn').addEventListener('click', openChat);
  $('card').addEventListener('mouseenter', () => { if (phase === 'idle') clearTimeout(hideTimer); });
  $('card').addEventListener('mouseleave', () => { if (phase === 'idle' && $('stage').classList.contains('on')) hideSoon(2000); });

  api.onSettings(s => { state.settings = s; paintAgent(); });
  api.onPersonas(p => { personas = p; paintAgent(); });
  api.onKeys(k => { state.keys = k; });

  paintAgent(); paintHint();
  orb.setColor(active().color, true);
})();
