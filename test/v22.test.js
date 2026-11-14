// v2.2 tests: maintenance + suspensions enforced in the app, feedback inbox with replies, profile pictures, content
// reports, theme on your profile, the new admin portal (chat, dashboard, users, inbox, moderation) and the SQL.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  // ---------- maintenance rules
  const M = require('../src/maintenance');
  const list = [{ scope: 'flash', message: 'Model swap', adminBypass: true }, { scope: 'phone', message: '', adminBypass: false, endsAt: new Date(Date.now() + 30 * 60e3).toISOString(), type: 'outage' }, { scope: 'seek', message: '' }];
  assert.strictEqual(M.blockFor(list, 'chat', { persona: { id: 'flash' } })?.scope, 'flash');
  assert.strictEqual(M.blockFor(list, 'chat', { persona: { id: 'my-abc', base: 'flash' } })?.scope, 'flash', 'custom agents on Flash are down too');
  assert.strictEqual(M.blockFor(list, 'chat', { persona: { id: 'lyte' } }), null);
  assert.strictEqual(M.blockFor(list, 'chat', { persona: { id: 'flash' }, admin: true }), null, 'admins bypass');
  assert.strictEqual(M.blockFor(list, 'phone', { admin: true })?.scope, 'phone', 'unless bypass is off');
  assert.strictEqual(M.blockFor([{ scope: 'GLOBAL' }], 'spaces')?.scope, 'GLOBAL', 'global stops everything');
  assert.strictEqual(M.blockFor([{ scope: 'desktop' }], 'phone'), null);
  const msg = M.message(list[1], 'N28C');
  assert.ok(msg.startsWith('⚠️ N28C is down for maintenance.') && /Back in about (29|30) minutes/.test(msg), msg);
  assert.ok(M.message({ scope: 'x', message: 'Hi', endsAt: new Date(Date.now() - 1000).toISOString() }, 'x').includes('any minute'));
  assert.strictEqual(M.activeModeration({ status: 'suspended', suspended_until: new Date(Date.now() - 1000).toISOString() }), null, 'ended suspensions do not count');
  assert.ok(M.activeModeration({ status: 'banned' }));
  assert.ok(M.moderationText({ status: 'banned', reason: 'spam' }).includes('banned: spam'));
  ok('maintenance: scopes, custom agents follow their base, admin bypass, countdown text, suspensions');

  // ---------- cloud: maintenance columns (with fallback for older databases), live sync, avatar, theme, activity
  const { NexusCloud } = require('../src/cloud');
  const os = require('os'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx22-'));
  let mode = 'new'; const calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url).replace(/^https?:\/\/[^/]+/, ''); calls.push([opts.method || 'GET', u, opts.body]);
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (u.startsWith('/rest/v1/maintenance_config')) {
      if (mode === 'old' && u.includes('ends_at')) return json(400, { code: '42703', message: 'column maintenance_config.ends_at does not exist' });
      return json(200, [{ scope: 'phone', enabled: true, message: 'Upgrading', types: ['outage'], ...(mode === 'new' ? { ends_at: '2030-01-01T00:00:00Z', admin_bypass: false } : {}) }, { scope: 'x', enabled: false }]);
    }
    if (u.startsWith('/rest/v1/announcements')) return json(200, [{ id: 1, message: 'Hello', created_at: 'x' }]);
    if (u.startsWith('/rest/v1/rpc/log_activity')) return json(200, { success: true, moderation: { status: 'suspended', reason: 'spam', suspended_until: '2099-01-01T00:00:00Z' } });
    if (u.startsWith('/storage/v1/object/avatars/')) return json(200, { Key: 'ok' });
    if (u.startsWith('/rest/v1/profiles')) return { ok: true, status: 204, json: async () => null, text: async () => '' };
    return json(200, []);
  };
  const c = new NexusCloud({ url: 'https://x.supabase.co', key: 'pk', dir, ...{} });
  c.session = { accessToken: 'AT', refreshToken: 'RT', expiresAt: Date.now() + 3600e3, user: { id: 'u1', email: 'a@b.c' } }; c.profile = { username: 'a' };
  c.ensureFresh = async () => true;
  assert.ok(await c.syncLive());
  assert.deepStrictEqual(c.maintenance, [{ scope: 'phone', message: 'Upgrading', endsAt: '2030-01-01T00:00:00Z', adminBypass: false, type: 'outage' }]);
  assert.strictEqual(c.announcements[0].message, 'Hello');
  mode = 'old'; const m2 = await c.fetchMaintenance();
  assert.deepStrictEqual(m2, [{ scope: 'phone', message: 'Upgrading', endsAt: null, adminBypass: true, type: 'outage' }], 'older databases still work');
  await c.logActivity('desktop', '2.2.0');
  assert.ok(c.moderation() && c.moderation().status === 'suspended', 'log_activity refreshes suspension status');
  const url = await c.uploadAvatar(Buffer.from([1, 2, 3]), 'image/webp');
  assert.ok(/\/storage\/v1\/object\/public\/avatars\/u1\/avatar\.webp\?v=\d+$/.test(url));
  const up = calls.find(x => x[1] === '/storage/v1/object/avatars/u1/avatar.webp'); assert.strictEqual(up[0], 'POST');
  assert.ok(calls.some(x => x[0] === 'PATCH' && x[1].startsWith('/rest/v1/profiles') && JSON.parse(x[2]).avatar_url === url));
  assert.ok(await c.saveTheme({ accent: '#ff4d5e' }));
  const before = calls.length; await c.saveTheme({ accent: '#ff4d5e' }); assert.strictEqual(calls.length, before, 'same theme is not sent twice');
  fs.rmSync(dir, { recursive: true, force: true });
  ok('cloud: maintenance end time + admin bypass (old databases ok), live sync, activity check-in, profile picture, theme');

  // ---------- the app enforces it
  const main = read('main.js');
  for (const s of ["maint.blockFor(cloud.maintenance, 'chat'", "maint.blockFor(cloud.maintenance, 'spaces'", "maint.blockFor(cloud.maintenance, 'phone'", 'cloud.moderation()', 'phoneGate(row) || handleFromPhone(row)',
    'cloud.syncLive()', "cloud.logActivity('desktop'", 'syncThemeToProfile', "'account:setAvatar'", "'feedback:mine'", "'feedback:reply'", "'content:report'", 'checkFeedbackReplies', "to === 'inbox'"]) assert.ok(main.includes(s), s);
  assert.ok(/if \(mod && decision\.mode === 'free'\)/.test(main), 'suspended accounts lose the free key, keep their own keys');
  ok('Mac app: chats, Shared Spaces and N28C requests stop during maintenance; suspensions enforced; check-ins; theme on profile');

  // ---------- desktop UI
  const settings = read('renderer/settings.js'), hud = read('renderer/hud.js'), study = read('renderer/study.js'), html = read('renderer/index.html'), pre = read('preload.js');
  assert.ok(settings.includes("api.account.setAvatar") && settings.includes('avatarHtml') && settings.includes('paintMyReports') && html.includes('data-to="inbox"') && html.includes('id="fbMine"'));
  assert.ok(hud.includes('function maintBanners') && hud.includes('function modBanner') && hud.includes("background-image:url"));
  assert.ok(study.includes("data-a=\"spReport\"") && study.includes('api.reportContent') && !/\bprompt\(/.test(study), 'no prompt() (Electron has none)');
  assert.ok(pre.includes('feedbackInbox') && pre.includes("account: { setAvatar") && pre.includes('reportContent'));
  ok('desktop: profile picture, feedback to the team with replies, smarter maintenance banners, report posts and shared agents');

  // ---------- N28C
  const app = read('docs/companion/app.js'), idx = read('docs/companion/index.html');
  for (const s of ['function loadNotices', 'function phoneBlocked', "sb.rpc('log_activity'", "from('avatars')", 'function feedbackSheet', 'function reportSheet', "table: 'maintenance_config'", 'feedback_mark_seen']) assert.ok(app.includes(s), s);
  assert.ok(/const stop = phoneBlocked\(\); if \(stop\)/.test(app), 'sending is blocked while N28C is down');
  assert.ok(idx.includes('id="notices"') && idx.includes('.notice.warn'));
  ok('N28C: maintenance + announcements (live), suspensions, profile picture, feedback with replies, report posts');

  // ---------- admin portal
  const files = ['index.html', 'admin.js', 'chat.js', 'pages.js', 'charts.js', 'admin.css'].map(f => read('docs/admin/' + f));
  const portal = files.join('\n');
  for (const s of ["'admin_create_group'", "'admin_react'", "'admin_edit_message'", "'admin_delete_message'", "from('admin_reads')", "storage.from('admin-files')", 'read_receipts', "'invisible'", 'presence(', 'new Notification(',
    "'admin_dashboard'", "'admin_list_users'", "'admin_user_detail'", "'admin_bulk'", "from('admin_user_notes')", "from('feedback_reports')", "from('feedback_replies')", "from('content_reports')", "'admin_remove_content'",
    "'admin_list_spaces'", "'admin_list_shared_agents'", 'ends_at', 'admin_bypass', 'applyTheme', "from('avatars')", 'NXCharts.line']) assert.ok(portal.includes(s), s);
  for (const f of ['admin.js', 'chat.js', 'pages.js', 'charts.js']) assert.ok(read('docs/admin/index.html').includes(`src="${f}"`), f);
  ok('admin portal: group chats, files, reactions, edits, read receipts, presence, notifications, dashboard, users, inbox, moderation, maintenance');

  // ---------- SQL
  const sql = read('supabase/nexus-v2.2.sql');
  for (const s of ['create table if not exists public.admin_groups', 'function public.admin_can_room', 'public.admin_reads', 'public.admin_prefs', "'admin-files'", "'avatars'", 'public.feedback_reports', 'public.feedback_replies',
    'public.content_reports', 'public.admin_user_notes', 'public.app_activity', 'function public.log_activity', 'function public.admin_dashboard', 'function public.admin_list_users', 'function public.admin_remove_content',
    'add column if not exists ends_at', 'add column if not exists admin_bypass', 'add column if not exists avatar_url', 'replica identity full']) assert.ok(sql.includes(s), s);
  assert.ok(/ar_select[\s\S]{0,400}read_receipts[\s\S]{0,200}read_receipts/.test(sql), 'receipts only when both people have them on');
  assert.ok(/frr_select[\s\S]{0,200}not internal/.test(sql), 'internal notes are hidden from the reporter');
  ok('SQL: rooms + RLS, receipts, presence, file and picture buckets, feedback inbox, reports, notes, activity, dashboard, maintenance columns');

  console.log(`v2.2: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
