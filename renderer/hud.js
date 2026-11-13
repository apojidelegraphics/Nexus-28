// Nexus chat HUD: history sidebar, agent dropdown, agent chat with live status, voice, settings.
(async function () {
  const $ = id => document.getElementById(id);
  const { esc } = window.NexusMarkdown;
  const View = window.NexusView;
  const api = window.nexus;

  const boot = await api.init();
  let personas = boot.personas;
  const providers = boot.providers, catalog = boot.features || [];
  let legacyOpen = false;
  const state = { settings: boot.settings, keys: boot.keys, hotkeys: boot.hotkeys, conv: boot.conv, cloud: boot.cloud, access: boot.access || {}, update: boot.update || {}, wake: boot.wake || {} };
  let current = null;            // in-flight request
  let histFilter = '';

  const persona = id => personas.find(p => p.id === id) || personas[0];
  const active = () => persona(state.settings.activePersona);

  const orb = window.NexusOrb.create($('orb'), { color: active().color });
  const speaker = window.NexusVoice.createSpeaker(api, { onLevel: v => orb.setLevel(v) });
  const reader = View.createReader(speaker);
  const vstate = { get settings() { return state.settings; }, get keys() { return state.keys; }, helperBuilt: boot.helper.built };
  const capture = window.NexusVoice.createCapture(api, {
    getState: () => vstate,
    onPartial: t => { $('input').value = t; autosize(); },
    onLevel: v => orb.setLevel(v)
  });

  // ---------- Status, theme, agent chrome
  function applyTheme() { document.documentElement.dataset.theme = state.settings.theme; }
  function setTopStatus(text, kind) {
    const el = $('statusLine');
    el.className = 'status' + (kind ? ' ' + kind : '');
    el.querySelector('span').textContent = text;
  }
  function binding(p) {
    const b = (state.settings.bindings[p.id]?.provider ? state.settings.bindings[p.id] : null) || (p.legacy ? state.settings.legacyBinding : null) || {};
    const prov = providers[b.provider];
    return { provider: b.provider, providerLabel: prov ? prov.label.replace(/ \(.*\)/, '') : '—', model: b.model || prov?.defaultModel || 'unset', noTools: !!prov?.noTools };
  }
  function webAvailable(p) {
    const w = state.settings.web;
    return w.enabled !== false && (p.agentic || w.chatAgents) && !binding(p).noTools;
  }
  function refreshAgent() {
    const p = active(), b = binding(p);
    $('abDot').style.color = p.color; $('abDot').style.background = p.color;
    $('abName').textContent = p.handle.toUpperCase();
    $('abName').style.color = p.color;
    $('abModel').textContent = b.model;
    $('orbLabel').textContent = p.handle.toUpperCase() + (p.agentic ? ' · AGENT' : '');
    $('orbLabel').style.color = p.color;
    orb.setColor(p.color);
    $('omniToggle').classList.toggle('on', !!state.settings.omnibrief);
    const web = webAvailable(p);
    $('webChip').classList.toggle('on', web);
    $('webChip').title = web ? `Web search is on for ${p.handle} (${boot.searchProviders[state.settings.web.provider]?.label || ''})` : p.agentic ? 'Web search is off — click to set up' : `${p.handle} is chat-only; web search is Paragon's (click to change)`;
    const a = state.access[p.id];
    const hint = !a ? '' : a.mode === 'free' ? (a.unlocked ? 'Free Nexus key · unlimited (redeemed)' : a.limit ? `Free Nexus key · ${Math.max(0, a.limit - a.used)} of ${a.limit} ${a.tierLabel} chats left` : 'Free Nexus key · unlimited')
      : a.mode === 'blocked' ? (a.tier === 'ultra' ? 'Ultra tier · add your own key to use Paragon' : 'Free chats used up · redeem an order or add a key') : '';
    $('composerHint').textContent = hint || (p.agentic ? 'Paragon can use connectors' : p.legacy ? 'Classic model · chat only' : 'Chat-only agent');
    $('composerHint').classList.toggle('warn', a?.mode === 'blocked');
    $('featChip').textContent = `@ ${(p.features || []).length} FEATURES`;
    $('featChip').title = (p.features || []).length ? `${p.handle}: ` + p.features.map(f => '@' + f).join(' ') : `${p.handle} has no features`;
  }
  function accessLabel(p) {
    const a = state.access[p.id];
    if (!a) return '';
    if (a.mode === 'own') return 'your key';
    if (a.mode === 'local') return 'local';
    if (a.mode === 'blocked') return a.tier === 'ultra' ? 'needs your key' : a.limit ? `${a.used}/${a.limit} used` : 'no key';
    if (a.unlocked) return '∞ unlocked';
    return a.limit ? `${Math.max(0, a.limit - a.used)} of ${a.limit} free left` : '∞ free';
  }
  // Small ring: free-key chats left (full = all left). Unlimited/own key = full ring, blocked = empty.
  function usageRing(p) {
    const a = state.access[p.id]; if (!a) return '';
    const frac = a.mode === 'blocked' ? 0 : a.mode === 'free' && a.limit && !a.unlocked ? Math.max(0, a.limit - a.used) / a.limit : 1;
    return View.ring(frac, { color: frac === 0 ? '#ff6b6b' : frac < .25 ? '#ffd36b' : p.color, size: 14, title: accessLabel(p) });
  }
  function tierBadge(p) {
    const a = state.access[p.id]; if (!a) return '';
    return `<span class="tier-badge t-${a.tier}">${esc(a.tierLabel.toUpperCase())}</span>`;
  }
  function agentRow(p, key) {
    const b = binding(p);
    return `<div class="am-item ${p.id === state.settings.activePersona ? 'sel' : ''}" data-id="${p.id}">
      <i style="color:${p.color};background:${p.color}"></i>
      <span class="am-name" style="color:${p.color}">${esc(p.name)}</span>
      <span class="am-sub">${usageRing(p)}${esc(accessLabel(p))} · ${esc(b.model)} · ${(p.features || []).length} features</span>
      <span class="am-key">${tierBadge(p)}${p.agentic ? `<span class="am-badge" style="color:${p.color}">AGENT</span>` : ''}${key || ''}</span>
    </div>`;
  }
  function renderAgentMenu() {
    const core = personas.filter(p => !p.legacy), legacy = personas.filter(p => p.legacy);
    const legacyActive = active().legacy;
    const open = legacyOpen || legacyActive;
    $('agentMenu').innerHTML = core.map((p, i) => agentRow(p, `⌘${i + 1}`)).join('') +
      (legacy.length ? `<div class="am-legacy-toggle ${open ? 'open' : ''}" data-legacy><span>CLASSIC MODELS</span><small>${legacy.length}</small><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>
        <div class="am-legacy" ${open ? '' : 'hidden'}>${legacy.map(p => agentRow(p, '')).join('')}</div>` : '') +
      '<div class="am-foot" data-config>Configure models…</div>';
  }
  $('agentBtn').addEventListener('click', e => { e.stopPropagation(); renderAgentMenu(); $('agentMenu').hidden = !$('agentMenu').hidden; });
  $('agentMenu').addEventListener('click', e => {
    if (e.target.closest('[data-config]')) { $('agentMenu').hidden = true; return settings.open('personas'); }
    if (e.target.closest('[data-legacy]')) { legacyOpen = !legacyOpen; e.stopPropagation(); return renderAgentMenu(); }
    const it = e.target.closest('.am-item'); if (!it) return;
    setActive(it.dataset.id); $('agentMenu').hidden = true; $('input').focus();
  });
  document.addEventListener('click', e => { if (!e.target.closest('#agentPicker')) $('agentMenu').hidden = true; });
  async function setActive(id) {
    if (id === state.settings.activePersona) return;
    state.settings = (await api.setSettings({ activePersona: id })).settings;
    refreshAgent(); orb.pulse(.5);
  }

  // ---------- History sidebar
  function groupOf(ts) {
    const d = new Date(ts), now = new Date();
    const day = 86400000, startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= startToday) return 'TODAY';
    if (ts >= startToday - day) return 'YESTERDAY';
    if (ts >= startToday - 7 * day) return 'PREVIOUS 7 DAYS';
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  }
  function renderHistory() {
    const list = state.conv.summary.list.filter(c => !histFilter || c.title.toLowerCase().includes(histFilter));
    const activeId = state.conv.active?.id;
    let html = '', lastGroup = '';
    for (const c of list) {
      const g = groupOf(c.updated);
      if (g !== lastGroup) { html += `<div class="hist-group">${g}</div>`; lastGroup = g; }
      const dots = c.personas.slice(0, 4).map(id => `<i style="color:${persona(id).color};background:${persona(id).color}"></i>`).join('');
      html += `<div class="conv ${c.id === activeId ? 'active' : ''}" data-id="${c.id}" title="${esc(c.title)}">
        <span class="c-title">${esc(c.title)}</span>
        <span class="c-meta">${dots}<span>${c.count} msg</span></span>
        <button class="c-del" data-del title="Delete chat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
    }
    $('history').innerHTML = html || `<div class="hist-empty">${histFilter ? 'No matching chats.' : 'Your chats will appear here.'}</div>`;
  }
  $('history').addEventListener('click', async e => {
    const row = e.target.closest('.conv'); if (!row) return;
    if (e.target.closest('[data-del]')) { await api.conv.remove(row.dataset.id); return; }
    if (current) stop();
    await api.conv.select(row.dataset.id);
  });
  $('histSearch').addEventListener('input', e => { histFilter = e.target.value.trim().toLowerCase(); renderHistory(); });
  $('btnNew').addEventListener('click', newChat);
  $('btnClearAll').addEventListener('click', async e => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'SURE?'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'CLEAR ALL'; }, 3000); return; }
    delete b.dataset.sure; b.textContent = 'CLEAR ALL';
    await api.conv.clearAll();
  });
  async function newChat() {
    if (current) stop();
    reader.stop();
    await api.conv.create();
    $('input').focus();
  }
  api.conv.onChange(c => { state.conv = c; renderHistory(); renderFeed(); });

  // ---------- Feed
  function renderFeed() {
    const feed = $('feed');
    feed.querySelectorAll('.msg:not(.streaming)').forEach(n => n.remove());
    const conv = state.conv.active;
    const msgs = conv?.messages || [];
    $('empty').hidden = msgs.length > 0 || !!current;
    const live = feed.querySelector('.msg.streaming');
    const regenAgents = personas.filter(p => !p.legacy || p.id === active().id);
    msgs.forEach((m, i) => {
      const last = i === msgs.length - 1 && m.role === 'assistant' && !current;
      feed.insertBefore(View.message(m, { personas, api, reader, last, regenAgents,
        onRegenerate: last ? id => regenerate(id) : null,
        onVersion: m.versions ? idx => api.conv.setVersion(conv.id, idx) : null }), live);
    });
    scrollDown(true);
  }
  function scrollDown(force) {
    const f = $('feed');
    if (force || f.scrollHeight - f.scrollTop - f.clientHeight < 140) f.scrollTop = f.scrollHeight;
  }
  View.wireLinks($('feed'), api);
  window.addEventListener('nexus:grew', () => scrollDown());

  // ---------- Attachments (files, images, screen)
  const staged = [];             // composer attachments: { tmp, pending?, error?, ...attachment }
  const pendingJobs = new Set();
  function renderStaged() {
    const tray = $('attTray');
    tray.innerHTML = '';
    if (staged.length) tray.appendChild(View.attachChips(staged, { onRemove: id => { const i = staged.findIndex(a => (a.id || a.tmp) === id || a.tmp === id); if (i >= 0) staged.splice(i, 1); renderStaged(); } }));
    tray.hidden = !staged.length;
  }
  function stage(job, placeholder) {
    const tmp = 't' + Math.random().toString(36).slice(2);
    staged.push({ tmp, pending: true, ...placeholder });
    renderStaged();
    const p = Promise.resolve(job).then(r => {
      const i = staged.findIndex(a => a.tmp === tmp);
      if (i < 0) return;
      if (r && r.ok) staged[i] = { ...r.attachment, tmp };
      else {
        staged[i] = { tmp, kind: placeholder.kind, error: r?.error || 'Could not attach that.' };
        if (r?.permission) setTopStatus('SCREEN RECORDING IS OFF', 'err');
        setTimeout(() => { const j = staged.findIndex(a => a.tmp === tmp); if (j >= 0) { staged.splice(j, 1); renderStaged(); } }, 6000);
      }
      renderStaged();
    }).finally(() => pendingJobs.delete(p));
    pendingJobs.add(p);
    return p;
  }
  const addResults = list => (list || []).forEach(r => stage(r, {}));
  function look() { orb.pulse(.5); return stage(api.screen.capture({ mode: 'window' }), { kind: 'screen' }); }
  const ready = a => a.id && !a.error && !a.pending;
  const plainAtt = a => ({ id: a.id, name: a.name, kind: a.kind, mime: a.mime, thumb: a.thumb, app: a.app, title: a.title, chars: a.chars });

  // ---------- Send (agent)
  async function send({ spoken = false } = {}) {
    if (current) return stop();
    const input = $('input');
    if (pendingJobs.size) { setTopStatus('ATTACHING…', 'live'); await Promise.all([...pendingJobs]); setTopStatus('STANDBY'); }
    const text = input.value.trim();
    const atts = staged.filter(ready).map(plainAtt);
    if (!text && !atts.length) return;
    if (text === '/clear' || text === '/new') { input.value = ''; return newChat(); }
    if (text === '/settings') { input.value = ''; return settings.open(); }

    // calc / convert: answered instantly, no chat used
    const q = !atts.length && await api.quickCalc(text);
    if (q) {
      input.value = ''; autosize(); hideMentions();
      const c = await api.conv.append({ role: 'user', content: text, local: true });
      await api.conv.append({ role: 'assistant', persona: active().id, content: q.text, model: q.kind === 'calc' ? 'Calculator · no chat used' : 'Unit converter · no chat used', local: true, error: !!q.error }, c.id);
      return;
    }

    const mentions = window.NexusChat.parseMentions(text, personas, catalog);
    if (mentions.agent) await setActive(mentions.agent.id);
    input.value = ''; autosize(); hideMentions();
    staged.splice(0, staged.length); renderStaged();
    const conv = await api.conv.append({ role: 'user', content: text, via: spoken ? 'voice' : undefined, ...(atts.length ? { attachments: atts } : {}) });
    await reply({ conv, persona: active(), features: mentions.features, spoken });
  }

  // Run one agent reply for a chat. regenerate → saved as another version of the last reply.
  async function reply({ conv, persona: p, features, spoken = false, regenerate = false }) {
    const b = binding(p);
    const requestId = Math.random().toString(36).slice(2);
    const view = View.streaming(p, b.model);
    current = { requestId, view, text: '', persona: p };
    renderFeed();
    $('feed').appendChild(view.el);
    view.setStatus(View.statusText({ status: 'connecting' }, b.providerLabel));
    setBusy(true);
    const res = await api.send(requestId, p.id, window.NexusChat.toApiMessages(conv.messages, p.id, personas), spoken, features, conv.id);
    const cur = current; current = null; setBusy(false);
    view.el.remove();

    let msg, replyText = null;
    if (!res.ok) { msg = { role: 'assistant', persona: p.id, content: res.error, error: true }; setTopStatus('FAULT', 'err'); }
    else {
      replyText = res.aborted ? (cur.text || res.text || '(stopped)') : res.text;
      msg = { role: 'assistant', persona: p.id, content: replyText || '(no reply)', model: res.model, via: spoken ? 'voice' : undefined,
        activity: res.activity || [], images: res.images || [], sources: res.sources || [], cards: res.cards || [], features: res.features || [], ...(res.attachments?.length ? { attachments: res.attachments } : {}) };
      if (res.rejected?.length) { setTopStatus(`${p.handle.toUpperCase()}: NO @${res.rejected.map(r => r.id.toUpperCase()).join(' @')}`, 'err'); setTimeout(() => setTopStatus('STANDBY'), 4000); }
      else setTopStatus(regenerate ? 'REGENERATED' : 'STANDBY');
      if (regenerate) setTimeout(() => setTopStatus('STANDBY'), 1800);
    }
    if (regenerate) await api.conv.addVersion(conv.id, msg); else await api.conv.append(msg, conv.id);
    if (replyText && spoken && !res.aborted && state.settings.voice.speakChatReplies) {
      setTopStatus('SPEAKING', 'live'); orb.setMode('speaking');
      await speaker.speak(replyText);
      orb.setMode('idle'); setTopStatus('STANDBY');
    }
  }

  // ↻ / ⌘R: ask again (optionally with another agent). Every answer is kept: ‹ 1/3 ›.
  async function regenerate(personaId) {
    if (current) return;
    const conv = state.conv.active;
    const msgs = conv?.messages || [];
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'assistant' || last.local) return;
    const history = msgs.slice(0, -1);
    const lastUser = [...history].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    if (personaId && personaId !== state.settings.activePersona) await setActive(personaId);
    const p = personaId ? persona(personaId) : persona(last.persona || state.settings.activePersona);
    const mentions = window.NexusChat.parseMentions(lastUser.content || '', personas, catalog);
    reader.stop();
    await reply({ conv: { ...conv, messages: history }, persona: p, features: mentions.features, regenerate: true });
  }
  function stop() { if (current) api.abort(current.requestId); }

  api.onChunk(({ requestId, text }) => {
    if (!current || current.requestId !== requestId) return;
    current.text += text;
    current.view.setText(current.text);
    orb.pulse(Math.min(.25, text.length / 60));
    scrollDown();
  });
  api.onChatEvent(ev => {
    if (!current || current.requestId !== ev.requestId) return;
    if (ev.type === 'status') {
      const s = View.statusText(ev, binding(current.persona).providerLabel);
      current.view.setStatus(s);
      if (s.text && ev.status !== 'writing') setTopStatus(s.text.toUpperCase().slice(0, 34), 'live');
      else if (ev.status === 'writing') setTopStatus('TRANSMITTING', 'live');
      if (ev.status === 'tool') orb.pulse(.4);
    } else if (ev.type === 'activity') current.view.activity(ev.activity);
    scrollDown();
  });
  api.onConfirm(c => {
    if (!current || current.requestId !== c.requestId) return;
    current.view.confirm(c, approve => api.confirmReply(c.callId, approve));
    orb.pulse(.6);
    scrollDown(true);
  });

  function setBusy(b) {
    const btn = $('btnSend');
    btn.textContent = b ? 'STOP' : 'SEND';
    btn.classList.toggle('stop', b);
    orb.setMode(b ? 'thinking' : 'idle');
    if (b) setTopStatus('TRANSMITTING', 'live');
  }

  // ---------- Dictation
  async function dictate() {
    if (capture.listening) return capture.stop();
    speaker.stop(); reader.stop();
    $('btnMic').classList.add('live'); setTopStatus('LISTENING', 'live'); orb.setMode('listening');
    try {
      const text = await capture.start();
      const cmd = text && window.NexusChat.stopCommand(text);
      if (cmd) { $('input').value = ''; setTopStatus(cmd); setTimeout(() => setTopStatus('STANDBY'), 1500); return; }
      const spokenTo = text && window.NexusChat.spokenAgent(text);
      if (spokenTo) await setActive(spokenTo.persona);
      if (text) { $('input').value = text; await send({ spoken: true }); }
      else setTopStatus(text === '' ? "DIDN'T CATCH THAT" : 'STANDBY');
    } catch (e) {
      setTopStatus('VOICE FAULT', 'err');
      await api.conv.append({ role: 'assistant', persona: active().id, content: e.message, error: true });
    } finally {
      $('btnMic').classList.remove('live');
      if (!current) orb.setMode('idle');
    }
  }
  $('btnMic').addEventListener('click', dictate);

  // ---------- Composer + @mention menu
  const input = $('input');
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; }
  let menuItems = [], menuSel = 0;
  function mentionQuery() {
    const m = input.value.slice(0, input.selectionStart).match(/(^|\s)@([a-z0-9.]*)$/i);
    return m ? m[2].toLowerCase() : null;
  }
  function updateMentions() {
    const q = mentionQuery();
    if (q === null) return hideMentions();
    menuItems = window.NexusChat.mentionCandidates(q, personas, active(), catalog);
    if (!menuItems.length) return hideMentions();
    menuSel = Math.min(menuSel, menuItems.length - 1);
    let lastKind = '';
    $('mentionMenu').innerHTML = menuItems.map((it, i) => {
      const head = it.kind !== lastKind ? `<div class="mention-head">${it.kind === 'agent' ? 'AGENTS' : `${esc(active().handle.toUpperCase())} FEATURES`}</div>` : '';
      lastKind = it.kind;
      if (it.kind === 'agent') {
        const p = it.p;
        return `${head}<div class="mention-item ${i === menuSel ? 'sel' : ''}" data-i="${i}">
          <i style="color:${p.color};background:${p.color}"></i>@${esc(p.handle)}
          ${p.agentic ? `<span class="m-badge" style="color:${p.color}">AGENT</span>` : ''}${p.legacy ? '<span class="m-badge">CLASSIC</span>' : ''}
          <small>${esc(p.legacy ? p.name : p.tag)}</small></div>`;
      }
      const f = it.f;
      return `${head}<div class="mention-item feat ${i === menuSel ? 'sel' : ''} ${it.available ? '' : 'off'}" data-i="${i}">
        <b class="f-at">@</b>${esc(f.id)}${f.web ? '<span class="m-badge">WEB</span>' : ''}
        <small>${it.available ? esc(f.desc) : 'not on ' + esc(active().handle)}</small></div>`;
    }).join('');
    $('mentionMenu').hidden = false;
  }
  function hideMentions() { $('mentionMenu').hidden = true; menuItems = []; menuSel = 0; }
  function pickMention(i) {
    const it = menuItems[i]; if (!it) return;
    const word = it.kind === 'agent' ? it.p.handle : it.f.id;
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos).replace(/@([a-z0-9.]*)$/i, '@' + word + ' ');
    input.value = before + input.value.slice(pos);
    input.selectionStart = input.selectionEnd = before.length;
    hideMentions(); if (it.kind === 'agent') setActive(it.p.id); input.focus();
  }
  $('mentionMenu').addEventListener('mousedown', e => { const it = e.target.closest('.mention-item'); if (it) { e.preventDefault(); pickMention(+it.dataset.i); } });
  input.addEventListener('input', () => { autosize(); updateMentions(); });
  input.addEventListener('keydown', e => {
    if (menuItems.length && !$('mentionMenu').hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); menuSel = (menuSel + 1) % menuItems.length; return updateMentions(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); menuSel = (menuSel - 1 + menuItems.length) % menuItems.length; return updateMentions(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickMention(menuSel); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return hideMentions(); }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('btnSend').addEventListener('click', () => send());
  async function toggleOmni() {
    state.settings = (await api.setSettings({ omnibrief: !state.settings.omnibrief })).settings;
    refreshAgent();
  }
  $('omniToggle').addEventListener('click', toggleOmni);
  $('webChip').addEventListener('click', () => settings.open('connectors'));
  $('featChip').addEventListener('click', () => {
    const pos = input.selectionStart, v = input.value;
    const pre = v.slice(0, pos) + (pos && !/\s$/.test(v.slice(0, pos)) ? ' @' : '@');
    input.value = pre + v.slice(pos); input.focus(); input.selectionStart = input.selectionEnd = pre.length;
    updateMentions();
  });
  $('lookChip').addEventListener('click', look);
  $('btnAttach').addEventListener('click', async () => addResults(await api.files.pick()));
  input.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    for (const f of files.slice(0, 6)) stage(f.arrayBuffer().then(buf => api.files.addData(f.name || 'pasted', f.type, new Uint8Array(buf))), { name: f.name || 'pasted image' });
  });
  let dragDepth = 0;
  $('shell').addEventListener('dragenter', e => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; $('dropVeil').hidden = false; } });
  $('shell').addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropVeil').hidden = true; } });
  $('shell').addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  $('shell').addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; $('dropVeil').hidden = true;
    const files = [...(e.dataTransfer?.files || [])].slice(0, 6);
    for (const f of files) stage(api.files.add([f]).then(r => r[0]), { name: f.name });
    input.focus();
  });
  api.onHudAttach(({ attachments: list = [], errors = [] }) => {
    for (const a of list) staged.push({ ...a, tmp: 't' + Math.random().toString(36).slice(2) });
    renderStaged();
    if (errors.length) { setTopStatus(errors[0].toUpperCase().slice(0, 40), 'err'); setTimeout(() => setTopStatus('STANDBY'), 4000); }
    input.focus();
  });

  // "Hey Nexus" chip: glow = listening, dim = off, amber = needs a permission or the helper
  function renderWake() {
    const w = state.wake || {}, chip = $('wakeChip');
    chip.classList.toggle('on', !!w.enabled && !w.error);
    chip.classList.toggle('live', !!w.listening);
    chip.classList.toggle('warn', !!w.enabled && !!w.error || (!w.supported && !!w.enabled));
    chip.title = !w.supported ? '"Hey Nexus" needs the NexusCore helper (npm run build:helper)'
      : w.error ? `"Hey Nexus": ${w.error}` : w.enabled ? (w.listening ? '"Hey Nexus" is listening (on this Mac only) · click to turn off' : '"Hey Nexus" is on · paused while you talk to Nexus') : 'Turn on "Hey Nexus"';
  }
  $('wakeChip').addEventListener('click', async () => {
    if (!state.wake?.supported) return settings.open('voice');
    state.wake = await api.wake.set(!state.wake.enabled); renderWake();
  });

  // ⋯ menu: export + feedback
  $('btnChatMenu').addEventListener('click', e => { e.stopPropagation(); $('chatMenu').hidden = !$('chatMenu').hidden; });
  document.addEventListener('click', e => { if (!e.target.closest('.chat-menu-wrap')) $('chatMenu').hidden = true; });
  $('chatMenu').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    $('chatMenu').hidden = true;
    if (b.dataset.feedback !== undefined) return settings.open('general', 'feedback');
    const conv = state.conv.active;
    if (!conv?.messages?.length) { setTopStatus('NOTHING TO EXPORT', 'err'); return setTimeout(() => setTopStatus('STANDBY'), 2000); }
    setTopStatus('EXPORTING…', 'live');
    const r = await api.exportChat(conv.id, b.dataset.export);
    if (r.ok) { setTopStatus('SAVED · ' + r.path.split('/').pop().toUpperCase().slice(0, 28)); api.reveal(r.path); }
    else setTopStatus(r.canceled ? 'STANDBY' : 'EXPORT FAILED', r.canceled ? '' : 'err');
    setTimeout(() => setTopStatus('STANDBY'), 3500);
  });

  api.access.onChange(a => { state.access = a; refreshAgent(); if (!$('agentMenu').hidden) renderAgentMenu(); });
  api.update.onChange(u => { state.update = u; renderBanners(); });
  api.wake.onChange(w => { state.wake = w; renderWake(); });
  api.onPersonas(p => { personas = p; settings.setPersonas?.(p); refreshAgent(); renderHistory(); });

  // ---------- Keybinds
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('agentMenu').hidden) { $('agentMenu').hidden = true; return; }
      if (settings.isOpen()) return settings.close();
      if (capture.listening) return capture.cancel();
      if (current) return stop();
      speaker.stop(); reader.stop();
      return api.hide();
    }
    if (!e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === ',') { e.preventDefault(); return settings.open(); }
    if (k === 'n' || k === 'k') { e.preventDefault(); return newChat(); }
    if (k === 'd') { e.preventDefault(); return dictate(); }
    if (k === 'b') { e.preventDefault(); return toggleOmni(); }
    if (k === 'r') { e.preventDefault(); return regenerate(); }
    if (/^[1-9]$/.test(k)) { const p = personas.filter(x => !x.legacy)[+k - 1]; if (p) { e.preventDefault(); setActive(p.id); } }
  });
  $('btnHide').addEventListener('click', () => api.hide());

  // ---------- Settings overlay
  const settings = window.NexusSettings.mount({
    api, boot, esc, get personas() { return personas; }, providers, speaker, orb, catalog,
    get settings() { return state.settings; }, set settings(v) { state.settings = v; },
    get keys() { return state.keys; }, set keys(v) { state.keys = v; },
    get hotkeys() { return state.hotkeys; }, set hotkeys(v) { state.hotkeys = v; },
    get cloud() { return state.cloud; }, set cloud(v) { state.cloud = v; renderAccountChip(); renderBanners(); },
    get access() { return state.access; }, get update() { return state.update; }, set update(v) { state.update = v; renderBanners(); },
    get wake() { return state.wake; }, set wake(v) { state.wake = v; renderWake(); },
    active, applyTheme, onAgentChange: refreshAgent, onHotkeys: showQuickHint
  });
  $('btnSettings').addEventListener('click', () => settings.open());

  function prettyAccel(a) {
    return (a || '').replace('CommandOrControl', '⌘').replace('Command', '⌘').replace('Control', '⌃').replace('Alt', '⌥').replace('Shift', '⇧').replace(/\+/g, '').replace('Space', ' Space');
  }
  function showQuickHint() {
    $('quickHint').innerHTML = `<kbd>${esc(prettyAccel(state.settings.hotkeyQuickChat))}</kbd> Quick Chat · <kbd>${esc(prettyAccel(state.settings.hotkeyQuick))}</kbd> Quick Ask by voice · <kbd>${esc(prettyAccel(state.settings.hotkeyScreen || 'Alt+Shift+S'))}</kbd> ask about your screen`;
  }

  // ---------- Nexus account chip + announcements
  function renderAccountChip() {
    const a = state.cloud.account;
    const chip = $('accountChip');
    if (a.signedIn) {
      const name = a.username || a.email || 'Nexus user';
      chip.innerHTML = `<span class="avatar">${esc(name[0].toUpperCase())}</span><span class="ac-name">${esc(name)}</span>${a.beta ? '<span class="ac-badge">BETA</span>' : ''}${a.comped ? '<span class="ac-badge">COMPED</span>' : ''}`;
    } else chip.innerHTML = `<span class="avatar off">?</span><span class="ac-name">Sign in to Nexus</span>`;
    chip.title = state.cloud.lastError || (a.signedIn ? 'Nexus account' : 'Optional: sign in with your web Nexus account');
  }
  $('accountChip').addEventListener('click', () => settings.open('account'));
  function renderBanners() {
    const dismissed = state.settings.dismissedAnnouncements || [];
    const u = state.update;
    const items = [
      ...(u.newer && !u.skipped ? [{ id: 'update', kind: 'update', text: `Nexus '28 v${u.latest} is available. You have v${u.current}.` }] : []),
      ...state.cloud.maintenance.map(m => ({ id: 'm-' + m.scope, kind: 'warn', text: m.message || `Maintenance in progress (${m.scope}).` })),
      ...state.cloud.announcements.filter(a => !dismissed.includes(a.id)).map(a => ({ id: a.id, kind: 'info', text: a.message }))
    ];
    $('banners').innerHTML = items.map(b => `<div class="banner ${b.kind}" data-id="${esc(String(b.id))}"><span class="b-dot"></span><span>${esc(b.text)}</span>${b.kind === 'update' ? '<button class="b-btn" data-upopen>Download</button><button class="b-btn ghost" data-upskip>Skip</button>' : ''}${b.kind === 'info' ? '<button class="b-x" title="Dismiss">×</button>' : ''}</div>`).join('');
  }
  $('banners').addEventListener('click', e => {
    if (e.target.closest('[data-upopen]')) return api.update.open();
    if (e.target.closest('[data-upskip]')) { state.update = { ...state.update, skipped: true }; api.update.skip(state.update.latest); return renderBanners(); }
    const b = e.target.closest('.b-x'); if (!b) return;
    const id = +b.closest('.banner').dataset.id;
    state.settings.dismissedAnnouncements = [...(state.settings.dismissedAnnouncements || []), id];
    api.cloud.dismiss(id); renderBanners();
  });
  api.cloud.onChange(c => { state.cloud = c; renderAccountChip(); renderBanners(); if (settings.isOpen() && settings.current() === 'account') settings.refresh(); });

  // ---------- Cross-window sync
  api.onSettings(s => {
    const changed = s.activePersona !== state.settings.activePersona || s.omnibrief !== state.settings.omnibrief;
    const fk = s.freeKey?.enabled !== state.settings.freeKey?.enabled;
    state.settings = s; applyTheme();
    if (changed) refreshAgent();
    if (fk) keyStatus();
  });
  api.onKeys(k => { state.keys = k; keyStatus(); });
  api.onShown(({ panel }) => {
    if (panel === 'settings') settings.open(); else if (panel) settings.open(panel); else if (!settings.isOpen()) input.focus();
    renderWake();
    orb.pulse(.6);
  });

  // ---------- Boot
  applyTheme(); refreshAgent(); renderHistory(); renderFeed(); showQuickHint(); renderAccountChip(); renderBanners(); renderWake();
  orb.setColor(active().color, true);
  function keyStatus() {
    if (Object.keys(state.keys).length) return setTopStatus('STANDBY', '');
    if (state.settings.freeKey?.enabled !== false) return setTopStatus('FREE NEXUS KEY', '');
    setTopStatus('NO KEYS — OPEN SETTINGS', 'err');
  }
  keyStatus();
  input.focus();
})();
