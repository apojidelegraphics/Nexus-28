// Friends, profiles and Apoji-wide search (4.0), over the Nexus account (nexus-v4.0.sql). Thin wrappers around the RPCs so
// main.js, N28C (directly with supabase-js) and Test Run all talk to the same functions.
//   createSocial({ cloud }) → { friends(), request(username), respond(userId, yes), remove(userId), block(userId, on), card(username),
//                               invites(), inviteRespond(spaceId, yes), invite(spaceId, userId), search(q), linkCode(), account() }
'use strict';
const ID = /^[0-9a-f-]{36}$/i;
function createSocial({ cloud: cloudIn }) {
  const C = () => (typeof cloudIn === 'function' ? cloudIn() : cloudIn) || null;   // 4.0.1: a getter (made before sign-in loads)
  const signed = () => { if (!C()?.session) throw new Error('Sign in to your Nexus account first (Settings → Account).'); };
  const rpc = async (fn, args = {}) => {
    signed();
    try { return await C().rpc(fn, args); }
    catch (e) { if (/42883|PGRST20|404|could not find the function/i.test(e.message)) throw new Error('This needs the 4.0 database update (nexus-v4.0.sql).'); throw e; }
  };
  const uid = x => { if (!ID.test(String(x))) throw new Error('Unknown person.'); return String(x); };
  const sid = x => { if (!ID.test(String(x))) throw new Error('Unknown Space.'); return String(x); };
  const ok = r => { if (r && r.ok === false) throw new Error(r.error || 'That didn\'t work.'); return r; };
  return {
    friends: () => rpc('my_friends'),
    request: username => rpc('friend_request', { p_username: String(username || '').trim().slice(0, 40) }).then(ok),
    respond: (id, yes) => rpc('friend_respond', { p_user: uid(id), p_accept: !!yes }).then(ok),
    remove: id => rpc('friend_remove', { p_user: uid(id) }).then(ok),
    block: (id, on = true) => rpc('friend_block', { p_user: uid(id), p_on: !!on }).then(ok),
    card: username => rpc('profile_card', { p_username: String(username || '').slice(0, 40) }).then(ok),
    invites: () => rpc('my_space_invites'),
    inviteRespond: (space, yes) => rpc('space_invite_respond', { p_space: sid(space), p_accept: !!yes }).then(ok),
    invite: (space, user) => rpc('space_invite', { p_space: sid(space), p_user: uid(user) }).then(ok),
    people: space => rpc('space_people', { p_space: sid(space) }),
    search: q => String(q || '').trim().length < 2 ? Promise.resolve([]) : rpc('apoji_search', { p_q: String(q).slice(0, 80), p_limit: 20 }),
    linkCode: () => rpc('apoji_link_code').then(ok),
    account: () => rpc('apoji_account'),
    report: ({ kind, target, label = '', reason = 'other', details = '' }) => { signed(); return C().write('POST', 'content_reports', { kind, target_id: String(target).slice(0, 80), target_label: String(label).slice(0, 200), reason: ['spam', 'harassment', 'inappropriate', 'cheating', 'other'].includes(reason) ? reason : 'other', details: String(details).slice(0, 1000) }, 'return=minimal').then(() => ({ ok: true })); }
  };
}
module.exports = { createSocial };
