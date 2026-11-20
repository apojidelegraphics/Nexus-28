// aARgon3 Terminal — the staff side. Same file on the website (/terminal/) and in the desktop app.
// Staff sign in with their Nexus account; everything goes through the "staff" Edge Function, which checks who you are
// and what your role (employee / manager / owner) lets you do before doing anything.
(function () {
  const CFG = window.A3_CONFIG, A3 = window.A3, { C, TIERS, PLANS, price, money } = A3;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n, s) => window.A3icon(n, s);
  const desk = window.aargonDesktop || null;
  if (desk) document.body.classList.add('desktop', desk.platform === 'darwin' ? 'mac' : 'win');
  const MOD = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl ';

  const sb = window.supabase.createClient(CFG.nexusUrl, CFG.nexusKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'aargon3-staff-auth' } });
  const S = { me: null, state: null, overview: null, store: { open: true }, page: 'today', fetchedAt: 0, sale: null, saleTimer: null, lastOrders: null };
  window.A3T = S;   // for the tests

  // ================================================================ helpers
  function toast(msg, kind = '', onClick = null) {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('toasts').append(t);
    if (onClick) { t.style.cursor = 'pointer'; t.onclick = () => { onClick(); t.remove(); }; }
    setTimeout(() => t.remove(), onClick ? 20000 : kind === 'bad' ? 8000 : 4500);
  }
  const fmtTime = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // "6 AM–5 PM" / "9:30 AM–2 PM": short enough to sit on one line in a schedule cell
  const shortTime = d => { const t = new Date(d); return t.toLocaleTimeString([], t.getMinutes() ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' }); };
  const fmtDay = d => new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtDate = d => new Date(d + (String(d).length === 10 ? 'T12:00' : '')).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtWhen = d => { const x = new Date(d), today = new Date().toDateString() === x.toDateString(); return today ? `Today ${fmtTime(x)}` : `${fmtDay(x)} ${fmtTime(x)}`; };
  const hm = m => { m = Math.max(0, Math.round(m)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; };
  const clockText = m => { m = Math.max(0, Math.floor(m)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatar = (name, color, cls = '') => `<div class="av ${cls}" style="${color ? `background:${esc(color)}` : ''}">${esc(initials(name))}</div>`;
  const localInput = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const ymd = d => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const statusPill = s => { s = String(s || '').toUpperCase(); return `<span class="pill ${s === 'ACTIVE' || s === 'PAID' || s === 'APPROVED' ? 'ok' : /CANCEL|REFUND|VOID|DENIED/.test(s) ? 'bad' : s === 'DRAFT' ? 'dim' : s === 'REQUESTED' ? 'info' : 'warn'}">${esc(s || '—')}</span>`; };
  const roleName = r => ({ owner: 'Owner', manager: 'Manager', employee: 'Employee' }[r] || r);
  const tierName = t => C.tiers[t]?.name || (t ? t[0].toUpperCase() + t.slice(1) : '—');
  const big = n => money(Math.round(Number(n) || 0));
  const COLORS = ['#5ce1ff', '#b18cff', '#3dffa0', '#ffd36b', '#ff8fb1', '#7c9bff', '#ffb35c', '#9ef0d0'];

  function sheet(html, onMount, cls = '') {
    const w = document.createElement('div'); w.className = 'scrim'; w.innerHTML = `<div class="sheet ${cls}">${html}</div>`;
    document.body.append(w);
    const close = () => { w.remove(); document.removeEventListener('keydown', k); };
    const k = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k);
    w.onclick = e => { if (e.target === w) close(); };
    w.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    onMount?.(w.querySelector('.sheet'), close);
    return close;
  }
  function confirmSheet(title, text, okLabel, danger = false) {
    return new Promise(res => sheet(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="acts"><button class="btn quiet" data-close>Never mind</button><button class="btn ${danger ? 'danger' : 'primary'}" id="ok">${esc(okLabel)}</button></div>`,
      (el, close) => { el.querySelector('#ok').onclick = () => { close(); res(true); }; el.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => res(false))); }));
  }
  async function busy(btn, fn) {
    const label = btn?.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>'; }
    try { return await fn(); } catch (e) { toast(e.message, 'bad'); throw e; } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
  }
  const quiet = p => p.catch(() => {});
  function csv(name, header, rows) {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[header.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\n')], { type: 'text/csv' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function qrSvg(text) {
    try { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
    catch { return '<div style="width:240px;height:240px;display:grid;place-items:center;color:#333">QR unavailable</div>'; }
  }
  const copy = (text, what = 'Copied.') => navigator.clipboard.writeText(text).then(() => toast(what), () => toast("Couldn't copy.", 'bad'));
  const storeOptions = (selected, blank = false) => {
    const regions = {};
    for (const st of S.state?.stores || []) (regions[st.region] = regions[st.region] || []).push(st);
    return (blank ? '<option value="">Any store</option>' : '') + Object.keys(regions).sort().map(r => `<optgroup label="Region ${esc(r)} · ${esc(C.regions[r] || '')}">${regions[r].map(st => `<option value="${esc(st.code)}" ${st.code === selected ? 'selected' : ''}>#${esc(st.code)} · ${esc(st.name)}</option>`).join('')}</optgroup>`).join('');
  };
  const storeRegion = code => (S.state?.stores || []).find(s => s.code === code)?.region;

  // ================================================================ the staff function
  async function api(action, body = {}) {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { signIn('Your sign-in expired. Sign in again.'); throw new Error('Signed out.'); }
    let res;
    try { res = await fetch(`${CFG.functions}/staff`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: CFG.storeKey }, body: JSON.stringify({ action, ...body }) }); }
    catch { throw new Error(navigator.onLine === false ? "You're offline. Check your internet connection." : "Can't reach aARgon3's server. If you're online, its functions may not be deployed (see the README)."); }
    const r = await res.json().catch(() => ({}));
    if (res.status === 401) { await sb.auth.signOut(); signIn(r.error); throw new Error(r.error || 'Signed out.'); }
    if (res.status === 403 && /isn't an admin|staff list|turned off/.test(r.error || '')) { await sb.auth.signOut(); signIn(r.error); throw new Error(r.error); }
    if (!res.ok) throw new Error(r.error || (res.status === 404 ? "The aARgon3 server functions aren't deployed yet." : `Something went wrong (${res.status}).`));
    return r;
  }
  async function refresh() {
    const r = await api('me');
    const before = S.overview?.today?.orders;
    const reqBefore = S.requests;
    S.me = r.user; S.state = r.state; S.overview = r.overview; S.requests = r.requests || 0;
    if (reqBefore != null && S.requests > reqBefore) { toast('New custom order request from the website.', 'ok', () => { quoteFilter = 'requested'; go('quotes'); }); desk?.attention?.(); } S.store = r.store || { open: true }; S.fetchedAt = Date.now();
    if (before != null && r.overview?.today?.orders > before && !S.sale) { toast(`New order! ${r.overview.today.orders} today.`, 'ok', () => go('orders')); desk?.attention?.(); }
    paintClock(); paintMe(); paintBadges();
  }
  const shift = () => S.state?.shift || null;
  const workedNow = () => { const s = shift(); if (!s) return 0; return s.minutes + (s.on_break ? 0 : (Date.now() - S.fetchedAt) / 60e3); };
  const breakNow = () => { const s = shift(); const b = s?.breaks?.find(x => !x.end); return b ? (Date.now() - new Date(b.start)) / 60e3 : 0; };
  const free = () => !!S.me?.owner;   // the owner never has to clock in (but can, and can be scheduled)
  const myStore = () => shift()?.store_code || S.me?.default_store || S.state?.last_store;
  const can = role => ({ employee: 1, manager: 2, owner: 3 }[S.me?.role] || 1) >= ({ employee: 1, manager: 2, owner: 3 }[role]);

  // ================================================================ sign in
  function signIn(msg = '') {
    clearInterval(S.saleTimer); S.me = null;
    $('app').innerHTML = `<div class="login"><form class="card" id="f">
      <img class="logo" src="../icons/icon-192.png" alt="">
      <h1>aARgon3 Terminal</h1><p>Staff sign in with your Nexus account. Only Apoji staff can get in.</p>
      <input class="field" id="em" type="email" placeholder="Email" autocomplete="username" required>
      <input class="field" id="pw" type="password" placeholder="Password" autocomplete="current-password" required>
      <button class="btn primary block" id="go">${ic('login')} Sign in</button>
      <div class="err" id="er">${esc(msg)}</div>
      <div class="fine">Not staff? <a href="${desk ? 'https://apojidelegraphics.github.io/aArgon3/' : '../'}">Visit the aARgon3 store</a></div></form></div>`;
    $('em').focus();
    $('f').onsubmit = async e => {
      e.preventDefault(); $('er').textContent = '';
      const btn = $('go'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
      if (error) { $('er').textContent = error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message; btn.disabled = false; btn.innerHTML = `${ic('login')} Sign in`; return; }
      start();
    };
  }
  async function signOut() {
    if (shift() && !(await confirmSheet('Sign out while clocked in?', "You'll stay on the clock. Clock out first if you're done for the day.", 'Sign out anyway'))) return;
    await sb.auth.signOut(); history.replaceState(null, '', '#'); signIn();
  }

  // ================================================================ shell
  const PAGES = [
    { id: 'today', icon: 'today', label: 'Today', group: '' }, { id: 'sale', icon: 'sale', label: 'New sale', short: 'Sell', group: '' },
    { id: 'orders', icon: 'orders', label: 'Orders', group: '' }, { id: 'catalog', icon: 'catalog', label: 'Catalog', group: '' },
    { id: 'schedule', icon: 'schedule', label: 'Schedule', group: 'YOUR WORK' }, { id: 'time', icon: 'time', label: 'Timesheet', group: 'YOUR WORK' },
    { id: 'sales', icon: 'sales', label: 'Sales', group: 'YOUR WORK', label2: 'My sales' }, { id: 'points', icon: 'star', label: 'Points', group: 'YOUR WORK', label2: 'My points' },
    { id: 'profile', icon: 'profile', label: 'Profile', group: 'YOUR WORK' },
    { id: 'quotes', icon: 'quotes', label: 'Custom orders', group: 'MANAGER', role: 'manager' }, { id: 'promos', icon: 'promos', label: 'Promotions', group: 'MANAGER', role: 'manager' },
    { id: 'team', icon: 'team', label: 'Team', group: 'MANAGER', role: 'manager' }, { id: 'activity', icon: 'activity', label: 'Activity', group: 'MANAGER', role: 'manager' },
    { id: 'settings', icon: 'settings', label: 'Settings', group: 'OWNER', role: 'owner' }];
  const visible = () => PAGES.filter(p => !p.role || can(p.role));
  function shell() {
    let last = null;
    $('app').innerHTML = `<div class="shell">
      <aside class="side"><div class="brand"><img src="../icons/icon-192.png" alt=""><div>AARGON3<small>TERMINAL</small></div></div>
        ${visible().map((p, i) => { const g = p.group !== last ? (last = p.group, p.group ? `<div class="sect">${p.group}</div>` : '') : '';
          return `${g}<button class="nav" data-p="${p.id}" title="${esc(p.label)}">${ic(p.icon)}<span class="lbl">${esc(p.label2 && !can('manager') ? p.label2 : p.label)}</span><span class="badge" data-badge="${p.id}" hidden></span>${i < 9 ? `<kbd>${MOD}${i + 1}</kbd>` : ''}</button>`; }).join('')}
        <div class="sp"></div><div class="me" id="me"></div></aside>
      <main class="main"><header class="top"><img class="mlogo" src="../icons/icon-192.png" alt=""><h2 id="title"></h2><span class="sp"></span><div class="clock" id="clock"></div></header><div id="page"></div></main>
      <nav class="tabs">${TABS.map(id => { const p = PAGES.find(x => x.id === id); return `<button class="tab" data-p="${id}">${ic(p.icon, 20)}<span>${esc(p.short || p.label)}</span><span class="badge" data-badge="${id}" hidden></span></button>`; }).join('')}
        <button class="tab" id="more">${ic('menu', 20)}<span>More</span><span class="badge" data-badge="more" hidden></span></button></nav></div>`;
    document.querySelectorAll('.nav, .tab[data-p]').forEach(b => b.onclick = () => go(b.dataset.p));
    $('more').onclick = moreSheet;
    new MutationObserver(() => labelTables($('page'))).observe($('page'), { childList: true, subtree: true });
    paintMe(); paintClock(); paintBadges();
  }
  // phones: a bottom tab bar with the everyday pages; everything else is under More
  const TABS = ['today', 'sale', 'orders', 'schedule'];
  function moreSheet() {
    let last = null;
    sheet(`<div class="more-head">${avatar(S.me.name, S.me.color)}<div><b>${esc(S.me.name)}</b><small>${S.me.owner ? 'Owner' : roleName(S.me.role)} · ${esc(S.me.email || '')}</small></div></div>
      ${visible().filter(p => !TABS.includes(p.id)).map(p => { const g = p.group !== last ? (last = p.group, `${p.group ? `<div class="sect">${p.group}</div>` : ''}`) : '';
        return `${g}<button class="nav ${S.page === p.id ? 'on' : ''}" data-p="${p.id}">${ic(p.icon)}<span class="lbl">${esc(p.label2 && !can('manager') ? p.label2 : p.label)}</span><span class="badge" data-badge="${p.id}" hidden></span></button>`; }).join('')}
      <button class="nav" id="mso">${ic('power')}<span class="lbl">Sign out</span></button>`,
      (el, close) => { el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { close(); go(b.dataset.p); }); el.querySelector('#mso').onclick = () => { close(); signOut(); }; }, 'more-sheet');
  }
  // tables become stacked cards on phones; each cell is labelled with its column name
  function labelTables(root) {
    root?.querySelectorAll('table.tbl').forEach(t => {
      const hs = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
      t.querySelectorAll('tbody tr').forEach(tr => { let i = 0; for (const td of tr.children) { if (!td.hasAttribute('data-label')) td.setAttribute('data-label', td.colSpan > 1 ? '' : hs[i] || ''); i += td.colSpan || 1; } });
    });
  }
  function paintMe() {
    if (!$('me') || !S.me) return;
    $('me').innerHTML = `${avatar(S.me.name, S.me.color)}<div><b>${esc(S.me.name)}</b><small>${S.me.owner ? `${ic('crown', 11)} Owner` : roleName(S.me.role)}</small></div><button class="btn quiet small out" id="so" title="Sign out">${ic('power', 16)}</button>`;
    $('me').onclick = e => { if (!e.target.closest('#so')) go('profile'); };
    $('so').onclick = signOut;
  }
  function paintBadges() {
    const n = { schedule: can('manager') ? S.state?.pending_time_off || 0 : 0, quotes: can('manager') ? S.requests || 0 : 0 };
    n.more = Object.entries(n).filter(([k]) => !TABS.includes(k)).reduce((m, [, v]) => m + v, 0);
    document.querySelectorAll('[data-badge]').forEach(x => { const v = n[x.dataset.badge] || 0; x.hidden = !v; x.textContent = v; });
  }
  function go(page) {
    const p = visible().find(x => x.id === page) || PAGES[0];
    S.page = p.id; if (location.hash !== '#' + p.id) history.replaceState(null, '', '#' + p.id);
    document.querySelectorAll('.nav, .tab[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p.id));
    $('more')?.classList.toggle('on', !TABS.includes(p.id));
    $('title').textContent = p.label2 && !can('manager') ? p.label2 : p.label;
    $('page').innerHTML = '<div class="wrap" id="pg"></div>'; $('page').scrollTop = 0;
    ({ today: pageToday, sale: pageSale, orders: pageOrders, catalog: pageCatalog, schedule: pageSchedule, time: pageTime, sales: pageSales, profile: pageProfile,
       points: pagePoints, quotes: pageQuotes, promos: pagePromos, team: pageTeam, activity: pageActivity, settings: pageSettings })[p.id]();
  }

  // ================================================================ the clock (top bar)
  function paintClock() {
    const el = $('clock'); if (!el) return;
    const s = shift();
    if (!s && free()) {
      el.className = 'clock owner';
      el.innerHTML = `<span class="dot"></span><div class="what" title="The owner doesn't need to clock in"><span class="l">OWNER<span class="hide-sm"> · NO CLOCK NEEDED</span></span><b>${hm(S.state?.week_minutes || 0)} <small>this week</small></b></div><button class="btn quiet small" id="cin" title="Optional: log hours for a scheduled shift">${ic('login', 15)} <span class="hide-sm">Clock in</span></button>`;
      $('cin').onclick = () => clockInSheet();
    } else if (!s) {
      el.className = 'clock';
      el.innerHTML = `<span class="dot"></span><div class="what" title="Your hours this week"><span class="l">OFF THE CLOCK</span><b>${hm(S.state?.week_minutes || 0)}</b></div><button class="btn primary small" id="cin">${ic('login', 15)} <span class="hide-sm">Clock in</span></button>`;
      $('cin').onclick = () => clockInSheet();
    } else if (s.on_break) {
      el.className = 'clock brk';
      el.innerHTML = `<span class="dot"></span><div class="what"><span class="l">ON BREAK</span><b id="tick">${clockText(breakNow())}</b></div><button class="btn primary small" id="bk">End break</button>`;
      $('bk').onclick = e => doBreak(false, e.target);
    } else {
      el.className = 'clock on';
      el.innerHTML = `<span class="dot"></span><div class="what" title="${esc(s.store)}"><span class="l">ON THE CLOCK · #${esc(s.store_code)}${s.late_minutes ? ` · <span style="color:var(--amber)">${s.late_minutes}m late</span>` : ''}</span><b id="tick">${clockText(workedNow())}</b></div>
        <button class="btn small" id="bk">${ic('coffee', 15)} <span class="hide-sm">Break</span></button><button class="btn small danger" id="cout">${ic('logout', 15)} <span class="hide-sm">Clock out</span></button>`;
      $('bk').onclick = e => doBreak(true, e.target);
      $('cout').onclick = () => clockOutSheet();
    }
  }
  setInterval(() => { const t = $('tick'); if (t && shift()) t.textContent = clockText(shift().on_break ? breakNow() : workedNow()); }, 15e3);
  const nextShift = () => (S.state?.upcoming || [])[0] || null;
  const scheduledNow = () => { const n = nextShift(); return n && new Date(n.starts_at) - Date.now() < 3 * 3600e3 ? n : null; };
  function clockInSheet() {
    const sch = scheduledNow();
    sheet(`<div class="kicker">Clock in</div><h3>Start your shift</h3>
      ${sch ? `<div class="banner info" style="margin:10px 0 0">${ic('schedule')}<div><b>You're scheduled ${fmtTime(sch.starts_at)}–${fmtTime(sch.ends_at)}</b>${sch.store_code ? ` at #${esc(sch.store_code)}` : ''}${sch.note ? ` · ${esc(sch.note)}` : ''}</div></div>` : '<p class="muted">Pick where you\'re working. It remembers your store.</p>'}
      <label class="lbl">Store</label><select class="field" id="store">${storeOptions(sch?.store_code || S.state?.last_store)}</select>
      <div class="acts"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">${ic('login', 15)} Clock in now</button></div>`,
      (el, close) => { el.querySelector('#ok').onclick = e => clockIn(el.querySelector('#store').value, e.target).then(close, () => {}); });
  }
  async function clockIn(store, btn) {
    const r = await busy(btn, () => api('clock_in', { store }));
    await refresh(); toast(r.late_minutes ? `Clocked in, ${r.late_minutes} minutes after your shift started.` : `Clocked in at ${fmtTime(new Date())}. Have a good shift!`, r.late_minutes ? '' : 'ok'); go(S.page);
  }
  function clockOutSheet() {
    const s = shift(), brk = (s.breaks || []).reduce((m, b) => m + ((b.end ? new Date(b.end) : new Date()) - new Date(b.start)) / 60e3, 0);
    sheet(`<div class="kicker">Clock out</div><h3>Done for now?</h3>
      <div class="kv"><span>Clocked in</span><span>${fmtWhen(s.clock_in)} · #${esc(s.store_code)}</span>${s.scheduled ? `<span>Scheduled</span><span>${fmtTime(s.scheduled.starts_at)}–${fmtTime(s.scheduled.ends_at)}</span>` : ''}
        <span>Worked</span><span><b>${hm(workedNow())}</b>${brk >= 1 ? ` <span class="muted">(${hm(brk)} on break)</span>` : ''}</span>
        <span>Sales this shift</span><span>${s.orders} · ${money(Number(s.sales) || 0)}</span></div>
      <label class="lbl">Note (optional)</label><input class="field" id="note" placeholder="Anything your manager should know">
      <div class="acts"><button class="btn quiet" data-close>Keep working</button><button class="btn danger" id="ok">${ic('logout', 15)} Clock out</button></div>`,
      (el, close) => { el.querySelector('#ok').onclick = e => clockOut({ note: el.querySelector('#note').value }, e.target).then(close, () => {}); });
  }
  async function clockOut(body, btn) {
    const r = await busy(btn, () => api('clock_out', body));
    await refresh(); toast(`Clocked out. You worked ${hm(r.minutes)}.`, 'ok'); go(S.page);
  }
  async function doBreak(on, btn) { await busy(btn, () => api('break', { on })); await refresh(); toast(on ? 'Break started. Enjoy!' : 'Welcome back.'); }
  const gate = (title, text) => `<div class="card gate"><div><div class="kicker">Off the clock</div><h3>${esc(title)}</h3><p>${esc(text)}</p>
      <label class="lbl">Store</label><select class="field" id="gstore">${storeOptions(scheduledNow()?.store_code || S.state?.last_store)}</select></div><button class="btn primary" id="gin">${ic('login', 15)} Clock in</button></div>`;
  const wireGate = () => $('gin') && ($('gin').onclick = e => clockIn($('gstore').value, e.target));

  // ================================================================ Today
  function pageToday() {
    const s = shift(), o = S.overview || {}, pg = $('pg'), n = nextShift();
    const long = s && (Date.now() - new Date(s.clock_in)) > 12 * 3600e3;
    const week = o.week || [], max = Math.max(1, ...week.map(d => Number(d.revenue) || 0));
    pg.innerHTML = `
      ${S.store.open === false ? `<div class="banner">${ic('warning')}<div><b>The online store is closed.</b> ${esc(S.store.message || '')}</div>${can('owner') ? '<span style="flex:1"></span><button class="btn small" id="openStore">Open it</button>' : ''}</div>` : ''}
      ${long ? `<div class="banner"><div><b>Forgot to clock out?</b> You've been clocked in since ${fmtWhen(s.clock_in)}.</div>
        <span style="flex:1"></span><span class="muted">I left at</span><input class="field" type="datetime-local" id="leftAt" value="${localInput(Math.min(Date.now(), new Date(s.clock_in).getTime() + 8 * 3600e3))}">
        <button class="btn small" id="fix">Clock out at that time</button></div>` : ''}
      ${!s && !free() ? gate('Clock in to start selling', `Hi ${S.me.name}. You've worked ${hm(S.state?.week_minutes || 0)} this week.${n ? ` Next shift: ${fmtDay(n.starts_at)} ${fmtTime(n.starts_at)}–${fmtTime(n.ends_at)}.` : ''}`) : ''}
      <div class="stats">
        <div class="card stat"><div class="k">Sales today</div><div class="v">${money(Number(o.today?.revenue) || 0)}</div><div class="s">${o.today?.orders || 0} order${o.today?.orders === 1 ? '' : 's'}</div></div>
        <div class="card stat"><div class="k">Active subscriptions</div><div class="v">${o.active_subscriptions || 0}</div><div class="s">paying through Stripe</div></div>
        ${s || !free() ? `<div class="card stat"><div class="k">This shift</div><div class="v">${s ? hm(workedNow()) : '—'}</div><div class="s">${s ? `${s.orders} sale${s.orders === 1 ? '' : 's'} · ${money(Number(s.sales) || 0)}` : 'not clocked in'}</div></div>`
          : `<div class="card stat"><div class="k">On the clock</div><div class="v">${(o.on_clock || []).length}</div><div class="s">${(o.on_clock || []).length === 1 ? 'person' : 'people'} working now</div></div>`}
        ${free() && !s ? `<div class="card stat"><div class="k">Last 7 days</div><div class="v">${money(week.reduce((m, d) => m + (Number(d.revenue) || 0), 0))}</div><div class="s">${week.reduce((m, d) => m + (Number(d.orders) || 0), 0)} orders</div></div>`
          : `<div class="card stat"><div class="k">Your week</div><div class="v">${hm((S.state?.week_minutes || 0) + (s && !s.on_break ? (Date.now() - S.fetchedAt) / 60e3 : 0))}</div><div class="s">since Monday</div></div>`}
      </div>
      <div class="cols">
        <div class="card"><h3>Last 7 days<small>sales</small></h3><div class="bars">${week.map((d, i) => `<div class="b ${i === week.length - 1 ? 'today' : ''}" title="${esc(d.day)}: ${d.orders} orders"><span class="amt">${Number(d.revenue) ? big(d.revenue) : ''}</span><div class="bar" style="height:${Math.round((Number(d.revenue) || 0) / max * 130)}px"></div><span class="lab">${new Date(d.day + 'T12:00').toLocaleDateString([], { weekday: 'short' })}</span></div>`).join('')}</div></div>
        <div class="card"><h3>On the clock now<small>${(o.on_clock || []).length}</small></h3><div class="people">${(o.on_clock || []).map(p => `<div class="person">${avatar(p.name)}<div><b>${esc(p.name)}</b><small>#${esc(p.store_code)} · since ${fmtTime(p.clock_in)}${p.late_minutes ? ` · ${p.late_minutes}m late` : ''}</small></div><div class="r">${p.on_break ? '<span class="pill warn">BREAK</span>' : hm(p.minutes)}</div></div>`).join('') || '<div class="empty" style="padding:20px">Nobody yet.</div>'}</div>
          ${s || free() ? `<button class="btn primary block" id="newsale" style="margin-top:14px">${ic('sale', 16)} New sale</button>` : ''}</div>
      </div>
      <div class="${free() ? 'grid2' : 'grid3'}" style="margin-top:12px">
        ${!free() ? `<div class="card ptsmini" id="ptsmini"><h3>${ic('star')} Your points</h3><div class="empty"><span class="spin"></span></div></div>` : ''}
        <div class="card"><h3>Your next shifts</h3>${(S.state?.upcoming || []).length ? `<div class="people">${S.state.upcoming.map(u => `<div class="person"><div class="av" style="background:var(--panel2);color:var(--accent)">${ic('schedule', 15)}</div><div><b>${fmtDay(u.starts_at)}</b><small>${fmtTime(u.starts_at)}–${fmtTime(u.ends_at)}${u.store_code ? ` · #${esc(u.store_code)}` : ''}${u.note ? ` · ${esc(u.note)}` : ''}</small></div></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nothing scheduled. <a href="#schedule" id="toSched">See the schedule</a></p>'}</div>
        <div class="card"><h3>Quick links</h3><div class="row">
          <button class="btn small" data-go="orders">${ic('search', 15)} Find an order</button><button class="btn small" data-go="catalog">${ic('catalog', 15)} What's in each plan</button>
          ${can('manager') ? `<button class="btn small" data-go="quotes">${ic('quotes', 15)} Custom order</button><button class="btn small" data-go="team">${ic('team', 15)} Team</button>` : `<button class="btn small" id="reqOff">${ic('calendarx', 15)} Ask for time off</button>`}
          ${can('manager') && S.state?.pending_time_off ? `<button class="btn small" data-go="schedule">${ic('bell', 15)} ${S.state.pending_time_off} time-off request${S.state.pending_time_off === 1 ? '' : 's'}</button>` : ''}</div></div>
      </div>`;
    wireGate();
    if ($('ptsmini')) api('points', { mine: true }).then(r => { const el = $('ptsmini'); if (!el) return;
      el.innerHTML = `<h3>${ic('star')} Your points</h3><div class="ptsbig ${r.mine.total < 0 ? 'neg' : ''}">${r.mine.total}</div><div class="muted" style="font-size:13px">${r.mine.month >= 0 ? '+' : ''}${r.mine.month} this month</div>
        ${r.history[0] ? `<div class="ptlast">${ptRow(r.history[0], true)}</div>` : ''}<button class="btn small quiet" data-go="points" style="margin-top:8px">See all ${ic('right', 14)}</button>`;
      el.querySelector('[data-go]').onclick = () => go('points'); }).catch(() => { const el = $('ptsmini'); if (el) el.innerHTML = `<h3>${ic('star')} Your points</h3><p class="muted" style="margin:0">Points start after the 2.3 update.</p>`; });
    $('newsale') && ($('newsale').onclick = () => go('sale'));
    $('fix') && ($('fix').onclick = e => clockOut({ at: new Date($('leftAt').value).toISOString(), note: 'Forgot to clock out' }, e.target));
    $('openStore') && ($('openStore').onclick = e => busy(e.target, async () => { await api('settings_save', { key: 'store', value: { open: true, message: '' } }); await refresh(); go('today'); toast('The store is open.', 'ok'); }).catch(() => {}));
    $('reqOff') && ($('reqOff').onclick = timeOffSheet);
    $('toSched') && ($('toSched').onclick = e => { e.preventDefault(); go('schedule'); });
    pg.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  }

  // ================================================================ New sale
  const draft = { plan: 'personal', tier: 'pro', billing: 'month', os: C.os[0].id, connection: C.connections[0].id, customer: {}, promo: null };
  function pageSale() {
    const pg = $('pg');
    if (S.sale) return paintPayment();
    if (!shift() && !free()) { pg.innerHTML = gate('Clock in first', 'Sales are tracked on your shift.'); return wireGate(); }
    if (C.plans[draft.plan].quote) draft.plan = 'personal';
    pg.innerHTML = `<div class="sale">
      <div class="card">
        <div class="row" style="justify-content:space-between"><div class="seg" id="pseg">${PLANS.filter(p => !C.plans[p].quote).map(p => `<button data-v="${p}" class="${p === draft.plan ? 'on' : ''}">${esc(C.plans[p].name)}</button>`).join('')}</div>
          <div class="seg" id="bseg"><button data-v="month" class="${draft.billing === 'month' ? 'on' : ''}">Monthly</button><button data-v="year" class="${draft.billing === 'year' ? 'on' : ''}">Yearly</button></div></div>
        <label class="lbl">Tier</label><div class="tierpick" id="tp"></div>
        <div class="two"><div><label class="lbl">LentOS</label><select class="field" id="os">${C.os.map(o => `<option ${o.id === draft.os ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select></div>
          <div><label class="lbl">Connection</label><select class="field" id="conn">${C.connections.map(o => `<option ${o.id === draft.connection ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select></div></div>
        <div class="sect-title">${draft.plan === 'personal' ? 'Customer' : 'Business and the person placing the order'}</div>
        <div id="cust">${window.A3forms.html(draft.plan, draft.customer)}</div>
        <label class="lbl">Promo code <span style="opacity:.6">(optional)</span></label>
        <div class="promo-row"><input class="field" id="promo" placeholder="CODE" value="${esc(draft.promo?.code || '')}" maxlength="30"><button class="btn small" id="apply">Apply</button></div><div class="promo-ok" id="promoOk">${draft.promo ? `✓ ${esc(draft.promo.label)}` : ''}</div>
        <p class="muted" style="font-size:13px;margin:14px 0 0">Enterprise, custom prices and invoices: ${can('manager') ? '<a href="#quotes" id="toQuotes">Custom orders</a>' : 'ask a manager (Custom orders)'}.</p>
      </div>
      <div class="card summary" id="sum"></div></div>`;
    const keep = () => { draft.customer = window.A3forms.values($('cust')); };
    const seg = (id, key) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => { keep(); draft[key] = b.dataset.v; draft.promo = null; pageSale(); });
    seg('pseg', 'plan'); seg('bseg', 'billing');
    $('os').onchange = e => { draft.os = e.target.value; paintSum(); };
    $('conn').onchange = e => { draft.connection = e.target.value; paintSum(); };
    $('cust').oninput = keep;
    window.A3forms.wire($('cust'), { os: () => draft.os, region: () => storeRegion(myStore()) });
    $('promo').oninput = () => { if (draft.promo) { draft.promo = null; $('promoOk').textContent = ''; paintSum(); } };
    $('apply').onclick = e => busy(e.target, async () => {
      const code = $('promo').value.trim(); if (!code) return;
      draft.promo = await api('promo_check', { code, plan: draft.plan, tier: draft.tier, billing: draft.billing });
      $('promoOk').textContent = `✓ ${draft.promo.code}: ${draft.promo.label}`; paintSum();
    }).catch(() => { draft.promo = null; paintSum(); });
    $('toQuotes') && ($('toQuotes').onclick = e => { e.preventDefault(); go('quotes'); });
    paintTiers();
  }
  function paintTiers() {
    $('tp').innerHTML = TIERS.map(t => { const p = price(draft.plan, t, draft.billing);
      return `<button class="tp ${t === draft.tier ? 'on' : ''}" data-t="${t}"><b>${esc(C.tiers[t].name)}</b><div class="pr">${money(p.amount)}<span class="muted" style="font-size:12px;font-weight:500">/${p.interval === 'year' ? 'yr' : 'mo'}</span></div><small>${p.seats === 1 ? '1 person' : `${p.seats} people`} · ${esc(C.tiers[t].chip)}</small></button>`; }).join('');
    $('tp').querySelectorAll('.tp').forEach(b => b.onclick = () => { draft.tier = b.dataset.t; if (draft.promo) { draft.promo = null; $('promoOk').textContent = 'Tier changed: apply the code again.'; } paintTiers(); });
    paintSum();
  }
  function paintSum() {
    const p = price(draft.plan, draft.tier, draft.billing), t = C.tiers[draft.tier], per = p.interval === 'year' ? 'yr' : 'mo';
    $('sum').innerHTML = `<h3>${esc(C.plans[draft.plan].name)} · ${esc(t.name)}</h3>
      <div class="line"><span>People</span><span>${p.seats}</span></div><div class="line"><span>Chip</span><span>${esc(t.chip)}</span></div>
      <div class="line"><span>Models</span><span>${t.families.map(f => esc(C.families[f].name)).join(' + ')}</span></div>
      <div class="line"><span>LentOS</span><span>${esc(draft.os)}</span></div><div class="line"><span>Connection</span><span>${esc(draft.connection.replace(/ \(.*\)/, ''))}</span></div>
      <div class="line"><span>Billing</span><span>${p.interval === 'year' ? 'Yearly' : 'Monthly'}</span></div>
      ${draft.promo ? `<div class="line"><span>${esc(draft.promo.code)}</span><span style="color:var(--mint)">−${money(p.amount - draft.promo.after)}</span></div>` : ''}
      <div class="total"><span class="muted">Total</span><b>${money(draft.promo ? draft.promo.after : p.amount)}<span class="muted" style="font-size:14px;font-weight:500">/${per}</span></b></div>
      <button class="btn primary block" id="mk">${ic('qr', 16)} Create payment link</button>
      ${can('manager') ? `<button class="btn quiet block" id="comp" style="margin-top:8px">${ic('gift', 15)} Give it free (comp)…</button>` : ''}
      <p class="muted" style="font-size:12.5px;margin:10px 0 0">The customer pays on their phone (QR code) or on this screen. The order is created the moment Stripe confirms.</p>`;
    $('mk').onclick = e => {
      let customer; try { customer = window.A3forms.read($('cust'), draft.plan); } catch (err) { return toast(err.message, 'bad'); }
      busy(e.target, async () => {
        const r = await api('sale', { plan: draft.plan, tier: draft.tier, billing: draft.billing, os: draft.os, connection: draft.connection, customer, promo: draft.promo?.code });
        S.sale = { ...r, sel: { ...draft }, customer, state: 'waiting', started: Date.now() };
        paintPayment(); pollSale();
      }).catch(() => {});
    };
    $('comp') && ($('comp').onclick = compSheet);
  }
  function paintPayment() {
    const x = S.sale, pg = $('pg'); if (!pg) return;
    const sel = x.sel, label = `${esc(C.plans[sel.plan].name)} · ${esc(C.tiers[sel.tier].name)} · ${money(x.after ?? x.amount)}/${x.interval === 'year' ? 'yr' : 'mo'}`;
    if (x.state === 'paid') {
      pg.innerHTML = `<div class="card pay" style="max-width:560px;margin:0 auto"><div class="kicker">Paid</div><div class="paid">✓ Payment received</div>
        <p class="muted">${label}${x.customer?.company ? ` · ${esc(x.customer.company)}` : ''}</p>
        <div class="orderno" id="no">${esc(x.order.order_id)}</div>
        <p class="muted">Tell ${esc(x.customer?.first || 'the customer')} to redeem it in Nexus '28: Settings → Account → Redeem an order. It's on their Stripe receipt too.</p>
        <div class="row" style="justify-content:center"><button class="btn" id="cp">${ic('copy', 15)} Copy order number</button><button class="btn primary" id="again">${ic('plus', 15)} New sale</button></div></div>`;
      $('cp').onclick = () => copy(x.order.order_id);
      $('again').onclick = () => { S.sale = null; draft.customer = {}; draft.promo = null; go('sale'); };
      return;
    }
    const gone = x.state === 'expired';
    pg.innerHTML = `<div class="card pay" style="max-width:560px;margin:0 auto">
      <div class="kicker">${gone ? 'Not paid' : 'Waiting for payment'}</div><h3 style="margin:0">${label}</h3>
      ${x.customer?.name ? `<p class="muted" style="margin:4px 0 0">${esc(x.customer.name)}${x.customer.company ? ` · ${esc(x.customer.company)}` : ''}</p>` : ''}
      ${gone ? '<p class="muted" style="margin:18px 0">This payment link expired without a payment. Nothing was charged.</p>'
        : `<div class="qr">${qrSvg(x.url)}</div>
        <div class="wait"><span class="spin"></span> Scan with a phone camera to pay. This updates by itself.</div>
        <div class="linkbox"><input class="field" readonly value="${esc(x.url)}"><button class="btn small" id="cp">${ic('copy', 15)}</button><button class="btn small" id="open">Pay here</button></div>`}
      <p class="muted" style="font-size:13px;margin-top:14px">Order number once paid: <span class="mono">${esc(x.order_id)}</span></p>
      <div class="row" style="justify-content:center;margin-top:8px"><button class="btn quiet" id="cancel">${gone ? 'Back' : 'Cancel this sale'}</button>${!gone ? `<button class="btn quiet" id="chk">${ic('refresh', 15)} Check now</button>` : ''}</div></div>`;
    $('cp') && ($('cp').onclick = () => copy(x.url, 'Payment link copied.'));
    $('open') && ($('open').onclick = () => { desk ? desk.openPayment(x.url) : window.open(x.url, '_blank', 'noopener'); });
    $('chk') && ($('chk').onclick = e => busy(e.target, checkSale));
    $('cancel').onclick = () => { clearInterval(S.saleTimer); S.sale = null; go(S.page === 'quotes' ? 'quotes' : 'sale'); };
  }
  async function checkSale() {
    const x = S.sale; if (!x) return;
    const r = await api('sale_status', { session_id: x.session_id });
    if (r.ready) { x.state = 'paid'; x.order = r.order; clearInterval(S.saleTimer); toast(`Paid! Order ${r.order.order_id}.`, 'ok'); desk?.attention?.(); quiet(refresh()); }
    else if (r.state === 'expired') { x.state = 'expired'; clearInterval(S.saleTimer); }
    if (S.page === 'sale' || S.page === 'quotes') paintPayment();
  }
  function pollSale() {
    clearInterval(S.saleTimer);
    S.saleTimer = setInterval(() => { if (!S.sale || Date.now() - S.sale.started > 40 * 60e3) return clearInterval(S.saleTimer); quiet(checkSale()); }, 3000);
  }
  function compSheet() {
    let customer; try { customer = window.A3forms.read($('cust'), draft.plan); } catch (err) { return toast(`For a free order too: ${err.message}`, 'bad'); }
    sheet(`<div class="kicker">Manager · free order</div><h3>Comp ${esc(C.plans[draft.plan].name)} · ${esc(C.tiers[draft.tier].name)} for ${esc(customer.name)}</h3>
      <p class="muted">Creates a working order with no payment and no subscription. It's logged under your name.</p>
      <label class="lbl">Why</label><input class="field" id="nt" placeholder="e.g. tester, giveaway, make-good">
      <div class="acts"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">${ic('gift', 15)} Create free order</button></div>`,
      (el, close) => el.querySelector('#ok').onclick = e => busy(e.target, async () => {
        const r = await api('comp', { plan: draft.plan, tier: draft.tier, os: draft.os, connection: draft.connection, customer, note: el.querySelector('#nt').value });
        close(); sheet(`<div class="kicker">Free order created</div><div class="orderno" style="margin:12px 0">${esc(r.order_id)}</div><p class="muted">Redeem it in Nexus '28: Settings → Account → Redeem an order.</p><div class="acts"><button class="btn" id="cp2">${ic('copy', 15)} Copy</button><button class="btn primary" data-close>Done</button></div>`,
          el2 => el2.querySelector('#cp2').onclick = () => copy(r.order_id));
        draft.customer = {}; go('sale');
      }).catch(() => {}));
  }

  // ================================================================ Orders
  let orderQ = '';
  function pageOrders() {
    $('pg').innerHTML = `<div class="tools"><input class="field" id="q" placeholder="Search order number, email, name, company or quote" value="${esc(orderQ)}"><span class="sp"></span>
      ${can('manager') ? `<button class="btn small" id="exp">${ic('download', 15)} Export CSV</button>` : ''}<button class="btn small" id="rf">${ic('refresh', 15)} Refresh</button></div>
      <div class="card tblcard"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Plan</th><th class="num">Amount</th><th>Status</th><th>When</th><th>Sold by</th></tr></thead><tbody id="rows"><tr><td colspan="7" class="empty"><span class="spin"></span></td></tr></tbody></table></div>`;
    let t; $('q').oninput = e => { clearTimeout(t); orderQ = e.target.value; t = setTimeout(loadOrders, 250); };
    $('rf').onclick = loadOrders; $('q').focus(); loadOrders();
    $('exp') && ($('exp').onclick = e => busy(e.target, async () => {
      const all = await api('orders', { q: orderQ, all: true });
      csv(`aargon3-orders-${ymd(new Date())}.csv`, ['Order', 'Created', 'Status', 'Plan', 'Tier', 'Billing', 'Amount', 'Paid in total', 'Customer', 'Email', 'Phone', 'Company', 'People', 'Source', 'Sold by', 'Store', 'Promo', 'Quote', 'Node', 'Jurisdiction'],
        all.map(o => [o.order_id, o.created_at, o.status, o.plan, o.tier || o.config?.service_tier, o.billing, o.amount, o.paid_total, o.customer_name, o.customer_email, o.customer_phone, o.company_name, o.seats, o.source, o.operator, o.store, o.promo_code, o.quote_no, o.node_id, o.jurisdiction]));
    }).catch(() => {}));
  }
  const sourceLabel = o => ({ web: 'Online store', comp: 'Free (comp)', custom: 'Custom order', legacy: 'Old terminal' }[o.source] || o.operator || '—');
  async function loadOrders() {
    let list; try { list = await api('orders', { q: orderQ }); } catch (e) { $('rows') && ($('rows').innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`); return; }
    if (!$('rows')) return;
    $('rows').innerHTML = list.map(o => `<tr class="click" data-id="${esc(o.order_id)}"><td class="id">${esc(o.order_id)}${o.quote_no ? `<div class="muted" style="font-size:11.5px">${esc(o.quote_no)}</div>` : ''}</td>
      <td>${esc(o.company_name || o.customer_name || o.customer_email || '—')}${(o.company_name ? o.customer_name : o.customer_name && o.customer_email) ? `<div class="muted" style="font-size:12.5px">${esc(o.company_name ? o.customer_name : o.customer_email)}</div>` : ''}</td>
      <td>${esc(o.plan || '—')} · ${esc(o.tier ? tierName(o.tier) : o.config?.service_tier || '—')}${o.seats && o.plan === 'Enterprise' ? `<div class="muted" style="font-size:12px">${o.seats} people</div>` : ''}</td>
      <td class="num">${o.source === 'comp' ? '<span class="pill vio">COMP</span>' : money(Number(o.amount) || 0)}${o.billing === 'year' ? '<span class="muted">/yr</span>' : o.subscription ? '<span class="muted">/mo</span>' : ''}</td>
      <td>${statusPill(o.status)}</td><td class="muted">${fmtWhen(o.created_at)}</td><td class="muted">${esc(o.source === 'terminal' || o.source === 'custom' ? o.operator || sourceLabel(o) : sourceLabel(o))}</td></tr>`).join('')
      || `<tr><td colspan="7" class="empty">${orderQ ? 'No orders match.' : 'No orders yet.'}</td></tr>`;
    $('rows').querySelectorAll('tr.click').forEach(r => r.onclick = () => orderSheet(r.dataset.id));
  }
  async function orderSheet(id) {
    let o; try { o = await api('order', { order_id: id }); } catch (e) { return toast(e.message, 'bad'); }
    const c = o.config || {}, info = o.customer_info || {}, active = String(o.status).toUpperCase() === 'ACTIVE';
    sheet(`<div class="kicker">Order</div><div class="row" style="justify-content:space-between"><h3 class="mono">${esc(o.order_id)}</h3>${statusPill(o.status)}</div>
      <div class="kv">
        ${o.company_name ? `<span>Company</span><span><b>${esc(o.company_name)}</b></span>` : ''}
        <span>Customer</span><span>${esc(o.customer_name || '—')}${info.title ? ` · ${esc(info.title)}` : ''}${o.customer_email ? `<br><span class="muted">${esc(o.customer_email)}</span>` : ''}${o.customer_phone ? `<br><span class="muted">${esc(o.customer_phone)}</span>` : ''}</span>
        <span>Plan</span><span>${esc(o.plan || '—')} · ${esc(c.service_tier || tierName(o.tier))}${o.seats ? ` · ${o.seats} ${o.seats === 1 ? 'person' : 'people'}` : ''}</span>
        <span>Amount</span><span>${o.source === 'comp' ? 'Free (comp)' : `${money(Number(o.amount) || 0)}${o.billing === 'year' ? ' a year' : o.billing === 'once' ? ' once' : o.subscription ? ' a month' : ''}`}${o.discount > 0 ? ` <span class="muted">(${money(o.discount)} off with ${esc(o.promo_code)})</span>` : o.promo_code ? ` · ${esc(o.promo_code)}` : ''}</span>
        ${o.payments > 1 ? `<span>Paid in total</span><span>${money(o.paid_total)} <span class="muted">over ${o.payments} payments</span></span>` : ''}
        <span>System</span><span>${esc([c.os, c.chip, c.connection].filter(Boolean).join(' · ') || '—')}</span>
        ${o.node_id ? `<span>Node</span><span class="mono">${esc(o.node_id)}</span>` : ''}${o.jurisdiction ? `<span>Jurisdiction</span><span>${esc(o.jurisdiction)}</span>` : ''}
        ${o.quote_no ? `<span>Quote</span><span class="mono">${esc(o.quote_no)}</span>` : ''}
        <span>Sold</span><span>${fmtWhen(o.created_at)} · ${esc(o.source === 'web' ? 'Online store' : `${o.operator || '—'}${o.store ? ', ' + o.store : ''}`)}</span>
        ${o.notes ? `<span>Notes</span><span>${esc(o.notes)}</span>` : ''}</div>
      <label class="lbl">Models</label><div class="chips">${(o.models || []).map(m => `<span>${esc(m)}</span>`).join('') || '<span>—</span>'}</div>
      <div class="acts"><button class="btn quiet" id="cp">${ic('copy', 15)} Copy number</button>${can('manager') && active ? `<button class="btn danger" id="cx">Cancel</button>${o.subscription ? '<button class="btn danger" id="rf">Refund & cancel</button>' : ''}` : ''}<button class="btn primary" data-close>Close</button></div>`,
      (el, close) => {
        el.querySelector('#cp').onclick = () => copy(o.order_id);
        const act = refund => async () => {
          if (!(await confirmSheet(refund ? 'Refund and cancel?' : 'Cancel this order?', refund ? 'Refunds the last payment, ends the subscription now, and the order stops working in Nexus.' : 'Ends the subscription now (no refund), and the order stops working in Nexus.', refund ? 'Refund & cancel' : 'Cancel order', true))) return;
          const r = await api('cancel', { order_id: o.order_id, refund }).catch(err => { toast(err.message, 'bad'); return null; });
          if (r) { close(); toast(`${o.order_id} ${r.status.toLowerCase()}${r.refunded ? ` · refunded ${money(r.refunded)}` : ''}.`, 'ok'); loadOrders(); }
        };
        el.querySelector('#cx') && (el.querySelector('#cx').onclick = act(false));
        el.querySelector('#rf') && (el.querySelector('#rf').onclick = act(true));
      });
  }

  // ================================================================ Catalog
  let catBilling = 'month';
  function pageCatalog() {
    const h = window.A3compare.html({ billing: catBilling });
    $('pg').innerHTML = `<div class="h-row"><p class="muted" style="margin:0">Everything in every plan, straight from the catalog the store uses.</p><span class="sp"></span>
      <div class="seg" id="cb"><button data-v="month" class="${catBilling === 'month' ? 'on' : ''}">Monthly</button><button data-v="year" class="${catBilling === 'year' ? 'on' : ''}">Yearly</button></div></div>
      ${h.table}<div class="sect-title">LentOS</div>${h.os}<div class="sect-title">Connections</div>${h.connections}<div class="sect-title">Quouk chips</div>${h.chips}<div class="sect-title">People per order</div>${h.plans}
      <div class="sect-title">Enterprise starting prices</div><div class="cmp-cards">${TIERS.map(t => `<div class="cmp-card"><b>${esc(C.tiers[t].name)}</b><p>${money(C.plans.enterprise.perSeatMonthly[t])} a person a month, from ${money(A3.enterpriseSuggest(t, 0))}/month. Quote it in Custom orders.</p></div>`).join('')}</div>`;
    $('cb').querySelectorAll('button').forEach(b => b.onclick = () => { catBilling = b.dataset.v; pageCatalog(); });
  }

  // ================================================================ Schedule
  let weekStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  async function pageSchedule() {
    const pg = $('pg'), mgr = can('manager');
    const end = new Date(weekStart.getTime() + 7 * 864e5), days = [...Array(7)].map((_, i) => new Date(weekStart.getTime() + i * 864e5));
    pg.innerHTML = `<div class="h-row"><button class="btn small" id="prev">${ic('left', 15)}</button><h3>${weekStart.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(end - 864e5).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</h3><button class="btn small" id="next">${ic('right', 15)}</button><button class="btn quiet small" id="thisWeek">This week</button>
      <span class="sp"></span>${mgr ? `<button class="btn small" id="copyWeek">${ic('copy', 15)} Copy to next week</button><button class="btn small" id="timeoff">${ic('bell', 15)} Time off${S.state?.pending_time_off ? ` (${S.state.pending_time_off})` : ''}</button><button class="btn primary small" id="add">${ic('plus', 15)} Add shift</button>`
        : `<button class="btn small" id="timeoff">${ic('calendarx', 15)} Ask for time off</button>`}</div>
      <div id="grid"><div class="empty"><span class="spin"></span></div></div>
      <p class="muted" style="font-size:13px;margin-top:10px">${mgr ? 'Click an empty day to add a shift, or a shift to change it. Striped days are approved time off.' : 'Your shifts are purple. Ask a manager to change them.'}</p>`;
    $('prev').onclick = () => { weekStart = new Date(weekStart.getTime() - 7 * 864e5); pageSchedule(); };
    $('next').onclick = () => { weekStart = new Date(weekStart.getTime() + 7 * 864e5); pageSchedule(); };
    $('thisWeek').onclick = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); weekStart = d; pageSchedule(); };
    $('timeoff').onclick = mgr ? timeOffReview : timeOffSheet;
    let shifts, team = [], off = [];
    try {
      [shifts, team, off] = await Promise.all([api('schedule', { from: weekStart.toISOString(), to: end.toISOString() }), mgr ? api('team') : Promise.resolve([]), api('timeoff', { everyone: mgr })]);
    } catch (e) { $('grid') && ($('grid').innerHTML = `<div class="empty-card">${esc(e.message)}</div>`); return; }
    if (!$('grid')) return;
    const people = mgr ? team.filter(s => s.active && s.user_id) : [];
    for (const c of shifts) if (!people.some(p => p.user_id === c.user_id)) people.push({ user_id: c.user_id, name: c.name, color: c.color });
    if (!people.some(p => p.user_id === S.me.id)) people.unshift({ user_id: S.me.id, name: S.me.name, color: S.me.color, title: S.me.title });
    const approved = off.filter(t => t.status === 'approved');
    const isOff = (uid, d) => approved.some(t => t.user_id === uid && ymd(d) >= t.starts_on && ymd(d) <= t.ends_on);
    const today = ymd(new Date());
    $('grid').innerHTML = `<div class="week"><div class="hd">Person</div>${days.map(d => `<div class="hd ${ymd(d) === today ? 'today' : ''}">${d.toLocaleDateString([], { weekday: 'short' })}<b>${d.getDate()}</b></div>`).join('')}
      ${people.map(p => `<div class="who ${p.user_id === S.me.id ? 'me-row' : ''}">${avatar(p.name, p.color)}<div>${esc(p.name)}<small>${esc(p.title || roleName(p.role) || '')}</small></div></div>
        ${days.map(d => { const list = shifts.filter(c => c.user_id === p.user_id && ymd(c.starts_at) === ymd(d)), offDay = isOff(p.user_id, d);
          return `<div class="cell ${mgr ? 'can' : ''} ${offDay ? 'off' : ''} ${p.user_id === S.me.id ? 'me-row' : ''}" data-u="${esc(p.user_id)}" data-d="${ymd(d)}">${list.map(c => `<button class="chipx ${p.user_id === S.me.id ? 'me' : ''} ${c.worked != null ? 'done' : ''} ${c.time_off ? 'flag' : ''}" data-id="${c.id}" title="${esc(`${fmtTime(c.starts_at)}–${fmtTime(c.ends_at)} · ${c.store_code ? '#' + c.store_code : 'Any store'}${c.note ? ' · ' + c.note : ''}`)}"><span class="t">${shortTime(c.starts_at)}–${shortTime(c.ends_at)}</span><small>${c.store_code ? `#${esc(c.store_code)}` : 'Any store'}${c.note ? ` · ${esc(c.note)}` : ''}${c.worked != null ? ` · worked ${hm(c.worked)}` : ''}</small></button>`).join('')}${offDay && !list.length ? '<small class="muted">Off</small>' : ''}</div>`; }).join('')}`).join('')}</div>`;
    if (!mgr) return;
    $('grid').querySelectorAll('.cell.can').forEach(cell => cell.onclick = e => {
      const chip = e.target.closest('.chipx');
      if (chip) return shiftSheet(shifts.find(c => String(c.id) === chip.dataset.id), people);
      shiftSheet({ user_id: cell.dataset.u, day: cell.dataset.d }, people);
    });
    $('add').onclick = () => shiftSheet({ user_id: people[0]?.user_id, day: ymd(new Date()) }, people);
    $('copyWeek').onclick = e => busy(e.target, async () => { const r = await api('schedule_copy', { week_start: weekStart.toISOString() }); toast(r.copied ? `Copied ${r.copied} shift${r.copied === 1 ? '' : 's'} to next week.` : 'Nothing to copy (or next week already has them).', 'ok'); }).catch(() => {});
  }
  function shiftSheet(c, people) {
    const day = c.day || ymd(c.starts_at), start = c.starts_at ? fmtHM(c.starts_at) : '09:00', end = c.ends_at ? fmtHM(c.ends_at) : '17:00';
    sheet(`<div class="kicker">${c.id ? 'Change shift' : 'Add shift'}</div><h3>${c.id ? esc(c.name || 'Shift') : 'Schedule someone'}</h3>
      <label class="lbl">Person</label><select class="field" id="u">${people.map(p => `<option value="${esc(p.user_id)}" ${p.user_id === c.user_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      <div class="grid3"><div><label class="lbl">Day</label><input class="field" type="date" id="d" value="${day}"></div><div><label class="lbl">Starts</label><input class="field" type="time" id="s" value="${start}"></div><div><label class="lbl">Ends</label><input class="field" type="time" id="e" value="${end}"></div></div>
      <label class="lbl">Store</label><select class="field" id="st">${storeOptions(c.store_code || '', true)}</select>
      <label class="lbl">Note (optional)</label><input class="field" id="n" value="${esc(c.note || '')}" placeholder="e.g. Opening, inventory">
      <div class="acts">${c.id ? `<button class="btn danger" id="del">${ic('trash', 15)} Remove</button><span style="flex:1"></span>` : ''}<button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">Save</button></div>`,
      (el, close) => {
        el.querySelector('#ok').onclick = e => busy(e.target, async () => {
          const d = el.querySelector('#d').value, s = el.querySelector('#s').value, en = el.querySelector('#e').value;
          const starts = new Date(`${d}T${s}`), ends = new Date(`${d}T${en}`); if (ends <= starts) ends.setDate(ends.getDate() + 1);   // overnight
          await api('schedule_save', { id: c.id, user_id: el.querySelector('#u').value, starts_at: starts.toISOString(), ends_at: ends.toISOString(), store_code: el.querySelector('#st').value, note: el.querySelector('#n').value });
          close(); toast('Shift saved.', 'ok'); quiet(refresh()); pageSchedule();
        }).catch(() => {});
        el.querySelector('#del') && (el.querySelector('#del').onclick = e => busy(e.target, async () => { await api('schedule_delete', { id: c.id }); close(); toast('Shift removed.'); pageSchedule(); }).catch(() => {}));
      });
  }
  const fmtHM = d => { const x = new Date(d); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  function timeOffSheet() {
    const t = ymd(new Date(Date.now() + 864e5));
    sheet(`<div class="kicker">Time off</div><h3>Ask for days off</h3><p class="muted">A manager will approve or deny it. You'll see the answer on your Profile.</p>
      <div class="grid2"><div><label class="lbl">First day</label><input class="field" type="date" id="a" value="${t}" min="${ymd(new Date())}"></div><div><label class="lbl">Last day</label><input class="field" type="date" id="b" value="${t}" min="${ymd(new Date())}"></div></div>
      <label class="lbl">Reason (optional)</label><input class="field" id="r" placeholder="e.g. Trip, appointment">
      <div class="acts"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">Send request</button></div>`,
      (el, close) => el.querySelector('#ok').onclick = e => busy(e.target, async () => {
        await api('timeoff_request', { starts_on: el.querySelector('#a').value, ends_on: el.querySelector('#b').value, reason: el.querySelector('#r').value });
        close(); toast('Request sent.', 'ok'); if (S.page === 'profile') pageProfile();
      }).catch(() => {}));
  }
  async function timeOffReview() {
    let list; try { list = await api('timeoff', { everyone: true }); } catch (e) { return toast(e.message, 'bad'); }
    sheet(`<div class="kicker">Time off</div><h3>Requests</h3>
      <div class="people" style="margin-top:12px">${list.map(t => `<div class="person">${avatar(t.name)}<div><b>${esc(t.name || '—')}</b><small>${fmtDate(t.starts_on)}${t.ends_on !== t.starts_on ? ` – ${fmtDate(t.ends_on)}` : ''}${t.reason ? ` · ${esc(t.reason)}` : ''}${t.decided_by ? ` · ${esc(t.status)} by ${esc(t.decided_by)}` : ''}</small></div>
        <div class="r">${t.status === 'pending' ? `<button class="btn small" data-a="approved" data-id="${t.id}">Approve</button> <button class="btn small danger" data-a="denied" data-id="${t.id}">Deny</button>` : statusPill(t.status)}</div></div>`).join('') || '<div class="empty">No requests.</div>'}</div>
      <div class="acts"><button class="btn primary" data-close>Done</button></div>`,
      (el, close) => el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => busy(b, async () => {
        await api('timeoff_decide', { id: Number(b.dataset.id), status: b.dataset.a }); close(); toast(b.dataset.a === 'approved' ? 'Approved.' : 'Denied.', 'ok'); await refresh(); if (S.page === 'schedule') pageSchedule(); timeOffReview();
      }).catch(() => {})));
  }

  // ================================================================ Timesheet
  const tsv = { range: 'week', everyone: false, rows: [], pay: {} };
  function rangeOf(r) {
    const now = new Date(), d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (r === 'week') return [monday, new Date(monday.getTime() + 7 * 864e5)];
    if (r === 'lastweek') return [new Date(monday.getTime() - 7 * 864e5), monday];
    if (r === 'month') return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 1)];
    return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 1)];
  }
  function pageTime() {
    $('pg').innerHTML = `<div class="tools"><div class="seg" id="rseg">${[['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month']].map(([v, l]) => `<button data-v="${v}" class="${tsv.range === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${can('manager') ? `<div class="seg" id="wseg"><button data-v="me" class="${!tsv.everyone ? 'on' : ''}">Me</button><button data-v="all" class="${tsv.everyone ? 'on' : ''}">Everyone</button></div>` : ''}
      <span class="sp"></span><button class="btn small" id="csvb">${ic('download', 15)} Export CSV</button></div><div id="tot" class="totals"></div>
      <div class="card tblcard"><table class="tbl"><thead><tr><th>Day</th>${tsv.everyone ? '<th>Who</th>' : ''}<th>Store</th><th>In</th><th>Out</th><th class="num">Breaks</th><th class="num">Worked</th><th class="num">Sales</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="9" class="empty"><span class="spin"></span></td></tr></tbody></table></div>`;
    $('rseg').querySelectorAll('button').forEach(b => b.onclick = () => { tsv.range = b.dataset.v; pageTime(); });
    $('wseg') && $('wseg').querySelectorAll('button').forEach(b => b.onclick = () => { tsv.everyone = b.dataset.v === 'all'; pageTime(); });
    $('csvb').onclick = exportTime;
    loadShifts();
  }
  const breakMin = s => (s.breaks || []).reduce((m, b) => m + ((b.end ? new Date(b.end) : new Date()) - new Date(b.start)) / 60e3, 0);
  async function loadShifts() {
    const [from, to] = rangeOf(tsv.range);
    try {
      const [rows, team] = await Promise.all([api('shifts', { from: from.toISOString(), to: to.toISOString(), everyone: tsv.everyone }), can('owner') && tsv.everyone ? api('team') : Promise.resolve(null)]);
      tsv.rows = rows; tsv.pay = {}; (team || []).forEach(s => { if (s.user_id && s.pay_rate != null) tsv.pay[s.user_id] = Number(s.pay_rate); });
    } catch (e) { $('rows') && ($('rows').innerHTML = `<tr><td colspan="9" class="empty">${esc(e.message)}</td></tr>`); return; }
    if (!$('rows')) return;
    const total = tsv.rows.reduce((m, s) => m + s.minutes, 0), byPerson = {};
    tsv.rows.forEach(s => { const k = s.user_id; byPerson[k] = byPerson[k] || { name: s.name, m: 0 }; byPerson[k].m += s.minutes; });
    const payTotal = Object.entries(byPerson).reduce((m, [uid, p]) => m + (tsv.pay[uid] != null ? tsv.pay[uid] * p.m / 60 : 0), 0);
    $('tot').innerHTML = `<div class="card stat"><div class="k">Total worked</div><div class="v">${hm(total)}</div></div><div class="card stat"><div class="k">Shifts</div><div class="v">${tsv.rows.length}</div></div>
      <div class="card stat"><div class="k">Late clock-ins</div><div class="v">${tsv.rows.filter(s => s.late_minutes).length}</div></div>
      ${can('owner') && tsv.everyone ? `<div class="card stat"><div class="k">Estimated pay</div><div class="v">${money(Math.round(payTotal * 100) / 100)}</div><div class="s">hours × pay rate (Team)</div></div>` : ''}`
      + (tsv.everyone ? Object.entries(byPerson).sort((a, b) => b[1].m - a[1].m).map(([uid, p]) => `<div class="card stat"><div class="k">${esc(p.name)}</div><div class="v">${hm(p.m)}</div>${tsv.pay[uid] != null && can('owner') ? `<div class="s">${money(Math.round(tsv.pay[uid] * p.m / 60 * 100) / 100)} at ${money(tsv.pay[uid])}/h</div>` : ''}</div>`).join('') : '');
    $('rows').innerHTML = tsv.rows.map((s, i) => `<tr><td>${fmtDay(s.clock_in)}</td>${tsv.everyone ? `<td>${esc(s.name)}</td>` : ''}<td>#${esc(s.store_code || '—')}</td>
      <td>${fmtTime(s.clock_in)}${s.late_minutes ? ` <span class="pill warn" title="Scheduled ${s.scheduled ? fmtTime(s.scheduled.starts_at) : ''}">${s.late_minutes}M LATE</span>` : ''}</td>
      <td>${s.clock_out ? fmtTime(s.clock_out) : '<span class="pill ok">NOW</span>'}${s.forgot ? ' <span class="pill warn" title="Clock-out time entered afterwards">SET LATER</span>' : ''}${s.edited_by ? ` <span class="pill vio" title="Edited by ${esc(s.edited_by)}">EDITED</span>` : ''}</td>
      <td class="num">${breakMin(s) >= 1 ? hm(breakMin(s)) : '—'}</td><td class="num"><b>${hm(s.minutes)}</b></td><td class="num">${s.orders ? `${s.orders} · ${money(Number(s.sales) || 0)}` : '—'}</td>
      <td class="num">${can('manager') ? `<button class="btn quiet small" data-i="${i}" title="Fix this shift">${ic('edit', 15)}</button>` : ''}${s.note ? ` <span title="${esc(s.note)}">📝</span>` : ''}</td></tr>`).join('')
      || `<tr><td colspan="9" class="empty">No shifts in this range.</td></tr>`;
    $('rows').querySelectorAll('button[data-i]').forEach(b => b.onclick = () => editShift(tsv.rows[+b.dataset.i]));
  }
  function editShift(s) {
    sheet(`<div class="kicker">Manager · fix a shift</div><h3>${esc(s.name)} · ${fmtDay(s.clock_in)}</h3><p class="muted">The change is saved with your name on it.</p>
      <div class="two"><div><label class="lbl">Clock in</label><input class="field" type="datetime-local" id="ci" value="${localInput(s.clock_in)}"></div>
      <div><label class="lbl">Clock out</label><input class="field" type="datetime-local" id="co" value="${s.clock_out ? localInput(s.clock_out) : ''}"></div></div>
      <label class="lbl">Note</label><input class="field" id="nt" value="${esc(s.note || '')}">
      <div class="acts"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">Save</button></div>`,
      (el, close) => el.querySelector('#ok').onclick = e => busy(e.target, async () => {
        const co = el.querySelector('#co').value;
        await api('edit_shift', { id: s.id, clock_in: new Date(el.querySelector('#ci').value).toISOString(), clock_out: co ? new Date(co).toISOString() : null, note: el.querySelector('#nt').value });
        close(); toast('Shift saved.', 'ok'); quiet(refresh()); loadShifts();
      }).catch(() => {}));
  }
  function exportTime() {
    const pay = can('owner') && tsv.everyone;
    csv(`aargon3-timesheet-${tsv.range}${tsv.everyone ? '-everyone' : ''}.csv`, ['Name', 'Store', 'Clock in', 'Clock out', 'Scheduled start', 'Minutes late', 'Break minutes', 'Worked minutes', 'Hours', ...(pay ? ['Pay rate', 'Estimated pay'] : []), 'Orders', 'Sales', 'Note', 'Edited by'],
      tsv.rows.map(s => [s.name, s.store, new Date(s.clock_in).toLocaleString(), s.clock_out ? new Date(s.clock_out).toLocaleString() : '', s.scheduled ? new Date(s.scheduled.starts_at).toLocaleString() : '', s.late_minutes || '',
        Math.round(breakMin(s)), s.minutes, (s.minutes / 60).toFixed(2), ...(pay ? [tsv.pay[s.user_id] ?? '', tsv.pay[s.user_id] != null ? (tsv.pay[s.user_id] * s.minutes / 60).toFixed(2) : ''] : []), s.orders, s.sales, s.note, s.edited_by]));
  }

  // ================================================================ Sales (all time)
  let salesMine = false;
  async function pageSales() {
    const pg = $('pg'), mgr = can('manager');
    pg.innerHTML = `${mgr ? `<div class="h-row"><div class="seg" id="ms"><button data-v="all" class="${!salesMine ? 'on' : ''}">Everyone</button><button data-v="me" class="${salesMine ? 'on' : ''}">Just me</button></div><span class="sp"></span></div>` : ''}<div id="sbody"><div class="empty"><span class="spin"></span></div></div>`;
    $('ms') && $('ms').querySelectorAll('button').forEach(b => b.onclick = () => { salesMine = b.dataset.v === 'me'; pageSales(); });
    let d, settings = null;
    try { [d, settings] = await Promise.all([api('sales', { mine: salesMine }), mgr ? api('settings').catch(() => null) : null]); }
    catch (e) { $('sbody') && ($('sbody').innerHTML = `<div class="empty-card">${esc(e.message)}</div>`); return; }
    if (!$('sbody')) return;
    const goal = Number(settings?.settings?.goals?.monthly_revenue) || 0, a = d.all_time || {};
    const months = d.months || [], max = Math.max(1, ...months.map(m => Number(m.revenue) || 0));
    const split = (title, list, label = x => x.key) => { const tot = Math.max(1, list.reduce((m, x) => m + (Number(x.revenue) || 0), 0));
      return `<div class="card"><h3>${title}</h3><div class="split">${list.map(x => `<div class="r"><span>${esc(label(x))} <span class="muted">· ${x.orders}</span></span><span>${big(x.revenue)}</span><div class="track"><div style="width:${Math.round((Number(x.revenue) || 0) / tot * 100)}%"></div></div></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div></div>`; };
    $('sbody').innerHTML = `<div class="stats">
        <div class="card stat"><div class="k">All-time sales</div><div class="v">${big(a.revenue)}</div><div class="s">${a.orders || 0} orders${a.renewals ? ` · ${a.renewals} renewals` : ''}</div></div>
        <div class="card stat"><div class="k">This month</div><div class="v">${big(d.this_month)}</div><div class="s">${goal && !salesMine ? `goal ${big(goal)}` : 'payments received'}</div>${goal && !salesMine ? `<div class="goal"><div style="width:${Math.min(100, Math.round(d.this_month / goal * 100))}%"></div></div>` : ''}</div>
        <div class="card stat"><div class="k">Monthly recurring</div><div class="v">${big(d.mrr)}</div><div class="s">${d.active_subscriptions || 0} active subscriptions</div></div>
        <div class="card stat"><div class="k">Average order</div><div class="v">${big(a.paid_orders ? a.revenue / a.paid_orders : 0)}</div><div class="s">${a.comp_orders || 0} free (comp)</div></div></div>
      <div class="card"><h3>Last 12 months</h3><div class="mbars">${months.map((m, i) => `<div class="b ${i === months.length - 1 ? 'now' : ''}" title="${esc(m.month)}: ${m.orders} orders"><span class="amt">${Number(m.revenue) ? big(m.revenue) : ''}</span><div class="bar" style="height:${Math.round((Number(m.revenue) || 0) / max * 160)}px"></div><span class="lab">${new Date(m.month + '-15').toLocaleDateString([], { month: 'short' })}</span></div>`).join('')}</div></div>
      <div class="grid3" style="margin-top:12px">${split('By plan', d.by_plan || [])}${split('By tier', d.by_tier || [], x => tierName(x.key))}${split('Where it sold', d.by_source || [], x => ({ web: 'Online store', terminal: 'Terminal', comp: 'Free (comp)', custom: 'Custom orders', legacy: 'Old terminal' }[x.key] || x.key))}</div>
      ${!salesMine && mgr ? `<div class="grid2" style="margin-top:12px"><div class="card rank"><h3>Top sellers</h3><div class="split">${(d.top_staff || []).map(x => `<div class="r"><span>${esc(x.name)} <span class="muted">· ${x.orders}</span></span><span>${big(x.revenue)}</span></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div></div>
        <div class="card rank"><h3>Top stores</h3><div class="split">${(d.top_stores || []).map(x => `<div class="r"><span>${esc(x.name)} <span class="muted">· ${x.orders}</span></span><span>${big(x.revenue)}</span></div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div></div></div>` : ''}
      <p class="muted" style="font-size:12.5px;margin-top:12px">Counts every payment, including monthly and yearly renewals since 2.1. Refunded orders don't count. Old-terminal orders count at the price they were rung up for.${a.first_order ? ` First order: ${fmtDate(a.first_order)}.` : ''}</p>`;
  }

  // ================================================================ Profile
  // ================================================================ points (behavior)
  const PT_PRESETS = [[2, 'Great customer service'], [1, 'Helped a teammate'], [3, 'Covered a shift'], [2, 'Big sale'], [5, 'Went above and beyond'], [1, 'Kept the store spotless'],
    [-1, 'Late'], [-1, 'Phone out on the floor'], [-1, 'Forgot to clock out'], [-3, 'Rude to a customer'], [-5, 'No-show'], [-2, 'Left early without asking']];
  const ptVal = n => `<span class="pv ${n < 0 ? 'neg' : 'pos'}">${n > 0 ? '+' : ''}${n}</span>`;
  function ptRow(x, compact, canUndo) {
    return `<div class="ptrow ${x.undone ? 'undone' : ''}">${ptVal(x.points)}<div class="pt-what"><b>${esc(x.reason)}</b><small>${compact ? '' : `${esc(x.name || '')} · `}${x.kind === 'late' ? 'automatic' : `from ${esc(x.given_by || '—')}`} · ${fmtWhen(x.created_at)}${x.undone ? ` · undone by ${esc(x.undone_by || '')}` : ''}</small></div>
      ${canUndo && !x.undone ? `<button class="btn quiet small" data-undo="${x.id}">Undo</button>` : ''}</div>`;
  }
  let ptUser = null;
  async function pagePoints() {
    const pg = $('pg');
    pg.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    let d; try { d = await api('points', ptUser ? { user_id: ptUser } : {}); } catch (e) { pg.innerHTML = `<div class="empty-card">${esc(/function|not find|schema/i.test(e.message) ? 'Points need the 2.3 database update (supabase/aargon3-2.3.sql).' : e.message)}</div>`; return; }
    if (S.page !== 'points') return;
    const mgr = can('manager'), m = d.mine;
    const canUndo = x => mgr && (can('owner') || x.given_by_id === S.me.id);
    if (!mgr) {
      pg.innerHTML = `<div class="stats">
          <div class="card stat"><div class="k">Your points</div><div class="v ${m.total < 0 ? 'neg' : ''}">${m.total}</div><div class="s">all time</div></div>
          <div class="card stat"><div class="k">This month</div><div class="v">${m.month > 0 ? '+' : ''}${m.month}</div><div class="s">since the 1st</div></div>
          <div class="card stat"><div class="k">Earned</div><div class="v" style="color:var(--mint)">+${m.given}</div><div class="s">for great work</div></div>
          <div class="card stat"><div class="k">Lost</div><div class="v" style="color:var(--red)">${m.taken}</div><div class="s">for slip-ups</div></div></div>
        <div class="card"><h3>History</h3><div class="ptlist">${d.history.map(x => ptRow(x, true)).join('') || '<p class="muted" style="margin:0">No points yet. Managers give points for great work (and take a few away for things like being late).</p>'}</div></div>`;
      return;
    }
    const board = d.board || [], who = ptUser && board.find(r => r.user_id === ptUser);
    const eligible = board.filter(r => r.user_id !== S.me.id && (can('owner') || r.role === 'employee'));
    pg.innerHTML = `<div class="h-row"><p class="muted" style="margin:0">Give points for great work and take them away for slip-ups. Everyone sees their own points and history; only managers see the whole team.</p><span class="sp"></span>
        <button class="btn primary small" id="give" ${eligible.length ? '' : 'disabled'}>${ic('star', 15)} Give points</button></div>
      <div class="ptgrid">
        <div class="card"><h3>Leaderboard <small>this month · all time</small></h3><div class="board">${board.map((r, i) => `<button class="brow ${r.user_id === ptUser ? 'on' : ''}" data-u="${esc(r.user_id)}">
            <span class="rank">${i + 1}</span>${avatar(r.name, r.color)}<span class="bn"><b>${esc(r.name)}</b><small>${esc(r.title || roleName(r.role))}</small></span>
            <span class="bm">${r.month > 0 ? '+' : ''}${r.month}</span><span class="bt ${r.total < 0 ? 'neg' : ''}">${r.total}</span></button>`).join('') || '<p class="muted">Nobody on the team yet.</p>'}</div></div>
        <div class="card"><div class="h-row" style="margin:0 0 6px"><h3 style="margin:0">${who ? esc(who.name) : 'Recent'}</h3><span class="sp"></span>${who ? `<button class="btn quiet small" id="allp">Everyone</button>${eligible.some(r => r.user_id === who.user_id) ? `<button class="btn small" id="givep">${ic('star', 14)} Give ${esc(who.name.split(' ')[0])} points</button>` : ''}` : ''}</div>
          ${who ? `<div class="row" style="gap:18px;margin:4px 0 12px"><div><div class="k">TOTAL</div><b class="ptsbig ${who.total < 0 ? 'neg' : ''}">${who.total}</b></div><div><div class="k">MONTH</div><b style="font-size:20px">${who.month > 0 ? '+' : ''}${who.month}</b></div><div><div class="k">EARNED</div><b style="font-size:20px;color:var(--mint)">+${who.given}</b></div><div><div class="k">LOST</div><b style="font-size:20px;color:var(--red)">${who.taken}</b></div></div>` : ''}
          <div class="ptlist">${d.history.map(x => ptRow(x, !!who, canUndo(x))).join('') || '<p class="muted" style="margin:0">No points given yet.</p>'}</div></div></div>
      <form class="card" id="fpts" style="margin-top:12px"><h3>${ic('time')} Automatic points</h3>
        <div class="row" style="gap:10px"><span>A late clock-in (more than 5 minutes after a scheduled start) costs</span>
          <select class="field" id="late" style="width:auto" ${can('owner') ? '' : 'disabled'}>${[0, -1, -2, -3, -5].map(v => `<option value="${v}" ${Number(d.settings?.late || 0) === v ? 'selected' : ''}>${v === 0 ? 'nothing (off)' : `${-v} point${v === -1 ? '' : 's'}`}</option>`).join('')}</select>
          ${can('owner') ? '<button class="btn small">Save</button>' : '<span class="muted" style="font-size:13px">Only the owner can change this.</span>'}</div></form>`;
    pg.querySelectorAll('.brow').forEach(b => b.onclick = () => { ptUser = ptUser === b.dataset.u ? null : b.dataset.u; pagePoints(); });
    $('allp') && ($('allp').onclick = () => { ptUser = null; pagePoints(); });
    $('give').onclick = () => giveSheet(eligible, null);
    $('givep') && ($('givep').onclick = () => giveSheet(eligible, who.user_id));
    pg.querySelectorAll('[data-undo]').forEach(b => b.onclick = async () => {
      const x = d.history.find(h => h.id === +b.dataset.undo);
      if (!(await confirmSheet(`Undo ${x.points > 0 ? '+' : ''}${x.points} for ${x.name}?`, `"${x.reason}" stays in the history, marked undone.`, 'Undo'))) return;
      busy(b, async () => { await api('points_undo', { id: x.id }); toast('Undone.'); pagePoints(); }).catch(() => {});
    });
    $('fpts').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => { await api('settings_save', { key: 'points', value: { late: Number($('late').value) } }); toast('Saved.', 'ok'); }).catch(() => {}); };
  }
  function giveSheet(eligible, user) {
    let pts = null;
    sheet(`<div class="kicker">Points</div><h3>Give points</h3>
      <label class="lbl">Who</label><select class="field" id="gu">${eligible.map(r => `<option value="${esc(r.user_id)}" ${r.user_id === user ? 'selected' : ''}>${esc(r.name)}${r.title ? ` · ${esc(r.title)}` : ''}</option>`).join('')}</select>
      <label class="lbl">For</label><div class="presets">${PT_PRESETS.map(([n, why], i) => `<button type="button" class="preset ${n < 0 ? 'neg' : 'pos'}" data-i="${i}">${ptVal(n)} ${esc(why)}</button>`).join('')}</div>
      <div class="fgrid" style="margin-top:4px"><div><label class="lbl">Points</label><input class="field" id="gp" type="number" min="-50" max="50" step="1" placeholder="e.g. 2 or -1"></div>
        <div><label class="lbl">Reason</label><input class="field" id="gr" maxlength="200" placeholder="What it's for"></div></div>
      <p class="muted" style="font-size:12.5px;margin:8px 0 0">They'll see the points and the reason on their Points page.</p>
      <div class="err" id="ge"></div>
      <div class="acts"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">Give points</button></div>`,
      (el, close) => {
        el.querySelectorAll('.preset').forEach(b => b.onclick = () => { const [n, why] = PT_PRESETS[+b.dataset.i]; el.querySelector('#gp').value = n; el.querySelector('#gr').value = why;
          el.querySelectorAll('.preset').forEach(x => x.classList.toggle('on', x === b)); });
        el.querySelector('#ok').onclick = e => busy(e.target, async () => {
          const n = Math.round(Number(el.querySelector('#gp').value)), why = el.querySelector('#gr').value.trim();
          if (!n) throw new Error('Pick how many points (not 0).'); if (why.length < 2) throw new Error('Say what the points are for.');
          const r = await api('points_give', { user_id: el.querySelector('#gu').value, points: n, reason: why });
          close(); toast(`${n > 0 ? '+' : ''}${n} for ${r.name || 'them'}.`, 'ok'); if (S.page === 'points') pagePoints();
        }).catch(err => { el.querySelector('#ge').textContent = err.message; });
      });
  }

  async function pageProfile() {
    const pg = $('pg');
    pg.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    let p; try { p = await api('profile'); } catch (e) { pg.innerHTML = `<div class="empty-card">${esc(e.message)}</div>`; return; }
    if (S.page !== 'profile') return;
    const me = p.me || { name: S.me.name, email: S.me.email, role: S.me.role }, s = p.sales?.all_time || {};
    pg.innerHTML = `<div class="card profhead">${avatar(me.name, me.color, 'lg')}<div style="flex:1;min-width:200px"><h3 style="margin:0;font-size:24px">${esc(me.name)}</h3>
        <div class="muted">${esc(me.title || roleName(me.role))} · ${esc(me.email)}</div><div class="row" style="margin-top:8px">${S.me.owner ? `<span class="pill vio">${ic('crown', 12)} OWNER</span>` : `<span class="pill info">${esc(roleName(me.role).toUpperCase())}</span>`}<span class="pill dim">NEXUS ${esc(String(S.me.level).toUpperCase())}</span></div></div></div>
      <div class="stats" style="margin-top:12px">
        <div class="card stat"><div class="k">Your sales, all time</div><div class="v">${big(s.revenue)}</div><div class="s">${s.orders || 0} orders</div></div>
        <div class="card stat"><div class="k">This month</div><div class="v">${big(p.sales?.this_month)}</div><div class="s">payments on your sales</div></div>
        <div class="card stat"><div class="k">This week</div><div class="v">${hm(S.state?.week_minutes || 0)}</div><div class="s">on the clock</div></div>
        <div class="card stat"><div class="k">Next shift</div><div class="v" style="font-size:20px">${nextShift() ? `${fmtDay(nextShift().starts_at)}` : '—'}</div><div class="s">${nextShift() ? `${fmtTime(nextShift().starts_at)}–${fmtTime(nextShift().ends_at)}` : 'nothing scheduled'}</div></div></div>
      <div class="grid2">
        <form class="card" id="pf"><h3>Your details</h3>
          <div class="fgrid"><div><label class="lbl">Name in aARgon3</label><input class="field" id="dn" value="${esc(me.display_name || '')}" placeholder="${esc(me.nexus_name || me.name)}"></div>
          <div><label class="lbl">Title</label><input class="field" id="ti" value="${esc(me.title || '')}" placeholder="e.g. Sales associate"></div>
          <div><label class="lbl">Phone</label><input class="field" id="ph" type="tel" value="${esc(me.phone || '')}"></div>
          <div><label class="lbl">Usual store</label><select class="field" id="ds">${storeOptions(me.default_store || '', true)}</select></div></div>
          <label class="lbl">Colour</label><div class="swatches" id="sw">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" class="${(me.color || '') === c ? 'on' : ''}"></button>`).join('')}</div>
          <div class="acts"><button class="btn primary">Save</button></div></form>
        <div><form class="card" id="pw"><h3>${ic('key')} Change your password</h3><p class="muted" style="margin:0;font-size:13.5px">This is your Nexus account password, so it changes for Nexus '28 too.</p>
            <input class="field" id="p1" type="password" placeholder="New password (8+ characters)" autocomplete="new-password" style="margin-top:12px">
            <input class="field" id="p2" type="password" placeholder="Type it again" autocomplete="new-password" style="margin-top:8px">
            <div class="acts"><button class="btn">Change password</button></div></form>
          <div class="card" style="margin-top:12px"><div class="h-row"><h3>Time off</h3><span class="sp"></span><button class="btn small" id="ask">${ic('plus', 15)} Ask</button></div>
            <div class="people">${(p.timeoff || []).map(t => `<div class="person"><div><b>${fmtDate(t.starts_on)}${t.ends_on !== t.starts_on ? ` – ${fmtDate(t.ends_on)}` : ''}</b><small>${esc(t.reason || '')}${t.decided_by ? ` · by ${esc(t.decided_by)}` : ''}</small></div><div class="r">${statusPill(t.status)}${t.status === 'pending' ? ` <button class="btn quiet small" data-cancel="${t.id}">Cancel</button>` : ''}</div></div>`).join('') || '<p class="muted" style="margin:0">No requests.</p>'}</div></div></div></div>`;
    let color = me.color || '';
    $('sw').querySelectorAll('button').forEach(b => b.onclick = () => { color = b.dataset.c; $('sw').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); });
    $('pf').onsubmit = e => { e.preventDefault(); busy(e.submitter, async () => {
      await api('profile_save', { display_name: $('dn').value, title: $('ti').value, phone: $('ph').value, default_store: $('ds').value, color });
      await refresh(); toast('Saved.', 'ok'); pageProfile();
    }).catch(() => {}); };
    $('pw').onsubmit = e => { e.preventDefault();
      if ($('p1').value.length < 8) return toast('Use at least 8 characters.', 'bad');
      if ($('p1').value !== $('p2').value) return toast("The two passwords don't match.", 'bad');
      busy(e.submitter, async () => { const { error } = await sb.auth.updateUser({ password: $('p1').value }); if (error) throw error; $('p1').value = $('p2').value = ''; toast('Password changed.', 'ok'); }).catch(() => {}); };
    $('ask').onclick = timeOffSheet;
    pg.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => busy(b, async () => { await api('timeoff_decide', { id: Number(b.dataset.cancel), status: 'cancelled' }); pageProfile(); }).catch(() => {}));
  }

  // ================================================================ Custom orders & Enterprise quotes (managers)
  let quoteFilter = '';
  async function pageQuotes() {
    const pg = $('pg');
    if (S.sale?.quote && S.sale.state !== 'paid') return paintPayment();
    pg.innerHTML = `<div class="h-row"><div class="seg" id="qf">${[['', 'All'], ['requested', 'Requests'], ['draft', 'Drafts'], ['sent', 'Sent'], ['paid', 'Paid'], ['cancelled', 'Cancelled']].map(([v, l]) => `<button data-v="${v}" class="${quoteFilter === v ? 'on' : ''}">${l}${v === 'requested' && S.requests ? ` <span class="cnt">${S.requests}</span>` : ''}</button>`).join('')}</div><span class="sp"></span>
      <button class="btn primary small" id="newq">${ic('plus', 15)} New custom order</button><button class="btn small" id="newe">${ic('building', 15)} Enterprise quote</button></div>
      <div class="card tblcard"><table class="tbl"><thead><tr><th>Quote</th><th>Customer</th><th>What</th><th class="num">Price</th><th>Status</th><th>Made</th></tr></thead><tbody id="rows"><tr><td colspan="6" class="empty"><span class="spin"></span></td></tr></tbody></table></div>
      <p class="muted" style="font-size:13px;margin-top:10px">Custom orders let you set the price, people, models and chip yourself, then send a payment link, an emailed invoice, or make it free. Enterprise quotes are custom orders on the Enterprise plan. Requests come from the Custom tab on the website: price one (Edit), then send it.</p>`;
    $('qf').querySelectorAll('button').forEach(b => b.onclick = () => { quoteFilter = b.dataset.v; pageQuotes(); });
    $('newq').onclick = () => quoteBuilder({ plan: 'business', tier: 'pro' });
    $('newe').onclick = () => quoteBuilder({ plan: 'enterprise', tier: 'pro', seats: 100 });
    let list; try { list = await api('quotes', { status: quoteFilter || null }); } catch (e) { $('rows') && ($('rows').innerHTML = `<tr><td colspan="6" class="empty">${esc(e.message)}</td></tr>`); return; }
    if (!$('rows')) return;
    $('rows').innerHTML = list.map(q => `<tr class="click" data-no="${esc(q.quote_no)}"><td class="id">${esc(q.quote_no)}</td><td>${esc(q.customer?.company || q.customer?.name || '—')}<div class="muted" style="font-size:12.5px">${esc(q.customer?.company ? q.customer?.name : q.customer?.email || '')}</div></td>
      <td>${esc(C.plans[q.plan]?.name || q.plan)} · ${esc(tierName(q.tier))}<div class="muted" style="font-size:12px">${q.seats ? `${q.seats} people · ` : ''}${(q.items || []).length} models</div></td>
      <td class="num">${q.status === 'requested' ? `<span class="muted">${q.request?.budget ? `budget ${money(q.request.budget)}` : 'to price'}</span>` : q.interval === 'free' ? '<span class="pill vio">FREE</span>' : `${money(q.amount)}<span class="muted">${q.interval === 'year' ? '/yr' : q.interval === 'once' ? ' once' : '/mo'}</span>`}</td>
      <td>${statusPill(q.status)}${q.delivery ? `<div class="muted" style="font-size:11.5px">${q.delivery === 'invoice' ? 'invoice' : q.delivery === 'link' ? 'payment link' : ''}</div>` : ''}</td><td class="muted">${fmtWhen(q.created_at)}<div style="font-size:11.5px">${esc(q.created_by || '')}</div></td></tr>`).join('')
      || `<tr><td colspan="6" class="empty">No ${quoteFilter || ''} custom orders yet.</td></tr>`;
    $('rows').querySelectorAll('tr.click').forEach(r => r.onclick = () => quoteView(list.find(q => q.quote_no === r.dataset.no)));
  }
  function quoteBuilder(q) {
    const pg = $('pg');
    const st = { plan: q.plan || 'business', tier: q.tier || 'pro', seats: q.seats || null, interval: q.interval || 'month', amount: q.status === 'requested' ? null : q.amount ?? null, os: q.config?.os || C.os[0].id,
      connection: q.config?.connection || C.connections[0].id, chip: q.config?.chip || null, models: q.items ? q.items.map(i => i.model) : null, customer: q.customer || {}, notes: q.notes || '',
      valid_until: q.valid_until || ymd(new Date(Date.now() + 30 * 864e5)) };
    const suggest = () => st.plan === 'enterprise' ? A3.enterpriseSuggest(st.tier, st.seats, st.interval === 'year' ? 'year' : 'month') : st.interval === 'once' ? price(st.plan, st.tier, 'year').amount : price(st.plan, st.tier, st.interval === 'year' ? 'year' : 'month').amount ?? 0;
    function draw() {
      const defSeats = price(st.plan, st.tier, 'month').seats, defModels = A3.items(st.tier).map(i => i.model);
      const models = st.models || defModels, chip = st.chip || C.tiers[st.tier].chip;
      pg.innerHTML = `<div class="h-row"><button class="btn quiet small" id="back">${ic('left', 15)} Custom orders</button><h3>${q.status === 'requested' ? `Price ${esc(q.quote_no)}` : q.quote_no ? `Edit ${esc(q.quote_no)}` : st.plan === 'enterprise' ? 'New Enterprise quote' : 'New custom order'}</h3></div>
        <div class="builder"><div class="card">
          <div class="row" style="justify-content:space-between"><div class="seg" id="pl">${PLANS.map(p => `<button data-v="${p}" class="${p === st.plan ? 'on' : ''}">${esc(C.plans[p].name)}</button>`).join('')}</div>
            <div class="seg" id="iv">${[['month', 'Monthly'], ['year', 'Yearly'], ['once', 'One time'], ['free', 'Free']].map(([v, l]) => `<button data-v="${v}" class="${st.interval === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
          <label class="lbl">Tier</label><div class="seg" id="tr">${TIERS.map(t => `<button data-v="${t}" class="${t === st.tier ? 'on' : ''}">${esc(C.tiers[t].name)}</button>`).join('')}</div>
          <div class="grid3"><div><label class="lbl">People</label><input class="field" id="seats" type="number" min="1" value="${st.seats ?? defSeats ?? ''}" placeholder="${defSeats ?? 'No limit'}"></div>
            <div><label class="lbl">Price ${st.interval === 'free' ? '' : `(${st.interval === 'year' ? 'a year' : st.interval === 'once' ? 'one time' : 'a month'})`}</label><div class="money-in"><input class="field" id="amt" type="number" min="0.5" step="0.01" value="${st.interval === 'free' ? '' : st.amount ?? ''}" ${st.interval === 'free' ? 'disabled placeholder="Free"' : `placeholder="${suggest()}"`}></div></div>
            <div><label class="lbl">&nbsp;</label><button class="btn block" id="sug" ${st.interval === 'free' ? 'disabled' : ''}>Use ${money(suggest())}</button></div></div>
          <div class="grid3"><div><label class="lbl">Quouk chip</label><select class="field" id="chip">${C.chips.filter(c => c.id !== 'No order').map(c => `<option ${c.id === chip ? 'selected' : ''}>${esc(c.id)}</option>`).join('')}</select></div>
            <div><label class="lbl">LentOS</label><select class="field" id="os">${C.os.map(o => `<option ${o.id === st.os ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select></div>
            <div><label class="lbl">Connection</label><select class="field" id="conn">${C.connections.map(o => `<option ${o.id === st.connection ? 'selected' : ''}>${esc(o.id)}</option>`).join('')}</select></div></div>
          <label class="lbl">Models on the order <a href="#" id="resetM" style="text-transform:none;letter-spacing:0;font-weight:400">(reset to ${esc(C.tiers[st.tier].name)}'s)</a></label>
          <div class="models" id="mods">${Object.keys(C.families).filter(f => !C.families[f].free).map(f => `<div class="fam"><b>${esc(C.families[f].name)}</b><div class="chk">${C.families[f].models.map(m => `<label><input type="checkbox" value="${esc(m)}" ${models.includes(m) ? 'checked' : ''}>${esc(m)}</label>`).join('')}</div></div>`).join('')}</div>
          <div class="sect-title">${st.plan === 'enterprise' ? 'Corporate entity and lead operator' : st.plan === 'business' ? 'Business and the person placing the order' : 'Customer'}</div>
          <div id="cust">${window.A3forms.html(st.plan, st.customer)}</div>
          <div class="grid2"><div><label class="lbl">Good until</label><input class="field" id="vu" type="date" value="${st.valid_until}"></div><div></div></div>
          <label class="lbl">Notes (on the order, staff only)</label><textarea class="field" id="nt" rows="2">${esc(st.notes)}</textarea>
        </div>
        <div class="card summary" id="qsum"></div></div>`;
      const keep = () => { st.customer = window.A3forms.values($('cust')); st.notes = $('nt').value; st.valid_until = $('vu').value; const v = $('amt').value; st.amount = v === '' ? null : Number(v); st.seats = $('seats').value ? Number($('seats').value) : null; };
      const seg = (id, key, reset) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => { keep(); st[key] = b.dataset.v; if (reset) reset(); draw(); });
      seg('pl', 'plan', () => { st.seats = null; }); seg('iv', 'interval'); seg('tr', 'tier', () => { st.models = null; st.chip = null; });
      $('chip').onchange = e => { st.chip = e.target.value; sum(); }; $('os').onchange = e => { st.os = e.target.value; }; $('conn').onchange = e => { st.connection = e.target.value; };
      $('mods').onchange = () => { st.models = [...$('mods').querySelectorAll('input:checked')].map(i => i.value); sum(); };
      $('resetM').onclick = e => { e.preventDefault(); keep(); st.models = null; draw(); };
      $('sug').onclick = () => { $('amt').value = suggest(); keep(); sum(); };
      ['seats', 'amt'].forEach(id => $(id).oninput = () => { keep(); sum(); });
      $('back').onclick = () => go('quotes');
      window.A3forms.wire($('cust'), { os: () => st.os, region: () => storeRegion(myStore()) });
      sum();
    }
    function sum() {
      const models = st.models || A3.items(st.tier).map(i => i.model), chip = st.chip || C.tiers[st.tier].chip, seats = st.seats ?? price(st.plan, st.tier, 'month').seats;
      const amt = st.interval === 'free' ? 0 : Number($('amt').value) || 0, list = price(st.plan, st.tier, st.interval === 'year' ? 'year' : 'month');
      $('qsum').innerHTML = `<h3>${esc(C.plans[st.plan].name)} · ${esc(C.tiers[st.tier].name)}</h3>
        <div class="line"><span>People</span><span>${seats ?? 'No limit'}</span></div><div class="line"><span>Chip</span><span>${esc(chip)}</span></div>
        <div class="line"><span>Models</span><span>${models.length}</span></div><div class="line"><span>Billing</span><span>${{ month: 'Monthly', year: 'Yearly', once: 'One time', free: 'Free' }[st.interval]}</span></div>
        ${!list.quote && st.interval !== 'free' && st.interval !== 'once' && amt ? `<div class="line"><span>Store price</span><span>${money(list.amount)}</span></div>` : ''}
        <div class="total"><span class="muted">Price</span><b>${st.interval === 'free' ? 'Free' : money(amt)}${st.interval === 'month' || st.interval === 'year' ? `<span class="muted" style="font-size:14px;font-weight:500">/${st.interval === 'year' ? 'yr' : 'mo'}</span>` : ''}</b></div>
        <button class="btn primary block" id="save">${q.quote_no ? 'Save changes' : 'Save and continue'}</button>
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">Next you'll choose how to send it: a payment link (QR), an emailed Stripe invoice${st.interval === 'free' ? ', or create it free right away' : ''}.</p>`;
      $('save').onclick = e => {
        let customer; try { customer = window.A3forms.read($('cust'), st.plan); } catch (err) { return toast(err.message, 'bad'); }
        if (!(st.models || A3.items(st.tier)).length) return toast('Pick at least one model.', 'bad');
        busy(e.target, async () => {
          const r = await api('quote_save', { quote_no: q.quote_no, plan: st.plan, tier: st.tier, seats: $('seats').value || null, interval: st.interval, amount: st.interval === 'free' ? 0 : Number($('amt').value),
            models: st.models || A3.items(st.tier).map(i => i.model), chip: $('chip').value, os: $('os').value, connection: $('conn').value, customer, notes: $('nt').value, valid_until: $('vu').value });
          toast(`${r.quote_no} saved.`, 'ok'); quoteView(r);
        }).catch(() => {});
      };
    }
    draw();
  }
  function quoteView(q) {
    const c = q.customer || {}, pg = $('pg');
    pg.innerHTML = `<div class="h-row"><button class="btn quiet small" id="back">${ic('left', 15)} Custom orders</button><h3 class="mono">${esc(q.quote_no)}</h3>${statusPill(q.status)}<span class="sp"></span>
      ${q.status === 'draft' || q.status === 'requested' ? `<button class="btn small ${q.status === 'requested' ? 'primary' : ''}" id="edit">${ic('edit', 15)} ${q.status === 'requested' ? 'Price it' : 'Edit'}</button>` : ''}${q.status !== 'paid' && q.status !== 'cancelled' ? `<button class="btn small danger" id="cq">Cancel quote</button>` : ''}</div>
      <div class="grid2"><div class="card"><h3>${esc(C.plans[q.plan]?.name)} · ${esc(tierName(q.tier))}</h3><div class="kv">
        <span>Price</span><span>${q.status === 'requested' ? '<span class="pill info">NOT PRICED YET</span>' : `<b>${q.interval === 'free' ? 'Free' : money(q.amount)}</b>${q.interval === 'year' ? ' a year' : q.interval === 'month' ? ' a month' : q.interval === 'once' ? ' one time' : ''}`}</span>
        <span>People</span><span>${q.seats ?? 'No limit'}</span><span>System</span><span>${esc([q.config?.os, q.config?.chip, q.config?.connection].filter(Boolean).join(' · '))}</span>
        <span>Good until</span><span>${q.valid_until ? fmtDate(q.valid_until) : '—'}</span><span>Made by</span><span>${esc(q.created_by || '—')} · ${fmtWhen(q.created_at)}</span>
        ${q.order_id ? `<span>Order</span><span class="mono">${esc(q.order_id)}</span>` : ''}${q.notes ? `<span>Notes</span><span>${esc(q.notes)}</span>` : ''}</div>
        <label class="lbl">Models</label><div class="chips">${(q.items || []).map(i => `<span>${esc(i.model)}</span>`).join('')}</div></div>
      <div class="card"><h3>${esc(c.company || c.name || 'Customer')}</h3><div class="kv">${c.company ? `<span>Contact</span><span>${esc(c.name)}${c.title ? ` · ${esc(c.title)}` : ''}</span>` : ''}
        <span>Email</span><span>${esc(c.email || '—')}</span>${c.phone ? `<span>Phone</span><span>${esc(c.phone)}</span>` : ''}${c.billing_email ? `<span>Billing email</span><span>${esc(c.billing_email)}</span>` : ''}
        ${c.node ? `<span>Node</span><span class="mono">${esc(c.node)}</span>` : ''}${c.jurisdiction ? `<span>Jurisdiction</span><span>${esc(c.jurisdiction)}</span>` : ''}</div></div></div>
      ${q.request ? `<div class="card req" style="margin-top:12px"><h3>${ic('sparkles')} What they asked for <small>from the website · ${fmtWhen(q.request.at || q.created_at)}</small></h3><div class="kv">
        <span>Budget</span><span>${q.request.budget ? `${money(q.request.budget)} ${q.request.interval === 'year' ? 'a year' : q.request.interval === 'once' ? 'one time' : 'a month'}` : 'Not given'}</span>
        <span>Billing</span><span>${q.request.interval === 'year' ? 'Yearly' : q.request.interval === 'once' ? 'One payment' : 'Monthly'}</span>
        <span>People</span><span>${esc(q.request.seats ?? q.seats ?? '—')}</span>${q.request.notes ? `<span>Their notes</span><span style="white-space:pre-wrap">${esc(q.request.notes)}</span>` : ''}</div></div>` : ''}
      <div class="card" style="margin-top:12px" id="sendBox"></div>`;
    $('back').onclick = () => go('quotes');
    $('edit') && ($('edit').onclick = () => quoteBuilder(q));
    $('cq') && ($('cq').onclick = async () => {
      if (!(await confirmSheet('Cancel this quote?', q.stripe_invoice_id || q.delivery === 'invoice' ? 'Its Stripe invoice is voided, so it can no longer be paid.' : 'Its payment link stops being tracked here.', 'Cancel quote', true))) return;
      const r = await api('quote_cancel', { quote_no: q.quote_no }).catch(e => { toast(e.message, 'bad'); return null; }); if (r) { toast('Quote cancelled.'); quoteView(r); }
    });
    const box = $('sendBox');
    if (q.status === 'paid') { box.innerHTML = `<h3 style="color:var(--mint)">✓ Paid</h3><p class="muted" style="margin:0">Order <span class="mono">${esc(q.order_id || '')}</span>. Find it in Orders.</p>`; return; }
    if (q.status === 'cancelled') { box.innerHTML = '<h3>Cancelled</h3><p class="muted" style="margin:0">Make a new custom order if they still want it.</p>'; return; }
    if (q.status === 'requested') { box.innerHTML = `<h3>Price it, then send it</h3><p class="muted" style="margin:0 0 12px">Nothing has been charged. Set the price (and change anything else), save, and you can send a payment link or an invoice to ${esc(c.email || 'them')}. Not doing it? Cancel the quote.</p><button class="btn primary" id="price">${ic('edit', 15)} Price it</button>`;
      $('price').onclick = () => quoteBuilder(q); return; }
    box.innerHTML = q.interval === 'free' ? `<h3>Create it</h3><p class="muted">This custom order is free: it becomes a working order right away (logged under your name).</p><button class="btn primary" id="sf">${ic('gift', 15)} Create free order</button>`
      : `<h3>${q.status === 'sent' ? 'Sent' : 'Send it'}</h3>${q.status === 'sent' && q.url ? `<p class="muted" style="margin:0 0 10px">${q.delivery === 'invoice' ? 'Stripe emailed an invoice. It turns into an order when it\'s paid.' : 'A payment link was made.'} <a href="${esc(q.url)}" target="_blank" rel="noopener">${q.delivery === 'invoice' ? 'Open the invoice' : 'Open the link'} ${ic('external', 13)}</a></p>` : ''}
        <div class="grid2"><div class="card" style="background:var(--panel2)"><b>${ic('qr')} Payment link</b><p class="muted" style="font-size:13.5px">A Stripe checkout with a QR code. Good when they're with you, or to text them.</p><button class="btn primary" id="sl">Make payment link</button></div>
        <div class="card" style="background:var(--panel2)"><b>${ic('mail')} Email an invoice</b><p class="muted" style="font-size:13.5px">Stripe emails ${esc(c.billing_email || c.email || 'them')} an invoice${q.interval === 'once' ? '' : ' every ' + (q.interval === 'year' ? 'year' : 'month')}.</p>
          <div class="row"><select class="field" id="due" style="width:auto"><option value="7">Due in 7 days</option><option value="15">Due in 15 days</option><option value="30" selected>Due in 30 days</option><option value="60">Due in 60 days</option></select><button class="btn" id="si">Send invoice</button></div></div></div>`;
    $('sf') && ($('sf').onclick = e => busy(e.target, async () => { const r = await api('quote_send', { quote_no: q.quote_no }); toast(`Order ${r.order_id} created.`, 'ok'); quoteView({ ...q, status: 'paid', order_id: r.order_id }); }).catch(() => {}));
    $('sl') && ($('sl').onclick = e => busy(e.target, async () => {
      const r = await api('quote_send', { quote_no: q.quote_no, delivery: 'link' });
      S.sale = { ...r, quote: q.quote_no, amount: q.amount, interval: q.interval, sel: { plan: q.plan, tier: q.tier }, customer: c, state: 'waiting', started: Date.now() };
      paintPayment(); pollSale();
    }).catch(() => {}));
    $('si') && ($('si').onclick = e => busy(e.target, async () => {
      const r = await api('quote_send', { quote_no: q.quote_no, delivery: 'invoice', days_until_due: Number($('due').value) });
      toast(`Invoice sent to ${r.email}.`, 'ok'); quoteView({ ...q, status: 'sent', delivery: 'invoice', url: r.url });
    }).catch(() => {}));
  }

  // ================================================================ Promotions (managers)
  async function pagePromos() {
    const pg = $('pg');
    pg.innerHTML = `<div class="h-row"><p class="muted" style="margin:0">Codes customers type in the store, or you apply in New sale. Each one is also a Stripe coupon.</p><span class="sp"></span><button class="btn primary small" id="np">${ic('plus', 15)} New code</button></div>
      <div class="card tblcard"><table class="tbl"><thead><tr><th>Code</th><th>Discount</th><th>Works on</th><th class="num">Used</th><th>Ends</th><th>Status</th><th></th></tr></thead><tbody id="rows"><tr><td colspan="7" class="empty"><span class="spin"></span></td></tr></tbody></table></div>`;
    $('np').onclick = promoSheet;
    let list; try { list = await api('promos'); } catch (e) { $('rows') && ($('rows').innerHTML = `<tr><td colspan="7" class="empty">${esc(e.message)}</td></tr>`); return; }
    if (!$('rows')) return;
    $('rows').innerHTML = list.map(x => `<tr><td class="id">${esc(x.code)}<div class="muted" style="font-size:11.5px;font-family:var(--sans)">${esc(x.created_by || '')}</div></td><td>${esc(x.description || '')}</td>
      <td class="muted">${esc([(x.plans || []).map(p => C.plans[p]?.name || p).join(', ') || 'All plans', (x.tiers || []).map(tierName).join(', ') || 'all tiers'].join(' · '))}${Number(x.min_total) ? ` · over ${money(x.min_total)}` : ''}</td>
      <td class="num">${x.used}${x.limit ? ` / ${x.limit}` : ''}</td><td class="muted">${x.ends ? fmtDate(x.ends) : 'Never'}</td><td>${x.live ? '<span class="pill ok">LIVE</span>' : x.active ? '<span class="pill warn">ENDED</span>' : '<span class="pill dim">OFF</span>'}</td>
      <td class="num"><label class="switch" title="On / off"><input type="checkbox" data-id="${x.id}" ${x.active ? 'checked' : ''}></label></td></tr>`).join('') || '<tr><td colspan="7" class="empty">No codes yet.</td></tr>';
    $('rows').querySelectorAll('input[data-id]').forEach(i => i.onchange = () => busy(null, async () => { await api('promo_save', { id: Number(i.dataset.id), active: i.checked }); toast(i.checked ? 'Code on.' : 'Code off.'); pagePromos(); }).catch(() => { i.checked = !i.checked; }));
  }
  function promoSheet() {
    const rand = () => 'APOJI' + Math.random().toString(36).slice(2, 6).toUpperCase();
    sheet(`<div class="kicker">Promotions</div><h3>New promo code</h3>
      <div class="grid2"><div><label class="lbl">Code</label><div class="fgen"><input class="field" id="code" style="text-transform:uppercase" maxlength="30" placeholder="SUMMER25"><button class="btn small" id="gen">Make one</button></div></div>
        <div><label class="lbl">Discount</label><div class="row"><input class="field" id="val" type="number" min="1" style="flex:1" value="20"><select class="field" id="type" style="width:auto"><option value="percentage">% off</option><option value="fixed">$ off</option></select></div></div></div>
      <div class="grid2"><div><label class="lbl">For how long</label><select class="field" id="dur"><option value="once">First payment only</option><option value="repeating">A number of months</option><option value="forever">Every payment</option></select></div>
        <div id="monthsBox" hidden><label class="lbl">Months</label><input class="field" id="months" type="number" min="1" max="36" value="3"></div></div>
      <label class="lbl">Plans (none ticked = all)</label><div class="chk" id="pls">${PLANS.filter(p => !C.plans[p].quote).map(p => `<label><input type="checkbox" value="${p}">${esc(C.plans[p].name)}</label>`).join('')}</div>
      <label class="lbl">Tiers (none ticked = all)</label><div class="chk" id="trs">${TIERS.map(t => `<label><input type="checkbox" value="${t}">${esc(C.tiers[t].name)}</label>`).join('')}</div>
      <div class="grid3"><div><label class="lbl">Use limit</label><input class="field" id="lim" type="number" min="1" placeholder="No limit"></div><div><label class="lbl">Ends</label><input class="field" id="ends" type="date" min="${ymd(new Date())}"></div><div><label class="lbl">Order over</label><div class="money-in"><input class="field" id="min" type="number" min="0" placeholder="0"></div></div></div>
      <div class="acts"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">${ic('promos', 15)} Create code</button></div>`,
      (el, close) => {
        const q = s => el.querySelector(s);
        q('#gen').onclick = () => q('#code').value = rand();
        q('#dur').onchange = () => q('#monthsBox').hidden = q('#dur').value !== 'repeating';
        q('#ok').onclick = e => busy(e.target, async () => {
          const r = await api('promo_save', { code: q('#code').value, type: q('#type').value, value: Number(q('#val').value), duration: q('#dur').value, duration_months: Number(q('#months').value),
            plans: [...q('#pls').querySelectorAll('input:checked')].map(i => i.value), tiers: [...q('#trs').querySelectorAll('input:checked')].map(i => i.value),
            limit: q('#lim').value || null, ends: q('#ends').value ? new Date(q('#ends').value + 'T23:59').toISOString() : null, min_total: Number(q('#min').value) || 0 });
          close(); toast(`${r.code} is live: ${r.description}.`, 'ok'); pagePromos();
        }).catch(() => {});
      });
  }

  // ================================================================ Team (managers)
  async function pageTeam() {
    const pg = $('pg');
    pg.innerHTML = `<div class="h-row"><p class="muted" style="margin:0">Nexus admins are added the first time they sign in. Add anyone else by the email they use for Nexus.</p><span class="sp"></span><button class="btn primary small" id="add">${ic('plus', 15)} Add person</button></div>
      <div class="card tblcard"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th>Now</th><th>Usual store</th><th class="num">This week</th><th class="num">Sales this month</th><th class="num">Points</th>${can('owner') ? '<th class="num">Pay</th>' : ''}<th></th></tr></thead><tbody id="rows"><tr><td colspan="9" class="empty"><span class="spin"></span></td></tr></tbody></table></div>`;
    $('add').onclick = () => personSheet(null);
    let list, pts = {};
    try { [list, pts] = await Promise.all([api('team'), api('points').then(r => Object.fromEntries((r.board || []).map(x => [x.user_id, x]))).catch(() => ({}))]); }
    catch (e) { $('rows') && ($('rows').innerHTML = `<tr><td colspan="9" class="empty">${esc(e.message)}</td></tr>`); return; }
    if (!$('rows')) return;
    S.team = list;
    $('rows').innerHTML = list.map((s, i) => `<tr class="click" data-i="${i}" style="${s.active ? '' : 'opacity:.5'}"><td><div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(s.name, s.color)}<div><b>${esc(s.name)}</b><div class="muted" style="font-size:12.5px">${esc(s.title ? `${s.title} · ` : '')}${esc(s.email)}</div></div></div></td>
      <td>${s.role === 'owner' ? `<span class="pill vio">${ic('crown', 11)} OWNER</span>` : s.role === 'manager' ? '<span class="pill info">MANAGER</span>' : '<span class="pill dim">EMPLOYEE</span>'}</td>
      <td>${!s.active ? '<span class="pill bad">OFF</span>' : !s.signed_in ? '<span class="pill warn">INVITED</span>' : s.on_clock ? `<span class="pill ok">${s.on_clock.on_break ? 'BREAK' : 'ON'} · #${esc(s.on_clock.store_code)}</span>` : `<span class="muted" style="font-size:12.5px">${s.last_seen ? 'seen ' + fmtWhen(s.last_seen) : '—'}</span>`}</td>
      <td class="muted">${s.default_store ? '#' + esc(s.default_store) : '—'}</td><td class="num">${hm(s.week_minutes || 0)}</td><td class="num">${money(Number(s.month_sales) || 0)}</td><td class="num">${pts[s.user_id] ? `<b class="${pts[s.user_id].total < 0 ? 'neg' : ''}">${pts[s.user_id].total}</b>` : '<span class="muted">—</span>'}</td>${can('owner') ? `<td class="num">${s.pay_rate != null ? money(Number(s.pay_rate)) + '/h' : '—'}</td>` : ''}
      <td class="num">${ic('edit', 15)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nobody yet.</td></tr>';
    $('rows').querySelectorAll('tr.click').forEach(r => r.onclick = () => personSheet(list[+r.dataset.i]));
  }
  function personSheet(p) {
    const owner = can('owner'), isOwner = p?.role === 'owner', self = p?.user_id === S.me.id;
    const lockRole = !owner || isOwner || self, canEdit = !p || owner || p.role === 'employee';
    sheet(`<div class="kicker">${p ? 'Team' : 'Add someone'}</div><h3>${p ? esc(p.name) : 'Add a person'}</h3>
      ${p ? `<p class="muted" style="margin:2px 0 0">${esc(p.email)}${p.signed_in ? '' : ' · hasn\'t signed in yet'}</p>` : '<p class="muted">They sign in to aARgon3 with the Nexus account for this email. If they don\'t have one, they can make one in Nexus \'28 for free.</p>'}
      ${!canEdit ? '<div class="banner" style="margin-top:12px">Only the owner can change managers.</div>' : ''}
      <div class="fgrid">${p ? '' : '<div class="wide"><label class="lbl">Email</label><input class="field" id="em" type="email" placeholder="name@example.com"></div>'}
        <div><label class="lbl">Name in aARgon3</label><input class="field" id="dn" value="${esc(p?.display_name || '')}" placeholder="${esc(p?.nexus_name || '')}"></div>
        <div><label class="lbl">Title</label><input class="field" id="ti" value="${esc(p?.title || '')}" placeholder="e.g. Sales associate"></div>
        <div><label class="lbl">Role</label><select class="field" id="ro" ${lockRole && p ? 'disabled' : ''}>${isOwner ? '<option>Owner</option>' : `<option value="employee" ${p?.role !== 'manager' ? 'selected' : ''}>Employee</option>${owner ? `<option value="manager" ${p?.role === 'manager' ? 'selected' : ''}>Manager</option>` : ''}`}</select></div>
        <div><label class="lbl">Usual store</label><select class="field" id="ds">${storeOptions(p?.default_store || '', true)}</select></div>
        <div><label class="lbl">Phone</label><input class="field" id="ph" type="tel" value="${esc(p?.phone || '')}"></div>
        ${owner ? `<div><label class="lbl">Pay rate (owner only)</label><div class="money-in"><input class="field" id="pay" type="number" min="0" step="0.25" value="${p?.pay_rate ?? ''}" placeholder="per hour"></div></div>` : '<div></div>'}
        <div class="wide"><label class="lbl">Notes (managers only)</label><input class="field" id="nt" value="${esc(p?.notes || '')}"></div></div>
      ${p && !isOwner && !self ? `<label class="switch" style="margin-top:16px"><input type="checkbox" id="ac" ${p.active ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> Can use aARgon3</label>` : ''}
      <div class="acts">${p?.user_id ? `<button class="btn quiet" id="ts">${ic('time', 15)} Timesheet</button><span style="flex:1"></span>` : ''}<button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok" ${canEdit ? '' : 'disabled'}>${p ? 'Save' : 'Add'}</button></div>`,
      (el, close) => {
        const q = s => el.querySelector(s);
        q('#ts') && (q('#ts').onclick = () => { close(); tsv.everyone = true; go('time'); });
        q('#ok').onclick = e => busy(e.target, async () => {
          const body = { display_name: q('#dn').value, title: q('#ti').value, default_store: q('#ds').value, phone: q('#ph').value, notes: q('#nt').value };
          if (p) body.id = p.id; else body.email = q('#em').value;
          if (!q('#ro').disabled && !isOwner && (owner || !p)) { if (owner) body.role = q('#ro').value; }
          if (owner && q('#pay')) body.pay_rate = q('#pay').value;
          if (q('#ac') && !q('#ac').disabled && q('#ac').checked !== p.active) body.active = q('#ac').checked;
          const r = await api('team_save', body);
          close(); toast(p ? 'Saved.' : `${r.email} added. They can sign in now.`, 'ok'); if (self) await refresh(); pageTeam();
        }).catch(() => {});
      });
  }

  // ================================================================ Activity (managers)
  async function pageActivity() {
    $('pg').innerHTML = '<div class="card tblcard"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody id="rows"><tr><td colspan="4" class="empty"><span class="spin"></span></td></tr></tbody></table></div>';
    const label = { sale_link: 'Made a payment link', comp: 'Gave a free order', cancel: 'Cancelled an order', refund: 'Refunded an order', edit_shift: 'Fixed a shift', quote: 'Made a custom order',
      quote_sent: 'Sent a custom order', quote_cancel: 'Cancelled a custom order', promo: 'Made a promo code', promo_edit: 'Changed a promo code', team_add: 'Added a person', team_edit: 'Changed a person',
      schedule: 'Scheduled a shift', schedule_delete: 'Removed a shift', schedule_copy: 'Copied a week', time_off: 'Answered time off', settings: 'Changed settings', store: 'Changed a store' };
    try {
      const list = await api('log');
      $('rows').innerHTML = list.map(l => `<tr><td class="muted">${fmtWhen(l.at)}</td><td>${esc(l.name)}</td><td>${esc(label[l.action] || l.action)}</td><td class="muted mono" style="font-size:12.5px">${esc(Object.entries(l.details || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · '))}</td></tr>`).join('')
        || '<tr><td colspan="4" class="empty">Nothing yet.</td></tr>';
    } catch (e) { $('rows').innerHTML = `<tr><td colspan="4" class="empty">${esc(e.message)}</td></tr>`; }
  }

  // ================================================================ Settings (owner)
  async function pageSettings() {
    const pg = $('pg');
    pg.innerHTML = '<div class="empty"><span class="spin"></span></div>';
    let d; try { d = await api('settings'); } catch (e) { pg.innerHTML = `<div class="empty-card">${esc(e.message)}</div>`; return; }
    const s = d.settings || {}, st = s.store || {}, biz = s.business || {}, goals = s.goals || {};
    pg.innerHTML = `<div class="grid2">
      <form class="card" id="fs"><h3>${ic('store')} Online store</h3><label class="switch"><input type="checkbox" id="open" ${st.open !== false ? 'checked' : ''}> Taking orders</label>
        <label class="lbl">Message when closed</label><input class="field" id="msg" value="${esc(st.message || '')}" placeholder="e.g. Back Monday! Staff sales still work.">
        <p class="muted" style="font-size:13px">Closing the store stops new checkouts on the website. Staff sales in the terminal keep working.</p><div class="acts"><button class="btn primary">Save</button></div></form>
      <form class="card" id="fg"><h3>${ic('target')} Monthly sales goal</h3><div class="money-in"><input class="field" id="goal" type="number" min="0" value="${goals.monthly_revenue || ''}" placeholder="0 = no goal"></div>
        <p class="muted" style="font-size:13px">Shown as a progress bar on Sales.</p><div class="acts"><button class="btn primary">Save</button></div></form></div>
      <form class="card" id="fb" style="margin-top:12px"><h3>${ic('building')} Business details</h3><div class="fgrid">
        <div><label class="lbl">Business name</label><input class="field" id="bn" value="${esc(biz.name || '')}"></div><div><label class="lbl">Support email</label><input class="field" id="be" type="email" value="${esc(biz.support_email || '')}"></div>
        <div><label class="lbl">Address</label><input class="field" id="ba" value="${esc(biz.address || '')}"></div><div><label class="lbl">Phone</label><input class="field" id="bp" value="${esc(biz.phone || '')}"></div></div>
        <div class="acts"><button class="btn primary">Save</button></div></form>
      <div class="card" style="margin-top:12px"><div class="h-row"><h3>${ic('store')} Stores</h3><span class="sp"></span><button class="btn small" id="addStore">${ic('plus', 15)} Add store</button></div>
        <table class="tbl"><thead><tr><th>Store</th><th>Region</th><th>Status</th><th></th></tr></thead><tbody>${(d.stores || []).map((x, i) => `<tr><td><b class="mono">#${esc(x.code)}</b> ${esc(x.name)}</td><td class="muted">${esc(x.region)} · ${esc(C.regions[x.region] || '')}</td><td>${x.active ? '<span class="pill ok">OPEN</span>' : '<span class="pill dim">CLOSED</span>'}</td><td class="num"><button class="btn quiet small" data-i="${i}">${ic('edit', 15)}</button></td></tr>`).join('')}</tbody></table></div>`;
    const ro = !can('owner');
    if (ro) pg.querySelectorAll('input, button.btn.primary, #addStore, [data-i]').forEach(x => x.disabled = true);
    const save = (key, value) => api('settings_save', { key, value }).then(() => { toast('Saved.', 'ok'); return refresh(); });
    $('fs').onsubmit = e => { e.preventDefault(); busy(e.submitter, () => save('store', { open: $('open').checked, message: $('msg').value })).catch(() => {}); };
    $('fg').onsubmit = e => { e.preventDefault(); busy(e.submitter, () => save('goals', { monthly_revenue: Number($('goal').value) || 0 })).catch(() => {}); };
    $('fb').onsubmit = e => { e.preventDefault(); busy(e.submitter, () => save('business', { name: $('bn').value, support_email: $('be').value, address: $('ba').value, phone: $('bp').value })).catch(() => {}); };
    const storeSheet = x => sheet(`<div class="kicker">Stores</div><h3>${x ? `#${esc(x.code)}` : 'Add a store'}</h3>
      <div class="fgrid"><div><label class="lbl">Store number</label><input class="field" id="sc" maxlength="4" value="${esc(x?.code || '')}" ${x ? 'disabled' : ''} placeholder="4 digits"></div>
      <div><label class="lbl">Region</label><select class="field" id="sr">${Object.keys(C.regions).map(r => `<option value="${r}" ${x?.region === r ? 'selected' : ''}>${r} · ${esc(C.regions[r])}</option>`).join('')}</select></div>
      <div class="wide"><label class="lbl">Name</label><input class="field" id="sn" value="${esc(x?.name || '')}"></div></div>
      ${x ? `<label class="switch" style="margin-top:14px"><input type="checkbox" id="sa" ${x.active ? 'checked' : ''}> Open (staff can clock in here)</label>` : ''}
      <div class="acts"><button class="btn quiet" data-close>Cancel</button><button class="btn primary" id="ok">Save</button></div>`,
      (el, close) => el.querySelector('#ok').onclick = e => busy(e.target, async () => {
        await api('store_save', { code: el.querySelector('#sc').value, name: el.querySelector('#sn').value, region: el.querySelector('#sr').value, active: x ? el.querySelector('#sa').checked : true });
        close(); toast('Store saved.', 'ok'); await refresh(); pageSettings();
      }).catch(() => {}));
    $('addStore').onclick = () => storeSheet(null);
    pg.querySelectorAll('[data-i]').forEach(b => b.onclick = () => storeSheet(d.stores[+b.dataset.i]));
  }

  // ================================================================ start
  async function start() {
    $('app').innerHTML = '<div class="login"><div class="muted"><span class="spin"></span> Loading…</div></div>';
    const { data } = await sb.auth.getSession();
    if (!data.session) return signIn();
    try { await refresh(); }
    catch (e) {
      if (!$('app').querySelector('.login .spin')) return;   // already on the sign-in screen
      $('app').innerHTML = `<div class="login"><div class="card"><h1>Can't load</h1><p>${esc(e.message)}</p><button class="btn primary" id="again">Try again</button><button class="btn quiet" id="so2">Sign out</button></div></div>`;
      $('again').onclick = start; $('so2').onclick = async () => { await sb.auth.signOut(); signIn(); };
      return;
    }
    shell(); go(location.hash.slice(1) || 'today');
  }
  document.addEventListener('keydown', e => {
    if (!(e.metaKey || e.ctrlKey) || !S.me || document.querySelector('.scrim') || e.altKey || e.shiftKey) return;
    const list = visible(), n = +e.key;
    if (n >= 1 && n <= Math.min(9, list.length)) { e.preventDefault(); go(list[n - 1].id); }
  });
  setInterval(() => { if (S.me && document.visibilityState === 'visible' && !document.querySelector('.scrim')) refresh().then(() => { if (S.page === 'today') go('today'); }).catch(() => {}); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me) quiet(refresh()); });
  desk?.onUpdate?.(u => {
    if (u.ready) return updateBar(u.ready);                                              // Windows: downloaded, restart to finish
    if (u.downloading) return toast(`Downloading aARgon3 ${u.downloading} in the background…`);
    if (u.latest) return toast(`aARgon3 ${u.latest} is out. Click here to download it.`, 'ok', () => desk.openReleases());   // Mac
    if (u.current) toast(`You're on the latest version (${u.current}).`);
  });
  function updateBar(v) {
    if (document.querySelector('.updbar')) return;
    const b = document.createElement('div'); b.className = 'updbar';
    b.innerHTML = `${ic('download', 16)}<span><b>aARgon3 ${esc(v)} is ready.</b> Restart to update; it takes a few seconds and keeps you signed in.</span><button class="btn small primary">Restart now</button><button class="btn small quiet" aria-label="Later">Later</button>`;
    b.querySelector('.primary').onclick = () => {
      b.querySelector('.primary').innerHTML = '<span class="spin"></span>'; desk.installUpdate();
    };
    b.querySelector('.quiet').onclick = () => { b.remove(); toast('It will install the next time you quit aARgon3.'); };
    document.body.append(b);
  }
  desk?.onMenu?.(p => S.me && (p === 'signout' ? signOut() : go(p)));
  start();
})();
