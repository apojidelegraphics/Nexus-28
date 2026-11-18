// Keep this Mac awake (v3.3.1, shared by Nexus '28 and Apoji Admin; keep the two copies the same).
//
//   • Keep awake: macOS's own `caffeinate` (no idle or system sleep), tied to this app, so it ends if the app quits.
//     Optionally keeps the screen on too (it still dims when you're away: see dimmer.js). Works on battery as well,
//     down to 20%; "Only while plugged in" lets it sleep on battery instead.
//   • Lid-closed mode: closing a MacBook's lid normally sleeps it. With this on, the Mac stays awake with the lid
//     shut: the built-in screen goes dark and the Mac LOCKS as usual (3.3.1 makes sure of it); the phone link, hub and schedules keep
//     running. macOS only allows this through `pmset disablesleep`, which needs an administrator, so turning it on
//     asks for your Mac password once and adds one narrow rule (/etc/sudoers.d/apoji-lidmode) that lets this user run
//     exactly `pmset -a disablesleep 0` and `pmset -a disablesleep 1`, nothing else. After that it switches on and
//     off by itself: on battery too (never below 20%) unless "Only while plugged in" is on, and back off when the app quits.
//     "Remove permission" deletes the rule again (one more password prompt).
//   Nexus and Apoji Admin share one list of apps that want lid-closed mode, so one quitting doesn't switch it off
//   for the other.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const RULE = '/etc/sudoers.d/apoji-lidmode';
const PMSET = '/usr/bin/pmset';
const SHARED = path.join(os.homedir(), 'Library', 'Application Support', 'Apoji', 'lidmode.json');
const LOW_BATTERY = 20;

