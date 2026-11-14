// Routine triggers beyond time (v1.6): run a routine when you join a Wi-Fi network, connect headphones, open an
// app, or unlock / wake your Mac. Everything is read on this Mac with built-in tools — nothing is sent anywhere.
//   trigger: { type: 'wifi' | 'headphones' | 'app' | 'unlock', value: '' (any) | name, cooldown: minutes }
// Only changes count: an app that was already open (or Wi-Fi you were already on) when Nexus started doesn't fire.
const { execFile } = require('child_process');

const TYPES = {
  wifi: { label: 'Joins Wi-Fi', any: 'any Wi-Fi network', placeholder: 'Network name (blank = any)' },
  headphones: { label: 'Headphones connect', any: 'any headphones', placeholder: 'e.g. AirPods (blank = any)' },
  app: { label: 'App opens', any: '', placeholder: 'App name, e.g. Xcode' },
  unlock: { label: 'Mac unlocks', any: 'unlock or wake', placeholder: '' }
};
const runDefault = (cmd, args, timeout = 8000) => new Promise(res => execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, out) => res(err ? '' : String(out))));
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADPHONE = /(headphone|airpods|buds|beats|earbud|earphone|bose|sony wh|sony wf|jabra|sennheiser|skullcandy|headset)/i;

function describeTrigger(t = {}) {
  const T = TYPES[t.type]; if (!T) return 'On a trigger';
  if (t.type === 'unlock') return 'When your Mac unlocks or wakes';
  if (t.type === 'app') return `When ${t.value || 'an app'} opens`;
  if (t.type === 'wifi') return t.value ? `When you join "${t.value}" Wi-Fi` : 'When you join Wi-Fi';
  return t.value ? `When ${t.value} connect` : 'When headphones connect';
}

// ---------- readers (macOS)
async function readWifi(run) {
  // networksetup works on older macOS; ipconfig getsummary on newer. Newer macOS may hide the name ("<redacted>")
  // unless Location Services is allowed — then we still see that *a* Wi-Fi network was joined.
  const a = await run('networksetup', ['-getairportnetwork', 'en0']);
  let m = a.match(/Current Wi-Fi Network:\s*(.+)/i);
  if (m) return { connected: true, ssid: m[1].trim() };
  const b = await run('ipconfig', ['getsummary', 'en0']);
  m = b.match(/^\s*SSID\s*:\s*(.+)$/m);
  if (m) return { connected: true, ssid: /redacted/i.test(m[1]) ? '' : m[1].trim(), hidden: /redacted/i.test(m[1]) };
  const connected = /link status.*active|IPv4.*\d+\.\d+/i.test(b) && /Wi-?Fi|AirPort|802\.11/i.test(b);
  return { connected, ssid: '' };
}
async function readAudio(run) {
  const out = await run('system_profiler', ['SPAudioDataType', '-json'], 12000);
  try {
    const j = JSON.parse(out);
    const items = (j.SPAudioDataType || []).flatMap(x => x._items || []);
    const outputs = items.filter(i => i.coreaudio_device_output || i.coreaudio_output_source);
    const def = outputs.find(i => i.coreaudio_default_audio_output_device === 'spaudio_yes') || null;
    const isHead = i => i && (HEADPHONE.test(i._name || '') || /bluetooth/i.test(i.coreaudio_device_transport || '') || /headphone/i.test(i.coreaudio_output_source || ''));
    return { output: def?._name || '', headphones: isHead(def), names: outputs.filter(isHead).map(i => i._name) };
  } catch { return { output: '', headphones: false, names: [] }; }
}
async function readApps(run) {
  const out = await run('ps', ['-axo', 'comm=']);
  const apps = new Set();
  for (const line of out.split('\n')) { const m = line.match(/\/([^/]+)\.app\/Contents\/MacOS\//); if (m) apps.add(m[1]); }
  return apps;
}

class TriggerWatcher {
  // deps: { list() → routines, fire(routine, why), run, platform, now, interval }
  constructor({ list, fire, run = runDefault, platform = process.platform, now = () => Date.now(), interval = 15000 }) {
    Object.assign(this, { list, fire, run, platform, now, interval });
    this.prev = { wifi: null, audio: null, apps: null };
    this.lastFired = new Map();
    this.timer = null; this.busy = false;
    this.status = { wifi: null, audio: null };
  }
  active(type) { return this.list().filter(r => r.enabled && r.trigger?.type === type); }
  needs() { const t = new Set(this.list().filter(r => r.enabled && r.trigger?.type).map(r => r.trigger.type)); return t; }
  start() { if (this.timer || this.platform !== 'darwin') return; this.timer = setInterval(() => this.poll(), this.interval); setTimeout(() => this.poll(), 3000); }
  stop() { clearInterval(this.timer); this.timer = null; }

  cooled(r) {
    const last = this.lastFired.get(r.id) || 0;
    const mins = Math.max(1, +r.trigger.cooldown || 60);
    return this.now() - last >= mins * 60e3;
  }
  maybeFire(r, why) {
    if (!this.cooled(r)) return false;
    this.lastFired.set(r.id, this.now());
    this.fire(r, why);
    return true;
  }

  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const need = this.needs();
      if (need.has('wifi')) {
        const w = await readWifi(this.run);
        const p = this.prev.wifi; this.prev.wifi = w; this.status.wifi = w;
        const joined = p && w.connected && (!p.connected || (w.ssid && p.ssid !== w.ssid));
        if (joined) for (const r of this.active('wifi')) {
          if (!r.trigger.value || (w.ssid && norm(w.ssid) === norm(r.trigger.value))) this.maybeFire(r, `joined ${w.ssid || 'Wi-Fi'}`);
        }
      } else this.prev.wifi = null;
      if (need.has('headphones')) {
        const a = await readAudio(this.run);
        const p = this.prev.audio; this.prev.audio = a; this.status.audio = a;
        const connected = p && a.headphones && (!p.headphones || p.output !== a.output);
        if (connected) for (const r of this.active('headphones')) {
          if (!r.trigger.value || norm(a.output).includes(norm(r.trigger.value))) this.maybeFire(r, `${a.output} connected`);
        }
      } else this.prev.audio = null;
      if (need.has('app')) {
        const apps = await readApps(this.run);
        const p = this.prev.apps; this.prev.apps = apps;
        if (p) {
          const opened = [...apps].filter(a => !p.has(a));
          for (const r of this.active('app')) {
            const hit = opened.find(a => norm(a) === norm(r.trigger.value) || (norm(r.trigger.value).length >= 3 && norm(a).includes(norm(r.trigger.value))));
            if (hit) this.maybeFire(r, `${hit} opened`);
          }
        }
      } else this.prev.apps = null;
    } finally { this.busy = false; }
  }
  // From powerMonitor (unlock-screen / resume)
  unlocked(why = 'unlocked') { for (const r of this.active('unlock')) this.maybeFire(r, why); }
}

module.exports = { TriggerWatcher, TYPES, describeTrigger, readWifi, readAudio, readApps };
