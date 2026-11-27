/* Generated from the Nexus '28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */
// 4.3.0 Classroom mode (shared by the Mac/Windows app, N28C and Test Run; copied by `npm run sync:companion`).
// A teacher makes a class and shares its 6-letter code; students join with it. The teacher adds flashcard decks (or
// turns one of their own decks into a class deck) and sees how far each student got on each deck: cards reviewed, right,
// finished. Never anyone's chats or anything else.
//   NexusClass.open({ rpc: (fn, args) => Promise<data>, toast, myDecks: () => [{ name, cards: [{ f, b }] }], onFeed? })
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CSS = `.ncl-wrap{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:grid;place-items:center;padding:16px;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;color:var(--text,#e2fff1)}
.ncl{width:min(720px,100%);max-height:88vh;overflow:auto;background:var(--bg2,#071a12);border:1px solid rgba(var(--accent-rgb,61,255,160),.3);border-radius:18px;padding:18px;display:grid;gap:12px}
.ncl h2{margin:0;font-size:18px}.ncl h3{margin:6px 0 4px;font-size:14px}.ncl .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ncl .sp{flex:1}
.ncl .muted{color:var(--muted,#7aa894);font-size:13px}.ncl input,.ncl select{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:9px;color:inherit;padding:7px 10px;font:inherit}
.ncl button{border:1px solid rgba(var(--accent-rgb,61,255,160),.35);background:rgba(var(--accent-rgb,61,255,160),.07);color:inherit;border-radius:9px;padding:6px 12px;font:inherit;cursor:pointer}
.ncl button.pri{background:var(--accent,#3dffa0);color:#032313;border-color:transparent;font-weight:600}.ncl button.x{border:0;background:none;font-size:18px;padding:2px 8px}.ncl button.dan{border-color:rgba(255,90,110,.5);color:#ff6b7d;background:none}
.ncl .cl-card{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px;display:flex;gap:10px;align-items:center;cursor:pointer}.ncl .cl-card:hover{border-color:rgba(var(--accent-rgb,61,255,160),.45)}
.ncl .code{font:700 20px ui-monospace,Menlo,monospace;letter-spacing:.2em;color:var(--accent,#3dffa0)}.ncl .pill{font:600 10px ui-monospace,monospace;letter-spacing:.12em;padding:2px 7px;border-radius:6px;border:1px solid rgba(var(--accent-rgb,61,255,160),.45)}
.ncl table{width:100%;border-collapse:collapse;font-size:13px}.ncl td,.ncl th{padding:6px 6px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}.ncl th{color:var(--muted,#7aa894);font-weight:600;font-size:11px;letter-spacing:.06em}
.ncl .ok{color:var(--accent,#3dffa0)}.ncl .bar{height:6px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;min-width:60px}.ncl .bar i{display:block;height:100%;background:var(--accent,#3dffa0)}
.ncl .flash{min-height:150px;border:1px solid rgba(var(--accent-rgb,61,255,160),.35);border-radius:14px;display:grid;place-items:center;padding:18px;text-align:center;font-size:18px;cursor:pointer}`;
  function ensureCss() { if (document.getElementById('ncl-css')) return; const s = document.createElement('style'); s.id = 'ncl-css'; s.textContent = CSS; document.head.appendChild(s); }

  function open(o) {
    ensureCss();
    document.querySelectorAll('.ncl-wrap').forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'ncl-wrap'; d.innerHTML = '<div class="ncl"></div>'; document.body.appendChild(d);
    const box = d.querySelector('.ncl'), toast = o.toast || (() => {});
    const close = () => d.remove();
    d.addEventListener('click', e => { if (e.target === d) close(); });
    const call = async (fn, args) => { try { const r = await o.rpc(fn, args); if (r && r.ok === false && r.error) throw new Error(r.error); return r; } catch (e) { toast(/classroom|PGRST202|does not exist/.test(e.message) ? 'Classes aren’t switched on yet.' : e.message); throw e; } };

    async function home() {
      box.innerHTML = '<div class="row"><h2>Classes</h2><span class="sp"></span><button class="x" data-x>✕</button></div><p class="muted">Loading…</p>';
      const list = await call('my_classrooms').catch(() => []);
      box.innerHTML = `<div class="row"><h2>Classes</h2><span class="sp"></span><button class="x" data-x>✕</button></div>
        <p class="muted">Teachers share flashcard decks with a class and see how far everyone got. Only that: never chats or anything else.</p>
        ${(list || []).map(c => `<div class="cl-card" data-open="${esc(c.id)}"><div style="flex:1"><b>${esc(c.name)}</b><div class="muted">${c.role === 'teacher' ? `You teach · ${c.members} student${c.members === 1 ? '' : 's'} · code <b>${esc(c.code)}</b>` : `${c.decks} deck${c.decks === 1 ? '' : 's'}${c.todo ? ` · <span class="ok">${c.todo} to do</span>` : ' · all done'}`}</div></div><span class="pill">${c.role === 'teacher' ? 'TEACHER' : 'STUDENT'}</span></div>`).join('') || '<p class="muted">You’re not in any classes yet.</p>'}
        <h3>Join a class</h3><div class="row"><input id="nclCode" placeholder="6-letter code" maxlength="6" style="text-transform:uppercase;width:150px"><button class="pri" id="nclJoin">Join</button></div>
        <h3>Teach a class</h3><div class="row"><input id="nclName" placeholder="Class name, like Biology 10" maxlength="60" style="flex:1"><button id="nclNew">Make it</button></div>`;
    }
    async function view(id) {
      const v = await call('classroom_view', { p_class: id }).catch(() => null); if (!v) return home();
      const teach = v.role === 'teacher', decks = v.decks || [], st = v.students || [];
      box.innerHTML = `<div class="row"><button data-home>← Classes</button><h2 style="margin-left:6px">${esc(v.name)}</h2><span class="sp"></span><button class="x" data-x>✕</button></div>
        ${teach ? `<div class="row"><span class="muted">Class code</span><span class="code">${esc(v.code)}</span><button data-copy="${esc(v.code)}">Copy</button><span class="sp"></span><button class="dan" data-del="${esc(v.id)}">Delete class</button></div>` : `<div class="row"><span class="sp"></span><button class="dan" data-leave="${esc(v.id)}">Leave class</button></div>`}
        <h3>Decks</h3>
        ${decks.map(k => { const m = k.mine || {}; return `<div class="cl-card" ${teach ? '' : `data-study="${esc(k.id)}"`}><div style="flex:1"><b>${esc(k.name)}</b><div class="muted">${k.cards.length} cards${k.due ? ' · due ' + esc(new Date(k.due + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) : ''}${teach ? ` · ${k.done}/${st.length} finished` : m.done ? ' · <span class="ok">finished</span>' : m.reviewed ? ` · ${m.reviewed} reviewed` : ''}</div></div>${teach ? `<button class="dan" data-rmdeck="${esc(k.id)}">Remove</button>` : `<button class="pri" data-study="${esc(k.id)}">${m.done ? 'Again' : 'Study'}</button>`}</div>`; }).join('') || '<p class="muted">No decks yet.</p>'}
        ${teach ? `<h3>Add a deck</h3><div class="row"><select id="nclMine">${(o.myDecks?.() || []).map((k, i) => `<option value="${i}">${esc(k.name)} (${(k.cards || []).length} cards)</option>`).join('') || '<option value="">No decks of your own yet</option>'}</select><input type="date" id="nclDue" title="Due date (optional)"><button class="pri" id="nclAdd">Share with the class</button></div>
          <p class="muted">Or type cards, one per line as <i>front | back</i>:</p><textarea id="nclCards" rows="4" style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:9px;color:inherit;padding:8px;font:inherit" placeholder="Mitochondria | makes ATP"></textarea><div class="row"><input id="nclDeckName" placeholder="Deck name" style="flex:1"><button id="nclAddTyped">Add these</button></div>
          <h3>Students <span class="muted">(${st.length})</span></h3>
          ${st.length ? `<table><tr><th>Student</th>${decks.map(k => `<th>${esc(k.name)}</th>`).join('')}<th></th></tr>${st.map(s => `<tr><td>${esc(s.name)}${s.username ? ` <span class="muted">@${esc(s.username)}</span>` : ''}</td>${decks.map(k => { const p = s.progress?.[k.id]; const pct = p ? Math.min(100, Math.round(p.reviewed / Math.max(1, k.cards.length) * 100)) : 0; return `<td>${p?.done ? '<span class="ok">✓ done</span>' : `<div class="bar"><i style="width:${pct}%"></i></div>`}${p ? ` <span class="muted">${p.correct}/${p.reviewed}</span>` : ''}</td>`; }).join('')}<td><button class="x" title="Remove from class" data-kick="${esc(s.id)}">✕</button></td></tr>`).join('')}</table>` : '<p class="muted">Nobody yet. Share the code above.</p>'}` : ''}`;
      box.dataset.class = v.id; box._decks = decks;
    }
    function study(deck) {
      const cards = deck.cards.slice().sort(() => Math.random() - .5); let i = 0, flipped = false, right = 0, seen = 0;
      const paint = () => {
        if (i >= cards.length) { call('classroom_progress_set', { p_deck: deck.id, p_reviewed: seen, p_correct: right, p_done: true }).catch(() => {}); o.onFeed?.(`finished “${deck.name}” in class`); box.innerHTML = `<div class="row"><h2>${esc(deck.name)}</h2><span class="sp"></span><button class="x" data-x>✕</button></div><h3>Done: ${right} of ${seen} right</h3><p class="muted">Your teacher sees that you finished and your score.</p><div class="row"><button data-back="${esc(box.dataset.class)}">Back to the class</button></div>`; return; }
        const c = cards[i];
        box.innerHTML = `<div class="row"><h2>${esc(deck.name)}</h2><span class="muted">${i + 1} / ${cards.length}</span><span class="sp"></span><button class="x" data-x>✕</button></div><div class="flash" data-flip>${esc(flipped ? c.b : c.f)}</div>
          <div class="row" style="justify-content:center">${flipped ? '<button data-g="0">Missed it</button><button class="pri" data-g="1">Got it</button>' : '<button class="pri" data-flip>Show the answer</button>'}</div>`;
      };
      box.onStudy = { flip: () => { flipped = !flipped; paint(); }, grade: g => { seen++; if (g) right++; i++; flipped = false; if (seen % 5 === 0) call('classroom_progress_set', { p_deck: deck.id, p_reviewed: seen, p_correct: right, p_done: false }).catch(() => {}); paint(); } };
      paint();
    }
    d.addEventListener('click', async e => {
      const b = e.target.closest('[data-x],[data-home],[data-open],[data-copy],[data-del],[data-leave],[data-study],[data-rmdeck],[data-kick],[data-back],[data-flip],[data-g],#nclJoin,#nclNew,#nclAdd,#nclAddTyped'); if (!b) return;
      if (b.dataset.x !== undefined) return close();
      if (b.dataset.home !== undefined) return home();
      if (b.dataset.open) return view(b.dataset.open);
      if (b.dataset.back) return view(b.dataset.back);
      if (b.dataset.copy) { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Code copied'); } catch {} return; }
      if (b.dataset.flip !== undefined) return box.onStudy?.flip();
      if (b.dataset.g !== undefined) return box.onStudy?.grade(+b.dataset.g);
      if (b.id === 'nclJoin') { const code = box.querySelector('#nclCode').value.trim(); if (code.length !== 6) return toast('Codes are 6 letters and numbers.'); const r = await call('classroom_join', { p_code: code }).catch(() => null); if (r?.ok) { toast('Joined ' + r.name); return view(r.id); } return; }
      if (b.id === 'nclNew') { const n = box.querySelector('#nclName').value.trim(); if (!n) return; const r = await call('classroom_create', { p_name: n }).catch(() => null); if (r?.ok) { toast('Class made. Share the code: ' + r.code); return view(r.id); } return; }
      const cls = box.dataset.class;
      if (b.dataset.del) { if (!confirm('Delete this class for everyone? Its decks and progress go too.')) return; await call('classroom_leave', { p_class: b.dataset.del }).catch(() => {}); return home(); }
      if (b.dataset.leave) { if (!confirm('Leave this class?')) return; await call('classroom_leave', { p_class: b.dataset.leave }).catch(() => {}); return home(); }
      if (b.dataset.kick) { if (!confirm('Remove this student from the class?')) return; await call('classroom_leave', { p_class: cls, p_user: b.dataset.kick }).catch(() => {}); return view(cls); }
      if (b.dataset.rmdeck) { if (!confirm('Remove this deck from the class?')) return; await call('classroom_deck_remove', { p_deck: b.dataset.rmdeck }).catch(() => {}); return view(cls); }
      if (b.dataset.study) { const k = (box._decks || []).find(x => x.id === b.dataset.study); if (k) study(k); return; }
      if (b.id === 'nclAdd') { const k = (o.myDecks?.() || [])[+box.querySelector('#nclMine').value]; if (!k) return toast('Make a deck first, or type cards below.'); const r = await call('classroom_deck_add', { p_class: cls, p_name: k.name, p_cards: (k.cards || []).slice(0, 100).map(c => ({ f: c.f ?? c.front, b: c.b ?? c.back })), p_due: box.querySelector('#nclDue').value || null }).catch(() => null); if (r?.ok) { toast('Shared with the class'); view(cls); } return; }
      if (b.id === 'nclAddTyped') { const cards = box.querySelector('#nclCards').value.split('\n').map(l => l.split('|')).filter(p => p.length >= 2 && p[0].trim() && p[1].trim()).map(p => ({ f: p[0].trim(), b: p.slice(1).join('|').trim() })); if (!cards.length) return toast('Type cards as front | back, one per line.'); const r = await call('classroom_deck_add', { p_class: cls, p_name: box.querySelector('#nclDeckName').value.trim() || 'Deck', p_cards: cards, p_due: box.querySelector('#nclDue')?.value || null }).catch(() => null); if (r?.ok) { toast('Added'); view(cls); } }
    });
    home();
    return { close };
  }
  const api = { open, CSS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NexusClass = api;
})(typeof window !== 'undefined' ? window : globalThis);
