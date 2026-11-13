// Shared chat rendering for the HUD and Quick Chat: messages, activity chips, live status,
// images, link previews, sources, approval cards, and read-aloud.
(function () {
  const { render, esc } = window.NexusMarkdown;
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  const ICONS = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
    plug: '<svg viewBox="0 0 24 24"><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    speak: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    sys: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    regen: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    clip: '<svg viewBox="0 0 24 24"><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>',
    calc: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12v5M8 16h2M12 16h2"/></svg>',
    caret: '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v6"/></svg>',
    chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>'
  };
  function iconFor(tool) {
    if (tool === 'web_search') return ICONS.search;
    if (tool === 'fetch_url') return ICONS.globe;
    if (/^calendar/.test(tool)) return ICONS.cal;
    if (/^reminders/.test(tool)) return ICONS.check;
    if (tool === 'look_at_screen') return ICONS.eye;
    if (tool === 'system') return ICONS.sys;
    return ICONS.plug;
  }

  // Live status line text from a chat:event.
  function statusText(ev, providerLabel) {
    switch (ev.status) {
      case 'connecting': return { text: `Connecting to ${(ev.label || providerLabel || 'model').replace(/ \(.*\)/, '')}`, kind: 'net' };
      case 'thinking': return { text: 'Thinking', kind: 'think' };
      case 'writing': return { text: 'Writing', kind: 'write' };
      case 'awaiting': return { text: 'Waiting for your approval', kind: 'wait' };
      case 'tool': return { text: ev.detail ? `${ev.label} · ${ev.detail}` : ev.label, kind: ev.tool === 'web_search' || ev.tool === 'fetch_url' ? 'net' : 'tool' };
      default: return { text: '', kind: '' };
    }
  }
  function statusEl() {
    const el = document.createElement('div');
    el.className = 'live-status';
    el.innerHTML = '<span class="ls-orb"></span><span class="ls-text"></span>';
    return el;
  }
  function setStatus(el, s) {
    el.dataset.kind = s.kind || '';
    el.querySelector('.ls-text').textContent = s.text;
    el.hidden = !s.text;
  }

  function activityChip(a) {
    const el = document.createElement('div');
    el.className = `act act-${a.status}`;
    const status = { running: '', awaiting: 'needs approval', ok: a.summary || 'done', error: a.summary || 'failed', denied: 'declined', skipped: a.detail || '' }[a.status] || '';
    el.innerHTML = `<span class="act-ic">${iconFor(a.tool)}</span><span class="act-label">${esc(a.label)}</span>` +
      (a.detail && a.status !== 'skipped' ? `<span class="act-detail">${esc(a.detail)}</span>` : '') +
      (status ? `<span class="act-status">${esc(status)}</span>` : '');
    el.title = [a.label, a.detail, a.summary].filter(Boolean).join(' — ');
    return el;
  }

  function weatherCard(c) {
    const el = document.createElement('div');
    el.className = 'wx';
    el.innerHTML = `<div class="wx-now"><span class="wx-icon">${esc(c.now.icon)}</span>
        <div><div class="wx-temp">${esc(String(c.now.temp))}<small>${esc(c.unit)}</small></div><div class="wx-text">${esc(c.now.text)}</div></div>
        <div class="wx-meta"><b>${esc(c.place)}</b><span>Feels ${esc(String(c.now.feels))}${esc(c.unit)} · Humidity ${esc(String(c.now.humidity))}% · Wind ${esc(c.now.wind)}</span></div></div>
      <div class="wx-days">${c.daily.map(d => `<div class="wx-day"><span>${esc(d.day)}</span><span class="wx-di" title="${esc(d.text)}">${esc(d.icon)}</span><b>${esc(String(d.hi))}°</b><small>${esc(String(d.lo))}°</small>${d.rain != null ? `<em>${esc(String(d.rain))}%</em>` : ''}</div>`).join('')}</div>`;
    return el;
  }

  function imagesEl(urls, api) {
    const wrap = document.createElement('div');
    wrap.className = 'img-strip';
    for (const u of urls.slice(0, 6)) {
      const img = document.createElement('img');
      img.src = u; img.loading = 'lazy'; img.alt = '';
      img.onerror = () => img.remove();
      img.addEventListener('click', () => /^https?:/.test(u) && api.openExternal(u));
      wrap.appendChild(img);
    }
    return wrap;
  }

  function sourcesEl(sources, api) {
    const wrap = document.createElement('div');
    wrap.className = 'sources';
    wrap.innerHTML = `<span class="src-title">SOURCES</span>` + sources.slice(0, 8).map((s, i) =>
      `<a class="src" href="${esc(s.url)}" data-ext title="${esc(s.title || s.url)}"><img src="https://${esc(host(s.url))}/favicon.ico" alt=""><span>${i + 1}. ${esc(host(s.url))}</span></a>`).join('');
    wrap.querySelectorAll('img').forEach(img => { img.onerror = () => { img.style.visibility = 'hidden'; }; });
    return wrap;
  }

  // Link previews: up to 3 unique links per message (skips links already shown as sources).
  async function addPreviews(container, bodyEl, api, skip = []) {
    const urls = [...new Set([...bodyEl.querySelectorAll('a[data-ext]')].map(a => a.href))]
      .filter(u => /^https?:/.test(u) && !skip.includes(u)).slice(0, 3);
    if (!urls.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'previews';
    container.appendChild(wrap);
    for (const u of urls) {
      const p = await api.preview(u);
      if (!p || p.kind === 'error' || p.kind === 'file') continue;
      const card = document.createElement('a');
      card.href = u; card.dataset.ext = '';
      if (p.kind === 'image') {
        card.className = 'pv pv-image';
        card.innerHTML = `<img src="${esc(p.image)}" alt="" loading="lazy">`;
      } else {
        card.className = 'pv';
        card.innerHTML = `${p.image ? `<img class="pv-img" src="${esc(p.image)}" alt="" loading="lazy">` : ''}
          <div class="pv-body"><div class="pv-site">${esc(p.siteName || host(u))}</div><div class="pv-title">${esc(p.title || u)}</div>
          ${p.description ? `<div class="pv-desc">${esc(p.description)}</div>` : ''}</div>`;
      }
      card.querySelectorAll('img').forEach(img => img.onerror = () => img.remove());
      wrap.appendChild(card);
    }
    if (!wrap.children.length) wrap.remove();
    else window.dispatchEvent(new Event('nexus:grew'));
  }

  // One read-aloud at a time per window.
  function createReader(speaker) {
    let activeBtn = null;
    const reset = () => { if (activeBtn) { activeBtn.classList.remove('on'); activeBtn.innerHTML = ICONS.speak; activeBtn.title = 'Read aloud'; } activeBtn = null; };
    return {
      async toggle(btn, text) {
        if (activeBtn === btn) { speaker.stop(); reset(); return; }
        speaker.stop(); reset();
        activeBtn = btn;
        btn.classList.add('on'); btn.innerHTML = ICONS.stop; btn.title = 'Stop reading';
        await speaker.speak(text, 'read');
        if (activeBtn === btn) reset();
      },
      stop() { speaker.stop(); reset(); }
    };
  }

  // Progress ring (0–1). Used for free-key chats left.
  function ring(frac, { color = 'currentColor', size = 16, stroke = 2.4, title = '', label = '' } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"${title ? ` aria-label="${esc(title)}"` : ''}>${title ? `<title>${esc(title)}</title>` : ''}
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      ${label ? `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="${size * .26}" fill="currentColor">${esc(label)}</text>` : ''}</svg>`;
  }

  // Attachment chips (files, images, screenshots). opts.onRemove(id) makes them removable (composer).
  function attachChips(list, opts = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'att-strip';
    for (const a of list || []) {
      const chip = document.createElement('div');
      chip.className = `att-chip k-${a.kind || 'file'}${a.pending ? ' pending' : ''}${a.error ? ' bad' : ''}`;
      const icon = a.thumb ? `<img src="${esc(a.thumb)}" alt="">` : `<span class="att-ic">${a.kind === 'screen' ? ICONS.eye : a.kind === 'chat' ? ICONS.chat : ICONS.file}</span>`;
      const label = a.error ? a.error : a.pending ? (a.kind === 'screen' ? 'Looking at your screen…' : `Reading ${a.name || 'file'}…`) : (a.kind === 'screen' ? (a.app || 'Screen') : a.name);
      chip.innerHTML = `${a.pending ? '<span class="att-spin"></span>' : icon}<span class="att-name">${esc(label || '')}</span>${a.kind === 'screen' && !a.pending && !a.error ? '<span class="att-tag">SCREEN</span>' : ''}${a.kind === 'chat' ? `<span class="att-tag">${a.pinned === 'space' ? 'SPACE' : a.pinned ? 'PINNED' : 'CHAT'}</span>` : ''}`;
      if (a.kind === 'chat') chip.title = a.pinned ? `"${a.name}" goes along with every message${a.pinned === 'space' ? ' in this space' : ' in this chat'}. Click the pin to unpin.` : `Linked chat "${a.name}": a short summary goes with this message.`;
      if (a.kind === 'chat' && opts.onPin) {
        const pin = document.createElement('button');
        pin.className = 'att-pin' + (a.pinned ? ' on' : ''); pin.innerHTML = ICONS.pin;
        pin.title = a.pinned ? 'Unpin' : 'Pin: keep this chat linked to every message here (⇧-click: to the whole space)';
        pin.addEventListener('click', e => { e.stopPropagation(); opts.onPin(a, e.shiftKey); });
        chip.appendChild(pin);
      }
      chip.title = a.kind === 'screen' ? `${a.app || 'Screen'}${a.title ? ' — ' + a.title : ''}${a.chars ? ` · ${a.chars} characters of text read` : ''}` : (a.name || '') + (a.note ? ' — ' + a.note : '');
      if (opts.onRemove && !a.pending && !a.pinned) {
        const x = document.createElement('button');
        x.className = 'att-x'; x.title = 'Remove'; x.textContent = '×';
        x.addEventListener('click', e => { e.stopPropagation(); opts.onRemove(a.id || a.tmp); });
        chip.appendChild(x);
      }
      if (a.thumb && !opts.onRemove) chip.addEventListener('click', () => {
        const big = document.createElement('div');
        big.className = 'att-zoom'; big.innerHTML = `<img src="${esc(a.thumb)}" alt="">`;
        big.addEventListener('click', () => big.remove());
        document.body.appendChild(big);
      });
      wrap.appendChild(chip);
    }
    return wrap;
  }

  // Build a message element. opts: { personas, api, reader, last, onRegenerate(personaId?), onVersion(index), regenAgents }
  function message(m, opts) {
    const { personas, api, reader } = opts;
    const el = document.createElement('div');
    const via = m.via === 'voice' ? '<span class="via">VOICE</span>' : m.via === 'quickchat' ? '<span class="via">QUICK</span>' : '';
    if (m.role === 'user') {
      el.className = 'msg user';
      el.innerHTML = `<div class="who">${via}YOU</div><div class="body"></div>`;
      el.querySelector('.body').innerHTML = esc(m.content).replace(/(^|\s)@([A-Za-z][\w.]*[\w])/g, '$1<span class="mention">@$2</span>');
      if (m.attachments?.length) el.insertBefore(attachChips(m.attachments), el.querySelector('.body'));
      if (!m.content) el.querySelector('.body').remove();
      return el;
    }
    const p = personas.find(x => x.id === m.persona) || personas[0];
    el.className = 'msg ai' + (m.error ? ' error' : '') + (m.local && /^(Calculator|Unit converter)/.test(m.model || '') ? ' local' : '');
    el.style.setProperty('--agent', p.color);
    el.innerHTML = `<div class="who" style="color:${p.color}">${esc(p.name.toUpperCase())}<small>${esc(m.model || '')}</small>${via}</div>
      <div class="acts"></div><div class="body"></div><div class="extras"></div>
      <div class="msg-tools"></div>`;
    if (m.features?.length) el.querySelector('.who').insertAdjacentHTML('beforeend', m.features.map(f => `<span class="feat-tag">@${esc(f)}</span>`).join(''));
    const acts = el.querySelector('.acts');
    for (const a of m.activity || []) acts.appendChild(activityChip(a));
    if (!acts.children.length) acts.remove();
    const body = el.querySelector('.body');
    body.innerHTML = m.error ? esc(m.content) : render(m.content);
    body.querySelectorAll('img.md-img').forEach(img => { img.onerror = () => img.remove(); img.addEventListener('click', () => /^https?:/.test(img.src) && api.openExternal(img.src)); });
    const extras = el.querySelector('.extras');
    const inlineImgs = [...body.querySelectorAll('img.md-img')].map(i => i.src);
    for (const c of m.cards || []) if (c.type === 'weather') extras.appendChild(weatherCard(c));
    const imgs = (m.images || []).filter(u => !inlineImgs.includes(u));
    if (imgs.length) extras.appendChild(imagesEl(imgs, api));
    if (m.sources?.length) extras.appendChild(sourcesEl(m.sources, api));
    if (m.attachments?.length) extras.appendChild(attachChips(m.attachments));
    if (m.chatRefs?.length) {
      const refs = document.createElement('div');
      refs.className = 'chat-refs';
      refs.innerHTML = '<span class="src-title">FROM YOUR CHATS</span>' + m.chatRefs.map(c => `<button data-conv="${esc(c.id)}">${ICONS.chat}<span>${esc(c.title)}</span></button>`).join('');
      refs.addEventListener('click', e => { const b = e.target.closest('[data-conv]'); if (b) api.conv.open(b.dataset.conv); });
      extras.appendChild(refs);
    }
    if (!m.error && !opts.noPreviews) addPreviews(extras, body, api);

    const tools = el.querySelector('.msg-tools');
    if (!m.error && m.content) {
      const speak = document.createElement('button');
      speak.className = 'mt-btn'; speak.title = 'Read aloud'; speak.innerHTML = ICONS.speak;
      speak.addEventListener('click', () => reader.toggle(speak, m.content));
      const copy = document.createElement('button');
      copy.className = 'mt-btn'; copy.title = 'Copy'; copy.innerHTML = ICONS.copy;
      copy.addEventListener('click', () => { navigator.clipboard.writeText(m.content).catch(() => {}); copy.classList.add('on'); setTimeout(() => copy.classList.remove('on'), 900); });
      tools.append(speak, copy);
    }
    // Regenerate (latest reply only) + ‹ 1/3 › versions
    if (opts.last && opts.onRegenerate && !m.local) {
      const regen = document.createElement('button');
      regen.className = 'mt-btn regen'; regen.title = 'Regenerate (⌘R) · hold for another agent'; regen.innerHTML = ICONS.regen;
      let held = false, timer = null;
      const openMenu = () => {
        held = true;
        document.querySelectorAll('.regen-menu').forEach(n => n.remove());
        const menu = document.createElement('div');
        menu.className = 'regen-menu';
        menu.innerHTML = '<div class="rm-head">REGENERATE WITH</div>' + (opts.regenAgents || []).map(p =>
          `<button data-id="${esc(p.id)}"><i style="background:${p.color};color:${p.color}"></i>${esc(p.handle)}${p.id === m.persona ? '<small>same</small>' : ''}</button>`).join('');
        menu.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; menu.remove(); opts.onRegenerate(b.dataset.id); });
        tools.appendChild(menu);
        setTimeout(() => document.addEventListener('click', function off(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', off); } }), 0);
      };
      regen.addEventListener('mousedown', () => { held = false; timer = setTimeout(openMenu, 450); });
      regen.addEventListener('mouseleave', () => clearTimeout(timer));
      regen.addEventListener('mouseup', () => clearTimeout(timer));
      regen.addEventListener('click', () => { if (!held) opts.onRegenerate(); });
      regen.addEventListener('contextmenu', e => { e.preventDefault(); openMenu(); });
      const more = document.createElement('button');
      more.className = 'mt-btn regen-more'; more.title = 'Regenerate with another agent'; more.innerHTML = ICONS.caret;
      more.addEventListener('click', e => { e.stopPropagation(); openMenu(); });
      tools.append(regen, more);
    }
    if (m.versions?.length > 1) {
      const v = m.v ?? m.versions.length - 1;
      const nav = document.createElement('span');
      nav.className = 'versions';
      nav.innerHTML = `<button ${v <= 0 ? 'disabled' : ''} data-d="-1">‹</button><span>${v + 1}/${m.versions.length}</span><button ${v >= m.versions.length - 1 ? 'disabled' : ''} data-d="1">›</button>`;
      nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b && opts.onVersion) opts.onVersion(v + +b.dataset.d); });
      if (opts.onVersion) tools.prepend(nav);
    }
    if (!tools.children.length) tools.remove();
    return el;
  }

  // Streaming placeholder with a live status line + activity chips.
  function streaming(persona, model) {
    const el = document.createElement('div');
    el.className = 'msg ai streaming';
    el.style.setProperty('--agent', persona.color);
    el.innerHTML = `<div class="who" style="color:${persona.color}">${esc(persona.name.toUpperCase())}<small>${esc(model || '')}</small></div><div class="acts"></div><div class="body"></div><div class="confirms"></div>`;
    const status = statusEl();
    el.insertBefore(status, el.querySelector('.acts'));
    const chips = new Map();
    return {
      el,
      setStatus: s => setStatus(status, s),
      setText: t => { el.querySelector('.body').innerHTML = render(t); },
      activity(a) {
        const chip = activityChip(a);
        const old = chips.get(a.id);
        old ? old.replaceWith(chip) : el.querySelector('.acts').appendChild(chip);
        chips.set(a.id, chip);
      },
      confirm(c, decide) { el.querySelector('.confirms').appendChild(confirmCard(c, decide)); }
    };
  }

  function confirmCard(c, decide) {
    const el = document.createElement('div');
    el.className = 'confirm';
    el.innerHTML = `<div class="cf-head"><span class="cf-ic">${iconFor(c.tool)}</span><b>${esc(c.label)}</b><span class="cf-tag">APPROVAL</span></div>
      ${c.detail ? `<div class="cf-detail">${esc(c.detail)}</div>` : ''}
      <div class="cf-actions"><button class="cf-deny">Deny</button><button class="cf-ok">Approve</button></div>`;
    const done = approve => {
      el.classList.add(approve ? 'approved' : 'denied');
      el.querySelector('.cf-actions').innerHTML = `<span>${approve ? 'Approved' : 'Denied'}</span>`;
      decide(approve);
    };
    el.querySelector('.cf-ok').addEventListener('click', () => done(true));
    el.querySelector('.cf-deny').addEventListener('click', () => done(false));
    el.decide = done;
    return el;
  }

  // Click-through for any [data-ext] link inside a container.
  function wireLinks(root, api) {
    root.addEventListener('click', e => {
      const a = e.target.closest('a[data-ext]');
      if (a) { e.preventDefault(); api.openExternal(a.href); }
    });
  }

  window.NexusView = { message, streaming, confirmCard, activityChip, statusText, createReader, wireLinks, attachChips, ring, ICONS };
})();
