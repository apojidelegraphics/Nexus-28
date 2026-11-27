// 3.13 desktop widgets: streak, weekly goals, reminders, today's challenge, cards to review and a clock, in a small panel you
// can drag anywhere (Settings → General → Desktop widgets). No emojis: every icon is drawn here.
(function () {
  const api = window.nexus, $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = { flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 4 0-3 0-5 0-7z"/>', target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M5 4 3 6M19 4l2 2"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', cards: '<rect x="4" y="7" width="13" height="13" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v10"/>',
    check: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', dot: '<circle cx="12" cy="12" r="8"/>', clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
    ask: '<path d="M4 5h16v11H9l-5 4z"/><path d="M9 10h6"/>', focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z"/>', play: '<path d="M8 5v14l11-7z"/>', pause: '<path d="M8 5v14M16 5v14"/>', next: '<path d="M6 5v14l9-7zM18 5v14"/>', prev: '<path d="M18 5v14l-9-7zM6 5v14"/>', snooze: '<circle cx="12" cy="13" r="7"/><path d="M10 11h4l-4 4h4"/>', bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>', pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' };
  const ic = n => `<svg viewBox="0 0 24 24">${I[n]}</svg>`;
  const tm = ms => { const d = new Date(ms), today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  let state = null, extra = {}, flipped = false;
  const fmtLeft = ms => { const m = Math.floor(ms / 60000), x = Math.floor(ms % 60000 / 1000); return m + ':' + String(x).padStart(2, '0'); };
  const card = (k, icon, title, small, body) => `<div class="dw" data-k="${k}"><h4>${ic(icon)}<span>${title}</span>${small ? `<small>${small}</small>` : ''}</h4>${body}</div>`;
  function paint() {
    if (!state) return;
    if (document.activeElement?.closest?.('[data-ask],[data-jot]') && document.activeElement.value) return;   // don't wipe what you're typing
    const { cfg, data: d } = state, g = d.goals || {}, out = [];
    document.body.className = document.body.className.replace(/\bwt-[a-z0-9_-]+/g, '').trim() + ' wt-' + (cfg.theme || 'frost');   // 4.3.0 widget theme
    for (const k of cfg.items) {
      if (k === 'streak') out.push(card(k, 'flame', 'STREAK', d.best ? `best ${d.best}` : '', `<div class="big"><b>${d.streak || 0}</b><span class="muted">day${d.streak === 1 ? '' : 's'} in a row<br>${(d.points || 0).toLocaleString()} Cirkts</span></div>`));
      if (k === 'goals') out.push(card(k, 'target', 'THIS WEEK', g.total ? `${g.done}/${g.total}` : '', g.total ? `<ul>${(g.items || []).slice(0, 5).map(i => `<li class="tick ${i.done ? 'done' : ''}" data-goal="${esc(i.id || '')}" title="Click to tick it off">${ic(i.done ? 'check' : 'dot')}<span>${esc(i.text)}</span></li>`).join('')}</ul><div class="bar"><i style="width:${Math.round(g.done / g.total * 100)}%"></i></div>` : '<span class="muted">No goals yet. </span><button class="open" data-open="goals">Add some</button>'));
      if (k === 'reminders') out.push(card(k, 'alarm', 'COMING UP', '', (d.reminders || []).length ? `<ul>${d.reminders.slice(0, 3).map(r => `<li class="rem"><time>${esc(tm(r.at))}</time><span>${esc(r.title)}</span>${r.id ? `<em><button class="mini" data-snooze="${esc(r.id)}" title="In an hour">${ic('snooze')}</button><button class="mini" data-done="${esc(r.id)}" title="Done">${ic('check')}</button></em>` : ''}</li>`).join('')}</ul>` : '<span class="muted">No reminders. Say “remind me…” in a chat.</span>'));
      if (k === 'challenge' && !d.challenge) out.push(card(k, 'star', 'TODAY', '', '<span class="muted">No challenge right now.</span>'));   // 4.0.2: each widget is its own window, so it always shows something
      if (k === 'challenge' && d.challenge) out.push(card(k, 'star', 'TODAY', d.challenge.done ? 'done' : `${d.challenge.progress || 0}/${d.challenge.n || 1}`, `<span${d.challenge.done ? ' class="muted"' : ''}>${esc(d.challenge.text)}</span>`));
      if (k === 'study') out.push(card(k, 'cards', 'STUDY', '', d.due ? `<div class="big"><b>${d.due}</b><span class="muted">card${d.due === 1 ? '' : 's'} to review</span></div><button class="open" data-open="study">Review now</button>` : '<span class="muted">No cards due. Nice.</span>'));
      if (k === 'clock') { const n = new Date(); out.push(card(k, 'clock', n.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase(), n.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), `<div class="clock"><b>${n.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</b></div>`)); }
      // 4.1.0 smart and new widgets
      if (k === 'nextup') { const n = d.nextup || []; out.push(card(k, 'bolt', 'NEXT UP', '', n.length ? `<ul class="nu">${n.map(x => `<li class="nu-${x.kind}${x.late ? ' late' : ''}"${x.open ? ` data-open="${esc(x.open)}"` : x.kind === 'goal' && x.id ? ` data-goal="${esc(x.id)}"` : ''}>${ic(x.icon)}<span>${esc(x.text)}</span><em>${x.at ? esc(x.late ? 'late' : tm(x.at)) : x.endsAt ? `<b data-left="${x.endsAt}">${fmtLeft(Math.max(0, x.endsAt - Date.now()))}</b>` : esc(x.progress || x.small || '')}</em></li>`).join('')}</ul>` : '<span class="muted">All clear. Nothing coming up.</span>')); }
      if (k === 'quests') { const q = d.quests; out.push(card(k, 'star', 'QUESTS', q ? (q.all ? 'all done' : `${q.done}/3`) : '', q ? `<ul>${q.list.map(x => `<li class="${x.done ? 'done' : ''}">${ic(x.done ? 'check' : 'dot')}<span>${esc(x.text)}</span><em class="muted">${x.done ? '' : `${x.progress}/${x.n} · `}+${x.reward}</em></li>`).join('')}</ul>${q.all ? '' : `<small class="muted">All three: +${q.bonus} more</small>`}` : '<span class="muted">Quests show up once Nexus has counted today.</span>')); }
      if (k === 'jot') out.push(card(k, 'pen', 'JOT', '', `<form class="ask" data-jot><input placeholder="A quick note…" maxlength="2000"><button title="Save">${ic('check')}</button></form><small class="muted jot-note">Saved to <a href="#" data-open="jots">Jots &amp; Docs</a> in Nexus.</small>`));   // 4.2.0: jots aren't listed here anymore
      if (k === 'visitors') { const v = extra.visitors, NC = window.NexusCosmetics; out.push(card(k, 'eye', 'PROFILE VISITORS', 'this week', v ? `<div class="big"><b>${(v.total || 0).toLocaleString()}</b><span class="vis">${(v.list || []).map(x => NC ? NC.avatarHtml(x.avatar, x.name, x.frame, 24, { custom: x.custom, frameImg: x.frameImg }) : '').join('')}</span></div>` : '<span class="muted">Sign in to see who looked at your profile.</span>')); }
      // 4.0 interactive widgets
      if (k === 'ask') out.push(card(k, 'ask', 'ASK NEXUS', '', `<form class="ask" data-ask><input placeholder="Ask anything…" maxlength="2000"><button title="Ask">${ic('play')}</button></form>`));
      if (k === 'focus') { const f = extra.focus || {}; out.push(card(k, 'focus', 'FOCUS', f.on ? (f.phase === 'break' ? 'break' : `block ${f.block}/${f.blocks}`) : '', f.on ? `<div class="big"><b data-left="${f.endsAt || 0}">${fmtLeft(f.left || 0)}</b><span class="muted">${f.paused ? 'paused' : f.phase === 'break' ? 'take a break' : 'focusing'}${f.task ? '<br>' + esc(f.task) : ''}</span></div><button class="open" data-act="focus">Stop</button>` : `<span class="muted">25 minutes, notifications held.</span><button class="open" data-act="focus">Start focus</button>`)); }
      if (k === 'flashcard') { const c = extra.card; out.push(card(k, 'cards', 'FLASHCARD', d.due ? `${d.due} due` : '', c ? `<div class="fc ${flipped ? 'flip' : ''}" data-flip><b>${esc(flipped ? c.back : c.front)}</b><small class="muted">${flipped ? 'How well did you know it?' : 'Click to flip'}</small></div>${flipped ? `<div class="grades"><button data-grade="0" data-id="${esc(c.id)}">Again</button><button data-grade="1" data-id="${esc(c.id)}">Hard</button><button data-grade="2" data-id="${esc(c.id)}">Good</button><button data-grade="3" data-id="${esc(c.id)}">Easy</button></div>` : ''}` : '<span class="muted">No cards due. Nice.</span>')); }
      if (k === 'music') out.push(card(k, 'note', extra.media ? esc(String(extra.media.app || 'NOW PLAYING').toUpperCase()) : 'NOW PLAYING', '', extra.music ? `<span class="np">${esc(extra.music.replace(/\shttps?:\S+$/, '').replace(/ \(\d+s of \d+s\)\.?/, ''))}</span><div class="ctl"><button class="mini" data-music="previous" title="Back">${ic('prev')}</button><button class="mini" data-music="${/^Playing/.test(extra.music) ? 'pause' : 'resume'}" title="Play/pause">${ic(/^Playing/.test(extra.music) ? 'pause' : 'play')}</button><button class="mini" data-music="next" title="Next">${ic('next')}</button></div>` : '<span class="muted">Nothing playing. Turn on Now playing or connect Spotify: Settings → Connectors → Media.</span>'));
      if (k === 'weather') { const w = extra.weather; out.push(card(k, 'cloud', 'WEATHER', w ? esc(w.place || '') : '', w ? `<div class="big"><b>${esc(String(w.temp))}<small>${esc(w.unit || '')}</small></b><span class="muted">${esc(w.text || '')}${w.hi != null ? `<br>High ${esc(String(w.hi))}° · Low ${esc(String(w.lo))}°` : ''}</span></div>` : '<span class="muted">Set your location in Nexus: Settings → Connectors → Weather.</span>')); }
    }
    $('w').innerHTML = out.join('') || '<div class="dw"><span class="muted">Pick widgets in Nexus: Settings → General → Desktop widgets.</span></div>';
    api.deskWidgets.size($('w').scrollHeight);
  }
  const act = async a => { await api.deskWidgets.action(a); await loadExtra(); };
  async function loadExtra() { if (!state) return; if (state.cfg.items.some(k => ['focus', 'flashcard', 'music', 'weather', 'visitors'].includes(k))) { try { extra = await api.deskWidgets.extra(); } catch {} } paint(); }
  $('w').addEventListener('submit', e => { const j = e.target.closest('[data-jot]'); if (!j) return; e.preventDefault(); e.stopImmediatePropagation(); const v = j.querySelector('input').value.trim(); if (v) { act({ type: 'jot', text: v }); j.querySelector('input').value = ''; } }, true);
  $('w').addEventListener('submit', e => { e.preventDefault(); const f = e.target.closest('[data-ask]'); if (!f) return; const v = f.querySelector('input').value.trim(); if (v) { act({ type: 'ask', text: v }); f.querySelector('input').value = ''; } });
  $('w').addEventListener('click', e => {
    const b = e.target.closest('[data-open]'); if (b) return api.deskWidgets.open(b.dataset.open);
    const g = e.target.closest('[data-goal]'); if (g && g.dataset.goal) { g.classList.toggle('done'); return act({ type: 'goal', id: g.dataset.goal }); }
    const dn = e.target.closest('[data-done]'); if (dn) return act({ type: 'reminderDone', id: dn.dataset.done });
    const sz = e.target.closest('[data-snooze]'); if (sz) return act({ type: 'snooze', id: sz.dataset.snooze });
    const a = e.target.closest('[data-act]'); if (a) return act({ type: a.dataset.act });
    const fl = e.target.closest('[data-flip]'); if (fl) { flipped = !flipped; return paint(); }
    const gr = e.target.closest('[data-grade]'); if (gr) { flipped = false; return act({ type: 'grade', id: gr.dataset.id, grade: +gr.dataset.grade }); }
    const m = e.target.closest('[data-music]'); if (m) return act({ type: 'music', action: m.dataset.music, ...(extra?.media ? { source: 'media', app: extra.media.app } : {}) });
  });
  $('w').addEventListener('dblclick', e => { const c = e.target.closest('[data-k]'); if (c) api.deskWidgets.open(c.dataset.k); });
  api.deskWidgets.onData(s => { state = s; loadExtra(); });
  api.init().then(b => window.NexusTheme?.apply(b.settings)).catch(() => {});
  api.onSettings?.(s => window.NexusTheme?.apply(s));
  api.deskWidgets.get().then(s => { state = s; loadExtra(); });
  setInterval(() => { if (state?.cfg.items.includes('clock')) paint(); }, 20e3);
  setInterval(() => { document.querySelectorAll('[data-left]').forEach(el => { const end = +el.dataset.left; if (end) el.textContent = fmtLeft(Math.max(0, end - Date.now())); }); }, 1000);   // 4.0 focus countdown
  setInterval(() => { if (state?.cfg.items.some(k => k === 'music' || k === 'focus')) loadExtra(); }, 30e3);
  // 4.0.1: resize the window whenever the widgets change size (a flipped card, a new reminder, music info)
  try { let last = 0; new ResizeObserver(() => { const h = $('w').scrollHeight; if (Math.abs(h - last) > 2) { last = h; api.deskWidgets.size(h); } }).observe($('w')); } catch {}
})();
