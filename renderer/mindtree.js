// MindTree: a Notion-style mind map. One idea in the middle, branches spreading left and right with curved lines,
// boxes you can fold open and shut. View only: pan (drag), zoom (wheel / buttons), fold, search, click to open.
// Shared by Nexus '28 (renderer/mindtree.js) and Apoji Admin (mindtree.js): keep the two copies the same.
//   const mt = MindTree.create(container, { onOpen(node), tip(node) → html, palette, iconFor(label) → { inner, rest } | null })
//   iconFor (optional): swap a label's leading emoji for an icon (inner = the icon's SVG shapes, 24 × 24, line style)
//   mt.set(tree)  tree = { id, label, sub?, color?, open?, collapsed?, side?, children: [...] }
//   mt.fit() · mt.search(q) → matches · mt.expandAll() · mt.collapseAll() · mt.toggle(id) · mt.destroy()
//   3.10: mt.setMode('graph' | 'tree'): an Obsidian-style graph of the same tree (dots that settle into place, drag
//   them, hover lights up the neighbours). tree.links = [{ a, b, kind }] adds extra lines (e.g. chats about the same thing).
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#3dffa0', '#5ce1ff', '#b18cff', '#ffd36b', '#ff8a98', '#9be37b', '#ff9bd2', '#7fb2ff', '#ffb36b', '#6bffe0'];
  const FONT = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const CSS = `
.mt-wrap{position:relative;overflow:hidden;width:100%;height:100%;min-height:320px;touch-action:none;user-select:none;-webkit-user-select:none}
.mt-svg{width:100%;height:100%;display:block;cursor:grab}.mt-svg.mt-pan{cursor:grabbing}
.mt-n{cursor:pointer;transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .2s}
.mt-n rect.mt-box{transition:fill-opacity .15s,stroke-width .15s}
.mt-n:hover rect.mt-box,.mt-n:focus rect.mt-box{stroke-width:2.4}.mt-n:focus{outline:none}
.mt-n text{font:${FONT};fill:var(--mt-text,#e9f5ef);pointer-events:none}
.mt-n text.mt-sub{font-size:11px;font-weight:400;fill:var(--mt-muted,#8fb3a3)}
.mt-n.mt-root text.mt-lab{font-size:16px;font-weight:700}
.mt-n.mt-l1 text.mt-lab{font-size:14px;font-weight:700}
.mt-n.mt-leaf text.mt-lab{font-weight:500}
.mt-e{fill:none;stroke-width:2;stroke-linecap:round;transition:d .28s cubic-bezier(.2,.8,.2,1),opacity .2s}
.mt-t{cursor:pointer}.mt-t circle{stroke-width:1.5}.mt-t text{font:700 10px system-ui,sans-serif;text-anchor:middle;pointer-events:none}
.mt-dim .mt-n:not(.mt-hit){opacity:.22}.mt-dim .mt-e{opacity:.25}
.mt-n.mt-hit rect.mt-box{stroke-width:3}
.mt-ico{fill:none;stroke:var(--mt-text,#e9f5ef);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.mt-tip{position:absolute;pointer-events:none;max-width:300px;padding:9px 12px;border-radius:11px;background:var(--mt-tip-bg,rgba(8,14,12,.97));border:1px solid var(--mt-line,rgba(255,255,255,.18));box-shadow:0 10px 32px rgba(0,0,0,.45);font:12.5px/1.45 system-ui,sans-serif;color:var(--mt-text,#e9f5ef);z-index:5}
.mt-tip b{display:block;font-size:13px}.mt-tip small{display:block;color:var(--mt-muted,#8fb3a3)}
.mt-zoom{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:4px;z-index:4}
.mt-zoom button{width:30px;height:30px;border-radius:8px;border:1px solid var(--mt-line,rgba(255,255,255,.2));background:var(--mt-btn,rgba(0,0,0,.35));color:var(--mt-text,#e9f5ef);font:600 15px system-ui;cursor:pointer;padding:0}
.mt-zoom button:hover{border-color:var(--mt-accent,#3dffa0)}
.mt-g circle{stroke:var(--mt-bg,#0b1411);stroke-width:1.5;transition:opacity .15s,r .15s}.mt-g{cursor:pointer}
.mt-g text{font:500 11px system-ui,sans-serif;fill:var(--mt-text,#e9f5ef);pointer-events:none;paint-order:stroke;stroke:var(--mt-bg,#0b1411);stroke-width:3px;stroke-linejoin:round;transition:opacity .15s}
.mt-g.mt-d0 text{font-size:14px;font-weight:700}.mt-g.mt-d1 text{font-size:12.5px;font-weight:700}
.mt-far .mt-g:not(.mt-d0):not(.mt-d1):not(.mt-nb):not(.mt-hit) text{opacity:0}
.mt-ge{stroke:var(--mt-line,rgba(255,255,255,.2));stroke-width:1;transition:opacity .15s}.mt-ge.mt-k-similar{stroke-dasharray:3 3}.mt-ge.mt-k-link{stroke:#ffd36b;stroke-opacity:.6;stroke-width:1.4}
.mt-gfocus .mt-g:not(.mt-nb){opacity:.18}.mt-gfocus .mt-ge:not(.mt-nb){opacity:.06}.mt-gfocus .mt-ge.mt-nb{stroke:var(--mt-accent,#3dffa0);stroke-opacity:.9}
.mt-dim .mt-g:not(.mt-hit){opacity:.2}.mt-g.mt-hit circle{stroke:#fff;stroke-width:2.5}`;
  let measureCtx = null;
  function textW(s, font = FONT) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font; return measureCtx.measureText(s).width;
  }
  const el = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function create(container, opts = {}) {
    if (!document.getElementById('mt-css')) { const st = document.createElement('style'); st.id = 'mt-css'; st.textContent = CSS; document.head.appendChild(st); }
    const palette = opts.palette || PALETTE;
    const wrap = document.createElement('div'); wrap.className = 'mt-wrap';
    const svg = el('svg', { class: 'mt-svg', role: 'tree' }); const world = el('g'), eg = el('g'), ng = el('g');
    world.append(eg, ng); svg.appendChild(world);
    const tip = document.createElement('div'); tip.className = 'mt-tip'; tip.hidden = true;
    const zoom = document.createElement('div'); zoom.className = 'mt-zoom';
    zoom.innerHTML = '<button data-z="in" title="Zoom in" aria-label="Zoom in">+</button><button data-z="out" title="Zoom out" aria-label="Zoom out">−</button><button data-z="fit" title="Fit" aria-label="Fit everything">⤢</button>';
    wrap.append(svg, tip, zoom); container.appendChild(wrap);

    let tree = null, byId = new Map(), view = { x: 0, y: 0, k: 1 }, hits = null, dom = new Map(), edges = new Map(), first = true, mode = opts.mode === 'graph' ? 'graph' : 'tree';

    // ---------- layout
    function prep(n, depth, parent, branch) {
      n.depth = depth; n.parent = parent; n.children = n.children || [];
      n.branch = depth === 0 ? null : depth === 1 ? n : branch;
      n.color = n.color || (depth === 0 ? (opts.rootColor || palette[0]) : depth === 1 ? null : branch.color);
      const big = depth === 0 ? 16 : depth === 1 ? 14 : 13, weight = depth <= 1 ? 700 : n.children.length ? 600 : 500;
      const ic = opts.iconFor ? opts.iconFor(String(n.label || '')) : null;
      const lab = clip(ic ? ic.rest : n.label, depth === 0 ? 40 : 46), sub = n.sub ? clip(n.sub, 56) : '';
      n._lab = lab; n._sub = sub; n._icon = ic?.inner || '';
      const font = `${weight} ${big}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
      n._lw = textW(lab, font);
      n.w = Math.ceil(Math.max(n._lw + (n._icon ? 18 : 0), sub ? textW(sub, '400 11px system-ui, sans-serif') : 0)) + (depth === 0 ? 40 : 26);
      n.h = depth === 0 ? (sub ? 58 : 46) : sub ? 46 : depth === 1 ? 36 : 30;
      byId.set(n.id, n);
      n.children.forEach((c, i) => { if (depth === 0) c.color = c.color || palette[i % palette.length]; prep(c, depth + 1, n, depth === 0 ? c : branch); });
    }
    const GAPY = 10, GAPX = 56;
    const open = n => n.children.length && !n.collapsed;
    function size(n) { n.sh = open(n) ? Math.max(n.h, n.children.reduce((s, c) => s + size(c), 0) + GAPY * (n.children.length - 1)) : n.h; return n.sh; }
    function place(n, cx, top, dir) {
      n.x = cx; n.y = top + n.sh / 2; n.dir = dir;
      if (!open(n)) return;
      const kids = n.children, total = kids.reduce((s, c) => s + c.sh, 0) + GAPY * (kids.length - 1);
      let y = n.y - total / 2;
      for (const c of kids) { place(c, cx + dir * (n.w / 2 + GAPX + c.w / 2), y, dir); y += c.sh + GAPY; }
    }
    function layout() {
      const r = tree; r.x = 0; r.y = 0;
      const kids = r.children; kids.forEach(size);
      // balance the two sides by height, keeping order (Notion puts the first branches on the right)
      const right = [], left = []; let hr = 0, hl = 0;
      for (const c of kids) { const r = c.side ? c.side !== 'left' : hr <= hl; if (r) { right.push(c); hr += c.sh + GAPY; } else { left.push(c); hl += c.sh + GAPY; } }   // a branch may pick its side: side 'left' | 'right'
      const side = (list, dir, h) => { let y = -(h - GAPY) / 2; for (const c of list) { place(c, dir * (r.w / 2 + GAPX + 10 + c.w / 2), y, dir); y += c.sh + GAPY; } };
      side(right, 1, hr); side(left, -1, hl);
    }

    // ---------- draw (keyed, so folding animates)
    const visible = () => { const out = []; (function walk(n) { out.push(n); if (open(n)) n.children.forEach(walk); })(tree); return out; };
    function edgePath(p, c) {
      const x1 = p.x + c.dir * p.w / 2, x2 = c.x - c.dir * c.w / 2, mx = (x1 + x2) / 2;
      return `M${x1},${p.y} C${mx},${p.y} ${mx},${c.y} ${x2},${c.y}`;
    }
    function nodeEl(n) {
      const g = el('g', { class: `mt-n ${n.depth === 0 ? 'mt-root' : n.depth === 1 ? 'mt-l1' : n.children.length ? 'mt-mid' : 'mt-leaf'}`, tabindex: '0', role: 'treeitem' });
      g.dataset.id = n.id;
      const col = n.color, rx = n.depth === 0 ? 16 : n.depth === 1 ? 11 : 8;
      g.appendChild(el('rect', { x: -n.w / 2, y: -n.h / 2, width: n.w, height: n.h, rx, fill: 'var(--mt-bg,#0b1411)' }));
      g.appendChild(el('rect', { class: 'mt-box', x: -n.w / 2, y: -n.h / 2, width: n.w, height: n.h, rx, fill: col, 'fill-opacity': n.depth === 0 ? .3 : n.depth === 1 ? .2 : n.children.length ? .1 : .04, stroke: col, 'stroke-width': n.depth <= 1 ? 1.8 : 1.1, 'stroke-opacity': n.depth <= 1 ? 1 : .7 }));
      const ty = n._sub ? -3 : 4.5;
      const t = el('text', { class: 'mt-lab', 'text-anchor': 'middle', y: ty, x: n._icon ? 9 : 0 }); t.textContent = n._lab; g.appendChild(t);
      if (n._icon) { const ig = el('svg', { x: 9 - n._lw / 2 - 18, y: ty - 12, width: 14, height: 14, viewBox: '0 0 24 24', class: 'mt-ico' }); ig.innerHTML = n._icon; g.appendChild(ig); }
      if (n._sub) { const s = el('text', { class: 'mt-sub', 'text-anchor': 'middle', y: 13 }); s.textContent = n._sub; g.appendChild(s); }
      if (n.children.length && n.depth > 0) {
        const tg = el('g', { class: 'mt-t' }); tg.dataset.toggle = n.id;
        tg.append(el('circle', { r: 9, fill: 'var(--mt-bg,#0b1411)', stroke: col }), el('text', { y: 3.5, fill: col }));
        g.appendChild(tg);
      }
      if (n.open) g.setAttribute('aria-label', n.label + ' (opens)');
      return g;
    }
    function paintToggle(n, g) {
      const tg = g.querySelector('.mt-t'); if (!tg) return;
      const x = n.dir * (n.w / 2 + 11); tg.setAttribute('transform', `translate(${x},0)`);
      tg.querySelector('text').textContent = n.collapsed ? String(Math.min(99, n.children.length)) : '−';
      g.setAttribute('aria-expanded', String(!n.collapsed));
    }
    function draw() { return mode === 'graph' ? drawGraph() : drawTree(); }
    function drawTree() {
      layout();
      const vis = visible(), keep = new Set(vis.map(n => n.id));
      for (const [id, g] of dom) if (!keep.has(id)) { g.remove(); dom.delete(id); }
      for (const [id, p] of edges) if (!keep.has(id)) { p.remove(); edges.delete(id); }
      for (const n of vis) {
        let g = dom.get(n.id);
        if (!g) {
          g = nodeEl(n); dom.set(n.id, g); ng.appendChild(g);
          const from = n.parent && !first ? n.parent : n;   // new boxes grow out of their parent
          g.style.transition = 'none'; g.style.transform = `translate(${from.x}px,${from.y}px)`; g.getBoundingClientRect(); g.style.transition = '';
        }
        g.style.transform = `translate(${n.x}px,${n.y}px)`; paintToggle(n, g);
        g.classList.toggle('mt-hit', !!hits?.has(n));
        if (n.parent) {
          let p = edges.get(n.id);
          if (!p) { p = el('path', { class: 'mt-e', stroke: n.color, 'stroke-opacity': n.depth === 1 ? .9 : .6 }); edges.set(n.id, p); eg.appendChild(p);
            const pp = n.parent; p.style.transition = 'none'; p.style.d = `path("${first ? edgePath(pp, n) : `M${pp.x},${pp.y} C${pp.x},${pp.y} ${pp.x},${pp.y} ${pp.x},${pp.y}`}")`; p.getBoundingClientRect(); p.style.transition = ''; }
          p.style.d = `path("${edgePath(n.parent, n)}")`;
        }
      }
      svg.classList.toggle('mt-dim', !!hits && hits.size > 0);
      first = false; paintView();
    }
    function paintView() { world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); if (mode === 'graph') svg.classList.toggle('mt-far', view.k < .8); }
    function bounds(list) {
      if (list === undefined && mode !== 'graph') list = visible();
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      if (mode === 'graph') { for (const n of (list === undefined || list === visible() ? G.nodes : list)) { a = Math.min(a, n.gx - n.gr - 10); c = Math.max(c, n.gx + n.gr + 90); b = Math.min(b, n.gy - n.gr - 10); d = Math.max(d, n.gy + n.gr + 10); } return { a, b, c, d }; }
      for (const n of list) { a = Math.min(a, n.x - n.w / 2 - 14); c = Math.max(c, n.x + n.w / 2 + 14); b = Math.min(b, n.y - n.h / 2); d = Math.max(d, n.y + n.h / 2); }
      return { a, b, c, d };
    }
    function fit(list) {
      const W = svg.clientWidth || 800, H = svg.clientHeight || 500, { a, b, c, d } = bounds(list);
      view.k = Math.max(.25, Math.min(1.3, Math.min((W - 40) / (c - a), (H - 40) / (d - b))));
      view.x = W / 2 - (a + c) / 2 * view.k; view.y = H / 2 - (b + d) / 2 * view.k; paintView();
    }
    function zoomAt(k, mx, my) { k = Math.max(.2, Math.min(2.5, k)); view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k; paintView(); }

    // ---------- 3.10 graph mode (Obsidian-style): every box becomes a dot; lines for the tree plus tree.links
    const G = { nodes: [], edges: [], alpha: 0, raf: 0, hover: null };
    function graphBuild() {
      G.nodes = [...byId.values()]; G.edges = [];
      for (const n of G.nodes) {
        n.gr = n.depth === 0 ? 13 : n.depth === 1 ? 9 : n.children.length ? 6.5 : 4 + Math.min(4, Math.sqrt(n.weight || 1));
        if (n.parent) G.edges.push({ s: n.parent, t: n, kind: 'tree' });
      }
      for (const l of tree.links || []) { const a = byId.get(l.a), b = byId.get(l.b); if (a && b && a !== b) G.edges.push({ s: a, t: b, kind: l.kind || 'link' }); }
      // start each dot near its parent so it unfolds instead of exploding
      const l1 = tree.children.length || 1;
      (function seed(n) {
        if (n.gx === undefined) {
          if (!n.parent) { n.gx = 0; n.gy = 0; }
          else if (n.depth === 1) { const a = 2 * Math.PI * n.parent.children.indexOf(n) / l1; n.gx = Math.cos(a) * 160; n.gy = Math.sin(a) * 160; }
          else { n.gx = n.parent.gx + (Math.random() - .5) * 60 + (n.parent.gx - n.parent.parent.gx) * .3; n.gy = n.parent.gy + (Math.random() - .5) * 60 + (n.parent.gy - n.parent.parent.gy) * .3; }
          n.vx = 0; n.vy = 0;
        }
        n.children.forEach(seed);
      })(tree);
      G.nb = new Map(G.nodes.map(n => [n, new Set([n])]));
      for (const e of G.edges) { G.nb.get(e.s).add(e.t); G.nb.get(e.t).add(e.s); }
    }
    function graphTick() {
      const N = G.nodes, al = G.alpha;
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) {
        const p = N[i], q = N[j]; let dx = q.gx - p.gx, dy = q.gy - p.gy, d2 = dx * dx + dy * dy || .01;
        if (d2 > 250000) continue;
        const f = (1600 + (p.depth <= 1 || q.depth <= 1 ? 2200 : 0)) / d2 * al, d = Math.sqrt(d2); dx /= d; dy /= d;
        p.vx -= dx * f; p.vy -= dy * f; q.vx += dx * f; q.vy += dy * f;
      }
      for (const e of G.edges) {
        const want = e.kind === 'tree' ? (e.t.depth === 1 ? 140 : 58) : 100, k = e.kind === 'tree' ? .05 : .012;
        const dx = e.t.gx - e.s.gx, dy = e.t.gy - e.s.gy, d = Math.sqrt(dx * dx + dy * dy) || 1, f = k * (d - want) / d * al;
        e.s.vx += dx * f; e.s.vy += dy * f; e.t.vx -= dx * f; e.t.vy -= dy * f;
      }
      for (const n of N) {
        if (n.pin || n === G.drag) { n.vx = n.vy = 0; continue; }
        n.vx -= n.gx * .002 * al; n.vy -= n.gy * .002 * al;
        n.gx += Math.max(-30, Math.min(30, n.vx)); n.gy += Math.max(-30, Math.min(30, n.vy)); n.vx *= .6; n.vy *= .6;
      }
    }
    function graphPaint() {
      for (const e of G.edges) { e.el.setAttribute('x1', e.s.gx); e.el.setAttribute('y1', e.s.gy); e.el.setAttribute('x2', e.t.gx); e.el.setAttribute('y2', e.t.gy); }
      for (const n of G.nodes) n.gel.setAttribute('transform', `translate(${n.gx},${n.gy})`);
    }
    function graphRun(alpha = 1, frames = 220) {
      G.alpha = Math.max(G.alpha, alpha); cancelAnimationFrame(G.raf);
      let left = frames;
      const step = () => { for (let i = 0; i < 2; i++) graphTick(); graphPaint(); G.alpha *= .985; if (--left > 0 && G.alpha > .02) G.raf = requestAnimationFrame(step); };
      if (typeof requestAnimationFrame === 'undefined' || document.hidden) { for (let i = 0; i < frames * 2; i++) { graphTick(); G.alpha *= .993; } graphPaint(); return; }
      G.raf = requestAnimationFrame(step);
    }
    function drawGraph() {
      if (!G.built) { eg.textContent = ''; ng.textContent = ''; dom.clear(); edges.clear(); graphBuild(); G.built = true;
        for (const e of G.edges) { e.el = el('line', { class: `mt-ge mt-k-${e.kind}` }); eg.appendChild(e.el); }
        for (const n of G.nodes) {
          const g = el('g', { class: `mt-g mt-d${Math.min(n.depth, 2)}`, tabindex: '0', role: 'treeitem' }); g.dataset.id = n.id;
          const t = el('text', { x: n.gr + 4, y: 4 }); t.textContent = n.depth >= 2 ? clip(n._icon ? n._lab : n.label, 30) : n._lab;
          g.append(el('circle', { r: n.gr, fill: n.depth === 0 ? (n.color || palette[0]) : n.color || palette[0] }), t);
          n.gel = g; ng.appendChild(g);
        }
        for (let i = 0; i < 120; i++) { G.alpha = 1 - i / 160; graphTick(); }   // settle most of the way before the first paint
        graphPaint(); G.alpha = .35; graphRun(.35, 160);
      }
      for (const n of G.nodes) n.gel.classList.toggle('mt-hit', !!hits?.has(n));
      svg.classList.toggle('mt-dim', !!hits && hits.size > 0);
      svg.classList.toggle('mt-far', view.k < .8);
      paintView();
    }
    function graphHover(n) {
      if (G.hover === n) return; G.hover = n;
      svg.classList.toggle('mt-gfocus', !!n);
      const nb = n ? G.nb.get(n) : null;
      for (const m of G.nodes) m.gel.classList.toggle('mt-nb', !!nb?.has(m));
      for (const e of G.edges) e.el.classList.toggle('mt-nb', !!nb && (e.s === n || e.t === n));
    }
    function setMode(m) {
      m = m === 'graph' ? 'graph' : 'tree'; if (m === mode) return;
      mode = m; cancelAnimationFrame(G.raf); G.built = false; G.hover = null;
      eg.textContent = ''; ng.textContent = ''; dom.clear(); edges.clear(); first = true;
      svg.classList.remove('mt-gfocus', 'mt-far');
      if (tree) { draw(); fit(); }
    }

    // ---------- interaction
    function toggle(id, force) { const n = byId.get(id); if (!n || !n.children.length || n.depth === 0) return; n.collapsed = force === undefined ? !n.collapsed : !force; draw(); }
    let drag = null;
    svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; const gn = mode === 'graph' && e.target.closest?.('.mt-g'); drag = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, target: e.target, node: gn ? byId.get(gn.dataset.id) : null }; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => {
      if (drag) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) { drag.moved = true; svg.classList.add('mt-pan'); tip.hidden = true; }
        if (drag.moved && drag.node) {   // graph: drag a dot (it stays where you drop it)
          const r = svg.getBoundingClientRect(); const n = drag.node; G.drag = n; n.pin = true;
          n.gx = (e.clientX - r.left - view.x) / view.k; n.gy = (e.clientY - r.top - view.y) / view.k; graphPaint(); graphRun(.25, 60); return;
        }
        if (drag.moved) { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; paintView(); }
        return;
      }
      const g = e.target.closest?.(mode === 'graph' ? '.mt-g' : '.mt-n'), n = g && byId.get(g.dataset.id);
      if (mode === 'graph') graphHover(n || null);
      const html = n && opts.tip ? opts.tip(n) : '';
      if (!html) { tip.hidden = true; return; }
      tip.innerHTML = html; tip.hidden = false;
      const r = wrap.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(r.width - tip.offsetWidth - 8, e.clientX - r.left + 14)) + 'px';
      tip.style.top = Math.max(8, Math.min(r.height - tip.offsetHeight - 8, e.clientY - r.top + 14)) + 'px';
    });
    svg.addEventListener('pointerup', () => {
      const d = drag; drag = null; G.drag = null; svg.classList.remove('mt-pan'); if (!d || d.moved) return;
      const t = d.target.closest?.('[data-toggle]'); if (t) return toggle(t.dataset.toggle);
      const g = d.target.closest?.(mode === 'graph' ? '.mt-g' : '.mt-n'); if (!g) return;
      activate(byId.get(g.dataset.id));
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; if (mode === 'graph') graphHover(null); });
    function activate(n) {
      if (!n) return;
      if (n.depth === 0) return fit();
      if (n.open && opts.onOpen) return opts.onOpen(n);
      if (mode === 'graph' && n.children.length) return fit([n, ...n.children]);
      if (n.children.length) return toggle(n.id);
      if (opts.onOpen) opts.onOpen(n);
    }
    svg.addEventListener('keydown', e => {
      const g = e.target.closest?.('.mt-n, .mt-g'); const n = g && byId.get(g.dataset.id); if (!n) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(n); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const outward = (e.key === 'ArrowRight') === (n.dir !== -1); if (n.children.length && n.depth) { toggle(n.id, outward); } }
    });
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(view.k * Math.exp(-e.deltaY * .0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    zoom.addEventListener('click', e => { const z = e.target.closest('[data-z]')?.dataset.z; const W = svg.clientWidth / 2, H = svg.clientHeight / 2; if (z === 'in') zoomAt(view.k * 1.25, W, H); else if (z === 'out') zoomAt(view.k / 1.25, W, H); else if (z === 'fit') fit(); });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (tree && !drag) fit(); }) : null; ro?.observe(wrap);

    return {
      set(t) { tree = t; byId = new Map(); cancelAnimationFrame(G.raf); G.built = false; G.hover = null; for (const g of dom.values()) g.remove(); for (const p of edges.values()) p.remove(); dom.clear(); edges.clear(); first = true; hits = null; prep(tree, 0, null, null); draw(); fit(); },
      fit: () => fit(),
      toggle,
      expandAll() { for (const n of byId.values()) n.collapsed = false; draw(); fit(); },
      collapseAll() { for (const n of byId.values()) if (n.depth >= 1) n.collapsed = true; draw(); fit(); },
      search(q) {
        q = String(q || '').trim().toLowerCase();
        if (!q) { hits = null; draw(); return 0; }
        hits = new Set([...byId.values()].filter(n => n.depth > 0 && ((n.label || '').toLowerCase().includes(q) || (n.words || []).some(w => String(w).toLowerCase().includes(q)))));
        for (const n of hits) for (let p = n.parent; p; p = p.parent) p.collapsed = false;   // open the way to every match
        draw(); const shown = mode === 'graph' ? [...hits] : [...hits].filter(n => dom.has(n.id)); if (shown.length) { fit(shown); if (view.k > 1.1) { const k = 1.1, W = svg.clientWidth / 2, H = svg.clientHeight / 2; zoomAt(k, W, H); } }
        return hits.size;
      },
      get nodes() { return [...byId.values()]; },
      setMode, get mode() { return mode; },
      visibleCount: () => mode === 'graph' ? G.nodes.length : dom.size,
      destroy() { cancelAnimationFrame(G.raf); ro?.disconnect(); wrap.remove(); }
    };
  }
  root.MindTree = { create, esc };
})(typeof window !== 'undefined' ? window : globalThis);
