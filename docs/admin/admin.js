// Nexus admin portal core (v2.2): sign-in, your theme from the app, layout, presence, live updates and notifications.
// Pages live in pages.js, the chat in chat.js, charts in charts.js. Everything goes through Supabase row-level
// security, so nothing here works for an account that isn't in public.admin_roles.
(function () {
  const SB_URL = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co', SB_KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';
  const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = t => t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  const ago = t => { if (!t) return 'never'; const s = (Date.now() - new Date(t)) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago'; return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  const store = { get(k, d) { try { const v = localStorage.getItem('nx-admin-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('nx-admin-' + k, JSON.stringify(v)); } catch {} } };
  const ERR = { not_admin: 'Admins only.', not_high_admin: 'Only admins and high-admins can do that.', user_not_found: 'No account with that email.', invalid_level: 'Pick a valid level.',
    not_found: 'Not found (or you no longer have access).', name_required: 'Give it a name.', too_many: 'Too many at once (500 max).', bad_action: 'Unknown action.' };
  const needSql = m => /does not exist|schema cache|Could not find the function|PGRST20[02]/i.test(m || '');
  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(needSql(error.message) ? `This needs supabase/nexus-v2.2.sql (run it in the SQL editor). (${error.message})` : error.message);
    if (data && data.success === false) throw new Error(ERR[data.error] || data.error);
    return data;
  }

  // ---------- theme: follows the theme you picked in the Mac app (saved to your profile by the app)
  const HEX = /^#[0-9a-f]{6}$/i;
  function applyTheme(t) {
    if (!t || !HEX.test(t.accent || '') || !HEX.test(t.bg || '')) return;
    const r = document.documentElement.style;
    r.setProperty('--accent', t.accent); r.setProperty('--rgb', /^\d{1,3},\d{1,3},\d{1,3}$/.test(t.rgb || '') ? t.rgb : '61,255,160'); r.setProperty('--bg', t.bg);
    for (const [k, v] of [['--panel', t.panel], ['--panel2', t.panel2], ['--text', t.text], ['--muted', t.muted], ['--on-accent', t.onAccent]]) if (HEX.test(v || '')) r.setProperty(k, v);
    document.querySelector('meta[name="theme-color"]').content = t.bg;
    store.set('theme', t);
  }
  applyTheme(store.get('theme', null));

  // ---------- people, avatars, presence
  const COLORS = ['#3dffa0', '#5ce1ff', '#ffd36b', '#ff8fd0', '#b69cff', '#ff9f6b', '#9bd65c', '#9fe7ff'];
  const colorOf = id => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  const nameOf = a => a ? (a.nickname || a.username || String(a.email || '').split('@')[0] || 'Admin') : 'Admin';
  function presence(a) {
    if (!a) return 'offline';
    const fresh = a.last_seen && Date.now() - new Date(a.last_seen) < 150e3;
    if (a.id === NX.A.user?.id) return NX.A.prefs.status === 'invisible' ? 'offline' : NX.A.prefs.status === 'dnd' ? 'dnd' : NX.A.idle ? 'idle' : 'online';
    if (!fresh || a.status === 'invisible') return 'offline';
    return a.status === 'dnd' ? 'dnd' : a.idle ? 'idle' : 'online';
  }
  const PRES = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline' };
  function av(a, size = '', pres = false) {
    const id = a?.id || a?.user_id || a?.email || '?', url = a?.avatar_url;
    const safe = url && /^https:\/\//.test(url) ? url.replace(/["'()\\]/g, '') : '';
    return `<span class="av ${size} ${safe ? 'img' : ''}" style="--c:${colorOf(id)};${safe ? `background-image:url('${safe}')` : ''}" title="${esc(nameOf(a))}">${esc(nameOf(a)[0]?.toUpperCase() || '?')}${pres ? `<i class="pr ${presence(a)}"></i>` : ''}</span>`;
  }
  const adminById = id => NX.A.admins.find(a => a.id === id);

  // ---------- toasts + notifications
  function toast(text, opts = {}) {
    if (typeof opts === 'boolean') opts = { bad: opts };
    const el = document.createElement('div'); el.className = 'toast' + (opts.bad ? ' bad' : '') + (opts.onClick ? ' click' : '');
    el.innerHTML = `${opts.who ? av(opts.who) : ''}<div>${opts.title ? `<b>${esc(opts.title)}</b>` : ''}<span>${esc(text)}</span></div>`;
    if (opts.onClick) el.onclick = () => { el.remove(); opts.onClick(); };
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), opts.ms || (opts.title ? 6000 : 3000));
  }
  let audio = null;
  function chime() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + .09);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .35);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + .36);
    } catch {}
  }
  // kind: chat | requests | feedback | reports.  force: a mention (gets through muted rooms, not Do not disturb)
  function notify({ kind, title, body, who, tab, onClick, force = false }) {
    const p = NX.A.prefs, n = p.notify || {};
    if (!force && n[kind] === false) return;
    const dnd = p.status === 'dnd';
    const open = () => { window.focus(); if (onClick) onClick(); else if (tab) NX.go(tab); };
    if (!dnd) toast(body, { title, who, onClick: open });
    if (dnd) return;
    if (n.sound !== false) chime();
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try { const note = new Notification(title, { body: String(body).slice(0, 180), icon: who?.avatar_url || '../companion/icon-192.png', tag: kind + ':' + (tab || ''), renotify: true }); note.onclick = () => { note.close(); open(); }; } catch {}
    }
  }
  function updateTitle() {
    const c = NX.A.counts, total = (c.chat || 0) + (c.requests || 0) + (c.feedback || 0) + (c.reports || 0);
    document.title = (total ? `(${total}) ` : '') + 'Nexus Admin';
    document.querySelectorAll('[data-badge]').forEach(el => { const v = c[el.dataset.badge] || 0; el.textContent = v > 99 ? '99+' : v; el.hidden = !v; });
  }

  // ---------- layout
  const TABS = [
    ['', [['dashboard', '◎', 'Dashboard'], ['chat', '💬', 'Admin chat', 'chat']]],
    ['INBOX', [['requests', '🧪', 'Beta requests', 'requests'], ['feedback', '📮', 'Feedback & bugs', 'feedback'], ['reports', '🚩', 'Reports', 'reports']]],
    ['PEOPLE & CONTENT', [['users', '👤', 'Users'], ['moderation', '🛡', 'Moderation']]],
    ['APP CONTROL', [['flags', '⚑', 'Feature flags'], ['announce', '📣', 'Announcements'], ['maint', '🛠', 'Maintenance']]],
    ['', [['audit', '📜', 'Audit log'], ['me', '⚙︎', 'My settings']]]
  ];
  const ALL_TABS = TABS.flatMap(g => g[1].map(t => t[0]));
  function shell() {
    $('app').innerHTML = `<div class="wrap"><nav id="nav">${TABS.map(([h, items]) => `${h ? `<h6>${h}</h6>` : '<h6></h6>'}${items.map(([k, ic, l, b]) =>
      `<button data-tab="${k}" class="${NX.A.tab === k ? 'on' : ''}"><span class="ic">${ic}</span>${l}${b ? `<span class="n" data-badge="${b}" hidden></span>` : ''}</button>`).join('')}`).join('')}</nav><main id="main"></main></div>`;
    $('nav').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) NX.go(b.dataset.tab); };
    paintHeader(); updateTitle(); render();
  }
  function paintHeader() {
    const me = NX.A.me || { id: NX.A.user.id, email: NX.A.user.email };
    $('hdr').innerHTML = `<span class="live ${NX.A.live ? '' : 'off'}" id="liveDot" title="${NX.A.live ? 'Updates arrive instantly' : 'Checking for updates every few seconds'}">${NX.A.live ? '● LIVE' : '○ POLLING'}</span>
      <button class="hbtn" id="hBell" title="Notifications">🔔<span class="n" data-badge="inbox" hidden></span></button>
      <button class="me-chip" id="hMe" title="My settings">${av(me, 'sm', true)}<span>${esc(nameOf(me))}<small>${esc((NX.A.level || '').toUpperCase())} · ${PRES[presence(me)]}</small></span></button>`;
    $('hMe').onclick = () => NX.go('me');
    $('hBell').onclick = () => NX.go(NX.A.counts.requests ? 'requests' : NX.A.counts.feedback ? 'feedback' : NX.A.counts.reports ? 'reports' : NX.A.counts.chat ? 'chat' : 'dashboard');
    NX.A.counts.inbox = (NX.A.counts.requests || 0) + (NX.A.counts.feedback || 0) + (NX.A.counts.reports || 0);
    updateTitle();
  }
  let renderSeq = 0;
  async function render() {
    const seq = ++renderSeq, tab = NX.A.tab;
    document.querySelectorAll('#nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    if (innerWidth <= 760) document.querySelector('#nav .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    closeOverlays();
    $('main').className = tab === 'chat' ? 'wide' : '';
    $('main').onclick = null; $('main').onchange = null; $('main').oninput = null;
    try { await (NX.pages[tab] || NX.pages.dashboard)(); }
    catch (e) { if (seq === renderSeq) $('main').innerHTML = `<h1>Something went wrong</h1><div class="card err">${esc(e.message)}</div>`; }
  }
  function go(tab, opts = {}) {
    if (!ALL_TABS.includes(tab)) tab = 'dashboard';
    NX.A.tab = tab; NX.A.arg = opts.arg ?? null;
    history.replaceState(null, '', '#' + tab + (opts.arg ? '/' + encodeURIComponent(opts.arg) : ''));
    render();
  }
  const main = (html, opts = {}) => { $('main').innerHTML = html; if (opts.cards !== false) labelTables(); };
  // On phones tables become cards: each cell shows its column name.
  function labelTables() {
    $('main').querySelectorAll('table.cards').forEach(t => {
      const hs = [...t.querySelectorAll('tr:first-child th')].map(h => h.textContent.trim()); if (!hs.length) return;
      t.querySelectorAll('tr').forEach(r => [...r.children].forEach((c, i) => { if (c.tagName === 'TD' && hs[i] && !c.hasAttribute('colspan')) c.dataset.l = hs[i]; }));
    });
  }
  function closeOverlays() { document.querySelectorAll('.scrim,.drawer,.modal').forEach(e => e.remove()); }
  function overlay(kind, html) {
    closeOverlays();
    const scrim = document.createElement('div'); scrim.className = 'scrim';
    const el = document.createElement('div'); el.className = kind; el.innerHTML = `<button class="btn sm x" data-x>✕</button>${html}`;
    const close = () => { scrim.remove(); el.remove(); };
    scrim.onclick = close; el.addEventListener('click', e => { if (e.target.closest('[data-x]')) close(); });
    document.body.append(scrim, el);
    return { el, close };
  }
  const drawer = html => overlay('drawer', html), modal = html => overlay('modal', html);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlays(); });

  // ---------- live updates: one realtime channel for everything, polling fallback
  const listeners = {};
  const on = (table, fn) => { (listeners[table] = listeners[table] || []).push(fn); return () => { listeners[table] = listeners[table].filter(f => f !== fn); }; };
  const emit = (table, payload) => (listeners[table] || []).slice().forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
  const LIVE_TABLES = ['admin_messages', 'admin_reads', 'admin_prefs', 'admin_groups', 'admin_group_members', 'beta_requests', 'feedback_reports', 'feedback_replies', 'content_reports', 'maintenance_config'];
  function realtime() {
    let ch = sb.channel('admin-live');
    for (const t of LIVE_TABLES) ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, p => emit(t, p));
    ch.subscribe(st => {
      const live = st === 'SUBSCRIBED';
      if (live !== NX.A.live) { NX.A.live = live; const d = $('liveDot'); if (d) { d.className = 'live' + (live ? '' : ' off'); d.textContent = live ? '● LIVE' : '○ POLLING'; } }
      if (live) refreshCounts();
    });
    setInterval(() => { if (!NX.A.live) { refreshCounts(); emit('poll', {}); } }, 8000);
  }
  async function count(table, filter) {
    let q = sb.from(table).select('*', { count: 'exact', head: true });
    for (const [k, v] of Object.entries(filter)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    const { count: n } = await q; return n || 0;
  }
  async function refreshCounts() {
    const [requests, feedback, reports] = await Promise.all([
      count('beta_requests', { status: 'pending' }).catch(() => 0), count('feedback_reports', { status: 'new' }).catch(() => 0), count('content_reports', { status: 'open' }).catch(() => 0)]);
    Object.assign(NX.A.counts, { requests, feedback, reports }); paintHeader();
  }
  // New things arriving → notifications
  function watchInbox() {
    on('beta_requests', p => { if (p.eventType === 'INSERT') notify({ kind: 'requests', title: '🧪 New beta request', body: `${p.new.username || p.new.email || 'Someone'}: ${p.new.why || p.new.uses || 'wants to be a beta tester'}`, tab: 'requests' }); refreshCounts(); });
    on('feedback_reports', p => {
      if (p.eventType === 'INSERT') notify({ kind: 'feedback', title: p.new.kind === 'bug' ? '🐞 New bug report' : '📮 New feedback', body: `${p.new.title} · ${p.new.username || p.new.email || ''}`, onClick: () => go('feedback', { arg: p.new.id }) });
      refreshCounts();
    });
    on('feedback_replies', p => { if (p.eventType === 'INSERT' && !p.new.is_staff) notify({ kind: 'feedback', title: '📮 They replied', body: p.new.body, onClick: () => go('feedback', { arg: p.new.report_id }) }); });
    on('content_reports', p => { if (p.eventType === 'INSERT') notify({ kind: 'reports', title: '🚩 New content report', body: `${p.new.kind} · ${p.new.reason}${p.new.target_label ? ' · ' + p.new.target_label : ''}`, tab: 'reports' }); refreshCounts(); });
    on('admin_prefs', p => {
      const r = p.new; if (!r?.user_id) return;
      const a = adminById(r.user_id); if (a) Object.assign(a, { status: r.status, status_text: r.status_text, idle: r.idle, last_seen: r.last_seen, read_receipts: r.read_receipts });
      emit('presence', a);
    });
  }

  // ---------- presence: a heartbeat while the portal is open; idle after 5 min without input or with the tab hidden
  let lastInput = Date.now(), hiddenAt = 0;
  ['pointerdown', 'keydown', 'scroll', 'pointermove'].forEach(ev => addEventListener(ev, () => { const was = NX.A.idle; lastInput = Date.now(); if (was && !document.hidden) { NX.A.idle = false; beat(); } }, { passive: true }));
  document.addEventListener('visibilitychange', () => { hiddenAt = document.hidden ? Date.now() : 0; if (!document.hidden) { lastInput = Date.now(); if (NX.A.idle) { NX.A.idle = false; beat(); } emit('visible', {}); } });
  async function beat() {
    if (!NX.A.user) return;
    const idle = Date.now() - lastInput > 5 * 60e3 || (hiddenAt && Date.now() - hiddenAt > 5 * 60e3);
    NX.A.idle = !!idle;
    const now = new Date().toISOString();
    const { error } = await sb.from('admin_prefs').upsert({ user_id: NX.A.user.id, last_seen: now, idle: NX.A.idle, updated_at: now }, { onConflict: 'user_id' });
    if (!error) { const me = adminById(NX.A.user.id); if (me) Object.assign(me, { last_seen: now, idle: NX.A.idle }); }
    paintHeader(); emit('presence', null);
  }
  // Going offline when the page closes (keepalive so it still sends)
  addEventListener('pagehide', () => {
    const tok = NX.A.session?.access_token; if (!tok || !NX.A.user) return;
    fetch(`${SB_URL}/rest/v1/admin_prefs?user_id=eq.${NX.A.user.id}`, { method: 'PATCH', keepalive: true, headers: { apikey: SB_KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ last_seen: new Date(Date.now() - 3600e3).toISOString() }) }).catch(() => {});
  });
  async function savePrefs(patch) {
    Object.assign(NX.A.prefs, patch);
    const { error } = await sb.from('admin_prefs').upsert({ user_id: NX.A.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) toast(needSql(error.message) ? 'Run supabase/nexus-v2.2.sql to save settings.' : error.message, true);
    const me = adminById(NX.A.user.id); if (me) Object.assign(me, patch);
    paintHeader(); emit('presence', null);
    return !error;
  }

  // ---------- sign in + gate
  function signIn(msg = '') {
    $('hdr').innerHTML = '';
    $('app').innerHTML = `<div class="login"><form class="card" id="f"><h3>Admin sign in</h3><p class="muted" style="margin:0">Use your Nexus account. This portal only works for admins.</p>
      <input class="field" id="em" type="email" placeholder="Email" autocomplete="username" required><input class="field" id="pw" type="password" placeholder="Password" autocomplete="current-password" required>
      <button class="btn primary">Sign in</button><div class="err" id="er">${esc(msg)}</div></form></div>`;
    $('f').onsubmit = async e => { e.preventDefault(); $('er').textContent = ''; const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value }); if (error) $('er').textContent = error.message; else start(); };
  }
  async function loadAdmins() {
    try { const r = await rpc('admin_list_admins'); NX.A.admins = r.admins || []; }
    catch { NX.A.admins = [{ id: NX.A.user.id, email: NX.A.user.email, level: NX.A.level }]; }
    NX.A.me = adminById(NX.A.user.id) || { id: NX.A.user.id, email: NX.A.user.email };
  }
  async function start() {
    const { data } = await sb.auth.getSession();
    NX.A.session = data.session; NX.A.user = data.session?.user || null;
    if (!NX.A.user) return signIn();
    const { data: level } = await sb.rpc('get_my_admin_level');
    if (!level) { await sb.auth.signOut(); return signIn("That account isn't an admin."); }
    NX.A.level = level;
    sb.auth.onAuthStateChange((_ev, s) => { NX.A.session = s; if (!s) location.reload(); });
    const [{ data: prof }, { data: prefs }] = await Promise.all([
      sb.from('profiles').select('username,nickname,avatar_url,theme').eq('id', NX.A.user.id).maybeSingle(),
      sb.from('admin_prefs').select('*').eq('user_id', NX.A.user.id).maybeSingle()]);
    NX.A.profile = prof || {}; if (prof?.theme) applyTheme(prof.theme);
    if (prefs) NX.A.prefs = { ...NX.A.prefs, ...prefs, notify: { ...NX.A.prefs.notify, ...(prefs.notify || {}) } };
    await loadAdmins();
    const [tab, arg] = location.hash.slice(1).split('/');
    NX.A.tab = ALL_TABS.includes(tab) ? tab : 'dashboard'; NX.A.arg = arg ? decodeURIComponent(arg) : null;
    shell();
    watchInbox(); realtime(); refreshCounts();
    NX.chat.init().catch(e => console.warn('chat', e));
    beat(); setInterval(beat, 45e3);
    setInterval(() => emit('presence', null), 30e3);
    sb.rpc('log_activity', { p_source: 'portal', p_version: 'portal' }).then(() => {}, () => {});
  }

  const NX = window.NX = {
    sb, $, esc, when, ago, store, rpc, needSql, toast, notify, av, nameOf, colorOf, presence, PRES, adminById, applyTheme,
    main, labelTables, drawer, modal, closeOverlays, go, shell, paintHeader, updateTitle, on, emit, refreshCounts, savePrefs, loadAdmins, chime, start, SB_URL,
    pages: {},
    A: { user: null, session: null, level: '', tab: 'dashboard', arg: null, admins: [], me: null, profile: {}, live: false, idle: false,
      counts: { chat: 0, requests: 0, feedback: 0, reports: 0, inbox: 0 },
      prefs: { read_receipts: true, status: 'auto', status_text: '', muted_rooms: [], notify: { chat: true, requests: true, feedback: true, reports: true, sound: true } } }
  };
})();
