// v2.3 broadcasts: messages from the Apoji Team (sent from Apoji Admin). The Mac app shows each one once as a
// notification (and on your phone through N28C) plus a banner until you dismiss it.
// Supabase already hides what you shouldn't see (beta-only, admins-only); this picks what's live for this app.
const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
function pick(list, { version = '0.0.0', admin = false, surface = 'desktop', now = Date.now(), userId = '' } = {}) {
  return (Array.isArray(list) ? list : []).filter(b => b && !b.cancelled
    && new Date(b.send_at || 0).getTime() <= now && new Date(b.expires_at || 8.64e15).getTime() > now
    && (surface === 'desktop' ? b.desktop !== false : b.phone !== false)
    && (b.audience !== 'admins' || admin)
    && (b.audience !== 'user' || (!!userId && b.to_user === userId))   // 3.10: notices for one person ("🧪 3 things to test")
    && (b.audience !== 'outdated' || (b.max_version && cmp(version, b.max_version) < 0)))
    .map(b => ({ id: b.id, title: String(b.title || ''), body: String(b.body || ''), url: /^https:\/\//.test(b.url || '') ? b.url : '', audience: b.audience, phone: b.phone !== false, sentAt: b.send_at }));
}
const SELECT_OLD = 'broadcasts?select=id,title,body,url,audience,max_version,desktop,phone,send_at,expires_at,cancelled&order=send_at.desc&limit=10';
const SELECT = SELECT_OLD.replace('cancelled&', 'cancelled,to_user&');   // 3.10
module.exports = { pick, cmp, SELECT, SELECT_OLD };
