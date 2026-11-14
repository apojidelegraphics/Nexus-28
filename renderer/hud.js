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
  let spaceFilter = null;        // null = all chats
  let mission = boot.mission || null;
  const bgConfirms = [];         // approvals waiting from Routines / Missions
  let briefBanner = null;
  let groupLive = null, groupRun = null;   // huddle/debate in progress
  let routinesList = boot.routines || [];
  const VER = String(boot.version || '').split('.').slice(0, 2).join('.');

  const persona = id => personas.find(p => p.id === id) || personas[0];
  const active = () => persona(state.settings.activePersona);

  const orb = window.NexusOrb.create($('orb'), { color: active().color, skin: boot.flags?.flags?.orb_skins?.on ? boot.settings.orbSkin || 'aurora' : 'aurora' });
  const speaker = window.NexusVoice.createSpeaker(api, { onLevel: v => orb.setLevel(v), getSettings: () => state.settings });
  const reader = View.createReader(speaker, { readAlongOn: () => state.settings.voice.readAlong !== false });
  const vstate = { get settings() { return state.settings; }, get keys() { return state.keys; }, helperBuilt: boot.helper.built };
  const capture = window.NexusVoice.createCapture(api, {
    getState: () => vstate,
    onPartial: t => { $('input').value = t; autosize(); },
    onLevel: v => orb.setLevel(v)
  });

  // ---------- Status, theme, agent chrome
  function applyTheme() { window.NexusTheme.apply(state.settings); }
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
    const spaces = state.conv.summary.spaces || [];
    const spaceOf = id => spaces.find(x => x.id === id);
    const list = state.conv.summary.list.filter(c => (!histFilter || c.title.toLowerCase().includes(histFilter)) && (!spaceFilter || c.spaceId === spaceFilter))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));   // pinned chats first (stable, so the rest stays newest-first)
    const activeId = state.conv.active?.id;
    let html = '', lastGroup = '';
    for (const c of list) {
      const g = c.pinned ? '📌 PINNED' : groupOf(c.updated);
      if (g !== lastGroup) { html += `<div class="hist-group">${g}</div>`; lastGroup = g; }
      const dots = c.personas.slice(0, 4).map(id => `<i style="color:${persona(id).color};background:${persona(id).color}"></i>`).join('');
      const sp = !spaceFilter && c.spaceId ? spaceOf(c.spaceId) : null;
      html += `<div class="conv ${c.id === activeId ? 'active' : ''}" data-id="${c.id}" title="${esc(c.title)}${sp ? ' · ' + esc(sp.name) : ''}" draggable="true">
        <span class="c-title">${sp ? `<i class="c-space" style="background:${sp.color}"></i>` : ''}${esc(c.title)}</span>
        <span class="c-meta">${dots}<span>${c.count} msg</span></span>
        <button class="c-pin ${c.pinned ? 'on' : ''}" data-pin title="${c.pinned ? 'Unpin' : 'Pin to top'}">📌</button>
        <button class="c-del" data-del title="Delete chat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>`;
    }
    $('history').innerHTML = html || `<div class="hist-empty">${histFilter ? 'No matching chats.' : spaceFilter ? 'No chats in this space yet. Start one, or drag chats here.' : 'Your chats will appear here.'}</div>`;
    renderSpaces();
  }

  // ---------- Spaces (chat folders)
  const SPACE_COLORS = ['#3dffa0', '#5ce1ff', '#c3a6ff', '#ffd36b', '#ff8fa3', '#8affc1', '#ffb38a', '#9ad0ff'];
  function renderSpaces() {
    const spaces = state.conv.summary.spaces || [];
    if (spaceFilter && !spaces.some(x => x.id === spaceFilter)) spaceFilter = null;
    const count = id => state.conv.summary.list.filter(c => c.spaceId === id).length;
    $('spaces').innerHTML = `<button class="sp-chip ${!spaceFilter ? 'sel' : ''}" data-space="">ALL</button>` +
      spaces.map(x => `<button class="sp-chip ${spaceFilter === x.id ? 'sel' : ''}" data-space="${esc(x.id)}" title="${esc(x.name)} · ${count(x.id)} chats${x.agent ? ' · starts with ' + esc(persona(x.agent).handle) : ''} · right-click to edit">
        <i style="background:${x.color};color:${x.color}"></i>${esc(x.name)}</button>`).join('') +
      `<button class="sp-chip add" data-addspace title="New space">＋</button>`;
  }
  $('spaces').addEventListener('click', async e => {
    if (e.target.closest('[data-addspace]')) {
      const sp = await api.spaces.add({ name: 'New space' });
      spaceFilter = sp.id; return openSpaceEditor(sp.id);
    }
    const b = e.target.closest('[data-space]'); if (!b) return;
    spaceFilter = b.dataset.space || null;
    renderHistory();
  });
  $('spaces').addEventListener('contextmenu', e => { const b = e.target.closest('[data-space]'); if (b?.dataset.space) { e.preventDefault(); openSpaceEditor(b.dataset.space); } });
  $('spaces').addEventListener('dblclick', e => { const b = e.target.closest('[data-space]'); if (b?.dataset.space) openSpaceEditor(b.dataset.space); });
  // Drag a chat onto a space (or ALL to take it out).
  $('history').addEventListener('dragstart', e => { const row = e.target.closest('.conv'); if (row) { e.dataTransfer.setData('nexus/conv', row.dataset.id); e.dataTransfer.effectAllowed = 'move'; } });
  $('spaces').addEventListener('dragover', e => { if (e.dataTransfer.types.includes('nexus/conv') && e.target.closest('[data-space]')) { e.preventDefault(); e.target.closest('[data-space]').classList.add('drop'); } });
  $('spaces').addEventListener('dragleave', e => e.target.closest?.('[data-space]')?.classList.remove('drop'));
  $('spaces').addEventListener('drop', async e => {
    const b = e.target.closest('[data-space]'); const id = e.dataTransfer.getData('nexus/conv');
    if (!b || !id) return;
    e.preventDefault(); b.classList.remove('drop');
    await api.conv.move(id, b.dataset.space || null);
  });
  function openSpaceEditor(id) {
    const sp = (state.conv.summary.spaces || []).find(x => x.id === id); if (!sp) return;
    document.querySelectorAll('.space-editor').forEach(n => n.remove());
    const ed = document.createElement('div');
    ed.className = 'space-editor';
    const core = personas.filter(p => !p.legacy);
    ed.innerHTML = `<div class="se-head">EDIT SPACE</div>
      <input class="se-name" value="${esc(sp.name)}" maxlength="32" spellcheck="false">
      <div class="se-colors">${SPACE_COLORS.map(c => `<button data-color="${c}" class="${c === sp.color ? 'sel' : ''}" style="background:${c}"></button>`).join('')}</div>
      <label class="se-row">New chats start with <select class="se-agent"><option value="">current agent</option>${core.map(p => `<option value="${p.id}" ${sp.agent === p.id ? 'selected' : ''}>${esc(p.handle)}</option>`).join('')}</select></label>
      <div class="se-note">${(sp.links || []).length ? `${sp.links.length} chat${sp.links.length === 1 ? '' : 's'} pinned to this space` : 'Tip: ⇧-click a linked chat\'s pin to pin it to the whole space.'}</div>
      <div class="se-actions"><button class="se-del">Delete space</button><button class="se-done">Done</button></div>`;
    $('spaces').after(ed);
    ed.style.top = ($('spaces').offsetTop + $('spaces').offsetHeight + 4) + 'px';
    setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!ed.contains(e.target) && !e.target.closest('.sp-chip')) { ed.remove(); document.removeEventListener('mousedown', off); } }), 0);
    const nameIn = ed.querySelector('.se-name');
    nameIn.focus(); nameIn.select();
    const save = patch => api.spaces.update(id, patch);
    nameIn.addEventListener('change', () => save({ name: nameIn.value }));
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { save({ name: nameIn.value }); ed.remove(); } if (e.key === 'Escape') { e.stopPropagation(); ed.remove(); } });
    ed.querySelector('.se-colors').addEventListener('click', e => { const c = e.target.closest('[data-color]'); if (!c) return; ed.querySelectorAll('.se-colors button').forEach(b => b.classList.toggle('sel', b === c)); save({ color: c.dataset.color }); });
    ed.querySelector('.se-agent').addEventListener('change', e => save({ agent: e.target.value }));
    ed.querySelector('.se-done').addEventListener('click', () => { save({ name: nameIn.value }); ed.remove(); });
    ed.querySelector('.se-del').addEventListener('click', async e => {
      if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'Chats stay. Sure?'; return; }
      await api.spaces.remove(id); spaceFilter = null; ed.remove();
    });
  }
  $('history').addEventListener('click', async e => {
    const row = e.target.closest('.conv'); if (!row) return;
    if (e.target.closest('[data-del]')) { await api.conv.remove(row.dataset.id); return; }
    if (e.target.closest('[data-pin]')) { await api.conv.pin(row.dataset.id, !e.target.closest('[data-pin]').classList.contains('on')); return; }
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
    await api.conv.create(spaceFilter);
    const sp = spaceFilter && (state.conv.summary.spaces || []).find(x => x.id === spaceFilter);
    if (sp?.agent) await setActive(sp.agent);
    $('input').focus();
  }
  api.conv.onChange(c => { state.conv = c; renderHistory(); renderFeed(); renderStaged(); if (!state.conv.active?.messages?.length) renderDaily(); });

  // ---------- Feed
  function renderFeed() {
    const feed = $('feed');
    feed.querySelectorAll('.msg:not(.streaming)').forEach(n => n.remove());
    const conv = state.conv.active;
    const msgs = (conv?.messages || []).filter(m => !m.hidden);
    $('empty').hidden = msgs.length > 0 || !!current;
    if (!msgs.length) $('greeting').textContent = greeting(conv?.id);
    const live = feed.querySelector('.msg.streaming');
    const regenAgents = personas.filter(p => !p.legacy || p.id === active().id);
    let row = null;
    msgs.forEach((m, i) => {
      const last = i === msgs.length - 1 && m.role === 'assistant' && !current && !m.brief && conv?.kind !== 'mission' && !m.huddle && !m.debate;
      const el = View.message(m, { personas, api, reader, last, regenAgents, convId: conv?.id, onAsk: askFollowUp,
        onRegenerate: last ? id => regenerate(id) : null,
        onVersion: m.versions ? idx => api.conv.setVersion(conv.id, idx) : null });
      // Huddle answers sit side by side.
      if (m.huddle?.role === 'take') {
        if (!row || row.dataset.h !== m.huddle.id) { row = document.createElement('div'); row.className = 'msg huddle-row'; row.dataset.h = m.huddle.id; feed.insertBefore(row, live); }
        row.appendChild(el); row.style.setProperty('--cols', Math.min(row.children.length, 4));
        return;
      }
      row = null;
      feed.insertBefore(el, live);
    });
    if (groupLive) feed.insertBefore(groupLive, live);
    scrollDown(true);
  }
  // Rotating greeting for empty chats: time of day + your preferred name.
  function greeting(seed = '') {
    const a = state.cloud?.account || {};
    const name = (state.settings.nickname || a.nickname || a.username || '').trim();
    const n = name ? `, ${name}` : '';
    const h = new Date().getHours();
    const sets = {
      morning: [`Morning${n}. What's first?`, `Good morning${n}. Ready when you are.`, `Rise and build${n}.`, `Coffee and code${n}?`],
      afternoon: [`Ready to work${n}?`, `Afternoon${n}. What are we tackling?`, `What's next${n}?`, `Let's get it done${n}.`],
      evening: [`Evening${n}. What's on your mind?`, `Winding down${n}, or just getting started?`, `What are we building tonight${n}?`],
      night: [`Night shift${n}?`, `Still up${n}? Let's make it count.`, `Burning the midnight oil${n}?`],
      any: [`What are we building today${n}?`, `All systems nominal${n}.`, `Ready to work${n}?`]
    };
    const pool = [...(h >= 5 && h < 12 ? sets.morning : h < 17 && h >= 12 ? sets.afternoon : h >= 17 && h < 22 ? sets.evening : sets.night), ...sets.any];
    let x = 0; for (const ch of String(seed) + new Date().toDateString()) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return pool[x % pool.length];
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
  // Chats pinned to this chat / its space ride along with every message (shown first in the tray).
  function pinnedChips() {
    const conv = state.conv.active; if (!conv) return [];
    const sp = conv.spaceId ? (state.conv.summary.spaces || []).find(x => x.id === conv.spaceId) : null;
    const title = id => state.conv.summary.list.find(c => c.id === id)?.title;
    const out = [];
    for (const id of conv.links || []) if (title(id)) out.push({ id: 'chat:' + id, kind: 'chat', name: title(id), pinned: 'chat' });
    for (const id of sp?.links || []) if (title(id) && id !== conv.id && !out.some(x => x.id === 'chat:' + id)) out.push({ id: 'chat:' + id, kind: 'chat', name: title(id), pinned: 'space' });
    return out;
  }
  async function togglePin(a, toSpace) {
    const conv = state.conv.active; if (!conv) return;
    const cid = a.id.slice(5);
    const sp = conv.spaceId ? (state.conv.summary.spaces || []).find(x => x.id === conv.spaceId) : null;
    if (a.pinned === 'space' && sp) return api.spaces.update(sp.id, { links: (sp.links || []).filter(x => x !== cid) });
    if (a.pinned) return api.conv.setLinks(conv.id, (conv.links || []).filter(x => x !== cid));
    // Pinning a just-linked chat: it moves from this message to "always".
    const i = staged.findIndex(x => x.id === a.id); if (i >= 0) staged.splice(i, 1);
    if (toSpace && sp) await api.spaces.update(sp.id, { links: [...(sp.links || []), cid] });
    else await api.conv.setLinks(conv.id, [...(conv.links || []), cid]);
    if (toSpace && !sp) { setTopStatus('THIS CHAT ISN\'T IN A SPACE', 'err'); setTimeout(() => setTopStatus('STANDBY'), 2500); }
  }
  function renderStaged() {
    const tray = $('attTray');
    tray.innerHTML = '';
    const all = [...pinnedChips(), ...staged];
    if (all.length) tray.appendChild(View.attachChips(all, { onPin: togglePin, onRemove: id => { const i = staged.findIndex(a => (a.id || a.tmp) === id || a.tmp === id); if (i >= 0) staged.splice(i, 1); renderStaged(); } }));
    tray.hidden = !all.length;
  }

  // "#" links a chat: a short summary of it goes with this message (pin it to keep it for every message).
  let linkItems = [], linkSel = 0;
  function linkQuery() {
    const m = $('input').value.slice(0, $('input').selectionStart).match(/(^|\s)#([^\s#]*)$/);
    return m ? m[2].toLowerCase() : null;
  }
  function updateLinks() {
    const q = linkQuery();
    if (q === null) return hideLinks();
    const cur = state.conv.active?.id;
    linkItems = state.conv.summary.list.filter(c => c.id !== cur && c.kind !== 'brief' && (!q || c.title.toLowerCase().includes(q))).slice(0, 8);
    if (!linkItems.length) return hideLinks();
    linkSel = Math.min(linkSel, linkItems.length - 1);
    $('linkMenu').innerHTML = `<div class="mention-head">LINK A CHAT</div>` + linkItems.map((c, i) => `<div class="mention-item ${i === linkSel ? 'sel' : ''}" data-i="${i}">
      <b class="f-at">#</b>${esc(c.title)}<small>${new Date(c.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${c.count} msgs</small></div>`).join('');
    $('linkMenu').hidden = false;
  }
  function hideLinks() { $('linkMenu').hidden = true; linkItems = []; linkSel = 0; }
  function pickLink(i) {
    const c = linkItems[i]; if (!c) return;
    const input = $('input'), pos = input.selectionStart;
    const before = input.value.slice(0, pos).replace(/(^|\s)#[^\s#]*$/, '$1');
    input.value = before + input.value.slice(pos);
    input.selectionStart = input.selectionEnd = before.length;
    if (!staged.some(a => a.id === 'chat:' + c.id)) staged.push({ tmp: 't' + Math.random().toString(36).slice(2), id: 'chat:' + c.id, kind: 'chat', name: c.title });
    hideLinks(); renderStaged(); input.focus();
  }
  $('linkMenu').addEventListener('mousedown', e => { const it = e.target.closest('.mention-item'); if (it) { e.preventDefault(); pickLink(+it.dataset.i); } });
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
  const plainAtt = a => a.kind === 'chat' ? { id: a.id, name: a.name, kind: 'chat' } : { id: a.id, name: a.name, kind: a.kind, mime: a.mime, thumb: a.thumb, app: a.app, title: a.title, chars: a.chars };

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

    // "every weekday at 8, …" → a Routine
    const rp = !atts.length && /^(hey nexus[, ]+)?(every|each)\b/i.test(text) && await api.routines.parse(text);
    if (rp) {
      input.value = ''; autosize(); hideMentions();
      const saved = await api.routines.save({ prompt: rp.prompt, schedule: rp.schedule, agent: active().id, name: rp.name });
      const c = await api.conv.append({ role: 'user', content: text, local: true });
      await api.conv.append({ role: 'assistant', persona: active().id, local: true, model: 'Routines · no chat used', error: !saved.ok,
        content: saved.ok ? `⟳ **Routine created:** ${saved.routine.name}\n\n**When:** ${rp.when} · **Agent:** ${active().handle}\n\nEach run posts in the **Routines** space and sends a notification. Change or pause it in Settings → Routines.` : saved.error }, c.id);
      return;
    }

    // "watch this window and tell me when…" → the Watch picker with the condition filled in
    const wi = !atts.length && window.NexusChat.watchIntent(text);
    if (wi) { input.value = ''; autosize(); hideMentions(); return openWatch(wi); }

    // calc / convert: answered instantly, no chat used
    const q = !atts.length && await api.quickCalc(text);
    if (q) {
      input.value = ''; autosize(); hideMentions();
      const c = await api.conv.append({ role: 'user', content: text, local: true });
      await api.conv.append({ role: 'assistant', persona: active().id, content: q.text, model: q.kind === 'calc' ? 'Calculator · no chat used' : 'Unit converter · no chat used', local: true, error: !!q.error }, c.id);
      return;
    }

    const gi = !atts.length && window.NexusChat.groupIntent(text, personas);
    if (gi?.kind === 'debate') { input.value = ''; autosize(); hideMentions(); return openDebate(gi.topic); }
    if (gi?.kind === 'huddle') { input.value = ''; autosize(); hideMentions(); return runHuddle(text, gi.agents); }

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
      msg = window.NexusChat.replyMessage(res, p.id, spoken ? { via: 'voice' } : {}, cur.text);
      if (res.handoff) { setTopStatus(`${p.handle.toUpperCase()} → ${persona(res.handoff.to).handle.toUpperCase()}`, 'live'); setTimeout(() => setTopStatus('STANDBY'), 2500); }
      if (res.rejected?.length) { setTopStatus(`${p.handle.toUpperCase()}: NO @${res.rejected.map(r => r.id.toUpperCase()).join(' @')}`, 'err'); setTimeout(() => setTopStatus('STANDBY'), 4000); }
      else setTopStatus(regenerate ? 'REGENERATED' : 'STANDBY');
      if (regenerate) setTimeout(() => setTopStatus('STANDBY'), 1800);
    }
    if (regenerate) await api.conv.addVersion(conv.id, msg); else await api.conv.append(msg, conv.id);
    if (replyText && !res.aborted && ((spoken && state.settings.voice.speakChatReplies) || res.featureData?.speak)) {
      setTopStatus('SPEAKING', 'live'); orb.setMode('speaking');
      await speaker.speak(replyText, undefined, { persona: res.persona || p.id });
      orb.setMode('idle'); setTopStatus('STANDBY');
    }
  }

  // Widget buttons (Expand, follow-up chips, idea boards…) ask the current agent.
  function askFollowUp(text) { if (current) return; $('input').value = text; send(); }

  // ---------- Agents together: Huddle + Debate
  function renderGroupLive(ev) {
    if (!groupRun) return;
    if (ev) groupRun.status[ev.agent || '_'] = ev.status;
    if (!groupLive) { groupLive = document.createElement('div'); groupLive.className = 'msg group-live'; }
    const label = groupRun.kind === 'huddle' ? 'HUDDLE' : 'DEBATE';
    const st = groupRun.status;
    groupLive.innerHTML = `<span class="gl-tag">${label}</span>` + groupRun.agents.map(a => { const p = persona(a); const s = st[a] || 'waiting';
      return `<span class="gl-a s-${s}" style="--c:${p.color}"><i></i>${esc(p.handle)} <small>${s === 'thinking' ? (groupRun.kind === 'debate' ? 'arguing…' : 'thinking…') : s === 'summarizing' ? 'summing up…' : s === 'done' ? '✓' : s === 'error' ? 'failed' : ''}</small></span>`; }).join('') +
      '<button class="b-btn ghost" data-gstop>Stop</button>';
    if (!groupLive.isConnected) $('feed').appendChild(groupLive);
    scrollDown();
  }
  $('feed').addEventListener('click', e => { if (e.target.closest('[data-gstop]') && groupRun) api.group.stop(groupRun.id || undefined); });
  api.group.onProgress(ev => {
    if (!groupRun) return;
    if (ev.id && !groupRun.id) groupRun.id = ev.id;
    if (ev.status === 'start' || (ev.status === 'done' && !ev.agent)) return;
    renderGroupLive(ev);
  });
  const endGroup = () => { groupRun = null; groupLive?.remove(); groupLive = null; setBusy(false); setTopStatus('STANDBY'); renderFeed(); };
  async function runHuddle(text, agents) {
    const s = state.settings.huddle || {};
    let list = agents.length >= 2 ? agents : (s.agents || ['neodela', 'lyte', 'flash']);
    list = list.filter(id => personas.some(p => p.id === id) && state.access?.[id]?.mode !== 'blocked').slice(0, 4);
    if (list.length < 2) { setTopStatus('A HUDDLE NEEDS 2+ AGENTS YOU CAN USE', 'err'); return setTimeout(() => setTopStatus('STANDBY'), 3000); }
    const synth = agents.length >= 2 ? list[0] : (s.synth && state.access?.[s.synth]?.mode !== 'blocked' ? s.synth : list[0]);
    const conv = await api.conv.append({ role: 'user', content: text });
    groupRun = { kind: 'huddle', agents: [...list, ...(list.includes(synth) ? [] : [synth])], status: {} };
    setBusy(true); setTopStatus('HUDDLE', 'live'); renderGroupLive();
    const r = await api.group.huddle({ convId: conv.id, agents: list, synth });
    endGroup();
    if (!r.ok) { setTopStatus(r.error ? 'HUDDLE FAILED' : 'NO REPLIES', 'err'); setTimeout(() => setTopStatus('STANDBY'), 3000); }
  }
  function openDebate(topic = '') {
    const usable = personas.filter(p => !p.legacy && state.access?.[p.id]?.mode !== 'blocked');
    const opt = (sel) => usable.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    $('dbPro').innerHTML = opt(usable[0]?.id); $('dbCon').innerHTML = opt(usable[1]?.id || usable[0]?.id);
    $('dbJudge').innerHTML = '<option value="">No judge</option>' + opt(usable[2]?.id || usable[0]?.id);
    $('dbTopic').value = topic; $('dbNote').textContent = ''; $('debateModal').hidden = false; $('dbTopic').focus();
  }
  $('debateModal').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === $('debateModal')) $('debateModal').hidden = true; });
  $('dbStart').addEventListener('click', async () => {
    const opts = { topic: $('dbTopic').value, pro: $('dbPro').value, con: $('dbCon').value, judge: $('dbJudge').value, rounds: +$('dbRounds').value, convId: state.conv.active?.messages?.length ? state.conv.active.id : null };
    if (opts.topic.trim().length < 4) { $('dbNote').className = 'note err'; $('dbNote').textContent = 'What should they debate?'; return; }
    if (opts.pro === opts.con) { $('dbNote').className = 'note err'; $('dbNote').textContent = 'Pick two different agents.'; return; }
    $('debateModal').hidden = true;
    groupRun = { kind: 'debate', agents: [opts.pro, opts.con, ...(opts.judge ? [opts.judge] : [])], status: {} };
    setBusy(true); setTopStatus('DEBATE', 'live');
    const r = await api.group.debate(opts);
    if (r.convId && r.convId !== state.conv.active?.id) await api.conv.select(r.convId);
    endGroup();
    if (!r.ok) { setTopStatus('DEBATE FAILED', 'err'); setTimeout(() => setTopStatus('STANDBY'), 3000); }
  });

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
    const groups = [['huddle', '◍', 'ask several agents at once'], ['debate', '⚖', 'two agents argue it out']].filter(([g]) => q && g.startsWith(q) || q === '').map(([g, icon, desc]) => ({ kind: 'group', g, icon, desc }));
    menuItems = [...window.NexusChat.mentionCandidates(q, personas, active(), catalog), ...groups];
    if (!menuItems.length) return hideMentions();
    menuSel = Math.min(menuSel, menuItems.length - 1);
    let lastKind = '';
    $('mentionMenu').innerHTML = menuItems.map((it, i) => {
      const head = it.kind !== lastKind ? `<div class="mention-head">${it.kind === 'agent' ? 'AGENTS' : it.kind === 'group' ? 'AGENTS TOGETHER' : `${esc(active().handle.toUpperCase())} FEATURES`}</div>` : '';
      lastKind = it.kind;
      if (it.kind === 'group') return `${head}<div class="mention-item ${i === menuSel ? 'sel' : ''}" data-i="${i}"><b class="f-at">${it.icon}</b>@${it.g}<small>${esc(it.desc)}</small></div>`;
      if (it.kind === 'agent') {
        const p = it.p;
        return `${head}<div class="mention-item ${i === menuSel ? 'sel' : ''}" data-i="${i}">
          <i style="color:${p.color};background:${p.color}"></i>@${esc(p.handle)}
          ${p.agentic ? `<span class="m-badge" style="color:${p.color}">AGENT</span>` : ''}${p.legacy ? '<span class="m-badge">CLASSIC</span>' : ''}
          <small>${esc(p.legacy ? p.name : p.tag)}</small></div>`;
      }
      const f = it.f;
      return `${head}<div class="mention-item feat ${i === menuSel ? 'sel' : ''} ${it.available ? '' : 'off'}" data-i="${i}">
        <b class="f-at">@</b>${esc(f.id)}${f.web ? '<span class="m-badge">WEB</span>' : ''}${f.custom ? '<span class="m-badge">YOURS</span>' : ''}
        <small>${it.available ? esc(f.does || f.desc) : 'not on ' + esc(active().handle)}</small></div>`;
    }).join('');
    $('mentionMenu').hidden = false;
  }
  function hideMentions() { $('mentionMenu').hidden = true; menuItems = []; menuSel = 0; }
  function pickMention(i) {
    const it = menuItems[i]; if (!it) return;
    const word = it.kind === 'agent' ? it.p.handle : it.kind === 'group' ? it.g : it.f.id;
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos).replace(/@([a-z0-9.]*)$/i, '@' + word + ' ');
    input.value = before + input.value.slice(pos);
    input.selectionStart = input.selectionEnd = before.length;
    hideMentions(); if (it.kind === 'agent') setActive(it.p.id); input.focus();
  }
  $('mentionMenu').addEventListener('mousedown', e => { const it = e.target.closest('.mention-item'); if (it) { e.preventDefault(); pickMention(+it.dataset.i); } });
  input.addEventListener('input', () => { autosize(); updateMentions(); updateLinks(); });
  input.addEventListener('keydown', e => {
    if (linkItems.length && !$('linkMenu').hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); linkSel = (linkSel + 1) % linkItems.length; return updateLinks(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); linkSel = (linkSel - 1 + linkItems.length) % linkItems.length; return updateLinks(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickLink(linkSel); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return hideLinks(); }
    }
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
  $('btnChatMenu').addEventListener('click', e => { e.stopPropagation(); $('chatMenu').querySelector('.cm-mission').hidden = state.conv.active?.kind !== 'mission'; $('chatMenu').hidden = !$('chatMenu').hidden; });
  document.addEventListener('click', e => { if (!e.target.closest('.chat-menu-wrap')) $('chatMenu').hidden = true; });
  $('chatMenu').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    $('chatMenu').hidden = true;
    if (b.dataset.feedback !== undefined) return settings.open('general', 'feedback');
    if (b.dataset.mission !== undefined) return openMission();
    if (b.dataset.watch !== undefined) return openWatch();
    if (b.dataset.debate !== undefined) return openDebate();
    if (b.dataset.study !== undefined) return openStudy();
    if (b.dataset.mexport) return shareMission(state.conv.active.id, b.dataset.mexport);
    if (b.dataset.routines !== undefined) return settings.open('routines');
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
  api.onFeatures(({ catalog: c, personas: ps }) => { catalog.splice(0, catalog.length, ...c); personas = ps; settings.setPersonas?.(ps); refreshAgent(); });
  api.onPersonas(p => { personas = p; settings.setPersonas?.(p); refreshAgent(); renderHistory(); });

  // ---------- Keybinds
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('palette').hidden) { closePalette(); return; }
      if (!$('onboard').hidden) return;
      if (!$('missionModal').hidden) { $('missionModal').hidden = true; return; }
      if (!$('watchModal').hidden) { $('watchModal').hidden = true; return; }
      if (!$('debateModal').hidden) { $('debateModal').hidden = true; return; }
      if (!$('studyModal').hidden) { closeStudy(); return; }
      if (!$('citeModal').hidden) { $('citeModal').hidden = true; return; }
      if (document.querySelector('.space-editor')) { document.querySelector('.space-editor').remove(); return; }
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
    if (k === 'k') { e.preventDefault(); return togglePalette(); }
    if (k === 'n') { e.preventDefault(); return newChat(); }
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
    active, applyTheme, onAgentChange: refreshAgent, onHotkeys: showQuickHint, startTour: () => startTour(), openWatch: c => openWatch(c),
    openWrapped: () => openWrapped(), onSkin: sk => orb.setSkin(sk)
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
      ...bgConfirms.map(c => ({ id: 'c-' + c.callId, kind: 'confirm', text: `${c.source}: ${c.label}${c.detail ? ' — ' + c.detail : ''}`, callId: c.callId })),
      ...(briefBanner ? [{ id: 'brief', kind: 'brief', text: '☀ Your Morning Brief is ready.' }] : []),
      ...(state.settings.onboarded && VER && state.settings.seenWhatsNew !== VER && VER === '1.8' ? [{ id: 'whatsnew', kind: 'whatsnew', text: "New in v1.8 · N28C, the phone app: notifications, Send to Mac, missions and your clipboard from your phone, talk mode, homework photos, interactive answers, decks you make or edit on your phone, cram mode, and Shared Spaces to study with friends. Plus pinned chats and the Overlord orb skin." }] : []),
      ...(u.newer && !u.skipped ? [{ id: 'update', kind: 'update', text: `Nexus '28 v${u.latest} is available. You have v${u.current}.` }] : []),
      ...state.cloud.maintenance.map(m => ({ id: 'm-' + m.scope, kind: 'warn', text: m.message || `Maintenance in progress (${m.scope}).` })),
      ...state.cloud.announcements.filter(a => !dismissed.includes(a.id)).map(a => ({ id: a.id, kind: 'info', text: a.message }))
    ];
    $('banners').innerHTML = items.map(b => `<div class="banner ${b.kind}" data-id="${esc(String(b.id))}"><span class="b-dot"></span><span>${esc(b.text)}</span>${b.kind === 'update' ? '<button class="b-btn" data-upopen>Download</button><button class="b-btn ghost" data-upskip>Skip</button>' : ''}${b.kind === 'confirm' ? `<button class="b-btn ghost" data-deny="${esc(b.callId)}">Deny</button><button class="b-btn" data-approve="${esc(b.callId)}">Approve</button>` : ''}${b.kind === 'brief' ? '<button class="b-btn ghost" data-briefread>Read it to me</button><button class="b-btn" data-briefopen>Open</button><button class="b-x" title="Dismiss">×</button>' : ''}${b.kind === 'whatsnew' ? '<button class="b-btn ghost" data-newtour>Take the tour</button><button class="b-btn" data-newpal>Try ⌘K</button><button class="b-x" title="Dismiss">×</button>' : ''}${b.kind === 'info' ? '<button class="b-x" title="Dismiss">×</button>' : ''}</div>`).join('');
  }
  $('banners').addEventListener('click', e => {
    if (e.target.closest('[data-upopen]')) return api.update.open();
    const ap = e.target.closest('[data-approve],[data-deny]');
    if (ap) { const id = ap.dataset.approve || ap.dataset.deny; api.confirmReply(id, !!ap.dataset.approve); removeBg(id); return; }
    if (e.target.closest('[data-briefopen]')) { const id = briefBanner?.convId; briefBanner = null; renderBanners(); return id && api.conv.open(id); }
    if (e.target.closest('[data-briefread]')) { const t = briefBanner?.text; return t && speaker.speak(t, 'read'); }
    if (e.target.closest('.banner.brief .b-x')) { briefBanner = null; return renderBanners(); }
    if (e.target.closest('.banner.whatsnew')) {
      const b = e.target.closest('button'); if (!b) return;
      api.setSettings({ seenWhatsNew: VER }).then(r => { state.settings = r.settings; renderBanners(); });
      if (b.dataset.newtour !== undefined) startTour();
      if (b.dataset.newpal !== undefined) openPalette();
      return;
    }
    if (e.target.closest('[data-upskip]')) { state.update = { ...state.update, skipped: true }; api.update.skip(state.update.latest); return renderBanners(); }
    const b = e.target.closest('.b-x'); if (!b) return;
    const id = +b.closest('.banner').dataset.id;
    state.settings.dismissedAnnouncements = [...(state.settings.dismissedAnnouncements || []), id];
    api.cloud.dismiss(id); renderBanners();
  });
  function removeBg(callId) { const i = bgConfirms.findIndex(c => c.callId === callId); if (i >= 0) { bgConfirms.splice(i, 1); renderBanners(); } }
  api.onBgConfirm(c => { bgConfirms.push(c); renderBanners(); orb.pulse(.6); });
  api.onBgConfirmDone(({ callId }) => removeBg(callId));
  api.brief.onReady(b => { briefBanner = b; renderBanners(); });

  // ---------- Missions (background Paragon jobs)
  // Mission templates: pick one, fill the blanks, the goal writes itself.
  let mtData = { builtin: [], mine: [] }, mtSel = null;
  async function openMission(templateId) {
    if (mission && !['done', 'error'].includes(mission.status)) { $('missionCard').scrollIntoView({ block: 'nearest' }); return; }
    $('missionModal').hidden = false; $('missionNote').textContent = ''; $('missionNote').className = 'note';
    mtData = await api.missions.templates();
    mtSel = null; renderTemplates();
    if (templateId) pickTemplate(templateId); else $('missionGoal').focus();
  }
  const allTemplates = () => [...mtData.builtin, ...mtData.mine];
  function renderTemplates() {
    $('mtList').innerHTML = allTemplates().map(t => `<button class="mt-chip ${mtSel?.id === t.id ? 'sel' : ''} ${t.custom ? 'mine' : ''}" data-mt="${esc(t.id)}" title="${esc(t.desc || t.goal)}"><span>${esc(t.icon)}</span>${esc(t.name)}${t.custom ? `<i data-mtdel="${esc(t.id)}" title="Delete template">×</i>` : ''}</button>`).join('');
  }
  function fillGoal() {
    if (!mtSel) return;
    const vals = {}; $('mtFields').querySelectorAll('input').forEach(i => { vals[i.dataset.k] = i.value.trim(); });
    $('missionGoal').value = mtSel.goal.replace(/\{([a-z][\w]{0,20})\}/gi, (m, k) => vals[k] || m);
  }
  function pickTemplate(id) {
    mtSel = allTemplates().find(t => t.id === id) || null;
    renderTemplates();
    if (!mtSel) { $('mtFields').hidden = true; return; }
    $('missionMinutes').value = String(mtSel.minutes || 20);
    const fields = mtSel.fields || [];
    $('mtFields').hidden = !fields.length;
    $('mtFields').innerHTML = fields.map(f => `<label><span>${esc(f.label || f.key)}</span><input data-k="${esc(f.key)}" placeholder="${esc(f.placeholder || '')}"></label>`).join('');
    fillGoal();
    ($('mtFields').querySelector('input') || $('missionGoal')).focus();
  }
  $('mtFields').addEventListener('input', fillGoal);
  $('mtList').addEventListener('click', async e => {
    const del = e.target.closest('[data-mtdel]');
    if (del) { e.stopPropagation(); mtData.mine = (await api.missions.removeTemplate(del.dataset.mtdel)).mine; if (mtSel?.id === del.dataset.mtdel) mtSel = null; return renderTemplates(); }
    const b = e.target.closest('[data-mt]'); if (!b) return;
    if (mtSel?.id === b.dataset.mt) { mtSel = null; $('mtFields').hidden = true; renderTemplates(); return; }
    pickTemplate(b.dataset.mt);
  });
  $('mtSave').addEventListener('click', async () => {
    const goal = (mtSel && !mtSel.custom ? mtSel.goal : $('missionGoal').value).trim();
    const name = (mtSel && !mtSel.custom ? mtSel.name + ' (mine)' : goal.split(/[.,:;\n]/)[0]).slice(0, 32);
    const r = await api.missions.saveTemplate({ name, goal, minutes: +$('missionMinutes').value, icon: '★' });
    $('missionNote').className = 'note ' + (r.ok ? 'ok' : 'err');
    $('missionNote').textContent = r.ok ? `Saved "${name}". Use {blanks} in the goal for parts you change each time.` : r.error;
    if (r.ok) { mtData.mine = r.mine; renderTemplates(); }
  });
  $('missionModal').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === $('missionModal')) $('missionModal').hidden = true; });
  $('missionStart').addEventListener('click', async () => {
    $('missionNote').className = 'note'; $('missionNote').textContent = 'Starting…';
    if (/\{[a-z][\w]{0,20}\}/i.test($('missionGoal').value)) { $('missionNote').className = 'note err'; $('missionNote').textContent = 'Fill in the blanks first.'; return; }
    const r = await api.missions.start($('missionGoal').value, +$('missionMinutes').value);
    if (!r.ok) { $('missionNote').className = 'note err'; $('missionNote').textContent = r.error; return; }
    mission = r.state; $('missionModal').hidden = true; $('missionGoal').value = ''; renderMission();
  });
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  function renderMission() {
    const m = mission, el = $('missionCard');
    if (!m) { el.hidden = true; return; }
    el.hidden = false;
    const live = !['done', 'error'].includes(m.status);
    const pct = Math.min(100, (m.elapsed / m.budget) * 100);
    el.className = 'mission-card s-' + m.status;
    el.innerHTML = `<div class="mc-top"><span class="mc-flag">⚑</span><b class="mc-title"></b>
        <span class="mc-time">${live ? `${mmss(m.elapsed)} / ${mmss(m.budget)}` : m.status === 'error' ? 'STOPPED' : 'DONE'}</span></div>
      <div class="mc-bar"><i style="width:${live ? pct : 100}%"></i></div>
      <div class="mc-bottom"><span class="mc-act"></span>
        ${m.status === 'running' ? '<button class="b-btn ghost" data-m="pause">Pause</button>' : ''}${m.status === 'paused' ? '<button class="b-btn ghost" data-m="resume">Resume</button>' : ''}
        ${live && m.status !== 'reporting' ? '<button class="b-btn ghost" data-m="end">End</button>' : ''}
        <button class="b-btn" data-m="open">${live ? 'Watch' : 'Open report'}</button>${live ? '' : '<button class="b-btn ghost" data-m="share">Share ▾</button><button class="b-x" data-m="dismiss" title="Dismiss">×</button>'}</div>
      <div class="mc-share" hidden><button data-mx="pdf">PDF</button><button data-mx="docx">Word</button><button data-mx="md">Markdown</button><button data-mx="copy">Copy text</button></div>`;
    el.querySelector('.mc-title').textContent = m.title;
    el.querySelector('.mc-act').textContent = m.status === 'paused' ? 'Paused' : m.activity || '';
  }
  async function shareMission(convId, format, btn) {
    if (format === 'copy') { const t = await api.missions.reportText(convId); navigator.clipboard.writeText(t).catch(() => {}); setTopStatus('REPORT COPIED'); return setTimeout(() => setTopStatus('STANDBY'), 1800); }
    setTopStatus('SAVING REPORT…', 'live');
    const r = await api.missions.exportReport(convId, format);
    if (r.ok) { setTopStatus('SAVED · ' + r.path.split('/').pop().toUpperCase().slice(0, 30)); api.reveal(r.path); }
    else setTopStatus(r.canceled ? 'STANDBY' : 'EXPORT FAILED', r.canceled ? '' : 'err');
    setTimeout(() => setTopStatus('STANDBY'), 2500);
  }
  $('missionCard').addEventListener('click', e => { const b = e.target.closest('[data-mx]'); if (b && mission) { e.stopPropagation(); shareMission(mission.convId, b.dataset.mx); } });
  $('missionCard').addEventListener('click', async e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const a = b.dataset.m;
    if (a === 'open') return mission && api.conv.open(mission.convId);
    if (a === 'share') { const sh = $('missionCard').querySelector('.mc-share'); sh.hidden = !sh.hidden; return; }
    if (a === 'dismiss') { mission = await api.missions.dismiss(); return renderMission(); }
    mission = await api.missions[a](); renderMission();
  });
  api.missions.onState(m => { mission = m; renderMission(); });

  // ---------- Study (flashcards + spaced repetition)
  function renderStudyChip(st) { const n = st?.stats?.due || 0; $('studyChip').hidden = !n && !(st?.decks?.length); $('studyChip').innerHTML = n ? `<i></i>📚 <span id="studyDue">${n}</span> DUE` : '<i></i>📚 STUDY'; $('studyChip').classList.toggle('on', n > 0); }
  const studyPanel = window.NexusStudy.mount({ api, personas: () => personas, onChange: renderStudyChip });
  function openStudy(view) { studyPanel.open(view === 'make' ? 'make' : 'home'); }
  function closeStudy() { studyPanel.close(); }
  $('studyChip').addEventListener('click', () => openStudy());
  renderStudyChip(boot.study);
  api.missions.templates().then(d => { mtData = d; }).catch(() => {});

  // ---------- Watch mode
  let watches = boot.watches || [], wmPick = null;
  async function openWatch(condition = '') {
    $('watchModal').hidden = false; $('wmNote').textContent = ''; $('wmNote').className = 'note';
    $('wmCondition').value = condition || $('wmCondition').value;
    $('wmInterval').value = String(state.settings.watch?.interval || 15); $('wmMinutes').value = String(state.settings.watch?.minutes || 30);
    $('wmWindows').innerHTML = '<div class="note">Loading windows…</div>';
    const r = await api.watch.windows();
    if (!r.ok || !r.windows.length) { $('wmWindows').innerHTML = `<div class="note err">${esc(r.error || "No windows to watch. If this keeps happening, check Screen Recording permission for Nexus '28.")}</div>`; return; }
    wmPick = r.windows[0];
    $('wmWindows').innerHTML = r.windows.map((w, i) => `<button class="wm-win ${i === 0 ? 'sel' : ''}" data-i="${i}">${w.thumb ? `<img src="${w.thumb}" alt="">` : '<span class="wm-ph">▢</span>'}
      <span>${w.icon ? `<img class="wm-ic" src="${w.icon}" alt="">` : ''}${esc(w.name)}</span></button>`).join('');
    $('wmWindows').onclick = e => { const b = e.target.closest('.wm-win'); if (!b) return; wmPick = r.windows[+b.dataset.i]; $('wmWindows').querySelectorAll('.wm-win').forEach(n => n.classList.toggle('sel', n === b)); };
    $('wmCondition').focus();
  }
  $('watchModal').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === $('watchModal')) $('watchModal').hidden = true; });
  $('wmStart').addEventListener('click', async () => {
    if (!wmPick) return;
    let cond = $('wmCondition').value.trim();
    if (cond && !/^(tell|let|notify|ping|alert)\b/i.test(cond)) cond = 'tell me when ' + cond;
    const r = await api.watch.start({ windowId: wmPick.id, title: wmPick.name, condition: cond, interval: +$('wmInterval').value, minutes: +$('wmMinutes').value });
    if (!r.ok) { $('wmNote').className = 'note err'; $('wmNote').textContent = r.error; return; }
    api.setSettings({ watch: { interval: +$('wmInterval').value, minutes: +$('wmMinutes').value } });
    $('watchModal').hidden = true; $('wmCondition').value = '';
  });
  function renderWatches() {
    const el = $('watchCards');
    el.innerHTML = watches.map(w => {
      const live = w.status === 'watching';
      const left = Math.max(0, w.until - Date.now());
      const tag = live ? `${Math.ceil(left / 60000)} MIN LEFT` : w.status === 'hit' ? 'SPOTTED' : w.status === 'stopped' ? 'STOPPED' : 'ENDED';
      const stats = `${w.checks} look${w.checks === 1 ? '' : 's'} · ${w.localOnly ? 'no AI needed' : `${w.aiChecks} AI check${w.aiChecks === 1 ? '' : 's'}`}`;
      return `<div class="watch-card s-${w.status}" data-id="${esc(w.id)}"><div class="wc-top"><span class="wc-eye">👁</span><b>${esc(w.title || w.app || 'Window')}</b><span class="wc-tag">${tag}</span></div>
        <div class="wc-cond">${esc(w.condition)}</div>
        <div class="wc-bottom"><span>${live ? stats : esc(w.why || '') + ' · ' + stats}</span>${live ? '<button class="b-btn ghost" data-w="stop">Stop</button>' : '<button class="b-x" data-w="dismiss" title="Dismiss">×</button>'}</div></div>`;
    }).join('');
  }
  $('watchCards').addEventListener('click', async e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const id = b.closest('.watch-card').dataset.id;
    if (b.dataset.w === 'stop') await api.watch.stop(id); else watches = await api.watch.dismiss(id);
    renderWatches();
  });
  api.watch.onState(list => { watches = list; renderWatches(); });
  api.watch.onHit(w => { chime(); orb.pulse(1); setTopStatus('👁 ' + (w.why || 'SPOTTED').toUpperCase().slice(0, 40), 'live'); setTimeout(() => setTopStatus('STANDBY'), 5000); });
  setInterval(() => { if (watches.some(w => w.status === 'watching')) renderWatches(); }, 30000);

  // ---------- v1.7: beta flags, daily challenge, citations, homework, Wrapped
  let flagsState = boot.flags || { flags: {} };
  const flagOn = k => !!flagsState.flags?.[k]?.on;
  api.flags.onChange(f => { flagsState = f; renderDaily(); });
  async function renderDaily() {
    const pill = $('dailyPill');
    if (!flagOn('daily_challenge')) { pill.hidden = true; return; }
    const m = await api.metrics.summary(); const ch = m.challenge; if (!ch) return;
    pill.hidden = false; pill.classList.toggle('done', ch.done);
    pill.innerHTML = `<span>${esc(ch.icon)}</span><b>Today's challenge:</b> ${esc(ch.text)} <em>${ch.done ? '✓ done' : `${ch.progress}/${ch.n} · +${ch.bonus} pts`}</em>${ch.streak > 1 ? ` <i>🔥${ch.streak}</i>` : ''}`;
  }
  $('dailyPill').addEventListener('click', () => settings.open('stats'));

  // Homework helper: look at your screen, then hints one at a time.
  async function homework(text = 'Help me with this problem.') {
    if (!flagOn('homework_helper')) return;
    await look();
    $('input').value = '@Homework ' + text; autosize();
    api.homeworkUsed();
    send();
  }

  // Citation helper
  let ctSource = null, ctStyle = 'mla';
  async function openCite(url = '') {
    if (!flagOn('citations')) return;
    $('citeModal').hidden = false; $('ctNote').textContent = ''; $('ctForm').hidden = !ctSource;
    $('ctUrl').value = url; $('ctUrl').focus();
    renderCiteList();
    if (url) citeGo();
  }
  const ctFields = () => { const g = k => $('ctForm').querySelector(`[data-f="${k}"]`); return g; };
  function fillCite() {
    const g = ctFields(), c = ctSource;
    g('title').value = c.title || ''; g('authors').value = (c.authors || []).join(', '); g('site').value = c.site || '';
    g('date').value = c.date ? [c.date.y, c.date.m !== undefined ? String(c.date.m + 1).padStart(2, '0') : '', c.date.d ? String(c.date.d).padStart(2, '0') : ''].filter(Boolean).join('-') : '';
    $('ctForm').hidden = false; paintCite();
  }
  function readCite() {
    const g = ctFields();
    const ds = g('date').value.trim(); const dm = ds.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
    ctSource = { ...ctSource, title: g('title').value.trim(), authors: g('authors').value.split(/\s*(?:,|\n|;| and )\s*/).map(x => x.trim()).filter(Boolean), site: g('site').value.trim(),
      date: dm ? { y: +dm[1], ...(dm[2] ? { m: +dm[2] - 1 } : {}), ...(dm[3] ? { d: +dm[3] } : {}) } : null };
    return ctSource;
  }
  async function paintCite() {
    const f = await api.cite.format(readCite(), ctStyle);
    $('ctOut').textContent = f[ctStyle];
    $('ctStyle').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.s === ctStyle));
    const missing = [!ctSource.authors.length && 'author', !ctSource.date && 'date'].filter(Boolean);
    $('ctNote').className = 'note' + (missing.length ? ' warn' : ' ok');
    $('ctNote').textContent = missing.length ? `Couldn't find the ${missing.join(' or ')} on the page. Add it above if the page shows one.` : 'Looks complete. Double-check names and dates against the page.';
  }
  async function citeGo() {
    const url = $('ctUrl').value.trim(); if (!url) return;
    $('ctNote').className = 'note'; $('ctNote').textContent = 'Reading the page…';
    const r = await api.cite.fromUrl(url);
    if (!r.ok) { $('ctNote').className = 'note err'; $('ctNote').textContent = r.error; return; }
    ctSource = r.source; fillCite();
  }
  async function renderCiteList() {
    const { list, projects } = await api.cite.list();
    $('ctProjects').innerHTML = projects.map(p => `<option value="${esc(p)}">`).join('');
    if (!list.length) { $('ctList').innerHTML = ''; return; }
    const by = {}; list.forEach(c => (by[c.project] = by[c.project] || []).push(c));
    $('ctList').innerHTML = Object.entries(by).map(([p, items]) => `<div class="ct-proj"><div class="ct-ph"><b>${esc(p)}</b><small>${items.length} source${items.length === 1 ? '' : 's'}</small><button class="link-btn" data-bib="${esc(p)}">Copy ${ctStyle === 'apa' ? 'References' : ctStyle === 'chicago' ? 'Bibliography' : 'Works Cited'}</button></div>
      ${items.map(c => `<div class="ct-item"><span>${esc(c.title || c.url)}</span><small>${esc(c.site || '')}</small><button class="link-btn" data-edit="${esc(c.id)}">Edit</button><button class="link-btn danger" data-del="${esc(c.id)}">×</button></div>`).join('')}</div>`).join('');
  }
  $('citeModal').addEventListener('click', async e => {
    if (e.target.closest('[data-close]') || e.target === $('citeModal')) { $('citeModal').hidden = true; return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'ctGo') return citeGo();
    if (b.id === 'ctBrowser') { $('ctNote').textContent = 'Checking your browser…'; const r = await api.cite.fromBrowser(); if (!r.ok) { $('ctNote').className = 'note err'; $('ctNote').textContent = r.error; return; } $('ctUrl').value = r.url; return citeGo(); }
    if (b.dataset.s) { ctStyle = b.dataset.s; paintCite(); renderCiteList(); return; }
    if (b.id === 'ctCopy') { navigator.clipboard.writeText($('ctOut').textContent).catch(() => {}); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); return; }
    if (b.id === 'ctSave') { await api.cite.save({ ...readCite(), project: $('ctProject').value.trim() || 'My sources' }); b.textContent = 'Saved ✓'; setTimeout(() => { b.textContent = 'Save to list'; }, 1400); return renderCiteList(); }
    if (b.dataset.bib) { const t = await api.cite.bibliography(b.dataset.bib, ctStyle); navigator.clipboard.writeText(t).catch(() => {}); b.textContent = 'Copied ✓'; return; }
    if (b.dataset.del) { await api.cite.remove(b.dataset.del); return renderCiteList(); }
    if (b.dataset.edit) { const { list } = await api.cite.list(); ctSource = list.find(c => c.id === b.dataset.edit); $('ctUrl').value = ctSource.url; $('ctProject').value = ctSource.project; fillCite(); }
  });
  $('ctForm').addEventListener('input', () => paintCite());
  $('ctUrl').addEventListener('keydown', e => { if (e.key === 'Enter') citeGo(); });

  // Nexus Wrapped
  let wr = null, wrI = 0;
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  function wrSlides(d) {
    const bar = (arr, labels, hi) => `<div class="wr-bars">${arr.map((v, i) => `<div class="${i === hi ? 'hi' : ''}" style="height:${Math.max(4, pct(v, Math.max(...arr)))}%" title="${labels ? labels[i] : i}: ${v}"></div>`).join('')}</div>`;
    const S = [];
    S.push(`<small>NEXUS WRAPPED</small><h1>${d.year}</h1><p>Your year with Nexus '28.</p><p class="wr-dim">Tap › to start</p>`);
    if (d.empty) { S.push(`<h2>Just getting started</h2><p>Chat a little more and come back — your Wrapped fills in as you go.</p>`); return S; }
    S.push(`<small>YOU SENT</small><h1>${d.messages.toLocaleString()}</h1><p>messages across <b>${d.chats}</b> chats — about <b>${d.words.toLocaleString()}</b> words.</p>${d.voice ? `<p class="wr-dim">${d.voice} of them out loud.</p>` : ''}`);
    if (d.topAgent) S.push(`<small>YOUR FAVORITE AGENT</small><h1 style="color:${esc(d.topAgent.color)}">${esc(d.topAgent.name.replace("Nexus '28 ", ''))}</h1><p>${d.topAgent.n} replies.${d.agents.length > 1 ? ` Then ${d.agents.slice(1, 3).map(a => esc(a.name.replace("Nexus '28 ", ''))).join(' and ')}.` : ''}</p>`);
    S.push(`<small>PRIME TIME</small><h1>${esc(d.busiestHourLabel)}</h1><p>was your busiest hour. ${esc(d.busiestDay)}s were your day, and ${esc(d.busiestMonth)} your month.</p>${bar(d.hours, null, d.busiestHour)}`);
    if (d.features.length) S.push(`<small>TOP @FEATURES</small><div class="wr-list">${d.features.map((f, i) => `<div><span>${i + 1}</span>@${esc(f.id)}<em>${f.n}</em></div>`).join('')}</div>`);
    if (d.topics.length) S.push(`<small>YOU TALKED ABOUT</small><div class="wr-words">${d.topics.map((t, i) => `<span style="font-size:${30 - i * 3}px">${esc(t)}</span>`).join('')}</div>`);
    S.push(`<small>BY THE NUMBERS</small><div class="wr-grid"><div><b>${d.points}</b>points</div><div><b>${d.bestStreak}</b>day best streak</div><div><b>${d.achievements}/${d.achievementsTotal}</b>achievements</div><div><b>${d.cardsReviewed}</b>flashcards reviewed</div><div><b>${d.missions}</b>missions</div><div><b>${d.challenges}</b>daily challenges</div></div>`);
    S.push(`<small>YOUR NEXUS PERSONALITY</small><h1>${esc(d.persona.title)}</h1><p>${esc(d.persona.line)}</p><p class="wr-dim">Thanks for building with Nexus this year.</p>`);
    return S;
  }
  async function openWrapped() {
    if (!flagOn('nexus_wrapped')) return;
    const d = await api.wrapped.data(new Date().getFullYear());
    wr = wrSlides(d); wrI = 0;
    $('wrapped').hidden = false; drawWrapped();
  }
  function drawWrapped() {
    $('wrStage').innerHTML = `<div class="wr-slide s${wrI % 4}">${wr[wrI]}</div>`;
    $('wrBar').innerHTML = wr.map((_, i) => `<i class="${i < wrI ? 'done' : i === wrI ? 'now' : ''}"></i>`).join('');
    $('wrPrev').disabled = wrI === 0; $('wrNext').disabled = wrI === wr.length - 1;
  }
  $('wrPrev').addEventListener('click', () => { if (wrI > 0) { wrI--; drawWrapped(); } });
  $('wrNext').addEventListener('click', () => { if (wrI < wr.length - 1) { wrI++; drawWrapped(); } });
  $('wrStage').addEventListener('click', () => $('wrNext').click());
  $('wrClose').addEventListener('click', () => { $('wrapped').hidden = true; });
  $('wrSave').addEventListener('click', async () => { $('wrapped').classList.add('saving'); await new Promise(r => setTimeout(r, 60)); const r = await api.wrapped.save(); $('wrapped').classList.remove('saving'); if (r.ok) api.reveal(r.path); });
  document.addEventListener('keydown', e => { if ($('wrapped').hidden) return; if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); $('wrNext').click(); } if (e.key === 'ArrowLeft') $('wrPrev').click(); if (e.key === 'Escape') { e.stopImmediatePropagation(); $('wrapped').hidden = true; } }, true);

  // ---------- Achievements
  function chime() {
    try {
      const ctx = new AudioContext(), t = ctx.currentTime;
      [660, 880, 1320].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * .09); g.gain.linearRampToValueAtTime(.07, t + i * .09 + .02); g.gain.exponentialRampToValueAtTime(.0001, t + i * .09 + .5);
        o.connect(g).connect(ctx.destination); o.start(t + i * .09); o.stop(t + i * .09 + .55); });
      setTimeout(() => ctx.close(), 1400);
    } catch {}
  }
  function toast(a) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="t-icon"></span><div><small>${a.kind === 'challenge' ? 'DAILY CHALLENGE' : 'ACHIEVEMENT UNLOCKED'}</small><b></b><span class="t-desc"></span></div>`;
    if (a.kind === 'challenge') { el.classList.add('t-challenge'); setTimeout(renderDaily, 100); }
    el.querySelector('.t-icon').textContent = a.icon; el.querySelector('b').textContent = a.name; el.querySelector('.t-desc').textContent = a.desc;
    el.addEventListener('click', () => settings.open('stats'));
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 4800); setTimeout(() => el.remove(), 5400);
  }
  api.metrics.onAchievement(list => { renderDaily(); chime(); list.forEach((a, i) => setTimeout(() => toast(a), i * 700)); orb.pulse(.8); });

  // ---------- ⌘K command palette
  let palItems = [], palSel = 0, palMode = 'all', palClips = [], palFiles = { q: '', list: [] }, palFileTimer = null;
  const tilde = p => p.replace(/^\/Users\/[^/]+/, '~');
  function clipCommands(add, q) {
    palClips.filter(c => !q || c.text.toLowerCase().includes(q)).slice(0, 25).forEach(c => add('Clipboard history', c.text.replace(/\s+/g, ' ').slice(0, 90), () => {
      const inp = $('input'); inp.value = (inp.value ? inp.value + (/\s$/.test(inp.value) ? '' : ' ') : '') + c.text; autosize(); inp.focus();
    }, { icon: '📋', words: c.text.slice(0, 400) }));
  }
  function fileCommands(add) {
    palFiles.list.forEach(f => add('Files on your Mac', f.name, () => api.finder.open(f.path), { icon: f.dir ? '📁' : '📄', words: palFiles.q + ' ' + tilde(f.path), hint: tilde(f.path.replace(/\/[^/]+$/, '')) }));
  }
  // Spotlight results arrive a moment after typing.
  function findFilesSoon(q) {
    clearTimeout(palFileTimer);
    if (q.length < 3 || palFiles.q === q) return;
    palFileTimer = setTimeout(async () => {
      const r = await api.finder.find(q);
      if (r.ok && $('palInput').value.trim().toLowerCase() === q) { palFiles = { q, list: r.files }; renderPalette(); }
    }, 220);
  }
  const THEMES = [['green', 'Nexus Green'], ['arc', 'Arc Reactor (cyan)'], ['critical', 'Critical (red)'], ['amber', 'LentOS Classic (amber)']];
  const TAB_NAMES = [['account', 'Account'], ['providers', 'Providers'], ['personas', 'Agents'], ['connectors', 'Connectors'], ['voice', 'Voice'], ['mac', 'Mac'], ['features', 'Features'], ['beta', 'Beta'], ['routines', 'Routines'], ['stats', 'Stats'], ['general', 'General'], ['activity', 'Activity']];
  function commands(q) {
    const out = [];
    const add = (group, label, run, o = {}) => out.push({ group, label, run, keys: o.keys || '', icon: o.icon || '›', words: o.words || '', color: o.color || '', hint: o.hint || '' });
    if (palMode === 'clip') { clipCommands(add, q); return out; }
    if (palMode === 'files') { if (palFiles.q === q) fileCommands(add); return out; }
    const w = state.wake || {};
    add('Actions', 'New chat', newChat, { keys: '⌘N', icon: '＋', words: 'start fresh' });
    add('Actions', 'Look at my screen', look, { icon: '◉', words: 'screenshot screen capture see' });
    add('Actions', 'Attach a file…', async () => addResults(await api.files.pick()), { icon: '⎘', words: 'upload image pdf document' });
    add('Actions', 'Regenerate the last reply', () => regenerate(), { keys: '⌘R', icon: '↻', words: 'retry again redo' });
    add('Actions', 'Start a mission…', () => openMission(), { icon: '⚑', words: 'background task research paragon template' });
    (mtData.builtin.length ? mtData.builtin : []).forEach(t => add('Missions', `Mission: ${t.name}`, () => openMission(t.id), { icon: t.icon, words: 'mission template ' + t.desc }));
    add('Actions', 'Watch a window…', () => openWatch(), { icon: '👁', words: 'monitor notify tell me when keep an eye' });
    add('Actions', 'Paste from clipboard history…', () => openPalette('clip'), { icon: '📋', words: 'copied clipboard paste history' });
    add('Actions', 'Find a file on my Mac…', () => openPalette('files'), { icon: '🔎', words: 'spotlight search document pdf finder' });
    add('Actions', 'Get my Morning Brief', () => api.brief.run().then(r => r.convId && api.conv.open(r.convId)), { icon: '☀', words: 'brief morning day summary' });
    add('Actions', w.enabled ? 'Turn off "Hey Nexus"' : 'Turn on "Hey Nexus"', () => $('wakeChip').click(), { icon: '◎', words: 'wake word voice listen' });
    add('Actions', state.settings.omnibrief ? 'Turn off OmniBrief' : 'Turn on OmniBrief', toggleOmni, { keys: '⌘B', icon: '≡', words: 'short answers brief' });
    add('Actions', 'Dictate a message', dictate, { keys: '⌘D', icon: '🎙', words: 'voice mic speak' });
    for (const [f, l] of [['md', 'Markdown'], ['pdf', 'PDF'], ['docx', 'Word'], ['txt', 'plain text'], ['json', 'JSON']])
      add('Actions', `Export this chat as ${l}`, () => { $('chatMenu').querySelector(`[data-export="${f}"]`).click(); }, { icon: '⤓', words: 'save download export' });
    add('Actions', 'New space', () => $('spaces').querySelector('[data-addspace]').click(), { icon: '▦', words: 'folder group' });
    add('Actions', 'New routine…', () => { settings.open('routines'); setTimeout(() => document.getElementById('rtNew')?.click(), 50); }, { icon: '⟳', words: 'schedule every daily' });
    add('Actions', 'Check for updates', () => api.update.check().then(u => { state.update = u; renderBanners(); setTopStatus(u.newer ? `v${u.latest} AVAILABLE` : 'UP TO DATE'); setTimeout(() => setTopStatus('STANDBY'), 2500); }), { icon: '⇪', words: 'update version' });
    add('Actions', 'Take the tour', startTour, { icon: '✦', words: 'onboarding help intro welcome' });
    add('Actions', 'Send feedback…', () => settings.open('general', 'feedback'), { icon: '✉', words: 'bug report email' });
    add('Actions', 'Hide Nexus', () => api.hide(), { keys: 'esc', icon: '–' });
    personas.filter(p => !p.legacy).forEach((p, i) => add('Agents', `Switch to ${p.name}`, () => setActive(p.id), { keys: '⌘' + (i + 1), color: p.color, icon: '●', words: p.handle }));
    personas.filter(p => p.legacy).forEach(p => add('Agents', `Switch to ${p.name}`, () => setActive(p.id), { color: p.color, icon: '●', words: p.handle + ' classic' }));
    TAB_NAMES.forEach(([id, l]) => add('Settings', `Settings: ${l}`, () => settings.open(id), { icon: '⚙', words: 'preferences options' }));
    add('Actions', 'Start a huddle…', () => { $('input').value = '@huddle '; $('input').focus(); }, { icon: '◍', words: 'agents together compare all agents group' });
    if (flagOn('homework_helper')) add('Actions', 'Homework helper (looks at your screen)', () => homework(), { icon: '📐', words: 'homework math problem hint tutor help solve' });
    if (flagOn('citations')) add('Actions', 'Cite a source…', () => openCite(), { icon: '❝', words: 'citation mla apa chicago works cited bibliography reference' });
    if (flagOn('nexus_wrapped')) add('Actions', `Play Nexus Wrapped ${new Date().getFullYear()}`, () => openWrapped(), { icon: '✦', words: 'wrapped year review stats recap' });
    if (flagOn('daily_challenge')) add('Actions', "Today's challenge", () => settings.open('stats'), { icon: '🏁', words: 'daily challenge points' });
    add('Actions', 'Become a beta tester…', () => settings.open('beta'), { icon: 'β', words: 'beta test early features signup' });
    add('Actions', 'Study flashcards…', () => openStudy(), { icon: '📚', words: 'study deck review spaced repetition flashcards quiz' });
    add('Actions', 'Make a flashcard deck…', () => openStudy('make'), { icon: '🗂', words: 'study new deck flashcards create' });
    add('Actions', 'Get my Evening Wrap-up', () => api.wrap.run().then(r => r.convId && api.conv.open(r.convId)), { icon: '☾', words: 'evening night wrap up recap day summary' });
    if (state.conv.active?.kind === 'mission') add('Actions', 'Share this mission report (PDF)', () => shareMission(state.conv.active.id, 'pdf'), { icon: '⤓', words: 'mission export share report word pdf' });
    add('Actions', 'Start a debate…', () => openDebate(), { icon: '⚖', words: 'argue for against agents vs' });
    add('Actions', 'Make a custom @feature…', () => settings.open('features'), { icon: '✺', words: 'feature custom create' });
    add('Actions', 'Open the theme editor…', () => settings.open('general', 'themeEditor'), { icon: '🎨', words: 'theme colors custom editor' });
    window.NexusTheme.list(state.settings).map(t => [t.id, t.name]).forEach(([id, l]) => add('Themes', `Theme: ${l}`, () => api.setSettings({ theme: id }).then(r => { state.settings = r.settings; applyTheme(); }), { icon: '◐', words: 'color look' }));
    (state.conv.summary.spaces || []).forEach(x => add('Spaces', `Show space: ${x.name}`, () => { spaceFilter = x.id; renderHistory(); }, { color: x.color, icon: '●', words: 'folder' }));
    routinesList.filter(r => r.kind !== 'brief').forEach(r => add('Routines', `Run routine: ${r.name}`, () => api.routines.runNow(r.id), { icon: '⟳', words: r.prompt }));
    const chats = state.conv.summary.list.slice(0, q ? 200 : 6);
    chats.forEach(c => add(q ? 'Chats' : 'Recent chats', c.title, () => { if (current) stop(); api.conv.select(c.id); }, { icon: '💬', words: 'chat conversation' }));
    if (q && q.length >= 3) { clipCommands(add, q); if (palFiles.q === q) fileCommands(add); }
    return out;
  }
  // Fuzzy score: exact substring wins (earlier = better), then word starts, then letters in order.
  function fuzzy(q, item) {
    const t = item.label.toLowerCase(), extra = item.words.toLowerCase();
    if (!q) return 1;
    const i = t.indexOf(q);
    if (i >= 0) return 1000 - i * 3 - t.length * .1 + (t.startsWith(q) ? 200 : 0);
    if (extra.includes(q)) return 500;
    const parts = q.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts.every(p => t.includes(p) || extra.includes(p))) return 450;
    let j = 0, score = 0, prev = -2;
    for (let k = 0; k < t.length && j < q.length; k++) if (t[k] === q[j]) { score += k === prev + 1 ? 6 : /\s|:/.test(t[k - 1] || ' ') ? 8 : 2; prev = k; j++; }
    return j === q.length ? score : -1;
  }
  function renderPalette() {
    const q = $('palInput').value.trim().toLowerCase();
    if (palMode !== 'clip') findFilesSoon(q);
    const all = commands(q);
    if (palMode !== 'all') palItems = palMode === 'files' && q ? all : all.slice(0, 40);
    else palItems = q ? all.map(it => ({ it, s: fuzzy(q, it) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 40).map(x => x.it)
      : [...all.filter(x => x.group === 'Actions').slice(0, 7), ...all.filter(x => x.group === 'Recent chats'), ...all.filter(x => x.group === 'Agents').slice(0, 4)];
    if (palMode !== 'all' && !q) palItems = palItems.slice(0, 40);
    palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
    let lastGroup = '';
    $('palList').innerHTML = palItems.length ? palItems.map((it, i) => {
      const head = !q && it.group !== lastGroup ? `<div class="pal-group">${esc(it.group.toUpperCase())}</div>` : '';
      lastGroup = it.group;
      return `${head}<div class="pal-item ${i === palSel ? 'sel' : ''}" data-i="${i}"><span class="pal-ic" ${it.color ? `style="color:${it.color}"` : ''}>${esc(it.icon)}</span>
        <span class="pal-label">${esc(it.label)}${it.hint ? `<em>${esc(it.hint)}</em>` : ''}</span>${q && palMode === 'all' ? `<small>${esc(it.group)}</small>` : ''}${it.keys ? `<kbd>${esc(it.keys)}</kbd>` : ''}</div>`;
    }).join('') : palMode === 'clip' ? `<div class="pal-empty">${palClips.length ? 'Nothing you copied matches.' : state.settings.clipboard?.history === false ? 'Clipboard history is off (Settings → Mac).' : 'Nothing copied yet. Passwords are never kept.'}</div>`
      : palMode === 'files' ? `<div class="pal-empty">${q.length < 3 ? 'Type a file name or words inside it…' : palFiles.q === q ? 'No files found.' : 'Searching…'}</div>`
      : `<div class="pal-empty">Nothing matches "${esc(q)}". Press <kbd>↵</kbd> to ask ${esc(active().handle)} instead.</div>`;
    $('palList').querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' });
  }
  async function openPalette(mode = 'all') {
    palMode = mode; palFiles = { q: '', list: [] };
    $('palette').hidden = false; $('palInput').value = ''; palSel = 0;
    $('palInput').placeholder = mode === 'clip' ? 'Search what you copied…' : mode === 'files' ? 'Find a file on your Mac…' : 'Type a command, chat, setting, file…';
    palClips = await api.clip.list().catch(() => []);
    renderPalette(); $('palInput').focus();
  }
  function closePalette() { $('palette').hidden = true; $('input').focus(); }
  function togglePalette() { $('palette').hidden ? openPalette() : closePalette(); }
  function runPalette(i) {
    const it = palItems[i];
    const q = $('palInput').value.trim();
    closePalette();
    if (it) return it.run();
    if (q && palMode === 'all') { $('input').value = q; send(); }
  }
  $('palInput').addEventListener('input', () => { palSel = 0; renderPalette(); });
  $('palInput').addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = (palSel + 1) % Math.max(1, palItems.length); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = (palSel - 1 + palItems.length) % Math.max(1, palItems.length); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(palSel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
  });
  $('palList').addEventListener('mousemove', e => { const it = e.target.closest('.pal-item'); if (it && +it.dataset.i !== palSel) { palSel = +it.dataset.i; $('palList').querySelectorAll('.pal-item').forEach((n, k) => n.classList.toggle('sel', k === palSel)); } });
  $('palList').addEventListener('click', e => { const it = e.target.closest('.pal-item'); if (it) runPalette(+it.dataset.i); });
  $('palette').addEventListener('mousedown', e => { if (e.target === $('palette')) closePalette(); });
  api.routines.onChange(list => { routinesList = list; });

  // ---------- First-run tour
  let obStep = 0, obNick = '', obKeyChoice = 'free';
  const hk = a => esc(prettyAccel(a));
  const OB = [
    { title: 'Welcome', html: () => `<div class="ob-hero"><svg class="ob-hex" viewBox="0 0 24 24"><path d="M12 2l8.66 5v10L12 22l-8.66-5V7z"/><circle cx="12" cy="12" r="3.2"/></svg>
        <h2>Welcome to Nexus '28</h2><p>Your AI command center, right in the menu bar. Four agents, your voice, your screen, your day.</p></div>
        <label class="ob-field">What should Nexus call you?<input id="obNick" maxlength="40" placeholder="Your name or nickname" value="${esc(obNick || state.settings.nickname || '')}"></label>` },
    { title: 'Free to start', html: () => `<h3>Free to start, no setup</h3>
        <p class="ob-p">Nexus comes with a shared free key, with the same limits as the web Nexus:</p>
        <div class="ob-tiers"><div><b>Flash</b><span>Unlimited</span></div><div><b>Lyte</b><span>95 chats</span></div><div><b>Neodela</b><span>28 chats</span></div><div><b>Paragon</b><span>Your own key</span></div></div>
        <div class="ob-choice"><label><input type="radio" name="obk" value="free" ${obKeyChoice === 'free' ? 'checked' : ''}> Use the free Nexus key for now</label>
          <label><input type="radio" name="obk" value="own" ${obKeyChoice === 'own' ? 'checked' : ''}> I have an API key (no limits, unlocks Paragon)</label></div>
        <div class="ob-key" ${obKeyChoice === 'own' ? '' : 'hidden'}><select id="obProv">${Object.entries(providers).filter(([, p]) => p.needsKey).map(([id, p]) => `<option value="${id}">${esc(p.label)}</option>`).join('')}</select>
          <input id="obKey" type="password" placeholder="Paste your API key"><button class="ghost-btn" id="obKeySave">Save</button></div><span class="note" id="obKeyNote"></span>` },
    { title: 'Talk to it', html: () => `<h3>Four ways in</h3>
        <div class="ob-keys">
          <div><kbd>${hk(state.settings.hotkeyQuick)}</kbd><span><b>Quick Ask</b> · talk, it answers out loud</span></div>
          <div><kbd>${hk(state.settings.hotkeyQuickChat)}</kbd><span><b>Quick Chat</b> · a small typing bar anywhere</span></div>
          <div><kbd>${hk(state.settings.hotkeyScreen || 'Alt+Shift+S')}</kbd><span><b>Ask about your screen</b> · it looks at the window you're using</span></div>
          <div><kbd>⌘K</kbd><span><b>Command palette</b> · every action in one place</span></div>
        </div>
        <label class="ob-wake ${state.wake?.supported ? '' : 'off'}"><span class="switch"><input type="checkbox" id="obWake" ${state.settings.wakeWord ? 'checked' : ''} ${state.wake?.supported ? '' : 'disabled'}><i></i></span>
          <span><b>"Hey Nexus"</b> · say it to start talking, then keep the conversation going. Listens on this Mac only.${state.wake?.supported ? '' : ' (Needs the speech helper: run npm run build:helper.)'}</span></label>` },
    { title: 'Make it yours', html: () => `<h3>Pick a look</h3>
        <div class="ob-themes">${THEMES.map(([id, l]) => `<button class="ob-theme t-${id} ${state.settings.theme === id ? 'sel' : ''}" data-theme="${id}"><i></i>${esc(l)}</button>`).join('')}</div>
        <h3 style="margin-top:14px">Start with</h3>
        <div class="ob-agents">${personas.filter(p => !p.legacy).map(p => `<button class="ob-agent ${state.settings.activePersona === p.id ? 'sel' : ''}" data-agent="${p.id}" style="--c:${p.color}"><b>${esc(p.handle)}</b><small>${state.access[p.id]?.mode === 'blocked' ? 'needs your own key' : esc(p.tag || '')}</small></button>`).join('')}</div>` },
    { title: 'Ready', html: () => `<div class="ob-hero"><h2>You're set${(obNick || state.settings.nickname) ? ', ' + esc(obNick || state.settings.nickname) : ''}.</h2><p>Try one of these, or ask anything.</p></div>
        <div class="ob-tries">
          <button data-try="What can you do? Give me 5 quick examples.">What can you do?</button>
          <button data-try="every weekday at 8, give me one interesting fact to start the day">Make a routine</button>
          <button data-try="calc 18% tip on 64.50">Try a quick calc</button>
        </div>
        <p class="note" style="text-align:center">Find everything later with <kbd>⌘K</kbd>. You can take this tour again in Settings → General.</p>` }
  ];
  function renderTour() {
    $('obSteps').innerHTML = OB.map((s, i) => `<span class="${i === obStep ? 'now' : i < obStep ? 'done' : ''}">${esc(s.title)}</span>`).join('');
    $('obBody').innerHTML = OB[obStep].html();
    $('obBack').hidden = obStep === 0;
    $('obNext').textContent = obStep === OB.length - 1 ? 'Start using Nexus' : 'Next';
    setTimeout(() => $('obNick')?.focus(), 30);
  }
  async function startTour() {
    obStep = 0; $('onboard').hidden = false; settings.close?.();
    // No key yet → start on Flash (unlimited on the free key) instead of Paragon (needs your own key).
    if (!Object.keys(state.keys).length && state.access[state.settings.activePersona]?.mode === 'blocked') await setActive('flash');
    renderTour();
  }
  async function finishTour(tryText) {
    if (obNick.trim() && obNick.trim() !== (state.settings.nickname || '')) await api.profile.setNickname(obNick);
    state.settings = (await api.setSettings({ onboarded: true, seenWhatsNew: VER })).settings;
    $('onboard').hidden = true;
    renderBanners(); renderFeed();
    if (tryText) { $('input').value = tryText; send(); } else $('input').focus();
  }
  $('obNext').addEventListener('click', () => { if (obStep === 0) obNick = $('obNick')?.value || ''; if (obStep < OB.length - 1) { obStep++; renderTour(); } else finishTour(); });
  $('obBack').addEventListener('click', () => { if (obStep === 0) return; if (obStep === 0) obNick = $('obNick')?.value || ''; obStep--; renderTour(); });
  $('obSkip').addEventListener('click', () => { if (obStep === 0) obNick = $('obNick')?.value || ''; finishTour(); });
  $('obBody').addEventListener('input', e => { if (e.target.id === 'obNick') obNick = e.target.value; });
  $('obBody').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'obNick') $('obNext').click(); });
  $('obBody').addEventListener('change', async e => {
    const t = e.target;
    if (t.name === 'obk') { obKeyChoice = t.value; renderTour(); }
    if (t.id === 'obWake') { state.wake = await api.wake.set(t.checked); renderWake(); }
  });
  $('obBody').addEventListener('click', async e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'obKeySave') {
      const key = $('obKey').value.trim(); if (!key) return;
      state.keys = await api.setKey($('obProv').value, key);
      $('obKeyNote').className = 'note ok'; $('obKeyNote').textContent = '✓ Saved to your Keychain. That provider has no limits now.';
      keyStatus();
    }
    if (t.dataset.theme) { state.settings = (await api.setSettings({ theme: t.dataset.theme })).settings; applyTheme(); renderTour(); }
    if (t.dataset.agent) { await setActive(t.dataset.agent); renderTour(); }
    if (t.dataset.try) finishTour(t.dataset.try);
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
    if (panel === 'mission') openMission();
    else if (panel === 'watch') openWatch();
    else if (panel === 'study') openStudy();
    else if (panel === 'settings') settings.open(); else if (panel) settings.open(panel); else if (!settings.isOpen()) input.focus();
    renderWake();
    orb.pulse(.6);
  });

  // ---------- Boot
  applyTheme(); refreshAgent(); renderHistory(); renderFeed(); showQuickHint(); renderAccountChip(); renderBanners(); renderWake(); renderMission(); renderWatches(); renderStaged(); renderDaily();
  orb.setColor(active().color, true);
  function keyStatus() {
    if (Object.keys(state.keys).length) return setTopStatus('STANDBY', '');
    if (state.settings.freeKey?.enabled !== false) return setTopStatus('FREE NEXUS KEY', '');
    setTopStatus('NO KEYS — OPEN SETTINGS', 'err');
  }
  keyStatus();
  input.focus();
  if (!state.settings.onboarded) setTimeout(startTour, 400);
})();
