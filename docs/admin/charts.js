// Small SVG charts for the dashboard (no libraries): a line chart with a crosshair tooltip, a bar chart with
// per-bar tooltips, and horizontal bars. Thin marks, one axis, recessive grid, legend for 2+ series.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const fmtDay = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const niceMax = v => { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
  function el(tag, attrs = {}, parent) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (parent) parent.appendChild(e); return e; }

  function frame(host, rows, maxV, H = 180) {
    host.innerHTML = ''; host.classList.add('chart');
    const W = Math.max(280, host.clientWidth || 600), pad = { l: 34, r: 8, t: 8, b: 22 };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, host);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, top = niceMax(Math.max(1, maxV));
    const y = v => pad.t + ih - (v / top) * ih;
    const g = el('g', { class: 'grid' }, svg), ax = el('g', { class: 'axis' }, svg);
    for (let i = 0; i <= 4; i++) { const v = top * i / 4, yy = y(v); el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy }, g); const t = el('text', { x: pad.l - 6, y: yy + 4, 'text-anchor': 'end' }, ax); t.textContent = Math.round(v); }
    const step = Math.max(1, Math.ceil(rows.length / 6));
    rows.forEach((r, i) => { if (i % step && i !== rows.length - 1) return; const t = el('text', { x: 0, y: H - 6, 'text-anchor': 'middle' }, ax); t.dataset.i = i; t.textContent = fmtDay(r.day); });
    const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip);
    return { svg, W, H, pad, iw, ih, y, tip, ax };
  }
  function showTip(host, tip, x, title, lines) {
    tip.replaceChildren();
    const h = document.createElement('div'); h.className = 'muted'; h.textContent = title; tip.appendChild(h);
    for (const [label, value, color] of lines) {
      const d = document.createElement('div'); const k = document.createElement('i'); k.className = 'k'; k.style.background = color;
      const b = document.createElement('b'); b.textContent = value; const s = document.createElement('span'); s.className = 'muted'; s.textContent = ' ' + label;
      d.append(k, b, s); tip.appendChild(d);
    }
    tip.hidden = false;
    const w = tip.offsetWidth, hw = host.clientWidth;
    tip.style.left = Math.max(0, Math.min(hw - w, x - w / 2)) + 'px'; tip.style.top = '-6px';
  }
  function legend(series, rect) {
    const d = document.createElement('div'); d.className = 'legend';
    for (const s of series) { const sp = document.createElement('span'); const i = document.createElement('i'); if (rect) i.className = 'rect'; i.style.background = s.color; sp.append(i, document.createTextNode(s.label)); d.appendChild(sp); }
    return d;
  }

  // series: [{ key, label, color }]; rows: [{ day, [key]: n }]
  function line(host, rows, series) {
    const max = Math.max(1, ...rows.flatMap(r => series.map(s => +r[s.key] || 0)));
    const f = frame(host, rows, max);
    const x = i => f.pad.l + (rows.length === 1 ? f.iw / 2 : (i / (rows.length - 1)) * f.iw);
    f.ax.querySelectorAll('text[data-i]').forEach(t => t.setAttribute('x', x(+t.dataset.i)));
    for (const s of series) {
      const d = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${f.y(+r[s.key] || 0).toFixed(1)}`).join('');
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, f.svg);
      const last = rows.length - 1; el('circle', { cx: x(last), cy: f.y(+rows[last]?.[s.key] || 0), r: 4, fill: s.color, stroke: 'var(--panel)', 'stroke-width': 2 }, f.svg);
    }
    const hair = el('line', { y1: f.pad.t, y2: f.H - f.pad.b, stroke: 'var(--muted)', 'stroke-width': 1, opacity: 0 }, f.svg);
    const dots = series.map(s => el('circle', { r: 4, fill: s.color, stroke: 'var(--panel)', 'stroke-width': 2, opacity: 0 }, f.svg));
    const hit = el('rect', { x: f.pad.l, y: 0, width: f.iw, height: f.H, fill: 'transparent', tabindex: 0 }, f.svg);
    const pick = i => {
      i = Math.max(0, Math.min(rows.length - 1, i)); const r = rows[i], xx = x(i);
      hair.setAttribute('x1', xx); hair.setAttribute('x2', xx); hair.setAttribute('opacity', .5);
      series.forEach((s, k) => { dots[k].setAttribute('cx', xx); dots[k].setAttribute('cy', f.y(+r[s.key] || 0)); dots[k].setAttribute('opacity', 1); });
      showTip(host, f.tip, xx / f.W * host.clientWidth, fmtDay(r.day), series.map(s => [s.label, (+r[s.key] || 0).toLocaleString(), s.color]));
    };
    const idxAt = ev => { const b = f.svg.getBoundingClientRect(); const px = (ev.clientX - b.left) / b.width * f.W; return Math.round((px - f.pad.l) / f.iw * (rows.length - 1)); };
    let cur = rows.length - 1;
    hit.addEventListener('pointermove', ev => pick(cur = idxAt(ev)));
    hit.addEventListener('pointerleave', () => { f.tip.hidden = true; hair.setAttribute('opacity', 0); dots.forEach(d => d.setAttribute('opacity', 0)); });
    hit.addEventListener('focus', () => pick(cur));
    hit.addEventListener('keydown', ev => { if (ev.key === 'ArrowLeft') pick(--cur); if (ev.key === 'ArrowRight') pick(++cur); cur = Math.max(0, Math.min(rows.length - 1, cur)); });
    if (series.length > 1) host.prepend(legend(series));
  }
  // single series bars (color = theme accent unless given)
  function bars(host, rows, key, label, color = 'var(--accent)') {
    const max = Math.max(1, ...rows.map(r => +r[key] || 0));
    const f = frame(host, rows, max, 150);
    const bw = f.iw / rows.length, gap = Math.min(2, bw * .25);
    f.ax.querySelectorAll('text[data-i]').forEach(t => t.setAttribute('x', f.pad.l + (+t.dataset.i + .5) * bw));
    rows.forEach((r, i) => {
      const v = +r[key] || 0, x0 = f.pad.l + i * bw + gap / 2, w = Math.max(1, bw - gap), yy = f.y(v), h = f.H - f.pad.b - yy;
      const rr = Math.min(4, w / 2, h);
      const d = h <= 0 ? '' : `M${x0},${f.H - f.pad.b}V${yy + rr}Q${x0},${yy} ${x0 + rr},${yy}H${x0 + w - rr}Q${x0 + w},${yy} ${x0 + w},${yy + rr}V${f.H - f.pad.b}Z`;
      if (d) el('path', { d, fill: color }, f.svg);
      const hit = el('rect', { x: f.pad.l + i * bw, y: f.pad.t, width: bw, height: f.ih, fill: 'transparent', tabindex: -1 }, f.svg);
      const show = () => showTip(host, f.tip, (f.pad.l + (i + .5) * bw) / f.W * host.clientWidth, fmtDay(r.day), [[label, v.toLocaleString(), color]]);
      hit.addEventListener('pointerenter', show); hit.addEventListener('pointerleave', () => { f.tip.hidden = true; });
    });
  }
  // items: [{ label, value, sub? }]
  function hbars(host, items, color = 'var(--accent)') {
    const max = Math.max(1, ...items.map(i => i.value));
    host.replaceChildren(...items.map(it => {
      const row = document.createElement('div'); row.className = 'hbar';
      const l = document.createElement('span'); l.textContent = it.label; l.title = it.sub || it.label; l.style.overflow = 'hidden'; l.style.textOverflow = 'ellipsis'; l.style.whiteSpace = 'nowrap';
      const track = document.createElement('div'); const b = document.createElement('div'); b.className = 'bar'; b.style.width = (it.value / max * 100) + '%'; b.style.background = it.color || color; track.appendChild(b);
      const v = document.createElement('span'); v.className = 'v'; v.textContent = it.value.toLocaleString();
      row.append(l, track, v); return row;
    }));
    if (!items.length) host.innerHTML = '<div class="muted">No data yet.</div>';
  }
  // the same numbers as a table (accessibility / exact values)
  function table(rows, cols) {
    return `<table class="cards"><tr><th>Day</th>${cols.map(c => `<th class="num">${NX.esc(c.label)}</th>`).join('')}</tr>${rows.slice().reverse().map(r => `<tr><td>${fmtDay(r.day)}</td>${cols.map(c => `<td class="num">${(+r[c.key] || 0).toLocaleString()}</td>`).join('')}</tr>`).join('')}</table>`;
  }
  window.NXCharts = { line, bars, hbars, table, fmtDay };
})();
