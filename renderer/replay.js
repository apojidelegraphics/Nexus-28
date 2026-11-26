// 4.2.0 Session replays (anonymous): the steps someone took, so the Apoji Team can see where people get stuck.
// What's kept: which screen, which button (by the app's own name for it), where on the window (as a fraction), when, and
// app errors. Never: anything typed, chat or document text, names, pictures, or who you are (a random id per install).
// Shared by the Mac/Windows app, N28C and Test Run (copied by `npm run sync:companion`).
//   NexusReplay.start({ app, version, device, enabled: () => bool, screen: () => 'name', variants: () => ({}), send(payload) })
(function (root) {
  'use strict';
  const MAX = 600, SEG_MS = 15 * 60e3;
  // places whose words belong to the person, not the app: never use their text as a label
  const PRIVATE = '.msg, .msgs, #msgs, #chatList, .chats, .chat-list, .conv, .body, .md, .wr-main, .wr-list, .wr-jot, .pv-row, .people, .friend, .np, .bubble, [data-private], [contenteditable]';
  const short = (s, n = 40) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const safeVal = v => /^[\w:.\-]{1,32}$/.test(String(v || ''));
  // the app's own name for a control: data-replay, an id, a known data-* key (data-tab="voice" → "tab:voice"), or its
  // label/title when it isn't inside someone's content; never what's typed in a field
  function labelOf(el) {
    if (!el || el.nodeType !== 1) return '';
    const t = el.closest('[data-replay], button, a, [role="button"], [role="tab"], [role="menuitem"], input, select, textarea, label, summary, [data-t], [data-tab], [data-act], [data-a], [data-open]') || el;
    if (t.dataset?.replay) return short(t.dataset.replay);
    const tag = t.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return short(`${tag}:${t.id || t.name || t.type || ''}`);
    if (t.id && !/^\d|[0-9a-f]{8,}/i.test(t.id)) return short('#' + t.id);
    for (const [k, v] of Object.entries(t.dataset || {})) if (safeVal(v) && !/^(i|id|idx|ts|uid|user|conv|chat|msg|doc|plan|key)$/i.test(k)) return short(`${k}:${v}`);
    for (const [k, v] of Object.entries(t.dataset || {})) if (v === '' || v === 'true') return short(k);
    if (!t.closest(PRIVATE)) { const l = t.getAttribute('aria-label') || t.title || (tag === 'button' || tag === 'summary' ? t.textContent : ''); if (l) return short(l, 32); }
    if (t.closest(PRIVATE)) { const p = t.closest(PRIVATE); return short((p.id ? '#' + p.id : p.className.split(' ')[0] ? '.' + p.className.split(' ')[0] : 'content') + ' item'); }
    return tag;
  }
  // an error's kind and where, with anything in quotes removed (it could be the person's text)
  const errLabel = (msg, file, line) => short(`${String(file || '').split('/').pop().split('?')[0]}:${line || 0} ${String(msg || '').replace(/(["'`“‘]).*?(["'`”’])/g, '…')}`, 48);

  function start(o) {
    if (!o || root.__nxReplay) return root.__nxReplay;
    let ev = [], t0 = Date.now(), lastScreen = '', started = new Date().toISOString(), sent = false;
    const on = () => { try { return o.enabled ? !!o.enabled() : true; } catch { return false; } };
    const now = () => Date.now() - t0;
    const push = e => { if (!on() || ev.length >= MAX) return; ev.push({ t: now(), ...e }); if (ev.length >= MAX || now() > SEG_MS) flush('full'); };
    const screen = () => { try { return short(o.screen ? o.screen() : location.hash || 'main'); } catch { return 'main'; } };
    const view = () => { const s = screen(); if (s && s !== lastScreen) { lastScreen = s; push({ k: 'view', s }); } };
    function flush(why) {
      const list = ev; if (list.length < 3 || now() < 3000) { if (why !== 'hide') return; }
      ev = []; t0 = Date.now(); started = new Date().toISOString(); lastScreen = '';
      if (list.length < 3) return;
      let variants = {}; try { variants = o.variants ? o.variants() || {} : {}; } catch {}
      const payload = { app: o.app, version: String(o.version || ''), device: o.device, variants, screen: { w: innerWidth, h: innerHeight }, events: list, started: list.length ? new Date(Date.now() - list[list.length - 1].t).toISOString() : started };
      try { o.send(payload); sent = true; } catch {}
      setTimeout(view, 0);
    }
    document.addEventListener('click', e => {
      view();
      const W = innerWidth || 1, H = innerHeight || 1;
      push({ k: 'click', s: lastScreen, l: labelOf(e.target), x: Math.round(e.clientX / W * 1000) / 1000, y: Math.round(e.clientY / H * 1000) / 1000 });
      setTimeout(view, 350);
    }, true);
    document.addEventListener('keydown', e => {
      // only shortcuts and Enter/Escape, never letters you type
      const combo = (e.metaKey || e.ctrlKey) && e.key.length === 1 ? `${e.metaKey ? 'cmd' : 'ctrl'}+${e.key.toLowerCase()}` : ['Enter', 'Escape', 'Tab'].includes(e.key) && !e.shiftKey ? e.key.toLowerCase() : '';
      if (combo) { push({ k: 'key', s: lastScreen, l: combo + (e.target?.id ? ' @' + short(e.target.id, 20) : '') }); setTimeout(view, 350); }
    }, true);
    addEventListener('error', e => push({ k: 'error', s: lastScreen, l: errLabel(e.message, e.filename, e.lineno) }));
    addEventListener('unhandledrejection', e => push({ k: 'error', s: lastScreen, l: errLabel(e.reason?.message || 'promise', '', 0) }));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush('hide'); else { t0 = Date.now(); view(); } });
    addEventListener('pagehide', () => flush('hide'));
    setInterval(view, 1500);
    view();
    const api = { mark: (k, l) => push({ k: short(k, 12), s: lastScreen, l: short(l) }), flush, events: () => ev.slice(), get sent() { return sent; } };
    root.__nxReplay = api; return api;
  }
  const deviceId = (get, set) => { let d = ''; try { d = get(); } catch {} if (!/^[a-z0-9]{8,40}$/.test(d || '')) { d = Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join(''); try { set(d); } catch {} } return d; };
  const api = { start, labelOf, errLabel, deviceId, PRIVATE };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NexusReplay = api;
})(typeof window !== 'undefined' ? window : globalThis);
