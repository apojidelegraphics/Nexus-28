/* Generated from the Nexus '28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */
// Nexus '28 3.11 — the mind map of your chats as a pop-over, for N28C and Test Run (the Mac/PC app has its own window,
// renderer/mindmap.js). Same layout and drawing (mindtree.js) and the same grouping (mindmap-lib.js, from src/mindmap.js).
//   MapView.open({ chats, spaces, personas, iconFor, onOpen(chatId) })
//     chats: [{ id, title, preview?, spaceId?, pinned?, updated (ms), count?, agent?, personas? }]
//   MapView.button(title) → an <button> with the map icon, for next to the chat search
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.6"/><circle cx="4.5" cy="6" r="1.8"/><circle cx="19.5" cy="6" r="1.8"/><circle cx="5" cy="18.5" r="1.8"/><circle cx="19" cy="18.5" r="1.8"/><path d="M10 10.6 6 7.2M14 10.6l4-3.4M10.2 13.6l-3.7 3.4M13.8 13.6l3.7 3.4"/></svg>';
  const CSS = `
.mv-back{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.55);display:flex;align-items:stretch;justify-content:center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))}
.mv-box{position:relative;flex:1;max-width:1200px;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;background:var(--mv-bg,#04100b);border:1px solid rgba(var(--accent-rgb,61,255,160),.28);box-shadow:0 20px 60px rgba(0,0,0,.6);
  --mt-bg:var(--mv-bg,#04100b);--mt-accent:var(--accent,#3dffa0);--mt-line:rgba(var(--accent-rgb,61,255,160),.3)}
.mv-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(var(--accent-rgb,61,255,160),.15);flex-wrap:wrap}
.mv-top b{font-size:14px}.mv-top small{color:var(--muted,#7fae98)}.mv-sp{flex:1}
.mv-top input{flex:1;min-width:120px;max-width:260px;padding:7px 10px;border-radius:9px;border:1px solid rgba(var(--accent-rgb,61,255,160),.3);background:rgba(0,0,0,.3);color:inherit;font:inherit;outline:none}
.mv-top button{border:1px solid rgba(var(--accent-rgb,61,255,160),.3);background:rgba(0,0,0,.25);color:inherit;border-radius:9px;padding:6px 10px;font:inherit;cursor:pointer}
.mv-top button.on{background:rgba(var(--accent-rgb,61,255,160),.2)}
.mv-stage{position:relative;flex:1;min-height:0}
.mv-empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted,#7fae98);padding:30px;text-align:center}
.mv-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;height:36px;padding:0 12px 0 10px;border-radius:10px;border:1px solid rgba(var(--accent-rgb,61,255,160),.45);background:linear-gradient(180deg,rgba(var(--accent-rgb,61,255,160),.16),rgba(var(--accent-rgb,61,255,160),.06));color:var(--accent,#3dffa0);font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.02em;cursor:pointer;transition:background .15s,box-shadow .15s,transform .1s;white-space:nowrap}
.mv-btn svg{flex:none}.mv-btn:hover{background:rgba(var(--accent-rgb,61,255,160),.24);box-shadow:0 0 16px rgba(var(--accent-rgb,61,255,160),.35)}.mv-btn:active{transform:scale(.97)}
.mv-btn:focus-visible{outline:2px solid var(--accent,#3dffa0);outline-offset:2px}`;
  let styled = false;
  const style = () => { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); };
  const day = t => t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const monthOf = t => new Date(t || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function toTree(d) {
    const chats = d.nodes.filter(n => n.kind === 'chat'), hubs = d.nodes.filter(n => n.kind !== 'chat');
    const owner = new Map(); for (const l of d.links) if (l.kind === 'space' || l.kind === 'topic') owner.set(l.a, l.b);
    const byHub = new Map(hubs.map(h => [h.id, []])), loose = [];
    for (const c of chats) (owner.has(c.id) && byHub.has(owner.get(c.id)) ? byHub.get(owner.get(c.id)) : loose).push(c);
    const newest = (a, b) => (b.pinned - a.pinned) || (b.updated || 0) - (a.updated || 0);
    const leaf = n => ({ id: n.id, label: n.label, sub: `${n.count > 1 ? n.count + ' messages · ' : ''}${day(n.updated)}`, chat: n, words: n.words || [] });
    const many = chats.length > 30;
    const branches = hubs.filter(h => byHub.get(h.id).length).sort((a, b) => (a.kind === 'space' ? 0 : 1) - (b.kind === 'space' ? 0 : 1) || byHub.get(b.id).length - byHub.get(a.id).length)
      .map(h => { const kids = byHub.get(h.id).sort(newest); return { id: h.id, label: h.kind === 'space' ? h.label : '#' + h.label, sub: `${h.kind === 'space' ? 'Space' : 'Topic'} · ${kids.length}`, color: h.color || undefined, collapsed: many || kids.length > 6, children: kids.map(leaf) }; });
    if (loose.length) {
      loose.sort(newest);
      let children = loose.map(leaf);
      if (loose.length > 10) { const m = new Map(); for (const c of loose) { const k = monthOf(c.updated); if (!m.has(k)) m.set(k, []); m.get(k).push(c); } children = [...m].map(([k, l], i) => ({ id: 'month:' + k, label: k, sub: `${l.length} chats`, collapsed: i > 0 || l.length > 6, children: l.map(leaf) })); }
      branches.push({ id: 'other', label: 'Other chats', sub: `${loose.length} not in a Space or topic`, color: '#9aa8a2', collapsed: many, children });
    }
    return { id: 'root', label: 'Your chats', sub: `${chats.length} chats`, links: d.links.filter(l => l.kind === 'similar' || l.kind === 'link').map(l => ({ a: l.a, b: l.b, kind: l.kind })), children: branches };
  }

  function open({ chats = [], spaces = [], personas = [], iconFor, onOpen = () => {}, mode } = {}) {
    if (!root.ChatMap || !root.MindTree) return;
    style();
    // the chat lists here have titles and previews, not whole chats: that's what the map groups by
    const list = chats.map(c => ({ id: c.id, title: c.title || 'Chat', updated: c.updated || 0, pinned: !!c.pinned, spaceId: c.spaceId || null, links: c.links || [],
      messages: Array.from({ length: Math.max(1, Math.min(+c.count || 1, 60)) }, (_, i) => i ? { role: 'assistant', content: '' } : { role: 'user', content: c.preview || c.title || '', persona: (c.personas || [])[0] || c.agent || '' }) }));
    const d = root.ChatMap.build({ list, spaces });
    const n = d.nodes.filter(x => x.kind === 'chat').length;
    let m = mode || (() => { try { return localStorage.getItem('nexus-map-mode') || 'tree'; } catch { return 'tree'; } })();
    const back = document.createElement('div'); back.className = 'mv-back';
    back.innerHTML = `<div class="mv-box" role="dialog" aria-label="Mind map of your chats"><div class="mv-top"><b>Mind map</b><small>${n} chats</small><span class="mv-sp"></span>
      <input type="search" placeholder="Find in the map" aria-label="Find in the map"><button data-m="tree">Tree</button><button data-m="graph">Graph</button><button data-x aria-label="Close">Close</button></div>
      <div class="mv-stage">${n ? '' : '<div class="mv-empty">Your chats show up here once you have a few.</div>'}</div></div>`;
    document.body.appendChild(back);
    const stage = back.querySelector('.mv-stage'), q = back.querySelector('input');
    let mt = null;
    const paint = () => back.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (n) {
      const tip = node => node.chat ? `<b>${esc(node.chat.label)}</b><small>${node.chat.count > 1 ? node.chat.count + ' messages · ' : ''}${esc(day(node.chat.updated))}</small>${node.chat.persona ? `<small>Mostly ${esc((personas.find(p => p.id === node.chat.persona) || {}).name || node.chat.persona)}</small>` : ''}<small>Tap to open it</small>` : (node.children?.length && node.depth ? `<b>${esc(node.label)}</b><small>${esc(node.sub || '')}</small>` : '');
      mt = root.MindTree.create(stage, { tip, mode: m, iconFor, onOpen: node => { if (node.chat) { close(); onOpen(node.chat.id); } } });
      mt.set(toTree(d));
    }
    paint();
    function close() { mt?.destroy(); back.remove(); document.removeEventListener('keydown', key); }
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-x]')) return close();
      const b = e.target.closest('[data-m]'); if (b && mt) { m = b.dataset.m; mt.setMode(m); try { localStorage.setItem('nexus-map-mode', m); } catch {} paint(); }
    });
    q.addEventListener('input', () => mt?.search(q.value));
    return { close };
  }
  function button(title = 'Mind map of your chats') {
    style();
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mv-btn'; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = ICON + '<span>Map</span>';
    return b;
  }
  root.MapView = { open, button, toTree, ICON, LABEL: ICON + '<span>Map</span>' };
})(typeof window !== 'undefined' ? window : globalThis);
