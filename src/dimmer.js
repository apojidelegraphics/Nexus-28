// Screen dimmer (v3.4, shared by Nexus '28 and Apoji Admin; keep the two copies the same).
//
// When "Keep the screen on" is in use, macOS no longer dims the screen by itself. This brings that back: after you've
// been away for a while (no mouse or keyboard), the screens dim. Screens that allow it get their real backlight
// lowered (brightness.js); any other screen fades to dark behind a see-through layer that ignores clicks. Touch the
// mouse or a key and everything comes back. It never shows over the lock screen and never takes focus.
function createDimmer({ BrowserWindow, screen, powerMonitor, getCfg, isAwake = () => true, brightness = null, every = 1000 } = {}) {
  const wins = new Map();
  let shown = false, locked = false, timer = null, testing = null, realLevel = null;
  const html = `data:text/html,${encodeURIComponent('<html><body style="margin:0;background:#000;cursor:none"></body></html>')}`;
  const cfg = () => { const c = getCfg?.() || {}; return { want: !!c.keepAwake && !!c.keepDisplay && c.dim !== false, after: Math.max(30, +c.dimAfter || 120), level: Math.min(1, Math.max(0, c.dimLevel == null ? 0.45 : +c.dimLevel)) }; };   // 0.45 = screen at 55%

  function make(d, level) {
    const b = d.bounds;
    const w = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, frame: false, transparent: true, hasShadow: false,
      focusable: false, skipTaskbar: true, resizable: false, movable: false, show: false, enableLargerThanScreen: true,
      backgroundColor: '#00000000', webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
    w.setIgnoreMouseEvents(true);
    try { w.setAlwaysOnTop(true, 'screen-saver'); w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch {}
    w.setOpacity(0); w.loadURL(html);
    w._level = level;
    return w;
  }
  function fade(w, to, ms = 900) {
    const from = w.getOpacity(); const t0 = Date.now();
    clearInterval(w._fade);
    w._fade = setInterval(() => {
      if (w.isDestroyed()) return clearInterval(w._fade);
      const k = Math.min(1, (Date.now() - t0) / ms); w.setOpacity(from + (to - from) * k);
      if (k >= 1) { clearInterval(w._fade); if (to === 0) w.hide(); }
    }, 30);
  }
  const real = id => !!brightness?.supported?.(id);
  function show(level = cfg().level) {
    const ds = screen.getAllDisplays();
    const backlit = ds.filter(d => real(d.id)).map(d => d.id);
    if (backlit.length) { realLevel = level; brightness.dim(backlit, level).catch(() => {}); }
    for (const d of ds) {
      if (real(d.id)) continue;                                   // this one dims for real; no layer needed
      let w = wins.get(d.id);
      if (!w || w.isDestroyed()) { w = make(d, level); wins.set(d.id, w); }
      w._level = level; w.setBounds(d.bounds); w.showInactive(); fade(w, level, 1500);
    }
    shown = true;
  }
  function hide(now = false) {
    for (const w of wins.values()) { if (w.isDestroyed()) continue; if (now) { clearInterval(w._fade); w.setOpacity(0); w.hide(); } else fade(w, 0, 250); }
    if (realLevel != null || brightness?.dimmed?.()) { realLevel = null; brightness?.restore().catch(() => {}); }
    shown = false;
  }
  function tick() {
    if (testing) return;
    const { want, after, level } = cfg();
    const idle = powerMonitor.getSystemIdleTime();
    const should = want && level > 0 && !locked && isAwake() && idle >= after;
    if (should && shown) {                                          // slider moved while dim
      for (const w of wins.values()) if (!w.isDestroyed() && w._level !== level) { w._level = level; fade(w, level, 400); }
      if (realLevel != null && realLevel !== level) { realLevel = level; brightness.dim(screen.getAllDisplays().filter(d => real(d.id)).map(d => d.id), level).catch(() => {}); }
    }
    if (should && !shown) show(level);
    else if (!should && shown) hide(idle < 2 || locked);
  }
  // "Try it": dim right now at the slider's level for a few seconds (moving the mouse ends it early)
  function test(ms = 4000) {
    const { level } = cfg();
    clearTimeout(testing); if (shown) hide(true);
    show(level || 0.45);
    const t0 = Date.now();
    testing = setTimeout(function end() {
      if (Date.now() - t0 < ms && powerMonitor.getSystemIdleTime() >= 1) { testing = setTimeout(end, 300); return; }
      testing = null; hide();
    }, 800);
    return { real: screen.getAllDisplays().filter(d => real(d.id)).length, layered: screen.getAllDisplays().filter(d => !real(d.id)).length };
  }
  powerMonitor.on?.('lock-screen', () => { locked = true; hide(true); });
  powerMonitor.on?.('unlock-screen', () => { locked = false; });
  powerMonitor.on?.('suspend', () => hide(true));
  screen.on?.('display-removed', (_e, d) => { const w = wins.get(d.id); wins.delete(d.id); try { w?.destroy(); } catch {} });
  timer = setInterval(tick, every); timer.unref?.();
  return { tick, test, state: () => ({ shown, locked }),
    stop() { clearInterval(timer); clearTimeout(testing); brightness?.restoreSync?.(); for (const w of wins.values()) try { w.destroy(); } catch {} wins.clear(); } };
}

module.exports = { createDimmer };
