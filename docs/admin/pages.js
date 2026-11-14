// Admin portal pages (v2.2): dashboard, beta requests, feedback & bugs, reports, users, moderation, feature flags,
// announcements, maintenance, audit log and your settings.
(function () {
  const { sb, $, esc, when, ago, rpc, toast, av, nameOf, presence, PRES, main } = NX;
  const A = NX.A, P = NX.pages;
  const live = (tables, fn, ms = 1500) => { let t; const offs = tables.map(tb => NX.on(tb, () => { clearTimeout(t); t = setTimeout(fn, ms); })); const tab = A.tab; const stop = NX.on('poll', () => { if (A.tab === tab) fn(); }); const check = setInterval(() => { if (A.tab !== tab) { offs.forEach(o => o()); stop(); clearInterval(check); } }, 1000); };
  const sqlHint = e => NX.needSql(e.message) ? ' Run supabase/nexus-v2.2.sql in the SQL editor first.' : '';
  const csv = rows => rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  function download(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  // =========================================================== Dashboard
  P.dashboard = async () => {
    const days = NX.store.get('dashDays', 30);
    if (!$('dash')) main(`<h1>Dashboard <span class="muted" id="dUpd" style="font-size:12px;font-weight:400"></span></h1><p>How Nexus is doing right now. Updates by itself.</p><div id="dash"><div class="empty"><span class="spinner"></span></div></div>`);
    let d; try { d = await rpc('admin_dashboard', { p_days: days }); } catch (e) { return main(`<h1>Dashboard</h1><div class="card err">${esc(e.message)}</div>`); }
    if (A.tab !== 'dashboard') return;
    const t = d.totals, rows = d.series || [];
    const tile = (n, l, tab, hot) => `<${tab ? `button data-go="${tab}"` : 'div'} class="stat ${hot && n ? 'hot' : ''}"><b>${(+n || 0).toLocaleString()}</b><span>${esc(l)}</span></${tab ? 'button' : 'div'}>`;
    const online = A.admins.filter(a => presence(a) !== 'offline');
    const tableOn = NX.store.get('dashTable', false);
    $('dash').innerHTML = `
      ${t.maintenance_on ? `<div class="banner warn">🛠 <span style="flex:1">${t.maintenance_on} maintenance switch${t.maintenance_on === 1 ? ' is' : 'es are'} on right now.</span><button class="btn sm" data-go="maint">Manage</button></div>` : ''}
      <div class="grid">${tile(t.users, 'accounts', 'users')}${tile(t.new_7d, 'new this week', 'users')}${tile(t.active_today, 'active today')}${tile(t.active_7d, 'active this week')}
        ${tile(t.online_now, 'using Nexus now')}${tile(t.pending_requests, 'beta requests waiting', 'requests', 1)}${tile(t.new_feedback, 'new feedback & bugs', 'feedback', 1)}${tile(t.open_reports, 'open reports', 'reports', 1)}
        ${tile(t.beta_testers, 'beta testers', 'users')}${tile(t.moderated, 'suspended / banned', 'users')}${tile(t.spaces, 'Shared Spaces', 'moderation')}${tile(t.shared_agents, 'shared agents', 'moderation')}</div>
      <div class="row" style="margin-bottom:10px"><div class="tabsub" id="dRange" style="margin:0">${[14, 30, 90].map(n => `<button data-days="${n}" class="${n === days ? 'on' : ''}">${n} days</button>`).join('')}</div><span class="sp"></span>
        <label class="muted" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="dTable" ${tableOn ? 'checked' : ''}> Show numbers as tables</label></div>
      <div class="cols3">
        <div class="card"><h3>Active people per day</h3><div id="cActive"></div></div>
        <div class="card"><h3>Admins online <span class="muted">${online.length} of ${A.admins.length}</span></h3><div class="members">${A.admins.slice().sort((a, b) => ({ online: 0, idle: 1, dnd: 2, offline: 3 })[presence(a)] - ({ online: 0, idle: 1, dnd: 2, offline: 3 })[presence(b)]).slice(0, 8).map(a => { const p = presence(a); return `<div>${av(a, 'sm', true)}<span class="nm">${esc(nameOf(a))}<small><span class="prtxt ${p}">${PRES[p]}</span>${a.status_text ? ' · ' + esc(a.status_text) : ''}</small></span>${a.id !== A.user.id ? `<button class="btn sm" data-dm="${esc(a.id)}">💬</button>` : ''}</div>`; }).join('')}</div></div>
      </div>
      <div class="cols">
        <div class="card"><h3>New accounts</h3><div id="cSign"></div></div>
        <div class="card"><h3>Shared Space posts</h3><div id="cPosts"></div></div>
      </div>
      <div class="cols">
        <div class="card"><h3>Versions in use <span class="muted">(last 14 days)</span></h3><b class="muted" style="font-size:12px">MAC APP</b><div id="vDesk"></div><b class="muted" style="font-size:12px;display:block;margin-top:10px">N28C</b><div id="vPhone"></div></div>
        <div class="card"><h3>Agents by chats <span class="muted">(free Nexus key)</span></h3><div id="cAgents"></div></div>
      </div>
      <div class="card"><h3>Latest activity</h3><div class="feed">${(d.feed || []).map(e => { const ic = { signup: '👋', beta_request: '🧪', feedback: '📮', report: '🚩', admin: '🛡', space: '👥' }[e.kind] || '•';
        const what = { signup: 'New account', beta_request: 'Beta request', feedback: 'Feedback', report: 'Content report', admin: String(e.what).replace(/_/g, ' '), space: 'New Shared Space' }[e.kind];
        return `<div>${`<span class="fi">${ic}</span>`}<span class="ft">${esc(what)}${e.who ? ' · ' + esc(e.who) : ''}<small>${esc(e.kind === 'admin' ? '' : e.what)}</small></span><time>${ago(e.at)}</time></div>`; }).join('') || '<div class="muted">Nothing yet.</div>'}</div></div>`;
    const draw = () => {
      const tbl = $('dTable')?.checked;
      if (tbl) { $('cActive').innerHTML = NXCharts.table(rows, [{ key: 'active_desktop', label: 'Mac app' }, { key: 'active_phone', label: 'N28C' }, { key: 'active', label: 'Total' }]); $('cSign').innerHTML = NXCharts.table(rows, [{ key: 'signups', label: 'Accounts' }]); $('cPosts').innerHTML = NXCharts.table(rows, [{ key: 'space_posts', label: 'Posts' }]); return; }
      NXCharts.line($('cActive'), rows, [{ key: 'active_desktop', label: 'Mac app', color: 'var(--s1)' }, { key: 'active_phone', label: 'N28C phone', color: 'var(--s2)' }]);
      NXCharts.bars($('cSign'), rows, 'signups', 'new accounts'); NXCharts.bars($('cPosts'), rows, 'space_posts', 'posts');
    };
    draw();
    const vers = src => (d.versions || []).filter(v => v.source === src).slice(0, 6).map(v => ({ label: 'v' + (v.version || '?'), value: v.users }));
    NXCharts.hbars($('vDesk'), vers('desktop')); NXCharts.hbars($('vPhone'), vers('phone'));
    NXCharts.hbars($('cAgents'), (d.agents || []).map(a => ({ label: a.name, value: +a.chats, sub: `${a.people} people` })));
    $('dUpd').textContent = '· updated ' + new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    $('main').onclick = e => {
      const g = e.target.closest('[data-go]'); if (g) return NX.go(g.dataset.go);
      const r = e.target.closest('[data-days]'); if (r) { NX.store.set('dashDays', +r.dataset.days); $('dash').innerHTML = '<div class="empty"><span class="spinner"></span></div>'; return P.dashboard(); }
      const dm = e.target.closest('[data-dm]'); if (dm) { NX.go('chat'); setTimeout(() => NX.chat.openRoom(NX.chat.dmRoom(dm.dataset.dm), true), 50); }
    };
    $('dTable').onchange = e => { NX.store.set('dashTable', e.target.checked); draw(); };
    if (!P.dashboard.wired) { P.dashboard.wired = true; setInterval(() => { if (A.tab === 'dashboard' && !document.hidden) P.dashboard(); }, 60e3); addEventListener('resize', () => { if (A.tab === 'dashboard') { clearTimeout(P.dashboard.rt); P.dashboard.rt = setTimeout(P.dashboard, 300); } }); }
  };

  // =========================================================== Beta requests
  P.requests = async () => {
    const filter = A.reqFilter || 'pending';
    main('<h1>Beta requests</h1><p>Loading…</p>');
    let q = sb.from('beta_requests').select('*').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) return main(`<h1>Beta requests</h1><div class="card err">${esc(error.message)}${/beta_requests/.test(error.message) ? ' Run supabase/nexus-v2.0.sql first.' : ''}</div>`);
    const pend = data.filter(r => r.status === 'pending');
    main(`<h1>Beta requests</h1><p>People who asked to test new features (Settings → Account in the app). Approving turns beta on for their account right away.</p>
      <div class="row" style="margin-bottom:12px"><div class="tabsub" id="rf" style="margin:0">${['pending', 'approved', 'declined', 'all'].map(f => `<button data-f="${f}" class="${filter === f ? 'on' : ''}">${f[0].toUpperCase() + f.slice(1)}${f === 'pending' && A.counts.requests ? `<b>${A.counts.requests}</b>` : ''}</button>`).join('')}</div><span class="sp"></span>
        ${filter === 'pending' && pend.length > 1 ? `<button class="btn" id="okAll">Approve all ${pend.length}</button>` : ''}</div>
      ${data.map(r => `<div class="card req"><div class="who"><b>${esc(r.username || '(no username)')}</b> <span class="pill p-${esc(r.status)}">${esc(r.status.toUpperCase())}</span>
        <div class="muted">${esc(r.email)} · ${when(r.created_at)} · ${esc(r.source)} ${esc(r.app_version)} · <a href="#" data-user="${esc(r.user_id)}">profile</a></div>
        ${r.why ? `<q><b class="muted">Why:</b> ${esc(r.why)}</q>` : ''}${r.uses ? `<q><b class="muted">Uses Nexus for:</b> ${esc(r.uses)}</q>` : ''}
        ${r.status !== 'pending' ? `<div class="muted" style="margin-top:6px">${r.status === 'approved' ? 'Approved' : 'Declined'} ${when(r.reviewed_at)}${r.note ? ' · “' + esc(r.note) + '”' : ''}</div>` : ''}</div>
        <div class="acts">${r.status === 'pending' ? `<input class="field" placeholder="Note (optional)" data-note="${esc(r.id)}"><button class="btn primary" data-ok="${esc(r.id)}">✓ Approve</button><button class="btn danger" data-no="${esc(r.id)}">Decline</button>`
          : r.status === 'declined' ? `<button class="btn" data-ok="${esc(r.id)}">Approve after all</button>` : ''}</div></div>`).join('') || `<div class="empty">No ${filter === 'all' ? '' : filter + ' '}requests. 🎉</div>`}`);
    $('main').onclick = async e => {
      const f = e.target.closest('[data-f]'); if (f) { A.reqFilter = f.dataset.f; return P.requests(); }
      const u = e.target.closest('[data-user]'); if (u) { e.preventDefault(); return userDrawer(u.dataset.user); }
      if (e.target.id === 'okAll') {
        if (!confirm(`Approve all ${pend.length} pending requests?`)) return;
        e.target.disabled = true; let n = 0;
        for (const r of pend) { try { await rpc('admin_review_beta_request', { request_id: r.id, approve: true, review_note: '' }); n++; } catch {} }
        toast(`✓ Approved ${n}`); NX.refreshCounts(); return P.requests();
      }
      const b = e.target.closest('[data-ok],[data-no]'); if (!b) return;
      const id = b.dataset.ok || b.dataset.no, approve = !!b.dataset.ok;
      b.disabled = true;
      try { await rpc('admin_review_beta_request', { request_id: id, approve, review_note: document.querySelector(`[data-note="${id}"]`)?.value || '' }); toast(approve ? '✓ Approved: beta is on for them' : 'Declined'); NX.refreshCounts(); P.requests(); }
      catch (err) { b.disabled = false; toast(err.message, true); }
    };
    live(['beta_requests'], P.requests, 2500);
  };

  // =========================================================== Feedback & bugs inbox
  const FB_STATUS = [['new', 'New'], ['triaged', 'Triaged'], ['working', 'Working on it'], ['fixed', 'Fixed'], ['wontfix', "Won't fix"], ['closed', 'Closed']];
  const FB_KIND = { bug: '🐞 Bug', feature: '✨ Idea', feedback: '💬 Feedback', beta: '🧪 Beta', other: '• Other' };
  P.feedback = async () => {
    const f = A.fb = A.fb || { status: 'open', kind: 'all', q: '', mine: false };
    let q = sb.from('feedback_reports').select('id,kind,title,status,priority,username,email,created_at,updated_at,assignee,source,app_version,reply_at').order('updated_at', { ascending: false }).limit(300);
    if (f.status === 'open') q = q.in('status', ['new', 'triaged', 'working']); else if (f.status !== 'all') q = q.eq('status', f.status);
    if (f.kind !== 'all') q = q.eq('kind', f.kind);
    if (f.mine) q = q.eq('assignee', A.user.id);
    if (f.q) q = q.or(`title.ilike.%${f.q.replace(/[%,()]/g, '')}%,email.ilike.%${f.q.replace(/[%,()]/g, '')}%,body.ilike.%${f.q.replace(/[%,()]/g, '')}%`);
    const { data, error } = await q;
    if (error) return main(`<h1>Feedback & bugs</h1><div class="card err">${esc(error.message)}${sqlHint(error)}</div>`);
    const sel = A.arg ? +A.arg : null;
    main(`<h1>Feedback & bugs</h1><p>Everything people send from Feedback in the app. Reply and they see it in the app; internal notes stay between admins.</p>
      <div class="row" style="margin-bottom:10px"><div class="tabsub" id="fS" style="margin:0">${[['open', 'Open'], ...FB_STATUS, ['all', 'All']].map(([k, l]) => `<button data-s="${k}" class="${f.status === k ? 'on' : ''}">${l}${k === 'new' && A.counts.feedback ? `<b>${A.counts.feedback}</b>` : ''}</button>`).join('')}</div></div>
      <div class="row" style="margin-bottom:12px"><select class="field" id="fK"><option value="all">All kinds</option>${Object.entries(FB_KIND).map(([k, l]) => `<option value="${k}" ${f.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input class="field" id="fQ" placeholder="Search title, email, text" value="${esc(f.q)}" style="flex:1;min-width:160px"><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fM" ${f.mine ? 'checked' : ''}> Assigned to me</label>
        <button class="btn" id="fCsv">Export CSV</button></div>
      <div class="inbox ${sel ? 'open' : ''}" id="inbox"><div class="ilist" id="ilist">${data.map(r => `<button class="iitem ${r.id === sel ? 'on' : ''} ${r.status === 'new' ? 'unread' : ''}" data-fb="${r.id}">
          <span class="row" style="gap:6px"><span class="pill p-${esc(r.status)}">${esc(r.status.toUpperCase())}</span>${r.priority !== 'normal' ? `<span class="pill p-${esc(r.priority)}">${esc(r.priority.toUpperCase())}</span>` : ''}<span class="muted">${FB_KIND[r.kind] || r.kind}</span><span class="sp"></span><span class="muted">${ago(r.updated_at)}</span></span>
          <b>${esc(r.title)}</b><span class="muted">${esc(r.username || r.email || 'Someone')} · ${esc(r.source)} ${esc(r.app_version)}${r.assignee ? ' · ' + esc(nameOf(NX.adminById(r.assignee))) : ''}</span></button>`).join('') || '<div class="empty">Inbox zero. 🎉</div>'}</div>
        <div class="idetail" id="idetail">${sel ? '<div class="card"><span class="spinner"></span></div>' : '<div class="card empty">Pick something on the left.</div>'}</div></div>`, { cards: false });
    if (sel) fbDetail(sel);
    $('main').onclick = e => {
      const s = e.target.closest('[data-s]'); if (s) { f.status = s.dataset.s; A.arg = null; return P.feedback(); }
      const it = e.target.closest('[data-fb]'); if (it) { A.arg = it.dataset.fb; history.replaceState(null, '', '#feedback/' + it.dataset.fb); document.querySelectorAll('.iitem').forEach(x => x.classList.toggle('on', x === it)); $('inbox').classList.add('open'); return fbDetail(+it.dataset.fb); }
      if (e.target.id === 'fCsv') download(`nexus-feedback-${new Date().toISOString().slice(0, 10)}.csv`, csv([['id', 'kind', 'status', 'priority', 'title', 'email', 'username', 'source', 'version', 'created'], ...data.map(r => [r.id, r.kind, r.status, r.priority, r.title, r.email, r.username, r.source, r.app_version, r.created_at])]));
    };
    $('fK').onchange = e => { f.kind = e.target.value; P.feedback(); };
    $('fM').onchange = e => { f.mine = e.target.checked; P.feedback(); };
    let t; $('fQ').oninput = e => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); P.feedback().then(() => { const i = $('fQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 400); };
    live(['feedback_reports'], () => { if (!document.querySelector('#idetail textarea:focus')) P.feedback(); }, 2500);
  };
  async function fbDetail(id) {
    const [{ data: r, error }, { data: replies }] = await Promise.all([sb.from('feedback_reports').select('*').eq('id', id).maybeSingle(), sb.from('feedback_replies').select('*').eq('report_id', id).order('id')]);
    const el = $('idetail'); if (!el) return;
    if (error || !r) { el.innerHTML = `<div class="card err">${esc(error?.message || 'That report is gone.')}</div>`; return; }
    el.innerHTML = `<div class="card"><h3><button class="btn sm hide-d" id="fbBack" style="${innerWidth > 1100 ? 'display:none' : ''}">‹</button><span>${FB_KIND[r.kind] || ''}</span>${esc(r.title)}</h3>
      <div class="muted">#${r.id} · <a href="#" data-user="${esc(r.user_id || '')}">${esc(r.username || r.email || 'Someone')}</a>${r.email ? ' · ' + esc(r.email) : ''} · ${when(r.created_at)} · ${esc(r.source)} ${esc(r.app_version)}${r.feature ? ' · feature: ' + esc(r.feature) : ''}</div>
      <div class="row" style="margin:12px 0"><select class="field" id="fbSt">${FB_STATUS.map(([k, l]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="field" id="fbPr">${['low', 'normal', 'high', 'urgent'].map(p => `<option value="${p}" ${r.priority === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)} priority</option>`).join('')}</select>
        <select class="field" id="fbAs"><option value="">Unassigned</option>${A.admins.map(a => `<option value="${esc(a.id)}" ${r.assignee === a.id ? 'selected' : ''}>${esc(nameOf(a))}${a.id === A.user.id ? ' (me)' : ''}</option>`).join('')}</select>
        <span class="sp"></span><button class="btn sm danger" id="fbDel">Delete</button></div>
      <div class="quote" style="margin-bottom:10px">${esc(r.body || '(no details)')}</div>
      ${r.info ? `<details><summary class="muted" style="cursor:pointer">App details</summary><pre class="info">${esc(r.info)}</pre></details>` : ''}
      <div class="thread-r">${(replies || []).map(x => `<div class="r ${x.is_staff ? 'staff' : ''} ${x.internal ? 'internal' : ''}"><small>${x.internal ? '🔒 Internal note · ' : ''}${esc(x.author_name || (x.is_staff ? 'Admin' : r.username || 'Them'))} · ${when(x.created_at)}</small>${esc(x.body)}</div>`).join('') || '<div class="muted">No replies yet.</div>'}</div>
      <textarea class="field" id="fbTxt" rows="3" placeholder="Reply to ${esc(r.username || 'them')} (they see it in the app)…"></textarea>
      <div class="row" style="margin-top:8px"><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fbInt"> Internal note (admins only)</label><span class="sp"></span>
        <button class="btn" data-quick="Thanks! We've got it and we're looking into it.">Quick: got it</button><button class="btn" data-quick="This is fixed in the next update. Thanks for reporting it!">Quick: fixed</button><button class="btn primary" id="fbSend">Send</button></div></div>`;
    const save = async patch => { const { error: er } = await sb.from('feedback_reports').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); toast(er ? er.message : '✓ Saved', !!er); NX.refreshCounts(); };
    $('fbSt').onchange = e => save({ status: e.target.value });
    $('fbPr').onchange = e => save({ priority: e.target.value });
    $('fbAs').onchange = e => save({ assignee: e.target.value || null });
    el.onclick = async e => {
      const u = e.target.closest('[data-user]'); if (u) { e.preventDefault(); if (u.dataset.user) userDrawer(u.dataset.user); return; }
      if (e.target.id === 'fbBack') { $('inbox').classList.remove('open'); A.arg = null; return; }
      if (e.target.dataset.quick) { $('fbTxt').value = e.target.dataset.quick; $('fbTxt').focus(); return; }
      if (e.target.id === 'fbDel') { if (!confirm('Delete this report and its replies?')) return; const { error: er } = await sb.from('feedback_reports').delete().eq('id', id); if (er) return toast(er.message, true); A.arg = null; NX.refreshCounts(); return P.feedback(); }
      if (e.target.id === 'fbSend') {
        const body = $('fbTxt').value.trim(); if (!body) return;
        const internal = $('fbInt').checked;
        const { error: er } = await sb.from('feedback_replies').insert({ report_id: id, body, internal, is_staff: true, author_name: nameOf(A.me).slice(0, 60) });
        if (er) return toast(er.message, true);
        if (!internal && r.status === 'new') await sb.from('feedback_reports').update({ status: 'triaged' }).eq('id', id);
        toast(internal ? '🔒 Note added' : '✓ Sent. They\'ll see it in the app.'); fbDetail(id); NX.refreshCounts();
      }
    };
  }

  // =========================================================== Content reports
  const REASON = { spam: 'Spam', harassment: 'Harassment', inappropriate: 'Inappropriate', cheating: 'Cheating', other: 'Other' };
  P.reports = async () => {
    const f = A.rpF = A.rpF || 'open';
    let q = sb.from('content_reports').select('*').order('created_at', { ascending: false }).limit(200);
    if (f !== 'all') q = q.eq('status', f);
    const { data, error } = await q;
    if (error) return main(`<h1>Reports</h1><div class="card err">${esc(error.message)}${sqlHint(error)}</div>`);
    main(`<h1>Reports</h1><p>Things people reported in Shared Spaces, posts and shared agents (from the app and N28C).</p>
      <div class="tabsub" id="rpf">${['open', 'actioned', 'dismissed', 'all'].map(k => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}${k === 'open' && A.counts.reports ? `<b>${A.counts.reports}</b>` : ''}</button>`).join('')}</div>
      ${data.map(r => `<div class="card req"><div class="who"><b>${{ space: '👥 Shared Space', post: '💬 Post', agent: '🛠 Shared agent', session: '🏁 Live session' }[r.kind] || r.kind}</b> <span class="pill p-${esc(r.status)}">${esc(r.status.toUpperCase())}</span> <span class="pill" style="color:var(--danger)">${esc(REASON[r.reason] || r.reason)}</span>
          <div class="muted">${when(r.created_at)} · ${esc(r.kind === 'agent' ? 'code ' + r.target_id : r.target_id.slice(0, 8))}</div>
          ${r.target_label ? `<q>“${esc(r.target_label)}”</q>` : ''}${r.details ? `<q><b class="muted">Details:</b> ${esc(r.details)}</q>` : ''}
          ${r.status !== 'open' ? `<div class="muted" style="margin-top:6px">${esc(r.status)} ${when(r.handled_at)}${r.action_note ? ' · ' + esc(r.action_note) : ''}</div>` : ''}</div>
        <div class="acts"><button class="btn" data-view="${r.id}">View</button>${r.status === 'open' ? `<button class="btn danger" data-rm="${r.id}">Remove it</button><button class="btn" data-dis="${r.id}">Dismiss</button>` : ''}</div></div>`).join('') || `<div class="empty">No ${f === 'all' ? '' : f + ' '}reports. 🎉</div>`}`);
    $('main').onclick = async e => {
      const ff = e.target.closest('[data-f]'); if (ff) { A.rpF = ff.dataset.f; return P.reports(); }
      const id = +(e.target.dataset.view || e.target.dataset.rm || e.target.dataset.dis); if (!id) return;
      const r = data.find(x => x.id === id);
      if (e.target.dataset.view) {
        if (r.kind === 'agent') return agentsDrawer(r.target_id);
        if (r.kind === 'space') return spaceDrawer(r.target_id);
        if (r.kind === 'post') { const { data: sid } = await sb.rpc('admin_post_space', { p_post: r.target_id }); return sid ? spaceDrawer(sid, r.target_id) : toast('That post was already removed.'); }
        return toast('Nothing to show for this one.');
      }
      if (e.target.dataset.rm) {
        if (!confirm(`Remove this ${r.kind} for everyone? It can't be undone.`)) return;
        const reason = prompt('Reason (saved in the audit log):', REASON[r.reason] || '') ?? null; if (reason === null) return;
        try { await rpc('admin_remove_content', { p_kind: r.kind, p_id: r.target_id, p_reason: reason }); toast('✓ Removed'); } catch (err) { return toast(err.message, true); }
      }
      if (e.target.dataset.dis) { const { error: er } = await sb.from('content_reports').update({ status: 'dismissed', handled_by: A.user.id, handled_at: new Date().toISOString(), action_note: 'Dismissed' }).eq('id', id); if (er) return toast(er.message, true); toast('Dismissed'); }
      NX.refreshCounts(); P.reports();
    };
    live(['content_reports'], P.reports, 2500);
  };

  // =========================================================== Moderation (Shared Spaces + shared agents)
  P.moderation = async () => {
    const tab = A.modTab = A.modTab || 'spaces', q = A.modQ || '';
    main(`<h1>Moderation</h1><p>Every Shared Space and shared agent. Reported things float to the top.</p>
      <div class="row" style="margin-bottom:12px"><div class="tabsub" style="margin:0" id="mt">${[['spaces', '👥 Shared Spaces'], ['agents', '🛠 Shared agents']].map(([k, l]) => `<button data-mt="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <input class="field" id="mq" placeholder="Search name, code or owner email" value="${esc(q)}" style="flex:1;min-width:180px"></div><div id="ml"><div class="empty"><span class="spinner"></span></div></div>`);
    let r; try { r = await rpc(tab === 'spaces' ? 'admin_list_spaces' : 'admin_list_shared_agents', { p_search: q }); } catch (e) { $('ml').innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
    if (tab === 'spaces') $('ml').innerHTML = `<div class="card"><table class="cards"><tr><th>Space</th><th>Owner</th><th class="num">Members</th><th class="num">Posts</th><th>Last post</th><th></th></tr>${(r.spaces || []).map(s => `<tr class="click" data-space="${esc(s.id)}">
        <td><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${/^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : 'var(--accent)'};margin-right:6px"></i><b>${esc(s.name)}</b> <span class="muted">${esc(s.code)}</span>${s.reports ? ` <span class="pill" style="color:var(--danger)">${s.reports} REPORT${s.reports === 1 ? '' : 'S'}</span>` : ''}</td>
        <td class="muted">${esc(s.owner_email || '—')}</td><td class="num">${s.members}</td><td class="num">${s.posts}</td><td class="muted">${ago(s.last_post)}</td><td><button class="btn sm">Open</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No spaces.</td></tr>'}</table></div>`;
    else $('ml').innerHTML = `<div class="card"><table class="cards"><tr><th>Agent</th><th>Owner</th><th class="num">Imports</th><th>Shared</th><th></th></tr>${(r.agents || []).map(a => `<tr class="click" data-agent="${esc(a.code)}">
        <td><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : 'var(--accent)'};margin-right:6px"></i><b>${esc(a.name)}</b> <span class="muted">@${esc(a.handle || '')} · ${esc(a.code)}</span>${a.reports ? ` <span class="pill" style="color:var(--danger)">${a.reports} REPORT${a.reports === 1 ? '' : 'S'}</span>` : ''}<div class="muted" style="max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.prompt || '')}</div></td>
        <td class="muted">${esc(a.owner_email || '—')}</td><td class="num">${a.imports}</td><td class="muted">${ago(a.created_at)}</td><td><button class="btn sm">Open</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No shared agents yet.</td></tr>'}</table></div>`;
    NX.labelTables();
    wireMod();
  };
  function wireMod() {
    $('main').onclick = e => {
      const t = e.target.closest('[data-mt]'); if (t) { A.modTab = t.dataset.mt; return P.moderation(); }
      const s = e.target.closest('[data-space]'); if (s) return spaceDrawer(s.dataset.space);
      const a = e.target.closest('[data-agent]'); if (a) return agentsDrawer(a.dataset.agent);
    };
    let tm; $('mq').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { A.modQ = e.target.value.trim(); P.moderation().then(() => { const i = $('mq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 400); };
  }
  async function spaceDrawer(id, focusPost) {
    const { el, close } = NX.drawer('<div class="empty"><span class="spinner"></span></div>');
    let list, d; try { [list, d] = await Promise.all([rpc('admin_list_spaces', { p_search: '' }), rpc('admin_space_detail', { p_space: id })]); } catch (e) { el.innerHTML = `<button class="btn sm x" data-x>✕</button><div class="card err">${esc(e.message)}</div>`; return; }
    const s = (list.spaces || []).find(x => x.id === id);
    if (!s) { el.innerHTML = '<button class="btn sm x" data-x>✕</button><div class="card">That space is gone.</div>'; return; }
    el.innerHTML = `<button class="btn sm x" data-x>✕</button><h1>👥 ${esc(s.name)}</h1><p class="sub">Code ${esc(s.code)} · owner ${esc(s.owner_email || '—')} · created ${when(s.created_at)}</p>
      <div class="row" style="margin-bottom:12px"><button class="btn danger" id="spDel">Delete this space</button></div>
      <div class="card"><h3>Members (${d.members.length})</h3><div class="members">${d.members.map(m => `<div>${av({ id: m.user_id, nickname: m.nickname })}<span class="nm">${esc(m.nickname)}<small>${esc(m.email || '')} · 🔥 ${m.streak} · joined ${ago(m.joined_at)}</small></span><button class="btn sm" data-user="${esc(m.user_id)}">Profile</button></div>`).join('')}</div></div>
      <div class="card"><h3>Posts (${d.posts.length})</h3>${d.posts.map(p => `<div class="m ${p.id === focusPost ? 'mentioned' : ''}" style="margin:0 0 6px" data-post="${esc(p.id)}">${av({ id: p.email || p.nickname, nickname: p.nickname }, 'sm')}<div class="mb"><div class="by"><b>${esc(p.nickname)}</b><time>${when(p.created_at)}</time>${p.reports ? `<span class="pill" style="color:var(--danger)">${p.reports} REPORT${p.reports === 1 ? '' : 'S'}</span>` : ''}<span class="sp" style="flex:1"></span><button class="btn sm danger" data-rmpost="${esc(p.id)}">Remove</button></div>
        <div class="tx">${p.kind === 'deck' ? '🃏 Shared a deck: ' : p.kind === 'ai' ? '🤖 ' : ''}${esc(p.content)}</div></div></div>`).join('') || '<div class="muted">No posts.</div>'}</div>`;
    if (focusPost) el.querySelector(`[data-post="${focusPost}"]`)?.scrollIntoView({ block: 'center' });
    el.onclick = async e => {
      const u = e.target.closest('[data-user]'); if (u) return userDrawer(u.dataset.user);
      if (e.target.id === 'spDel') { if (!confirm(`Delete "${s.name}" for all ${d.members.length} members? This can't be undone.`)) return; const reason = prompt('Reason (saved in the audit log):', ''); if (reason === null) return; try { await rpc('admin_remove_content', { p_kind: 'space', p_id: id, p_reason: reason }); toast('✓ Space deleted'); close(); if (A.tab === 'moderation') P.moderation(); } catch (err) { toast(err.message, true); } }
      const rp = e.target.closest('[data-rmpost]'); if (rp) { if (!confirm('Remove this post?')) return; try { await rpc('admin_remove_content', { p_kind: 'post', p_id: rp.dataset.rmpost, p_reason: 'Removed by an admin' }); rp.closest('[data-post]').remove(); toast('✓ Removed'); NX.refreshCounts(); } catch (err) { toast(err.message, true); } }
    };
  }
  async function agentsDrawer(code) {
    const { el, close } = NX.drawer('<div class="empty"><span class="spinner"></span></div>');
    let r; try { r = await rpc('admin_list_shared_agents', { p_search: code }); } catch (e) { el.innerHTML = `<div class="card err">${esc(e.message)}</div>`; return; }
    const a = (r.agents || []).find(x => x.code === code);
    if (!a) { el.innerHTML = '<button class="btn sm x" data-x>✕</button><div class="card">That agent was removed.</div>'; return; }
    el.innerHTML = `<button class="btn sm x" data-x>✕</button><h1><i style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${/^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : 'var(--accent)'}"></i> ${esc(a.name)}</h1>
      <p class="sub">@${esc(a.handle || '')} · code ${esc(a.code)} · by ${esc(a.owner_email || '—')} · ${a.imports} import${a.imports === 1 ? '' : 's'} · ${when(a.created_at)}</p>
      <div class="card"><h3>Instructions</h3><div class="quote">${esc(a.prompt || '(none)')}</div></div>
      <div class="row"><button class="btn danger" id="agDel">Remove this shared agent</button><span class="muted">People who already imported it keep their copy; the code stops working.</span></div>`;
    el.querySelector('#agDel').onclick = async () => { if (!confirm('Remove this shared agent?')) return; const reason = prompt('Reason (saved in the audit log):', ''); if (reason === null) return; try { await rpc('admin_remove_content', { p_kind: 'agent', p_id: code, p_reason: reason }); toast('✓ Removed'); close(); if (A.tab === 'moderation') P.moderation(); } catch (e) { toast(e.message, true); } };
  }

  // =========================================================== Users
  const UF = [['all', 'Everyone'], ['new7', 'New this week'], ['active7', 'Active this week'], ['beta', 'Beta testers'], ['comped', 'Comped'], ['admins', 'Admins & mods'], ['moderated', 'Suspended / banned']];
  P.users = async () => {
    const u = A.uf = A.uf || { q: '', filter: 'all', sort: 'new', page: 0, sel: new Set() };
    const per = 50;
    let r; try { r = await rpc('admin_list_users', { p_search: u.q, p_filter: u.filter, p_limit: per, p_offset: u.page * per, p_sort: u.sort }); }
    catch (e) { return main(`<h1>Users</h1><div class="card err">${esc(e.message)}</div>`); }
    const users = r.users || [], pages = Math.max(1, Math.ceil(r.total / per));
    const badge = x => `${x.admin_level ? `<span class="pill p-approved">${esc(x.admin_level.toUpperCase())}</span> ` : ''}${x.beta ? '<span class="pill" style="color:var(--cyan)">BETA</span> ' : ''}${x.comped ? '<span class="pill" style="color:var(--gold)">COMPED</span> ' : ''}${x.status !== 'active' ? `<span class="pill p-declined">${esc(x.status.toUpperCase())}</span>` : ''}`;
    main(`<h1>Users <span class="muted" style="font-size:14px;font-weight:400">${r.total.toLocaleString()}</span></h1><p>Everyone with a Nexus account. Click someone for their profile, notes and history.</p>
      <div class="tabsub" id="uF">${UF.map(([k, l]) => `<button data-f="${k}" class="${u.filter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row" style="margin-bottom:10px"><input class="field" id="uQ" placeholder="Search email, username or nickname" value="${esc(u.q)}" style="flex:1;min-width:200px">
        <select class="field" id="uS"><option value="new" ${u.sort === 'new' ? 'selected' : ''}>Newest first</option><option value="active" ${u.sort === 'active' ? 'selected' : ''}>Recently active</option><option value="email" ${u.sort === 'email' ? 'selected' : ''}>Email A–Z</option></select>
        <button class="btn" id="uCsv">Export CSV</button></div>
      <div class="banner" id="uBulk" ${u.sel.size ? '' : 'hidden'}><b>${u.sel.size} selected</b><span class="sp" style="flex:1"></span><button class="btn sm" data-bulk="beta_on">Make beta</button><button class="btn sm" data-bulk="beta_off">Remove beta</button>${A.level !== 'mod' ? '<button class="btn sm" data-bulk="comp_on">Comp</button><button class="btn sm" data-bulk="comp_off">Un-comp</button>' : ''}<button class="btn sm ghost" data-bulk="clear">Clear</button></div>
      <div class="card"><table class="cards"><tr><th><input type="checkbox" id="uAll"></th><th>Person</th><th>Joined</th><th>Last active</th><th>Status</th><th class="num">Notes</th></tr>
        ${users.map(x => `<tr class="click ${u.sel.has(x.id) ? 'sel' : ''}" data-uid="${esc(x.id)}"><td><input type="checkbox" data-pick="${esc(x.id)}" ${u.sel.has(x.id) ? 'checked' : ''}></td>
          <td><div class="row" style="gap:10px;flex-wrap:nowrap">${av({ id: x.id, nickname: x.nickname || x.username, email: x.email, avatar_url: x.avatar_url })}<span style="min-width:0"><b>${esc(x.nickname || x.username || '(no username)')}</b><div class="muted" style="overflow:hidden;text-overflow:ellipsis">${esc(x.email)}${x.username && x.nickname ? ' · @' + esc(x.username) : ''}</div></span></div></td>
          <td class="muted">${when(x.created_at).split(',')[0]}</td><td class="muted">${ago(x.last_active_at || x.last_sign_in_at)}</td><td>${badge(x) || '<span class="muted">—</span>'}</td><td class="num">${x.notes || ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nobody matches.</td></tr>'}</table>
        <div class="row" style="margin-top:10px"><span class="muted">Page ${u.page + 1} of ${pages}</span><span class="sp"></span><button class="btn sm" id="uPrev" ${u.page ? '' : 'disabled'}>‹ Prev</button><button class="btn sm" id="uNext" ${u.page + 1 < pages ? '' : 'disabled'}>Next ›</button></div></div>
      <div class="card"><h3>Look up by exact email</h3><form class="row" id="lf"><input class="field" id="le" type="email" placeholder="name@example.com" style="flex:1;min-width:220px"><button class="btn primary">Open profile</button></form></div>`);
    if (A.arg) { const id = A.arg; A.arg = null; userDrawer(id); }
    $('main').onclick = async e => {
      const f = e.target.closest('[data-f]'); if (f) { u.filter = f.dataset.f; u.page = 0; return P.users(); }
      if (e.target.id === 'uPrev') { u.page--; return P.users(); } if (e.target.id === 'uNext') { u.page++; return P.users(); }
      const pick = e.target.closest('[data-pick]'); if (pick) { pick.checked ? u.sel.add(pick.dataset.pick) : u.sel.delete(pick.dataset.pick); pick.closest('tr').classList.toggle('sel', pick.checked); paintBulk(); return; }
      if (e.target.id === 'uAll') { users.forEach(x => e.target.checked ? u.sel.add(x.id) : u.sel.delete(x.id)); return P.users(); }
      const bk = e.target.closest('[data-bulk]'); if (bk) {
        if (bk.dataset.bulk === 'clear') { u.sel.clear(); return P.users(); }
        if (!confirm(`${bk.textContent} for ${u.sel.size} ${u.sel.size === 1 ? 'person' : 'people'}?`)) return;
        try { const res = await rpc('admin_bulk', { p_users: [...u.sel], p_action: bk.dataset.bulk }); toast(`✓ Updated ${res.updated}`); u.sel.clear(); P.users(); } catch (err) { toast(err.message, true); }
        return;
      }
      if (e.target.id === 'uCsv') {
        toast('Preparing the CSV…'); const all = [];
        for (let off = 0; off < 5000; off += 200) { const res = await rpc('admin_list_users', { p_search: u.q, p_filter: u.filter, p_limit: 200, p_offset: off, p_sort: u.sort }); all.push(...res.users); if (res.users.length < 200) break; }
        download(`nexus-users-${u.filter}-${new Date().toISOString().slice(0, 10)}.csv`, csv([['email', 'username', 'nickname', 'joined', 'last_active', 'beta', 'comped', 'admin', 'status'], ...all.map(x => [x.email, x.username, x.nickname, x.created_at, x.last_active_at, x.beta, x.comped, x.admin_level || '', x.status])]));
        return;
      }
      const row = e.target.closest('[data-uid]'); if (row && !e.target.closest('input')) userDrawer(row.dataset.uid);
    };
    const paintBulk = () => { const b = $('uBulk'); b.hidden = !u.sel.size; b.querySelector('b').textContent = `${u.sel.size} selected`; };
    $('uS').onchange = e => { u.sort = e.target.value; P.users(); };
    let t; $('uQ').oninput = e => { clearTimeout(t); t = setTimeout(() => { u.q = e.target.value.trim(); u.page = 0; P.users().then(() => { const i = $('uQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 400); };
    $('lf').onsubmit = async e => { e.preventDefault(); const em = $('le').value.trim(); if (!em) return; try { const res = await rpc('admin_list_users', { p_search: em, p_filter: 'all', p_limit: 5, p_offset: 0, p_sort: 'new' }); const hit = res.users.find(x => x.email.toLowerCase() === em.toLowerCase()) || res.users[0]; if (!hit) return toast('No account with that email.', true); userDrawer(hit.id); } catch (err) { toast(err.message, true); } };
  };

  async function userDrawer(uid) {
    if (!uid) return;
    const { el, close } = NX.drawer('<div class="empty"><span class="spinner"></span></div>');
    let base, d, lk;
    try {
      d = await rpc('admin_user_detail', { p_user: uid });
      base = d.user; if (!base) throw new Error('Account not found.');
      lk = await rpc('admin_lookup_user', { target_email: base.email }).catch(() => null);
    } catch (e) { el.innerHTML = `<button class="btn sm x" data-x>✕</button><div class="card err">${esc(e.message)}</div>`; return; }
    const p = lk?.profile || {}, m = lk?.moderation, high = A.level === 'high-admin', email = base.email;
    const days = []; const act = new Map((d.activity || []).map(a => [a.day + a.source, a]));
    for (let i = 59; i >= 0; i--) { const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push({ day, desk: act.has(day + 'desktop'), phone: act.has(day + 'phone') }); }
    const lastVer = (d.activity || []).find(a => a.source === 'desktop')?.version, lastPhone = (d.activity || []).find(a => a.source === 'phone')?.version;
    el.innerHTML = `<button class="btn sm x" data-x>✕</button>
      <div class="row" style="gap:14px;margin-bottom:6px;flex-wrap:nowrap">${av({ id: uid, nickname: base.nickname || base.username, avatar_url: base.avatar_url }, 'lg')}<div style="min-width:0"><h1 style="margin:0">${esc(base.nickname || base.username || '(no username)')}</h1>
        <div class="muted">${esc(email)}${base.username ? ' · @' + esc(base.username) : ''}</div><div style="margin-top:4px">${lk?.admin_level ? `<span class="pill p-approved">${esc(lk.admin_level.toUpperCase())}</span> ` : ''}${p.is_beta_tester ? '<span class="pill" style="color:var(--cyan)">BETA</span> ' : ''}${p.is_comped ? '<span class="pill" style="color:var(--gold)">COMPED</span> ' : ''}${d.reports_against ? `<span class="pill" style="color:var(--danger)">${d.reports_against} OPEN REPORT${d.reports_against === 1 ? '' : 'S'}</span>` : ''}</div></div></div>
      <div class="card"><div class="kv"><span>Joined</span><span>${when(base.created_at)}</span><span>Last active</span><span>${ago(base.last_active_at || base.last_sign_in_at)}${lastVer ? ` · Mac v${esc(lastVer)}` : ''}${lastPhone ? ' · uses N28C' : ''}</span>
        <span>Status</span><span>${m && m.status !== 'active' ? `<b class="err">${esc(m.status)}</b>${m.reason ? ' · ' + esc(m.reason) : ''}${m.suspended_until ? ' · until ' + when(m.suspended_until) : ''}` : 'Active'}</span>
        <span>Chats used</span><span>${(lk?.chat_usage || []).map(c => `${esc(c.assistant_name)}: ${c.count} <button class="btn sm" data-reset="${esc(c.assistant_name)}">reset</button>`).join(' · ') || '—'}</span>
        <span>Orders</span><span>${(lk?.redemptions || []).map(r => esc(r.order_id) + (r.tier ? ' (' + esc(r.tier) + ')' : '')).join(', ') || '—'}</span>
        <span>Shared Spaces</span><span>${(d.spaces || []).map(s => `<a href="#" data-space="${esc(s.id)}">${esc(s.name)}</a>${s.owner ? ' (owner)' : ''}`).join(', ') || '—'}</span></div>
        <b class="muted" style="font-size:11px;letter-spacing:.08em;display:block;margin:12px 0 4px">LAST 60 DAYS</b>
        <div style="display:grid;grid-template-columns:repeat(60,1fr);gap:2px" title="Days they used Nexus">${days.map(x => `<i title="${x.day}${x.desk ? ' · Mac' : ''}${x.phone ? ' · N28C' : ''}" style="height:16px;border-radius:2px;background:${x.desk && x.phone ? 'var(--accent)' : x.desk || x.phone ? 'rgba(var(--rgb),.5)' : 'rgba(var(--rgb),.07)'}"></i>`).join('')}</div></div>
      <div class="card"><h3>Perks</h3><div class="row"><button class="btn ${p.is_beta_tester ? 'danger' : 'primary'}" data-beta="${p.is_beta_tester ? 0 : 1}">${p.is_beta_tester ? 'Remove beta' : 'Make beta tester'}</button>
        <button class="btn" data-comp="${p.is_comped ? 0 : 1}">${p.is_comped ? 'Remove comp' : 'Comp (unlimited free key)'}</button></div></div>
      <div class="card"><h3>Moderation</h3><div class="row"><select class="field" id="ms"><option value="active">Active (lift)</option><option value="suspended">Suspend</option><option value="banned">Ban</option></select>
        <select class="field" id="mh"><option value="">For…</option><option value="1">1 hour</option><option value="24">1 day</option><option value="72">3 days</option><option value="168">1 week</option><option value="720">30 days</option></select>
        <input class="field" id="mr" placeholder="Reason (they see this)" style="flex:1;min-width:160px"><button class="btn" id="mgo">Apply</button></div>
        <p class="muted" style="margin:8px 0 0">Suspended or banned accounts can't use the free Nexus key, Shared Spaces or N28C until it's lifted. Their own API keys still work.</p></div>
      ${high ? `<div class="card"><h3>Admin role</h3><div class="row"><select class="field" id="rl"><option value="mod">Mod</option><option value="admin">Admin</option><option value="high-admin">High-admin</option></select>
        <button class="btn" id="rgo">Grant</button>${lk?.admin_level ? '<button class="btn danger" id="rrv">Revoke role</button>' : ''}</div></div>` : ''}
      <div class="card"><h3>Private notes <span class="muted">(admins only)</span></h3><div class="thread-r" id="notes">${(d.notes || []).map(n => `<div class="r internal"><small>${esc(n.author_email || 'admin')} · ${when(n.created_at)}${n.mine || high ? ` · <a href="#" data-delnote="${n.id}">delete</a>` : ''}</small>${esc(n.body)}</div>`).join('') || '<div class="muted">No notes yet.</div>'}</div>
        <div class="row"><input class="field" id="nt" placeholder="Add a note, e.g. sent great bug reports" style="flex:1"><button class="btn primary" id="nadd">Add</button></div></div>
      ${(d.feedback || []).length ? `<div class="card"><h3>Feedback they sent</h3>${d.feedback.map(f => `<div class="row" style="padding:4px 0"><span class="pill p-${esc(f.status)}">${esc(f.status.toUpperCase())}</span><a href="#" data-fb="${f.id}">${esc(f.title)}</a><span class="sp"></span><span class="muted">${ago(f.created_at)}</span></div>`).join('')}</div>` : ''}
      ${(d.beta_requests || []).length ? `<div class="card"><h3>Beta requests</h3>${d.beta_requests.map(b => `<div style="padding:4px 0"><span class="pill p-${esc(b.status)}">${esc(b.status.toUpperCase())}</span> <span class="muted">${when(b.created_at)}</span>${b.why ? `<div class="muted">${esc(b.why)}</div>` : ''}</div>`).join('')}</div>` : ''}
      <div class="card"><h3>History</h3>${(d.history || []).map(h => `<div class="row" style="padding:3px 0;font-size:13.5px"><span>${esc(String(h.action).replace(/_/g, ' '))}</span><span class="muted">by ${esc(h.by || 'system')}</span><span class="sp"></span><span class="muted">${when(h.created_at)}</span></div>`).join('') || '<div class="muted">Nothing yet.</div>'}</div>`;
    el.onclick = async e => {
      const b = e.target.closest('button,a'); if (!b) return;
      try {
        if (b.dataset.space) { e.preventDefault(); return spaceDrawer(b.dataset.space); }
        if (b.dataset.fb) { e.preventDefault(); close(); return NX.go('feedback', { arg: b.dataset.fb }); }
        if (b.dataset.delnote) { e.preventDefault(); if (!confirm('Delete this note?')) return; const { error } = await sb.from('admin_user_notes').delete().eq('id', b.dataset.delnote); if (error) throw error; return userDrawer(uid); }
        if (b.id === 'nadd') { const body = $('nt').value.trim(); if (!body) return; const { error } = await sb.from('admin_user_notes').insert({ user_id: uid, body }); if (error) throw error; toast('✓ Note added'); return userDrawer(uid); }
        if (b.dataset.beta) await rpc('admin_set_beta_tester', { target_email: email, enabled: b.dataset.beta === '1' });
        else if (b.dataset.comp) await rpc('admin_set_comp', { target_email: email, enabled: b.dataset.comp === '1' });
        else if (b.dataset.reset) { if (!confirm(`Reset their ${b.dataset.reset} chat count?`)) return; await rpc('admin_reset_chat_usage', { target_email: email, target_assistant: b.dataset.reset }); }
        else if (b.id === 'mgo') { const st = $('ms').value; if (st !== 'active' && !confirm(`${st === 'banned' ? 'Ban' : 'Suspend'} ${email}?`)) return; await rpc('admin_set_moderation', { target_email: email, new_status: st, reason_text: $('mr').value || null, suspend_hours: $('mh').value ? +$('mh').value : null }); }
        else if (b.id === 'rgo') { if (!confirm(`Make ${email} a ${$('rl').value}?`)) return; await rpc('admin_grant_role', { target_email: email, new_level: $('rl').value }); NX.loadAdmins(); }
        else if (b.id === 'rrv') { if (!confirm(`Remove ${email}'s admin role?`)) return; await rpc('admin_revoke_role', { target_email: email }); NX.loadAdmins(); }
        else return;
        toast('✓ Saved'); userDrawer(uid); if (A.tab === 'users') P.users();
      } catch (err) { toast(err.message, true); }
    };
  }
  NX.userDrawer = userDrawer;

  // =========================================================== Feature flags
  P.flags = async () => {
    const { data, error } = await sb.from('feature_flags').select('*').order('key');
    if (error) return main(`<h1>Feature flags</h1><div class="card err">${esc(error.message)}</div>`);
    const ST = [['off', 'Off'], ['admin', 'Admins'], ['beta', 'Beta testers'], ['all', 'Everyone']];
    main(`<h1>Feature flags</h1><p>Who gets each feature in the app. Apps pick up changes within a minute or two, no update needed.</p>
      <div class="card"><table class="cards"><tr><th>Feature</th><th>Who gets it</th><th>Min version</th><th>Changed</th></tr>${data.map(f => `<tr><td><b>${esc(f.title || f.key)}</b><div class="muted">${esc(f.key)}${f.description ? ' · ' + esc(f.description) : ''}</div></td>
        <td><select class="field" data-stage="${esc(f.key)}">${ST.map(([v, l]) => `<option value="${v}" ${f.stage === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><input class="field" data-minv="${esc(f.key)}" value="${esc(f.min_version || '')}" placeholder="any" style="width:90px"></td><td class="muted">${ago(f.updated_at)}</td></tr>`).join('')}</table></div>
      <div class="card"><h3>New flag</h3><div class="row"><input class="field" id="nk" placeholder="key_like_this"><input class="field" id="nt" placeholder="Title"><input class="field" id="nd" placeholder="Description" style="flex:1"><select class="field" id="ns">${ST.map(([v, l]) => `<option value="${v}" ${v === 'admin' ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn primary" id="nadd">Add</button></div></div>`);
    $('main').onchange = async e => {
      const t = e.target, key = t.dataset.stage || t.dataset.minv; if (!key) return;
      const patch = t.dataset.stage ? { stage: t.value } : { min_version: t.value.trim() || null };
      const { error: er } = await sb.from('feature_flags').update({ ...patch, updated_at: new Date().toISOString() }).eq('key', key);
      toast(er ? er.message : '✓ Saved', !!er);
    };
    $('main').onclick = async e => {
      if (e.target.id !== 'nadd') return;
      const key = $('nk').value.trim(); if (!/^[a-z0-9_]{2,48}$/.test(key)) return toast('Keys are 2–48 lowercase letters, numbers and _', true);
      const { error: er } = await sb.from('feature_flags').insert({ key, title: $('nt').value.trim() || key, description: $('nd').value.trim(), stage: $('ns').value });
      if (er) return toast(er.message, true); toast('✓ Added'); P.flags();
    };
  };

  // =========================================================== Announcements
  P.announce = async () => {
    const { data, error } = await sb.from('announcements').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) return main(`<h1>Announcements</h1><div class="card err">${esc(error.message)}</div>`);
    main(`<h1>Announcements</h1><p>Live announcements show as a banner in the Mac app, in N28C and on web Nexus.</p>
      <div class="card"><h3>New announcement</h3><textarea class="field" id="am" rows="2" maxlength="300" placeholder="Nexus 2.2 is out! Update from the app menu."></textarea>
        <div class="banner" style="margin:10px 0 0" id="apv" hidden>📣 <span></span></div>
        <div class="row" style="margin-top:8px"><span class="muted" id="ac">0 / 300</span><span class="sp"></span><button class="btn primary" id="aadd">Post it live</button></div></div>
      ${data.map(a => `<div class="card"><div class="row"><span class="pill ${a.active ? 'p-approved' : 'p-closed'}">${a.active ? 'LIVE' : 'OFF'}</span><span class="muted">${when(a.created_at)}${a.created_by ? ' · ' + esc(nameOf(NX.adminById(a.created_by))) : ''}</span><span class="sp"></span>
        <button class="btn sm" data-tog="${a.id}" data-on="${a.active ? 0 : 1}">${a.active ? 'Turn off' : 'Turn on'}</button><button class="btn sm danger" data-del="${a.id}">Delete</button></div><div style="margin-top:6px">${esc(a.message)}</div></div>`).join('') || '<div class="empty">No announcements yet.</div>'}`);
    $('am').oninput = e => { $('ac').textContent = `${e.target.value.length} / 300`; $('apv').hidden = !e.target.value.trim(); $('apv').querySelector('span').textContent = e.target.value; };
    $('main').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return; let error;
      if (b.id === 'aadd') { const m = $('am').value.trim(); if (!m) return; ({ error } = await sb.from('announcements').insert({ message: m, active: true, created_by: A.user.id })); }
      else if (b.dataset.tog) ({ error } = await sb.from('announcements').update({ active: b.dataset.on === '1' }).eq('id', b.dataset.tog));
      else if (b.dataset.del) { if (!confirm('Delete this announcement?')) return; ({ error } = await sb.from('announcements').delete().eq('id', b.dataset.del)); }
      else return;
      toast(error ? error.message : '✓ Saved', !!error); if (!error) P.announce();
    };
  };

  // =========================================================== Maintenance
  const SCOPES = [['global', '🌐 Everything', 'The Mac app and N28C: no chats at all'], ['desktop', '💻 Mac app', 'All chats in the Mac app (and asks from N28C)'], ['phone', '📱 N28C', 'The phone app'],
    ['spaces', '👥 Shared Spaces', 'Shared Spaces and live sessions'], ['paragon', '@paragon', 'Only this agent'], ['neodela', '@neodela', 'Only this agent'], ['lyte', '@lyte', 'Only this agent'], ['flash', '@flash', 'Only this agent']];
  const isOn = m => m.enabled === true || m.enabled === 'true' || m.enabled?.enabled === true;
  P.maint = async () => {
    const { data, error } = await sb.from('maintenance_config').select('*').order('scope');
    if (error) return main(`<h1>Maintenance</h1><div class="card err">${esc(error.message)}</div>`);
    const hasNew = data.length ? 'ends_at' in data[0] : true;
    const label = s => (SCOPES.find(x => x[0] === s) || [s, '⚙︎ @' + s + ' (feature)'])[1];
    main(`<h1>Maintenance</h1><p>Turn parts of Nexus off for everyone, with a message. The Mac app and N28C check every minute (instantly in N28C) and block what's down. Admins can keep using things unless you turn that off.</p>
      ${hasNew ? '' : '<div class="banner warn">Run supabase/nexus-v2.2.sql to add end times and the admin bypass.</div>'}
      <div class="card"><h3>Take something down</h3>
        <div class="tabsub" id="scp" style="flex-wrap:wrap">${SCOPES.map(([k, l], i) => `<button data-sc="${k}" class="${i === 0 ? 'on' : ''}" title="${esc(SCOPES[i][2])}">${l}</button>`).join('')}<button data-sc="__feature">⚙︎ A feature…</button></div>
        <div class="row" style="margin-bottom:8px"><input class="field" id="mFeat" placeholder="Feature name, e.g. seek, magyk, studymode" hidden style="flex:1"></div>
        <div class="row"><select class="field" id="mType"><option value="update">🛠 Update</option><option value="outage">⚠️ Outage</option><option value="emergency">🚨 Emergency</option></select>
          <input class="field" id="mMsg" placeholder="Message people see, e.g. Back in about 20 minutes!" style="flex:1;min-width:200px"></div>
        <div class="row" style="margin-top:8px"><label class="muted">Back at <input class="field" type="datetime-local" id="mEnd"></label><label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="mBy" checked> Admins can keep using it</label><span class="sp"></span><button class="btn danger" id="mGo">Take down</button></div>
        <div class="muted" id="mHelp" style="margin-top:8px">${esc(SCOPES[0][2])}</div></div>
      <h2>Switches</h2>
      ${data.map(m => `<div class="card"><div class="row"><b>${esc(label(m.scope))}</b><span class="muted" style="font-family:var(--mono)">${esc(m.scope)}</span><span class="pill ${isOn(m) ? 'p-declined' : 'p-approved'}">${isOn(m) ? 'DOWN' : 'UP'}</span>
          ${isOn(m) && m.ends_at ? `<span class="muted">back ${new Date(m.ends_at) > Date.now() ? 'in ' + Math.max(1, Math.round((new Date(m.ends_at) - Date.now()) / 60e3)) + ' min' : 'time passed'}</span>` : ''}<span class="sp"></span>
          <button class="btn sm ${isOn(m) ? 'primary' : 'danger'}" data-mt="${esc(m.scope)}" data-on="${isOn(m) ? 0 : 1}">${isOn(m) ? 'Bring back up' : 'Take down'}</button><button class="btn sm ghost" data-rm="${esc(m.scope)}" title="Remove this switch">🗑</button></div>
        <div class="row" style="margin-top:8px"><input class="field" style="flex:1" data-msg="${esc(m.scope)}" value="${esc(m.message || '')}" placeholder="Message people see">
          ${'admin_bypass' in m ? `<label class="muted" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-by="${esc(m.scope)}" ${m.admin_bypass !== false ? 'checked' : ''}> Admins bypass</label>` : ''}</div>
        <div class="muted" style="margin-top:6px">${esc((Array.isArray(m.types) ? m.types : []).join(', ') || 'update')} · changed ${ago(m.updated_at)}</div></div>`).join('') || '<div class="empty">Nothing configured. Everything is up. ✅</div>'}`);
    let scope = 'global';
    $('scp').onclick = e => { const b = e.target.closest('[data-sc]'); if (!b) return; scope = b.dataset.sc; document.querySelectorAll('#scp button').forEach(x => x.classList.toggle('on', x === b)); $('mFeat').hidden = scope !== '__feature'; $('mHelp').textContent = scope === '__feature' ? 'Turns one @feature off in every agent.' : (SCOPES.find(x => x[0] === scope) || [])[2] || ''; if (scope === '__feature') $('mFeat').focus(); };
    $('main').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return; let error;
      const now = new Date().toISOString();
      if (b.id === 'mGo') {
        const sc = scope === '__feature' ? $('mFeat').value.trim().toLowerCase().replace(/^@/, '') : scope; if (!sc) return toast('Which feature?', true);
        if (!confirm(`Take "${label(sc)}" down for everyone?`)) return;
        const row = { scope: sc, enabled: true, message: $('mMsg').value.trim(), types: [$('mType').value], countdown: !!$('mEnd').value, updated_at: now };
        if (hasNew) Object.assign(row, { ends_at: $('mEnd').value ? new Date($('mEnd').value).toISOString() : null, admin_bypass: $('mBy').checked });
        ({ error } = await sb.from('maintenance_config').upsert(row));
      } else if (b.dataset.mt) {
        if (b.dataset.on === '1' && !confirm(`Take "${b.dataset.mt}" down for everyone?`)) return;
        ({ error } = await sb.from('maintenance_config').update({ enabled: b.dataset.on === '1', updated_at: now }).eq('scope', b.dataset.mt));
      } else if (b.dataset.rm) { if (!confirm(`Remove the "${b.dataset.rm}" switch?`)) return; ({ error } = await sb.from('maintenance_config').delete().eq('scope', b.dataset.rm)); }
      else return;
      toast(error ? error.message : '✓ Saved. Apps update within a minute.', !!error); if (!error) P.maint();
    };
    $('main').onchange = async e => {
      const s = e.target.dataset.msg || e.target.dataset.by; if (!s) return;
      const patch = e.target.dataset.msg ? { message: e.target.value } : { admin_bypass: e.target.checked };
      const { error: er } = await sb.from('maintenance_config').update({ ...patch, updated_at: new Date().toISOString() }).eq('scope', s); toast(er ? er.message : '✓ Saved', !!er);
    };
    live(['maintenance_config'], () => { if (!document.activeElement?.matches('input,select')) P.maint(); }, 2000);
  };

  // =========================================================== Audit log
  P.audit = async () => {
    const r = await rpc('admin_get_audit_log', { row_limit: 300 });
    const rows = r.entries || [];
    main(`<h1>Audit log</h1><p>Every admin action: roles, perks, moderation, beta decisions and removed content.</p>
      <div class="row" style="margin-bottom:10px"><input class="field" id="aq" placeholder="Filter by action, account or admin" style="flex:1"><button class="btn" id="acsv">Export CSV</button></div>
      <div class="card"><table class="cards" id="at"><tr><th>When</th><th>Action</th><th>Account</th><th>By</th></tr>${rows.map(x => `<tr data-s="${esc((x.action + ' ' + (x.target_email || '') + ' ' + (x.performed_by_email || '')).toLowerCase())}"><td class="muted">${when(x.created_at)}</td><td>${esc(String(x.action).replace(/_/g, ' '))}</td><td>${esc(x.target_email || '—')}</td><td class="muted">${esc(x.performed_by_email || 'system')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nothing yet.</td></tr>'}</table></div>`);
    $('aq').oninput = e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('#at tr[data-s]').forEach(tr => { tr.hidden = !!q && !tr.dataset.s.includes(q); }); };
    $('acsv').onclick = () => download(`nexus-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv([['when', 'action', 'account', 'by'], ...rows.map(x => [x.created_at, x.action, x.target_email, x.performed_by_email])]));
  };

  // =========================================================== My settings
  P.me = async () => {
    const me = A.me || {}, p = A.prefs, n = p.notify || {};
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const t = NX.store.get('theme', null);
    const tog = (id, label, sub, on) => `<label class="toggle"><div>${label}<small>${sub}</small></div><input type="checkbox" id="${id}" ${on ? 'checked' : ''}></label>`;
    main(`<h1>My settings</h1><p>Your picture, status and how the portal notifies you.</p>
      <div class="cols">
        <div class="card"><h3>Profile</h3><div class="row" style="gap:16px;flex-wrap:nowrap">${av(me, 'xl', true)}<div style="flex:1;min-width:0">
          <input class="field" id="nick" placeholder="Your name in chat" maxlength="24" value="${esc(me.nickname || '')}" style="width:100%"><div class="row" style="margin-top:8px">
          <button class="btn" id="pic">Change picture</button>${me.avatar_url ? '<button class="btn ghost" id="picRm">Remove</button>' : ''}<input type="file" id="picF" accept="image/*" hidden></div>
          <p class="muted" style="margin:8px 0 0">Your picture shows here, in the Mac app and in N28C. You can also change it in the Mac app (Settings → Account).</p></div></div></div>
        <div class="card"><h3>Status</h3><div class="tabsub" id="st">${[['auto', '🟢 Automatic', 'Online, or idle when you step away'], ['dnd', '⛔ Do not disturb', 'No pop-ups or sounds'], ['invisible', '⚪ Invisible', 'Look offline']].map(([k, l, s]) => `<button data-st="${k}" class="${p.status === k ? 'on' : ''}" title="${s}">${l}</button>`).join('')}</div>
          <input class="field" id="stt" maxlength="80" placeholder="Custom status, e.g. 🛠 fixing the relay" value="${esc(p.status_text || '')}" style="width:100%">
          <p class="muted" style="margin:8px 0 0">Right now others see you as <span class="prtxt ${presence(me)}">${PRES[presence(me)]}</span>.</p></div>
      </div>
      <div class="cols">
        <div class="card"><h3>Notifications</h3>
          <div class="row" style="margin-bottom:6px">${perm === 'granted' ? '<span class="ok">✓ Desktop notifications are on for this browser.</span>' : perm === 'denied' ? '<span class="err">Notifications are blocked for this site. Allow them in your browser\'s site settings.</span>' : perm === 'unsupported' ? '<span class="muted">This browser can\'t show notifications. You\'ll still get pop-ups in the portal.</span>' : '<button class="btn primary" id="perm">Turn on desktop notifications</button>'}<span class="sp"></span><button class="btn sm" id="ntest">Test</button></div>
          ${tog('nChat', '💬 Admin chat', 'New messages (muted chats only for @mentions)', n.chat !== false)}${tog('nReq', '🧪 Beta requests', 'Someone asks to be a beta tester', n.requests !== false)}
          ${tog('nFb', '📮 Feedback & bugs', 'New reports and replies from people', n.feedback !== false)}${tog('nRep', '🚩 Content reports', 'Something reported in Shared Spaces or a shared agent', n.reports !== false)}
          ${tog('nSound', '🔊 Sound', 'A soft chime with each notification', n.sound !== false)}
          <p class="muted" style="margin:6px 0 0">Notifications arrive while the portal is open in a tab (even in the background). On iPhone, add the portal to your Home Screen first.</p></div>
        <div class="card"><h3>Privacy</h3>${tog('rr', 'Read receipts', "Others see when you've read their messages. Turn it off and you won't see theirs either.", p.read_receipts !== false)}
          <h3 style="margin-top:14px">Theme</h3><p class="muted" style="margin:0">${t ? `<i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent);margin-right:6px"></i>${esc(t.name || 'Your theme')} — ` : ''}The portal uses the theme you picked in the Mac app (Settings → General → Theme). Change it there and it shows up here next time you open the portal.</p>
          <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn danger" id="out">Sign out</button></div></div>
      </div>`);
    const N = { nChat: 'chat', nReq: 'requests', nFb: 'feedback', nRep: 'reports', nSound: 'sound' };
    $('main').onchange = async e => {
      const id = e.target.id;
      if (N[id]) { await NX.savePrefs({ notify: { ...A.prefs.notify, [N[id]]: e.target.checked } }); toast('✓ Saved'); }
      if (id === 'rr') { await NX.savePrefs({ read_receipts: e.target.checked }); toast(e.target.checked ? '✓ Read receipts on' : 'Read receipts off'); }
      if (id === 'picF' && e.target.files[0]) uploadAvatar(e.target.files[0]);
      if (id === 'nick') { const v = e.target.value.trim(); const { error } = await sb.from('profiles').update({ nickname: v || null }).eq('id', A.user.id); if (error) return toast(error.message, true); await NX.loadAdmins(); NX.paintHeader(); toast('✓ Saved'); }
      if (id === 'stt') { await NX.savePrefs({ status_text: e.target.value.trim() }); toast('✓ Status saved'); }
    };
    $('main').onclick = async e => {
      const s = e.target.closest('[data-st]'); if (s) { await NX.savePrefs({ status: s.dataset.st }); return P.me(); }
      if (e.target.id === 'pic') $('picF').click();
      if (e.target.id === 'picRm') { await sb.from('profiles').update({ avatar_url: null }).eq('id', A.user.id); await NX.loadAdmins(); NX.paintHeader(); P.me(); }
      if (e.target.id === 'perm') { const r = await Notification.requestPermission(); toast(r === 'granted' ? '✓ Notifications on' : 'Notifications not allowed', r !== 'granted'); P.me(); }
      if (e.target.id === 'ntest') { const was = document.hidden; NX.notify({ kind: 'chat', force: true, title: '🔔 Test notification', body: 'This is what notifications look like.', who: A.me }); if (!was && 'Notification' in window && Notification.permission === 'granted') try { new Notification('🔔 Test notification', { body: 'This is what notifications look like.', icon: '../companion/icon-192.png' }); } catch {} }
      if (e.target.id === 'out') { await sb.from('admin_prefs').update({ last_seen: new Date(Date.now() - 3600e3).toISOString() }).eq('user_id', A.user.id); await sb.auth.signOut(); location.reload(); }
    };
  };
  // Square-crop, shrink to 256px, upload to avatars/<you>/avatar.webp, save the public URL on your profile
  async function uploadAvatar(file) {
    try {
      const img = await createImageBitmap(file);
      const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      const blob = await new Promise(r => c.toBlob(r, 'image/webp', .88)) || await new Promise(r => c.toBlob(r, 'image/png'));
      const path = `${A.user.id}/avatar.${blob.type === 'image/webp' ? 'webp' : 'png'}`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type });
      if (error) throw new Error(NX.needSql(error.message) || /bucket/i.test(error.message) ? 'Run supabase/nexus-v2.2.sql first (it creates the avatars bucket).' : error.message);
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
      const { error: e2 } = await sb.from('profiles').update({ avatar_url: url }).eq('id', A.user.id); if (e2) throw e2;
      await NX.loadAdmins(); NX.paintHeader(); toast('✓ Picture updated'); P.me();
    } catch (e) { toast(e.message, true); }
  }
})();
