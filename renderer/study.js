// Study panel (v1.6): flashcard decks with spaced repetition, practice quizzes, and "make a deck about…".
// v1.9: Shared Spaces — study groups with friends (the same ones as in N28C on your phone).
//   NexusStudy.mount({ api, personas: () => list, onChange(state) }) → { open(view?), close(), isOpen(), state() }
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GRADES = [['Again', 'again'], ['Hard', 'hard'], ['Good', 'good'], ['Easy', 'easy']];

  function mount({ api, personas = () => [], onChange = () => {} }) {
    let st = { decks: [], stats: {} };
    let view = 'home', deckId = null, session = null, quiz = null, busy = false, spaces = null, spaceId = null, feed = null, spaceTimer = null;
    const body = () => $('stBody');
    const setTitle = (t, back) => { $('stTitle').textContent = t; $('stBack').hidden = !back; };

    async function refresh() { st = await api.study.state(); onChange(st); return st; }
    api.study.onChange(s => { st = s; onChange(s); if (!$('studyModal').hidden && (view === 'home' || view === 'deck')) render(); });

    function open(v = 'home', id = null) { $('studyModal').hidden = false; view = v; deckId = id; refresh().then(render); }
    function close() { $('studyModal').hidden = true; session = null; quiz = null; clearInterval(spaceTimer); }
    $('studyModal').addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === $('studyModal')) close(); });
    $('stBack').addEventListener('click', () => { session = null; quiz = null; clearInterval(spaceTimer); view = view === 'space' || view === 'spaceNew' ? 'spaces' : view === 'review' || view === 'practice' ? (deckId ? 'deck' : 'home') : 'home'; render(); });

    function render() {
      ({ home, make, deck: deckView, review: reviewView, practice: practiceView, spaces: spacesView, space: spaceView, spaceNew: spaceNewView }[view] || home)();
    }

    // ---------- home
    function home() {
      setTitle('📚 Study', false);
      const s = st.stats || {};
      body().innerHTML = `
        <div class="st-stats"><div><b>${s.due || 0}</b><span>due now</span></div><div><b>${s.reviewedToday || 0}</b><span>reviewed today</span></div><div><b>${s.streak || 0}</b><span>day streak</span></div><div><b>${s.cards || 0}</b><span>cards</span></div></div>
        <div class="row st-actions">${s.due ? `<button class="ghost-btn primary" data-a="reviewAll">Review all due (${s.due})</button>` : ''}<button class="ghost-btn" data-a="make">✦ Make a deck about…</button><button class="ghost-btn" data-a="new">New empty deck</button><button class="ghost-btn" data-a="spaces">👥 Shared Spaces</button></div>
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
    // ---------- Shared Spaces
    const ago = ts => { const d = Date.now() - new Date(ts).getTime(); return d < 60e3 ? 'now' : d < 3600e3 ? Math.round(d / 60e3) + 'm' : d < 864e5 ? Math.round(d / 3600e3) + 'h' : new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
    const md = t => window.NexusMarkdown?.render ? window.NexusMarkdown.render(String(t || '')) : esc(t);
    async function spacesView() {
      setTitle('👥 Shared Spaces', true);
      if (!spaces) { body().innerHTML = '<div class="note">Loading…</div>'; spaces = await api.shared.list(); if (view !== 'spaces') return; }
      const r = spaces;
      body().innerHTML = r.ok ? `<div class="note">Study with friends: chat, share decks, see each other's streaks, and ask an agent for the group. The same spaces are in N28C on your phone.</div>
        <div class="row st-actions"><button class="ghost-btn primary" data-a="spNew">＋ New space</button><input id="spCode" placeholder="Invite code" maxlength="6" style="width:120px;flex:none;text-transform:uppercase"><button class="ghost-btn" data-a="spJoin">Join</button><span class="note" id="spNote" style="flex:1"></span></div>
        ${r.spaces.length ? `<div class="st-decks">${r.spaces.map(x => `<div class="st-deck" data-space="${esc(x.id)}"><i style="background:${esc(x.color)}"></i><div class="sd-main"><b>${esc(x.name)}</b><small>Code ${esc(x.code)}${x.owner === r.me ? ' · yours' : ''}</small></div><button class="link-btn" data-a="openSpace" data-id="${esc(x.id)}">Open</button></div>`).join('')}</div>`
          : '<div class="st-empty"><b>No spaces yet.</b><span>Make one and share its 6-letter code, or join a friend\'s.</span></div>'}`
        : `<div class="st-empty"><b>Shared Spaces aren't available.</b><span>${esc(r.error)}</span></div>`;
    }
    function spaceNewView() {
      setTitle('＋ New Shared Space', true);
      body().innerHTML = `<input id="spName" placeholder="Space name, e.g. Bio study crew" maxlength="40"><input id="spNick" placeholder="Your name in the space" maxlength="24" value="${esc(spaces?.nick || '')}">
        <div class="row"><button class="ghost-btn primary" data-a="spCreate">Create</button><span class="note" id="spNote" style="flex:1"></span></div>`;
      setTimeout(() => $('spName')?.focus(), 30);
    }
    async function openSpace(id) { spaceId = id; feed = null; view = 'space'; render(); clearInterval(spaceTimer); spaceTimer = setInterval(() => { if (view === 'space' && !$('studyModal').hidden) loadFeed(); }, 8000); }
    async function loadFeed() {
      const r = await api.shared.feed(spaceId);
      if (view !== 'space') return;
      const sig = JSON.stringify(r.ok ? [r.posts.map(p => p.id), r.members.map(m => m.streak + '/' + m.reviewed_today)] : r.error);
      if (sig === feed?.sig) return; feed = { ...r, sig }; drawSpace();
    }
    function spaceView() { if (!feed) { setTitle('👥 …', true); body().innerHTML = '<div class="note">Loading…</div>'; return loadFeed(); } drawSpace(); }
    function drawSpace() {
      const r = feed;
      if (!r.ok) { body().innerHTML = `<div class="st-empty"><b>Can't open this space.</b><span>${esc(r.error)}</span></div>`; return; }
      setTitle('👥 ' + r.space.name, true);
      const draft = $('spText')?.value || '', today = new Date().toISOString().slice(0, 10);
      const ps = personas().filter(p => !p.legacy && p.id !== 'paragon');
      body().innerHTML = `<div class="sp-head"><span>Invite code <b class="sp-code">${esc(r.space.code)}</b></span><button class="link-btn" data-a="spCopy">Copy invite</button><button class="link-btn" data-a="spShareDeck">🃏 Share a deck</button><button class="link-btn danger" data-a="spLeave">Leave</button>${r.space.owner === r.me ? '<button class="link-btn danger" data-a="spDelete">Delete</button>' : ''}</div>
        <div class="sp-members">${r.members.sort((a, b) => b.streak - a.streak).map(m => `<span>${m.user_id === r.me ? '⭐ ' : ''}${esc(m.nickname)} <small>🔥 ${m.streak} · ${m.stats_day === today ? m.reviewed_today : 0} today</small></span>`).join('')}</div>
        <div class="sp-feed" id="spFeed">${r.posts.map(p => p.kind === 'join' ? `<div class="sp-join">${esc(p.content)}</div>` : `<div class="sp-post ${p.user_id === r.me ? 'me' : ''} ${p.kind}">
          <div class="sp-by">${p.kind === 'ai' ? `<i style="background:${/^#[0-9a-f]{6}$/i.test(p.data?.color || '') ? p.data.color : 'var(--accent)'}"></i>` : ''}${esc(p.nickname)}<span>${ago(p.created_at)}</span></div>
          ${p.kind === 'deck' ? `<div class="sp-deck">🃏 <b>${esc(p.content)}</b> <small>${(p.data?.cards || []).length} cards</small>${p.user_id === r.me ? '' : `<button class="ghost-btn" data-a="spTake" data-id="${esc(p.id)}">Add to my decks</button>`}</div>`
            : p.kind === 'ai' ? `${p.data?.q ? `<div class="note">↳ ${esc(p.data.q)}</div>` : ''}<div class="sp-md">${md(p.content)}</div>` : `<div class="sp-text">${esc(p.content)}</div>`}</div>`).join('') || '<div class="st-empty"><b>Say hi 👋</b><span>Share the invite code so friends can join.</span></div>'}</div>
        <div id="spPick"></div>
        <textarea id="spText" rows="2" placeholder="Message the space… (⏎ to send)">${esc(draft)}</textarea>
        <div class="row"><button class="ghost-btn primary" data-a="spSend">Send</button><button class="ghost-btn" data-a="spAsk">✨ Ask</button><select id="spAgent" style="flex:none;width:auto">${ps.map(p => `<option value="${esc(p.id)}">${esc(p.name.replace("Nexus '28 ", ''))}</option>`).join('')}</select><span class="note" id="spNote" style="flex:1"></span></div>`;
      const f = $('spFeed'); f.scrollTop = f.scrollHeight;
    }
    const spNote = (t, ok) => { const n = $('spNote'); if (n) { n.className = 'note ' + (ok ? 'ok' : 'err'); n.textContent = t; } };
    async function spaceAction(a, b) {
      if (a === 'spaces') { spaces = null; view = 'spaces'; return render(); }
      if (a === 'spNew') { view = 'spaceNew'; return render(); }
      if (a === 'spCreate') { const name = $('spName').value.trim(); if (!name) return spNote('Give it a name.'); const r = await api.shared.create({ name, nick: $('spNick').value.trim() }); if (!r.ok) return spNote(r.error); spaces = null; return openSpace(r.space.id); }
      if (a === 'spJoin') { const code = $('spCode').value.trim(); if (!code) return spNote('Type the invite code.'); const r = await api.shared.join({ code }); if (!r.ok) return spNote(r.error); spaces = null; return openSpace(r.space.id); }
      if (a === 'openSpace') return openSpace(b.dataset.id);
      if (a === 'spCopy') { navigator.clipboard.writeText(`Join my Nexus Shared Space "${feed.space.name}": open N28C or Nexus '28 → Study → Shared Spaces → Join, code ${feed.space.code}`).catch(() => {}); b.textContent = 'Copied ✓'; return; }
      if (a === 'spSend' || a === 'spAsk') {
        const text = $('spText').value.trim(); if (!text) return spNote('Write something first.');
        b.disabled = true; if (a === 'spAsk') { b.textContent = 'Thinking…'; }
        $('spText').value = '';
        const r = a === 'spSend' ? await api.shared.post(spaceId, text) : (setTimeout(loadFeed, 800), await api.shared.ask(spaceId, text, $('spAgent').value));
        b.disabled = false; b.textContent = a === 'spAsk' ? '✨ Ask' : 'Send';
        if (!r.ok) { $('spText').value = text; return spNote(r.error); }
        return loadFeed();
      }
      if (a === 'spShareDeck') {
        if (!st.decks.length) return spNote('You have no decks yet.');
        $('spPick').innerHTML = `<div class="row">${st.decks.map(d => `<button class="ghost-btn" data-a="spShareThis" data-id="${esc(d.id)}">${esc(d.name)} (${d.total})</button>`).join('')}</div>`; return;
      }
      if (a === 'spShareThis') { $('spPick').innerHTML = ''; const r = await api.shared.shareDeck(spaceId, b.dataset.id); if (!r.ok) return spNote(r.error); return loadFeed(); }
      if (a === 'spTake') { b.disabled = true; b.textContent = 'Adding…'; const r = await api.shared.takeDeck(spaceId, b.dataset.id); b.textContent = r.ok ? `✓ Added ${r.added}` : 'Try again'; if (!r.ok) { b.disabled = false; spNote(r.error); } else refresh(); return; }
      if (a === 'spLeave') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Leave this space?'; return; } await api.shared.leave(spaceId); spaces = null; view = 'spaces'; return render(); }
      if (a === 'spDelete') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Delete for everyone?'; return; } const r = await api.shared.remove(spaceId); if (!r.ok) return spNote(r.error); spaces = null; view = 'spaces'; return render(); }
    }
    api.shared?.onChange?.(id => { if (view === 'space' && id === spaceId && !$('studyModal').hidden) loadFeed(); });
    function openSpaceFromOutside(id) { $('studyModal').hidden = false; refresh(); openSpace(id); }

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
      if (!b && deckEl?.dataset.space) return openSpace(deckEl.dataset.space);
      if (!b && deckEl) { deckId = deckEl.dataset.deck; view = 'deck'; return render(); }
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'spaces' || a.startsWith('sp') || a === 'openSpace') return spaceAction(a, b);
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
    body().addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'spText') { e.preventDefault(); body().querySelector('[data-a="spSend"]')?.click(); } if (e.key === 'Enter' && e.target.id === 'spCode') body().querySelector('[data-a="spJoin"]')?.click(); });
    body().addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'stFront' || e.target.id === 'stBackIn')) body().querySelector('[data-a="addCard"]')?.click(); if (e.key === 'Enter' && e.target.id === 'stTopic' && !e.shiftKey) { e.preventDefault(); body().querySelector('[data-a="doMake"]')?.click(); } });
    document.addEventListener('keydown', e => {
      if ($('studyModal').hidden || view !== 'review' || !session || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === ' ' && !session.shown) { e.preventDefault(); session.shown = true; render(); }
      else if (session.shown && /^[1-4]$/.test(e.key)) { e.preventDefault(); grade(+e.key - 1); }
    });

    refresh();
    return { open: (v, id) => v === 'space' && id ? openSpaceFromOutside(id) : v === 'spaces' ? (open('home'), spaces = null, view = 'spaces', render()) : open(v, id), close, isOpen: () => !$('studyModal').hidden, state: () => st, refresh };
  }
  window.NexusStudy = { mount };
})();
