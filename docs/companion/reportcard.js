/* Generated from the Nexus '28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */
/* 4.3.0 Weekly report card (shared by the app and N28C). NexusReport.card(r) → HTML, NexusReport.open(r, { save, share })
   shows it in a sheet. r comes from recap.grade(): { key, from, to, overall, score, items: [{ label, grade, score, note }], best, tip, achievements, name } */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.NexusReport = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tone = g => /^A/.test(g) ? 'a' : /^B/.test(g) ? 'b' : /^C/.test(g) ? 'c' : 'd';
  const CSS = `
  .nxr-back{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}
  .nxr-sheet{display:flex;flex-direction:column;gap:10px;align-items:center;max-height:100%;overflow:auto}
  .nxr{width:min(360px,calc(100vw - 32px));box-sizing:border-box;border-radius:20px;padding:18px 18px 14px;background:linear-gradient(160deg,#0c2a1e,#06140e 60%);border:1px solid rgba(61,255,160,.35);color:#e7fff3;font:14px/1.4 -apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45)}
  .nxr-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .nxr-k{font:700 10px ui-monospace,Menlo,monospace;letter-spacing:.18em;color:#3dffa0}
  .nxr-who{font-size:17px;font-weight:700;margin-top:2px}
  .nxr-rng{font-size:12px;color:#8fb8a5}
  .nxr-big{width:64px;height:64px;flex:none;border-radius:16px;display:flex;align-items:center;justify-content:center;font:800 30px/1 -apple-system,Inter,sans-serif;border:2px solid currentColor}
  .nxr-a{color:#3dffa0}.nxr-b{color:#7fd8ff}.nxr-c{color:#ffd166}.nxr-d{color:#ff7a7a}
  .nxr-rows{margin:14px 0 6px;display:flex;flex-direction:column;gap:7px}
  .nxr-row{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center}
  .nxr-row b{font-weight:600}.nxr-row small{grid-column:1;color:#8fb8a5;font-size:11.5px}
  .nxr-g{grid-row:1/3;grid-column:2;font:800 17px/1 -apple-system,Inter,sans-serif;min-width:34px;text-align:right}
  .nxr-bar{grid-column:1/3;height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}.nxr-bar i{display:block;height:100%;background:currentColor;border-radius:3px}
  .nxr-tip{margin-top:10px;padding:9px 11px;border-radius:12px;background:rgba(61,255,160,.08);font-size:12.5px}
  .nxr-ach{margin-top:8px;font-size:12px;color:#bfe9d6}
  .nxr-foot{margin-top:10px;display:flex;justify-content:space-between;font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.12em;color:#5f8c78}
  .nxr-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
  .nxr-btns button{border:1px solid rgba(61,255,160,.45);background:rgba(6,20,14,.9);color:#e7fff3;border-radius:999px;padding:8px 14px;font:600 13px -apple-system,Inter,sans-serif;cursor:pointer}
  .nxr-btns button.pri{background:#3dffa0;color:#04140c;border-color:#3dffa0}`;
  function style() { if (typeof document === 'undefined' || document.getElementById('nxr-css')) return; const st = document.createElement('style'); st.id = 'nxr-css'; st.textContent = CSS; document.head.appendChild(st); }
  function range(r) { const f = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); return r.from ? `${f(r.from)} – ${f(r.to - 1)}` : ''; }
  function card(r) {
    style(); if (!r) return '';
    const rows = (r.items || []).map(i => `<div class="nxr-row nxr-${tone(i.grade)}"><b style="color:#e7fff3">${esc(i.label)}</b><span class="nxr-g">${esc(i.grade)}</span><small>${esc(i.note)}</small><span class="nxr-bar"><i style="width:${Math.max(3, Math.min(100, i.score | 0))}%"></i></span></div>`).join('');
    const ach = (r.achievements || []).slice(0, 4).map(a => `${esc(a.icon || '★')} ${esc(a.name)}`).join(' · ');
    return `<div class="nxr"><div class="nxr-top"><div><div class="nxr-k">WEEKLY REPORT CARD</div><div class="nxr-who">${r.name ? esc(r.name) + "'s week" : 'Your week'}</div><div class="nxr-rng">${esc(range(r))}</div></div>
      <div class="nxr-big nxr-${tone(r.overall)}" title="Overall ${r.score | 0}/100">${esc(r.overall)}</div></div>
      <div class="nxr-rows">${rows}</div>${ach ? `<div class="nxr-ach">Unlocked: ${ach}</div>` : ''}<div class="nxr-tip">💡 ${esc(r.tip)}</div>
      <div class="nxr-foot"><span>NEXUS '28</span><span>${r.best ? 'BEST: ' + esc(r.best).toUpperCase() : ''}</span></div></div>`;
  }
  function open(r, { save, share, close } = {}) {
    style();
    const back = document.createElement('div'); back.className = 'nxr-back';
    back.innerHTML = `<div class="nxr-sheet">${card(r)}<div class="nxr-btns">${save ? '<button class="pri" data-x="save">Save image</button>' : ''}${share ? '<button data-x="share">Share</button>' : ''}<button data-x="close">Close</button></div></div>`;
    const done = () => { back.remove(); close && close(); };
    back.addEventListener('click', async e => {
      const x = e.target.closest('[data-x]')?.dataset.x;
      if (e.target === back || x === 'close') return done();
      if (x === 'save') { const el = back.querySelector('.nxr').getBoundingClientRect(); await save({ x: el.left, y: el.top, width: el.width, height: el.height }); }
      if (x === 'share') await share(r);
    });
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', k); done(); } });
    document.body.appendChild(back); return back;
  }
  return { card, open };
});