function createAwake({ app = 'nexus', getCfg, onChange = () => {}, power = null, platform = process.platform, exec = cp.execFile, spawn = cp.spawn, guardSpawn = cp.spawn, shared = SHARED, hasRule = () => fs.existsSync(RULE), pid = process.pid, alive = p => { try { process.kill(p, 0); return true; } catch (e) { return e.code === 'EPERM'; } }, log = () => {} } = {}) {
  const mac = platform === 'darwin';
  let caf = null, cafArgs = '', state = { on: false, lid: { on: false, ready: false, closed: false, error: '' }, reason: '', battery: null, onBattery: false };
  const run = (cmd, args, timeout = 8000) => new Promise((res, rej) => exec(cmd, args, { timeout }, (e, out, err) => e ? rej(Object.assign(e, { stderr: String(err || '') })) : res(String(out || ''))));

  // ---------- caffeinate
  function stopCaf() { const c = caf; caf = null; cafArgs = ''; try { c?.removeAllListeners('exit'); c?.kill(); } catch {} }
  function startCaf(display) {
    // -d keeps the screen from sleeping; no -u, so macOS (and our dimmer) can still dim it when you're away
    const args = ['-i', '-m', '-s', ...(display ? ['-d'] : []), '-w', String(process.pid)];
    if (caf && cafArgs === args.join(' ')) return;
    stopCaf();
    if (!mac) return;
    try {
      cafArgs = args.join(' ');
      caf = spawn('/usr/bin/caffeinate', args, { stdio: 'ignore' });
      caf.on('exit', () => { caf = null; cafArgs = ''; setTimeout(() => apply(), 1000); });
      caf.on('error', () => { caf = null; });
    } catch { caf = null; }
  }

  // ---------- power
  async function battery() {
    if (!mac) return { onBattery: false, percent: null };
    try { const out = await run(PMSET, ['-g', 'batt']); return { onBattery: /'Battery Power'/.test(out), percent: +(out.match(/(\d+)%/) || [])[1] || null }; }
    catch { return { onBattery: !!power?.isOnBatteryPower?.(), percent: null }; }
  }
  const lidClosed = async () => { if (!mac) return false; try { return /"AppleClamshellState" = Yes/.test(await run('/usr/sbin/ioreg', ['-r', '-k', 'AppleClamshellState', '-d', '4'])); } catch { return false; } };

  // ---------- lid-closed mode (pmset disablesleep through the narrow sudo rule)
  const ruleReady = () => { try { return !!hasRule(); } catch { return false; } };
  const sudoPmset = v => run('/usr/bin/sudo', ['-n', PMSET, '-a', 'disablesleep', v ? '1' : '0']);
  async function sleepDisabled() { try { return /SleepDisabled\s+1/.test(await run(PMSET, ['-g'])); } catch { return false; } }
  // v3.3.1: owners are { app, pid } and only count while that process is still running, so an app that crashed or
  // was force-quit can't leave lid-closed mode stuck on (old plain-name entries from 3.2/3.3 are ignored).
  function owners() {
    let list = []; try { list = JSON.parse(fs.readFileSync(shared, 'utf8')).owners || []; } catch {}
    return list.filter(o => o && typeof o === 'object' && +o.pid > 0 && alive(+o.pid));
  }
  function setOwner(want) {
    const list = owners().filter(o => o.app !== app && o.pid !== pid);
    if (want) list.push({ app, pid });
    try { fs.mkdirSync(path.dirname(shared), { recursive: true }); fs.writeFileSync(shared, JSON.stringify({ owners: list, at: Date.now() })); } catch {}
    return list.length;
  }
  // A tiny watcher started once when lid-closed mode switches on: it waits for this app's process to end (however it
  // ends, even a crash), then switches lid-closed mode off unless another app that wants it is still running.
  let guarded = false;
  function guard() {
    if (guarded || !mac) return; guarded = true;
    const f = shared.replace(/'/g, "'\\''");
    const sh = `P=${pid}; while kill -0 $P 2>/dev/null; do sleep 3; done; sleep 1; for q in $(grep -o '"pid":[0-9]*' '${f}' 2>/dev/null | cut -d: -f2); do [ "$q" != "$P" ] && kill -0 $q 2>/dev/null && exit 0; done; /usr/bin/sudo -n ${PMSET} -a disablesleep 0`;
    try { const g = guardSpawn('/bin/sh', ['-c', sh], { detached: true, stdio: 'ignore' }); g?.unref?.(); } catch { guarded = false; }
  }
  // One password prompt: write the rule (checked with visudo first) and switch it on.
  async function grant() {
    if (!mac) throw new Error('Only on a Mac.');
    const user = os.userInfo().username;
    if (!/^[a-z0-9_.-]+$/i.test(user)) throw new Error('Unusual user name; set it up by hand instead.');
    const line = `${user} ALL=(root) NOPASSWD: ${PMSET} -a disablesleep 0, ${PMSET} -a disablesleep 1`;
    const tmp = path.join(os.tmpdir(), `apoji-lidmode-${process.pid}`);
    fs.writeFileSync(tmp, line + '\n', { mode: 0o600 });
    const sh = `/usr/sbin/visudo -cf '${tmp}' && /usr/bin/install -m 0440 -o root -g wheel '${tmp}' '${RULE}' && ${PMSET} -a disablesleep 1`;
    try { await run('/usr/bin/osascript', ['-e', `do shell script "${sh}" with administrator privileges with prompt "Allow ${app === 'admin' ? 'Apoji Admin' : "Nexus '28"} to keep this Mac awake with the lid closed?"`], 120000); }
    catch (e) { throw new Error(/-128|cancel/i.test(e.stderr + e.message) ? 'Cancelled.' : 'macOS said no: ' + String(e.stderr || e.message).slice(0, 160)); }
    finally { try { fs.unlinkSync(tmp); } catch {} }
  }
  async function revoke() {
    if (!mac) return;
    setOwner(false);
    try { await run('/usr/bin/osascript', ['-e', `do shell script "${PMSET} -a disablesleep 0; /bin/rm -f '${RULE}'" with administrator privileges`], 120000); }
    catch (e) { throw new Error(/-128|cancel/i.test(e.stderr + e.message) ? 'Cancelled.' : String(e.stderr || e.message).slice(0, 160)); }
  }

  // v3.3.1: closing the lid always locks. With "keep the screen on" also on, macOS may not count a closed lid as the
  // screen going to sleep, so it wouldn't lock; we watch the lid and put the screen to sleep ourselves when it closes.
  let lidTimer = null, wasClosed = null;
  function watchLid(on) {
    if (!on || !mac) { clearInterval(lidTimer); lidTimer = null; wasClosed = null; return; }
    if (lidTimer) return;
    lidTimer = setInterval(async () => {
      const closed = await lidClosed();
      if (closed && wasClosed === false) run(PMSET, ['displaysleepnow']).catch(() => {});
      wasClosed = closed;
    }, 4000);
    lidTimer.unref?.();
  }

  // ---------- apply the settings
  let busy = Promise.resolve();
  function apply() { busy = busy.then(applyNow, applyNow); return busy; }
  async function applyNow() {
    const c = getCfg() || {};
    const b = await battery();
    const lowBat = b.onBattery && b.percent != null && b.percent < LOW_BATTERY;
    const plugOnly = c.pluggedOnly === true;
    const wantAwake = !!c.keepAwake && !(plugOnly && b.onBattery) && !lowBat;
    if (wantAwake) startCaf(!!c.keepDisplay); else stopCaf();
    // lid-closed mode: on battery too unless "Only while plugged in", never on low battery
    const lid = { on: false, ready: ruleReady(), closed: await lidClosed(), error: '' };
    const wantLid = !!c.lidMode && !(plugOnly && b.onBattery) && !lowBat;
    if (mac && lid.ready) {
      // Every check also cleans up: if nobody running wants lid-closed mode but it's still on (an app crashed or was
      // force-quit earlier), it's switched off here.
      try {
        const others = setOwner(wantLid);
        watchLid(wantLid);
        if (wantLid) { await sudoPmset(true); guard(); }
        else if (!others && await sleepDisabled()) await sudoPmset(false);
        lid.on = wantLid && await sleepDisabled();
      } catch (e) { if (c.lidMode) lid.error = "Couldn't switch it: " + String(e.stderr || e.message).slice(0, 120); }
    }
    const on = wantAwake && caf != null;
    state = { on, battery: b.percent, onBattery: b.onBattery, lid,
      short: !c.keepAwake ? 'Can sleep' : on ? (c.keepDisplay ? 'Awake, screen on' : 'Awake') + (b.onBattery ? ' (battery)' : '') : lowBat ? `Battery under ${LOW_BATTERY}%: can sleep` : b.onBattery ? 'On battery: can sleep' : 'Not awake',
      reason: !c.keepAwake ? 'Keep awake is off.' : on ? (c.keepDisplay ? 'Staying awake with the screen on (it dims when you step away).' : 'Staying awake (the screen can turn off).') + (b.onBattery ? ` On battery: it lets go below ${LOW_BATTERY}%.` : '') : lowBat ? `Battery is below ${LOW_BATTERY}%, so this Mac can sleep to save it.` : b.onBattery ? 'On battery, so this Mac can sleep. Turn off “Only while plugged in” to keep it awake on battery.' : "Couldn't keep this Mac awake.",
      lidText: !c.lidMode ? '' : !lid.ready ? 'Needs your permission once (Turn on).' : lid.error || (lid.on ? (lid.closed ? 'Lid closed: awake, screen off, locked.' : 'On: closing the lid keeps this Mac awake (screen off, still locked).') : lowBat ? `Paused: battery below ${LOW_BATTERY}%.` : b.onBattery ? 'Paused on battery (“Only while plugged in” is on).' : 'Off.') };
    onChange(state);
    return state;
  }
  // When the app quits: stop caffeinate, and switch lid-closed mode off unless the other app still wants it
  function quit() {
    stopCaf(); watchLid(false);
    try { if (mac && ruleReady() && !setOwner(false)) cp.execFileSync('/usr/bin/sudo', ['-n', PMSET, '-a', 'disablesleep', '0'], { timeout: 4000 }); } catch {}
  }
  if (power?.on) { for (const ev of ['on-ac', 'on-battery', 'resume']) power.on(ev, () => apply()); }
  const timer = mac ? setInterval(() => { if ((getCfg() || {}).lidMode || (getCfg() || {}).keepAwake) apply(); }, 120e3) : null;
  timer?.unref?.();
  return { apply, grant, revoke, quit, state: () => state, ruleReady, _internals: { owners, setOwner } };
}

module.exports = { createAwake, RULE, LOW_BATTERY };
