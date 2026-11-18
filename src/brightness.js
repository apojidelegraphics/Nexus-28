// Real display brightness for the screen dimmer (v3.4, shared by Nexus '28 and Apoji Admin; keep the two copies the same).
//
// Talks to bin/apoji-brightness (native/Brightness.swift). On start the app runs `check` once to see which screens
// can really be dimmed; those get their backlight lowered, the rest keep the dark see-through layer.
// Before dimming, each screen's brightness is saved to a small file. Coming back puts it back (unless you changed it
// yourself meanwhile), and if the app quits or crashes while dimmed, the next start restores it.
// Windows (Apoji Admin 2.0.4): a laptop's built-in screen is dimmed through Windows' own brightness control (WMI, via
// PowerShell); `winInternal()` gives the app's ids for the built-in screens. Other screens keep the dark layer.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PS = 'powershell.exe', PSARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];
const WMI = "-Namespace root/WMI -ClassName";
const psGet = `$b = (Get-CimInstance ${WMI} WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness; Write-Output ('{"pct":' + [int]$b + '}')`;
const psSet = pct => `Get-CimInstance ${WMI} WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1 | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]${Math.round(Math.max(0, Math.min(100, pct)))} } | Out-Null; Write-Output '{"ok":true}'`;

function createBrightness({ bin, stateFile, platform = process.platform, exec = cp.execFile, exists = f => fs.existsSync(f), winInternal = () => [], log = () => {} } = {}) {
  const mac = platform === 'darwin', win = platform === 'win32';
  let status = { checked: false, ok: false, displays: [], error: mac || win ? '' : 'Only on a Mac or a Windows PC.', at: 0 };
  let saved = null;          // { [id]: { orig, set } } while dimmed
  const call = (cmd, args) => new Promise((res, rej) => exec(cmd, args, { timeout: win ? 9000 : 5000, windowsHide: true }, (e, out) => {
    let j = null; try { j = JSON.parse(String(out || '').trim().split('\n').pop()); } catch {}
    if (e || !j || j.error) return rej(new Error(j?.error || e?.message || 'no answer'));
    res(j);
  }));
  // Windows: the same three commands (check / get / set), answered by WMI (one built-in screen, 0–100)
  const run = !win ? args => call(bin, args) : async ([c, id, v]) => {
    if (c === 'check') { const g = await call(PS, [...PSARGS, psGet]); return (winInternal() || []).map(i => ({ id: i, builtin: true, supported: true, value: g.pct / 100 })); }
    if (c === 'get') return { id: +id, value: (await call(PS, [...PSARGS, psGet])).pct / 100 };
    if (c === 'set') { await call(PS, [...PSARGS, psSet(+v * 100)]); return { id: +id, value: +v }; }
    throw new Error('unknown');
  };
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return null; } };
  const writeState = s => { try { if (s) fs.writeFileSync(stateFile, JSON.stringify(s)); else fs.unlinkSync(stateFile); } catch {} };

  // Run once on start: can this Mac's screens be dimmed for real? (also puts back anything left dimmed by a crash)
  async function check() {
    if (!mac && !win) return status;
    if (mac && (!bin || !exists(bin))) { status = { checked: true, ok: false, displays: [], error: "The brightness helper isn't built on this Mac, so dimming uses a dark layer.", at: Date.now() }; return status; }
    await recover();
    try {
      const list = await run(['check']);
      const displays = (Array.isArray(list) ? list : []).map(d => ({ id: +d.id, builtin: !!d.builtin, supported: !!d.supported, value: d.value ?? null }));
      status = { checked: true, ok: displays.some(d => d.supported), displays, error: displays.some(d => d.supported) ? '' : 'None of your screens let apps change their brightness, so dimming uses a dark layer.', at: Date.now() };
    } catch (e) {
      if (win) { status = { checked: true, ok: false, displays: [], error: "This PC's screen doesn't let apps change its brightness (common on desktop monitors), so dimming uses a dark layer.", at: Date.now() }; return status; } status = { checked: true, ok: false, displays: [], error: 'Brightness check failed: ' + e.message.slice(0, 120), at: Date.now() }; }
    log('brightness', JSON.stringify(status));
    return status;
  }
  const supported = id => status.displays.some(d => d.id === +id && d.supported);

  // level = how much to dim (0.45 → the screen at 55% of where you had it, 1 → backlight off)
  async function dim(ids, level) {
    const list = ids.filter(supported); if (!list.length) return [];
    saved = saved || readState() || {};
    const done = [];
    for (const id of list) {
      try {
        if (!saved[id]) { const g = await run(['get', String(id)]); saved[id] = { orig: g.value }; }
        const target = Math.max(0, Math.min(1, saved[id].orig * (1 - level)));
        const from = saved[id].set ?? saved[id].orig;
        for (let i = win ? 5 : 1; i <= 5; i++) await run(['set', String(id), String(from + (target - from) * i / 5)]);   // a short fade
        saved[id].set = target; done.push(id);
      } catch (e) { log('brightness dim', id, e.message); }
    }
    writeState(saved);
    return done;
  }
  async function restore() {
    const s = saved || readState(); saved = null; if (!s) return;
    for (const [id, v] of Object.entries(s)) {
      try {
        const now = (await run(['get', id])).value;
        if (v.set == null || Math.abs(now - v.set) < 0.03) await run(['set', id, String(v.orig)]);   // you didn't change it yourself meanwhile
      } catch (e) { log('brightness restore', id, e.message); }
    }
    writeState(null);
  }
  async function recover() { if (readState()) await restore(); }
  // Quitting: put it back right away (synchronously, the app is going away)
  function restoreSync() {
    const s = saved || readState(); if (!s || (!mac && !win)) return;
    for (const [id, v] of Object.entries(s)) { try { if (win) cp.execFileSync(PS, [...PSARGS, psSet(v.orig * 100)], { timeout: 4000, windowsHide: true }); else cp.execFileSync(bin, ['set', id, String(v.orig)], { timeout: 2000 }); } catch {} }
    saved = null; writeState(null);
  }
  return { check, dim, restore, restoreSync, recover, supported, status: () => status, dimmed: () => !!saved };
}

function helperPath({ app, dir }) {
  if (process.platform === 'win32') return null;   // Windows needs no helper (WMI)
  return app?.isPackaged ? path.join(process.resourcesPath, 'bin', 'apoji-brightness') : path.join(dir, 'bin', 'apoji-brightness');
}

module.exports = { createBrightness, helperPath };
