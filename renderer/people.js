// People (4.0): friends on Nexus. Add someone by username, accept requests, see their profile card (frame, name style,
// bio, streak), invite them to a Shared Space, answer Space invites, block or report. Opens from ☰ → People and ⌘K.
//   NexusPeople.mount({ api, toast }) → { open(tab?) }
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = t => { if (!t) return ''; const s = (Date.now() - Date.parse(t)) / 1000; return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
  function mount({ api, toast = () => {} }) {
    let box = null, tab = 'friends', data = null, invites = [], spaces = [], err = '';
    const NC = () => window.NexusCosmetics;
    async function load() {
      const [f, i, sp] = await Promise.all([api.social.friends(), api.social.invites(), api.shared?.list?.().catch(() => null)]);
      if (!f.ok) { err = f.error; data = null; } else { err = ''; data = f; }
      invites = i.ok ? i.list || [] : []; spaces = sp?.ok ? sp.spaces || [] : [];
    }
    function cardHtml(p, actions) { return (NC() ? NC().card(p, { size: 'mini' }) : `<b>${esc(p.username)}</b>`) + `<div class="pp-acts">${actions}</div>`; }
    function paint() {
      if (!box) return;
      const fr = data?.friends || [], inc = data?.incoming || [], out = data?.outgoing || [];
      const badge = n => n ? ` <i class="pp-n">${n}</i>` : '';
      box.querySelector('.pp-body').innerHTML = err ? `<div class="pp-empty"><b>People needs your Nexus account</b><span>${esc(err)}</span></div>` : `
        <div class="pp-tabs">${[['friends', 'Friends', fr.length], ['requests', 'Requests', inc.length], ['invites', 'Space invites', invites.length], ['add', 'Add a friend', 0]].map(([k, l, n]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}${k !== 'friends' ? badge(n) : ` <small>${n}</small>`}</button>`).join('')}</div>
        ${tab === 'friends' ? (fr.length ? `<div class="pp-list">${fr.sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0)).map(p => `<div class="pp-item" data-id="${esc(p.id)}">${cardHtml(p, `<button class="ghost-btn" data-view="${esc(p.username)}">Profile</button>${spaces.length ? `<button class="ghost-btn" data-inv="${esc(p.id)}">Invite to a Space</button>` : ''}<span class="pp-seen">${p.online ? 'online' : p.last_seen ? 'seen ' + ago(p.last_seen) : ''}</span>`)}</div>`).join('')}</div>` : '<div class="pp-empty"><b>No friends yet</b><span>Add someone by their username to study together, share Spaces and see each other\'s profiles.</span><button class="ghost-btn primary" data-tab="add">Add a friend</button></div>') : ''}
        ${tab === 'requests' ? `${inc.length ? `<div class="pp-h">WANT TO BE FRIENDS</div><div class="pp-list">${inc.map(p => `<div class="pp-item">${cardHtml(p, `<button class="ghost-btn primary" data-yes="${esc(p.id)}">Accept</button><button class="ghost-btn" data-no="${esc(p.id)}">Decline</button><button class="link-btn" data-blk="${esc(p.id)}">Block</button>`)}</div>`).join('')}</div>` : '<div class="pp-empty"><span>No requests right now.</span></div>'}
          ${out.length ? `<div class="pp-h">YOU ASKED</div><div class="pp-list">${out.map(p => `<div class="pp-item">${cardHtml(p, `<span class="pp-seen">waiting</span><button class="link-btn" data-unreq="${esc(p.id)}">Cancel</button>`)}</div>`).join('')}</div>` : ''}
          ${(data?.blocked || []).length ? `<div class="pp-h">BLOCKED</div>${data.blocked.map(b => `<div class="pp-row"><span>@${esc(b.username || 'someone')}</span><button class="link-btn" data-unblk="${esc(b.id)}">Unblock</button></div>`).join('')}` : ''}` : ''}
        ${tab === 'invites' ? (invites.length ? `<div class="pp-list">${invites.map(i => `<div class="pp-inv"><i style="background:${esc(i.color || '#3dffa0')}"></i><div><b>${esc(i.name)}</b><small>${i.members} member${i.members === 1 ? '' : 's'} · from @${esc(i.from?.username || 'a friend')} · ${ago(i.at)}</small></div><button class="ghost-btn primary" data-join="${esc(i.space_id)}">Join</button><button class="ghost-btn" data-skip="${esc(i.space_id)}">No thanks</button></div>`).join('')}</div>` : '<div class="pp-empty"><span>No Space invites. Friends can invite you to their Shared Spaces.</span></div>') : ''}
        ${tab === 'add' ? `<div class="pp-add"><div class="row"><input id="ppUser" placeholder="Their username, like @alex" maxlength="40" autocomplete="off"><button class="ghost-btn" data-look>Look up</button><button class="ghost-btn primary" data-req>Send request</button></div><div class="note" id="ppNote">They get a notification and can say yes from People.</div><div id="ppFound"></div></div>` : ''}`;
    }
    function view(card) {
      const p = card, rel = p.relation;
      if (!p.self && p.id) api.social.visit?.(p.id);   // 4.1.0: they see you looked (unless you're invisible)
      const pop = document.createElement('div'); pop.className = 'modal'; pop.innerHTML = `<div class="modal-box pp-view">${NC() ? NC().card(p) + (NC().detailsHtml ? NC().detailsHtml(p) : '') : ''}
        <div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">${p.self ? '<span class="note" style="flex:1">This is how other people see your profile. Only friends see the details under it.</span>' : rel === 'friend' ? `<button class="ghost-btn" data-rm="${esc(p.id)}">Remove friend</button>` : rel === 'incoming' ? `<button class="ghost-btn primary" data-yes="${esc(p.id)}">Accept</button>` : rel === 'requested' ? '<span class="note">Request sent</span>' : `<button class="ghost-btn primary" data-reqid="${esc(p.username)}">Add friend</button>`}
        ${p.self ? '' : `<button class="link-btn" data-rep="${esc(p.id)}" data-name="${esc(p.username)}">Report</button><button class="link-btn" data-blk="${esc(p.id)}">Block</button>`}<button class="ghost-btn" data-x>Close</button></div></div>`;
      document.body.appendChild(pop);
      pop.addEventListener('click', async e => { if (e.target === pop || e.target.closest('[data-x]')) return pop.remove(); const b = e.target.closest('button'); if (!b) return; await act(b); pop.remove(); });
    }
    async function act(b) {
      const d = b.dataset, run = async (p, msg) => { const r = await p; if (!r.ok) { toast(r.error || 'That didn\'t work.'); return false; } if (msg) toast(msg); await load(); paint(); return true; };
      if (d.tab) { tab = d.tab; return paint(); }
      if (d.yes) return run(api.social.respond(d.yes, true), 'You\'re friends now.');
      if (d.no) return run(api.social.respond(d.no, false));
      if (d.unreq) return run(api.social.respond(d.unreq, false));
      if (d.rm) { if (!confirm('Remove this friend?')) return; return run(api.social.remove(d.rm), 'Removed.'); }
      if (d.blk) { if (!confirm('Block them? They can\'t find you, add you or invite you, and you won\'t see each other in search.')) return; return run(api.social.block(d.blk, true), 'Blocked.'); }
      if (d.unblk) return run(api.social.block(d.unblk, false), 'Unblocked.');
      if (d.join) return run(api.social.inviteRespond(d.join, true), 'You joined the Space. It\'s in Study → Shared Spaces.');
      if (d.skip) return run(api.social.inviteRespond(d.skip, false));
      if (d.view) { const r = await api.social.card(d.view); if (!r.ok) return toast(r.error); return view(r.card); }
      if (d.reqid) return run(api.social.request(d.reqid), 'Request sent.');
      if (d.rep) {   // a small chooser (window.prompt doesn't work in the app)
        const why = await new Promise(res => { const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="modal-box" style="width:min(380px,92%);gap:8px"><b>Report @${esc(d.name)}</b><span class="note">What's wrong with this profile?</span>${[['spam', 'Spam'], ['harassment', 'Harassment'], ['inappropriate', 'Inappropriate'], ['other', 'Something else']].map(([k, l]) => `<button class="ghost-btn" data-why="${k}">${l}</button>`).join('')}<button class="link-btn" data-why="">Cancel</button></div>`; document.body.appendChild(m); m.addEventListener('click', e => { const w = e.target.closest('[data-why]'); if (!w && e.target !== m) return; m.remove(); res(w ? w.dataset.why : ''); }); });
        if (!why) return; return run(api.social.report({ kind: 'profile', target: d.rep, label: '@' + d.name, reason: why }), 'Reported. The Apoji Team will look at it.');
      }
      if (d.inv) {
        const pick = document.createElement('div'); pick.className = 'pp-pick'; pick.innerHTML = `<b>Invite to…</b>${spaces.map(s => `<button data-invsp="${esc(s.id)}"><i style="background:${esc(s.color)}"></i>${esc(s.name)}</button>`).join('')}`;
        b.closest('.pp-acts').appendChild(pick);
        pick.addEventListener('click', async e => { const t = e.target.closest('[data-invsp]'); if (!t) return; e.stopPropagation(); const r = await api.social.invite(t.dataset.invsp, d.inv); pick.remove(); toast(r.ok ? (r.already ? 'They\'re already in that Space.' : 'Invite sent.') : r.error); });
        return;
      }
      if (d.look !== undefined || d.req !== undefined) {
        const u = box.querySelector('#ppUser').value.trim(); if (!u) return;
        if (d.look !== undefined) { const r = await api.social.card(u); box.querySelector('#ppFound').innerHTML = r.ok ? `<div class="pp-item">${cardHtml(r.card, r.card.relation === 'friend' ? '<span class="pp-seen">already friends</span>' : `<button class="ghost-btn primary" data-reqid="${esc(r.card.username)}">Send request</button>`)}</div>` : `<div class="note err">${esc(r.error)}</div>`; return; }
        const r = await api.social.request(u); box.querySelector('#ppNote').textContent = r.ok ? (r.status === 'friend' ? 'You\'re friends now (they had asked you too).' : 'Request sent.') : r.error;
        if (r.ok) { await load(); }
      }
    }
    async function open(t) {
      if (t) tab = t;
      if (!box) {
        box = document.createElement('div'); box.className = 'modal'; box.id = 'peopleModal';
        box.innerHTML = '<div class="modal-box pp-box"><div class="modal-head"><b>People</b><button class="icon-btn" data-x title="Close">✕</button></div><div class="pp-body"><div class="note">Loading…</div></div></div>';
        document.body.appendChild(box);
        box.addEventListener('click', async e => { if (e.target === box || e.target.closest('[data-x]')) { box.hidden = true; return; } const b = e.target.closest('button'); if (b && !b.closest('.pp-pick')) act(b); });
        box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'ppUser') box.querySelector('[data-req]')?.click(); if (e.key === 'Escape') box.hidden = true; });
      }
      box.hidden = false; await load(); paint();
    }
    window.NexusPeople.view = view;
    document.addEventListener('click', e => { const v = e.target.closest?.('[data-pview]'); if (v) window.NexusPeople.viewByName(v.dataset.pview); });   // names and pictures in Spaces chat   // 4.0.4: anyone can open a profile card (Profile page, Spaces chat)
    window.NexusPeople.viewByName = async u => { const r = await api.social.card(String(u || '').replace(/^@/, '')); if (!r.ok) { toast(r.error); return; } view(r.card); };
    return { open, refresh: async () => { await load(); paint(); }, counts: () => ({ requests: data?.incoming?.length || 0, invites: invites.length }) };
  }
  window.NexusPeople = { mount };
})();
