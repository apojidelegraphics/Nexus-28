// Quick Chat — a small, movable typing bar for Nexus. Shares the active conversation with the HUD.
(async function () {
  const $ = id => document.getElementById(id);
  const { esc } = window.NexusMarkdown;
  const View = window.NexusView;
  const api = window.nexus;

  const boot = await api.init();
  let personas = boot.personas;
  const providers = boot.providers, catalog = boot.features || [];
  const state = { settings: boot.settings, keys: boot.keys, conv: boot.conv };
  const session = { convId: state.conv.active?.id, msgs: [] }; // what this bar has shown
  let current = null;

  const persona = id => personas.find(p => p.id === id) || personas[0];
  const active = () => persona(state.settings.activePersona);
  const bindOf = p => (state.settings.bindings[p.id]?.provider ? state.settings.bindings[p.id] : null) || (p.legacy ? state.settings.legacyBinding : null) || {};
  const providerLabel = p => (providers[bindOf(p).provider]?.label || '').replace(/ \(.*\)/, '');
  const modelOf = p => { const b = bindOf(p); return b.model || providers[b.provider]?.defaultModel || ''; };

  const speaker = window.NexusVoice.createSpeaker(api);
  const reader = View.createReader(speaker);
  const capture = window.NexusVoice.createCapture(api, {
    getState: () => ({ settings: state.settings, keys: state.keys, helperBuilt: boot.helper.built }),
    onPartial: t => { $('input').value = t; autosize(); }
  });

  // ---------- Size the window to the content
  const fit = () => api.quickChatResize($('qc').getBoundingClientRect().height + 12);
  new ResizeObserver(fit).observe($('qc'));

  function applyChrome() {
    document.documentElement.dataset.theme = state.settings.theme;
    const p = active();
    $('pillDot').style.color = p.color; $('pillDot').style.background = p.color;
    $('pillName').textContent = p.handle.toUpperCase() + (p.agentic ? ' · AGENT' : '');
    $('pillName').style.color = p.color;
    $('omniChip').classList.toggle('on', !!state.settings.omnibrief);
    $('input').placeholder = `Ask ${p.handle}…${p.agentic ? '  (can search & use connectors)' : ''}`;
  }
  function setStatus(s) { $('qcStatus').textContent = s || ''; }

  // ---------- Agents
  function renderAgents() {
    const row = (p, i) => `<div class="al-item ${p.id === state.settings.activePersona ? 'sel' : ''}" data-id="${p.id}">
      <i style="color:${p.color};background:${p.color}"></i><span style="color:${p.color}">${esc(p.handle)}</span>
      <small>${p.agentic ? 'AGENT · ' : ''}${esc(modelOf(p))} ${i >= 0 ? ' · ⌘' + (i + 1) : ''}</small></div>`;
    const core = personas.filter(p => !p.legacy), legacy = personas.filter(p => p.legacy);
    $('agentList').innerHTML = core.map(row).join('') + (legacy.length ? `<div class="al-head">LEGACY MODELS</div>` + legacy.map(p => row(p, -1)).join('') : '');
  }
  $('agentPill').addEventListener('click', () => { renderAgents(); $('agentList').hidden = !$('agentList').hidden; });
  $('agentList').addEventListener('click', e => {
    const it = e.target.closest('.al-item'); if (!it) return;
    setActive(it.dataset.id); $('agentList').hidden = true; $('input').focus();
  });
  async function setActive(id) {
    if (id === state.settings.activePersona) return;
    state.settings = (await api.setSettings({ activePersona: id })).settings;
    applyChrome();
  }

  // ---------- Thread (this bar's recent exchange)
  function renderThread() {
    const t = $('thread');
    const live = t.querySelector('.msg.streaming');
    t.querySelectorAll('.msg:not(.streaming)').forEach(n => n.remove());
    for (const m of session.msgs.slice(-6)) t.insertBefore(View.message(m, { personas, api, reader }), live);
    t.scrollTop = t.scrollHeight;
  }
  View.wireLinks($('thread'), api);
  window.addEventListener('nexus:grew', () => { $('thread').scrollTop = $('thread').scrollHeight; });

  // ---------- Send
  async function send() {
    if (current) return api.abort(current.requestId);
    const input = $('input');
    const text = input.value.trim();
    if (!text) return;
    const mentions = window.NexusChat.parseMentions(text, personas, catalog);
    if (mentions.agent) await setActive(mentions.agent.id);
    input.value = ''; autosize();
    $('agentList').hidden = true;

    const p = active();
    const requestId = Math.random().toString(36).slice(2);
    const userMsg = { role: 'user', content: text, via: 'quickchat' };
    session.msgs.push(userMsg);
    const view = View.streaming(p, modelOf(p));
    current = { requestId, view, text: '', persona: p };
    $('thread').appendChild(view.el);
    renderThread();
    view.setStatus(View.statusText({ status: 'connecting' }, providerLabel(p)));
    setBusy(true);
    const conv = await api.conv.append(userMsg);
    session.convId = conv.id;

    const res = await api.send(requestId, p.id, window.NexusChat.toApiMessages(conv.messages, p.id, personas), false, mentions.features);
    const cur = current; current = null; setBusy(false);
    view.el.remove();
    let msg;
    if (!res.ok) msg = { role: 'assistant', persona: p.id, content: res.error, error: true };
    else msg = { role: 'assistant', persona: p.id, content: (res.aborted ? (cur.text || '(stopped)') : res.text) || '(no reply)', model: res.model, via: 'quickchat',
      activity: res.activity || [], images: res.images || [], sources: res.sources || [], cards: res.cards || [], features: res.features || [] };
    session.msgs.push(msg);
    await api.conv.append(msg);
    renderThread();
    setStatus('');
  }
  function setBusy(b) {
    $('btnSend').textContent = b ? 'STOP' : 'SEND';
    $('btnSend').classList.toggle('stop', b);
  }
  api.onChunk(({ requestId, text }) => {
    if (!current || current.requestId !== requestId) return;
    current.text += text;
    current.view.setText(current.text);
    $('thread').scrollTop = $('thread').scrollHeight;
  });
  api.onChatEvent(ev => {
    if (!current || current.requestId !== ev.requestId) return;
    if (ev.type === 'status') {
      const s = View.statusText(ev, providerLabel(current.persona));
      current.view.setStatus(s);
      setStatus(ev.status === 'writing' ? '' : s.text);
    } else if (ev.type === 'activity') current.view.activity(ev.activity);
  });
  api.onConfirm(c => {
    if (!current || current.requestId !== c.requestId) return;
    current.view.confirm(c, approve => api.confirmReply(c.callId, approve));
    $('thread').scrollTop = $('thread').scrollHeight;
  });

  // ---------- Dictation
  async function dictate() {
    if (capture.listening) return capture.stop();
    $('btnMic').classList.add('live'); setStatus('Listening…');
    try {
      const text = await capture.start();
      const cmd = text && window.NexusChat.stopCommand(text);
      if (cmd) { $('input').value = ''; setStatus(''); return; }
      if (text) { $('input').value = text; send(); }
      else setStatus('');
    } catch (e) { setStatus(e.message); }
    finally { $('btnMic').classList.remove('live'); }
  }

  // ---------- Input + keys
  const input = $('input');
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  $('btnSend').addEventListener('click', send);
  $('btnMic').addEventListener('click', dictate);
  async function toggleOmni() { state.settings = (await api.setSettings({ omnibrief: !state.settings.omnibrief })).settings; applyChrome(); }
  $('omniChip').addEventListener('click', toggleOmni);
  async function newChat() { if (current) api.abort(current.requestId); reader.stop(); await api.conv.create(); session.msgs = []; renderThread(); input.focus(); }
  $('btnNew').addEventListener('click', newChat);
  $('btnOpen').addEventListener('click', () => api.openChat());
  $('btnClose').addEventListener('click', () => api.quickChatHide());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('agentList').hidden) { $('agentList').hidden = true; return; }
      if (capture.listening) return capture.cancel();
      if (current) return api.abort(current.requestId);
      reader.stop();
      return api.quickChatHide();
    }
    if (!e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); newChat(); }
    if (k === 'b') { e.preventDefault(); toggleOmni(); }
    if (k === 'd') { e.preventDefault(); dictate(); }
    if (k === 'o') { e.preventDefault(); api.openChat(); }
    if (/^[1-9]$/.test(k)) { const p = personas.filter(x => !x.legacy)[+k - 1]; if (p) { e.preventDefault(); setActive(p.id); } }
  });

  // ---------- Sync
  api.onSettings(s => { state.settings = s; applyChrome(); });
  api.onPersonas(p => { personas = p; applyChrome(); });
  api.onKeys(k => { state.keys = k; });
  api.conv.onChange(c => {
    state.conv = c;
    if (c.active?.id !== session.convId && !current) { session.convId = c.active?.id; session.msgs = []; renderThread(); }
  });
  api.onQuickChatShown(() => { input.focus(); input.select(); });

  applyChrome();
  fit();
  input.focus();
})();
