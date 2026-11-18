// Chat sync between your computers (v3.7): with it on, every chat lives in your Nexus account too (Supabase table
// public.desktop_chats, only you can read your rows), so your Mac and your PC show the same chats. Opt-in, in
// Settings → Account. Incognito chats never sync. A chat changed on two computers keeps the newer copy.
//   createChatSync({ cloud, convos, getSettings, setSettings, onChanged, device, log })
//     .start() / .stop() / .push(ids?) / .pull() / .deleted(id) / .state()
// cloud must provide: session, rest(path, {auth}), write(method, path, body, prefer)
const PAGE = 200;

function createChatSync({ cloud, convos, getSettings, setSettings, onChanged = () => {}, device = 'this computer', log = () => {}, now = () => Date.now() } = {}) {
  let timer = null, pushT = null, busy = false;
  const st = { on: false, lastPull: 0, lastPush: 0, error: '', pulled: 0, pushed: 0 };
  const cfg = () => getSettings().chatSync || {};
  const pushedAt = () => cfg().pushed || {};          // conv id → updated value we last sent
  const enabled = () => !!cfg().enabled && !!cloud.session;

  const rowOf = c => ({ id: c.id, title: String(c.title || 'Chat').slice(0, 200), updated_at: new Date(c.updated || now()).toISOString(), deleted: false, device, data: { ...c, syncedFrom: device } });

  async function push(ids = null) {
    if (!enabled()) return 0;
    const done = { ...pushedAt() };
    const list = convos.load().list.filter(c => !c.incognito && (ids ? ids.includes(c.id) : (c.updated || 0) > (done[c.id] || 0)));
    const tomb = (cfg().tombstones || []).filter(t => !ids || ids.includes(t.id));
    if (!list.length && !tomb.length) return 0;
    for (let i = 0; i < list.length; i += 20) {
      const chunk = list.slice(i, i + 20);
      await cloud.write('POST', 'desktop_chats?on_conflict=user_id,id', chunk.map(rowOf), 'resolution=merge-duplicates,return=minimal');
      for (const c of chunk) done[c.id] = c.updated || 0;
    }
    if (tomb.length) await cloud.write('POST', 'desktop_chats?on_conflict=user_id,id', tomb.map(t => ({ id: t.id, title: '', updated_at: new Date(t.at).toISOString(), deleted: true, device, data: null })), 'resolution=merge-duplicates,return=minimal');
    setSettings({ chatSync: { ...cfg(), pushed: done, tombstones: (cfg().tombstones || []).filter(t => !tomb.includes(t)) } });
    st.lastPush = now(); st.pushed += list.length + tomb.length;
    return list.length + tomb.length;
  }
  async function pull() {
    if (!enabled()) return 0;
    const since = cfg().pulledUntil || '1970-01-01T00:00:00Z';
    let changed = 0, newest = since;
    for (let off = 0; off < 5000; off += PAGE) {
      const rows = await cloud.rest(`desktop_chats?select=id,updated_at,deleted,device,data&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc&limit=${PAGE}&offset=${off}`, { auth: true });
      const d = convos.load(), done = { ...pushedAt() };
      for (const r of rows) {
        if (r.updated_at > newest) newest = r.updated_at;
        const local = d.list.find(c => c.id === r.id), t = Date.parse(r.updated_at);
        if (r.deleted) { if (local && (local.updated || 0) <= t) { d.list = d.list.filter(c => c.id !== r.id); changed++; } continue; }
        if (!r.data || r.device === device) continue;
        if (!local || (local.updated || 0) < t) {
          const { syncedFrom, ...conv } = r.data;
          if (local) Object.assign(local, conv); else d.list.push(conv);
          done[r.id] = conv.updated || t; changed++;
        }
      }
      if (changed) { if (!d.list.some(c => c.id === d.activeId)) d.activeId = d.list.sort((a, b) => (b.updated || 0) - (a.updated || 0))[0]?.id || null; convos.save(); }
      setSettings({ chatSync: { ...cfg(), pushed: done, pulledUntil: newest } });
      if (rows.length < PAGE) break;
    }
    st.lastPull = now(); st.pulled += changed;
    if (changed) onChanged();
    return changed;
  }
  async function cycle() {
    if (busy || !enabled()) return; busy = true;
    try { await pull(); await push(); st.error = ''; }
    catch (e) { st.error = /desktop_chats|42P01|404/.test(e.message) ? 'Chat sync needs the 3.7 database update (supabase/nexus-v3.7.sql).' : e.message.slice(0, 160); log('chat sync', st.error); }
    finally { busy = false; }
  }
  return {
    start() { st.on = true; if (timer) return; setTimeout(cycle, 5000); timer = setInterval(cycle, 60e3); timer.unref?.(); },
    stop() { st.on = false; clearInterval(timer); timer = null; },
    // after any change on this computer: send it within a few seconds
    changed() { if (!enabled()) return; clearTimeout(pushT); pushT = setTimeout(() => { if (!busy) push().catch(e => { st.error = e.message.slice(0, 160); }); }, 4000); },
    deleted(id) { if (!enabled()) return; setSettings({ chatSync: { ...cfg(), tombstones: [...(cfg().tombstones || []).filter(t => t.id !== id), { id, at: now() }].slice(-500) } }); this.changed(); },
    push, pull, cycle,
    state: () => ({ ...st, enabled: !!cfg().enabled, signedIn: !!cloud.session })
  };
}
module.exports = { createChatSync };
