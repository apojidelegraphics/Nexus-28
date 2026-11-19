// Mind map of your chats (3.9.1): a Notion-style mind map. "Your chats" in the middle, your Spaces and topics as
// branches, chats as the boxes on the ends. Fold a branch with its ○ (or click it), search, zoom, click a chat to open it.
// The layout and drawing live in mindtree.js (shared with Apoji Admin); this file turns your chats into a tree.
(function () {
  const api = window.nexus, $ = id => document.getElementById(id), esc = window.MindTree.esc;
  let D = null, mt = null;
  const day = t => t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const monthOf = t => new Date(t || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  function chatNode(n) {
    return { id: n.id, label: (n.pinned ? '📌 ' : '') + n.label, sub: `${n.count} message${n.count === 1 ? '' : 's'}${n.updated ? ' · ' + day(n.updated) : ''}`, open: true, chat: n, words: n.words || [] };
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
    return { id: 'root', label: 'Your chats', sub: `${chats.length} chat${chats.length === 1 ? '' : 's'}${d.total > chats.length ? ` (newest ${chats.length} of ${d.total})` : ''}`, children: branches };
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
    if (!mt) mt = window.MindTree.create($('stage'), { tip, onOpen: n => n.chat && api.mindmap.openChat(n.chat.id) });
    mt.set(toTree(D));
    if ($('q').value) mt.search($('q').value);
  }

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
