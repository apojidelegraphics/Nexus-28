// Nexus '28 Test Run 4.2.0: the parts that make Test Run feel like the app.
//   Spaces lite · memory you control · @huddle and @debate · study decks (up to three) · profile, Cirkts, daily quests and
//   the shop · "the app can do this" cards · open a chat in the app · a guided first run beside the chat · prompt starters
//   by category · ⌘K / Ctrl+K and shortcuts · voice mode · install as an app (and a Chrome extension) · share a chat as a
//   link · anonymous session replays.
// Built on window.TR from try.js. Your Spaces, memory and decks are saved on your account (try_state), so they follow you
// to any browser and come along when you bring your Test Run chats into the app.
(function () {
  const TR = window.TR; if (!TR) return;
  const { S, sb, $, esc, store, toast, AGENTS } = TR;
  const VERSION = '4.2.0';
  const SB_URL = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co', SB_KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';   // publishable: safe in a web page
  const APP_URL = 'https://github.com/apojidelegraphics/Nexus-28/releases/latest';
  const SHARE_BASE = 'https://apojidelegraphics.github.io/Nexus-28/share/';
  const COLORS = ['#3dffa0', '#5ce1ff', '#ffd36b', '#ff8fd0', '#b69cff', '#ff9f6b', '#9bd65c'];
  const ic = n => window.NexusIcons?.icon?.(n) || '';
  const X = { st: { spaces: [], chat_space: {}, memory: [], memory_on: true, decks: [] }, local: false, quests: null, space: '', cat: '', pend: {} };
  const uid = () => S.user?.id || 'anon';
  const day = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const modal = (html, cls = '') => { const d = document.createElement('div'); d.className = 'modal trx-modal'; d.innerHTML = `<div class="sheet ${cls}">${html}</div>`; document.body.appendChild(d); d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-x]')) d.remove(); }); return d; };
  const pop = (anchor, html) => {
    document.querySelectorAll('.pop').forEach(x => x.remove());
    const m = document.createElement('div'); m.className = 'pop'; m.innerHTML = html; document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4) + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px';
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
    return m;
  };

  // ============================================================ saved state (Spaces, memory, decks)
  async function loadState() {
    const loc = store.get('trystate:' + uid(), null);
    const { data, error } = await sb.from('try_state').select('*').eq('user_id', uid()).maybeSingle().then(x => x, e => ({ error: e }));
    if (error) { X.local = true; if (loc) X.st = { ...X.st, ...loc }; }
    else if (data) X.st = { spaces: data.spaces || [], chat_space: data.chat_space || {}, memory: data.memory || [], memory_on: data.memory_on !== false, decks: data.decks || [] };
    else if (loc) { X.st = { ...X.st, ...loc }; saveState(); }   // made before the server table existed: send it up
    X.space = store.get('space:' + uid(), '');
    if (X.space && !X.st.spaces.some(s => s.id === X.space)) X.space = '';
    paintSpaces(); TR.paintChats();
  }
  let saveT = null;
  function saveState() {
    store.set('trystate:' + uid(), X.st);
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      if (X.local) return;
      const { error } = await sb.from('try_state').upsert({ user_id: uid(), ...X.st, updated_at: new Date().toISOString() }).then(x => x, e => ({ error: e }));
      if (error) { if (/try_state|42P01|PGRST20|does not exist/i.test(error.message || '')) X.local = true; else toast('Couldn’t save: ' + error.message); }
    }, 600);
  }

  // ============================================================ daily quests (pay Cirkts; the server picks the three)
  const counts = () => { const c = store.get('qcount:' + uid(), {}); return c.day === day() ? c : { day: day() }; };
  const bump = (k, n = 1) => { const c = counts(); c[k] = (c[k] || 0) + n; store.set('qcount:' + uid(), c); return c[k]; };
  async function loadQuests() { const { data } = await sb.rpc('try_quests_today', { p_day: day() }).then(x => x, () => ({})); X.quests = data || null; return X.quests; }
  async function quest(id) {
    if (!X.quests || X.quests.day !== day()) await loadQuests();
    const q = (X.quests?.quests || []).find(x => x.id === id); if (!q || (X.quests.claimed || []).includes(id)) return;
    if (S.guest) { if (!X.guestTold) { X.guestTold = true; toast('★ That was today’s quest. Make a free account to earn Cirkts for quests.', 5000); } return; }
    X.quests.claimed = [...(X.quests.claimed || []), id];
    const { data, error } = await sb.rpc('try_quest_claim', { p_quest: id, p_day: day() }).then(x => x, e => ({ error: e }));
    if (error || !data?.ok) { if (!data?.done) X.quests.claimed = X.quests.claimed.filter(x => x !== id); return; }
    X.cz = data; if (S.acct?.cirkts) S.acct.cirkts = { ...S.acct.cirkts, balance: data.balance, earned: data.earned, spent: data.spent, owned: data.owned };
    toast(`★ Quest done: ${q.text} · +${data.reward} Cirkts${data.bonus ? ` · +${data.bonus} for all three` : ''}`, 4500);
    if (TR.setTab === 'profile' && !$('settings').hidden) TR.paintSettings();
  }

  // ============================================================ Spaces lite
  const spaceById = id => X.st.spaces.find(s => s.id === id) || null;
  const spaceOfChat = () => spaceById(S.chat?.id ? X.st.chat_space[S.chat.id] : X.space);
  function paintSpaces() {
    let bar = $('spaceBar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'spaceBar'; bar.className = 'space-bar'; $('chatList').before(bar); }
    if (S.guest && !X.st.spaces.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<button class="sp-chip ${!X.space ? 'on' : ''}" data-space="">All</button>${X.st.spaces.map(s => `<button class="sp-chip ${X.space === s.id ? 'on' : ''}" data-space="${esc(s.id)}" title="${esc(s.about || s.name)}"><i style="background:${esc(s.color)}"></i>${esc(s.name)}${X.space === s.id ? '<span class="sp-more" data-spmore title="Change this Space">⋯</span>' : ''}</button>`).join('')}${X.st.spaces.length < 12 ? '<button class="sp-chip add" data-spadd title="New Space">＋ Space</button>' : ''}`;
  }
  function addSpace() {
    const name = (prompt('Name the Space (like "Biology" or "College apps")') || '').trim().slice(0, 32); if (!name) return null;
    const about = (prompt('Anything the agents should know in this Space? (optional, like "I\'m in 10th grade biology")') || '').trim().slice(0, 400);
    const sp = { id: newId('s'), name, color: COLORS[X.st.spaces.length % COLORS.length], about };
    X.st.spaces.push(sp); X.space = sp.id; store.set('space:' + uid(), sp.id); saveState(); paintSpaces(); TR.paintChats(); return sp;
  }
  function spaceMenu(anchor) {
    const sp = spaceById(X.space); if (!sp) return;
    const m = pop(anchor, `<button data-sm="ren">✎ Rename</button><button data-sm="about">📝 What agents should know</button><button data-sm="color">🎨 Next color</button><button data-sm="del">🗑 Delete Space</button>`);
    m.onclick = e => {
      const a = e.target.closest('[data-sm]')?.dataset.sm; if (!a) return; m.remove();
      if (a === 'ren') { const n = (prompt('Rename', sp.name) || '').trim().slice(0, 32); if (n) sp.name = n; }
      if (a === 'about') { const t = prompt('What should agents know in this Space?', sp.about || ''); if (t !== null) sp.about = t.trim().slice(0, 400); }
      if (a === 'color') sp.color = COLORS[(COLORS.indexOf(sp.color) + 1) % COLORS.length];
      if (a === 'del') { if (!confirm(`Delete the Space “${sp.name}”? Its chats stay (they just aren’t in a Space anymore).`)) return; X.st.spaces = X.st.spaces.filter(s => s.id !== sp.id); for (const [k, v] of Object.entries(X.st.chat_space)) if (v === sp.id) delete X.st.chat_space[k]; X.space = ''; store.set('space:' + uid(), ''); }
      saveState(); paintSpaces(); TR.paintChats();
    };
  }
  function moveChat(id, spaceId) {
    if (spaceId) X.st.chat_space[id] = spaceId; else delete X.st.chat_space[id];
    saveState(); TR.paintChats(); if (spaceId) quest('tq_space');
  }
  document.addEventListener('click', e => {
    const bar = e.target.closest('#spaceBar'); if (!bar) return;
    if (e.target.closest('[data-spmore]')) { e.stopPropagation(); return spaceMenu(e.target.closest('[data-spmore]')); }
    if (e.target.closest('[data-spadd]')) return addSpace();
    const b = e.target.closest('[data-space]'); if (!b) return;
    X.space = b.dataset.space; store.set('space:' + uid(), X.space); paintSpaces(); TR.paintChats();
    if (S.chat && !S.chat.messages.length) TR.paintEmpty();
  });

  // ============================================================ memory you control
  function addMemory(text) {
    const t = String(text || '').trim().replace(/[.!]+$/, '').slice(0, 300); if (t.length < 3) return null;
    if (X.st.memory.some(m => m.text.toLowerCase() === t.toLowerCase())) return null;
    const it = { id: newId('m'), text: t, at: Date.now() }; X.st.memory.unshift(it); X.st.memory = X.st.memory.slice(0, 60); saveState(); return it;
  }
  function forget(text) {
    const q = String(text || '').toLowerCase().trim(), before = X.st.memory.length;
    X.st.memory = X.st.memory.filter(m => !(m.text.toLowerCase().includes(q) || q.includes(m.text.toLowerCase())));
    if (X.st.memory.length !== before) saveState(); return before - X.st.memory.length;
  }
  function systemExtra() {
    let out = '';
    const sp = spaceOfChat();
    if (sp) out += `\n[THIS CHAT IS IN THE SPACE "${sp.name}"]${sp.about ? ' What the user wants you to know in this Space: ' + sp.about : ''}`;
    const mem = X.st.memory_on !== false ? X.st.memory.slice(0, 40) : [];
    if (mem.length) out += `\n[WHAT THE USER ASKED YOU TO REMEMBER] Use these when they matter; don't list them unless asked.\n${mem.map(m => '- ' + m.text).join('\n')}`;
    return out;
  }

  // ============================================================ @huddle and @debate
  let paintT = 0;
  const throttle = () => { if (Date.now() - paintT < 120) return; paintT = Date.now(); TR.paintFeed(); };
  const sysFor = id => (S.prompts?.[id]?.prompt || AGENTS[id]?.prompt || '') + "\n[WHERE YOU ARE] Nexus '28 Test Run (the web version)." + systemExtra();
  async function group(kind, question) {
    if (!question) { toast(`Type a question after @${kind}, like “@${kind} ${kind === 'huddle' ? 'is it worth learning Latin?' : 'school should start later'}”`, 4500); return; }
    if (S.busy) return;
    if (!S.chat) await TR.newChat(false);
    S.chat.messages.push({ role: 'user', content: `@${kind} ${question}`, ts: Date.now() });
    if (S.chat.title === 'New chat') S.chat.title = question.slice(0, 60);
    const msg = { role: 'assistant', agent: kind === 'huddle' ? 'flash' : 'lyte', label: kind === 'huddle' ? 'Huddle' : 'Debate', group: kind, content: '', ts: Date.now() };
    S.chat.messages.push(msg);
    const ctl = new AbortController(); S.busy = { ctl, msg }; TR.setBusy(true); TR.paintFeed();
    const earlier = S.chat.messages.filter(m => m !== msg && !m.error && m.content).slice(-10, -1).map(m => ({ role: m.role, content: m.content }));
    try {
      if (kind === 'huddle') {
        const ids = ['flash', 'lyte', 'neodela'].filter(id => AGENTS[id]), parts = {};
        const compose = sum => ids.map(id => `### ${AGENTS[id].name}\n${parts[id] || '_thinking…_'}`).join('\n\n') + (sum !== undefined ? `\n\n---\n### Together\n${sum || '_putting it together…_'}` : '');
        await Promise.all(ids.map(id => TR.callModel({ agentId: id, signal: ctl.signal, system: sysFor(id) + '\n[HUDDLE] You are one of three Nexus agents answering the same question side by side. Give your own take in under 150 words. Be specific.', messages: [...earlier, { role: 'user', content: question }],
          onText: (_t, all) => { parts[id] = all; msg.content = compose(); throttle(); } }).catch(e => { if (e.name === 'AbortError') throw e; parts[id] = '_' + e.message + '_'; })));
        msg.content = compose(''); TR.paintFeed();
        let sum = '';
        await TR.callModel({ agentId: 'flash', kind: 'extra', signal: ctl.signal, system: sysFor('flash') + '\n[HUDDLE SUMMARY] Combine the three takes into one answer: where they agree, where they differ, and what you recommend. Under 170 words.',
          messages: [{ role: 'user', content: `Question: ${question}\n\n` + ids.map(id => `${AGENTS[id].name}: ${parts[id]}`).join('\n\n') }], onText: (_t, all) => { sum = all; msg.content = compose(sum); throttle(); } });
        msg.content = compose(sum); quest('tq_huddle');
      } else {
        const turns = [], who = { pro: 'lyte', con: 'neodela', judge: 'flash' };
        const compose = () => turns.map(t => `### ${t.side === 'judge' ? 'Verdict' : t.side === 'pro' ? 'For' : 'Against'} · ${AGENTS[who[t.side]].name}${t.round ? ` · round ${t.round}` : ''}\n${t.text || '_thinking…_'}`).join('\n\n');
        const said = () => turns.filter(t => t.text).map(t => `${t.side === 'pro' ? 'FOR' : 'AGAINST'} (${AGENTS[who[t.side]].name}): ${t.text}`).join('\n\n');
        for (const round of [1, 2]) for (const side of ['pro', 'con']) {
          const t = { side, round, text: '' }; turns.push(t); msg.content = compose(); TR.paintFeed();
          await TR.callModel({ agentId: who[side], kind: round === 1 ? 'main' : 'extra', signal: ctl.signal,
            system: sysFor(who[side]) + `\n[DEBATE] Topic: "${question}". You argue ${side === 'pro' ? 'FOR' : 'AGAINST'} it. ${round === 1 ? 'Give your opening argument.' : 'Answer the other side\'s strongest point, then make your best closing point.'} Under 120 words. Stay respectful and use reasons, not insults.`,
            messages: [{ role: 'user', content: turns.length > 1 ? `The debate so far:\n\n${said()}\n\nYour turn.` : `Debate topic: ${question}` }], onText: (_t, all) => { t.text = all; msg.content = compose(); throttle(); } }).catch(e => { if (e.name === 'AbortError') throw e; t.text = '_' + e.message + '_'; });
        }
        const v = { side: 'judge', text: '' }; turns.push(v);
        await TR.callModel({ agentId: 'flash', kind: 'extra', signal: ctl.signal, system: sysFor('flash') + '\n[DEBATE JUDGE] Judge the debate fairly: the strongest point on each side, who argued better and why, and what a careful person should take away. Under 140 words.',
          messages: [{ role: 'user', content: `Topic: ${question}\n\n${said()}` }], onText: (_t, all) => { v.text = all; msg.content = compose(); throttle(); } });
        msg.content = compose(); quest('tq_debate');
      }
    } catch (e) {
      if (e.name === 'AbortError') msg.content += '\n\n_(stopped)_'; else { msg.error = true; msg.content = e.message; }
    } finally { S.busy = null; TR.setBusy(false); TR.paintFeed(); if (!S.chat.incognito) TR.save(); X.onAnswer?.(msg); }
  }

  // anything typed that more.js handles itself (true = handled, don't send it normally)
  async function intercept(raw) {
    const h = raw.match(/^@huddle\b[:,]?\s*([\s\S]*)$/i); if (h) { await group('huddle', h[1].trim()); return true; }
    const d = raw.match(/^@debate\b[:,]?\s*([\s\S]*)$/i); if (d) { await group('debate', d[1].trim()); return true; }
    if (!S.chat?.incognito) {
      const r = raw.match(/^(?:please\s+)?remember(?:\s+that)?[:,]?\s+([\s\S]{3,300})$/i);
      if (r) { const it = addMemory(r[1]); if (it) { toast('🧠 Remembered. See it in Settings → Memory.', 3000); quest('tq_memory'); } }
      const f = raw.match(/^forget(?:\s+that)?[:,]?\s+([\s\S]{2,200})$/i);
      if (f) { const n = forget(f[1]); toast(n ? `🧠 Forgot ${n === 1 ? 'it' : n + ' things'}.` : 'Nothing like that was saved.'); }
    }
    return false;
  }

  // ============================================================ study decks (up to three)
  const MAX_DECKS = 3, MAX_CARDS = 60;
  const due = c => !c.due || c.due <= Date.now();
  function gradeCard(c, g) {   // 1 again · 2 good · 3 easy (SM-2, shortened)
    c.ease = c.ease || 2.5; c.reps = c.reps || 0;
    if (g === 1) { c.reps = 0; c.ivl = 0; c.ease = Math.max(1.3, c.ease - .2); c.due = Date.now() + 10 * 60e3; return c; }
    c.ivl = c.reps === 0 ? (g === 3 ? 4 : 1) : c.reps === 1 ? (g === 3 ? 6 : 3) : Math.round((c.ivl || 1) * c.ease * (g === 3 ? 1.3 : 1));
    if (g === 3) c.ease += .15; c.reps++; c.due = Date.now() + c.ivl * 864e5; return c;
  }
  function parseCards(text) {
    const m = String(text || '').match(/\{[\s\S]*\}/); let j = null;
    if (m) for (const s of [m[0], m[0].replace(/,\s*([}\]])/g, '$1')]) { try { j = JSON.parse(s); break; } catch {} }
    const cards = (j?.cards || []).map(c => ({ f: String(c.f ?? c.front ?? '').trim().slice(0, 300), b: String(c.b ?? c.back ?? '').trim().slice(0, 600) })).filter(c => c.f && c.b).slice(0, MAX_CARDS);
    return { name: String(j?.name || '').trim().slice(0, 50), cards };
  }
  async function makeDeck({ topic = '', fromChat = false } = {}) {
    if (X.st.decks.length >= MAX_DECKS) return toast(`Test Run keeps up to ${MAX_DECKS} decks. Delete one first, or get the app for unlimited decks.`, 5000);
    const src = fromChat ? (S.chat?.messages || []).filter(m => m.content && !m.error).slice(-16).map(m => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`).join('\n\n').slice(0, 9000) : '';
    if (fromChat && !src) return toast('This chat is empty.');
    toast('🃏 Making your deck…', 8000);
    try {
      const out = await TR.callModel({ kind: 'extra', agentId: 'lyte', system: 'You make study flashcards. Reply with ONLY a JSON object, no code fence: {"name":"short deck name","cards":[{"f":"front: a question or term","b":"back: the answer, short"}]}. 8 to 15 cards. Accurate, one idea per card.', messages: [{ role: 'user', content: fromChat ? 'Make flashcards from this study chat:\n\n' + src : 'Make flashcards about: ' + topic }] });
      const p = parseCards(out); if (!p.cards.length) return toast('Couldn’t make cards from that. Try a clearer topic.');
      const deck = { id: newId('d'), name: p.name || (topic || S.chat?.title || 'My deck').slice(0, 50), cards: p.cards.map(c => ({ ...c, due: 0 })), at: Date.now() };
      X.st.decks.push(deck); saveState(); quest('tq_deck'); toast(`🃏 Made “${deck.name}” (${deck.cards.length} cards)`); studyHome();
    } catch (e) { toast(e.message); }
  }
  function studyHome() {
    document.querySelectorAll('.trx-study').forEach(x => x.remove());
    const d = modal(`<header><b>📚 Study decks</b><span class="sp"></span><button class="ib" data-x>✕</button></header><div class="set-body">
      ${X.st.decks.map(k => { const n = k.cards.filter(due).length; return `<div class="deck-row"><div><b>${esc(k.name)}</b><small>${k.cards.length} cards · ${n ? `<span class="due">${n} to review</span>` : 'all caught up'}</small></div><button class="btn sm primary" data-rev="${esc(k.id)}" ${n ? '' : 'disabled'}>Review</button><button class="btn sm" data-cards="${esc(k.id)}">Cards</button><button class="btn sm danger" data-deldeck="${esc(k.id)}">Delete</button></div>`; }).join('') || '<p class="muted">No decks yet. Make one about anything, or from a chat you just had.</p>'}
      ${X.st.decks.length < MAX_DECKS ? `<div class="card"><h3>Make a deck</h3><div class="row"><input id="dkTopic" placeholder="A topic, like the water cycle" maxlength="120" style="flex:1"><button class="btn primary sm" id="dkMake">Make it</button></div>${S.chat?.messages?.length ? '<button class="btn sm" id="dkChat" style="margin-top:8px">Make one from this chat</button>' : ''}</div>` : `<p class="fine">Test Run keeps up to ${MAX_DECKS} decks. The app has unlimited decks, test-date study plans and more.</p>`}
      <p class="fine">Cards come back when you’re about to forget them (the same spaced review as the app).</p></div>`, 'wide trx-study');
    d.classList.add('trx-study');
    d.onclick = e => {
      if (e.target.closest('#dkMake')) { const t = d.querySelector('#dkTopic').value.trim(); if (!t) return; d.remove(); return makeDeck({ topic: t }); }
      if (e.target.closest('#dkChat')) { d.remove(); return makeDeck({ fromChat: true }); }
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rev) { d.remove(); return review(b.dataset.rev); }
      if (b.dataset.cards) { d.remove(); return deckCards(b.dataset.cards); }
      if (b.dataset.deldeck) { const k = X.st.decks.find(x => x.id === b.dataset.deldeck); if (k && confirm(`Delete “${k.name}”?`)) { X.st.decks = X.st.decks.filter(x => x !== k); saveState(); d.remove(); studyHome(); } }
    };
    d.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'dkTopic') d.querySelector('#dkMake').click(); });
  }
  function deckCards(id) {
    const k = X.st.decks.find(x => x.id === id); if (!k) return;
    const d = modal(`<header><b>${esc(k.name)}</b><span class="sp"></span><button class="btn sm" data-back>← Decks</button><button class="ib" data-x>✕</button></header><div class="set-body">
      <div class="card-list">${k.cards.map((c, i) => `<div class="cl-row"><div><b>${esc(c.f)}</b><span>${esc(c.b)}</span></div><button class="ib" data-rmc="${i}" title="Remove">✕</button></div>`).join('')}</div>
      ${k.cards.length < MAX_CARDS ? '<div class="row"><input id="ncF" placeholder="Front" maxlength="300" style="flex:1"><input id="ncB" placeholder="Back" maxlength="600" style="flex:1"><button class="btn sm" id="ncAdd">Add</button></div>' : ''}</div>`, 'wide');
    d.onclick = e => {
      if (e.target.closest('[data-back]')) { d.remove(); return studyHome(); }
      const r = e.target.closest('[data-rmc]'); if (r) { k.cards.splice(+r.dataset.rmc, 1); saveState(); d.remove(); return deckCards(id); }
      if (e.target.closest('#ncAdd')) { const f = d.querySelector('#ncF').value.trim(), b = d.querySelector('#ncB').value.trim(); if (!f || !b) return; k.cards.push({ f, b, due: 0 }); saveState(); d.remove(); deckCards(id); }
    };
  }
  function review(id) {
    const k = X.st.decks.find(x => x.id === id); if (!k) return;
    let queue = k.cards.filter(due), i = 0, flipped = false;
    if (!queue.length) return toast('All caught up on this deck.');
    const d = modal('', 'wide review-sheet');
    const paint = () => {
      const c = queue[i];
      if (!c) { d.querySelector('.sheet').innerHTML = `<header><b>${esc(k.name)}</b><span class="sp"></span><button class="ib" data-x>✕</button></header><div class="set-body center"><h2>Done for now</h2><p class="muted">${queue.length} card${queue.length === 1 ? '' : 's'} reviewed. They’ll come back when it’s time.</p><div class="row" style="justify-content:center"><button class="btn" data-home>Decks</button><button class="btn primary" data-x>Close</button></div></div>`; return; }
      d.querySelector('.sheet').innerHTML = `<header><b>${esc(k.name)}</b><span class="fine" style="margin-left:8px">${i + 1} / ${queue.length}</span><span class="sp"></span><button class="ib" data-x>✕</button></header>
        <div class="flash ${flipped ? 'flipped' : ''}" data-flip tabindex="0"><div class="side front">${esc(c.f)}</div><div class="side back">${esc(c.b)}</div></div>
        ${flipped ? '<div class="row grades"><button class="btn" data-g="1">Again <kbd>1</kbd></button><button class="btn primary" data-g="2">Good <kbd>2</kbd></button><button class="btn" data-g="3">Easy <kbd>3</kbd></button></div>' : '<div class="row grades"><button class="btn primary wide" data-flip>Show the answer <kbd>Space</kbd></button></div>'}`;
    };
    const grade = g => { gradeCard(queue[i], g); saveState(); const n = bump('reviews'); quest('tq_deck'); if (n >= 10) quest('tq_review10'); if (g === 1) queue.push(queue[i]); i++; flipped = false; paint(); };
    d.addEventListener('click', e => { if (e.target.closest('[data-home]')) { d.remove(); return studyHome(); } if (e.target.closest('[data-flip]')) { flipped = !flipped; return paint(); } const g = e.target.closest('[data-g]'); if (g) grade(+g.dataset.g); });
    const key = e => { if (!d.isConnected) return document.removeEventListener('keydown', key); if (e.key === ' ') { e.preventDefault(); flipped = !flipped; paint(); } if (flipped && /^[123]$/.test(e.key)) grade(+e.key); };
    document.addEventListener('keydown', key);
    paint();
  }

  // ============================================================ profile, Cirkts, quests and the shop
  const SHOP_KINDS = () => (window.NexusCosmetics?.KINDS || []).filter(([k]) => !['skin', 'theme', 'pack', 'wtheme'].includes(k));   // orb skins, app themes, sets and widget themes are used in the app
  X.shopK = 'limited';
  async function loadAcct(force) {
    if (S.guest) return null;
    if (S.acct && !force && Date.now() - (X.acctAt || 0) < 60e3) return S.acct;
    const { data } = await sb.rpc('apoji_account').then(x => x, () => ({})); S.acct = data || { none: true }; X.acctAt = Date.now();
    const { data: cz } = await sb.rpc('cirkts_state').then(x => x, () => ({})); if (cz?.ok) X.cz = cz;
    return S.acct;
  }
  function profileTab() {
    const NC = window.NexusCosmetics;
    if (S.guest) return `<div class="card"><h3>Profile, Cirkts &amp; shop</h3><p class="muted">Make a free account to get a profile, earn Cirkts with daily quests and spend them on frames, banners and name styles. They’re the same in the app and N28C.</p><button class="btn primary sm" id="pxJoin">Make a free account</button></div>`;
    if (!S.acct || !X.quests) { Promise.all([loadAcct(), loadQuests()]).then(() => { if (TR.setTab === 'profile' && !$('settings').hidden) TR.paintSettings(); }); return '<div class="card"><p class="muted">Loading your profile…</p></div>'; }
    const a = S.acct, card = a.card ? { ...a.card, self: true, online: true } : null, style = card?.style || {}, cz = X.cz || a.cirkts || {}, owned = new Set(cz.owned || []);
    const q = X.quests || { quests: [], claimed: [] };
    const sea = NC?.season ? NC.season() : { month: 0, items: [] }, seaOk = x => !x.months || x.months.includes(sea.month) || owned.has(x.id);
    const items = !NC ? [] : (X.shopK === 'limited' ? sea.items : NC.CATALOG.filter(x => x.kind === X.shopK && seaOk(x))).filter(x => !x.owner && !x.beta && !['skin', 'theme', 'wtheme'].includes(x.kind)).sort((x, y) => (x.free ? 0 : 1) - (y.free ? 0 : 1) || x.price - y.price);
    const own = it => it.price === 0 || owned.has(it.id), using = it => style[it.kind] === it.id;
    return `<div class="card"><h3>Your profile</h3>${card && NC ? NC.card(card) : '<p class="muted">Your profile card shows here.</p>'}
        <div class="acct-grid" style="margin-top:10px">
          <label>Display name</label><input id="pxName" maxlength="32" value="${esc(style.display_name || '')}" placeholder="${esc(card?.nickname || card?.username || 'Your name')}">
          <label>Status</label><input id="pxStatus" maxlength="60" value="${esc(style.status_text || '')}" placeholder="Studying for finals">
          <label>Pronouns</label><input id="pxPron" maxlength="24" value="${esc(style.pronouns || '')}" placeholder="they/them">
          <label>Bio</label><input id="pxBio" maxlength="160" value="${esc(style.bio || '')}" placeholder="A line about you">
        </div><div class="row"><button class="btn sm primary" id="pxSave">Save profile</button><span class="fine">The same profile shows in the app, N28C and to your friends.</span></div></div>
      <div class="card"><h3>Today’s quests <span class="pill gold">${(cz.balance || 0).toLocaleString()} CIRKTS</span></h3>
        ${(q.quests || []).map(x => `<div class="q-row ${(q.claimed || []).includes(x.id) ? 'done' : ''}"><span class="q-tick">${(q.claimed || []).includes(x.id) ? '✓' : ''}</span><span>${esc(x.text)}</span><b>+${x.reward}</b></div>`).join('') || '<p class="muted">Quests aren’t switched on yet.</p>'}
        <p class="fine">Do all three for +${q.bonus || 25} more. New quests every day at midnight.</p></div>
      <div class="card"><h3>Cirkts shop</h3><div class="sh-tabs">${SHOP_KINDS().map(([k, l]) => `<button class="${k === X.shopK ? 'on' : ''}" data-pxk="${k}">${esc(l)}</button>`).join('')}</div>
        ${X.shopK === 'limited' ? `<p class="fine">${esc(sea.name || 'This month')} only: leaves the shop in ${sea.daysLeft ?? '?'} day${sea.daysLeft === 1 ? '' : 's'}. Anything you buy is yours to keep.</p>` : ''}
        <div class="sh-grid">${['frame', 'ptheme', 'font', 'color', 'banner', 'pframe', 'effect'].includes(X.shopK) ? `<button class="sh-it own ${!style[X.shopK] ? 'using' : ''}" data-pxnone="1"><div class="sh-sw"><span class="fine">None</span></div><b>None</b><small>${!style[X.shopK] ? 'In use' : 'Use'}</small></button>` : ''}
        ${items.map(it => `<button class="sh-it ${own(it) ? 'own' : ''} ${using(it) ? 'using' : ''}" data-pxit="${esc(it.id)}"><div class="sh-sw">${NC.swatch(it, { name: style.display_name || card?.nickname || 'You' })}</div><b>${esc(it.name)}</b><small>${using(it) ? 'In use' : own(it) ? 'Use' : it.price.toLocaleString() + ' Cirkts'}</small></button>`).join('') || '<p class="muted">Nothing here right now.</p>'}</div>
        <p class="fine">Tap something you own to use it. Tap something new twice to buy it. Orb skins, app themes and sets are in the app.</p></div>`;
  }
  async function shopClick(b) {
    const NC = window.NexusCosmetics;
    if (b.dataset.pxk) { X.shopK = b.dataset.pxk; return TR.paintSettings(); }
    if (b.dataset.pxnone) { const { data, error } = await sb.rpc('profile_style_set', { p_style: { [X.shopK]: '' } }); toast(error ? error.message : data?.ok ? 'Done' : data?.error || 'That didn’t work'); await loadAcct(true); return TR.paintSettings(); }
    const it = NC?.item(b.dataset.pxit); if (!it) return;
    const cz = X.cz || S.acct?.cirkts || {}, mine = it.price === 0 || (cz.owned || []).includes(it.id);
    if (!mine) {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.querySelector('small').textContent = (cz.balance || 0) >= it.price ? `Tap again: buy for ${it.price.toLocaleString()}` : `Need ${(it.price - (cz.balance || 0)).toLocaleString()} more`; setTimeout(() => { if (b.isConnected) delete b.dataset.sure; }, 3000); return; }
      const { data, error } = await sb.rpc('cirkts_buy', { p_item: it.id });
      if (error || !data?.ok) return toast(error?.message || data?.error || 'Couldn’t buy it');
      X.cz = data; toast(`Bought ${it.name}`);
    }
    const { data, error } = await sb.rpc('profile_style_set', { p_style: { [it.kind]: it.id } });
    toast(error ? error.message : data?.ok ? `Using ${it.name}` : data?.error || 'That didn’t work'); await loadAcct(true); TR.paintSettings();
  }

  // ============================================================ "the app can do this" (answers that need the computer)
  const APP_ADDS = [
    ['screen', /\b(on|at|of) my screen\b|\bwhat'?s on my screen\b|\blook at my screen\b|\bscreenshot\b/i, 'eye', 'Look at your screen', 'In the app, press ⌥⇧S (Alt+Shift+S on Windows) and Nexus sees what’s on your screen, so you can ask about the page, an error or a homework problem without copying anything.'],
    ['files', /\b(my|the) (files?|documents?|downloads|desktop|folders?|pdfs?)\b|\bon my (computer|laptop|mac|pc)\b|\bfind (a|the|my) file\b/i, 'folder', 'Find and read your files', 'Paragon in the app can search your computer for files, open them and read them for you.'],
    ['calendar', /\b(my calendar|add (it|this|that) to (my )?calendar|remind me|set a reminder|schedule (a|my)|my schedule)\b/i, 'calendar', 'Your calendar and reminders', 'The app adds events and reminders to your real calendar (asking first), and its Morning Brief tells you what’s coming up.'],
    ['actions', /\b(open|launch|close) (spotify|music|safari|chrome|word|excel|discord|the app)\b|\b(dark mode|volume|turn (on|off)|mute)\b|\b(play|pause|skip) (the |my )?(song|music|track)\b/i, 'bolt', 'Do things on your computer', 'In the app, Paragon opens apps, changes the volume or dark mode, controls your music and runs Shortcuts, with a confirm before anything changes.'],
    ['messages', /\b(send|write) (an? )?(email|text|imessage|message) to\b|\btext my\b|\bemail my\b/i, 'mail', 'Draft emails and messages', 'The app can draft an email in Mail or send an iMessage to a contact by name, always asking you first.'],
    ['highlight', /\b(highlighted|i highlighted|selected text|explain this (paragraph|sentence|word))\b/i, 'spark', 'Explain anything you highlight', 'In the app, highlight text in any app and a small orb appears: tap it to explain, simplify or translate it.'],
    ['phone', /\b(on my phone|from my phone|iphone|android)\b/i, 'phone', 'Nexus on your phone', 'With the app, N28C on your phone talks to your computer: ask from anywhere and it answers with everything the app can do.']
  ];
  function appAddsFor(text) { for (const [k, re] of APP_ADDS) if (re.test(text)) return k; return ''; }
  function msgExtra(m, i) {
    if (m.role !== 'assistant' || !m.appAdds || m.appAddsHidden || S.busy?.msg === m) return '';
    const a = APP_ADDS.find(x => x[0] === m.appAdds); if (!a) return '';
    const canHand = S.chat?.id && !String(S.chat.id).startsWith('local-') && !S.guest && !S.chat.incognito;
    return `<div class="app-adds"><div class="aa-ic">${ic(a[2]) || '✦'}</div><div><b>The app can do this: ${esc(a[3])}</b><p>${esc(a[4])}</p><div class="row"><a class="btn sm primary" href="${APP_URL}" target="_blank" rel="noopener">Get Nexus for Mac or PC</a>${canHand ? '<button class="btn sm" data-handoff>Open this chat in the app</button>' : ''}<button class="btn sm ghost" data-aahide="${i}">Hide</button></div></div></div>`;
  }

  // ============================================================ hand off to the app · share a chat as a link
  function handoff(id = S.chat?.id) {
    if (!id || String(id).startsWith('local-') || String(id).startsWith('inc-')) return toast('Send a message first so the chat is saved to your account.');
    const ag = S.chat?.agent || S.agent;
    location.href = `nexus28://trychat?id=${encodeURIComponent(id)}&agent=${encodeURIComponent(ag)}`;
    const t0 = Date.now();
    setTimeout(() => { if (document.visibilityState === 'visible' && Date.now() - t0 < 4000) toast('Didn’t open? You need Nexus ’28 on this computer, signed in with the same account. Settings → Install has the link.', 6500); }, 1800);
  }
  const strip = t => String(t || '').replace(/\[\[conf:\d+\]\]/g, '').trim();
  async function shareChat(c) {
    if (S.chat?.id !== c.id) await TR.openChat(c.id);
    if (S.chat?.incognito) return toast('Temporary chats can’t be shared.');
    const msgs = (S.chat?.messages || []).filter(m => (m.role === 'user' || m.role === 'assistant') && !m.error && strip(m.content)).map(m => ({ role: m.role, content: strip(m.content).slice(0, 40000), agent: m.role === 'assistant' ? (m.label ? m.label.toLowerCase() : m.agent || '') : '', ts: m.ts || null })).slice(-200);
    if (!msgs.length) return toast('This chat is empty.');
    if (!confirm(`Share “${S.chat.title}” as a link?\n\nAnyone with the link can read this chat (not your pictures or memory). You can stop it in Settings → Account → Shared links.`)) return;
    const { data, error } = await sb.rpc('share_chat_create', { p_title: String(S.chat.title || 'Chat').slice(0, 120), p_agent: S.chat.agent || S.agent, p_messages: msgs, p_source: 'test_run', p_show_name: false }).then(x => x, e => ({ error: e }));
    if (error || !data?.ok) return toast(error ? (/share_chat_create|PGRST202/.test(error.message || '') ? 'Sharing isn’t switched on yet.' : error.message) : data.error);
    const url = SHARE_BASE + '?c=' + data.id;
    try { await navigator.clipboard.writeText(url); toast('🔗 Link copied: ' + url.replace(/^https:\/\//, ''), 5000); } catch { prompt('Your link', url); }
    quest('tq_share');
  }
  async function sharedList() {
    const { data } = await sb.rpc('my_shared_chats').then(x => x, () => ({}));
    return (data || []);
  }
  async function forkShared(id) {
    const { data } = await fetch(`${SB_URL}/rest/v1/rpc/share_chat_get`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id }) }).then(r => r.json()).then(d => ({ data: d }), () => ({}));
    history.replaceState(null, '', location.pathname);
    if (!data?.ok) return toast(data?.error || 'That shared chat isn’t available.');
    await TR.newChat(false);
    S.chat.title = '↳ ' + String(data.title || 'Shared chat').slice(0, 110);
    S.chat.messages = (data.messages || []).map(m => ({ role: m.role, content: m.content, ts: m.ts || Date.now(), ...(m.role === 'assistant' ? { agent: AGENTS[m.agent] ? m.agent : 'flash' } : {}) }));
    TR.save(); TR.paintFeed(); TR.paintChats(); toast('Here’s the shared chat. Keep going: ask anything.', 4000);
  }

  // ============================================================ prompt starters by category (a new set every day)
  const STARTERS = {
    School: [['📚', 'Quiz me', 'on the causes of World War I', '@StudyMode quiz me on the causes of World War I', 'neodela'], ['📐', 'Homework help', 'hints first, then the answer', '@Homework help me solve 3x + 7 = 22', 'flash'], ['🧪', 'Explain it simply', 'how vaccines work', 'Explain how vaccines work like I’m 12', 'lyte'], ['🗺', 'Make a study plan', 'for a test on Friday', 'Make me a study plan for a biology test on Friday. I have 45 minutes a day.', 'neodela'], ['🃏', 'Flashcards', 'for Spanish greetings', '@Magyk teach me 8 Spanish greetings with flashcards', 'neodela'], ['📝', 'Essay outline', 'on social media and teens', 'Help me outline a 5-paragraph essay on whether social media is good for teens', 'lyte'], ['🔢', 'Check my math', 'step by step', 'Check my work step by step: 2(x − 3) = 14, so x = 10', 'flash'], ['🏛', 'Compare', 'Athens and Sparta', 'Compare Athens and Sparta in a table: government, daily life, military', 'lyte']],
    Work: [['📧', 'Write an email', 'asking for a deadline extension', 'Write a short, polite email asking my manager for a two-day extension on a report', 'lyte'], ['📋', 'Meeting agenda', 'for a 30-minute check-in', 'Make an agenda for a 30-minute team check-in about a website launch', 'flash'], ['🎯', 'Prioritize', 'my to-do list', 'Help me prioritize this list by urgency and impact: ', 'neodela'], ['💼', 'Cover letter', 'for a part-time job', 'Write a cover letter for a part-time job at a bookstore. I love reading and I’m organized.', 'lyte'], ['📊', 'Explain a chart idea', 'for sales by month', 'What’s the best chart to show sales by month for three stores, and why?', 'flash'], ['🤝', 'Prep for an interview', 'common questions', 'Give me 8 common interview questions for a retail job with strong sample answers', 'neodela']],
    Writing: [['✍️', 'Improve my writing', 'clearer, same voice', 'Make this paragraph clearer without changing my voice: ', 'lyte'], ['📖', 'Story starter', 'a mystery in a small town', 'Write the first paragraph of a mystery set in a small town where the clocks stopped', 'neodela'], ['🎤', 'Speech opener', 'for a class presentation', 'Give me 3 strong ways to open a class presentation about climate change', 'flash'], ['🖋', 'Poem', 'about the first snow', 'Write a short poem about the first snow of the year', 'lyte'], ['🔁', 'Rephrase', 'in a friendlier tone', 'Rewrite this so it sounds friendlier: ', 'flash'], ['📰', 'Headline ideas', 'for a school newspaper', '@Synergy give me 10 headline ideas for a school newspaper story about the robotics team', 'lyte']],
    Fun: [['💡', 'Brainstorm', 'a science fair project', '@Synergy give me ideas for a science fair project about plants', 'lyte'], ['🎲', 'Trivia', 'about space', 'Give me a 5-question space trivia quiz with fun facts after each answer', 'flash'], ['🍳', 'What can I cook', 'with eggs, rice and spinach', 'What can I cook with eggs, rice and spinach in 20 minutes?', 'flash'], ['🎬', 'Movie night', 'picks for a group', 'Suggest 5 movies for a group of friends who like funny adventures', 'lyte'], ['🧩', 'Riddle', 'a hard one', 'Give me a hard riddle. Don’t tell me the answer until I ask.', 'flash'], ['⚖️', 'A friendly debate', 'cats vs dogs', '@debate cats make better pets than dogs', 'lyte']],
    Code: [['🐍', 'Explain this code', 'line by line', 'Explain this code line by line: ', 'neodela'], ['🐞', 'Find the bug', 'in a JavaScript loop', 'Why does this print 3 three times? for (var i = 0; i < 3; i++) setTimeout(() => console.log(i))', 'lyte'], ['🌐', 'Build a page', 'a simple to-do list in HTML', 'Write a simple to-do list web page in one HTML file with a little CSS', 'neodela'], ['📘', 'Learn a concept', 'what an API is', 'What is an API? Explain with an everyday example', 'flash'], ['🧮', 'Algorithm', 'binary search, simply', 'Explain binary search simply, then show it in Python', 'lyte'], ['🗂', 'Regex helper', 'match email addresses', 'Write a regex that matches most email addresses and explain each part', 'flash']]
  };
  const CATS = Object.keys(STARTERS);
  function paintStarters() {
    const el = $('sugg'); if (!el) return false;
    const cat = X.cat || store.get('startCat', 'School'), pool = STARTERS[cat] || STARTERS.School;
    const d = new Date(), seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
    const pick = pool.map((s, i) => [s, (i * 7919 + seed * 104729) % 1000]).sort((a, b) => a[1] - b[1]).slice(0, 4).map(x => x[0]);
    const sp = spaceOfChat();
    el.innerHTML = `<div class="cat-tabs">${CATS.map(c => `<button data-scat="${c}" class="${c === cat ? 'on' : ''}">${c}</button>`).join('')}</div>${sp ? `<div class="fine sp-note"><i style="background:${esc(sp.color)}"></i>New chats go in <b>${esc(sp.name)}</b></div>` : ''}` +
      pick.map(([i, t, dsc, q, a]) => `<button data-sugg="${esc(q)}" data-sa="${a}"><b>${i} ${esc(t)}</b><span>${esc(dsc)}</span></button>`).join('');
    return true;
  }
  $('sugg')?.addEventListener('click', e => {
    const c = e.target.closest('[data-scat]'); if (c) { e.stopPropagation(); X.cat = c.dataset.scat; store.set('startCat', X.cat); paintStarters(); return; }
    if (e.target.closest('[data-sugg]')) X.pend.starter = true;
  }, true);

  // ============================================================ the guided first run, beside the chat
  const GUIDE = [
    { t: 'Ask Flash to plan your week', d: 'Flash is fast and clear. Send it a real task.', act: 'Do it for me', run: () => { TR.setAgent('flash'); TR.send('Plan my week: school, homework, practice and some free time. Keep it simple.'); }, done: e => e.answer && e.agent === 'flash' },
    { t: 'Now let Neodela improve it', d: 'Neodela thinks deeper. Same chat, different agent.', act: 'Ask Neodela', run: () => { TR.setAgent('neodela'); TR.send('Make that plan better: add priorities, time estimates and one tip to stick to it.'); }, done: e => e.answer && e.agent === 'neodela' },
    { t: 'Try an @feature', d: 'Type @ to see superpowers. @Seek searches the web and cites sources.', act: 'Try @Seek', run: () => { $('input').value = '@Seek what’s one new discovery in space this year?'; $('input').focus(); }, done: e => e.answer && e.feats },
    { t: 'Open the command palette', d: 'Press ⌘K (Ctrl+K on Windows) to do anything from the keyboard.', act: 'Open it', run: () => palette(), done: e => e.palette },
    { t: 'Make it yours', d: 'Set up your profile and see today’s quests (they pay Cirkts for the shop).', act: 'Open my profile', run: () => TR.openSettings('profile'), done: e => e.profile }
  ];
  function guided(i = store.get('guideStep:' + uid(), 0)) {
    X.gi = i; store.set('guideStep:' + uid(), i);
    // beside the chat: in the sidebar on a computer, floating above the composer on a phone
    let c = $('coach'); if (!c) { c = document.createElement('aside'); c.id = 'coach'; c.className = 'coach'; }
    const wide = innerWidth > 820, side = $('side')?.querySelector('.side-foot');
    if (wide && side) { c.classList.add('in-side'); if (c.parentNode !== side.parentNode) side.before(c); } else { c.classList.remove('in-side'); if (c.parentNode !== document.body) document.body.appendChild(c); }
    const st = GUIDE[i];
    if (!st) { c.innerHTML = `<div class="coach-top"><b>You’re set</b><button class="ib" data-cx>✕</button></div><p>That’s the basics. Press <kbd>?</kbd> for the full tour any time, and ⌘K for everything else.</p><div class="row"><button class="btn sm" data-cfull>Full tour</button><a class="btn sm primary" href="${APP_URL}" target="_blank" rel="noopener">Get the app</a></div>`; store.set('toured:' + uid(), true); return; }
    c.innerHTML = `<div class="coach-top"><span class="step">STEP ${i + 1} OF ${GUIDE.length}</span><button class="ib" data-cx title="Hide">✕</button></div><div class="coach-dots">${GUIDE.map((_, j) => `<i class="${j < i ? 'done' : j === i ? 'on' : ''}"></i>`).join('')}</div>
      <b>${esc(st.t)}</b><p>${esc(st.d)}</p><div class="row"><button class="btn sm primary" data-crun>${esc(st.act)}</button><button class="link" data-cskip>Skip</button><span class="sp"></span><button class="link" data-cfull>Full tour</button></div>`;
  }
  function guideEvent(e) { if (X.gi == null || !$('coach')) return; const st = GUIDE[X.gi]; if (st && st.done(e)) setTimeout(() => guided(X.gi + 1), 600); }
  document.addEventListener('click', e => {
    const c = e.target.closest('#coach'); if (!c) return;
    if (e.target.closest('[data-cx]')) { c.remove(); X.gi = null; store.set('toured:' + uid(), true); return; }
    if (e.target.closest('[data-crun]')) return GUIDE[X.gi]?.run();
    if (e.target.closest('[data-cskip]')) return guided(X.gi + 1);
    if (e.target.closest('[data-cfull]')) { c.remove(); X.gi = null; return TR.tour(0); }
  });

  // ============================================================ ⌘K palette and keyboard shortcuts
  const META = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';
  function commands() {
    const c = [
      ['New chat', 'Alt+N', () => TR.newChat()], ['Temporary chat (not saved)', '', () => $('incBtn')?.click()],
      ...Object.values(AGENTS).slice(0, 9).map((a, i) => [`Switch to ${a.name}`, i < 3 ? `Alt+${i + 1}` : '', () => TR.setAgent(a.id)]),
      ['Search the web for the next message', 'Alt+W', () => $('webBtn')?.click()],
      ['Start a huddle (three agents at once)', '', () => { $('input').value = '@huddle '; $('input').focus(); }],
      ['Start a debate', '', () => { $('input').value = '@debate '; $('input').focus(); }],
      ['Study decks', '', () => studyHome()], ['Voice mode', 'Alt+V', () => voice()],
      ['New Space', '', () => addSpace()], ['Memory', '', () => TR.openSettings('memory')], ['Profile, quests & shop', '', () => TR.openSettings('profile')],
      ['Share this chat as a link', '', () => S.chat?.id ? shareChat({ id: S.chat.id }) : toast('Send a message first.')],
      ['Open this chat in the app', '', () => handoff()], ['Export this chat', '', () => TR.exportChat()],
      ['Install Test Run as an app', '', () => TR.openSettings('install')], ['Settings', '', () => TR.openSettings()],
      ['Guided first run', '', () => guided(0)], ['Full tour', '?', () => TR.tour(0)], ['Keyboard shortcuts', META + '/', () => shortcuts()]
    ];
    return c;
  }
  function palette() {
    document.querySelectorAll('.pal-wrap').forEach(x => x.remove());
    guideEvent({ palette: true });
    const d = document.createElement('div'); d.className = 'pal-wrap'; d.innerHTML = `<div class="pal" role="dialog" aria-label="Command palette"><input id="palQ" placeholder="Type a command or search your chats…" autocomplete="off"><div class="pal-list" id="palL"></div><div class="fine pal-foot">↑↓ to move · Enter to run · Esc to close</div></div>`;
    document.body.appendChild(d);
    let sel = 0, list = [];
    const paint = () => {
      const q = d.querySelector('#palQ').value.trim().toLowerCase();
      const cmds = commands().filter(([l]) => !q || l.toLowerCase().includes(q)).map(([l, k, run]) => ({ l, k, run, g: 'Commands' }));
      const chats = q ? (S.chats || []).filter(c => String(c.title).toLowerCase().includes(q)).slice(0, 6).map(c => ({ l: c.title, k: '', run: () => TR.openChat(c.id), g: 'Chats' })) : [];
      list = [...cmds.slice(0, 12), ...chats]; sel = Math.min(sel, Math.max(0, list.length - 1));
      d.querySelector('#palL').innerHTML = list.map((x, i) => `${i === 0 || list[i - 1].g !== x.g ? `<h6>${x.g}</h6>` : ''}<button class="${i === sel ? 'on' : ''}" data-pi="${i}"><span>${esc(x.l)}</span>${x.k ? `<kbd>${esc(x.k)}</kbd>` : ''}</button>`).join('') || '<p class="fine" style="padding:10px">Nothing matches.</p>';
    };
    const run = i => { const x = list[i]; if (!x) return; d.remove(); x.run(); };
    d.addEventListener('click', e => { if (e.target === d) return d.remove(); const b = e.target.closest('[data-pi]'); if (b) run(+b.dataset.pi); });
    d.querySelector('#palQ').addEventListener('input', () => { sel = 0; paint(); });
    d.querySelector('#palQ').addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % Math.max(1, list.length); paint(); } if (e.key === 'Enter') { e.preventDefault(); run(sel); } if (e.key === 'Escape') d.remove(); });
    paint(); setTimeout(() => d.querySelector('#palQ').focus(), 0);
  }
  function shortcuts() {
    modal(`<header><b>Keyboard shortcuts</b><span class="sp"></span><button class="ib" data-x>✕</button></header><div class="set-body"><table class="keys">
      ${[[META + 'K', 'Command palette'], ['Alt+N', 'New chat'], ['Alt+1 / 2 / 3', 'Flash / Lyte / Neodela'], ['Alt+W', 'Web search for the next message'], ['Alt+V', 'Voice mode'], ['Enter', 'Send'], ['Shift+Enter', 'New line'], ['@', 'Features, @huddle and @debate'], ['Esc', 'Stop the answer, or close'], [META + '/', 'This list'], ['?', 'The full tour (when not typing)']].map(([k, l]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(l)}</td></tr>`).join('')}</table></div>`);
  }
  document.addEventListener('keydown', e => {
    if (!S.user || !$('auth').hidden) return;
    const mod = e.metaKey || e.ctrlKey, typing = /input|textarea/i.test(e.target.tagName);
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); return palette(); }
    if (mod && e.key === '/') { e.preventDefault(); return shortcuts(); }
    if (e.altKey && !mod) {
      const k = e.code;
      if (k === 'KeyN') { e.preventDefault(); return TR.newChat(); }
      if (k === 'KeyW') { e.preventDefault(); return $('webBtn')?.click(); }
      if (k === 'KeyV') { e.preventDefault(); return voice(); }
      const n = { Digit1: 'flash', Digit2: 'lyte', Digit3: 'neodela' }[k]; if (n) { e.preventDefault(); return TR.setAgent(n); }
    }
    if (e.key === 'Escape' && S.busy && !document.querySelector('.modal:not([hidden]), .pal-wrap, .voice-wrap')) { S.busy.ctl.abort(); return; }
    if (e.key === '?' && !typing && !mod && $('tour').hidden) { e.preventDefault(); TR.tour(0); }
  });

  // ============================================================ voice mode: talk, it answers out loud, it listens again
  function voice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !('speechSynthesis' in window)) return toast('Voice mode needs Chrome, Edge or Safari (this browser can’t listen).', 5000);
    document.querySelectorAll('.voice-wrap').forEach(x => x.remove());
    const d = document.createElement('div'); d.className = 'voice-wrap'; d.innerHTML = `<div class="voice"><canvas id="vOrb" width="260" height="260"></canvas><b id="vState">Listening…</b><p id="vText" class="muted">Say something. Say “stop” or tap End to finish.</p><div class="row"><button class="btn" id="vMute">Tap to talk</button><button class="btn danger" id="vEnd">End</button></div></div>`;
    document.body.appendChild(d);
    const orb = window.NexusOrb ? window.NexusOrb.create(d.querySelector('#vOrb'), { color: TR.agent().color, skin: 'aurora' }) : null;
    let rec = null, alive = true, turns = 0;
    const state = (t, sub) => { d.querySelector('#vState').textContent = t; if (sub !== undefined) d.querySelector('#vText').textContent = sub; orb?.setState?.(t.startsWith('Listen') ? 'listening' : t.startsWith('Think') ? 'thinking' : t.startsWith('Speak') ? 'speaking' : 'idle'); };
    const end = () => { alive = false; try { rec?.abort(); } catch {} speechSynthesis.cancel(); orb?.stop?.(); d.remove(); X.onAnswer = null; };
    const plain = t => String(t || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/[#*_>`|]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 1500);
    const say = t => new Promise(res => { const u = new SpeechSynthesisUtterance(plain(t)); u.rate = 1.03; u.onend = res; u.onerror = res; speechSynthesis.speak(u); });
    function listen() {
      if (!alive) return; state('Listening…');
      rec = new SR(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false;
      let finalT = '';
      rec.onresult = e => { let t = ''; for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalT = t; } d.querySelector('#vText').textContent = t; };
      rec.onerror = e => { if (e.error === 'not-allowed') { state('Microphone blocked', 'Allow the microphone for this site, then try again.'); alive = false; } };
      rec.onend = async () => {
        if (!alive) return;
        const t = finalT.trim(); if (!t) return setTimeout(listen, 250);
        if (/^(stop|goodbye|bye|that'?s all|end( voice mode)?)\.?$/i.test(t)) return end();
        state('Thinking…', t);
        const ans = new Promise(res => { X.onAnswer = res; });
        TR.send(t);
        const m = await ans; X.onAnswer = null; if (!alive) return;
        if (++turns === 1) quest('tq_voice');
        state('Speaking…', plain(m?.content).slice(0, 160) + '…'); await say(m?.content || 'Sorry, I couldn’t answer that.');
        setTimeout(listen, 200);
      };
      try { rec.start(); } catch {}
    }
    d.querySelector('#vEnd').onclick = end;
    d.querySelector('#vMute').onclick = () => { speechSynthesis.cancel(); try { rec?.abort(); } catch {} setTimeout(listen, 150); };
    listen();
  }

  // ============================================================ install as an app (and the Chrome extension)
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); X.bip = e; });
  addEventListener('appinstalled', () => { X.bip = null; toast('✓ Installed. Open Nexus Test Run from your apps.'); });
  function installTab() {
    const ios = /iPhone|iPad/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches;
    return `<div class="card"><h3>Install Test Run</h3>${standalone ? '<p class="muted">You’re using the installed app. Nice.</p>' : X.bip ? '<p class="muted">Add Test Run to your apps: its own window, a dock/taskbar icon, and it opens faster.</p><button class="btn primary sm" id="insGo">Install</button>' : ios ? '<p class="muted">On iPhone or iPad: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>' : '<p class="muted">In Chrome or Edge, use the install icon at the right end of the address bar (or ⋮ → <b>Install Nexus Test Run</b>).</p>'}</div>
      <div class="card"><h3>Chrome extension</h3><p class="muted">Nexus Test Run in Chrome’s side panel, next to whatever page you’re on.</p>
        <ol class="fine"><li>Download the extension and unzip it.</li><li>Open <b>chrome://extensions</b> and turn on <b>Developer mode</b>.</li><li>Click <b>Load unpacked</b> and pick the unzipped folder.</li><li>Click the Nexus icon in the toolbar.</li></ol>
        <a class="btn sm" href="../downloads/nexus-test-run-chrome.zip" download>Download the extension (.zip)</a></div>
      <div class="card"><h3>The full app</h3><p class="muted">Paragon, your files and screen, missions, N28C on your phone, desktop widgets and more. For Mac and Windows, free.</p><a class="btn sm primary" href="${APP_URL}" target="_blank" rel="noopener">Get Nexus ’28</a></div>`;
  }

  // ============================================================ memory & privacy tab
  function memoryTab() {
    return `<div class="card"><h3>🧠 Memory <span class="pill">${X.st.memory.length}</span></h3><p class="muted">Things your agents remember about you, in every chat (not temporary ones). Say “remember that …” in a chat, or add one here. “forget that …” removes it.</p>
        <label class="toggle"><input type="checkbox" id="memOn" ${X.st.memory_on !== false ? 'checked' : ''}> Use my memory in chats</label>
        <div class="row"><input id="memAdd" placeholder="Like: I’m in 10th grade and I play soccer" maxlength="300" style="flex:1"><button class="btn sm primary" id="memAddGo">Remember</button></div>
        <div class="mem-list">${X.st.memory.map(m => `<div class="mem-row"><span>${esc(m.text)}</span><button class="ib" data-memdel="${esc(m.id)}" title="Forget">✕</button></div>`).join('') || '<p class="fine">Nothing yet.</p>'}</div>
        ${X.st.memory.length ? '<button class="btn sm danger" id="memClear">Forget everything</button>' : ''}<p class="fine">It comes along when you bring your Test Run chats into the app.</p></div>
      <div class="card"><h3>Usage replays</h3><label class="toggle"><input type="checkbox" id="rpOn" ${store.get('replays', true) !== false ? 'checked' : ''}> Share anonymous usage replays to help improve Nexus</label>
        <p class="fine">Which screens and buttons you use and where things go wrong. Never what you type, your chats, memory or who you are (a random id for this browser). Kept 30 days.</p></div>
      ${S.guest ? '' : '<div class="card"><h3>🔗 Shared links</h3><div id="shList" class="fine">Loading…</div></div>'}`;
  }
  $('settings').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pxk || b.dataset.pxit || b.dataset.pxnone) return shopClick(b);
    if (b.id === 'pxJoin') return TR.guestJoin();
    if (b.id === 'pxSave') {
      const v = id => $(id).value;
      const { data, error } = await sb.rpc('profile_style_set', { p_style: { display_name: v('pxName').trim().slice(0, 32), status_text: v('pxStatus').slice(0, 60), pronouns: v('pxPron').slice(0, 24), bio: v('pxBio').slice(0, 160) } });
      toast(error ? error.message : data?.ok ? '✓ Profile saved' : data?.error || 'That didn’t work'); await loadAcct(true); return TR.paintSettings();
    }
    if (b.id === 'memAddGo') { const it = addMemory($('memAdd').value); if (it) quest('tq_memory'); return TR.paintSettings(); }
    if (b.dataset.memdel) { X.st.memory = X.st.memory.filter(m => m.id !== b.dataset.memdel); saveState(); return TR.paintSettings(); }
    if (b.id === 'memClear') { if (!confirm('Forget everything in your memory?')) return; X.st.memory = []; saveState(); return TR.paintSettings(); }
    if (b.id === 'insGo' && X.bip) { X.bip.prompt(); X.bip = null; return; }
    if (b.dataset.shstop) { if (!confirm('Stop sharing this chat? The link stops working.')) return; await sb.rpc('share_chat_stop', { p_id: b.dataset.shstop }); return paintShared(); }
    if (b.dataset.shcopy) { navigator.clipboard?.writeText(b.dataset.shcopy); toast('Copied', 1200); }
  });
  $('settings').addEventListener('change', e => {
    if (e.target.id === 'memOn') { X.st.memory_on = e.target.checked; saveState(); }
    if (e.target.id === 'rpOn') store.set('replays', e.target.checked);
  });
  async function paintShared() {
    const el = $('shList'); if (!el) return;
    const list = await sharedList();
    el.innerHTML = list.length ? list.map(x => `<div class="mem-row"><span><b>${esc(x.title || 'Chat')}</b> <small class="fine">${new Date(x.created_at).toLocaleDateString()} · ${x.views} view${x.views === 1 ? '' : 's'}${x.revoked ? ' · stopped' : ''}</small></span>${x.revoked ? '' : `<button class="btn sm" data-shcopy="${esc(SHARE_BASE + '?c=' + x.id)}">Copy</button><button class="btn sm danger" data-shstop="${esc(x.id)}">Stop</button>`}</div>`).join('') : 'You haven’t shared any chats. A chat’s ⋯ menu → Share as a link.';
  }

  // ============================================================ anonymous session replays
  function replays() {
    if (!window.NexusReplay) return;
    const screen = () => {
      if (!$('settings').hidden) return 'settings:' + TR.setTab;
      if (document.querySelector('.pal-wrap')) return 'palette'; if (document.querySelector('.voice-wrap')) return 'voice';
      if (document.querySelector('.review-sheet')) return 'study:review'; if (document.querySelector('.trx-study')) return 'study';
      if (!$('tour').hidden) return 'tour'; if ($('coach')) return 'chat+guide';
      return S.chat?.messages?.length ? 'chat' : 'chat:empty';
    };
    window.NexusReplay.start({ app: 'test_run', version: VERSION, device: window.NexusReplay.deviceId(() => store.get('replayDevice', ''), v => store.set('replayDevice', v)), enabled: () => store.get('replays', true) !== false, screen, variants: () => S.variants || {},
      send: p => fetch(SB_URL + '/rest/v1/rpc/replay_save', { method: 'POST', keepalive: true, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_app: 'test_run', p_version: VERSION, p_device: p.device, p_variants: p.variants, p_screen: p.screen, p_events: p.events, p_started: p.started }) }).catch(() => {}) });
  }

  // ============================================================ hooks try.js calls
  function afterAnswer(msg, o) {
    if (!msg || msg.error) { X.onAnswer?.(msg); return; }
    const c = bump('sent'); if (c >= 3) quest('tq_chat3');
    if (o.web) quest('tq_web'); if (o.feats?.length) quest('tq_feat');
    const ags = new Set([...(counts().agents || []), o.agent]); { const cc = counts(); cc.agents = [...ags]; store.set('qcount:' + uid(), cc); } if (ags.size >= 2) quest('tq_agent');
    if (X.pend.starter) { X.pend.starter = false; quest('tq_starter'); }
    if (X.space && S.chat?.id && !X.st.chat_space[S.chat.id] && !S.chat.incognito) moveChat(S.chat.id, X.space);
    const k = appAddsFor(o.text); if (k && !(S.chat.messages || []).some(m => m !== msg && m.appAdds === k)) { msg.appAdds = k; TR.paintFeed(); TR.save(); }
    guideEvent({ answer: true, agent: o.agent, feats: !!o.feats?.length });
    X.onAnswer?.(msg);
  }
  $('msgs').addEventListener('click', e => {
    if (e.target.closest('[data-handoff]')) return handoff();
    const h = e.target.closest('[data-aahide]'); if (h) { const m = S.chat?.messages[+h.dataset.aahide]; if (m) { m.appAddsHidden = true; TR.paintFeed(); TR.save(); } }
  });
  const hookSettings = () => {
    const tabs = $('setTabs'); if (!tabs || tabs.querySelector('[data-t="profile"]')) return;
    tabs.querySelector('[data-t="account"]')?.insertAdjacentHTML('afterend', '<button data-t="profile">Profile &amp; shop</button><button data-t="memory">Memory</button>');
    tabs.insertAdjacentHTML('beforeend', '<button data-t="install">Install</button>');
  };
  hookSettings();
  // the ? button: guided first run or the full tour
  $('helpBtn').onclick = e => { const m = pop(e.currentTarget, `<button data-h="g">✨ Guided first run</button><button data-h="t">🗺 Full tour</button><button data-h="k">⌨ Keyboard shortcuts</button><button data-h="p">⌘ Command palette</button>`); m.onclick = ev => { const a = ev.target.closest('[data-h]')?.dataset.h; m.remove(); if (a === 'g') guided(0); if (a === 't') TR.tour(0); if (a === 'k') shortcuts(); if (a === 'p') palette(); }; };
  // a Study button in the sidebar
  if (!$('studyBtn')) $('newChat')?.insertAdjacentHTML('afterend', '<button class="btn" id="studyBtn" title="Study decks" aria-label="Study decks">📚</button>');
  $('studyBtn') && ($('studyBtn').onclick = () => studyHome());

  window.TRX = {
    intercept, systemExtra, afterAnswer, msgExtra, paintStarters, guided: () => guided(0),
    chatHidden: c => !!X.space && X.st.chat_space[c.id] !== X.space,
    chatMenuItems: c => `<button data-a="space">🗂 Move to a Space</button><button data-a="share">🔗 Share as a link</button>`,
    async chatMenuAction(a, c, id) {
      if (a === 'share') { await shareChat(c); return true; }
      if (a === 'app') { handoff(id); return true; }
      if (a === 'space') {
        const anchor = document.querySelector(`[data-more="${CSS.escape(String(id))}"]`) || $('chatList');
        const m = pop(anchor, `<button data-ms="">No Space</button>${X.st.spaces.map(s => `<button data-ms="${esc(s.id)}"><i class="dot" style="background:${esc(s.color)}"></i>${esc(s.name)}</button>`).join('')}<button data-ms="__new">＋ New Space…</button>`);
        m.onclick = e2 => { const b = e2.target.closest('[data-ms]'); if (!b) return; m.remove(); let sp = b.dataset.ms; if (sp === '__new') { const n = addSpace(); if (!n) return; sp = n.id; } moveChat(id, sp); };
        return true;
      }
      return false;
    },
    settingsTab(t) { setTimeout(() => { if (t === 'memory') paintShared(); }, 0); if (t === 'profile') { setTimeout(() => guideEvent({ profile: true }), 0); return profileTab(); } if (t === 'memory') return memoryTab(); if (t === 'install') return installTab(); return ''; },
    enter() {
      if (X.entered === uid()) return; X.entered = uid();
      hookSettings(); loadState(); loadQuests(); replays();
      if (!S.chat?.messages?.length) TR.paintEmpty();   // the starters by category (the empty screen was drawn before this file loaded)
      const fork = new URLSearchParams(location.search).get('fork'); if (fork && /^[A-Za-z0-9]{10,16}$/.test(fork)) setTimeout(() => forkShared(fork), 900);
    },
    // for tests
    _: { gradeCard, parseCards, appAddsFor, STARTERS, X }
  };
  // signed in before this file loaded (a fast session check): start now; otherwise try.js calls enter() when you sign in
  if (S.user) window.TRX.enter();
})();
