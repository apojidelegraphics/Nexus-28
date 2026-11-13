// Quick Chat — a small, movable typing bar. It has its own chat: pick any chat from the dropdown
// (or a new one) without changing what the main chat window shows.
(async function () {
  const $ = id => document.getElementById(id);
  const { esc } = window.NexusMarkdown;
  const View = window.NexusView;
  const api = window.nexus;

  const boot = await api.init();
  let personas = boot.personas;
  const providers = boot.providers, catalog = boot.features || [];
  const state = { settings: boot.settings, keys: boot.keys, conv: boot.conv };
  // The chat this bar types to. null = "New chat" (created on the first message).
  const session = { convId: boot.settings.quickChatConv && boot.conv.summary.list.some(c => c.id === boot.settings.quickChatConv) ? boot.settings.quickChatConv : boot.conv.active?.messages?.length ? boot.conv.active.id : null, conv: null };
  let current = null;
  let chatFilter = '';

  const persona = id => personas.find(p => p.id === id) || personas[0];
  const active = () => persona(state.settings.activePersona);
  const bindOf = p => (state.settings.bindings[p.id]?.provider ? state.settings.bindings[p.id] : null) || (p.legacy ? state.settings.legacyBinding : null) || {};
  const providerLabel = p => (providers[bindOf(p).provider]?.label || '').replace(/ \(.*\)/, '');
  const modelOf = p => { const b = bindOf(p); return b.model || providers[b.provider]?.defaultModel || ''; };

  const speaker = window.NexusVoice.createSpeaker(api, { getSettings: () => state.settings });
  const reader = View.createReader(speaker, { readAlongOn: () => state.settings.voice.readAlong !== false });
  const capture = window.NexusVoice.createCapture(api, {
    getState: () => ({ settings: state.settings, keys: state.keys, helperBuilt: boot.helper.built }),
    onPartial: t => { $('input').value = t; autosize(); }
  });

  // ---------- Size the window to the content
  const fit = () => api.quickChatResize($('qc').getBoundingClientRect().height + 12);
  new ResizeObserver(fit).observe($('qc'));

  function applyChrome() {
    window.NexusTheme.apply(state.settings);
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
    $('agentList').innerHTML = core.map(row).join('') + (legacy.length ? `<div class="al-head">CLASSIC MODELS</div>` + legacy.map(p => row(p, -1)).join('') : '');
  }
  $('agentPill').addEventListener('click', () => { renderAgents(); $('chatList').hidden = true; $('agentList').hidden = !$('agentList').hidden; });
  $('agentList').addEventListener('click', e => {
    const it = e.target.closest('.al-item'); if (!it) return;
    setActive(it.dataset.id); $('agentList').hidden = true; $('input').focus();
  });
  async function setActive(id) {
    if (id === state.settings.activePersona) return;
    state.settings = (await api.setSettings({ activePersona: id })).settings;
    applyChrome();
  }

  // ---------- Chat picker
  const when = ts => { const d = Date.now() - ts; return d < 60e3 ? 'now' : d < 3600e3 ? Math.round(d / 60e3) + 'm' : d < 86400e3 ? Math.round(d / 3600e3) + 'h' : new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };
  function chatTitle() { return session.convId ? (state.conv.summary.list.find(c => c.id === session.convId)?.title || session.conv?.title || 'Chat') : 'New chat'; }
  function renderChatPick() { $('chatPickName').textContent = chatTitle(); $('chatPick').title = `Typing to: ${chatTitle()} · click to choose another chat`; }
  function renderChatList() {
    const list = state.conv.summary.list.filter(c => !chatFilter || c.title.toLowerCase().includes(chatFilter)).slice(0, 60);
    const spaces = state.conv.summary.spaces || [];
    const row = c => `<div class="cl-item ${c.id === session.convId ? 'sel' : ''}" data-id="${esc(c.id)}">
        <span class="cl-dots">${c.personas.slice(0, 3).map(id => `<i style="background:${persona(id).color};color:${persona(id).color}"></i>`).join('')}</span>
        <span class="cl-title">${esc(c.title)}</span>${c.id === state.conv.active?.id ? '<em>IN CHAT WINDOW</em>' : ''}<small>${when(c.updated)}</small></div>`;
    // Group by space (chats without a space first).
    const groups = [{ sp: null, items: list.filter(c => !c.spaceId || !spaces.some(x => x.id === c.spaceId)) },
      ...spaces.map(sp => ({ sp, items: list.filter(c => c.spaceId === sp.id) }))].filter(g => g.items.length);
    $('chatItems').innerHTML = `<div class="cl-item new ${!session.convId ? 'sel' : ''}" data-id=""><b>＋</b><span>New chat</span><small>⌘N</small></div>` +
      groups.map(g => (g.sp ? `<div class="cl-group"><i style="background:${g.sp.color}"></i>${esc(g.sp.name.toUpperCase())}</div>` : (spaces.length ? '<div class="cl-group">CHATS</div>' : '')) + g.items.map(row).join('')).join('') +
      (!list.length && chatFilter ? '<div class="cl-empty">No matching chats.</div>' : '');
  }
  $('chatPick').addEventListener('click', () => {
    const open = $('chatList').hidden;
    $('agentList').hidden = true;
    $('chatList').hidden = !open;
    if (open) { chatFilter = ''; $('chatSearch').value = ''; renderChatList(); $('chatSearch').focus(); }
  });
  $('chatSearch').addEventListener('input', e => { chatFilter = e.target.value.trim().toLowerCase(); renderChatList(); });
  $('chatSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') { const first = $('chatItems').querySelector('.cl-item:not(.new)') || $('chatItems').querySelector('.cl-item'); if (first) pickChat(first.dataset.id || null); }
    if (e.key === 'Escape') { e.stopPropagation(); $('chatList').hidden = true; $('input').focus(); }
  });
  $('chatItems').addEventListener('click', e => { const it = e.target.closest('.cl-item'); if (it) pickChat(it.dataset.id || null); });
  async function pickChat(id) {
    if (current) api.abort(current.requestId);
    reader.stop();
    session.convId = id; session.conv = id ? await api.conv.get(id) : null;
    api.setSettings({ quickChatConv: id || '' });
    $('chatList').hidden = true;
    renderChatPick(); renderThread(); $('input').focus();
  }

  // ---------- Thread (last few messages of this bar's chat)
  function renderThread() {
    const t = $('thread');
    const live = t.querySelector('.msg.streaming');
    t.querySelectorAll('.msg:not(.streaming), .thread-more').forEach(n => n.remove());
    const msgs = (session.conv?.messages || []).filter(m => !m.hidden);
    const shown = msgs.slice(-6);
    if (msgs.length > shown.length) {
      const more = document.createElement('button');
      more.className = 'thread-more'; more.textContent = `${msgs.length - shown.length} earlier messages · open in chat window`;
      more.addEventListener('click', () => api.openChat(session.convId));
      t.insertBefore(more, live);
    }
    const regenAgents = personas.filter(p => !p.legacy || p.id === active().id);
    shown.forEach((m, i) => {
      const last = i === shown.length - 1 && m.role === 'assistant' && !current;
      t.insertBefore(View.message(m, { personas, api, reader, last: last && !m.huddle && !m.debate, regenAgents, convId: session.convId, onAsk: text => { if (current) return; $('input').value = text; send(); }, onRegenerate: last ? id => regenerate(id) : null,
        onVersion: m.versions ? idx => api.conv.setVersion(session.convId, idx).then(c => { session.conv = c; renderThread(); }) : null }), live);
    });
    t.scrollTop = t.scrollHeight;
  }
  View.wireLinks($('thread'), api);
  window.addEventListener('nexus:grew', () => { $('thread').scrollTop = $('thread').scrollHeight; });

  // ---------- Attachments
  const staged = [], jobs = new Set();
  function renderStaged() {
    $('attTray').innerHTML = '';
    if (staged.length) $('attTray').appendChild(View.attachChips(staged, { onRemove: id => { const i = staged.findIndex(a => (a.id || a.tmp) === id || a.tmp === id); if (i >= 0) staged.splice(i, 1); renderStaged(); } }));
    $('attTray').hidden = !staged.length;
  }
  function stage(job, placeholder = {}) {
    const tmp = 't' + Math.random().toString(36).slice(2);
    staged.push({ tmp, pending: true, ...placeholder }); renderStaged();
    const p = Promise.resolve(job).then(r => {
      const i = staged.findIndex(a => a.tmp === tmp); if (i < 0) return;
      staged[i] = r?.ok ? { ...r.attachment, tmp } : { tmp, kind: placeholder.kind, error: r?.error || 'Could not attach that.' };
      if (!r?.ok) setTimeout(() => { const j = staged.findIndex(a => a.tmp === tmp); if (j >= 0) { staged.splice(j, 1); renderStaged(); } }, 6000);
      renderStaged();
    }).finally(() => jobs.delete(p));
    jobs.add(p); return p;
  }
  $('lookChip').addEventListener('click', () => stage(api.screen.capture({ mode: 'window' }), { kind: 'screen' }));
  $('btnAttach').addEventListener('click', async () => (await api.files.pick()).forEach(r => stage(r)));
  api.onQuickChatAttach(({ attachment, error, explain, accessibility }) => {
    $('axHelp').hidden = !accessibility;
    if (attachment) {
      if (explain) for (let i = staged.length - 1; i >= 0; i--) if (staged[i].explain) staged.splice(i, 1); // one highlight at a time
      staged.push({ ...attachment, tmp: 't' + Math.random().toString(36).slice(2), explain: !!explain }); renderStaged(); setStatus('');
    } else if (error && !accessibility) setStatus(error);
    showExplain(explain || null);
    $('input').focus();
  });
  $('axOpen').addEventListener('click', () => { api.mac.axOpen(); $('axHelp').hidden = true; });

  // ---------- Explain this: the highlighted text + one-tap actions
  const EXPLAIN_ACTIONS = [
    ['EXPLAIN', 'Explain this in plain words. Keep it short, then give one example.'],
    ['SIMPLIFY', "Explain this like I'm 12."],
    ['SUMMARIZE', 'Summarize this in 3 bullet points.'],
    ['REWRITE', 'Rewrite this to be clearer and better written. Keep the meaning and the tone.'],
    ['FIX GRAMMAR', 'Fix the spelling and grammar. Reply with only the corrected text.'],
    ['TRANSLATE', 'Translate this to English. If it is already English, translate it to Spanish.'],
    ['DEFINE', 'Define the key terms in this.']
  ];
  function showExplain(x) {
    $('explainBar').hidden = !x;
    if (!x) return;
    $('xbApp').textContent = x.app ? `from ${x.app} · ${x.chars} chars` : `${x.chars} chars`;
    $('xbPreview').textContent = x.preview + (x.chars > x.preview.length ? '…' : '');
    $('xbChips').innerHTML = EXPLAIN_ACTIONS.map(([l], i) => `<button class="chip" data-i="${i}">${l}</button>`).join('');
  }
  $('xbChips').addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    $('input').value = EXPLAIN_ACTIONS[+b.dataset.i][1]; autosize(); send();
  });
  $('xbClose').addEventListener('click', () => {
    for (let i = staged.length - 1; i >= 0; i--) if (staged[i].explain) staged.splice(i, 1);
    renderStaged(); showExplain(null); $('input').focus();
  });

  // ---------- Clipboard history
  let clipItems = [];
  const ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'now' : m < 60 ? m + 'm' : Math.round(m / 60) + 'h'; };
  function renderClips() {
    $('clipItems').innerHTML = clipItems.length ? clipItems.slice(0, 25).map(c => `<div class="clip-item" data-id="${esc(c.id)}"><span>${esc(c.text.replace(/\s+/g, ' ').slice(0, 140))}</span><small>${c.chars > 140 ? Math.round(c.chars / 100) / 10 + 'k · ' : ''}${ago(c.at)}</small></div>`).join('')
      : `<div class="cl-empty">${state.settings.clipboard?.history === false ? 'Clipboard history is off (Settings → Mac).' : 'Copy something and it shows up here. Passwords are skipped.'}</div>`;
  }
  $('btnClip').addEventListener('click', async () => {
    const open = $('clipList').hidden;
    $('agentList').hidden = true; $('chatList').hidden = true; $('clipList').hidden = !open;
    if (open) { clipItems = await api.clip.list(); renderClips(); }
  });
  api.clip.onChange(list => { clipItems = list; if (!$('clipList').hidden) renderClips(); });
  $('clipClear').addEventListener('click', async () => { clipItems = await api.clip.clear(); renderClips(); });
  $('clipItems').addEventListener('click', e => {
    const it = e.target.closest('.clip-item'); if (!it) return;
    const c = clipItems.find(x => x.id === it.dataset.id); if (!c) return;
    $('clipList').hidden = true;
    if (e.shiftKey || c.text.length > 600) stage(api.clip.attach(c.id), { kind: 'text', name: 'Copied text' });
    else { const inp = $('input'); const at = inp.selectionStart ?? inp.value.length; inp.value = inp.value.slice(0, at) + c.text + inp.value.slice(inp.selectionEnd ?? at); autosize(); }
    $('input').focus();
  });
  document.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); $('qc').classList.add('dropping'); } });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) $('qc').classList.remove('dropping'); });
  document.addEventListener('drop', e => {
    e.preventDefault(); $('qc').classList.remove('dropping');
    for (const f of [...(e.dataTransfer?.files || [])].slice(0, 6)) stage(api.files.add([f]).then(r => r[0]), { name: f.name });
  });
  $('input').addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])]; if (!files.length) return;
    e.preventDefault();
    for (const f of files.slice(0, 6)) stage(f.arrayBuffer().then(b => api.files.addData(f.name || 'pasted', f.type, new Uint8Array(b))), { name: f.name || 'pasted image' });
  });

  // ---------- Send
  async function send() {
    if (current) return api.abort(current.requestId);
    const input = $('input');
    if (jobs.size) { setStatus('Attaching…'); await Promise.all([...jobs]); setStatus(''); }
    const text = input.value.trim();
    const atts = staged.filter(a => a.id && !a.error && !a.pending).map(a => ({ id: a.id, name: a.name, kind: a.kind, mime: a.mime, thumb: a.thumb, app: a.app, title: a.title, chars: a.chars }));
    if (!text && !atts.length) return;
    $('agentList').hidden = true; $('chatList').hidden = true; $('clipList').hidden = true;
    showExplain(null); $('axHelp').hidden = true;

    const gi = !atts.length && window.NexusChat.groupIntent(text, personas);
    if (gi) {
      input.value = ''; autosize();
      const usable = id => personas.some(p => p.id === id && !p.legacy);
      const hs = state.settings.huddle || {};
      const c = await api.conv.append({ role: 'user', content: text, via: 'quickchat' }, session.convId || 'new');
      session.convId = c.id; api.setSettings({ quickChatConv: c.id }); renderChatPick();
      setStatus(gi.kind === 'huddle' ? 'Huddle in progress…' : 'Debate in progress…'); setBusy(true);
      if (gi.kind === 'huddle') {
        const list = (gi.agents.length >= 2 ? gi.agents : hs.agents || ['neodela', 'lyte', 'flash']).filter(usable).slice(0, 4);
        const r = await api.group.huddle({ convId: c.id, agents: list, synth: gi.agents.length >= 2 ? list[0] : hs.synth || list[0] });
        if (!r.ok) setStatus(r.error || 'Huddle failed');
      } else {
        const ids = personas.filter(p => !p.legacy).map(p => p.id).filter(id => id !== 'paragon');
        const r = await api.group.debate({ convId: c.id, topic: gi.topic, pro: ids[0], con: ids[1], judge: ids[2] || '', rounds: 2 });
        if (!r.ok) setStatus(r.error || 'Debate failed');
      }
      setBusy(false); setStatus('');
      session.conv = await api.conv.get(session.convId); renderThread();
      return;
    }
    const wi = !atts.length && window.NexusChat.watchIntent(text);
    if (wi) {
      input.value = ''; autosize();
      const r = await api.watch.front(wi);
      const c = await api.conv.append({ role: 'user', content: text, via: 'quickchat', local: true }, session.convId || 'new');
      session.convId = c.id;
      session.conv = await api.conv.append({ role: 'assistant', persona: active().id, local: true, error: !r.ok, via: 'quickchat', model: 'Watch mode · AI only when it changes',
        content: r.ok ? `👁 **Watching ${r.watch.title || r.watch.app || 'the window'}.** I'll ${r.watch.condition.replace(/^tell me/, 'tell you')}. I read it every ${r.watch.interval} s on this Mac and only ask AI when something changed${r.watch.localOnly ? ' (this one needs no AI at all)' : ''}.` : r.error }, c.id);
      renderChatPick(); renderThread();
      return;
    }
    const rp = !atts.length && /^(hey nexus[, ]+)?(every|each)\b/i.test(text) && await api.routines.parse(text);
    if (rp) {
      input.value = ''; autosize();
      const saved = await api.routines.save({ prompt: rp.prompt, schedule: rp.schedule, agent: active().id, name: rp.name });
      const c = await api.conv.append({ role: 'user', content: text, via: 'quickchat', local: true }, session.convId || 'new');
      session.convId = c.id;
      session.conv = await api.conv.append({ role: 'assistant', persona: active().id, local: true, model: 'Routines · no chat used', error: !saved.ok, via: 'quickchat',
        content: saved.ok ? `⟳ **Routine created:** ${saved.routine.name} · ${rp.when}. Runs post in the Routines space.` : saved.error }, c.id);
      renderChatPick(); renderThread();
      return;
    }
    const q = !atts.length && await api.quickCalc(text);
    if (q) {
      input.value = ''; autosize();
      const c = await api.conv.append({ role: 'user', content: text, via: 'quickchat', local: true }, session.convId || 'new');
      session.convId = c.id;
      session.conv = await api.conv.append({ role: 'assistant', persona: active().id, content: q.text, model: q.kind === 'calc' ? 'Calculator · no chat used' : 'Unit converter · no chat used', local: true, error: !!q.error, via: 'quickchat' }, c.id);
      api.setSettings({ quickChatConv: c.id });
      renderChatPick(); renderThread();
      return;
    }

    const mentions = window.NexusChat.parseMentions(text, personas, catalog);
    if (mentions.agent) await setActive(mentions.agent.id);
    input.value = ''; autosize();
    staged.splice(0, staged.length); renderStaged();
    const conv = await api.conv.append({ role: 'user', content: text, via: 'quickchat', ...(atts.length ? { attachments: atts } : {}) }, session.convId || 'new');
    if (session.convId !== conv.id) api.setSettings({ quickChatConv: conv.id });
    session.convId = conv.id; session.conv = conv;
    renderChatPick();
    await reply({ conv, persona: active(), features: mentions.features });
  }
  async function reply({ conv, persona: p, features, regenerate = false }) {
    const requestId = Math.random().toString(36).slice(2);
    const view = View.streaming(p, modelOf(p));
    current = { requestId, view, text: '', persona: p };
    renderThread();
    $('thread').appendChild(view.el);
    $('thread').scrollTop = $('thread').scrollHeight;
    view.setStatus(View.statusText({ status: 'connecting' }, providerLabel(p)));
    setBusy(true);
    const res = await api.send(requestId, p.id, window.NexusChat.toApiMessages(conv.messages, p.id, personas), false, features, conv.id);
    const cur = current; current = null; setBusy(false);
    view.el.remove();
    const msg = window.NexusChat.replyMessage(res, p.id, { via: 'quickchat' }, cur.text);
    if (res.ok && !res.aborted && res.featureData?.speak && msg.content) speaker.speak(msg.content, undefined, { persona: msg.persona });
    session.conv = regenerate ? await api.conv.addVersion(conv.id, msg) : await api.conv.append(msg, conv.id);
    renderThread();
    setStatus('');
  }
  async function regenerate(personaId) {
    if (current || !session.conv) return;
    const msgs = session.conv.messages, last = msgs[msgs.length - 1];
    if (!last || last.role !== 'assistant' || last.local) return;
    const history = msgs.slice(0, -1);
    const lastUser = [...history].reverse().find(m => m.role === 'user'); if (!lastUser) return;
    if (personaId) await setActive(personaId);
    const p = personaId ? persona(personaId) : persona(last.persona || state.settings.activePersona);
    reader.stop();
    await reply({ conv: { ...session.conv, messages: history }, persona: p, features: window.NexusChat.parseMentions(lastUser.content || '', personas, catalog).features, regenerate: true });
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
  $('btnNew').addEventListener('click', () => pickChat(null));
  $('btnOpen').addEventListener('click', () => api.openChat(session.convId));
  $('btnClose').addEventListener('click', () => api.quickChatHide());
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('agentList').hidden) { $('agentList').hidden = true; return; }
      if (!$('chatList').hidden) { $('chatList').hidden = true; return; }
      if (capture.listening) return capture.cancel();
      if (current) return api.abort(current.requestId);
      reader.stop();
      return api.quickChatHide();
    }
    if (!e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'n') { e.preventDefault(); pickChat(null); }
    if (k === 'b') { e.preventDefault(); toggleOmni(); }
    if (k === 'd') { e.preventDefault(); dictate(); }
    if (k === 'o') { e.preventDefault(); api.openChat(session.convId); }
    if (k === 'r') { e.preventDefault(); regenerate(); }
    if (k === 'l') { e.preventDefault(); $('lookChip').click(); }
    if (/^[1-9]$/.test(k)) { const p = personas.filter(x => !x.legacy)[+k - 1]; if (p) { e.preventDefault(); setActive(p.id); } }
  });

  // ---------- Sync
  api.onSettings(s => { state.settings = s; applyChrome(); });
  api.onPersonas(p => { personas = p; applyChrome(); });
  api.onFeatures(({ catalog: c, personas: ps }) => { catalog.splice(0, catalog.length, ...c); personas = ps; applyChrome(); });
  api.onKeys(k => { state.keys = k; });
  api.conv.onChange(async c => {
    state.conv = c;
    if (session.convId && !c.summary.list.some(x => x.id === session.convId) && !current) { session.convId = null; session.conv = null; renderThread(); }
    else if (session.convId && !current) { session.conv = await api.conv.get(session.convId); renderThread(); }
    renderChatPick();
    if (!$('chatList').hidden) renderChatList();
  });
  api.onQuickChatShown(async () => {
    if (session.convId) session.conv = await api.conv.get(session.convId);
    renderChatPick(); renderThread();
    input.focus(); input.select();
  });

  if (session.convId) session.conv = await api.conv.get(session.convId);
  applyChrome(); renderChatPick(); renderThread();
  fit();
  input.focus();
})();
