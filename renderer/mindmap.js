// Mind map of your chats (3.9.1): a Notion-style mind map. "Your chats" in the middle, your Spaces and topics as
// branches, chats as the boxes on the ends. Fold a branch with its ○ (or click it), search, zoom, click a chat to open it.
// The layout and drawing live in mindtree.js (shared with Apoji Admin); this file turns your chats into a tree.
// 3.10: Tree or Graph (Obsidian-style), right-click a branch to ask about it (beta) or make a study deck from it.
(function () {
  const api = window.nexus, $ = id => document.getElementById(id), esc = window.MindTree.esc;
  let D = null, mt = null;
  const day = t => t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const monthOf = t => new Date(t || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function chatNode(n) {
    return { id: n.id, label: (n.pinned ? '📌 ' : '') + n.label, sub: `${n.count} message${n.count === 1 ? '' : 's'}${n.updated ? ' · ' + day(n.updated) : ''}`, open: true, chat: n, words: n.words || [], weight: n.count / 3 };
  }
  // the tree: Spaces first (biggest first), then topics, then everything else by month
  function toTree(d) {
    const chats = d.nodes.filter(n => n.kind === 'chat'), hubs = d.nodes.filter(n => n.kind !== 'chat');
    const owner = new Map();
    for (const l of d.links) if (l.kind === 'space' || l.kind === 'topic') owner.set(l.a, l.b);
    const byHub = new Map(hubs.map(h => [h.id, []]));
    const loose = [];
    for (const c of chats) (owner.has(c.id) && byHub.has(owner.get(c.id)) ? byHub.get(owner.get(c.id)) : loose).push(c);
    const newest = (a, b) => (b.pinned - a.pinned) || (b.updated || 0) - (a.updated || 0);
    const many = chats.length > 40;
    const branches = hubs.filter(h => byHub.get(h.id).length).sort((a, b) => (a.kind === 'space' ? 0 : 1) - (b.kind === 'space' ? 0 : 1) || byHub.get(b.id).length - byHub.get(a.id).length).map(h => {
      const kids = byHub.get(h.id).sort(newest);
      return { id: h.id, label: h.kind === 'space' ? h.label : '#' + h.label, sub: `${h.kind === 'space' ? 'Space' : 'Topic'} · ${kids.length} chat${kids.length === 1 ? '' : 's'}`, color: h.color || undefined, collapsed: many || kids.length > 8, hub: h, children: kids.map(chatNode) };
    });
    if (loose.length) {
      loose.sort(newest);
      let children;
      if (loose.length > 10) {   // lots of loose chats: one branch per month
        const months = new Map(); for (const c of loose) { const m = monthOf(c.updated); if (!months.has(m)) months.set(m, []); months.get(m).push(c); }
        children = [...months].map(([m, list], i) => ({ id: 'month:' + m, label: m, sub: `${list.length} chat${list.length === 1 ? '' : 's'}`, collapsed: i > 0 || list.length > 8, children: list.map(chatNode) }));
      } else children = loose.map(chatNode);
      branches.push({ id: 'other', label: 'Other chats', sub: `${loose.length} not in a Space or topic`, color: '#9aa8a2', collapsed: many, children });
    }
    // 3.10: extra lines in the graph view: chats about the same things, and chats you linked
    const links = d.links.filter(l => l.kind === 'similar' || l.kind === 'link').map(l => ({ a: l.a, b: l.b, kind: l.kind }));
    return { links, id: 'root', label: 'Your chats', sub: `${chats.length} chat${chats.length === 1 ? '' : 's'}${d.total > chats.length ? ` (newest ${chats.length} of ${d.total})` : ''}`, children: branches };
  }

  function tip(n) {
    if (n.chat) {
      const c = n.chat, p = D.personas.find(x => x.id === c.persona);
      const sims = D.links.filter(l => l.kind === 'similar' && (l.a === c.id || l.b === c.id)).map(l => D.nodes.find(x => x.id === (l.a === c.id ? l.b : l.a))).filter(Boolean);
      return `<b>${esc(c.label)}</b><small>${c.count} message${c.count === 1 ? '' : 's'}${p ? ' · mostly ' + esc(p.name) : ''}${c.updated ? ' · ' + esc(new Date(c.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })) : ''}</small>`
        + (c.words?.length ? `<small style="margin-top:5px">About: ${c.words.map(esc).join(', ')}</small>` : '')
        + (sims.length ? `<small>Also about the same things: ${sims.slice(0, 3).map(s => esc(s.label)).join(', ')}</small>` : '')
        + '<small style="margin-top:5px">Click to open it</small>';
    }
    if (n.depth > 0 && n.children.length) return `<b>${esc(n.label)}</b><small>${esc(n.sub || '')}</small><small>Click to ${n.collapsed ? 'open' : 'fold'} this branch</small>`;
    return '';
  }

  async function load() {
    D = await api.mindmap.data();
    try { window.NexusTheme?.apply(D.settings || {}); } catch {}
    const chats = D.nodes.filter(n => n.kind === 'chat').length;
    const pl = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
    $('sub').textContent = `${pl(chats, 'chat')} · ${pl(D.nodes.filter(n => n.kind === 'space').length, 'Space')} · ${pl(D.nodes.filter(n => n.kind === 'topic').length, 'topic')}`;
    $('empty').hidden = chats > 0;
    if (!chats) return;
    if (!mt) mt = window.MindTree.create($('stage'), { tip, mode: D.mode, iconFor: window.NexusIcons?.iconFor, onOpen: n => n.chat && api.mindmap.openChat(n.chat.id) });
    mt.set(toTree(D));
    paintMode(); $('askBtn').hidden = !D.flags?.askMap;
    $('scope').innerHTML = '<option value="">All my chats</option>' + mt.nodes.filter(n => n.depth === 1).map(n => `<option value="${esc(n.id)}">${esc(n.label)}</option>`).join('');
    if (D.flags?.smartPending) $('found').textContent = 'Sorting your topics…';
    if ($('q').value) mt.search($('q').value);
  }

  // ---------- 3.10: Tree / Graph
  function paintMode() {
    const g = mt?.mode === 'graph';
    $('mTree').classList.toggle('on', !g); $('mGraph').classList.toggle('on', g);
    $('expand').hidden = $('collapse').hidden = g;
    $('legend').textContent = g ? 'Hover a dot to see what it\'s connected to · drag dots around · click a chat to open it · right-click for more' : 'Click a branch to fold or open it · click a chat to open it · right-click for more';
  }
  const setMode = m => { mt?.setMode(m); api.mindmap.setMode(m); paintMode(); };
  $('mTree').addEventListener('click', () => setMode('tree'));
  $('mGraph').addEventListener('click', () => setMode('graph'));
  api.mindmap.onChanged?.(() => { load(); $('found').textContent = ''; });   // Smarter topics finished
  // ---------- 3.10: right-click a branch or chat
  const chatsUnder = n => { const out = []; (function walk(x) { if (x.chat) out.push(x.chat.id); (x.children || []).forEach(walk); })(n); return out; };
  $('stage').addEventListener('contextmenu', e => {
    const g = e.target.closest('.mt-n, .mt-g'); const n = g && mt.nodes.find(x => x.id === g.dataset.id);
    const menu = $('menu'); if (!n) { menu.hidden = true; return; }
    e.preventDefault();
    const ids = chatsUnder(n), items = [];
    if (n.chat) items.push(['open', '↗ Open this chat']);
    if (D.flags?.askMap && ids.length) items.push(['ask', `✨ Ask about ${n.chat ? 'this chat' : 'this branch'}`]);
    if (ids.length) items.push(['deck', '📚 Make a study deck from ' + (n.chat ? 'this chat' : `these ${ids.length} chats`)]);
    if (!n.chat && n.depth > 0 && mt.mode === 'tree') items.push(['fold', n.collapsed ? '▸ Open this branch' : '▾ Fold this branch']);
    if (!items.length) { menu.hidden = true; return; }
    menu.innerHTML = `<small>${esc(n.label)}</small>` + items.map(([k, l]) => `<button data-mact="${k}">${esc(l)}</button>`).join('');
    const r = $('stage').getBoundingClientRect();
    menu.hidden = false; menu.style.left = Math.min(r.width - 230, e.clientX - r.left) + 'px'; menu.style.top = Math.min(r.height - menu.offsetHeight - 6, e.clientY - r.top) + 'px';
    menu._node = n; menu._ids = ids; menu.querySelector('button').focus();
  });
  addEventListener('pointerdown', e => { if (!e.target.closest('#menu')) $('menu').hidden = true; });
  $('menu').addEventListener('click', async e => {
    const k = e.target.closest('[data-mact]')?.dataset.mact; if (!k) return;
    const menu = $('menu'), n = menu._node, ids = menu._ids; menu.hidden = true;
    if (k === 'open') return api.mindmap.openChat(n.chat.id);
    if (k === 'fold') return mt.toggle(n.id);
    if (k === 'ask') { openSide(n.depth === 1 ? n.id : ''); side.ids = n.depth === 1 ? null : ids; side.label = n.label; $('askNote').textContent = n.depth === 1 ? '' : `About “${n.label}”`; $('askQ').focus(); return; }
    if (k === 'deck') {
      $('found').textContent = '📚 Making your deck…';
      const r = await api.mindmap.makeDeck({ ids, name: n.label.replace(/^[#📌 ]+/, '') });
      $('found').textContent = r.ok ? `📚 “${r.deck?.name || 'Deck'}”: ${r.added} cards in Study` : (r.error || 'Couldn\'t make a deck');
    }
  });
  // ---------- 3.10: Ask the map (beta)
  const side = { ids: null, label: '' };
  function openSide(scope = '') { $('side').hidden = false; $('scope').value = scope; side.ids = null; side.label = ''; $('askNote').textContent = ''; }
  $('askBtn').addEventListener('click', () => { if ($('side').hidden) { openSide(); $('askQ').focus(); } else $('side').hidden = true; });
  $('sideX').addEventListener('click', () => { $('side').hidden = true; });
  $('scope').addEventListener('change', () => { side.ids = null; side.label = ''; $('askNote').textContent = ''; });
  async function ask() {
    const q = $('askQ').value.trim(); if (!q) return;
    let ids = side.ids, branch = side.label;
    if (!ids && $('scope').value) { const b = mt.nodes.find(x => x.id === $('scope').value); ids = b ? chatsUnder(b) : []; branch = b?.label || ''; }
    $('askGo').disabled = true; $('answer').innerHTML = '<span class="mm-sub">Reading your chats…</span>';
    const r = await api.mindmap.ask({ question: q, ids: ids || [], branch });
    $('askGo').disabled = false;
    $('answer').innerHTML = r.ok ? window.NexusMarkdown.render(r.text) : `<span class="mm-sub">${esc(r.error || 'Something went wrong.')}</span>`;
  }
  $('askGo').addEventListener('click', ask);
  $('askQ').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });

  $('q').addEventListener('input', e => { const k = mt?.search(e.target.value); $('found').textContent = e.target.value.trim() ? (k ? `${k} found` : 'Nothing found') : ''; });
  $('expand').addEventListener('click', () => mt?.expandAll());
  $('collapse').addEventListener('click', () => mt?.collapseAll());
  $('refresh').addEventListener('click', load);
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('q').focus(); }
    if (e.key === 'Escape' && $('q').value) { $('q').value = ''; mt?.search(''); $('found').textContent = ''; }
  });
  addEventListener('focus', () => { if (D) api.mindmap.data().then(d => { if (JSON.stringify(d.nodes.map(n => n.id + n.count)) !== JSON.stringify(D.nodes.map(n => n.id + n.count))) load(); }); });   // new chats since it opened
  window.__mindmap = { get tree() { return mt; } };   // for tests
  load();
})();
