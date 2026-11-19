// Mind map of your chats (3.9): a force layout of your chats, Spaces and topics. Drag the background to move, scroll
// to zoom, drag a dot to move it, hover for details, click a chat to open it in Nexus. Search and Space chips focus it.
(function () {
  const api = window.nexus, $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg', el = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETTE = ['#3dffa0', '#5ce1ff', '#b18cff', '#ffd36b', '#ff8a98', '#9be37b', '#ff9bd2', '#7fb2ff'];
  let D = null, N = [], E = [], byId = new Map(), view = { x: 0, y: 0, k: 1 }, focus = { q: '', hub: null };

  async function load() {
    D = await api.mindmap.data();
    try { window.NexusTheme?.apply(D.settings || {}); } catch {}
    const colorOfPersona = id => (D.personas.find(p => p.id === id) || {}).color;
    let pi = 0; const hubColor = new Map();
    N = D.nodes.map(n => {
      const hub = n.kind !== 'chat';
      if (hub && !hubColor.has(n.id)) hubColor.set(n.id, n.color || PALETTE[pi++ % PALETTE.length]);
      return { ...n, hub, r: hub ? 16 : 5 + Math.min(11, Math.sqrt(n.count || 1) * 1.6), x: (Math.random() - .5) * 600, y: (Math.random() - .5) * 400, vx: 0, vy: 0 };
    });
    byId = new Map(N.map(n => [n.id, n]));
    E = D.links.filter(l => byId.has(l.a) && byId.has(l.b)).map(l => ({ ...l, s: byId.get(l.a), t: byId.get(l.b) }));
    // a chat takes the color of its Space or topic; chats on their own use their agent's color
    for (const n of N) { if (n.hub) n.fill = hubColor.get(n.id); else { const h = E.find(e => e.s === n && (e.kind === 'space' || e.kind === 'topic')); n.fill = h ? hubColor.get(h.t.id) : colorOfPersona(n.persona) || '#3dffa0'; n.group = h?.t.id || null; } }
    $('sub').textContent = `${N.filter(n => !n.hub).length} chats · ${N.filter(n => n.kind === 'space').length} Spaces · ${N.filter(n => n.kind === 'topic').length} topics`;
    $('empty').hidden = N.some(n => !n.hub);
    $('chips').innerHTML = N.filter(n => n.hub).sort((a, b) => (a.kind === 'space' ? 0 : 1) - (b.kind === 'space' ? 0 : 1)).map(h => `<button data-hub="${esc(h.id)}"><i style="background:${h.fill}"></i>${h.kind === 'space' ? '' : '#'}${esc(h.label)}</button>`).join('');
    layout(); draw(); fit();
  }

  // a few hundred steps of a simple force layout: springs on links, everything pushes apart, a pull to the middle
  function layout() {
    const it = 320;
    for (let i = 0; i < it; i++) {
      const alpha = 1 - i / it;
      for (let a = 0; a < N.length; a++) for (let b = a + 1; b < N.length; b++) {
        const p = N[a], q = N[b]; let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy || .01;
        if (d2 > 360000) continue;
        const f = (p.hub || q.hub ? 7000 : 3200) / d2 * alpha, d = Math.sqrt(d2); dx /= d; dy /= d;
        p.vx -= dx * f; p.vy -= dy * f; q.vx += dx * f; q.vy += dy * f;
      }
      for (const e of E) {
        const want = e.kind === 'similar' ? 90 : e.kind === 'link' ? 70 : 55 + e.t.r * 2, dx = e.t.x - e.s.x, dy = e.t.y - e.s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const k = (e.kind === 'similar' ? .02 : .06) * (d - want) / d * alpha;
        e.s.vx += dx * k; e.s.vy += dy * k; e.t.vx -= dx * k; e.t.vy -= dy * k;
      }
      for (const n of N) { if (n.fixed) { n.vx = n.vy = 0; continue; } n.vx -= n.x * .003 * alpha; n.vy -= n.y * .005 * alpha; n.x += n.vx; n.y += n.vy; n.vx *= .55; n.vy *= .55; }
    }
    // labels sit to the right of each dot: nudge apart any two whose label boxes overlap
    const box = n => ({ w: n.r * 2 + 8 + Math.min(34, (n.hub ? n.label.length + 1 : n.label.length)) * (n.hub ? 7.6 : 6.3), h: Math.max(n.r * 2, 16) + 4 });
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      for (let a = 0; a < N.length; a++) for (let b = a + 1; b < N.length; b++) {
        const p = N[a], q = N[b], bp = box(p), bq = box(q);
        const pl = p.x - p.r, ql = q.x - q.r, ox = Math.min(pl + bp.w, ql + bq.w) - Math.max(pl, ql), oy = Math.min(p.y + bp.h / 2, q.y + bq.h / 2) - Math.max(p.y - bp.h / 2, q.y - bq.h / 2);
        if (ox <= 0 || oy <= 0) continue;
        moved = true; const s = q.y >= p.y ? 1 : -1, push = Math.min(oy, 12) / 2 + .5;   // vertical moves are cheaper than horizontal ones
        if (!p.fixed) p.y -= s * push; if (!q.fixed) q.y += s * push;
      }
      if (!moved) break;
    }
  }

  function draw() {
    const eg = $('edges'), ng = $('nodes'); eg.innerHTML = ''; ng.innerHTML = '';
    for (const e of E) { e.dom = el('line', { class: 'e ' + e.kind }); eg.appendChild(e.dom); }
    for (const n of N) {
      const g = el('g', { class: `n ${n.hub ? 'hub ' + n.kind : 'chat'}`, tabindex: '0' }); g.dataset.id = n.id;
      g.appendChild(el('circle', { r: n.r, fill: n.kind === 'topic' ? '' : n.fill }));
      const t = el('text', { x: n.r + 4, y: 4 }); t.textContent = n.hub ? (n.kind === 'topic' ? '#' : '') + n.label : (n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label);
      if (!n.hub && (n.count || 0) < 4 && N.length > 80) t.setAttribute('display', 'none');   // busy maps: only longer chats get labels
      g.appendChild(t); n.dom = g; ng.appendChild(g);
    }
    paint();
  }
  function paint() {
    for (const e of E) { e.dom.setAttribute('x1', e.s.x); e.dom.setAttribute('y1', e.s.y); e.dom.setAttribute('x2', e.t.x); e.dom.setAttribute('y2', e.t.y); }
    for (const n of N) n.dom.setAttribute('transform', `translate(${n.x},${n.y})`);
    $('world').setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`);
  }
  function fit() {
    if (!N.length) return;
    const xs = N.map(n => n.x), ys = N.map(n => n.y), w = $('svg').clientWidth, h = $('svg').clientHeight;
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 160, minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 40;
    view.k = Math.min(2, Math.max(.2, Math.min(w / (maxX - minX), h / (maxY - minY))));
    view.x = w / 2 - (minX + maxX) / 2 * view.k; view.y = h / 2 - (minY + maxY) / 2 * view.k; paint();
  }

  // focus: a search, or one Space / topic
  function applyFocus() {
    const q = focus.q.toLowerCase().trim(), hot = new Set();
    if (q) for (const n of N) if (n.label.toLowerCase().includes(q) || (n.words || []).some(w => w.includes(q))) hot.add(n);
    if (focus.hub) { const h = byId.get(focus.hub); hot.add(h); for (const e of E) { if (e.t === h) hot.add(e.s); if (e.s === h) hot.add(e.t); } }
    $('world').classList.toggle('dim', hot.size > 0);
    for (const n of N) n.dom.classList.toggle('hot', hot.has(n));
    for (const e of E) e.dom.classList.toggle('hot', hot.has(e.s) && hot.has(e.t));
    document.querySelectorAll('[data-hub]').forEach(b => b.classList.toggle('on', b.dataset.hub === focus.hub));
  }
  $('q').addEventListener('input', e => { focus.q = e.target.value; applyFocus(); });
  $('chips').addEventListener('click', e => { const b = e.target.closest('[data-hub]'); if (!b) return; focus.hub = focus.hub === b.dataset.hub ? null : b.dataset.hub; applyFocus(); });
  $('fit').addEventListener('click', fit);

  // hover details
  const tip = $('tip');
  function showTip(n, ev) {
    if (n.hub) { const kids = E.filter(e => e.t === n).length; tip.innerHTML = `<b>${n.kind === 'space' ? '👥 ' : '# '}${esc(n.label)}</b><small>${n.kind === 'space' ? 'Space' : 'Topic'} · ${kids} chat${kids === 1 ? '' : 's'}</small><small>Click to focus on it</small>`; }
    else { const p = D.personas.find(x => x.id === n.persona); const sims = E.filter(e => e.kind === 'similar' && (e.s === n || e.t === n)).length;
      tip.innerHTML = `<b>${esc(n.label)}</b><small>${n.count} message${n.count === 1 ? '' : 's'}${p ? ' · mostly ' + esc(p.name) : ''} · ${n.updated ? new Date(n.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</small>${sims ? `<small>Joined to ${sims} chat${sims === 1 ? '' : 's'} about the same things</small>` : ''}${(n.words || []).length ? `<div class="w">${n.words.map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}<small style="margin-top:6px">Click to open it</small>`; }
    tip.hidden = false; moveTip(ev);
  }
  const moveTip = ev => { const r = $('stage').getBoundingClientRect(); tip.style.left = Math.min(r.width - 330, ev.clientX - r.left + 14) + 'px'; tip.style.top = Math.min(r.height - tip.offsetHeight - 8, ev.clientY - r.top + 14) + 'px'; };

  // pan, zoom, drag a dot, click
  const svg = $('svg'); let drag = null;
  const toWorld = ev => { const r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k }; };
  svg.addEventListener('pointerdown', ev => {
    const g = ev.target.closest('.n'); svg.setPointerCapture(ev.pointerId);
    drag = g ? { n: byId.get(g.dataset.id), moved: false, sx: ev.clientX, sy: ev.clientY } : { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false };
    if (drag.pan) svg.classList.add('panning');
  });
  svg.addEventListener('pointermove', ev => {
    const g = ev.target.closest('.n');
    if (!drag) { if (g) showTip(byId.get(g.dataset.id), ev); else tip.hidden = true; return; }
    if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 4) drag.moved = true;
    if (drag.pan) { view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy; paint(); return; }
    if (drag.moved) { const w = toWorld(ev); drag.n.x = w.x; drag.n.y = w.y; drag.n.fixed = true; paint(); tip.hidden = true; }
  });
  svg.addEventListener('pointerup', async () => {
    const d = drag; drag = null; svg.classList.remove('panning'); if (!d || d.moved) return;
    if (d.n?.hub) { focus.hub = focus.hub === d.n.id ? null : d.n.id; applyFocus(); }
    else if (d.n) { await api.mindmap.openChat(d.n.id); }
    else if (focus.hub || focus.q) { focus.hub = null; focus.q = ''; $('q').value = ''; applyFocus(); }
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  svg.addEventListener('wheel', ev => {
    ev.preventDefault();
    const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, k = Math.min(3, Math.max(.15, view.k * Math.exp(-ev.deltaY * .0015)));
    view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k; paint();
  }, { passive: false });
  svg.addEventListener('keydown', async ev => { const g = ev.target.closest('.n'); if (g && ev.key === 'Enter') { const n = byId.get(g.dataset.id); if (n.hub) { focus.hub = n.id; applyFocus(); } else await api.mindmap.openChat(n.id); } });
  addEventListener('keydown', ev => { if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'f') { ev.preventDefault(); $('q').focus(); } if (ev.key === 'Escape') { focus = { q: '', hub: null }; $('q').value = ''; applyFocus(); } });
  addEventListener('resize', () => paint());
  window.__mindmap = { get nodes() { return N; }, get links() { return E; }, fit };   // for tests
  load();
})();
