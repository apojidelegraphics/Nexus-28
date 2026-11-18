// Screen dimmer (v3.3.2, shared by Nexus '28 and Apoji Admin; keep the two copies the same).
//
// When "Keep the screen on" is in use, macOS no longer dims the screen by itself. This brings that back: after you've
// been away for a while (no mouse or keyboard), every screen fades to dark behind a see-through layer that ignores
// clicks, so the screen stays on but isn't bright. Touch the mouse or a key and it goes away. It never shows over the
// lock screen and never takes focus.
function createDimmer({ BrowserWindow, screen, powerMonitor, getCfg, isAwake = () => true, every = 1000 } = {}) {
  const wins = new Map();
  let shown = false, locked = false, timer = null;
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
  function show() {
    const { level } = cfg();
    for (const d of screen.getAllDisplays()) {
      let w = wins.get(d.id);
      if (!w || w.isDestroyed()) { w = make(d, level); wins.set(d.id, w); }
      w._level = level; w.setBounds(d.bounds); w.showInactive(); fade(w, level, 1500);
    }
    shown = true;
  }
  function hide(now = false) {
    for (const w of wins.values()) { if (w.isDestroyed()) continue; if (now) { clearInterval(w._fade); w.setOpacity(0); w.hide(); } else fade(w, 0, 250); }
    shown = false;
  }
  function tick() {
    const { want, after } = cfg();
    const idle = powerMonitor.getSystemIdleTime();
    const { level } = cfg();
    const should = want && level > 0 && !locked && isAwake() && idle >= after;
    if (should && shown) for (const w of wins.values()) if (!w.isDestroyed() && w._level !== level) { w._level = level; fade(w, level, 400); }   // slider moved while dim
    if (should && !shown) show();
    else if (!should && shown) hide(idle < 2 || locked);
  }
  powerMonitor.on?.('lock-screen', () => { locked = true; hide(true); });
  powerMonitor.on?.('unlock-screen', () => { locked = false; });
  powerMonitor.on?.('suspend', () => hide(true));
  screen.on?.('display-removed', (_e, d) => { const w = wins.get(d.id); wins.delete(d.id); try { w?.destroy(); } catch {} });
  timer = setInterval(tick, every); timer.unref?.();
  return { tick, state: () => ({ shown, locked }), stop() { clearInterval(timer); for (const w of wins.values()) try { w.destroy(); } catch {} wins.clear(); } };
}

module.exports = { createDimmer };
