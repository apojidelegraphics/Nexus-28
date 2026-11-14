// Study panel (v1.6): flashcard decks with spaced repetition, practice quizzes, and "make a deck about…".
//   NexusStudy.mount({ api, personas: () => list, onChange(state) }) → { open(view?), close(), isOpen(), state() }
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GRADES = [['Again', 'again'], ['Hard', 'hard'], ['Good', 'good'], ['Easy', 'easy']];

  function mount({ api, personas = () => [], onChange = () => {} }) {
    let st = { decks: [], stats: {} };
    let view = 'home', deckId = null, session = null, quiz = null, busy = false;
    const body = () => $('stBody');
    const setTitle = (t, back) => { $('stTitle').textContent = t; $('stBack').hidden = !back; };

    async function refresh() { st = await api.study.state(); onChange(st); return st; }
    api.study.onChange(s => { st = s; onChange(s); if (!$('studyModal').hidden && (view === 'home' || view === 'deck')) render(); });

    function open(v = 'home', id = null) { $('studyModal').hidden = false; view = v; deckId = id; refresh().then(render); }
    function close() { $('studyModal').hidden = true; session = null; quiz = null; }
    $('studyModal').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === $('studyModal')) close(); });
    $('stBack').addEventListener('click', () => { session = null; quiz = null; view = view === 'review' || view === 'practice' ? (deckId ? 'deck' : 'home') : 'home'; render(); });

    function render() {
      ({ home, make, deck: deckView, review: reviewView, practice: practiceView }[view] || home)();
    }

    // ---------- home
    function home() {
      setTitle('📚 Study', false);
      const s = st.stats || {};
      body().innerHTML = `
        <div class="st-stats"><div><b>${s.due || 0}</b><span>due now</span></div><div><b>${s.reviewedToday || 0}</b><span>reviewed today</span></div><div><b>${s.streak || 0}</b><span>day streak</span></div><div><b>${s.cards || 0}</b><span>cards</span></div></div>
        <div class="row st-actions">${s.due ? `<button class="ghost-btn primary" data-a="reviewAll">Review all due (${s.due})</button>` : ''}<button class="ghost-btn" data-a="make">✦ Make a deck about…</button><button class="ghost-btn" data-a="new">New empty deck</button></div>
        ${st.decks.length ? `<div class="st-decks">${st.decks.map(d => `<div class="st-deck" data-deck="${esc(d.id)}"><i style="background:${esc(d.color)}"></i>
          <div class="sd-main"><b>${esc(d.name)}</b><small>${d.total} cards · ${d.mastered} mastered${d.fresh ? ` · ${d.fresh} new` : ''}</small><div class="sd-bar"><span style="width:${d.total ? Math.round(d.mastered / d.total * 100) : 0}%"></span></div></div>
          ${d.due ? `<span class="sd-due">${d.due} due</span>` : '<span class="sd-ok">✓ all caught up</span>'}
          <button class="link-btn" data-a="review" data-id="${esc(d.id)}" ${d.due ? '' : 'disabled'}>Review</button><button class="link-btn" data-a="practice" data-id="${esc(d.id)}" ${d.total >= 4 ? '' : 'disabled'}>Quiz</button></div>`).join('')}</div>`
          : `<div class="st-empty"><b>No decks yet.</b><span>Make one about any topic above, tap <b>Save to deck</b> on @Magyk flashcards, or save the questions you miss on a @StudyMode quiz. Nexus schedules each card so you see it right before you'd forget it.</span></div>`}`;
    }
    // ---------- make a deck with an agent
    function make() {
      setTitle('✦ Make a deck', true);
      const ps = personas().filter(p => !p.legacy && p.id !== 'paragon');
      body().innerHTML = `<div class="note">An agent writes the cards; you can edit them after. Doesn't use tools.</div>
        <textarea id="stTopic" rows="2" placeholder="e.g. AP Bio chapter 7: cellular respiration · Spanish -ar verbs in the present tense · The causes of World War I"></textarea>
        <div class="row"><span class="note" style="flex:none">Cards</span><select id="stCount">${[8, 12, 20, 30].map(n => `<option ${n === 12 ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <span class="note" style="flex:none">Written by</span><select id="stAgent">${ps.map(p => `<option value="${esc(p.id)}" ${p.id === 'neodela' ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <span class="note" id="stMakeNote" style="flex:1"></span><button class="ghost-btn primary" data-a="doMake">Make deck</button></div>`;
      setTimeout(() => $('stTopic')?.focus(), 30);
    }
    // ---------- one deck
    async function deckView() {
      const d = st.decks.find(x => x.id === deckId);
      if (!d) { view = 'home'; return home(); }
      setTitle(d.name, true);
      const cards = await api.study.cards(deckId);
      const dueIn = c => { const t = (c.due || 0) - Date.now(); if (t <= 0) return 'due'; const days = t / 864e5; return days < 1 ? 'today' : days < 2 ? 'tomorrow' : `in ${Math.round(days)} d`; };
      body().innerHTML = `
        <div class="row st-actions"><button class="ghost-btn primary" data-a="review" data-id="${esc(d.id)}" ${d.due ? '' : 'disabled'}>Review ${d.due ? `(${d.due})` : '— all caught up'}</button><button class="ghost-btn" data-a="practice" data-id="${esc(d.id)}" ${d.total >= 4 ? '' : 'disabled'}>Practice quiz</button>
          <input id="stRename" value="${esc(d.name)}" title="Rename"><button class="link-btn danger" data-a="delDeck" data-id="${esc(d.id)}">Delete deck</button></div>
        <div class="st-add"><input id="stFront" placeholder="Front (question or term)"><input id="stBackIn" placeholder="Back (answer)"><button class="ghost-btn" data-a="addCard">Add</button></div>
        <div class="st-cards">${cards.map(c => `<div class="st-card"><b>${esc(c.front)}</b><span>${esc(c.back)}</span><small class="${dueIn(c) === 'due' ? 'due' : ''}">${dueIn(c)}${c.lapses ? ` · missed ${c.lapses}×` : ''}</small><button class="link-btn danger" data-a="delCard" data-id="${esc(c.id)}" title="Delete card">×</button></div>`).join('') || '<div class="note">No cards yet. Add some above.</div>'}</div>`;
    }
    // ---------- review session
    async function startReview(id) {
      deckId = id || null;
      const q = await api.study.queue(deckId);
      if (!q.length) { view = deckId ? 'deck' : 'home'; return render(); }
      session = { q, i: 0, shown: false, done: 0, right: 0 };
      document.activeElement?.blur?.();   // so Space / 1–4 go to the cards, not the chat box
      view = 'review'; render();
    }
    function reviewView() {
      const s = session; if (!s) return home();
      const d = st.decks.find(x => x.id === deckId);
      setTitle(d ? `Review · ${d.name}` : 'Review all due', true);
      if (s.i >= s.q.length) {
        body().innerHTML = `<div class="st-done"><b>🎉 Session done</b><span>${s.done} card${s.done === 1 ? '' : 's'} reviewed · ${s.right} remembered</span>
          <div class="row"><button class="ghost-btn" data-a="home">Back to decks</button>${deckId && (st.decks.find(x => x.id === deckId)?.total || 0) >= 4 ? `<button class="ghost-btn" data-a="practice" data-id="${esc(deckId)}">Practice quiz</button>` : ''}</div></div>`;
        return;
      }
      const c = s.q[s.i];
      body().innerHTML = `<div class="st-prog"><span style="width:${Math.round(s.i / s.q.length * 100)}%"></span></div><div class="st-count">${s.i + 1} / ${s.q.length}${!c.reps && !c.lapses ? ' · <em>new</em>' : ''}</div>
        <div class="st-flash ${s.shown ? 'shown' : ''}"><div class="sf-front">${esc(c.front)}</div>${s.shown ? `<div class="sf-back">${esc(c.back)}</div>` : ''}</div>
        ${s.shown ? `<div class="st-grades">${GRADES.map(([l, k], g) => `<button class="sg-${k}" data-g="${g}"><b>${l}</b><small>${esc(c.preview?.[g] || '')}</small><kbd>${g + 1}</kbd></button>`).join('')}</div>`
          : `<div class="st-grades"><button class="sg-show" data-a="show"><b>Show answer</b><kbd>space</kbd></button></div>`}`;
    }
    async function grade(g) {
      const s = session; if (!s || !s.shown || busy) return;
      busy = true;
      const c = s.q[s.i];
      await api.study.review(c.id, g);
      s.done++; if (g >= 2) s.right++;
      if (g === 0) s.q.push({ ...c, reps: 0, preview: ['10 min', '1 d', '1 d', '4 d'] }); // see it again this session
      s.i++; s.shown = false; busy = false;
      render();
    }
    // ---------- practice quiz (local, multiple choice)
    async function startPractice(id) {
      deckId = id;
      const r = await api.study.practice(id);
      if (!r.ok) { alertNote(r.error); return; }
      quiz = { qs: r.questions, answers: {} };
      view = 'practice'; render();
    }
    function practiceView() {
      const d = st.decks.find(x => x.id === deckId);
      setTitle(`Quiz · ${d?.name || ''}`, true);
      const qz = quiz; if (!qz) return home();
      const done = Object.keys(qz.answers).length, right = qz.qs.filter((q, i) => qz.answers[i] === q.answer).length;
      body().innerHTML = `<div class="st-count">${done ? `${right} / ${done} right` : `${qz.qs.length} questions`}${done === qz.qs.length ? (right === qz.qs.length ? ' · Perfect!' : ' · missed ones are due again soon') : ''}</div>` +
        qz.qs.map((q, i) => `<div class="qz-q"><b>${i + 1}. ${esc(q.q)}</b><div class="qz-c">${q.choices.map((c, j) => { const a = qz.answers[i]; const cls = a === undefined ? '' : j === q.answer ? 'right' : j === a ? 'wrong' : 'dim';
          return `<button data-pq="${i}" data-pc="${j}" class="${cls}" ${a !== undefined ? 'disabled' : ''}>${esc(c)}</button>`; }).join('')}</div></div>`).join('') +
        (done === qz.qs.length ? '<div class="row"><button class="ghost-btn" data-a="practice" data-id="' + esc(deckId) + '">New quiz</button><button class="ghost-btn" data-a="home">Back to decks</button></div>' : '');
    }
    function alertNote(t) { const n = document.createElement('div'); n.className = 'note err'; n.textContent = t; body().prepend(n); setTimeout(() => n.remove(), 4000); }

    body().addEventListener('click', async e => {
      const g = e.target.closest('[data-g]'); if (g) return grade(+g.dataset.g);
      const pq = e.target.closest('[data-pq]');
      if (pq && quiz) {
        const i = +pq.dataset.pq, j = +pq.dataset.pc, q = quiz.qs[i];
        quiz.answers[i] = j;
        if (j !== q.answer) api.study.review(q.cardId, 0); // missing it in a quiz brings the card back soon
        return render();
      }
      const deckEl = e.target.closest('.st-deck');
      const b = e.target.closest('[data-a]');
      if (!b && deckEl) { deckId = deckEl.dataset.deck; view = 'deck'; return render(); }
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'home') { session = null; quiz = null; view = 'home'; return render(); }
      if (a === 'make') { view = 'make'; return render(); }
      if (a === 'new') { const r = await api.study.createDeck('New deck'); if (r.ok) { deckId = r.deck.id; await refresh(); view = 'deck'; render(); setTimeout(() => $('stRename')?.select(), 50); } return; }
      if (a === 'reviewAll') return startReview(null);
      if (a === 'review') return startReview(b.dataset.id);
      if (a === 'practice') return startPractice(b.dataset.id);
      if (a === 'show') { session.shown = true; return render(); }
      if (a === 'doMake') {
        const topic = $('stTopic').value.trim();
        if (topic.length < 3) { $('stMakeNote').className = 'note err'; $('stMakeNote').textContent = 'What should it be about?'; return; }
        b.disabled = true; b.textContent = 'Writing cards…'; $('stMakeNote').className = 'note'; $('stMakeNote').textContent = '';
        const r = await api.study.makeDeck({ topic, count: +$('stCount').value, agent: $('stAgent').value });
        b.disabled = false; b.textContent = 'Make deck';
        if (!r.ok) { $('stMakeNote').className = 'note err'; $('stMakeNote').textContent = r.error; return; }
        deckId = r.deck.id; await refresh(); view = 'deck'; return render();
      }
      if (a === 'addCard') {
        const f = $('stFront').value.trim(), k = $('stBackIn').value.trim(); if (!f || !k) return;
        await api.study.addCards(deckId, [{ front: f, back: k }]); await refresh(); render(); setTimeout(() => $('stFront')?.focus(), 30); return;
      }
      if (a === 'delCard') { await api.study.removeCard(b.dataset.id); await refresh(); return render(); }
      if (a === 'delDeck') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Delete all cards?'; return; } await api.study.removeDeck(b.dataset.id); await refresh(); view = 'home'; return render(); }
    });
    body().addEventListener('change', async e => { if (e.target.id === 'stRename' && e.target.value.trim()) { await api.study.renameDeck(deckId, e.target.value.trim()); await refresh(); setTitle(e.target.value.trim(), true); } });
    body().addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'stFront' || e.target.id === 'stBackIn')) body().querySelector('[data-a="addCard"]')?.click(); if (e.key === 'Enter' && e.target.id === 'stTopic' && !e.shiftKey) { e.preventDefault(); body().querySelector('[data-a="doMake"]')?.click(); } });
    document.addEventListener('keydown', e => {
      if ($('studyModal').hidden || view !== 'review' || !session || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === ' ' && !session.shown) { e.preventDefault(); session.shown = true; render(); }
      else if (session.shown && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(+e.key - 1); }
    });

    refresh();
    return { open, close, isOpen: () => !$('studyModal').hidden, state: () => st, refresh };
  }
  window.NexusStudy = { mount };
})();
