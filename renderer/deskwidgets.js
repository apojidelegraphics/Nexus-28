// 3.13 desktop widgets: streak, weekly goals, reminders, today's challenge, cards to review and a clock, in a small panel you
// can drag anywhere (Settings → General → Desktop widgets). No emojis: every icon is drawn here.
(function () {
  const api = window.nexus, $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = { flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 4 0-3 0-5 0-7z"/>', target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M5 4 3 6M19 4l2 2"/>', star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', cards: '<rect x="4" y="7" width="13" height="13" rx="2"/><path d="M8 4h10a2 2 0 0 1 2 2v10"/>',
    check: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', dot: '<circle cx="12" cy="12" r="8"/>', clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>' };
  const ic = n => `<svg viewBox="0 0 24 24">${I[n]}</svg>`;
  const tm = ms => { const d = new Date(ms), today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  let state = null;
  const card = (k, icon, title, small, body) => `<div class="dw" data-k="${k}"><h4>${ic(icon)}<span>${title}</span>${small ? `<small>${small}</small>` : ''}</h4>${body}</div>`;
  function paint() {
    if (!state) return;
    const { cfg, data: d } = state, g = d.goals || {}, out = [];
    for (const k of cfg.items) {
      if (k === 'streak') out.push(card(k, 'flame', 'STREAK', d.best ? `best ${d.best}` : '', `<div class="big"><b>${d.streak || 0}</b><span class="muted">day${d.streak === 1 ? '' : 's'} in a row<br>${(d.points || 0).toLocaleString()} points</span></div>`));
      if (k === 'goals') out.push(card(k, 'target', 'THIS WEEK', g.total ? `${g.done}/${g.total}` : '', g.total ? `<ul>${(g.items || []).slice(0, 5).map(i => `<li class="${i.done ? 'done' : ''}">${ic(i.done ? 'check' : 'dot')}<span>${esc(i.text)}</span></li>`).join('')}</ul><div class="bar"><i style="width:${Math.round(g.done / g.total * 100)}%"></i></div>` : '<span class="muted">No goals yet. </span><button class="open" data-open="goals">Add some</button>'));
      if (k === 'reminders') out.push(card(k, 'alarm', 'COMING UP', '', (d.reminders || []).length ? `<ul>${d.reminders.slice(0, 3).map(r => `<li><time>${esc(tm(r.at))}</time><span>${esc(r.title)}</span></li>`).join('')}</ul>` : '<span class="muted">No reminders. Say “remind me…” in a chat.</span>'));
      if (k === 'challenge' && d.challenge) out.push(card(k, 'star', 'TODAY', d.challenge.done ? 'done' : `${d.challenge.progress || 0}/${d.challenge.n || 1}`, `<span${d.challenge.done ? ' class="muted"' : ''}>${esc(d.challenge.text)}</span>`));
      if (k === 'study') out.push(card(k, 'cards', 'STUDY', '', d.due ? `<div class="big"><b>${d.due}</b><span class="muted">card${d.due === 1 ? '' : 's'} to review</span></div><button class="open" data-open="study">Review now</button>` : '<span class="muted">No cards due. Nice.</span>'));
      if (k === 'clock') { const n = new Date(); out.push(card(k, 'clock', n.toLocaleDateString(undefined, { weekday: 'long' }).toUpperCase(), n.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), `<div class="clock"><b>${n.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</b></div>`)); }
    }
    $('w').innerHTML = out.join('') || '<div class="dw"><span class="muted">Pick widgets in Nexus: Settings → General → Desktop widgets.</span></div>';
    api.deskWidgets.size(document.body.scrollHeight);
  }
  $('w').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) api.deskWidgets.open(b.dataset.open); });
  $('w').addEventListener('dblclick', e => { const c = e.target.closest('[data-k]'); if (c) api.deskWidgets.open(c.dataset.k); });
  api.deskWidgets.onData(s => { state = s; paint(); });
  api.init().then(b => window.NexusTheme?.apply(b.settings)).catch(() => {});
  api.onSettings?.(s => window.NexusTheme?.apply(s));
  api.deskWidgets.get().then(s => { state = s; paint(); });
  setInterval(() => { if (state?.cfg.items.includes('clock')) paint(); }, 20e3);
})();
