// Points, achievements and the daily challenge across your computers (3.9). Each computer uploads only its own share
// (public.user_stats, one row per computer, only you can read yours) and reads the others; metrics.js adds them up.
//   createStatSync({ cloud, metrics, device, onChange, log }) → { start, stop, cycle, state }
'use strict';
function createStatSync({ cloud, metrics, device, onChange = () => {}, log = () => {}, every = 60e3 } = {}) {
  let timer = null, nudgeT = null, last = '', st = { on: false, others: 0, error: '', at: 0 };
  async function cycle() {
    if (!cloud?.session) return;
    try {
      const mine = JSON.stringify(metrics.raw());
      if (mine !== last) { await cloud.write('POST', 'user_stats?on_conflict=user_id,device', { device: String(device()).slice(0, 80), data: JSON.parse(mine), updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal'); last = mine; }
      const rows = await cloud.authedGet('user_stats?select=device,data,updated_at&order=updated_at.desc&limit=12');
      const others = rows.filter(r => r.device !== device()).map(r => r.data);
      const before = JSON.stringify(metrics.others || []);
      metrics.setOthers(others);
      st = { on: true, others: others.length, error: '', at: Date.now() };
      if (JSON.stringify(others) !== before) onChange();
    } catch (e) { st.error = /user_stats|42P01|PGRST20|404/.test(e.message) ? 'Needs the 3.9 database update.' : e.message.slice(0, 120); log('stat sync', st.error); }
  }
  return {
    start() { if (timer) return; setTimeout(cycle, 8000); timer = setInterval(cycle, every); timer.unref?.(); },
    stop() { clearInterval(timer); timer = null; },
    // 3.11.1: points and achievements go up a few seconds after they change (not just once a minute)
    nudge() { clearTimeout(nudgeT); nudgeT = setTimeout(cycle, 4000); nudgeT.unref?.(); },
    cycle, state: () => ({ ...st })
  };
}
module.exports = { createStatSync };
