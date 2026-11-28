window.nxCopy = window.nxCopy || (t => Promise.resolve(window.nexus?.copyText ? window.nexus.copyText(t) : navigator.clipboard.writeText(t)));   // 3.13: copy that works in the app (and in N28C)
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
    $('stBack').addEventListener('click', () => { session = null; quiz = null; clearInterval(spaceTimer); view = view === 'live' ? 'space' : view === 'space' || view === 'spaceNew' ? 'spaces' : view === 'review' || view === 'practice' ? (deckId ? 'deck' : 'home') : 'home'; render(); });

    function render() {
      ({ home, make, deck: deckView, review: reviewView, practice: practiceView, spaces: spacesView, space: spaceView, spaceNew: spaceNewView, live: liveView }[view] || home)();
    }

    // ---------- home
    function home() {
      setTitle('📚 Study', false);
      const s = st.stats || {};
      body().innerHTML = `
        <div class="st-stats"><div><b>${s.due || 0}</b><span>due now</span></div><div><b>${s.reviewedToday || 0}</b><span>reviewed today</span></div><div><b>${s.streak || 0}</b><span>day streak</span></div><div><b>${s.cards || 0}</b><span>cards</span></div></div>
        <div class="row st-actions">${s.due ? `<button class="ghost-btn primary" data-a="reviewAll">Review all due (${s.due})</button>` : ''}${st.decks.some(d => d.total) ? `<button class="ghost-btn" data-a="burst" title="5 cards, 2 minutes">⚡ 2-min burst</button>` : ''}<button class="ghost-btn" data-a="make">✦ Make a deck about…</button><button class="ghost-btn" data-a="new">New empty deck</button><button class="ghost-btn" data-a="spaces">👥 Shared Spaces</button></div>
        <div id="stPlan"></div>
        ${st.decks.length ? `<div class="st-decks">${st.decks.map(d => `<div class="st-deck" data-deck="${esc(d.id)}"><i style="background:${esc(d.color)}"></i>
          <div class="sd-main"><b>${esc(d.name)}</b><small>${d.total} cards · ${d.mastered} mastered${d.fresh ? ` · ${d.fresh} new` : ''}</small><div class="sd-bar"><span style="width:${d.total ? Math.round(d.mastered / d.total * 100) : 0}%"></span></div></div>
          ${d.due ? `<span class="sd-due">${d.due} due</span>` : '<span class="sd-ok">✓ all caught up</span>'}
          <button class="link-btn" data-a="review" data-id="${esc(d.id)}" ${d.due ? '' : 'disabled'}>Review</button><button class="link-btn" data-a="practice" data-id="${esc(d.id)}" ${d.total >= 4 ? '' : 'disabled'}>Quiz</button></div>`).join('')}</div>`
          : `<div class="st-empty"><b>No decks yet.</b><span>Make one about any topic above, tap <b>Save to deck</b> on @Magyk flashcards, or save the questions you miss on a @StudyMode quiz. Nexus schedules each card so you see it right before you'd forget it.</span></div>`}`;
      paintPlan();
    }
    // ---------- Study plan (v2.1): test dates, cram plans, study slots from your calendar
    async function paintPlan() {
      const box = $('stPlan'); if (!box || !api.studyPlan) return;
      const p = await api.studyPlan.get();
      const t = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const upcoming = p.slots.filter(x => x > Date.now() - 15 * 60e3);
      box.innerHTML = `<div class="st-plan"><div class="sp-row"><b>📅 Study plan</b><label class="check" style="margin-left:auto"><input type="checkbox" id="stSlots" ${p.enabled ? 'checked' : ''}> Remind me in free time</label></div>
        ${p.plans.length ? p.plans.map(x => `<div class="sp-deck"><i style="background:${esc(x.color || 'var(--accent)')}"></i><b>${esc(x.name)}</b><span class="sp-days ${x.daysLeft <= 3 ? 'soon' : ''}">${x.daysLeft < 0 ? 'past' : x.daysLeft === 0 ? 'TEST TODAY' : x.daysLeft === 1 ? 'tomorrow' : x.daysLeft + ' days'}</span><small>${esc(x.tip)}</small><button class="link-btn" data-a="cram" data-id="${esc(x.deckId)}">${x.daysLeft <= 1 ? '⚡ Cram now' : 'Review'}</button></div>`).join('')
          : '<div class="note">Got a test coming up? Open a deck and set its test date for a day-by-day plan.</div>'}
        ${p.enabled ? `<div class="note">${upcoming.length ? `Today's study slots${p.fromCalendar ? ' (free time on your calendar)' : ''}: <b>${upcoming.map(t).join(' · ')}</b>` : 'No more study slots today.'}${!p.calendarOn ? ' Turn on Apple Calendar (Settings → Connectors) to fit them around your day.' : ''}</div>` : ''}</div>`;
    }
    // ---------- make a deck with an agent
    function make() {
      setTitle('✦ Make a deck', true);
      const ps = personas().filter(p => !p.legacy && p.id !== 'paragon' && p.id !== 'solis');
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
          <input id="stRename" value="${esc(d.name)}" title="Rename"><label class="note" style="flex:none" title="Test date: Nexus makes a cram plan and finds study time">📅 Test <input type="date" id="stTest" value="${esc(d.testDate || '')}" style="width:auto"></label><button class="link-btn danger" data-a="delDeck" data-id="${esc(d.id)}">Delete deck</button></div>
        <div class="st-add"><input id="stFront" placeholder="Front (question or term)"><input id="stBackIn" placeholder="Back (answer)"><button class="ghost-btn" data-a="addCard">Add</button></div>
        <div class="st-cards">${cards.map(c => `<div class="st-card"><b>${esc(c.front)}</b><span>${esc(c.back)}</span><small class="${dueIn(c) === 'due' ? 'due' : ''}">${dueIn(c)}${c.lapses ? ` · missed ${c.lapses}×` : ''}</small><button class="link-btn danger" data-a="delCard" data-id="${esc(c.id)}" title="Delete card">×</button></div>`).join('') || '<div class="note">No cards yet. Add some above.</div>'}</div>`;
    }
    // ---------- review session
    // v2.4 Study in short bursts: 5 cards, 2 minutes (due ones first, else the ones you know least)
    let burstTimer = null;
    async function startBurst() {
      let q = await api.study.queue(null);
      if (q.length < 5) { const all = []; for (const d of st.decks) all.push(...((await api.study.cards?.(d.id)) || [])); q = [...q, ...all.filter(c => !q.some(x => x.id === c.id)).sort((a, b) => (a.interval || 0) - (b.interval || 0))]; }
      q = q.slice(0, 5); if (!q.length) return;
      deckId = null; session = { q, i: 0, shown: false, done: 0, right: 0, burst: true, endsAt: Date.now() + 120e3 };
      clearInterval(burstTimer); burstTimer = setInterval(() => { if (!session?.burst || view !== 'review') return clearInterval(burstTimer); if (Date.now() >= session.endsAt) { session.i = session.q.length; clearInterval(burstTimer); } render(); }, 1000);
      document.activeElement?.blur?.(); view = 'review'; render();
    }
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
      setTitle(s.burst ? '⚡ Burst' : d ? `Review · ${d.name}` : 'Review all due', true);
      if (s.i >= s.q.length) {
        body().innerHTML = `<div class="st-done"><b>${s.burst ? '⚡ Burst done' : '🎉 Session done'}</b><span>${s.done} card${s.done === 1 ? '' : 's'} reviewed · ${s.right} remembered</span>
          <div class="row"><button class="ghost-btn" data-a="home">Back to decks</button>${deckId && (st.decks.find(x => x.id === deckId)?.total || 0) >= 4 ? `<button class="ghost-btn" data-a="practice" data-id="${esc(deckId)}">Practice quiz</button>` : ''}</div></div>`;
        return;
      }
      const c = s.q[s.i];
      const left = s.burst ? Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000)) : 0;
      body().innerHTML = `<div class="st-prog"><span style="width:${Math.round(s.i / s.q.length * 100)}%"></span></div><div class="st-count">${s.i + 1} / ${s.q.length}${!c.reps && !c.lapses ? ' · <em>new</em>' : ''}${s.burst ? ` · ⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''}</div>
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
      if (g === 0 && !s.burst) s.q.push({ ...c, reps: 0, preview: ['10 min', '1 d', '1 d', '4 d'] }); // see it again this session
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
        <div class="ask-sp"><b>Ask my Spaces</b><div class="row"><input id="spAsk" maxlength="1000" placeholder="What did my study group decide about the test? What's due this week?"><button class="ghost-btn primary" data-a="spAskGo">Ask</button></div><span class="note" id="spAskNote">Looks through recent posts and chat in every Space you're in. The answer opens as a chat.</span></div>
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
    async function openSpace(id) { spaceId = id; feed = null; view = 'space'; spaceTab = 'feed'; clearInterval(chat.timer); chat = { msgs: [], people: {}, reply: null, last: 0, timer: null }; render(); clearInterval(spaceTimer); spaceTimer = setInterval(() => { if (view === 'space' && !$('studyModal').hidden) loadFeed(); }, 8000); }
    async function loadFeed() {
      const [r, ss, ch] = await Promise.all([api.shared.feed(spaceId), api.shared.sessions?.(spaceId), api.challenges?.list(spaceId)]);
      if (view !== 'space') return;
      if (r.ok) { r.live = (ss?.ok ? ss.sessions : []).filter(x => x.status === 'live' && new Date(x.ends_at) > new Date()); r.challenges = ch?.ok ? ch.challenges : []; }
      const sig = JSON.stringify(r.ok ? [r.posts.map(p => p.id), r.members.map(m => m.streak + '/' + m.reviewed_today), (r.live || []).map(x => x.id), (r.challenges || []).map(c => c.id + ':' + c.total)] : r.error);
      if (sig === feed?.sig) return; feed = { ...r, sig }; drawSpace();
    }
    function spaceView() { if (!feed) { setTitle('👥 …', true); body().innerHTML = '<div class="note">Loading…</div>'; return loadFeed(); } drawSpace(); }
    // 4.0: each Space has three views: Activity (the feed below), Chat (a real chat with replies) and People (profile cards)
    let spaceTab = 'feed', chat = { msgs: [], people: {}, reply: null, last: 0, timer: null };
    const spTabs = () => `<div class="sp-tabs">${[['feed', 'Activity'], ['chat', 'Chat'], ['people', 'People']].map(([k, l]) => `<button class="${spaceTab === k ? 'on' : ''}" data-a="spTab" data-t="${k}">${l}</button>`).join('')}</div>`;
    async function loadPeople() { const r = await api.social?.people(spaceId); if (r?.ok) chat.people = Object.fromEntries((r.list || []).map(p => [p.id, p])); return r; }
    async function loadChat(more) {
      const r = await api.spaceChat.list(spaceId, chat.last && !more ? { after: chat.last } : {});
      if (!r.ok) { chat.error = r.error; return drawChat(); }
      chat.error = ''; chat.me = r.me;
      const fresh = (r.messages || []).filter(m => !chat.msgs.some(x => x.id === m.id));
      if (!chat.last) chat.msgs = r.messages || []; else { chat.msgs.push(...fresh); for (const m of r.messages || []) { const i = chat.msgs.findIndex(x => x.id === m.id); if (i >= 0) chat.msgs[i] = m; } }
      chat.last = Math.max(chat.last, ...chat.msgs.map(m => m.id), 0);
      if (fresh.some(m => !chat.people[m.user_id])) await loadPeople();
      if (!chat.last || fresh.length || !chat.drawn) drawChat();
    }
    function drawChat() {
      if (view !== 'space' || spaceTab !== 'chat') return;
      const NC = window.NexusCosmetics, draft = $('scText')?.value || '', atBottom = !$('scList') || $('scList').scrollHeight - $('scList').scrollTop - $('scList').clientHeight < 60;
      const who = id => chat.people[id] || { username: 'member', nickname: (feed?.members || []).find(m => m.user_id === id)?.nickname || 'Member', style: {} };
      const byId = Object.fromEntries(chat.msgs.map(m => [m.id, m]));
      const ownerId = feed?.space?.owner;
      body().innerHTML = `${spTabs()}${chat.error ? `<div class="st-empty"><b>The Spaces chat isn't ready.</b><span>${esc(chat.error)}</span></div>` : ''}
        <div class="sc-list" id="scList">${chat.msgs.length ? chat.msgs.map((m, i) => { const p = who(m.user_id), prev = chat.msgs[i - 1], grouped = prev && prev.user_id === m.user_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 300e3 && !m.reply_to;
          const rp = m.reply_to && byId[m.reply_to];
          return `<div class="sc-msg ${grouped ? 'g' : ''} ${m.user_id === chat.me ? 'me' : ''} ${m.deleted ? 'del' : ''}" data-mid="${m.id}">
            ${grouped ? '<span class="sc-av"></span>' : `<span class="sc-av" ${p.username ? `data-pview="${esc(p.username)}" title="View profile"` : ''}>${NC ? NC.avatarHtml(p.avatar_url, p.style?.display_name || p.nickname || p.username, p.style?.frame, 30, { custom: p.style?.custom, frameImg: p.style?.frame_img }) : ''}</span>`}
            <div class="sc-main">${grouped ? '' : `<div class="sc-head"><span ${p.username ? `data-pview="${esc(p.username)}" class="sc-name"` : ''}>${NC ? NC.nameHtml(p.style?.display_name || p.nickname || p.username || 'Member', p.style || {}) : esc(p.nickname)}</span>${m.user_id === ownerId ? '<span class="sc-tag">OWNER</span>' : ''}<time>${new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>`}
              ${rp ? `<div class="sc-reply">↳ ${esc((who(rp.user_id).nickname || who(rp.user_id).username || '') + ': ' + String(rp.body).slice(0, 80))}</div>` : ''}
              <div class="sc-body">${esc(m.body)}${m.edited_at && !m.deleted ? ' <small>(edited)</small>' : ''}</div></div>
            ${m.deleted ? '' : `<span class="sc-tools"><button title="Reply" data-a="scReply" data-id="${m.id}">↩</button>${m.user_id === chat.me || ownerId === chat.me ? `<button title="Remove" data-a="scRemove" data-id="${m.id}">✕</button>` : `<button title="Report" data-a="scReport" data-id="${m.id}">⚑</button>`}</span>`}</div>`; }).join('') : '<div class="st-empty"><b>Start the conversation</b><span>Messages here are only seen by the people in this Space.</span></div>'}</div>
        ${chat.reply ? `<div class="sc-replying">Replying to ${esc(who(chat.reply.user_id).nickname || 'a message')}: “${esc(String(chat.reply.body).slice(0, 60))}” <button class="link-btn" data-a="scNoReply">Cancel</button></div>` : ''}
        <div class="sc-compose"><textarea id="scText" rows="1" maxlength="2000" placeholder="Message ${esc(feed?.space?.name || 'the Space')}…">${esc(draft)}</textarea><button class="ghost-btn primary" data-a="scSend">Send</button></div><div class="note" id="spNote"></div>`;
      chat.drawn = true;
      const l = $('scList'); if (l && atBottom) l.scrollTop = l.scrollHeight;
      const t = $('scText'); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); t.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); body().querySelector('[data-a="scSend"]').click(); } }; }
    }
    async function drawPeople() {
      const NC = window.NexusCosmetics, r = await loadPeople(); if (view !== 'space' || spaceTab !== 'people') return;
      body().innerHTML = `${spTabs()}${!r?.ok ? `<div class="st-empty"><b>People needs the 4.0 update.</b><span>${esc(r?.error || '')}</span></div>` : `<div class="sp-people">${Object.values(chat.people).map(p => `<div class="sp-person">${NC ? NC.card(p, { size: 'mini' }) : esc(p.username)}${p.relation === 'friend' ? '<small class="note">Friend</small>' : p.id === chat.me || p.id === feed?.me ? '<small class="note">You</small>' : `<button class="ghost-btn" data-a="spAddFriend" data-u="${esc(p.username)}">Add friend</button>`}</div>`).join('')}</div>`}`;
    }
    function drawSpace() {
      const r = feed;
      if (!r.ok) { body().innerHTML = `<div class="st-empty"><b>Can't open this space.</b><span>${esc(r.error)}</span></div>`; return; }
      setTitle('👥 ' + r.space.name, true);
      if (spaceTab === 'chat') { if (!chat.drawn) drawChat(); return; }
      if (spaceTab === 'people') return;
      const draft = $('spText')?.value || '', today = new Date().toISOString().slice(0, 10);
      const ps = personas().filter(p => !p.legacy && p.id !== 'paragon' && p.id !== 'solis');
      body().innerHTML = `${spTabs()}<div class="sp-head"><span>Invite code <b class="sp-code">${esc(r.space.code)}</b></span><button class="link-btn" data-a="spCopy">Copy invite</button><button class="link-btn" data-a="spShareDeck">🃏 Share a deck</button><button class="link-btn" data-a="spLive">🏁 Live session</button><button class="link-btn danger" data-a="spLeave">Leave</button>${r.space.owner === r.me ? '<button class="link-btn danger" data-a="spDelete">Delete</button>' : ''}</div>
        ${(r.live || []).map(x => `<div class="sp-live"><span>🏁 LIVE</span><b>${esc(x.title)}</b><small>by ${esc(x.host_name)} · ends ${new Date(x.ends_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small><button class="ghost-btn primary" data-a="spJoinLive" data-id="${esc(x.id)}">Join</button></div>`).join('')}
        <div class="sp-members">${r.members.sort((a, b) => b.streak - a.streak).map(m => `<span>${m.user_id === r.me ? '⭐ ' : ''}${esc(m.nickname)}${(r.owners || []).includes(m.user_id) ? ' <span class="crown-tag" title="Owner">👑</span>' : ''} <small>🔥 ${m.streak} · ${m.stats_day === today ? m.reviewed_today : 0} today</small></span>`).join('')}</div>
        ${chalBlock(r.challenges || [])}
        <div class="sp-feed" id="spFeed">${r.posts.map(p => p.kind === 'join' ? `<div class="sp-join">${esc(p.content)}</div>` : `<div class="sp-post ss-post ${p.user_id === r.me ? 'me' : ''} ${p.kind}">
          <div class="sp-by">${p.kind === 'ai' ? `<i style="background:${/^#[0-9a-f]{6}$/i.test(p.data?.color || '') ? p.data.color : 'var(--accent)'}"></i>` : ''}${esc(p.nickname)}${p.kind !== 'ai' && (r.owners || []).includes(p.user_id) ? ' <span class="crown-tag" title="Owner">👑</span>' : ''}<span>${ago(p.created_at)}</span>${p.user_id === r.me ? '' : `<button class="link-btn ss-report" data-a="spReport" data-id="${esc(p.id)}" data-label="${esc(String(p.content).slice(0, 120))}" title="Report this to the Apoji Team">⚑ Report</button>`}</div>
          ${p.kind === 'deck' ? `<div class="sp-deck">🃏 <b>${esc(p.content)}</b> <small>${(p.data?.cards || []).length} cards</small>${p.user_id === r.me ? '' : `<button class="ghost-btn" data-a="spTake" data-id="${esc(p.id)}">Add to my decks</button>`}</div>`
            : p.kind === 'ai' ? `${p.data?.q ? `<div class="note">↳ ${esc(p.data.q)}</div>` : ''}<div class="sp-md">${md(p.content)}</div>` : `<div class="sp-text">${esc(p.content)}</div>`}</div>`).join('') || '<div class="st-empty"><b>Say hi 👋</b><span>Share the invite code so friends can join.</span></div>'}</div>
        <div id="spPick"></div>
        <textarea id="spText" rows="2" placeholder="Message the space… (⏎ to send)">${esc(draft)}</textarea>
        <div class="row"><button class="ghost-btn primary" data-a="spSend">Send</button><button class="ghost-btn" data-a="spAsk">✨ Ask</button><select id="spAgent" style="flex:none;width:auto">${ps.map(p => `<option value="${esc(p.id)}">${esc(p.name.replace("Nexus '28 ", ''))}</option>`).join('')}</select><span class="note" id="spNote" style="flex:1"></span></div>`;
      const f = $('spFeed'); f.scrollTop = f.scrollHeight;
    }
    // v2.7 group challenges: the whole space works toward one goal this week
    const CH = { cards: ['🃏', 'cards reviewed'], days: ['📅', 'study days'], focus: ['◷', 'focus minutes'] };
    function chalBlock(list) {
      const live = list.filter(c => new Date(c.ends_at) > Date.now()), past = list.filter(c => new Date(c.ends_at) <= Date.now()).slice(0, 2);
      const card = c => { const pct = Math.min(100, Math.round(c.total / c.goal * 100)), done = c.total >= c.goal, left = Math.max(0, Math.ceil((new Date(c.ends_at) - Date.now()) / 864e5));
        return `<div class="sp-chal ${done ? 'done' : ''} ${new Date(c.ends_at) <= Date.now() ? 'over' : ''}"><div class="row"><b style="flex:1">${CH[c.kind][0]} ${esc(c.title || `${c.goal} ${CH[c.kind][1]}`)}</b><small>${done ? '🏆 Done!' : new Date(c.ends_at) <= Date.now() ? 'Ended' : left + ' day' + (left === 1 ? '' : 's') + ' left'}</small>${c.mine ? `<button class="link-btn" data-a="spChalRm" data-id="${esc(c.id)}" title="Remove">✕</button>` : ''}</div>
          <div class="chal-bar"><span style="width:${pct}%"></span></div><small class="note">${c.total} of ${c.goal} ${CH[c.kind][1]} · ${pct}%</small>
          ${c.board.length ? `<div class="chal-board">${c.board.slice(0, 6).map((m, i) => `<span class="${m.me ? 'me' : ''}">${['🥇', '🥈', '🥉'][i] || '·'} ${esc(m.nickname)} <b>${m.amount}</b></span>`).join('')}</div>` : '<small class="note">Nobody has started yet. Be first.</small>'}</div>`; };
      return `<div class="sp-chals">${live.map(card).join('')}${past.map(card).join('')}
        ${live.length < 3 ? `<details class="chal-new"><summary>🏁 Start a group challenge</summary><div class="row"><select id="chKind" style="flex:none;width:auto"><option value="cards">🃏 Review cards</option><option value="days">📅 Study days (each)</option><option value="focus">◷ Focus minutes</option></select>
          <input id="chGoal" type="number" min="1" value="300" style="width:90px"><select id="chDays" style="flex:none;width:auto"><option value="3">in 3 days</option><option value="7" selected>this week</option><option value="14">in 2 weeks</option></select><input id="chTitle" placeholder="Name (optional)"><button class="ghost-btn primary" data-a="spChalNew">Start</button></div>
          <div class="note">Everyone's reviews and focus time (on the Mac or N28C) count automatically.</div></details>` : ''}</div>`;
    }
    const spNote = (t, ok) => { const n = $('spNote'); if (n) { n.className = 'note ' + (ok ? 'ok' : 'err'); n.textContent = t; } };
    async function spaceAction(a, b) {
      if (a === 'spaces') { spaces = null; view = 'spaces'; return render(); }
      if (a === 'spNew') { view = 'spaceNew'; return render(); }
      if (a === 'spTab') { spaceTab = b.dataset.t; clearInterval(chat.timer); chat.drawn = false;
        if (spaceTab === 'chat') { body().innerHTML = spTabs() + '<div class="note">Loading the chat…</div>'; await loadPeople(); await loadChat(); chat.timer = setInterval(() => { if (view === 'space' && spaceTab === 'chat' && !$('studyModal').hidden) loadChat().catch(() => {}); }, 4000); return; }
        if (spaceTab === 'people') { body().innerHTML = spTabs() + '<div class="note">Loading…</div>'; return drawPeople(); }
        return drawSpace(); }
      if (a === 'scSend') { const t = $('scText'), v = t.value.trim(); if (!v) return; t.value = ''; const r = await api.spaceChat.send(spaceId, v, chat.reply?.id); chat.reply = null; if (!r.ok) { t.value = v; return spNote(r.error); } chat.drawn = false; return loadChat(); }
      if (a === 'scReply') { chat.reply = chat.msgs.find(m => m.id === +b.dataset.id) || null; return drawChat(); }
      if (a === 'scNoReply') { chat.reply = null; return drawChat(); }
      if (a === 'scRemove') { if (!confirm('Remove this message for everyone?')) return; const r = await api.spaceChat.remove(+b.dataset.id); if (!r.ok) return spNote(r.error); const m = chat.msgs.find(x => x.id === +b.dataset.id); if (m) { m.deleted = true; m.body = '(removed)'; } return drawChat(); }
      if (a === 'scReport') { const m = chat.msgs.find(x => x.id === +b.dataset.id); if (!m || !confirm('Report this message to the Apoji Team?')) return; const r = await api.social.report({ kind: 'space_message', target: String(m.id), label: String(m.body).slice(0, 180), reason: 'inappropriate' }); return spNote(r.ok ? 'Reported. Thanks.' : r.error); }
      if (a === 'spAddFriend') { const r = await api.social.request(b.dataset.u); b.textContent = r.ok ? 'Request sent' : 'Couldn’t send'; b.disabled = true; return; }
      if (a === 'spCreate') { const name = $('spName').value.trim(); if (!name) return spNote('Give it a name.'); const r = await api.shared.create({ name, nick: $('spNick').value.trim() }); if (!r.ok) return spNote(r.error); spaces = null; return openSpace(r.space.id); }
      if (a === 'spAskGo') { const q = $('spAsk').value.trim(); if (q.length < 3) return; b.disabled = true; $('spAskNote').textContent = 'Reading your Spaces…'; const r = await api.spaces.ask(q); b.disabled = false; if (!r.ok) { $('spAskNote').textContent = r.error; return; } $('spAskNote').textContent = `Answered from ${r.spaces} Space${r.spaces === 1 ? '' : 's'}.`; return; }
      if (a === 'spJoin') { const code = $('spCode').value.trim(); if (!code) return spNote('Type the invite code.'); const r = await api.shared.join({ code }); if (!r.ok) return spNote(r.error); spaces = null; return openSpace(r.space.id); }
      if (a === 'openSpace') return openSpace(b.dataset.id);
      if (a === 'spChalNew') { const r = await api.challenges.create({ spaceId, kind: $('chKind').value, goal: +$('chGoal').value, days: +$('chDays').value, title: $('chTitle').value.trim() }); if (!r.ok) return spNote(r.error); feed = null; return loadFeed(); }
      if (a === 'spChalRm') { if (!confirm('Remove this challenge for everyone?')) return; await api.challenges.remove(b.dataset.id); feed = null; return loadFeed(); }
      if (a === 'spCopy') { nxCopy(`Join my Nexus Shared Space "${feed.space.name}": open N28C or Nexus '28 → Study → Shared Spaces → Join, code ${feed.space.code}`).catch(() => {}); b.textContent = 'Copied ✓'; return; }
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
      if (a === 'spLive') {
        if (!st.decks.length) return spNote('Make a deck first.');
        $('spPick').innerHTML = `<div class="note">Everyone answers the same quiz from a deck, with a live leaderboard. Pick a deck:</div><div class="row">${st.decks.filter(d => d.total >= 3).map(d => `<button class="ghost-btn" data-a="spLiveGo" data-id="${esc(d.id)}">${esc(d.name)} (${d.total})</button>`).join('') || '<span class="note">Decks need 3+ cards.</span>'}</div>`; return;
      }
      if (a === 'spLiveGo') { $('spPick').innerHTML = ''; const r = await api.shared.sessionStart(spaceId, b.dataset.id, 15); if (!r.ok) return spNote(r.error); return openLive(r.session.id); }
      if (a === 'spJoinLive') return openLive(b.dataset.id);
      if (a === 'spLiveAns') return liveAnswer(+b.dataset.i);
      if (a === 'spLiveEnd') { await api.shared.sessionEnd(live.id); return liveLoad(); }
      if (a === 'spShareThis') { $('spPick').innerHTML = ''; const r = await api.shared.shareDeck(spaceId, b.dataset.id); if (!r.ok) return spNote(r.error); return loadFeed(); }
      if (a === 'spReport') {   // (an inline form: Electron has no window prompts)
        const post = b.closest('.sp-post'); post.querySelector('.ss-form')?.remove();
        post.insertAdjacentHTML('beforeend', `<div class="row ss-form" style="margin-top:6px"><select class="ss-why" style="flex:none;width:auto">${[['spam', 'Spam'], ['harassment', 'Harassment'], ['inappropriate', 'Inappropriate'], ['cheating', 'Cheating'], ['other', 'Something else']].map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><input class="ss-det" placeholder="Details (optional)" style="flex:1"><button class="ghost-btn danger" data-a="spReportGo" data-id="${esc(b.dataset.id)}" data-label="${esc(b.dataset.label)}">Report</button></div>`);
        return;
      }
      if (a === 'spReportGo') {
        const form = b.closest('.ss-form');
        const res = await api.reportContent({ kind: 'post', targetId: b.dataset.id, label: b.dataset.label, reason: form.querySelector('.ss-why').value, details: form.querySelector('.ss-det').value });
        form.remove(); return spNote(res.ok ? '✓ Reported. Thanks, the Apoji Team will take a look.' : res.error, res.ok);
      }
      if (a === 'spTake') { b.disabled = true; b.textContent = 'Adding…'; const r = await api.shared.takeDeck(spaceId, b.dataset.id); b.textContent = r.ok ? `✓ Added ${r.added}` : 'Try again'; if (!r.ok) { b.disabled = false; spNote(r.error); } else refresh(); return; }
      if (a === 'spLeave') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Leave this space?'; return; } await api.shared.leave(spaceId); spaces = null; view = 'spaces'; return render(); }
      if (a === 'spDelete') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Delete for everyone?'; return; } const r = await api.shared.remove(spaceId); if (!r.ok) return spNote(r.error); spaces = null; view = 'spaces'; return render(); }
    }
    api.shared?.onChange?.(id => { if (view === 'space' && id === spaceId && !$('studyModal').hidden) loadFeed(); });
    // ---------- Live study session: same questions for everyone, points for right + fast answers
    let live = null, liveTimer = null;
    async function openLive(sid) { live = { id: sid, i: 0, correct: 0, points: 0, picked: null, shownAt: Date.now(), data: null }; view = 'live'; clearInterval(liveTimer); liveTimer = setInterval(() => { if (view === 'live' && !$('studyModal').hidden) liveLoad(); else clearInterval(liveTimer); }, 2500); await liveLoad(); }
    async function liveLoad() { const r = await api.shared.session(live.id); if (view !== 'live') return; live.data = r; liveView(); }
    function liveView() {
      if (!live?.data) { body().innerHTML = '<div class="note">Loading…</div>'; return; }
      const r = live.data; if (!r.ok) { body().innerHTML = `<div class="st-empty"><b>Can't open this session.</b><span>${esc(r.error)}</span></div>`; return; }
      const s = r.session, qs = s.questions, ended = s.status !== 'live' || new Date(s.ends_at) < new Date(), done = live.i >= qs.length || ended;
      setTitle('🏁 ' + s.title, true);
      const board = `<div class="lv-board"><b>Leaderboard</b>${r.scores.map((x, i) => `<div class="lv-row ${x.user_id === r.me ? 'me' : ''}"><span>${['🥇', '🥈', '🥉'][i] || i + 1}</span><b>${esc(x.nickname)}</b><small>${x.correct}/${x.answered}</small><em>${x.points}</em></div>`).join('') || '<div class="note">No answers yet.</div>'}</div>`;
      if (done) { body().innerHTML = `<div class="st-done"><b>${ended ? 'Session over' : '🎉 You finished!'}</b><span>${live.correct} / ${Math.min(live.i, qs.length)} right · ${live.points} points</span></div>${board}${s.host === r.me && s.status === 'live' ? '<div class="row"><button class="ghost-btn" data-a="spLiveEnd">End session for everyone</button></div>' : ''}`; return; }
      const q = qs[live.i];
      body().innerHTML = `<div class="lv-wrap"><div><div class="st-count">Question ${live.i + 1} / ${qs.length} · ${live.points} points</div><div class="st-flash"><div class="sf-front">${esc(q.q)}</div></div>
        <div class="qz-c">${q.choices.map((c, j) => `<button data-a="spLiveAns" data-i="${j}" class="${live.picked === null ? '' : j === q.answer ? 'right' : j === live.picked ? 'wrong' : 'dim'}" ${live.picked !== null ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div></div>${board}</div>`;
    }
    async function liveAnswer(j) {
      const q = live.data.session.questions[live.i]; if (live.picked !== null) return;
      live.picked = j; const right = j === q.answer, secs = (Date.now() - live.shownAt) / 1000;
      if (right) { live.correct++; live.points += 100 + Math.max(0, Math.round(50 - secs * 5)); }
      liveView();
      await api.shared.sessionScore(live.id, { answered: live.i + 1, correct: live.correct, points: live.points });
      setTimeout(() => { live.i++; live.picked = null; live.shownAt = Date.now(); liveLoad(); }, 1100);
    }
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
      if (a === 'burst') return startBurst();
      if (a === 'cram') { const q = await api.study.cards(b.dataset.id); session = { q: q.sort(() => Math.random() - .5).map(c => ({ ...c, preview: ['10 min', '1 d', '3 d', '6 d'] })), i: 0, shown: false, done: 0, right: 0 }; deckId = b.dataset.id; view = 'review'; return render(); }
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
    body().addEventListener('change', async e => { if (e.target.id === 'stSlots') { await api.studyPlan.slots(e.target.checked); return paintPlan(); } if (e.target.id === 'stTest') { await api.studyPlan.setTestDate(deckId, e.target.value); await refresh(); return; } });
    body().addEventListener('change', async e => { if (e.target.id === 'stRename' && e.target.value.trim()) { await api.study.renameDeck(deckId, e.target.value.trim()); await refresh(); setTitle(e.target.value.trim(), true); } });
    body().addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'spText') { e.preventDefault(); body().querySelector('[data-a="spSend"]')?.click(); } if (e.key === 'Enter' && e.target.id === 'spCode') body().querySelector('[data-a="spJoin"]')?.click(); if (e.key === 'Enter' && e.target.id === 'spAsk') body().querySelector('[data-a="spAskGo"]')?.click(); });
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
