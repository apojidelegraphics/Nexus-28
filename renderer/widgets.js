// Interactive widgets for @features (v1.5). The model writes a fenced ```nexus-… JSON block; this turns it into a widget.
//   NexusWidgets.enhance(bodyEl, message, ctx)  ctx: { api, convId, onAsk(text), live }  (live = still streaming → no widgets yet)
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inl = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');

  function parseJSON(src) {
    const t = String(src || '').trim();
    const tries = [t, t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"), t.replace(/,\s*([}\]])/g, '$1'), t.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1')];
    const obj = t.replace(/[“”]/g, '"').match(/[[{][\s\S]*[\]}]/);
    if (obj) tries.push(obj[0], obj[0].replace(/,\s*([}\]])/g, '$1'));
    for (const x of tries) { try { return JSON.parse(x); } catch {} }
    return null;
  }
  const arr = v => Array.isArray(v) ? v : [];

  // ---------- Charts (plain SVG, theme colors)
  const PAL = ['var(--accent)', '#5ce1ff', '#ffb547', '#ff6b9a', '#a98bff', '#7dffcf', '#ffd36b'];
  function chart(d) {
    const labels = arr(d.labels).map(String).slice(0, 24);
    const series = arr(d.series).map(s => ({ name: String(s?.name || ''), data: arr(s?.data).map(Number).slice(0, labels.length || 24) })).filter(s => s.data.some(Number.isFinite)).slice(0, 5);
    if (!series.length) return null;
    const W = 440, H = 220, L = 38, B = 40, T = 14, R = 10;
    const type = ['bar', 'line', 'pie'].includes(d.type) ? d.type : 'bar';
    let svg = '';
    if (type === 'pie') {
      const vals = series[0].data.map(v => Math.max(0, v || 0)); const sum = vals.reduce((a, b) => a + b, 0) || 1;
      let a0 = -Math.PI / 2; const cx = 110, cy = 110, r = 90;
      vals.forEach((v, i) => {
        const a1 = a0 + (v / sum) * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        svg += vals.length === 1 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PAL[0]}"/>` : `<path d="M${cx},${cy} L${p(a0)} A${r},${r} 0 ${big} 1 ${p(a1)} Z" fill="${PAL[i % PAL.length]}" opacity=".88"/>`;
        svg += `<rect x="236" y="${16 + i * 22}" width="10" height="10" rx="2" fill="${PAL[i % PAL.length]}"/><text x="252" y="${25 + i * 22}" class="cl">${esc((labels[i] || '').slice(0, 22))} · ${Math.round(v / sum * 100)}%</text>`;
        a0 = a1;
      });
    } else {
      const all = series.flatMap(s => s.data).filter(Number.isFinite);
      const max = Math.max(0, ...all), min = Math.min(0, ...all), span = max - min || 1;
      const y = v => T + (H - T - B) * (1 - (v - min) / span);
      const n = Math.max(labels.length, ...series.map(s => s.data.length));
      const step = (W - L - R) / Math.max(1, n);
      for (let g = 0; g <= 4; g++) { const v = min + span * g / 4; svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${L - 4}" y="${y(v) + 3}" class="ax" text-anchor="end">${+v.toFixed(span < 10 ? 1 : 0)}</text>`; }
      series.forEach((s, si) => {
        if (type === 'bar') {
          const bw = step * .8 / series.length;
          s.data.forEach((v, i) => { if (!Number.isFinite(v)) return; const x = L + i * step + step * .1 + si * bw; svg += `<rect x="${x}" y="${Math.min(y(v), y(0))}" width="${Math.max(1, bw - 2)}" height="${Math.abs(y(0) - y(v))}" rx="2" fill="${PAL[si % PAL.length]}" opacity=".9"><title>${esc(s.name)} ${esc(labels[i] || '')}: ${v}</title></rect>`; });
        } else {
          const pts = s.data.map((v, i) => Number.isFinite(v) ? `${L + i * step + step / 2},${y(v)}` : null).filter(Boolean);
          svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${PAL[si % PAL.length]}" stroke-width="2.2"/>` + pts.map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="${PAL[si % PAL.length]}"/>`).join('');
        }
      });
      labels.forEach((l, i) => { svg += `<text x="${L + i * step + step / 2}" y="${H - B + 14}" class="ax" text-anchor="middle">${esc(l.slice(0, Math.max(4, Math.floor(step / 6))))}</text>`; });
    }
    const legend = type !== 'pie' && series.length > 1 ? `<div class="w-legend">${series.map((s, i) => `<span><i style="background:${PAL[i % PAL.length]}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `<div class="w-head">📊 ${esc(d.title || 'Chart')}</div><svg viewBox="0 0 ${W} ${H}" class="w-chart">${svg}</svg>${legend}`;
  }

  const BUILD = {
    // StudyMode
    quiz(d, st, save) {
      const qs = arr(d.questions).filter(q => q && q.q && arr(q.choices).length >= 2).slice(0, 10);
      if (!qs.length) return null;
      const el = document.createElement('div');
      const answers = { ...(st || {}) };
      const draw = () => {
        const done = qs.filter((_, i) => answers[i] !== undefined).length;
        const right = qs.filter((q, i) => answers[i] === +q.answer).length;
        el.innerHTML = `<div class="w-head">📝 ${esc(d.title || 'Quick quiz')}<span class="w-score">${done ? `${right}/${done}${done === qs.length ? ' · ' + (right === qs.length ? 'Perfect!' : right / qs.length >= .6 ? 'Nice!' : 'Keep practicing') : ''}` : `${qs.length} questions`}</span></div>` +
          qs.map((q, i) => `<div class="qz-q"><b>${i + 1}. ${inl(q.q)}</b><div class="qz-c">${arr(q.choices).map((c, j) => {
            const a = answers[i]; const cls = a === undefined ? '' : j === +q.answer ? 'right' : j === a ? 'wrong' : 'dim';
            return `<button data-q="${i}" data-c="${j}" class="${cls}" ${a !== undefined ? 'disabled' : ''}>${String.fromCharCode(65 + j)}. ${inl(c)}</button>`; }).join('')}</div>
            ${answers[i] !== undefined && q.why ? `<div class="qz-why">${answers[i] === +q.answer ? '✓' : '✗'} ${inl(q.why)}</div>` : ''}</div>`).join('') +
          (done ? '<div class="w-actions"><button data-reset>Retry</button></div>' : '');
      };
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-q]');
        if (b) { answers[b.dataset.q] = +b.dataset.c; save({ ...answers }); draw(); }
        if (e.target.closest('[data-reset]')) { for (const k in answers) delete answers[k]; save({}); draw(); }
      });
      draw(); return el;
    },
    // Magyk
    flashcards(d, st, save) {
      const cards = arr(d.cards).filter(c => c && c.front).slice(0, 20);
      if (!cards.length) return null;
      const known = new Set(arr(st));
      const el = document.createElement('div');
      const draw = () => {
        el.innerHTML = `<div class="w-head">🃏 ${esc(d.title || 'Flashcards')}<span class="w-score">${known.size}/${cards.length} known</span></div><div class="fc-grid">` +
          cards.map((c, i) => `<div class="fc ${known.has(i) ? 'known' : ''}" data-i="${i}"><div class="fc-in"><div class="fc-f">${inl(c.front)}</div><div class="fc-b">${inl(c.back)}</div></div><button class="fc-k" data-k="${i}" title="Mark as known">${known.has(i) ? '★' : '☆'}</button></div>`).join('') +
          `</div><div class="w-note">Click a card to flip it · ☆ marks it as known</div>`;
      };
      el.addEventListener('click', e => {
        const k = e.target.closest('[data-k]');
        if (k) { e.stopPropagation(); const i = +k.dataset.k; known.has(i) ? known.delete(i) : known.add(i); save([...known]); return draw(); }
        const c = e.target.closest('.fc'); if (c) c.classList.toggle('flip');
      });
      draw(); return el;
    },
    // NexusForge
    steps(d, st, save) {
      const steps = arr(d.steps).filter(s => s && (s.title || typeof s === 'string')).map(s => typeof s === 'string' ? { title: s } : s).slice(0, 20);
      if (!steps.length) return null;
      const done = new Set(arr(st));
      const el = document.createElement('div');
      const draw = () => {
        const pct = Math.round(done.size / steps.length * 100);
        el.innerHTML = `<div class="w-head">⚙ ${esc(d.title || 'Workflow')}<span class="w-score">${done.size}/${steps.length}</span></div><div class="w-bar"><i style="width:${pct}%"></i></div>` +
          steps.map((s, i) => `<label class="st-row ${done.has(i) ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${done.has(i) ? 'checked' : ''}><span><b>${inl(s.title)}</b>${s.detail ? `<small>${inl(s.detail)}</small>` : ''}${s.tool ? `<em>${esc(s.tool)}</em>` : ''}</span></label>`).join('') +
          `<div class="w-actions"><button data-copy>Copy as checklist</button>${pct === 100 ? '<span class="w-done">✓ All done</span>' : ''}</div>`;
      };
      el.addEventListener('change', e => { const i = +e.target.dataset.i; e.target.checked ? done.add(i) : done.delete(i); save([...done]); draw(); });
      el.addEventListener('click', e => { if (e.target.closest('[data-copy]')) { navigator.clipboard.writeText(`${d.title || 'Workflow'}\n` + steps.map((s, i) => `${done.has(i) ? '[x]' : '[ ]'} ${s.title}${s.detail ? ' — ' + s.detail : ''}`).join('\n')).catch(() => {}); e.target.textContent = 'Copied'; } });
      draw(); return el;
    },
    // Synergy
    ideas(d, st, save, ctx) {
      const ideas = arr(d.ideas).filter(i => i && i.title).slice(0, 8);
      if (!ideas.length) return null;
      const stars = new Set(arr(st));
      const el = document.createElement('div');
      const draw = () => {
        el.innerHTML = `<div class="w-head">💡 ${esc(d.title || 'Idea board')}<span class="w-score">${stars.size ? stars.size + ' starred' : 'star your favorites'}</span></div><div class="id-grid">` +
          ideas.map((it, i) => `<div class="id-card ${stars.has(i) ? 'star' : ''}"><div class="id-top"><b>${inl(it.title)}</b><button data-star="${i}" title="Star">${stars.has(i) ? '★' : '☆'}</button></div><p>${inl(it.pitch || '')}</p>
            ${arr(it.pros).length ? `<div class="id-pc"><span class="pro">+</span>${arr(it.pros).slice(0, 3).map(inl).join(' · ')}</div>` : ''}${arr(it.cons).length ? `<div class="id-pc"><span class="con">−</span>${arr(it.cons).slice(0, 3).map(inl).join(' · ')}</div>` : ''}
            ${ctx.onAsk ? `<button class="id-x" data-ex="${i}">Expand ▸</button>` : ''}</div>`).join('') + '</div>' +
          (stars.size >= 2 && ctx.onAsk ? `<div class="w-actions"><button data-combine>Combine my starred ideas</button></div>` : '');
      };
      el.addEventListener('click', e => {
        const s = e.target.closest('[data-star]');
        if (s) { const i = +s.dataset.star; stars.has(i) ? stars.delete(i) : stars.add(i); save([...stars]); return draw(); }
        const x = e.target.closest('[data-ex]'); if (x) return ctx.onAsk(`Expand on the idea "${ideas[+x.dataset.ex].title}": how it would work, first steps, and what could go wrong.`);
        if (e.target.closest('[data-combine]')) ctx.onAsk(`Combine these ideas into one plan: ${[...stars].map(i => `"${ideas[i].title}"`).join(', ')}.`);
      });
      draw(); return el;
    },
    // FortressLens
    chart(d) { const h = chart(d); if (!h) return null; const el = document.createElement('div'); el.innerHTML = h; return el; },
    risks(d) {
      const risks = arr(d.risks).filter(r => r && r.risk).slice(0, 9);
      if (!risks.length) return null;
      const c = v => Math.max(1, Math.min(3, Math.round(+v) || 2));
      const cells = [];
      for (let imp = 3; imp >= 1; imp--) for (let lik = 1; lik <= 3; lik++) {
        const here = risks.map((r, i) => ({ r, i })).filter(x => c(x.r.impact) === imp && c(x.r.likelihood) === lik);
        cells.push(`<div class="rk-cell lv${imp + lik}">${here.map(x => `<span title="${esc(x.r.risk)}">${x.i + 1}</span>`).join('')}</div>`);
      }
      const el = document.createElement('div');
      el.innerHTML = `<div class="w-head">🛡 Risk matrix</div><div class="rk-wrap"><div class="rk-y">IMPACT ↑</div><div class="rk-grid">${cells.join('')}</div></div><div class="rk-x">LIKELIHOOD →</div>` +
        `<ol class="rk-list">${risks.map(r => `<li><b>${inl(r.risk)}</b> <small>impact ${c(r.impact)} · likelihood ${c(r.likelihood)}</small>${r.mitigation ? `<div>↳ ${inl(r.mitigation)}</div>` : ''}</li>`).join('')}</ol>`;
      return el;
    },
    // LogicLattice
    logic(d) {
      const prem = arr(d.premises).map(String).slice(0, 10);
      if (!prem.length && !d.conclusion) return null;
      const steps = arr(d.steps).filter(s => s && s.claim).slice(0, 10);
      const ref = f => { const s = String(f); return /^s/i.test(s) ? 'S' + s.replace(/\D/g, '') : 'P' + s.replace(/\D/g, ''); };
      const weak = arr(d.weak).map(String);
      const el = document.createElement('div');
      el.innerHTML = `<div class="w-head">⛓ Logic lattice</div><div class="lg">` +
        prem.map((p, i) => `<div class="lg-node prem"><span class="lg-id">P${i + 1}</span>${inl(p)}</div>`).join('') +
        steps.map((s, i) => `<div class="lg-node step"><span class="lg-id">S${i + 1}</span>${inl(s.claim)}${arr(s.from).length ? `<small>from ${arr(s.from).map(ref).join(', ')}</small>` : ''}</div>`).join('') +
        (d.conclusion ? `<div class="lg-node concl"><span class="lg-id">∴</span>${inl(d.conclusion)}</div>` : '') + '</div>' +
        (arr(d.assumptions).length ? `<div class="lg-sub"><b>Assumptions</b>${arr(d.assumptions).map(a => `<span>${inl(a)}</span>`).join('')}</div>` : '') +
        (weak.length ? `<div class="lg-sub weak"><b>⚠ Weak links</b>${weak.map(a => `<span>${inl(a)}</span>`).join('')}</div>` : '');
      return el;
    },
    // InsightPulse
    insights(d) {
      const ins = arr(d.insights).filter(i => i && i.title).slice(0, 8);
      if (!ins.length && !d.headline) return null;
      const el = document.createElement('div');
      el.innerHTML = `<div class="w-head">⚡ Insights</div>${d.headline ? `<div class="in-head">${inl(d.headline)}</div>` : ''}<div class="in-grid">` +
        ins.sort((a, b) => (+b.strength || 0) - (+a.strength || 0)).map(i => `<div class="in-card"><div class="in-pulse">${[1, 2, 3].map(n => `<i class="${n <= (+i.strength || 2) ? 'on' : ''}"></i>`).join('')}</div><b>${inl(i.title)}</b><p>${inl(i.detail || '')}</p></div>`).join('') + '</div>';
      return el;
    },
    // Envision
    palette(d) {
      const colors = arr(d.colors).filter(c => c && /^#[0-9a-f]{3,8}$/i.test(c.hex)).slice(0, 8);
      if (!colors.length) return null;
      const el = document.createElement('div');
      el.innerHTML = `<div class="w-head">🎨 Palette</div><div class="pl-row">${colors.map(c => `<button class="pl-sw" data-hex="${esc(c.hex)}" title="Copy ${esc(c.hex)}"><i style="background:${esc(c.hex)}"></i><b>${esc(c.name || '')}</b><small>${esc(c.hex)}</small></button>`).join('')}</div>`;
      el.addEventListener('click', e => { const b = e.target.closest('[data-hex]'); if (b) { navigator.clipboard.writeText(b.dataset.hex).catch(() => {}); b.querySelector('small').textContent = 'copied'; } });
      return el;
    },
    // Proactix / Proactix 2.0
    next(d, st, save, ctx) {
      const next = arr(d.next).map(String).filter(Boolean).slice(0, 5);
      if (!next.length && !d.remind) return null;
      const el = document.createElement('div');
      el.className = 'nx-wrap';
      el.innerHTML = `<div class="nx-head">NEXT</div><div class="nx-chips">${next.map((t, i) => `<button data-n="${i}" ${ctx.onAsk ? '' : 'disabled'}>${esc(t)}</button>`).join('')}` +
        (d.remind ? `<button class="nx-remind" data-remind ${st === 'added' ? 'disabled' : ''}>${st === 'added' ? '✓ Reminder added' : '⏰ Remind me: ' + esc(String(d.remind).slice(0, 70))}</button>` : '') + '</div>';
      el.addEventListener('click', async e => {
        const b = e.target.closest('[data-n]'); if (b && ctx.onAsk) return ctx.onAsk(next[+b.dataset.n]);
        const r = e.target.closest('[data-remind]');
        if (r && ctx.api?.addReminder) {
          r.disabled = true; r.textContent = 'Adding…';
          const res = await ctx.api.addReminder(String(d.remind));
          r.textContent = res.ok ? '✓ Reminder added' : res.error; if (res.ok) save('added'); else r.disabled = false;
        }
      });
      return el;
    }
  };
  const LANG = { 'nexus-quiz': 'quiz', 'nexus-flashcards': 'flashcards', 'nexus-steps': 'steps', 'nexus-ideas': 'ideas', 'nexus-chart': 'chart', 'nexus-risks': 'risks', 'nexus-logic': 'logic', 'nexus-insights': 'insights', 'nexus-palette': 'palette', 'nexus-next': 'next' };

  // SVG concept sketch → an <img> (scripts never run inside images).
  function svgImage(src) {
    const s = String(src || '').trim();
    if (!/^<svg[\s>]/i.test(s) || s.length > 60000) return null;
    const clean = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/(href|xlink:href)\s*=\s*("https?:[^"]*"|'https?:[^']*')/gi, '');
    const el = document.createElement('div');
    el.className = 'w-svg';
    const img = document.createElement('img');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(clean.includes('xmlns') ? clean : clean.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"'));
    img.alt = 'Concept sketch';
    img.onerror = () => { el.innerHTML = '<div class="w-note">This sketch could not be drawn.</div>'; };
    el.appendChild(img);
    return el;
  }

  function codeTools(pre, lang, ctx) {
    const code = pre.querySelector('code')?.textContent || '';
    const bar = document.createElement('div');
    bar.className = 'code-bar';
    const js = /^(js|javascript|mjs)$/.test(lang);
    bar.innerHTML = `<span>${esc(lang || 'code')}</span><button data-a="copy">Copy</button>${ctx.api?.code ? '<button data-a="save">Save…</button>' : ''}${js && ctx.api?.code ? '<button data-a="run">▶ Run</button>' : ''}`;
    let out = null;
    bar.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'copy') { navigator.clipboard.writeText(code).catch(() => {}); e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy'; }, 1200); }
      if (a === 'save') { const r = await ctx.api.code.save(code, lang); if (r.ok) e.target.textContent = 'Saved'; }
      if (a === 'run') {
        if (!out) { out = document.createElement('pre'); out.className = 'code-out'; pre.after(out); }
        out.textContent = 'Running…'; out.classList.remove('err');
        const r = await ctx.api.code.run(code);
        out.textContent = (r.out ? r.out + '\n' : '') + (r.ok ? (r.out ? '' : '(no output)') : '✖ ' + r.error);
        out.classList.toggle('err', !r.ok);
      }
    });
    pre.classList.add('has-bar');
    pre.before(bar);
  }

  function enhance(body, m, ctx = {}) {
    if (!body) return;
    const counts = {};
    body.querySelectorAll('pre').forEach(pre => {
      const lang = pre.dataset.lang || '';
      const kind = LANG[lang];
      if (ctx.live) { if (kind) pre.classList.add('w-pending'); return; }
      if (kind) {
        const d = parseJSON(pre.textContent);
        const idx = counts[kind] = (counts[kind] || 0) + 1;
        const key = kind + (idx > 1 ? idx : '');
        const st = m?.widget?.[key];
        const save = v => { if (m && ctx.convId && m.ts && ctx.api?.conv?.patchWidget) { m.widget = { ...(m.widget || {}), [key]: v }; ctx.api.conv.patchWidget(ctx.convId, m.ts, key, v); } };
        const el = d && BUILD[kind](d, st, save, ctx);
        if (el) { el.classList.add('widget', 'w-' + kind); pre.replaceWith(el); }
        else pre.insertAdjacentHTML('beforebegin', '<div class="w-note">This widget\'s data was malformed, so here it is as text.</div>');
        return;
      }
      if (lang === 'svg') { const el = svgImage(pre.textContent); if (el) { pre.replaceWith(el); return; } }
      codeTools(pre, lang, ctx);
    });
  }

  window.NexusWidgets = { enhance, parseJSON, chart, BUILD, LANG };
})();
