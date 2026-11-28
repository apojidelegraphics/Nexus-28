// Nexus Desktop — main process: menu bar, chat HUD, Quick Ask orb, Quick Chat, hotkeys, agent + voice IPC.
const { app, BrowserWindow, Tray, Menu, Notification, globalShortcut, ipcMain, nativeImage, screen, shell, session, systemPreferences, desktopCapturer, dialog, powerMonitor, clipboard } = require('electron');
const path = require('path');
// 3.5 Windows: every helper command (PowerShell, reg, netsh…) runs without flashing a console window
if (process.platform === 'win32') {
  const cp = require('child_process');
  for (const fn of ['spawn', 'execFile', 'exec', 'execFileSync', 'execSync', 'spawnSync']) {
    const orig = cp[fn];
    cp[fn] = function (...a) { const i = a.findIndex((x, k) => k > 0 && x && typeof x === 'object' && !Array.isArray(x)); if (i > 0) { if (a[i].windowsHide === undefined) a[i] = { ...a[i], windowsHide: true }; } else { const at = Array.isArray(a[1]) ? 2 : 1; if (typeof a[at] !== 'function') a.splice(at, 0, { windowsHide: true }); else a.splice(at, 0, { windowsHide: true }); } return orig.apply(this, a); };
  }
}
const { execFileSync } = require('child_process');
const store = require('./src/store');
const providers = require('./src/providers');
const voice = require('./src/voice');
const tools = require('./src/tools');
const web = require('./src/web');
const { runAgent } = require('./src/agent');
const { McpManager, PRESETS } = require('./src/mcp');
const { Conversations } = require('./src/conversations');
const { NexusCloud } = require('./src/cloud');
const { PERSONAS, systemPromptFor, buildLegacy } = require('./src/personas');
const guide = require('./src/guide');   // 3.11 the built-in Nexus guide
const features = require('./src/features');
const access = require('./src/access');
const updater = require('./src/updater');
const { Attachments } = require('./src/attachments');
const { createScreen } = require('./src/screen');
const quickcalc = require('./src/quickcalc');
const exporter = require('./src/exporter');
const chatsearch = require('./src/chatsearch');
const { Routines } = require('./src/routines');
const schedule = require('./src/schedule');
const brief = require('./src/brief');
const weatherApi = require('./src/weather');
const spotify = require('./src/spotify').createSpotify({ getKey: k => store.getKey(k), setKey: (k, v) => store.setKey(k, v), openExternal: u => shell.openExternal(u) });
const { Metrics, ACHIEVEMENTS } = require('./src/metrics');
const { Missions } = require('./src/missions');
const { createMac } = require('./src/macactions');
const { createClipHistory } = require('./src/cliphistory');
const watchMode = require('./src/watch');
const featurekit = require('./src/featurekit');
const { createGroup } = require('./src/groupchat');
const { Study, cardsFromText } = require('./src/study');
const { TriggerWatcher, describeTrigger } = require('./src/triggers');
const missionTemplates = require('./src/missiontemplates');
const missionReport = require('./src/missionreport');
const flagsLib = require('./src/flags');
const citations = require('./src/citations');
const { Relay } = require('./src/relay');
const { Direct } = require('./src/direct');
const { Apex } = require('./src/apex');
const axiomMod = require('./src/axiom');
const { Rollback } = require('./src/rollback');
const { Operations } = require('./src/operations');
const { Memory } = require('./src/memory');
const axiomTools = require('./src/axiomtools');
// The Nexus owner: the account in apex_unlimited (only changeable from the Supabase SQL editor)
const axiomOwner = () => !!apex?.meter()?.unlimited;
const runCmd = (cmd, args, { timeout = 15000, cwd } = {}) => new Promise((resolve, reject) => require('child_process').execFile(cmd, args, { timeout, cwd, maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => err ? reject(new Error(String(errOut || err.message).trim().slice(0, 400))) : resolve(String(out))));
const recapMod = require('./src/recap');
const latticeMod = require('./src/lattice'), luminaMod = require('./src/lumina');   // 4.4.0 Solis
const autosort = require('./src/autosort');
const { createTailnet } = require('./src/tailnet');
const { Companion, phoneTheme } = require('./src/companion');
const maint = require('./src/maintenance');
const { Push } = require('./src/push');
const { SharedSpaces } = require('./src/sharedspaces');
const projects = require('./src/projects');
const { Focus } = require('./src/focus');
const meeting = require('./src/meeting');
const writer = require('./src/writer');
const studyplan = require('./src/studyplan');
let docs = null;
const wrapped = require('./src/wrapped');
const GITHUB_REPO = 'apojidelegraphics/Nexus-28';
// Where the phone companion lives (GitHub Pages from /docs in the repo).
const COMPANION_URL = 'https://apojidelegraphics.github.io/Nexus-28/companion/';

// The packaged app is "Nexus '28"; keep the internal name "Nexus" so settings, chats and
// Keychain-encrypted keys from earlier versions stay readable.
app.setName('Nexus');
if (!process.env.NEXUS_KEEP_USERDATA) app.setPath('userData', path.join(app.getPath('appData'), 'Nexus'));

// ---------------- Diagnostics: ~/Library/Logs/Nexus/main.log
const fsLog = require('fs'), fs = fsLog;   // 4.0.6: video processing used fs without it (videos with sound failed)
let logPath = null;
function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.map(p => (p instanceof Error ? p.stack : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`;
  try {
    if (!logPath) { const dir = app.getPath('logs'); fsLog.mkdirSync(dir, { recursive: true }); logPath = path.join(dir, 'main.log'); }
    fsLog.appendFileSync(logPath, line);
  } catch {}
  if (!app.isPackaged) process.stdout.write(line);
}
process.on('uncaughtException', e => log('uncaughtException', e));
process.on('unhandledRejection', e => log('unhandledRejection', e));
// If the GPU process keeps crashing (it can after re-signing), fall back to software rendering next launch.
const gpuFlag = path.join(app.getPath('userData'), 'disable-gpu');
if (process.env.NEXUS_DISABLE_GPU || fsLog.existsSync(gpuFlag)) { app.disableHardwareAcceleration(); log('hardware acceleration disabled'); }
let gpuCrashes = 0;
app.on('child-process-gone', (_e, d) => {
  log('child-process-gone', d);
  if (d.type === 'GPU' && ++gpuCrashes >= 2) { try { fsLog.writeFileSync(gpuFlag, '1'); } catch {} }
});
log('starting', { version: app.getVersion(), packaged: app.isPackaged, electron: process.versions.electron, exe: process.execPath });

let tray = null, hud = null, quick = null, quickChat = null;
const hotkeys = { toggle: null, quick: null, quickChat: null, screen: null, explain: null, jot: null };
let escRegistered = false, enterRegistered = false;
const inflight = new Map();       // requestId -> AbortController
const listeners = new Map();      // speech session id -> webContents
const pendingConfirms = new Map(); // callId -> { resolve, requestId }
let convos = null;
let cloud = null, statSync = null;
// 3.8: training data for Nexus models (beta testers agree to share; src/training.js). Uses `cloud` once it exists.
const training = require('./src/training').createTraining({ cloud: { get session() { return cloud?.session; }, rpc: (...a) => cloud.rpc(...a), write: (...a) => cloud.write(...a) }, log: (...a) => log(...a) });
let attachments = null, screenAware = null, routines = null, metrics = null, missions = null, mac = null, clipHist = null, watcher = null, study = null, triggers = null, citeStore = null, relay = null, companion = null, push = null, shared = null, direct = null;
let screenLocked = false;

// Core agents (prompt + features from Nexus cloud when synced) + legacy models from Supabase.
// v2.4 Apex: Axiom only exists for accounts Supabase allows right now; its prompt comes from there too.
let apex = null, axiomData = null, rollback = null, ops = null, memory = null, clipOrb = null;
const apexOn = () => !!apex?.visible();
function allPersonas() {
  const core = PERSONAS.filter(p => !p.apex || apexOn()).map(p => {
    const c = p.apex ? null : cloud?.prompts[p.id];
    const feats = [...new Set([...features.canonical(c?.features?.length ? c.features : p.features), ...features.universal(flagOn), ...features.customFor(p.id)])];
    return { ...p, prompt: p.apex ? apex.prompt() : c?.prompt || p.prompt, features: p.apex ? feats : feats.filter(f => !features.APEX.has(f)) };
  });
  // v2.10: Paragon gets every agent's @features; Axiom gets all of Paragon's plus its own Apex ones
  const every = [...new Set(core.filter(p => !p.apex).flatMap(p => p.features))];
  for (const p of core) {
    if (p.id === 'paragon') p.features = every;
    if (p.id === 'axiom') p.features = [...new Set([...p.features, ...every])];
  }
  const legacy = buildLegacy(cloud?.legacy || [], core.map(p => p.handle)).map(p => ({ ...p, features: [...new Set([...features.canonical(p.features), ...features.universal(flagOn), ...features.customFor(p.id)])] }));
  return [...core, ...releasePersonas(core), ...customPersonas(core), ...legacy];
}
// 3.11 New models: the Apoji Team adds one in Apoji Admin (name, prompt, @features) and it shows up here, running on a base
// agent's model, key and free-key allowance. Kept locally so it works offline too.
function releaseRows() { return (cloud?.releases?.length ? cloud.releases : store.getSettings().releaseCache || []).filter(r => r && r.id && r.stage !== 'off'); }
function releasePersonas(core) {
  const taken = new Set(core.map(p => p.handle));
  return releaseRows().filter(r => !taken.has(r.id)).map(r => {
    const base = core.find(p => p.id === r.base) || core.find(p => p.id === 'lyte') || core[0];
    return { id: 'new:' + r.id, handle: r.id, name: r.name, tag: r.tagline || `New · on ${base.handle}`, agentic: false, release: true, isNew: Date.now() - Date.parse(r.released_at || 0) < 14 * 864e5,
      base: base.id, color: r.color || base.color, features: [...new Set([...features.canonical(r.features || []), ...features.universal(flagOn)])], defaultBinding: base.defaultBinding,
      about: r.about || '', stage: r.stage, prompt: r.prompt };
  });
}
async function syncReleases() {
  if (!cloud) return;
  const before = JSON.stringify(store.getSettings().releaseCache || []);
  const rows = await cloud.agentReleases();
  const keep = rows.map(({ id, name, prompt, features: f, base, color, tagline, about, stage, released_at }) => ({ id, name, prompt, features: f, base, color, tagline, about, stage, released_at }));
  if (JSON.stringify(keep) !== before) { store.setSettings({ releaseCache: keep }); broadcast('personas:changed', publicPersonas()); }
  // the first time a model shows up on this computer: a "New model" pop-up (not for people who just installed Nexus)
  const s = store.getSettings(), seen = new Set(s.seenReleases || []);
  const fresh = keep.filter(r => !seen.has(r.id));
  if (!fresh.length) return;
  store.setSettings({ seenReleases: [...seen, ...fresh.map(r => r.id)].slice(-200) });
  const show = s.seenReleases ? fresh : fresh.filter(r => Date.now() - Date.parse(r.released_at || 0) < 7 * 864e5);
  if (!show.length) return;
  const list = show.map(r => ({ id: 'new:' + r.id, handle: r.id, name: r.name, tagline: r.tagline || '', about: r.about || '', color: r.color, features: r.features || [], base: r.base, stage: r.stage }));
  broadcast('releases:new', list);
  notify(list.length === 1 ? `New model: ${list[0].name}` : `${list.length} new models`, list.length === 1 ? (list[0].tagline || `Say @${list[0].handle} to try it.`) : list.map(r => r.name).join(', '));
}
// Agent Builder (v2.1): your own agents. Each runs on a base agent's model, key and free-chat allowance, with its own
// name, @handle, color, instructions, @features and voice. Shared with a 6-letter code (public.shared_agents).
const CUSTOM_BASES = ['flash', 'lyte', 'neodela'];
function customPersonas(core) {
  return (store.getSettings().customAgents || []).map(a => {
    const base = core.find(p => p.id === a.base) || core.find(p => p.id === 'flash');
    return { id: a.id, handle: a.handle, name: a.name, tag: `Custom · on ${base.handle}`, agentic: false, custom: true, base: base.id, color: a.color, emoji: a.emoji || '',
      features: [...new Set([...features.canonical(a.features || []), ...features.universal(flagOn)])], defaultBinding: base.defaultBinding,
      prompt: `You are ${a.name} (@${a.handle}), a custom AI agent the user built in Nexus '28. Follow these instructions from the user:\n\n${a.prompt}\n\nStay in character as ${a.name}. Be helpful, honest and safe.` };
  });
}
function cleanCustomAgent(a = {}, others = []) {
  const name = String(a.name || '').trim().slice(0, 24);
  if (!name) throw new Error('Give your agent a name.');
  const handle = String(a.handle || name).toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^[^a-z]+/, '').slice(0, 16);
  if (handle.length < 2) throw new Error('The @handle needs at least 2 letters.');
  const taken = new Set([...allPersonas().filter(p => p.id !== a.id).map(p => p.handle), ...others, 'huddle', 'debate', 'everyone', 'all']);
  if (taken.has(handle)) throw new Error(`@${handle} is already taken. Pick another handle.`);
  const prompt = String(a.prompt || '').trim().slice(0, 4000);
  if (prompt.length < 10) throw new Error('Tell your agent how to act (a sentence or two at least).');
  return { id: /^my-[a-z0-9]{4,14}$/.test(a.id || '') ? a.id : 'my-' + Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5),
    name, handle, color: /^#[0-9a-f]{6}$/i.test(a.color || '') ? a.color : '#ff9bd2', emoji: String(a.emoji || '').slice(0, 4),
    base: CUSTOM_BASES.includes(a.base) ? a.base : 'flash', prompt, features: features.canonical(Array.isArray(a.features) ? a.features : []).slice(0, 20), created: a.created || Date.now(),
    ...(/^[A-Z0-9]{6}$/.test(a.from || '') ? { from: a.from } : {}) };
}
// ---------- Beta channel: which features are on for this person (admins → beta testers → everyone)
function flagState() {
  const s = store.getSettings(), acc = cloud?.account() || {};
  // 3.8: beta testers share chats for training; until they agree, beta features pause (admins aren't affected)
  const gated = training.betaGate(acc);
  const st = flagsLib.resolve({ remote: cloud?.flags || [], account: gated ? { ...acc, beta: false } : acc, preview: s.beta?.preview || '', optOut: s.beta?.optOut || [], version: app.getVersion(), platform: WIN ? 'windows' : process.platform === 'darwin' ? 'mac' : '', grants: [...(cloud?.extras?.grants || []), ...(process.env.NEXUS_HELPER && process.env.NEXUS_TEST_GRANTS ? process.env.NEXUS_TEST_GRANTS.split(',') : [])], bucket: cloud?.session?.user?.id || replayDevice() });   // test runs can switch a feature on; 4.2.0 bucket = who's in an A/B split
  return { ...st, training: training.state(), trainingNeeded: gated };
}
function flagOn(key) { try { return flagsLib.isOn(flagState(), key); } catch { return !!flagsLib.DEFAULTS[key] && flagsLib.DEFAULTS[key].stage === 'all'; } }
// ---------- Access: free Nexus key, tiers, chat limits, redeemed orders
const freeModels = require('./src/freemodels');
const FREE_MODEL = freeModels.ROUTER;
let freeModelCache = null; // fetched list of free OpenRouter models (this session)
const usageFile = () => path.join(store.dir(), 'usage.json');
function localUsage() { try { return JSON.parse(require('fs').readFileSync(usageFile(), 'utf8')); } catch { return {}; } }
function bindingFor(persona, s) {
  if (persona.base && !s.bindings[persona.id]?.provider) return bindingFor(allPersonas().find(p => p.id === persona.base) || { id: persona.base, defaultBinding: persona.defaultBinding }, s);
  return (s.bindings[persona.id]?.provider ? s.bindings[persona.id] : null) || (persona.legacy ? s.legacyBinding : persona.defaultBinding) || { provider: 'openrouter', model: '' };
}
function usedFor(persona) {
  const name = access.usageName(persona, cloud.prompts);
  return cloud.session ? cloud.usageFor(name) : (localUsage()[name] || 0);
}
async function recordUsage(persona) {
  const name = access.usageName(persona, cloud.prompts);
  if (cloud.session) return cloud.incrementUsage(name);
  const u = localUsage(); u[name] = (u[name] || 0) + 1;
  try { require('fs').writeFileSync(usageFile(), JSON.stringify(u)); } catch {}
  return u[name];
}
function accessDecision(persona, binding, s, all = allPersonas()) {
  const prov = providers.PROVIDERS[binding.provider] || { needsKey: true, label: binding.provider };
  return access.decide({
    persona, provider: prov, hasOwnKey: !!store.getKey(binding.provider), freeKeyEnabled: s.freeKey?.enabled !== false,
    comped: !!cloud.profile?.comped, unlocked: access.unlockedBy(cloud.extras?.orders, all).has(persona.base || persona.id), used: usedFor(persona),
    premium: cloud.session ? cloud.extras?.premium : null
  });
}
function accessState() {
  const s = store.getSettings(), all = allPersonas();
  const unlocked = access.unlockedBy(cloud.extras?.orders, all);
  return Object.fromEntries(all.map(p => {
    const d = accessDecision(p, bindingFor(p, s), s, all);
    const limit = d.mode === 'free' || d.mode === 'premium' ? (d.limit === Infinity || d.limit == null ? null : d.limit) : (d.limit && d.limit !== Infinity ? d.limit : null);
    return [p.id, { mode: d.mode, tier: d.tier.id, tierLabel: d.tier.label, used: d.mode === 'premium' || (d.tier.id === 'ultra' && d.used != null) ? d.used : usedFor(p), limit, unlocked: unlocked.has(p.id), reason: d.reason || '', ...(p.apex ? { apex: apex?.meter() || null, beta: true } : {}) }];
  }));
}
function broadcastAccess() { try { broadcast('access:changed', accessState()); } catch (e) { log('access', e); } }

// Digest of recent other chats for the Echo feature.
function echoDigest(excludeId) {
  const list = convos.summary().list.filter(c => c.id !== excludeId).slice(0, 6);
  if (!list.length) return '';
  const lines = list.map(c => {
    const conv = convos.get(c.id);
    const lastUser = [...conv.messages].reverse().find(m => m.role === 'user');
    const lastAi = [...conv.messages].reverse().find(m => m.role === 'assistant' && !m.error);
    return `• "${c.title}" (${new Date(c.updated).toLocaleDateString()}): user asked "${(lastUser?.content || '').slice(0, 140)}"${lastAi ? ` — reply began "${lastAi.content.slice(0, 160)}"` : ''}`;
  });
  return '\n\n[ECHO — recent chats with this user]\n' + lines.join('\n');
}

// Apps opened from Finder get a bare PATH; borrow the login shell's so npx/uvx/node work for connectors.
function adoptLoginPath() {
  if (process.platform !== 'darwin') return;
  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__NEXUS_PATH__%s" "$PATH"'], { timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const p = out.split('__NEXUS_PATH__').pop().trim();
    if (p) process.env.PATH = p;
  } catch {}
  for (const extra of ['/opt/homebrew/bin', '/usr/local/bin', path.join(require('os').homedir(), '.local/bin')]) {
    if (!process.env.PATH.split(':').includes(extra)) process.env.PATH += ':' + extra;
  }
}

const helperPath = process.env.NEXUS_HELPER ||
  (app.isPackaged ? path.join(process.resourcesPath, 'bin', 'nexuscore') : path.join(__dirname, 'bin', 'nexuscore'));
// 3.5: on Windows the helper is src/winhelper.js (PowerShell + Windows' own speech, OCR, Outlook), run by Electron as Node
const WIN = process.platform === 'win32';
// 3.6 Windows: notifications only show when the app id matches the Start menu shortcut the installer made
if (WIN) app.setAppUserModelId(app.isPackaged ? 'com.apojidelegraphics.nexus' : process.execPath);
const winHelperScript = (app.isPackaged ? path.join(__dirname, 'src', 'winhelper.js').replace('app.asar', 'app.asar.unpacked') : path.join(__dirname, 'src', 'winhelper.js'));
const helper = WIN && !process.env.NEXUS_HELPER ? new voice.Helper('', { script: winHelperScript }) : new voice.Helper(helperPath);
// ---------------- "Hey Nexus" wake word (runs in the helper, on-device only)
const wake = { active: false, error: '', paused: new Set() };
// 3.13 (Windows): "Hey Nexus" listens with Nexus speech instead of Windows speech: a hidden window hears short bursts of
// speech and Nexus speech (Whisper) checks each one for "Hey Nexus". Settings → Voice can switch back to Windows speech.
const winWake = () => WIN && (store.getSettings().voice || {}).wakeEngine !== 'windows';
const wakeSupported = () => winWake() || !!helperCaps.wake;
function wakeWanted() { return !!store.getSettings().wakeWord && wakeSupported() && wake.paused.size === 0; }
let wakeWin = null;
function startWakeWin() {
  if (wakeWin && !wakeWin.isDestroyed()) return;
  wakeWin = new BrowserWindow({ show: false, width: 200, height: 100, skipTaskbar: true, webPreferences: { ...webPreferences, backgroundThrottling: false } });
  wakeWin.loadFile(path.join(__dirname, 'renderer', 'wake.html'));
  wakeWin.on('closed', () => { wakeWin = null; });
}
function stopWakeWin() { if (wakeWin && !wakeWin.isDestroyed()) wakeWin.destroy(); wakeWin = null; }
const wakeChecks = [];
const WAKE_RE = /\b(hey|hi|hay|a|ok|okay)[\s,.!-]*(nexus|nexes|nexis|necks us|next us|lexus)\b/i;
const WAKE_NAME_RE = /^\W*(nexus|nexes|nexis)\b/i;   // 4.0: just "Nexus" at the start of what you say (Settings → Voice)
const wakeAny = () => store.getSettings().voice?.wakePhrase === 'any';
ipcMain.handle('wake:check', async (_e, { audio, seconds }) => {
  if (!winWake() || !wakeWanted()) return { ok: false };
  const now = Date.now(); while (wakeChecks.length && now - wakeChecks[0] > 3600e3) wakeChecks.shift();
  if (wakeChecks.length >= 300) { wake.error = 'Hey Nexus is resting for a bit: it checked a lot of speech this hour.'; broadcast('wake:status', wakeStatus()); return { ok: false, limited: true }; }
  wakeChecks.push(now);
  const keyed = ['groq', 'openai'].some(k => store.getKey(k));
  let r = await transcribeAudio({ audio, mime: 'audio/wav', engine: keyed ? '' : 'nexus', seconds }).catch(e => ({ ok: false, error: e.message }));
  if (!r.ok && keyed) r = await transcribeAudio({ audio, mime: 'audio/wav', engine: 'nexus', seconds }).catch(e => ({ ok: false, error: e.message }));
  if (!r.ok) { wake.error = /sign in|account/i.test(r.error || '') ? 'Hey Nexus on Windows uses Nexus speech: sign in (Settings → Profile), or add a Groq key in Settings → Models & keys.' : 'Couldn’t check what it heard: ' + (r.error || 'speech-to-text failed'); broadcast('wake:status', wakeStatus()); return { ok: false }; }
  const text = String(r.text || '').trim(); wake.error = '';
  if (!text) return { ok: true, woke: false };
  if (WAKE_RE.test(text) || (wakeAny() && WAKE_NAME_RE.test(text))) {
    wake.lastWake = Date.now(); wake.heard = { at: Date.now(), text, status: 'woke', confidence: 'nexus' }; wakeLog(text, 0.9, true); log('wake (nexus speech)', text);
    recordMetric('wake'); triggerQuick('wake'); return { ok: true, woke: true };
  }
  wake.heard = { at: Date.now(), text, status: '', confidence: 'not the wake word' }; wakeLog(text, 0.2, false); broadcast('wake:status', wakeStatus());
  return { ok: true, woke: false };
});
function setWakeWord(on) {
  const settings = store.setSettings({ wakeWord: !!on });
  broadcast('settings:changed', settings);
  setTimeout(syncWake, 0);
  return wakeStatus();
}
ipcMain.handle('wake:set', (_e, on) => setWakeWord(on));
function syncWake() {
  if (winWake()) {
    if (wake.active && wake.engine !== 'nexus') { helper.send({ cmd: 'wake_stop' }); wake.active = false; }
    if (wakeWanted()) { startWakeWin(); wake.active = true; wake.engine = 'nexus'; } else if (wake.active || wakeWin) { stopWakeWin(); wake.active = false; }
    return broadcast('wake:status', wakeStatus());
  }
  if (wakeWin) { stopWakeWin(); wake.active = false; }
  if (wakeWanted()) { if (!wake.active && helper.send({ cmd: 'wake_start', any: wakeAny() })) { wake.active = true; wake.error = ''; wake.any = wakeAny(); } else if (wake.active && wake.any !== wakeAny()) { helper.send({ cmd: 'wake_stop' }); helper.send({ cmd: 'wake_start', any: wakeAny() }); wake.any = wakeAny(); } }
  else if (wake.active) { helper.send({ cmd: 'wake_stop' }); wake.active = false; }
  broadcast('wake:status', wakeStatus());
}
// 3.12: the Hey Nexus confidence meter: the last few things the listener heard, how sure it was, and whether it woke
const wakeConf = c => { const n = parseFloat(c); if (Number.isFinite(n)) return n > 1 ? n / 100 : n; return { high: 0.9, medium: 0.65, low: 0.4, dictation: 0.7 }[String(c || '').toLowerCase()] ?? null; };
function wakeLog(text, confidence, woke) { if (!text) return; (wake.history ||= []).unshift({ at: Date.now(), text: String(text).slice(0, 80), conf: wakeConf(confidence), raw: String(confidence || ''), woke: !!woke }); wake.history.length = Math.min(wake.history.length, 10); }
function wakeStatus() { return { history: wake.history || [], threshold: WIN && !winWake() ? 0.42 : null, enabled: !!store.getSettings().wakeWord, supported: wakeSupported(), listening: wake.active, error: wake.error, engine: wake.engine || '', heard: wake.heard || null, lastWake: wake.lastWake || 0 }; }
function pauseWake(reason) { wake.paused.add(reason); if (wake.active) { if (wake.engine === 'nexus' && winWake()) stopWakeWin(); else helper.send({ cmd: 'wake_stop' }); wake.active = false; } }
function resumeWake(reason, delay = 600) { wake.paused.delete(reason); setTimeout(syncWake, delay); }

helper.on('event', ev => {
  if (ev.event === 'selection' || ev.event === 'sel_clear' || ev.event === 'sel_watch' || ev.event === 'sel_miss') return onSelectionEvent(ev);
  if (ev.event === 'wake') { wake.active = false; wake.lastWake = Date.now(); wake.heard = { at: Date.now(), text: ev.text || '', status: 'woke', confidence: ev.confidence || '' }; wakeLog(ev.text || 'Hey Nexus', ev.confidence, true); log('wake word heard', ev.text || '', ev.confidence || ''); recordMetric('wake'); triggerQuick('wake'); return; }
  // 3.11 (Windows): what the listener heard that wasn't a wake, or why it couldn't hear (shown in Settings → Voice)
  if (ev.event === 'wake_heard') { wake.heard = { at: Date.now(), text: ev.text || '', status: ev.status || '', confidence: ev.confidence || '', engine: ev.engine || '' }; if (!ev.status) wakeLog(ev.text, ev.confidence, false); log('wake heard', ev.status || '', ev.text || '', ev.confidence || ''); broadcast('wake:status', wakeStatus()); return; }
  if (ev.event === 'wake_error') { wake.active = false; wake.error = ev.error; log('wake error', ev.error); broadcast('wake:status', wakeStatus()); return; }
  if (ev.event === 'wake_listening') { wake.engine = ev.engine || ''; broadcast('wake:status', wakeStatus()); return; }
  if (ev.event === 'final' && listeners.has(ev.id)) log('speech', { chars: String(ev.text || '').length, peak: Math.round((+ev.peak || 0) * 1000) / 1000, reason: ev.reason || '' });   // no words, just how it went
  if (ev.event === 'error' && listeners.has(ev.id)) log('speech error', ev.error);
  const wc = listeners.get(ev.id);
  if (!wc || wc.isDestroyed()) return;
  wc.send('voice:event', ev);
  if (ev.event === 'final' || ev.event === 'error') { listeners.delete(ev.id); if (!listeners.size) resumeWake('listen'); }
});
let helperExits = [];
helper.on('exit', () => {
  wake.active = false; if (orbSel.status !== 'off' && orbSel.status !== 'old-helper') { orbSel.status = 'off'; setTimeout(syncSelWatch, 2500); }
  helperExits = [...helperExits.filter(t => Date.now() - t < 60000), Date.now()];
  if (helperExits.length <= 4) setTimeout(syncWake, 2000);
  else { wake.error = 'The speech helper keeps stopping, so "Hey Nexus" is paused. Toggle it off and on to retry.'; log('wake: helper restart limit hit'); broadcast('wake:status', wakeStatus()); }
  for (const [id, wc] of listeners) if (!wc.isDestroyed()) wc.send('voice:event', { event: 'error', id, error: 'Speech helper stopped.' });
  listeners.clear();
});

const mcp = new McpManager({ env: process.env });
let helperCaps = { built: helper.available() };
async function refreshHelperCaps() { helperCaps = await helper.info(); return helperCaps; }

if (!app.requestSingleInstanceLock()) app.quit();

const webPreferences = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true };
function watchWindow(win, name) {
  let reloads = 0;
  win.webContents.on('did-fail-load', (_e, code, desc, url) => log(`${name} did-fail-load`, { code, desc, url }));
  win.webContents.on('preload-error', (_e, p, err) => log(`${name} preload-error`, p, err));
  win.webContents.on('render-process-gone', (_e, d) => {
    log(`${name} render-process-gone`, d);
    if (reloads++ < 3) setTimeout(() => { if (!win.isDestroyed()) win.webContents.reload(); }, 800);
  });
  win.webContents.on('console-message', (...a) => {
    const ev = a[0]; const level = ev?.level ?? a[1]; const msg = ev?.message ?? a[2];
    if (level === 'error' || level === 3) log(`${name} console`, msg);
  });
  win.webContents.on('did-finish-load', () => log(`${name} loaded`));
}
function lockDown(win) {
  watchWindow(win, win === hud ? 'hud' : win === quick ? 'quick' : 'quickchat');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', e => e.preventDefault());
}
function broadcast(channel, data) {
  for (const w of [hud, quick, quickChat]) if (w && !w.isDestroyed()) w.webContents.send(channel, data);
  if (channel === 'settings:changed') for (const w of deskWins.values()) try { if (!w.isDestroyed()) w.webContents.send(channel, data); } catch {}
  if (/^(reminders:changed|metrics:changed|goals:changed|settings:changed)$/.test(channel)) { clearTimeout(broadcast.dw); broadcast.dw = setTimeout(() => { try { deskRefresh(); } catch {} if (channel === 'reminders:changed' || channel === 'goals:changed') { try { companion?.mark?.('status'); } catch {} } }, 300); }   // 3.13 desktop widgets
}

// ---------------- Chat HUD
// 4.0.4: on a Mac the window normally has a frosted blur behind it. With the See-through slider up, the blur goes away so
// you see what's behind clearly (the same as on Windows), and the slider sets how much.
// 4.0.6: Frosted keeps the blur (Mac vibrancy, Windows 11 acrylic) while still letting the slider decide how much shows.
function glassState() { const st = store.getSettings(), on = st.glassOn === undefined ? (+st.glass || 0) > 0 : !!st.glassOn; const see = on ? +(st.glass || 0) : 0; return { see, frost: see > 0 && !!st.frost }; }
function applyGlass() {
  if (!hud || hud.isDestroyed()) return;
  const { see, frost } = glassState();
  if (process.platform === 'darwin') { try { hud.setVibrancy(see > 0 && !frost ? null : 'under-window'); } catch {} }
  else if (WIN) { try { hud.setBackgroundMaterial?.(frost ? 'acrylic' : 'none'); } catch {} }
}
// 4.3.1: the chat window remembers its size (and where it was) between launches. A saved spot that's no longer on any
// screen (a monitor was unplugged) is ignored and the window opens centered at the saved size.
function hudStart() {
  const { workArea } = screen.getPrimaryDisplay(), b = store.getSettings().hudBounds || {};
  const width = Math.max(620, Math.min(Math.round(+b.width || 900), 4000)), height = Math.max(440, Math.min(Math.round(+b.height || 640), 3000));
  const onScreen = Number.isFinite(+b.x) && Number.isFinite(+b.y) && screen.getAllDisplays().some(d => { const a = d.workArea; return b.x + 80 < a.x + a.width && b.x + width - 80 > a.x && b.y >= a.y - 10 && b.y + 40 < a.y + a.height; });
  return onScreen ? { width, height, x: Math.round(b.x), y: Math.round(b.y) } : { width, height, x: Math.round(workArea.x + (workArea.width - Math.min(width, workArea.width)) / 2), y: Math.round(workArea.y + workArea.height * 0.1) };
}
let hudSaveT = null;
function hudKeep() {
  clearTimeout(hudSaveT);
  hudSaveT = setTimeout(() => { if (!hud || hud.isDestroyed() || hud.isMinimized() || hud.isFullScreen?.()) return; const b = hud.getBounds(); store.setSettings({ hudBounds: { x: b.x, y: b.y, width: b.width, height: b.height } }); }, 600);
}
function createHud() {
  const { width, height, x, y } = hudStart();
  hud = new BrowserWindow({
    width, height, x, y,
    show: false, frame: false, transparent: true, resizable: true, minWidth: 620, minHeight: 440,
    hasShadow: true, fullscreenable: false, skipTaskbar: !WIN, alwaysOnTop: true,   // 3.6: Windows shows it in the taskbar while it's open
    vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000', webPreferences
  });
  hud.on('resize', hudKeep); hud.on('move', hudKeep);   // 4.3.1
  hud.setAlwaysOnTop(true, 'floating');
  hud.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hud.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  applyGlass();
  // 3.6 Windows: clicking the tray icon (or launching again from the taskbar) blurs the window a moment after it shows,
  // which used to hide it straight away (the "flicker"). Ignore that first blur, and remember when we last hid.
  hud.on('blur', () => {
    hudBlurAt = Date.now();
    if (WIN && Date.now() - hudShownAt < 900) return;
    if (store.getSettings().hideOnBlur && !hud.webContents.isDevToolsOpened() && !hasPendingConfirm(hud)) { hud.hide(); hudHiddenAt = Date.now(); }
  });
  lockDown(hud);
}
let hudShownAt = 0, hudHiddenAt = 0, hudBlurAt = 0;
function showHud(panel) {
  if (!hud) createHud();
  hideQuick();
  hudShownAt = Date.now();
  if (WIN) { if (hud.isMinimized()) hud.restore(); hud.setAlwaysOnTop(true, 'pop-up-menu'); hud.show(); hud.moveTop(); hud.focus(); setTimeout(() => { if (hud && !hud.isDestroyed()) { hud.setAlwaysOnTop(true, 'floating'); hud.focus(); } }, 250); }
  else { hud.show(); hud.focus(); }
  hud.webContents.send('hud:shown', { panel: panel || null });
}
// Windows: by the time a tray click arrives the window has already lost focus, so "visible and focused" is never true.
// If it was hidden by that blur a moment ago, the click meant "close it".
function toggleHud() {
  if (WIN) {
    const wasFront = hud && hud.isVisible() && (hud.isFocused() || Date.now() - hudBlurAt < 400) && Date.now() - hudShownAt > 900;
    if (wasFront) { hud.hide(); hudHiddenAt = Date.now(); return; }
    if (Date.now() - hudHiddenAt < 350) return;   // the blur just hid it: this click meant "close"
    return showHud();
  }
  if (hud && hud.isVisible() && hud.isFocused()) hud.hide(); else showHud();
}
function hasPendingConfirm(win) { return [...pendingConfirms.values()].some(p => p.wc === win.webContents); }

// ---------------- Quick Ask orb (voice)
function createQuick() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 340, height = 470;
  quick = new BrowserWindow({
    width, height, x: Math.round(workArea.x + workArea.width - width - 10), y: Math.round(workArea.y + 6),
    show: false, frame: false, transparent: true, resizable: false, movable: false, hasShadow: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, backgroundColor: '#00000000', webPreferences
  });
  quick.setAlwaysOnTop(true, 'pop-up-menu');
  quick.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  quick.loadFile(path.join(__dirname, 'renderer', 'quick.html'));
  lockDown(quick);
}
function triggerQuick(source = 'hotkey') {
  if (!quick) createQuick();
  pauseWake('quick');
  if (hud?.isVisible()) hud.hide();
  if (!quick.isVisible()) quick.showInactive();
  quick.webContents.send('quick:trigger', { source });
}
function hideQuick() { if (quick?.isVisible()) quick.hide(); setEsc(false); resumeWake('quick'); }
// While the orb is showing, Esc closes it and Enter opens its chat in the chat window. Both keys go back to
// normal the moment Quick Ask hides.
function setEsc(on) {
  if (on && !escRegistered) { try { escRegistered = globalShortcut.register('Escape', () => quick?.webContents.send('quick:escape')); } catch {} }
  else if (!on && escRegistered) { globalShortcut.unregister('Escape'); escRegistered = false; }
  if (on && !enterRegistered) { try { enterRegistered = globalShortcut.register('Return', () => quick?.webContents.send('quick:enter')); } catch {} }
  else if (!on && enterRegistered) { globalShortcut.unregister('Return'); enterRegistered = false; }
}

// ---------------- Quick Chat (typed, movable)
const QC_WIDTH = 620;
// v2.10: windows that fade in and out (Quick Chat, the highlight orb). Wraps show/showInactive/hide on that window.
function addFades(win, { inMs = 140, outMs = 110 } = {}) {
  if (process.platform !== 'darwin' && !process.env.NEXUS_FADES) return win;
  const orig = { show: win.show.bind(win), showInactive: win.showInactive.bind(win), hide: win.hide.bind(win) };
  let timer = null, gen = 0;
  const ramp = (from, to, ms, done) => {
    clearInterval(timer); const my = ++gen, t0 = Date.now();
    try { win.setOpacity(from); } catch {}
    timer = setInterval(() => {
      if (win.isDestroyed() || my !== gen) return clearInterval(timer);
      const k = Math.min(1, (Date.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      try { win.setOpacity(from + (to - from) * e); } catch {}
      if (k >= 1) { clearInterval(timer); done?.(); }
    }, 16);
  };
  const fadeIn = how => () => { const was = win.isVisible(); if (!was) { try { win.setOpacity(0); } catch {} } orig[how](); if (!was) ramp(0, 1, inMs); else { gen++; clearInterval(timer); try { win.setOpacity(1); } catch {} } };
  win.show = fadeIn('show'); win.showInactive = fadeIn('showInactive');
  win.hide = () => { if (!win.isVisible()) return orig.hide(); ramp(win.getOpacity?.() ?? 1, 0, outMs, () => { orig.hide(); try { win.setOpacity(1); } catch {} }); };
  return win;
}
function createQuickChat() {
  const { workArea } = screen.getPrimaryDisplay();
  const pos = store.getSettings().quickChatPos;
  const onScreen = pos && screen.getAllDisplays().some(d => pos.x >= d.workArea.x - 50 && pos.x < d.workArea.x + d.workArea.width - 100 && pos.y >= d.workArea.y - 10 && pos.y < d.workArea.y + d.workArea.height - 60);
  quickChat = new BrowserWindow({
    width: QC_WIDTH, height: 92,
    x: onScreen ? pos.x : Math.round(workArea.x + (workArea.width - QC_WIDTH) / 2),
    y: onScreen ? pos.y : Math.round(workArea.y + workArea.height * 0.22),
    show: false, frame: false, transparent: true, resizable: false, movable: true, hasShadow: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000', webPreferences
  });
  quickChat.setAlwaysOnTop(true, 'floating');
  quickChat.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  addFades(quickChat, { inMs: 150, outMs: 110 });
  quickChat.loadFile(path.join(__dirname, 'renderer', 'quickchat.html'));
  let t = null;
  quickChat.on('moved', () => {
    clearTimeout(t);
    t = setTimeout(() => { const [x, y] = quickChat.getPosition(); store.setSettings({ quickChatPos: { x, y } }); }, 300);
  });
  lockDown(quickChat);
}
function toggleQuickChat() {
  if (!quickChat) createQuickChat();
  if (quickChat.isVisible() && quickChat.isFocused()) return quickChat.hide();
  quickChat.show(); quickChat.focus();
  quickChat.webContents.send('quickchat:shown');
}
// ⌥⇧S: look at the front window, then open Quick Chat with it attached.
async function screenToQuickChat() {
  if (!quickChat) createQuickChat();
  let payload;
  try { payload = { attachment: attachments.public(await screenAware.capture({ mode: 'window' })) }; }
  catch (e) { payload = { error: e.message, permission: !!e.permission }; if (e.permission) screenAware.openPermission(); }
  quickChat.show(); quickChat.focus();
  quickChat.webContents.send('quickchat:shown');
  quickChat.webContents.send('quickchat:attach', payload);
}

// ---------------- Your Mac (v1.4): Explain this, clipboard history, Watch mode
const AX_PANE = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
function axTrusted(prompt = false) {
  if (process.env.NEXUS_TEST_AX) return process.env.NEXUS_TEST_AX === 'trusted';
  if (process.platform === "win32") return true;   // 3.5: Windows needs no Accessibility permission (Ctrl+C reads the selection)
  if (process.platform !== "darwin") return false;
  try { return systemPreferences.isTrustedAccessibilityClient(!!prompt); } catch { return false; }
}
function openAccessibility() { axTrusted(true); shell.openExternal(AX_PANE); }
const AX_HELP = "Explain this needs Accessibility access to read what you highlighted. Turn on Nexus '28 in System Settings → Privacy & Security → Accessibility, then try again.";
// The highlighted text in the front app (Accessibility first, then a quick ⌘C that puts your clipboard back).
async function readSelection() {
  if (!helper.available()) return { error: 'Explain this needs the NexusCore helper (npm run build:helper).' };
  clipHist?.mute(6000);
  try {
    const ev = await helper.request({ cmd: 'selected_text', id: 'sel-' + Math.random().toString(36).slice(2), copy: true }, ['result'], 5000);
    const text = String(ev.data?.text || '').trim();
    return text ? { text, app: ev.data?.app || '', method: ev.data?.method } : { error: 'Highlight some text first, then press the Explain hotkey again.' };
  } catch (e) {
    if (/AX_DENIED/.test(e.message)) return { denied: true, error: AX_HELP };
    return { error: /timed out/i.test(e.message) ? "Couldn't read the highlighted text in that app. Try copying it (⌘C) and pasting it into Quick Chat." : e.message };
  } finally { setTimeout(async () => { await clipHist?.resync(); clipHist?.unmute(); }, 300); }
}
// ⌥⇧E: Explain this — the highlighted text → Quick Chat, with Explain / Rewrite / Translate / Summarize chips.
async function explainSelection() {
  if (!quickChat) createQuickChat();
  const r = await readSelection();
  let payload;
  if (r.text) {
    const a = attachments.fromText(r.text, `Selected text${r.app ? ' · ' + r.app : ''}`);
    payload = { attachment: attachments.public(a), explain: { app: r.app, preview: r.text.slice(0, 280), chars: r.text.length } };
    recordMetric('explain');
  } else payload = { error: r.error, accessibility: !!r.denied };
  if (r.denied) openAccessibility();
  quickChat.show(); quickChat.focus();
  quickChat.webContents.send('quickchat:shown');
  quickChat.webContents.send('quickchat:attach', payload);
}

// Watch mode: read the window's text each poll; only ask the model when it changed.
async function watchCapture(windowId) {
  let file = '';
  if (!process.env.NEXUS_TEST_WATCH) {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1600, height: 1600 }, fetchWindowIcons: false });
    const src = sources.find(x => x.id.startsWith(`window:${windowId}:`));
    if (!src || src.thumbnail.isEmpty()) return null;
    file = path.join(app.getPath('temp'), `nexus-watch-${windowId}.png`);
    fsLog.writeFileSync(file, src.thumbnail.toPNG());
  }
  try {
    const ev = await helper.request({ cmd: 'ocr', id: 'watch-' + Math.random().toString(36).slice(2), path: file }, ['result'], 30000);
    return { text: String(ev.data?.text || '') };
  } finally { if (file) try { fsLog.unlinkSync(file); } catch {} }
}
async function watchJudge(q) {
  const s = store.getSettings();
  const r = await runChat({ personaId: s.watch.judge || 'flash', messages: [{ role: 'user', content: watchMode.judgePrompt(q) }], noTools: true,
    systemExtra: '\n\n[WATCH MODE] Answer only YES: <reason> or NO.' });
  if (!r.ok) throw new Error(r.error);
  return watchMode.parseJudge(r.text);
}
async function watchWindows() {
  if (process.env.NEXUS_TEST_WATCH) return [{ id: process.env.FAKE_WINDOW_ID || '42', name: 'Calculus homework', thumb: '' }];
  const own = new Set([hud, quick, quickChat].filter(w => w && !w.isDestroyed()).map(w => { try { return w.getMediaSourceId().split(':')[1]; } catch { return ''; } }));
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true });
  return sources.map(x => ({ id: x.id.split(':')[1], name: x.name, thumb: x.thumbnail.isEmpty() ? '' : x.thumbnail.toDataURL(), icon: x.appIcon && !x.appIcon.isEmpty() ? x.appIcon.toDataURL() : '' }))
    .filter(x => x.name && !own.has(x.id) && !/^(Nexus|Nexus '28)$/.test(x.name)).slice(0, 30);
}
// Voice/typed "watch this window and tell me when…": the front window (not Nexus).
async function watchFront(condition) {
  const win = process.env.NEXUS_TEST_WATCH ? { windowId: process.env.FAKE_WINDOW_ID || '42', app: 'Safari', title: 'Calculus homework' } : await screenAware.frontWindow();
  if (!win?.windowId) throw new Error("Couldn't tell which window is in front. Open Watch from the ⋯ menu and pick it.");
  const s = store.getSettings();
  return watcher.start({ windowId: win.windowId, app: win.app, title: win.title, condition, interval: s.watch.interval, minutes: s.watch.minutes });
}

// ---------------- Hotkeys + tray
const HOTKEY_FNS = { toggle: () => toggleHud(), quick: () => triggerQuick(), quickChat: () => toggleQuickChat(), screen: () => screenToQuickChat(), explain: () => explainSelection(), jot: () => openJotWindow() };
const SLOT_OF = { hotkeyToggle: 'toggle', hotkeyQuick: 'quick', hotkeyQuickChat: 'quickChat', hotkeyScreen: 'screen', hotkeyExplain: 'explain', hotkeyJot: 'jot' };
function registerHotkey(slot, accel) {
  if (hotkeys[slot]) { try { globalShortcut.unregister(hotkeys[slot]); } catch {} }
  hotkeys[slot] = null;
  try { if (accel && globalShortcut.register(accel, HOTKEY_FNS[slot])) { hotkeys[slot] = accel; return true; } } catch {}
  return false;
}
const hotkeyStatus = () => ({ toggle: !!hotkeys.toggle, quick: !!hotkeys.quick, quickChat: !!hotkeys.quickChat, screen: !!hotkeys.screen, explain: !!hotkeys.explain, jot: !!hotkeys.jot });

function createTray() {
  // Same hexagon logo as the chat window header; a template image so macOS tints it for light/dark menu bars.
  // 3.5 Windows: a colour icon for the taskbar's notification area (the Mac's black template one would vanish)
  const icon = WIN ? nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 16, height: 16, quality: 'best' }) : nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  if (!WIN) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Nexus '28");
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Chat', accelerator: hotkeys.toggle || undefined, click: () => showHud() },
    { label: 'Quick Chat', accelerator: hotkeys.quickChat || undefined, click: () => toggleQuickChat() },
    { label: 'Quick Ask (voice)', accelerator: hotkeys.quick || undefined, click: () => triggerQuick() },
    { label: 'Ask About My Screen', accelerator: hotkeys.screen || undefined, click: () => screenToQuickChat() },
    { label: 'Explain Highlighted Text', accelerator: hotkeys.explain || undefined, click: () => explainSelection() },
    { label: 'Jot a Note…', accelerator: hotkeys.jot || undefined, click: () => openJotWindow() },   // 4.3.0
    { label: 'Watch a Window…', click: () => showHud('watch') },
    { label: 'Morning Brief', click: () => routines.runNow('brief', 'manual').then(r => r.convId && openConv(r.convId)) },
    { label: missions?.state() && !['done', 'error'].includes(missions.state().status) ? 'Mission in progress…' : 'Start a Mission…', click: () => showHud('mission') },
    { label: 'Routines…', click: () => showHud('routines') },
    { label: 'New Chat', click: () => { convos.create(); broadcastConvos(); showHud(); } },
    { type: 'separator' },
    { label: '"Hey Nexus"', type: 'checkbox', checked: !!store.getSettings().wakeWord, enabled: wakeSupported(), click: m => setWakeWord(m.checked) },
    { label: 'Settings…', click: () => showHud('settings') },
    ...(updateState.newer ? [{ type: 'separator' }, { label: `Update available: v${updateState.latest}…`, click: () => shell.openExternal(updateState.download || updateState.url) }] : []),
    { label: 'Check for Updates…', click: () => checkUpdates(true).then(r => { if (!r.newer) showHud('general'); }) },
    { label: 'Nexus Status…', click: () => shell.openExternal('https://apojidelegraphics.github.io/Nexus-28/status/') },
    { type: 'separator' },
    { label: 'Quit Nexus', role: 'quit' }
  ]);
  tray.on('click', toggleHud);
  tray.on('right-click', () => tray.popUpContextMenu(menu()));
  // Drop files on the menu-bar icon → new chat about them.
  tray.on('drop-files', async (_e, files) => {
    const added = [], errors = [];
    for (const f of files.slice(0, 6)) { try { added.push(attachments.public(await attachments.fromPath(f))); } catch (e) { errors.push(e.message); } }
    convos.create(); broadcastConvos(); showHud();
    hud.webContents.send('hud:attach', { attachments: added, errors });
  });
}

// ---------------- Update checker (GitHub releases)
let updateState = { current: app.getVersion(), latest: null, newer: false, checkedAt: 0, error: '' };
let notifiedVersion = '';
// 3.6 Windows: updates download by themselves and install when you restart Nexus (or the next time it quits).
// Macs keep the Download button: an app that isn't signed by Apple can't replace itself.
let winUp = null;
function setupWinUpdates() {
  if (!WIN || !app.isPackaged || winUp) return;
  try {
    winUp = require('electron-updater').autoUpdater;
    winUp.autoDownload = true; winUp.autoInstallOnAppQuit = true;
    winUp.on('download-progress', p => { updateState = { ...updateState, downloading: true, progress: Math.round(p.percent || 0) }; broadcast('update:state', updateState); });
    winUp.on('update-downloaded', info => {
      updateState = { ...updateState, newer: true, latest: info.version || updateState.latest, downloading: false, ready: true, skipped: false };
      broadcast('update:state', updateState);
      if (Notification.isSupported()) { const n = new Notification({ title: "Nexus '28 update ready", body: `Version ${updateState.latest} is downloaded. Restart Nexus to finish (or it updates the next time it quits).` }); n.on('click', () => showHud()); n.show(); }
    });
    winUp.on('error', e => { log('auto update', e?.message || e); updateState = { ...updateState, downloading: false }; broadcast('update:state', updateState); });
  } catch (e) { log('auto update', e.message); winUp = null; }
}
async function checkUpdates(manual) {
  if (winUp && !updateState.ready) { try { winUp.allowPrerelease = flagState().realChannel !== 'stable' && store.getSettings().beta?.prerelease !== false; winUp.checkForUpdates().catch(e => log('auto update', e.message)); } catch {} }
  const keep = updateState.ready ? { ready: true, latest: updateState.latest, newer: true } : {};
  try {
    const fs0 = flagState();
    const pre = fs0.realChannel !== 'stable' && store.getSettings().beta?.prerelease !== false;
    const r = await updater.checkLatest({ current: app.getVersion(), base: process.env.NEXUS_UPDATE_BASE || undefined, prerelease: pre });
    updateState = { ...r, checkedAt: Date.now(), error: '' };
  } catch (e) { updateState = { ...updateState, current: app.getVersion(), checkedAt: Date.now(), error: e.message }; }
  Object.assign(updateState, keep, winUp ? { auto: true } : {});
  updateState.skipped = !manual && store.getSettings().updates.skip === updateState.latest;
  broadcast('update:state', updateState);
  if (updateState.newer && !updateState.skipped && !manual && notifiedVersion !== updateState.latest && Notification.isSupported()) {
    notifiedVersion = updateState.latest;
    const n = new Notification({ title: "Nexus '28 update available", body: `Version ${updateState.latest} is ready. Click to see what's new.` });
    n.on('click', () => showHud());
    n.show();
  }
  log('update check', { latest: updateState.latest, newer: updateState.newer, error: updateState.error });
  return updateState;
}
ipcMain.handle('freekey:models', async () => {
  try {
    freeModelCache = await freeModels.fetchFreeModels({ base: process.env.NEXUS_FREE_BASE || undefined });
    const cur = store.getSettings().freeKey || {};
    const model = freeModels.safeFreeModel(cur.model, freeModelCache);
    store.setSettings({ freeKey: { models: freeModelCache.map(m => ({ id: m.id, name: m.name })), model } });
    broadcast('settings:changed', store.getSettings());
    return { ok: true, models: freeModelCache, model };
  } catch (e) { return { ok: false, error: `Couldn't load free models: ${e.message}` }; }
});
ipcMain.handle('update:state', () => updateState);

// ---------------- v3.6 Move to another computer (src/transfer.js): through your account, or a file
const transfer = require('./src/transfer');
const packTransfer = (o = {}) => { try { convos?.save?.(); } catch {} return transfer.pack({ dir: store.dir(), settings: store.getSettings(), platform: process.platform, version: app.getVersion(), ...(o.passcode ? { keys: store.allKeys(), passcode: o.passcode } : {}) }); };
function applyTransfer(buf, o = {}) {
  const bundle = transfer.unpack(buf);
  if (bundle.secrets && !o.passcode && !o.skipKeys) return { ok: false, needPasscode: true, error: 'This transfer has your keys in it. Type the passcode you picked to bring them too (or skip them).' };
  const r = transfer.apply({ dir: store.dir(), bundle, currentSettings: store.getSettings(), platform: process.platform, passcode: o.skipKeys ? '' : o.passcode, setKey: (k, v) => store.setKey(k, v) });
  store.setSettings(r.settings);
  log('transfer', { from: r.from, counts: r.counts });
  // everything is read again from disk on the next start: restart in a moment so the moved chats show up everywhere
  setTimeout(() => { app.relaunch(); app.exit(0); }, 1500);
  return { ok: true, ...r };
}
ipcMain.handle('transfer:info', async () => { try { return { ok: true, signedIn: !!cloud.session, info: await cloud.transferInfo() }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('transfer:upload', async (_e, o = {}) => { try { const buf = packTransfer(o); await cloud.transferUpload(buf); return { ok: true, size: buf.length }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('transfer:download', async (_e, o = {}) => { try { return applyTransfer(await cloud.transferDownload(), o); } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('transfer:export', async (e, o = {}) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Save your Nexus data', defaultPath: path.join(app.getPath('documents'), `Nexus-28-${new Date().toISOString().slice(0, 10)}.nexus`), filters: [{ name: 'Nexus transfer', extensions: ['nexus'] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { const buf = packTransfer(o); require('fs').writeFileSync(r.filePath, buf); return { ok: true, path: r.filePath, size: buf.length }; } catch (er) { return { ok: false, error: er.message }; }
});
let lastImport = null;
ipcMain.handle('transfer:import', async (e, o = {}) => {
  if (o.again && lastImport) { try { return applyTransfer(lastImport, o); } catch (er) { return { ok: false, error: er.message }; } }
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Open a Nexus transfer file', properties: ['openFile'], filters: [{ name: 'Nexus transfer', extensions: ['nexus', 'gz', 'json'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  try { lastImport = require('fs').readFileSync(r.filePaths[0]); return applyTransfer(lastImport, o); } catch (er) { return { ok: false, error: er.message }; }
});
ipcMain.handle('update:check', () => checkUpdates(true));
ipcMain.handle('update:open', () => {
  if (winUp && updateState.ready) { setImmediate(() => { app.isQuitting = true; winUp.quitAndInstall(true, true); }); return true; }
  if (winUp && updateState.newer) { winUp.checkForUpdates().catch(() => {}); updateState = { ...updateState, downloading: true }; broadcast('update:state', updateState); return true; }
  shell.openExternal(updateState.download || updateState.url || `https://github.com/${updater.REPO}/releases`); return true; });
ipcMain.handle('update:skip', (_e, version) => { store.setSettings({ updates: { skip: version } }); updateState.skipped = true; broadcast('update:state', updateState); return true; });

// ---------------- Conversations
function broadcastConvos() { broadcast('conv:changed', { summary: convos.summary(), active: convos.active() }); companion?.mark('chats'); chatSync?.changed(); }
ipcMain.handle('conv:state', () => ({ summary: convos.summary(), active: convos.active() }));
ipcMain.handle('conv:append', (_e, msg, convId) => { const c = convos.appendTo(convId, msg); broadcastConvos(); return c; });
// Widget state saved on a reply (checklist ticks, quiz answers, starred ideas). Only the `widget` field can change.
ipcMain.handle('conv:patchWidget', (_e, args) => patchWidget(args));
function patchWidget({ convId, ts, key, value }) {
  const c = convos.get(convId); const m = c?.messages.find(x => x.ts === ts);
  if (!m || !/^[\w-]{1,40}$/.test(String(key))) return false;
  const v = JSON.parse(JSON.stringify(value ?? null));
  if (JSON.stringify(v).length > 20000) return false;
  m.widget = { ...(m.widget || {}), [key]: v };
  convos.save(); return true;
}
ipcMain.handle('conv:get', (_e, id) => convos.get(id));
// 4.2.0 Share a chat as a link (read-only copy on the Nexus website; you can stop sharing anytime in Settings → Profile)
ipcMain.handle('share:create', async (_e, { convId, showName = false } = {}) => {
  const c = convos.get(convId); if (!c) return { ok: false, error: 'That chat is gone.' };
  if (c.incognito) return { ok: false, error: 'Incognito chats can’t be shared.' };
  if (!cloud?.session) return { ok: false, error: 'Sign in (Settings → Profile) to share a chat.' };
  const SL = require('./src/sharelink'), msgs = SL.shareMessages(c.messages);
  if (!msgs.length) return { ok: false, error: 'This chat is empty.' };
  try {
    const r = await cloud.rpc('share_chat_create', { p_title: String(c.title || 'Chat').slice(0, 120), p_agent: String(c.persona || msgs.find(m => m.agent)?.agent || ''), p_messages: msgs, p_source: WIN ? 'windows' : 'mac', p_show_name: !!showName });
    if (!r?.ok) return { ok: false, error: r?.error || 'Couldn’t make the link.' };
    const url = SL.shareUrl(r.id); clipboard.writeText(url); recordMetric('share');
    return { ok: true, id: r.id, url };
  } catch (e) { return { ok: false, error: /share_chat_create|PGRST202|404/.test(e.message) ? 'Sharing isn’t switched on yet (the Apoji Team still has to finish setting it up).' : e.message }; }
});
ipcMain.handle('share:list', async () => { if (!cloud?.session) return { ok: false, list: [] }; try { return { ok: true, list: (await cloud.rpc('my_shared_chats')) || [], base: require('./src/sharelink').SHARE_BASE }; } catch (e) { return { ok: false, list: [], error: e.message }; } });
ipcMain.handle('share:stop', async (_e, id) => { try { return await cloud.rpc('share_chat_stop', { p_id: String(id) }); } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('conv:addVersion', (_e, { convId, msg }) => { const c = convos.addVersion(convId, msg); broadcastConvos(); if (!msg.error) recordMetric('regenerate'); return c; });
ipcMain.handle('conv:new', (_e, opts) => { convos.create({ spaceId: opts?.spaceId || null, incognito: !!opts?.incognito && flagOn('incognito') }); if (opts?.incognito) betaEvent('incognito'); broadcastConvos(); return convos.active(); });
// 3.7 beta: branch a chat from any message
ipcMain.handle('conv:branch', (_e, { id, ts } = {}) => { if (!flagOn('branch_chat')) return { ok: false, error: 'Branching is a beta feature.' }; const c = convos.branch(id, ts); if (!c) return { ok: false, error: 'That message is gone.' }; betaEvent('branch_chat'); broadcastConvos(); return { ok: true, active: convos.active() }; });
ipcMain.handle('conv:move', (_e, { convId, spaceId }) => { convos.moveToSpace(convId, spaceId); broadcastConvos(); return true; });
ipcMain.handle('conv:links', (_e, { convId, links }) => { const c = convos.setLinks(convId, links); broadcastConvos(); return c?.links || []; });
ipcMain.handle('spaces:add', (_e, sp) => { const r = convos.addSpace(sp || {}); broadcastConvos(); return r; });
ipcMain.handle('spaces:update', (_e, { id, patch }) => {
  patch = { ...(patch || {}) };
  if (patch.project !== undefined && patch.project !== null) patch.project = projects.cleanProject({ ...(convos.space(id)?.project || {}), ...patch.project }, { deckIds: study.decks().map(d => d.id), citeProjects: citeStore.projects() });
  const r = convos.updateSpace(id, patch); broadcastConvos(); return r;
});
// Projects: what a project holds (for its panel) + adding files to it
ipcMain.handle('project:get', (_e, id) => {
  const sp = convos.space(id); if (!sp) return null;
  const chats = convos.summary().list.filter(c => c.spaceId === id);
  return { space: sp, chats, decks: study.decks(), citeProjects: citeStore.projects(), files: (sp.project?.files || []).map(f => attachments.public(attachments.meta(f))).filter(Boolean) };
});
// 4.3.0 Live Spaces: what's going on in a Space at a glance (its deadline, decks to review, reminders, recent chats,
// what it remembers). The app shows it when you pick a Space; N28C gets it with its status.
function spaceLive(id) {
  const sp = convos.space(id); if (!sp) return null;
  const now = Date.now(), p = sp.project || {}, chats = convos.summary().list.filter(c => c.spaceId === id);
  const ids = new Set(chats.map(c => c.id)), decks = study.decks(), mine = (p.decks || []).length ? decks.filter(k => p.decks.includes(k.id)) : [];
  const rem = (store.getSettings().chatReminders || []).filter(r => !r.done && ids.has(r.convId)).sort((a, b) => a.at - b.at).slice(0, 4);
  const days = p.due ? Math.ceil((new Date(p.due + 'T23:59:59').getTime() - now) / 864e5) : null;
  return { id, name: sp.name, color: sp.color, builtin: !!sp.builtin, goal: p.goal || '', due: p.due || '', daysLeft: days,
    decks: mine.map(k => ({ id: k.id, name: k.name, due: k.due, total: k.total, mastered: k.mastered, test: k.testDate || '' })),
    reminders: rem.map(r => ({ text: r.note || r.title || 'Reminder', at: r.at, convId: r.convId })),
    chats: chats.slice(0, 5).map(c => ({ id: c.id, title: c.title, updated: c.updated || c.ts || 0 })), total: chats.length,
    memory: (memory.state().items || []).filter(m => m.space === id).length };
}
ipcMain.handle('space:live', (_e, id) => spaceLive(id));
ipcMain.handle('project:addFiles', async (e, id) => {
  const sp = convos.space(id); if (!sp) return { ok: false, error: 'That project is gone.' };
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile', 'multiSelections'], title: `Add files to ${sp.name}` });
  if (r.canceled) return { ok: true, added: 0 };
  const ids = [], errors = [];
  for (const f of r.filePaths.slice(0, 8)) { try { ids.push((await attachments.fromPath(f)).id); } catch (err) { errors.push(err.message); } }
  const project = projects.cleanProject({ ...(sp.project || {}), files: [...(sp.project?.files || []), ...ids] }, { deckIds: study.decks().map(d => d.id), citeProjects: citeStore.projects() });
  convos.updateSpace(id, { project }); broadcastConvos();
  return { ok: true, added: ids.length, errors };
});
ipcMain.handle('spaces:remove', (_e, id) => { convos.removeSpace(id); broadcastConvos(); return true; });
ipcMain.handle('conv:setVersion', (_e, { convId, index }) => { const c = convos.setVersion(convId, index); broadcastConvos(); return c; });
ipcMain.handle('conv:select', (_e, id) => { convos.select(id); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:delete', (_e, id) => { const inc = convos.get(id)?.incognito; convos.remove(id); if (!inc) chatSync?.deleted(id); broadcastConvos(); companion?.mark('chats'); return convos.active(); });
// v3.3.2: edit / delete your own messages
ipcMain.handle('conv:editMessage', (_e, { convId, ts, content, truncate }) => {
  if (busyConvs.has(convId)) return { ok: false, error: 'Nexus is answering in this chat. Try again when it’s done.' };
  const c = convos.editMessage(convId, ts, content, { truncate: !!truncate }); if (!c) return { ok: false, error: 'That message is gone.' };
  broadcastConvos(); companion?.mark('chats'); return { ok: true, conv: c };
});
ipcMain.handle('conv:deleteMessage', (_e, { convId, ts }) => {
  if (busyConvs.has(convId)) return { ok: false, error: 'Nexus is answering in this chat. Try again when it’s done.' };
  const c = convos.deleteMessage(convId, ts); if (!c) return { ok: false, error: 'That message is gone.' };
  broadcastConvos(); companion?.mark('chats'); return { ok: true, conv: c };
});
ipcMain.handle('conv:rename', (_e, { id, title }) => { convos.rename(id, title); broadcastConvos(); return true; });
ipcMain.handle('conv:pin', (_e, { id, on }) => { convos.pin(id, on !== false); broadcastConvos(); return true; });
// 4.0 Clean up chats: empty ones, ones that only failed, exact duplicates, and old untouched ones (you pick what goes)
ipcMain.handle('conv:cleanup', () => {
  const list = convos.load().list.filter(c => !c.incognito), now = Date.now(), out = [];
  const users = c => (c.messages || []).filter(m => m.role === 'user'), answers = c => (c.messages || []).filter(m => m.role === 'assistant' && !m.error);
  const seen = new Map();
  for (const c of [...list].sort((a, b) => (b.updated || 0) - (a.updated || 0))) {
    const u = users(c), a = answers(c), when = c.updated || c.created || 0;
    let why = '';
    if (!(c.messages || []).length) why = 'empty';
    else if (!a.length && (c.messages || []).some(m => m.error)) why = 'failed';
    else { const key = (c.title || '') + '\u0000' + (u[0]?.content || '').slice(0, 300) + '\u0000' + u.length; if (u.length && seen.has(key)) why = 'duplicate'; else seen.set(key, c.id); }
    if (!why && !c.pinned && !c.spaceId && when && now - when > 90 * 864e5 && u.length <= 2) why = 'old';
    if (why) out.push({ id: c.id, title: c.title || 'New chat', why, msgs: (c.messages || []).length, updated: when });
  }
  return { ok: true, list: out };
});
ipcMain.handle('conv:deleteMany', (_e, ids) => { const set = new Set((ids || []).map(String)); let n = 0; for (const c of convos.load().list) if (set.has(c.id) && !c.pinned) { convos.remove(c.id); chatSync?.deleted(c.id); n++; } broadcastConvos(); companion?.mark('chats'); return { ok: true, deleted: n, active: convos.active() }; });
ipcMain.handle('conv:clearAll', () => { const ids = convos.load().list.filter(c => !c.incognito).map(c => c.id); convos.clearAll(); ids.forEach(id => chatSync?.deleted(id)); broadcastConvos(); return convos.active(); });

// ---------------- 3.12 chat tools: pinned messages, summaries, reminders, What's new
ipcMain.handle('conv:pinMessage', (_e, { convId, ts, on }) => { const c = convos.pinMessage(convId, ts, on !== false); if (!c) return { ok: false }; broadcastConvos(); return { ok: true, conv: c }; });
ipcMain.handle('conv:summarize', async (_e, { convId } = {}) => {
  const c = convos.get(convId); if (!c) return { ok: false, error: 'That chat is gone.' };
  const msgs = c.messages.filter(m => !m.hidden && (m.role === 'user' || m.role === 'assistant') && m.content);
  if (msgs.length < 2) return { ok: false, error: 'There isn’t enough in this chat to sum up yet.' };
  const transcript = msgs.map(m => `${m.role === 'user' ? 'You' : (allPersonas().find(p => p.id === m.persona)?.name || 'Nexus')}: ${String(typeof m.content === 'string' ? m.content : '').replace(/```nexus-[\s\S]*?```/g, '[interactive answer]').slice(0, 1500)}`).join('\n\n').slice(-24000);
  const s = store.getSettings(), pick = ['flash', 'lyte', 'neodela', 'paragon'].map(id => allPersonas().find(p => p.id === id)).find(p => p && accessDecision(p, bindingFor(p, s), s).mode !== 'blocked');
  if (!pick) return { ok: false, error: 'No agent is available to write the summary (add a key in Settings → Models & keys).' };
  const r = await runChat({ personaId: pick.id, noTools: true, noMemory: true, noCount: true, noHandoff: true,
    messages: [{ role: 'user', content: `Sum up this chat for someone coming back to it later. Start with one sentence on what it's about, then up to 6 short bullet points: the key answers, decisions and anything left to do. Use the chat's own words for names and numbers. No preamble.\n\n---\n${transcript}` }] }).catch(e => ({ ok: false, error: e.message }));
  if (!r?.ok || !r.text) return { ok: false, error: r?.error || 'Couldn’t write a summary.' };
  const conv = convos.setSummary(convId, { text: r.text.trim() }); broadcastConvos();
  return { ok: true, summary: conv.summary };
});
ipcMain.handle('conv:clearSummary', (_e, { convId }) => { convos.setSummary(convId, null); broadcastConvos(); return { ok: true }; });
// reminders: [{ id, convId, at, note, title }] in settings; checked every 20 s
const remind = require('./src/remind');
const goals = require('./src/goals');
function addReminder({ convId, at, note = '' }) {
  const list = (store.getSettings().chatReminders || []).filter(r => r.at > Date.now() - 864e5);
  const c = convId ? convos.get(convId) : null;
  const r = { id: 'r' + Date.now().toString(36), convId: convId || '', at, note: String(note || '').slice(0, 200), title: c?.title || '' };
  store.setSettings({ chatReminders: [...list, r].slice(-100) }); broadcast('reminders:changed', store.getSettings().chatReminders);
  return r;
}
ipcMain.handle('goals:get', () => goals.state(store.getSettings().weeklyGoals));
const goalsSave = v => { store.setSettings({ weeklyGoals: v }); const st = goals.state(v); broadcast('goals:changed', st); setTimeout(deskRefresh, 50); companion?.mark?.('status'); return st; };
ipcMain.handle('goals:add', (_e, t) => goalsSave(goals.add(store.getSettings().weeklyGoals, t)));
ipcMain.handle('goals:toggle', (_e, id) => goalsSave(goals.toggle(store.getSettings().weeklyGoals, id)));
ipcMain.handle('goals:remove', (_e, id) => goalsSave(goals.remove(store.getSettings().weeklyGoals, id)));
ipcMain.handle('goals:carry', () => goalsSave(goals.carry(store.getSettings().weeklyGoals)));
ipcMain.handle('reminders:list', () => store.getSettings().chatReminders || []);
ipcMain.handle('reminders:add', (_e, { convId, when: phrase, at, note }) => { const t = at || remind.when(phrase); if (!t || t <= Date.now()) return { ok: false, error: 'Pick a time in the future.' }; const r = addReminder({ convId, at: t, note }); return { ok: true, reminder: r, label: remind.fmt(t) }; });
ipcMain.handle('reminders:remove', (_e, id) => { store.setSettings({ chatReminders: (store.getSettings().chatReminders || []).filter(r => r.id !== id) }); broadcast('reminders:changed', store.getSettings().chatReminders); return { ok: true }; });
setInterval(() => {
  const list = store.getSettings().chatReminders || [], now = Date.now(), due = list.filter(r => !r.done && r.at <= now);
  if (!due.length) return;
  for (const r of due) {
    const c = r.convId ? convos.get(r.convId) : null;
    if (c) { c.updated = now; c.remindedAt = now; convos.save(); broadcastConvos(); }
    const title = r.note ? `Reminder: ${r.note}` : `Reminder: ${c?.title || r.title || 'a chat'}`;
    notify(title, c ? `“${c.title}” is back at the top of your chats.` : 'From Nexus', () => { if (c) { convos.select(c.id); broadcastConvos(); } showHud(); }, { force: true });
    try { push?.send?.('mac', { title, body: r.note || c?.title || '' })?.catch?.(() => {}); } catch {}
  }
  store.setSettings({ chatReminders: list.map(r => due.includes(r) ? { ...r, done: true } : r).filter(r => !r.done || r.at > now - 864e5) });
  broadcast('reminders:changed', store.getSettings().chatReminders);
}, 20e3).unref?.();
// What's new: this version's highlights (from the website, with the built-in line as a fallback)
let whatsNewCache = null;
ipcMain.handle('whatsnew:get', async () => {
  if (whatsNewCache) return whatsNewCache;
  try { const r = await require('electron').net.fetch('https://apojidelegraphics.github.io/Nexus-28/whats-new/changes.json', { cache: 'no-store' }); const j = await r.json(); const v = app.getVersion(); whatsNewCache = { ok: true, entry: j.find(e => e.version === v) || null, version: v }; }
  catch { let entry = null; try { entry = JSON.parse(require('fs').readFileSync(path.join(__dirname, 'docs/whats-new/changes.json'), 'utf8')).find(e => e.version === app.getVersion()) || null; } catch {} whatsNewCache = { ok: !!entry, entry, version: app.getVersion() }; }
  // 4.1.0: notes published from Apoji Admin (a release plan, one click) win for this version
  try { const rows = await cloud?.rest?.(`release_notes?select=version,title,date,highlights&app=eq.nexus&published=is.true&version=eq.${encodeURIComponent(app.getVersion())}`); const e = Array.isArray(rows) ? rows[0] : null; if (e?.highlights?.length) whatsNewCache = { ok: true, entry: { ...(whatsNewCache.entry || {}), ...e }, version: app.getVersion() }; } catch {}
  return whatsNewCache;
});

// ---------------- App + settings
let cirkts = null, social = null;   // 4.0
const cosmetics = require('./renderer/cosmetics');
// v3.2: Overlord is for everyone (Axiom has his own Crucible, which is never sold for points); Hologram is new
const ORB_SKINS = { aurora: 0, reactor: 100, nebula: 250, pulse: 500, tide: 600, prism: 750, ember: 900, pixel: 1000, vortex: 1250, crystal: 1400, eclipse: 1500, circuit: 1750, overlord: 2000, quasar: 2250, solar: 2500, glyph: 2750, hologram: 3000 };   // 4.0: + ember, crystal, quasar, glyph (bought with Cirkts)   // 3.13: tide, vortex, circuit, solar
// Admins can unlock every skin (Settings → Stats → "Unlock all skins"), or turn it off to earn them like everyone.
const allSkins = () => flagState().realChannel === 'admin' && store.getSettings().beta?.allSkins === true;
// 4.0: skins are owned (bought with Cirkts, or kept from before), not unlocked by having enough points
const orbSkinOk = id => id in ORB_SKINS && flagOn('orb_skins') && (allSkins() || !ORB_SKINS[id] || (cirkts ? cirkts.owns('skin:' + id) : (metrics?.summary().points || 0) >= ORB_SKINS[id]));
const shopThemeOk = id => !/^shop-/.test(String(id || '')) || allSkins() || !!cirkts?.owns('theme:' + String(id).slice(5));
const HEX = /^#[0-9a-f]{6}$/i;
function cleanThemes(list) {
  return (Array.isArray(list) ? list : []).filter(t => t && HEX.test(t.accent) && HEX.test(t.bg)).slice(0, 12).map(t => ({
    id: /^custom-[a-z0-9]{1,12}$/.test(t.id) ? t.id : 'custom-' + Math.random().toString(36).slice(2, 8), name: String(t.name || 'My theme').slice(0, 24),
    accent: t.accent, accent2: HEX.test(t.accent2) ? t.accent2 : t.accent, bg: t.bg, text: HEX.test(t.text) ? t.text : '#e8f0ff', glass: Math.max(.6, Math.min(1, +t.glass || .88)) }));
}
const publicPersonas = () => allPersonas().map(({ prompt, defaultBinding, ...rest }) => rest);
const publicProviders = () => Object.fromEntries(Object.entries(providers.PROVIDERS).map(([id, p]) =>
  [id, { label: p.label, needsKey: p.needsKey, local: !!p.local, base: p.base, defaultModel: p.defaultModel, kind: p.kind, noTools: !!p.noTools, keyUrl: p.keyUrl || '', blurb: p.blurb || '', more: !!p.more }]));

ipcMain.handle('app:init', async () => ({
  orbSkins: ORB_SKINS,
  allSkins: allSkins(),
  settings: store.getSettings(),
  keys: store.keyStatus(),
  personas: publicPersonas(),
  providers: publicProviders(),
  conv: { summary: convos.summary(), active: convos.active() },
  hotkeys: hotkeyStatus(),
  helper: await refreshHelperCaps(),
  voices: { eleven: voice.ELEVEN_VOICES, openai: voice.OPENAI_VOICES },
  searchProviders: web.SEARCH_PROVIDERS,
  features: features.publicCatalog(),
  access: accessState(),
  cloud: cloud.state(),
  platform: process.platform,
  version: app.getVersion(),
  update: updateState,
  wake: wakeStatus(),
  routines: routines.list(),
  mission: missions.state(),
  study: { decks: study.decks(), stats: study.stats() },
  flags: flagState(),
  challenge: metrics.challenge(),
  watches: watcher.state(),
  ax: { trusted: axTrusted(false), mac: process.platform === 'darwin' }
}));

ipcMain.handle('settings:set', (_e, patch) => applySettings(patch));
// 3.11: also used by the Nexus guide when you OK a settings change in chat
function applySettings(patch) {
  for (const [k, slot] of Object.entries(SLOT_OF)) if (patch[k] !== undefined) registerHotkey(slot, patch[k]);
  if (patch.customFeatures !== undefined) patch = { ...patch, customFeatures: features.cleanCustom(patch.customFeatures) };
  if (patch.activePersona !== undefined || patch.bindings !== undefined || patch.legacyBinding !== undefined) setTimeout(() => companion?.mark('status'), 0);   // v3.3.2: the portal follows the current model
  if (patch.customThemes !== undefined) patch = { ...patch, customThemes: cleanThemes(patch.customThemes) };
  if (patch.media !== undefined) patch = { ...patch, media: { nowPlaying: patch.media?.nowPlaying !== false, appleMusic: !!patch.media?.appleMusic } };   // 4.2.0 Media connectors
  if (patch.glass !== undefined) { patch = { ...patch, glass: Math.max(0, Math.min(85, Math.round(+patch.glass || 0))) }; setTimeout(applyGlass, 0); }   // 4.0.4 see-through (4.0.6: up to 85%)
  if (patch.glassOn !== undefined || patch.frost !== undefined) { patch = { ...patch, ...(patch.glassOn !== undefined ? { glassOn: !!patch.glassOn } : {}), ...(patch.frost !== undefined ? { frost: !!patch.frost } : {}) }; setTimeout(applyGlass, 0); }
  if (patch.orbSkin !== undefined && !orbSkinOk(patch.orbSkin)) { const { orbSkin, ...rest } = patch; patch = rest; }
  if (patch.theme !== undefined && !shopThemeOk(patch.theme)) { const { theme, ...rest } = patch; patch = rest; }   // 4.0 app themes from the shop
  if (patch.cirkts !== undefined) { const { cirkts: _c, ...rest } = patch; patch = rest; }   // the wallet is only changed in main
  if (patch.orbMutedApps !== undefined) { const { orbMutedApps, ...rest } = patch; patch = rest; }     // only the orb itself adds apps (cliporb:unmute removes)
  if (patch.missionTemplates !== undefined) patch = { ...patch, missionTemplates: missionTemplates.cleanTemplates(patch.missionTemplates) };
  if (patch.myRules !== undefined) patch = { ...patch, myRules: (Array.isArray(patch.myRules) ? patch.myRules : []).map(r => String(r || '').trim().slice(0, 200)).filter(Boolean).slice(0, 20) };   // 3.10
  if (patch.freeKey) {
    // The free key can only ever point at a free model; the fetched list is set by main, never by a renderer.
    const { models: _ignored, ...fk } = patch.freeKey;
    if (fk.model !== undefined) fk.model = freeModels.safeFreeModel(fk.model, freeModelCache || store.getSettings().freeKey?.models);
    patch = { ...patch, freeKey: fk };
  }
  const settings = store.setSettings(patch);
  setTimeout(broadcastAccess, 0);
  if (patch.wakeWord !== undefined) setTimeout(syncWake, 0);
  if (patch.clipOrb !== undefined) setTimeout(() => { syncSelWatch(); broadcast('cliporb:status', orbStatus()); }, 0);
  if (patch.openAtLogin !== undefined) applyLoginItem();
  if (patch.clipboard?.history === false) clipHist?.clear();
  if (patch.beta !== undefined) { broadcast('flags:changed', flagState()); broadcast('personas:changed', publicPersonas()); }
  if (patch.customFeatures !== undefined) { features.setCustom(settings.customFeatures); broadcast('features:changed', { catalog: features.publicCatalog(), personas: publicPersonas() }); }
  if (patch.theme !== undefined || patch.customThemes !== undefined || patch.orbSkin !== undefined) { companion?.mark('status'); setTimeout(syncThemeToProfile, 500); } // phone + admin portal follow the desktop theme
  broadcast('settings:changed', settings);
  return { settings, hotkeys: hotkeyStatus() };
}
// 3.13 Spotify connector: your own Spotify developer app's Client ID, PKCE sign-in in your browser.
const spotifySync = st => { const cur = store.getSettings().spotify || {}; const next = store.setSettings({ spotify: { ...cur, connected: !!st.connected, name: st.name || '', product: st.product || '', clientId: cur.clientId } }); broadcast('settings:changed', next); return st; };
ipcMain.handle('spotify:status', async () => ({ ...(await spotify.status()), clientId: store.getSettings().spotify?.clientId || '', enabled: store.getSettings().spotify?.enabled !== false }));
ipcMain.handle('spotify:connect', async (_e, clientId) => {
  const cur = store.getSettings().spotify || {}; store.setSettings({ spotify: { ...cur, clientId: String(clientId || '').trim() } });
  const r = await spotify.connect(clientId); if (r.ok) spotifySync(r); return r;
});
ipcMain.handle('spotify:disconnect', () => spotifySync(spotify.disconnect()));
ipcMain.handle('spotify:enable', (_e, on) => { const cur = store.getSettings().spotify || {}; const next = store.setSettings({ spotify: { ...cur, enabled: !!on } }); broadcast('settings:changed', next); return { ok: true }; });
ipcMain.handle('spotify:test', async () => { try { return { ok: true, text: (await spotify.call('spotify_now_playing')).text }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('keys:set', (_e, { provider, key }) => {
  store.setKey(provider, (key || '').trim());
  const keys = store.keyStatus();
  broadcast('keys:changed', keys);
  broadcastAccess();
  return keys;
});
ipcMain.handle('models:list', async (_e, { provider }) => {
  const s = store.getSettings();
  try { return { ok: true, models: await providers.listModels({ provider, key: store.getKey(provider), baseUrl: s.baseUrls[provider] }) }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ---------------- Agent chat
function appleFM({ system, messages }) {
  const id = 'fm-' + Math.random().toString(36).slice(2);
  return helper.request({ cmd: 'fm', id, system, prompt: voice.fmPrompt(messages) }, ['fm'], 120000).then(ev => ev.text);
}

// v3.2 offline: when this Mac has no internet, chats fall back to a model on this Mac (Settings → Providers →
// "When you're offline"): Ollama or LM Studio if one is running with a model, otherwise Apple's on-device model.
const isOnline = () => { try { return require('electron').net.isOnline(); } catch { return true; } };
async function localFallback(s) {
  const pick = s.offline?.model || 'auto';
  const probe = async (id, url, read) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(900) }); if (!r.ok) return null; const m = read(await r.json()); return m ? { provider: id, model: m } : null; } catch { return null; } };
  const ollama = () => probe('ollama', String(s.baseUrls?.ollama || 'http://localhost:11434/v1').replace(/\/v1\/?$/, '') + '/api/tags', j => (j.models || [])[0]?.name);
  const lms = () => probe('lmstudio', String(s.baseUrls?.lmstudio || 'http://localhost:1234/v1').replace(/\/$/, '') + '/models', j => (j.data || [])[0]?.id);
  const apple = () => helperCaps.fm === 'available' ? { provider: 'apple', model: 'system' } : null;
  if (pick === 'apple') return apple() || await ollama() || await lms();
  if (pick === 'ollama') return await ollama() || await lms() || apple();
  return await ollama() || await lms() || apple();
}
let lastOnline = true;
setInterval(() => { const on = isOnline(); if (on !== lastOnline) { lastOnline = on; broadcast('net:changed', { offline: !on }); log('network', on ? 'online' : 'offline'); if (on) setTimeout(flushOfflineQueue, 3000); } }, 4000).unref?.();
// 3.12: send what was queued while offline, one chat at a time; the "queued" note is replaced by the real answer
let flushing = false;
async function flushOfflineQueue() {
  if (flushing || !isOnline()) return; flushing = true;
  try {
    for (;;) {
      const q = store.getSettings().offlineQueue || []; if (!q.length || !isOnline()) break;
      const it = q[0]; store.setSettings({ offlineQueue: q.slice(1) });
      const c = convos.get(it.convId); if (!c) continue;
      const last = c.messages[c.messages.length - 1];
      if (last?.role === 'assistant' && last.queued) convos.deleteMessage(c.id, last.ts);
      const hist = convos.get(c.id).messages; if (hist[hist.length - 1]?.role !== 'user') continue;
      const r = await runChat({ personaId: it.personaId, messages: toApi(hist, it.personaId), features: it.features || [], convId: c.id, interactive: false }).catch(e => ({ ok: false, error: e.message }));
      if (r?.offline) { store.setSettings({ offlineQueue: [it, ...(store.getSettings().offlineQueue || [])] }); break; }
      convos.appendTo(c.id, r?.ok ? { role: 'assistant', persona: r.persona || it.personaId, content: r.text, model: r.model, activity: r.activity, sources: r.sources, featureData: r.featureData, fromQueue: true } : { role: 'assistant', persona: it.personaId, content: r?.error || 'Couldn’t send it.', error: true });
      broadcastConvos();
      notify(`${nameOf(r?.persona || it.personaId)} answered`, `You're back online, so your queued message in “${c.title || 'a chat'}” was sent.`);
    }
  } finally { flushing = false; broadcast('queue:changed', store.getSettings().offlineQueue || []); }
}
setTimeout(flushOfflineQueue, 15e3);
ipcMain.handle('net:state', async (_e, probe) => { const s = store.getSettings(); return { offline: !isOnline(), fallback: s.offline?.fallback !== false, local: !isOnline() || probe ? await localFallback(s) : null }; });

// The renderer's message → API conversion (chatctx.js), shared so background runs build history the same way.
let chatCtx = null;
function toApi(history, personaId) {
  if (!chatCtx) { const ctx = { window: {} }; require('vm').runInNewContext(require('fs').readFileSync(path.join(__dirname, 'renderer', 'chatctx.js'), 'utf8'), ctx); chatCtx = ctx.window.NexusChat; }
  return chatCtx.toApiMessages(history, personaId, allPersonas());
}
const nameOf = id => (allPersonas().find(p => p.id === id) || {}).name || 'Nexus';
const nicknameOf = s => String(s.nickname || cloud?.profile?.nickname || '').trim();

// Linked chats: pinned to this chat or its space, or attached with "#". The newest message gets a digest of each.
function withLinks(raw, convId) {
  const conv = convId && convos.get(convId);
  const sp = conv?.spaceId ? convos.space(conv.spaceId) : null;
  const pinned = [...new Set([...(conv?.links || []), ...(sp?.links || [])])].filter(id => id !== convId);
  let lastUser = -1;
  raw.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
  return raw.map((m, i) => {
    const chatIds = (m.attachments || []).filter(a => String(a.id).startsWith('chat:')).map(a => a.id.slice(5));
    const ids = i === lastUser ? [...new Set([...pinned, ...chatIds])] : chatIds;
    if (!ids.length) return m;
    const blocks = ids.map(id => { const c = convos.get(id); return !c ? '' : i === lastUser ? chatsearch.digest(c, { nameOf }) : `[Linked chat "${c.title}"]`; }).filter(Boolean);
    return { ...m, content: `${blocks.join('\n\n')}\n\n${m.content || ''}`.trim(), attachments: (m.attachments || []).filter(a => !String(a.id).startsWith('chat:')) };
  });
}
// 3.11: what the Nexus guide tools can see and do (change_setting only runs after the approval card)
function guideCtx() {
  const s = store.getSettings(), acct = cloud?.account?.() || {}, pp = cloud?.extras?.premium?.paragon;
  const plan = (cloud?.extras?.subscription?.plans || [])[0];
  return {
    search: q => guide.search(q, { settings: s, state: { version: app.getVersion(), signedIn: !!acct.signedIn, plan: plan ? `${plan.plan} ${plan.tier}` : '',
      paragon: pp ? (pp.allowed ? (pp.unlimited ? 'unlimited' : `${Math.max(0, pp.limit - pp.used)} of ${pp.limit} tasks left today`) : 'not on their plan') : '',
      wake: (w => w.listening ? 'listening' + (w.engine ? ' with ' + w.engine : '') : w.error || (w.enabled ? 'not listening' : ''))(wakeStatus()), orb: (o => o.status + (o.error ? ': ' + o.error : ''))(orbStatus()), keys: Object.keys(providers.PROVIDERS).filter(k => providers.PROVIDERS[k].needsKey && store.getKey(k)) } }),
    open: tab => { showHud(); hud?.webContents.send('settings:openTab', tab); },
    change: (key, value) => { const r = guide.apply(key, value, store.getSettings(), { personas: allPersonas().map(p => p.id) }); if (r.error) return r; applySettings(r.patch); return r; }
  };
}
function chatTools(convId) {
  return {
    search: q => { const r = chatsearch.search(convos.load().list, q, { exclude: [convId], nameOf }); return { text: chatsearch.formatResults(r), count: r.length, found: r.map(x => ({ id: x.id, title: x.title })) }; },
    read: id => { const c = convos.get(id); return c ? { text: chatsearch.transcript(c, { nameOf }), title: c.title } : { text: 'No chat with that id. Use search_chats first.', title: '' }; }
  };
}

// v2.2: an admin can keep using a feature that's down for maintenance (unless "admins bypass" is off)
function maintBypass(featureId) { return cloud.isAdmin() && (cloud.maintenance || []).some(m => m.scope.toLowerCase().replace(/[^a-z0-9]/g, '') === featureId && m.adminBypass !== false); }
// N28C requests: blocked while the phone (or everything) is down for maintenance, or the account is suspended
function phoneGate(row) {
  const all = allPersonas(), persona = all.find(p => p.id === row?.agent) || null;
  const down = maint.blockFor(cloud.maintenance, 'phone', { persona, admin: cloud.isAdmin() });
  if (down) return { ok: false, error: maint.message(down, 'N28C') };
  const mod = cloud.moderation(); if (mod) return { ok: false, error: maint.moderationText(mod) };
  return null;
}

// One agent reply. Used by the chat windows (chat:send) and by Routines, the Morning Brief and Missions.
//   confirm({ callId, label, detail, tool }) → Promise<boolean>
// v2.10: chats something is answering in right now (phone questions, routines, missions, Shared Space asks…)
// get a typing indicator in the sidebar.
const busyConvs = new Map();
function setBusy(convId, d) { if (!convId) return; const n = (busyConvs.get(convId) || 0) + d; if (n > 0) busyConvs.set(convId, n); else busyConvs.delete(convId); broadcast('convos:busy', [...busyConvs.keys()]); companion?.mark('status'); }
ipcMain.handle('convos:busy', () => [...busyConvs.keys()]);
// v3.1: the agent and model you last chatted with (Apoji Admin's Nexus chat starts with the same ones)
let lastUsed = null;      // v3.3.2: remembered across restarts (settings.lastUsed)
try { lastUsed = store.getSettings().lastUsed || null; } catch {}
// v3.3.2: the agent picked right now and the model it's set to (Apoji Admin's Nexus chat follows it)
function currentModel() {
  try {
    const s = store.getSettings(), all = allPersonas(), p = all.find(x => x.id === s.activePersona) || all[0];
    const b = bindingFor(p, s);
    return { agent: p.id, provider: b.provider || '', model: b.model || '' };
  } catch { return null; }
}
async function runChat(args) {
  const cid = args.convId;
  setBusy(cid, 1);
  try {
    const r = await runChatCore(args);
    if (r?.ok && r.persona) { lastUsed = { agent: r.persona, provider: r.provider || '', model: String(r.model || '').replace(/^Nexus free key · /, ''), freeKey: !!r.freeKey, at: Date.now() }; try { store.setSettings({ lastUsed }); } catch {} companion?.mark('status'); }
    return r;
  } finally { setBusy(cid, -1); }
}
const CONF_NOTE = '\n\nAt the very end of every answer, on its own line, add [[conf:85]] with your own number from 0 to 100 (digits only, never letters) for how sure you are that the answer is right and complete. Low for guesses, things that may have changed, or when you could not check. The tag is hidden from the user; never mention it.';
const CONF_RE = /\s*\[\[\s*conf\s*:\s*([^\]\n]{0,8})\]\]\s*/gi;   // 4.0: a model that copies the placeholder ([[conf:NN]]) is hidden too
function readConf(text) { let conf = null; const t = String(text || '').replace(CONF_RE, (_m, n) => { if (/^\s*\d{1,3}\s*%?\s*$/.test(n)) conf = Math.max(0, Math.min(100, parseInt(n, 10))); return '\n'; }).replace(/\s+$/, ''); return { text: t, conf }; }
function confFilter() {   // holds back anything that might be the start of a [[conf:NN]] tag while it streams
  let buf = '';
  return {
    push(t) { buf += t; buf = buf.replace(CONF_RE, ''); let i = buf.lastIndexOf('[['); if (i < 0 && buf.endsWith('[')) i = buf.length - 1;
      if (i >= 0 && buf.length - i < 22 && /^\[(\[\s*(c(o(n(f\s*(:[^\]\n]{0,8}(\](\])?)?)?)?)?)?)?)?$/i.test(buf.slice(i))) { const out = buf.slice(0, i); buf = buf.slice(i); return out; }
      const out = buf; buf = ''; return out; },
    flush() { const out = buf.replace(CONF_RE, '').replace(/\[\[\s*conf\s*:?[^\]\n]{0,8}\]?\]?$/i, ''); buf = ''; return out; }
  };
}
async function runChatCore(args) {
  const { personaId, messages: raw = [], voiceMode = false, features: requested = [], convId, signal, onText = () => {}, onEvent = () => {}, confirm, systemExtra = '', noTools = false, maxSteps, interactive = false, noHandoff = false, noMemory = false, noCount = false } = args;
  let apexKind = args.apexKind || 'chat';
  const s = store.getSettings();
  let all = allPersonas();
  if (personaId === 'axiom' && !all.some(p => p.id === 'axiom')) { await apex?.session(true); all = allPersonas(); if (!all.some(p => p.id === 'axiom')) return { ok: false, error: "Axiom isn't available to your account.", blocked: true, fatal: true }; }
  let persona = all.find(p => p.id === personaId) || all[0];
  const binding = bindingFor(persona, s);
  const decision = accessDecision(persona, binding, s, all);
  // v3.2: offline → a model on this Mac (Axiom still needs Supabase, so he can't run offline)
  const offlineLocal = !persona.apex && s.offline?.fallback !== false && !(providers.PROVIDERS[binding.provider] || {}).local && !isOnline() ? await localFallback(s) : null;
  if (!offlineLocal && !persona.apex && !isOnline() && !(providers.PROVIDERS[binding.provider] || {}).local)
    return { ok: false, error: `You're offline. Reconnect, or set up a model on this ${WIN ? 'PC' : 'Mac'} (Settings → Providers: Ollama, LM Studio${WIN ? '' : ", or Apple's on-device model on macOS 26"}) and Nexus will use it whenever you're offline.`, offline: true };
  if (decision.mode === 'blocked' && !offlineLocal) return { ok: false, error: decision.reason, blocked: true, fatal: true };
  // v2.2: maintenance switched on in the admin portal actually stops chats (admins can keep going unless turned off)
  const down = maint.blockFor(cloud.maintenance, 'chat', { persona, admin: cloud.isAdmin() });
  if (down) return { ok: false, error: maint.message(down, persona.base || /^(global|all|app|everything|desktop|mac)$/.test(down.scope) ? "Nexus '28" : persona.name), blocked: true, fatal: true, maintenance: true };
  // A suspended or banned account can't use the free Nexus key (its own API keys still work)
  const mod = cloud.moderation();
  if (mod && decision.mode === 'free') return { ok: false, error: `${maint.moderationText(mod)} You can still chat with your own API keys (Settings → Models & keys).`, blocked: true, fatal: true };
  // v2.4 Apex: Supabase says yes (allowed, minutes left, provider OK) before every Axiom turn, and hands over the prompt
  let apexStart = 0;
  if (persona.apex) {
    const g = await apex.check(decision.mode === 'premium' ? 'openrouter' : binding.provider);
    if (!g.ok) return { ok: false, error: g.error, blocked: true, fatal: true, apex: true };
    persona = { ...persona, prompt: g.session.prompt + require('./src/apex').cageBlock(await apex.cage()) };   // v3.2: he knows his cage
    apexStart = Date.now();
  }
  let route = { provider: binding.provider, model: binding.model, key: store.getKey(binding.provider), baseUrl: s.baseUrls[binding.provider] };
  if (offlineLocal) route = { provider: offlineLocal.provider, model: offlineLocal.model, key: '', baseUrl: s.baseUrls[offlineLocal.provider] };
  else if (decision.mode === 'free') {
    const fk = await cloud.freeKey();
    if (!fk) return { ok: false, error: "The free Nexus key isn't reachable right now. Check your connection, or add your own API key in Settings → Providers." };
    route = { provider: 'openrouter', model: freeModels.safeFreeModel(s.freeKey?.model, freeModelCache || s.freeKey?.models), key: fk, baseUrl: process.env.NEXUS_FREE_BASE || undefined };
  }
  else if (decision.mode === 'premium') {      // 3.11: the Paragon & Axiom key (lives on the server; one turn = one task)
    route = await cloud.premiumRoute(decision.agent, (convId || 'chat') + ':' + (raw.length || 0) + ':' + Date.now().toString(36));
    if (!route) return { ok: false, error: 'Sign in to your Nexus account to use ' + persona.name + ' on the Nexus key.', blocked: true, fatal: true };
  }
  // @Features: only ones this agent has, and not taken offline by feature maintenance.
  const featDown = new Set(cloud.featuresDown()); if (maint.webDown(cloud.maintenance, { admin: cloud.isAdmin() })) { featDown.add('seek'); featDown.add('cite'); }   // 3.7 web search switch
  const asked = [...new Set(requested.map(f => features.lookup(f)?.id).filter(Boolean))];
  const activeFeatures = asked.filter(id => persona.features.includes(id) && (!featDown.has(features.norm(id)) || maintBypass(features.norm(id))));
  const rejected = asked.filter(id => !activeFeatures.includes(id)).map(id => { const m = featDown.has(features.norm(id)) ? ((cloud.maintenance || []).find(x => x.scope.toLowerCase().replace(/[^a-z0-9]/g, '') === features.norm(id)) || maint.webDown(cloud.maintenance)) : null;
    return { id, reason: m ? 'maintenance' : 'not available for this agent', ...(m ? { message: maint.message(m, '@' + id) } : {}) }; });
  const kit = featurekit.plan(activeFeatures, { custom: features.customMap(), agentic: persona.agentic && !noTools });
  // SwiftStream: only the recent part of the chat goes along, so the reply starts sooner.
  const trimmed = kit.swift ? raw.slice(-6) : raw;
  const messages = attachments.expand(withLinks(trimmed, convId));
  // 4.0: videos linked in the chat (YouTube transcripts, captions, stills) are added for every agent
  { try { await addVideoLinks(messages, { signal, onStatus: l => onEvent({ type: 'status', status: 'tool', tool: 'video', label: l, detail: '' }) }); } catch (e) { log('video links', e.message); } }
  // 3.13: pictures on the free key go to OpenRouter's free router, which picks a free model that can see them (Watch & guide me, Look, photos)
  if (decision.mode === 'free' && !offlineLocal && messages.some(m => m.images?.length)) route = { ...route, model: 'openrouter/free' };
  // 3.11.1: your own rules also ride along with your latest message (models, free ones especially, skim past the end of a
  // long system prompt). Only for this request; nothing is saved into the chat.
  { const rl = !noMemory ? (s.myRules || []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 20) : [];
    const li = rl.length ? messages.map(m => m.role).lastIndexOf('user') : -1;
    if (li >= 0) { const note = `\n\n(Follow my rules: ${rl.map(x => x.slice(0, 200)).join(' · ')})`, m = messages[li];
      messages[li] = { ...m, content: typeof m.content === 'string' ? m.content + note : Array.isArray(m.content) ? [...m.content, { type: 'text', text: note }] : m.content }; } }
  const prov = providers.PROVIDERS[route.provider] || {};
  const lastUser = [...raw].reverse().find(m => m.role === 'user');
  const recall = chatsearch.wantsRecall(lastUser?.content);

  const toolset = noTools || prov.noTools ? { tools: [], routes: {}, labels: [] }
    : tools.buildToolset({ agentic: persona.agentic, settings: s, helperBuilt: !!helperCaps.eventkit, mcp, recall, text: lastUser?.content || '' });
  // Feature tools (read-only), even on chat-only agents: Seek/Integrate → web, Echo/Integrate → past chats, Knowledge → encyclopedia.
  if (!noTools && !prov.noTools) {
    const add = names => { for (const n of names) if (!toolset.labels.includes(n)) { toolset.tools.push({ name: n, description: tools.DEFS[n].description, parameters: tools.DEFS[n].parameters }); toolset.labels.push(n); } };
    if (kit.web && s.web.enabled !== false) add(['web_search', 'fetch_url']);
    if (kit.chats && s.chatSearch?.enabled !== false) add(['search_chats', 'read_chat']);
    if (kit.knowledge && s.web.enabled !== false) add(['knowledge_lookup']);
    if (kit.cite && s.web.enabled !== false) add(['cite_source']);
  }
  // 3.11: the built-in Nexus guide, for any agent, when the message is about Nexus itself
  const guideOn = !noTools && !prov.noTools && guide.wantsGuide(typeof lastUser?.content === 'string' ? lastUser.content : (lastUser?.content || []).map?.(p => p.text || '').join(' '));
  if (guideOn) for (const n of ['nexus_guide', 'open_settings', 'change_setting']) if (!toolset.labels.includes(n)) { toolset.tools.push({ name: n, description: tools.DEFS[n].description, parameters: tools.DEFS[n].parameters }); toolset.labels.push(n); }
  // 4.4.0: Solis makes pictures (LuminaRender)
  if (persona.id === 'solis' && !noTools && !prov.noTools && !toolset.labels.includes('lumina_render')) { toolset.tools.push({ name: 'lumina_render', description: tools.DEFS.lumina_render.description, parameters: tools.DEFS.lumina_render.parameters }); toolset.labels.push('lumina_render'); }
  // v2.6: Axiom can start Operations, set Sentinels and undo recent changes (each one asks you first)
  if (persona.apex && !noTools && !prov.noTools && toolset.tools.length) for (const n of ['start_operation', 'set_sentinel', 'undo_recent_actions']) { toolset.tools.push({ name: n, description: tools.DEFS[n].description, parameters: tools.DEFS[n].parameters }); toolset.labels.push(n); }
  // v2.9: Axiom's own kits (Mac power, Dev, Web & research, and Nexus internals for the owner account only)
  if (persona.apex && !noTools && !prov.noTools && toolset.tools.length) {
    const ctl = apex?.controls() || { kitsOff: [], readOnly: false };      // switched from Apoji Admin
    const kits = { ...(s.axiomKits || {}), ...Object.fromEntries(ctl.kitsOff.map(k => [k, false])) };
    for (const t of axiomTools.toolList({ settings: { ...s, axiomKits: kits }, owner: axiomOwner() })) if (!toolset.labels.includes(t.name)) { toolset.tools.push(t); toolset.labels.push(t.name); }
    if (ctl.readOnly) {      // read-only: Axiom can look things up but nothing that changes anything is even offered
      const keep = t => !(axiomTools.DEFS[t.name] ? axiomTools.needsConfirm(t.name) : tools.needsConfirm(t.name, toolset.routes?.[t.name]));
      toolset.tools = toolset.tools.filter(keep); toolset.labels = toolset.tools.map(t => t.name);
    }
  }
  // 3.7: the single web search switch (Apoji Admin → Maintenance → 🌐 Web search). Admins keep it unless bypass is off.
  const webOff = maint.webDown(cloud.maintenance, { admin: cloud.isAdmin() });
  if (webOff) { const WEB = ['web_search', 'fetch_url', 'knowledge_lookup', 'cite_source', 'browser_open', 'browser_read']; toolset.tools = toolset.tools.filter(t => !WEB.includes(t.name)); toolset.labels = toolset.tools.map(t => t.name); }
  let featureBlock = features.featurePrompt(activeFeatures) + featurekit.blockPrompt(kit.blocks) + (voiceMode || persona.apex ? '' : featurekit.generalWidgetsPrompt());   // 3.13
  // 3.9: every agent looks at the reviewed lessons (approved training examples) before answering
  let lessonsUsed = 0;
  if (!noCount && !persona.apex && lastUser) { try { const q = typeof lastUser.content === 'string' ? lastUser.content : (lastUser.content || []).map(p => p.text || '').join(' '); const ld = await training.lessonsDetail(q, persona.base || persona.id); featureBlock += ld.text; lessonsUsed = ld.count; } catch {} }
  // 3.10: your own rules (Settings → Training), on every answer except Shared Space ones
  if (!noMemory) featureBlock += require('./src/training').ownRulesText(s.myRules);
  if (webOff) featureBlock += '\n[Web search is switched off for maintenance right now. Answer from what you know; if the question needs current info, say in one short line that web search is down.]';
  if (guideOn) featureBlock += guide.NOTE;
  if (persona.id === 'solis' && !noMemory) featureBlock += latticeMod.prompt(convos.get(convId || convos.active()?.id)?.lattice);   // 4.4.0 StoryLattice
  if (kit.history) featureBlock += echoDigest(convId || convos.active()?.id);
  { const pc = convos.get(convId || convos.active()?.id), psp = pc?.spaceId && convos.space(pc.spaceId);    // Projects (v2.1)
    if (psp?.project) { try { featureBlock += projects.projectContext({ space: psp, convId: pc.id, convos, study, citeStore, citations, attachments }); } catch (e) { log('project context', e.message); } } }
  const fd = {};               // featureData saved with the reply (the chat shows it)
  if (lessonsUsed) fd.lessons = lessonsUsed;   // 3.10: the 📚 chip
  // Axiom's time counts toward the weekly minutes (answering, Proof mode, Swarm, Operations…)
  let apexLogged = false;
  const apexDone = () => { if (!apexStart || apexLogged) return; apexLogged = true; const sec = (Date.now() - apexStart) / 1000; apex.log(sec, { kind: apexKind, provider: route.provider, model: route.model }).then(() => broadcastAccess()); };
  const cards = [];
  const status = label => onEvent({ type: 'status', status: 'tool', tool: 'feature', label, detail: '' });
  const complete = ({ system, messages: ms }) => providers.chat({ provider: route.provider, model: route.model, baseUrl: route.baseUrl, key: route.key, extraHeaders: route.extraHeaders, appleFM,
    system, messages: ms, tools: [], signal, onText: () => {} }).then(r => r.text || '');
  if (kit.aura) { const a = featurekit.aura(lastUser?.content); fd.aura = { tone: a.tone, wants: a.wants }; featureBlock += a.note; }
  if (kit.grid) {
    const st = mcp.status();
    const rows = featurekit.gridRows({ toolsLabels: toolset.labels, helperCaps, watches: watcher?.state() || [], mission: missions?.state(), routines: routines?.list() || [], access: accessState(),
      connectors: s.connectors.map(c => ({ name: c.name, enabled: c.enabled, status: st[c.id]?.status, tools: st[c.id]?.tools?.length, error: st[c.id]?.error })) });
    cards.push({ type: 'grid', rows }); featureBlock += featurekit.gridNote(rows);
  }
  for (const kind of kit.pre) {
    if (signal?.aborted) break;
    try {
      const r = await featurekit.runPre(kind, { complete, messages, onStatus: status });
      if (r.reasoning) fd.reasoning = r.reasoning;
      if (r.threads) { fd.threads = r.threads; fd.threadKind = r.threadKind; }
      if (r.plan?.length) fd.plan = r.plan;
      if (r.blueprint) {
        fd.blueprint = r.blueprint;
        // You approve the plan before Axiom acts (only when it could actually do something, and someone is here to approve)
        if (interactive && confirm && toolset.tools.length && apexKind === 'chat') {
          const okd = await confirm({ callId: 'bp-' + Date.now().toString(36), tool: 'blueprint', label: `Approve Blueprint: ${r.blueprint.objective || 'plan'}`, detail: r.blueprint.steps.map((x, i) => `${i + 1}. ${x.step}`).join('  ') });
          if (!okd) { fd.blueprint.rejected = true; apexDone(); return { ok: true, text: 'Blueprint not approved, so nothing was done. Tell me what to change and I\'ll redraw it.', featureData: fd, persona: persona.id, provider: route.provider, model: route.model }; }
          fd.blueprint.approved = true;
        }
      }
      featureBlock += r.note || '';
    } catch (e) { if (signal?.aborted) break; log('feature pre-pass failed', kind, e.message); }
  }
  // v2.7 Memory you control: every agent knows what you asked it to remember ("remember that …" saves right away)
  const incognito = !!(convId && convos.get(convId)?.incognito);   // 3.7: incognito chats don't use or add to memory
  if (memory && !noMemory && !incognito) {     // never in Shared Space answers: those are posted where friends can read them
    const spaceId = convId ? convos.get(convId)?.spaceId || null : null, spaceName = spaceId ? convos.space(spaceId)?.name || '' : '';
    const said = interactive && typeof lastUser?.content === 'string' ? memory.fromMessage(lastUser.content, spaceId) : null;
    if (said) { featureBlock += `\n\n[The user just saved this to their Nexus memory${said.space ? ` for the Space "${spaceName || 'this Space'}" (only its chats will know it; "remember everywhere that …" saves it for every chat)` : ''}: "${said.text}". Confirm in one short line.]`; broadcast('memory:changed', memory.state()); }
    featureBlock += memory.prompt(spaceId, spaceName);
    // 3.12 weekly goals: "my goal this week is …" adds it; every agent knows the list
    const g = interactive && typeof lastUser?.content === 'string' ? goals.fromMessage(lastUser.content) : null;
    if (g?.length) { let v = store.getSettings().weeklyGoals; for (const t of g) v = goals.add(v, t); store.setSettings({ weeklyGoals: v }); broadcast('goals:changed', goals.state(v)); featureBlock += `\n\n[The user just added ${g.length === 1 ? 'a weekly goal' : g.length + ' weekly goals'}: ${g.map(x => '"' + x + '"').join(', ')}. Confirm in one short line and say they can tick it off in ☰ → Weekly goals.]`; }
    featureBlock += goals.prompt(store.getSettings().weeklyGoals);
  }
  // v2.5 Axiom: the Dossier and Threat Board ride along every turn; Command Swarm runs the workers first
  if (persona.apex && axiomData) featureBlock += axiomData.dossierPrompt() + axiomData.threatPrompt() + '\n• ' + featurekit.BLOCK_SPECS.dossier + '\n• ' + featurekit.BLOCK_SPECS.threats.replace('Put risks', 'When you spot serious risks the user should watch, put them');
  if (kit.swarm && persona.apex && !signal?.aborted) {
    try {
      const workers = ['flash', 'lyte', 'neodela'].map(id => all.find(p => p.id === id)).filter(p => p && accessDecision(p, bindingFor(p, s), s, all).mode !== 'blocked');
      const question = typeof lastUser?.content === 'string' ? lastUser.content : '';
      status(`Command Swarm: planning for ${workers.length} worker${workers.length === 1 ? '' : 's'}`);
      const tasks = await axiomMod.planSwarm({ complete, question, workers: workers.map(w => ({ id: w.id, name: w.name })) });
      if (tasks.length) {
        status(`Command Swarm: ${tasks.map(t => t.agent).join(', ')} working`);
        const results = await axiomMod.runSwarm({ tasks, run: t => { const wp = all.find(p => p.id === t.agent); return runChat({ personaId: t.agent, messages: [{ role: 'user', content: t.task }], noHandoff: true, signal, maxSteps: 6,
          noTools: t.role !== 'research', features: t.role === 'research' && wp?.features.includes('Seek') ? ['Seek'] : [] }); } });
        status('Command Swarm: grading the work');
        const graded = await axiomMod.gradeSwarm({ complete, question, results });
        fd.swarm = axiomMod.receipts(graded); featureBlock += axiomMod.swarmNote(graded); apexKind = 'swarm';
      }
    } catch (e) { if (!signal?.aborted) log('swarm failed', e.message); }
  }
  for (const k of ['speak', 'brief', 'monolog', 'code']) if (kit[k]) fd[k] = true;
  if (kit.blocks.length) fd.blocks = kit.blocks;

  // Agent handoff: Flash / Lyte can pass a message to a stronger agent that can actually take it.
  const hs = s.handoff || {};
  const targets = noHandoff || hs.enabled === false || !(hs.from || ['flash', 'lyte']).includes(persona.id) ? []
    : ['paragon', 'neodela', 'lyte'].filter(t => t !== persona.id && (t !== 'paragon' || !noTools)).filter(t => {
      const tp = all.find(p => p.id === t); return tp && accessDecision(tp, bindingFor(tp, s), s, all).mode !== 'blocked';
    });
  const gate = targets.length ? featurekit.handoffGate(onText) : null;
  const started = Date.now(); let firstToken = 0;
  // 3.12 answer confidence meter: the agent ends with a hidden [[conf:NN]]; it never shows in the chat
  const confOn = s.answerConfidence !== false && !voiceMode && !noCount && !persona.apex;
  const confStrip = confFilter();
  const textOut0 = t => { if (!firstToken) firstToken = Date.now() - started; gate ? gate.push(t) : onText(t); };
  const textOut = t => { const o = confOn ? confStrip.push(t) : t; if (o) textOut0(o); };

  try {
    const result = await runAgent({
      chat: providers.chat,
      request: {
        provider: route.provider, model: route.model, baseUrl: route.baseUrl,
        key: route.key, extraHeaders: route.extraHeaders, appleFM,
        system: systemPromptFor(persona, { voice: !!voiceMode, tools: toolset.labels, omnibrief: s.omnibrief, nickname: nicknameOf(s) }) + featureBlock + featurekit.handoffNote(targets) + systemExtra + (confOn ? CONF_NOTE : '')
      },
      messages, tools: toolset.tools, routes: toolset.routes,
      exec: async (name, a, { routes, signal }) => {
        if (name === 'start_operation' || name === 'set_sentinel' || name === 'undo_recent_actions') return axiomTool(name, a || {});
        if (persona.apex && axiomTools.DEFS[name]) return axiomTools.execute(name, a || {}, { run: runCmd, web, axiomData, cloud, getKey: store.getKey, runJS, owner: axiomOwner });
        // v2.6 Rollback: remember how things were, so changes can be undone later
        const prior = rollback?.tracked(name) ? await rollback.before(name, a || {}) : null;
        const r = await tools.execute(name, a, { settings: s, getKey: store.getKey, helper, mcp, routes, signal, screen: screenAware, chats: chatTools(convId), mac, clip: s.clipboard.history !== false ? clipHist : null, attachments, media: mediaKit(), jots: { list: () => docs.jots(30).map(d => ({ text: d.text.slice(0, 400), ts: d.updated })), add: t => jotAdd(t) }, lumina: persona.id === 'solis' ? { render: a => luminaRun(a, convId || convos.active()?.id, signal) } : null, cite: { add: c => { const r = citeStore.add(c); citeUsed(c?.url || c?.title); return r; } }, guide: guideCtx(), spotify });   // 4.2.0: an @Cite card counts for the Cite quest
        if (rollback?.tracked(name)) { rollback.after(name, a || {}, r, prior, { persona: persona.id, convId }); broadcast('rollback:changed'); }
        return r;
      },
      describe: (n, a, r) => axiomTools.DEFS[n] ? axiomTools.describe(n, a) : tools.describe(n, a, r), needsConfirm: (n, r) => axiomTools.DEFS[n] ? axiomTools.needsConfirm(n) : tools.needsConfirm(n, r), confirm: confirm || (async () => false),
      precheck: (n, a) => persona.apex && axiomTools.DEFS[n] ? axiomTools.precheck(n, a, { run: runCmd }) : '',
      signal, maxSteps,
      onText: textOut,
      onEvent: ev => onEvent(ev.type === 'status' && ev.status === 'connecting' ? { ...ev, label: prov.label } : ev)
    });
    if (confOn) { const tail = confStrip.flush(); if (tail) textOut0(tail); const c = readConf(result.text); if (c.conf != null) fd.confidence = c.conf; result.text = c.text; }
    const h = gate && featurekit.parseHandoff(result.text);
    if (h && targets.includes(h.to) && !signal?.aborted) {
      const tp = all.find(p => p.id === h.to);
      onEvent({ type: 'status', status: 'tool', tool: 'feature', label: `Handing off to ${tp.name}`, detail: h.reason });
      log('handoff', persona.id, '→', h.to, h.reason);
      const r2 = await runChatCore({ ...args, personaId: h.to, noHandoff: true });
      return { ...r2, handoff: { from: persona.id, to: h.to, reason: h.reason }, persona: h.to };
    }
    gate?.flush();
    for (const a of result.activity) if (a.tool !== 'system') store.logAction({ persona: persona.id, tool: a.tool, label: a.label, detail: a.detail, status: a.status, summary: a.summary || '' });
    const activity = result.activity.map(a => ({ tool: a.tool, label: a.label, detail: a.detail, status: a.status, summary: a.summary || '', sources: (a.sources || []).slice(0, 5) }));
    let text = result.text;
    // ClarityLens: if it reads above about 9th grade, simplify it once.
    if (kit.clarity && text && !signal?.aborted) {
      const g = featurekit.readingGrade(text);
      fd.readability = { grade: g.grade };
      if (g.grade > 9 && g.words > 50) {
        status('Simplifying (reading level ' + Math.round(g.grade) + ')');
        try {
          const simple = await complete({ system: 'Rewrite the answer below so a 12-year-old can read it easily: short sentences, everyday words, same facts, same markdown structure. Keep any fenced code blocks exactly as they are. Reply with only the rewritten answer.', messages: [{ role: 'user', content: text }] });
          const g2 = featurekit.readingGrade(simple);
          if (simple.trim() && g2.grade && g2.grade < g.grade) { text = simple.trim(); fd.readability = { grade: g2.grade, before: g.grade }; }
        } catch {}
      }
    }
    // Widgets written as ```json instead of ```nexus-… still show as widgets
    if (text) text = featurekit.retagBlocks(text, [...kit.blocks, ...featurekit.GENERAL_WIDGETS, 'memory', ...(persona.apex ? ['threats', 'dossier'] : [])]);
    // Proof mode: check every claim, score it, fix its own mistakes before you rely on it
    if (kit.proof && text && !signal?.aborted) {
      try { const pr = await featurekit.proofPass(text, { complete, messages, onStatus: status }); fd.proof = { claims: pr.claims, fixed: pr.fixed }; text = pr.text; }
      catch (e) { log('proof pass failed', e.message); }
    }
    if (persona.apex && /(^|\n)\s*\**Acceptable\. Proceed\.\**\s*$/.test(text || '')) fd.stamp = true;
    if (kit.swift) fd.latency = { first: firstToken || Date.now() - started, total: Date.now() - started, kept: trimmed.length, of: raw.length };
    if (persona.id === 'solis' && text) text = latticeApply(convId || convos.active()?.id, text);   // 4.4.0 StoryLattice notes leave the answer and go on the chat
    const extras = { activity, images: result.images, sources: result.sources, cards: [...cards, ...result.cards].slice(0, 4), attachments: result.attachments, chatRefs: result.chatRefs };
    const featureData = Object.keys(fd).length ? fd : undefined;
    apexDone();
    if (signal?.aborted) return { ok: true, aborted: true, text, ...extras, featureData };
    let usage = null;
    // 3.7 beta: what your own key cost (an estimate)
    if (decision.mode === 'premium') cloud.refreshPremium().then(() => broadcastAccess()).catch(() => {});
    if (decision.mode !== 'free' && decision.mode !== 'premium' && !offlineLocal && text && spend) { try { spend.record({ provider: route.provider, model: route.model || prov.defaultModel || '', inChars: JSON.stringify(messages).length + 3000, outChars: text.length }); } catch {} }
    if (decision.mode === 'free' && !offlineLocal && text && !noCount) { usage = { used: await recordUsage(persona), limit: decision.limit === Infinity ? null : decision.limit, tier: decision.tier.label }; broadcastAccess(); }
    if (interactive && text) recordMetric('chat', { agent: persona.id, voice: !!voiceMode, features: activeFeatures });
    return { ok: true, text, provider: route.provider, model: (offlineLocal ? 'Offline · ' : decision.mode === 'free' ? 'Nexus free key · ' : decision.mode === 'premium' ? 'Nexus key · ' : '') + (decision.mode === 'premium' ? persona.name : (route.model || prov.defaultModel)), freeKey: decision.mode === 'free' && !offlineLocal, offline: !!offlineLocal, usage, ...extras, features: activeFeatures, rejected, featureData, persona: persona.id };
  } catch (err) {
    apexDone();
    if (err.name === 'AbortError' || signal?.aborted) return { ok: true, aborted: true };
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('chat:send', async (e, { requestId, personaId, messages, voice: voiceMode, features: requested = [], convId }) => {
  const ctrl = new AbortController();
  inflight.set(requestId, ctrl);
  const wc = e.sender;
  const send = (ch, d) => { if (!wc.isDestroyed()) wc.send(ch, { requestId, ...d }); };
  const confirm = ({ callId, label, detail, tool }) => new Promise(resolve => {
    const timer = setTimeout(() => { pendingConfirms.delete(callId); resolve(false); }, 5 * 60 * 1000);
    pendingConfirms.set(callId, { requestId, wc, resolve: v => { clearTimeout(timer); pendingConfirms.delete(callId); resolve(v); } });
    send('agent:confirm', { callId, label, detail, tool, persona: personaId });
  });
  try {
    // 3.12: "remind me about this tomorrow at 9" is handled right here, no AI
    { const lu = [...messages].reverse().find(m => m.role === 'user'), q = typeof lu?.content === 'string' ? lu.content : '';
      const rm = q && remind.parse(q);
      if (rm) { const r0 = addReminder({ convId, at: rm.at, note: rm.note }); return { ok: true, local: true, persona: personaId, provider: '', model: 'Reminder', reminder: r0,
        text: `Okay. I'll remind you ${remind.fmt(rm.at)}${rm.note ? `: ${rm.note}` : ''}${convId ? ', and bring this chat back to the top' : ''}. You can see or cancel reminders in ☰ → Reminders.` }; } }
    const r = await runChat({ personaId, messages, voiceMode, features: requested, convId, signal: ctrl.signal, confirm, interactive: true,
      onText: t => send('chat:chunk', { text: t }), onEvent: ev => send('chat:event', ev) });
    // 3.12 offline queue: offline with no model on this computer → it waits and sends itself once you're back online
    if (r && !r.ok && r.offline && convId && store.getSettings().offline?.queue !== false && !convos.get(convId)?.incognito) {
      const q = (store.getSettings().offlineQueue || []).filter(x => x.convId !== convId);
      store.setSettings({ offlineQueue: [...q, { convId, personaId, features: requested, at: Date.now() }].slice(-20) }); broadcast('queue:changed', store.getSettings().offlineQueue);
      return { ...r, queued: true, error: `You're offline, so this is queued. Nexus sends it by itself as soon as you're back online (no model on this ${WIN ? 'PC' : 'Mac'} can answer offline; Settings → Providers can set one up).` };
    }
    secondLook(r, messages, convId);
    // 3.8: one training example per answer (only with consent; never incognito or Axiom), with a ref for 👍 / 👎
    if (r?.ok && !r.aborted && training.state().on) {
      const lastQ = [...messages].reverse().find(m => m.role === 'user'), q = typeof lastQ?.content === 'string' ? lastQ.content : (lastQ?.content || []).map(p => p.text || '').join(' ');
      const p = allPersonas().find(x => x.id === (r.persona || personaId)) || {};
      r.trainRef = await Promise.race([training.record({ prompt: q, answer: r.text, agent: p.base || p.id || personaId, model: r.model, features: r.features || requested, convId, incognito: !!(convId && convos.get(convId)?.incognito), apex: !!p.apex }), new Promise(res => setTimeout(() => res(null), 2500))]).catch(() => null);
    }
    return r;
  } finally {
    inflight.delete(requestId);
    for (const [, p] of pendingConfirms) if (p.requestId === requestId) p.resolve(false);
  }
});

// 3.7 beta Second Look: after Flash or Lyte answers, Neodela quietly checks it. Only a real disagreement shows up, as a
// small chip under the answer. It never counts toward your free allowances.
async function secondLook(r, messages, convId) {
  try {
    const s = store.getSettings();
    if (!r?.ok || r.aborted || !['flash', 'lyte'].includes(r.persona) || !flagOn('second_look') || s.secondLook === false) return;
    const text = String(r.text || ''); if (text.length < 60 || /```nexus-/.test(text)) return;
    const q = [...messages].reverse().find(m => m.role === 'user'); const question = typeof q?.content === 'string' ? q.content : '';
    if (!question || question.length < 6) return;
    // 3.13: small talk, greetings and questions about the agent itself aren't fact-checked
    if (/^\s*(hi|hey|hello|yo|sup|good (morning|afternoon|evening|day)|thanks|thank you|ok|cool|who are you|what are you|what can you do)\b/i.test(question) && question.length < 80) return;
    betaEvent('second_look');
    const ask = `Check this answer for factual or logical mistakes.\n<question>${question.slice(0, 2000)}</question>\n<answer>${text.slice(0, 6000)}</answer>\nIf it is correct (small style issues don't count), reply exactly OK. If something important is wrong or misleading, reply "DISAGREE:" and then the correction in at most two short sentences.`;
    const base = { messages: [{ role: 'user', content: ask }], noTools: true, noHandoff: true, noMemory: true, noCount: true, confirm: async () => false,
      systemExtra: '\n\n[SECOND LOOK] You are quietly reviewing an answer another Nexus agent gave. Its name, personality, greeting and style are NOT mistakes, and you must not compare its identity with yours. Only facts, math, logic and advice that could mislead count.' };
    let chk = await runChatCore({ personaId: 'neodela', ...base });
    if (!chk?.ok) chk = await runChatCore({ personaId: r.persona, ...base });
    const m = String(chk?.text || '').match(/DISAGREE:\s*([\s\S]{5,600})/i);
    if (!m || /\byou are (nexus|neodela|flash|lyte|paragon)|\b(identity|persona|greeting|introduc)/i.test(m[1])) return;   // 3.13: never about who answered
    broadcast('chat:secondlook', { convId: convId || convos.active()?.id, head: text.slice(0, 120), note: m[1].trim().split('\n').slice(0, 3).join(' ').slice(0, 500), by: chk.persona === 'neodela' ? 'Neodela' : 'A second check' });
  } catch (e) { log('second look', e.message); }
}

// Approvals for work running in the background (Routines, Missions): a banner in the chat window + a notification.
function bgConfirm(source) {
  return ({ callId, label, detail, tool }) => new Promise(resolve => {
    const timer = setTimeout(() => { pendingConfirms.delete(callId); broadcast('bg:confirmDone', { callId }); resolve(false); }, 30 * 60 * 1000);
    pendingConfirms.set(callId, { requestId: 'bg', wc: hud?.webContents, label, detail, source, at: Date.now(), resolve: v => { clearTimeout(timer); pendingConfirms.delete(callId); broadcast('bg:confirmDone', { callId }); resolve(v); } });
    broadcast('bg:confirm', { callId, label, detail, tool, source });
    companion?.mark?.('status');   // 4.3.0: approve it from N28C too
    if (store.getSettings().phone?.enabled && cloud.session) push?.send('missions', { title: `${source} needs your OK`, body: String(label || '').slice(0, 120), tag: 'approve', url: './#home' }).catch(() => {});
    notify(`${source} needs your OK`, `${label}${detail ? ' — ' + detail : ''}`, () => showHud());
  });
}
function notify(title, body, onClick, { force = false } = {}) {
  if (!force && focus?.muting()) { focus.hold(title, body); broadcast('focus:state', focus.state()); return; }   // Focus timer holds notifications
  if (!Notification.isSupported()) return;
  const noEmoji = t => String(t || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();   // 3.11: no emojis in notifications
  title = noEmoji(title); body = noEmoji(body);
  const n = new Notification({ title, body: String(body || '').slice(0, 220), ...(WIN ? { icon: path.join(__dirname, 'assets', 'icon.png') } : {}) });
  if (onClick) n.on('click', onClick);
  // 3.6 Windows: keep a reference until it's gone, or the click can be lost when the object is garbage collected
  liveNotes.add(n); const drop = () => liveNotes.delete(n); n.on('close', drop); n.on('click', drop); setTimeout(drop, 10 * 60e3);
  n.show();
}
const liveNotes = new Set();
var chatSync = null;
var spend = null;   // 3.7 beta key spend tracker (src/spend.js)
ipcMain.handle('spend:summary', () => (flagOn('spend_tracker') && betaEvent('spend_tracker'), spend) ? { ok: true, on: flagOn('spend_tracker'), ...spend.summary() } : { ok: false });
ipcMain.handle('spend:reset', () => { spend?.reset(); return true; });   // var: broadcastConvos may run before this line is reached
ipcMain.handle('chatsync:state', () => chatSync?.state() || { enabled: false });
ipcMain.handle('chatsync:set', async (_e, on) => {
  store.setSettings({ chatSync: { ...(store.getSettings().chatSync || {}), enabled: !!on, ...(on ? { pushed: {}, pulledUntil: '' } : {}) } });
  if (on && chatSync) { await chatSync.cycle(); broadcastConvos(); }
  return chatSync?.state() || { enabled: !!on };
});
function recordMetric(event, data) {
  if (!metrics) return;
  companion?.mark('status');
  const fresh = metrics.record(event, data);
  statSync?.nudge?.();   // 3.11.1
  if (fresh.length) {
    broadcast('metrics:achievement', fresh);
    if (!hud?.isVisible()) for (const a of fresh) notify(`Achievement unlocked: ${a.name}`, a.desc);
    feedFromFresh(fresh);   // 4.3.0 friends feed
  }
  if (['chat', 'study_review', 'focus', 'study_cards', 'write', 'huddle'].includes(event)) eventsSoon();
}
// 4.3.0 Friends feed: big moments (achievements, all three quests, streak milestones) post a line your friends see.
// Settings → Profile → "Share my milestones with friends" (on by default) turns it off.
function activeToday() { const d = metrics.load().day; const k = new Date(); const key = `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, '0')}-${String(k.getDate()).padStart(2, '0')}`; return !!(d && d.key === key && Object.values(d.counts || {}).some(n => n > 0)); }
// 4.3.0 Profile visitors push: every 10 minutes, a buzz when someone new looked at your profile (invisible people show as "someone")
let visAt = 0;
async function visitorsPush() {
  if (Date.now() - visAt < 10 * 60e3 || !cloud?.session || !push || push.prefs().visitors === false) return; visAt = Date.now();
  const r = await social.visitors(1); const list = (r?.visitors || []).filter(v => new Date(v.last_at).getTime() > (store.getSettings().phone?.visSeen || Date.now() - 10 * 60e3));
  if (!list.length) return;
  store.setSettings({ phone: { ...(store.getSettings().phone || {}), visSeen: Math.max(...list.map(v => new Date(v.last_at).getTime())) } });
  const who = list.map(v => v.hidden ? 'Someone' : v.name || v.username || 'Someone'), first = who[0];
  await push.send('visitors', { title: '👀 Profile visit', body: list.length > 1 ? `${first} and ${list.length - 1} other${list.length > 2 ? 's' : ''} looked at your profile.` : `${first} looked at your profile.`, tag: 'visitors', url: './#you' });
}
function feedFromFresh(fresh) {
  if (!cloud?.session || store.getSettings().feedShare === false) return;
  for (const a of fresh.slice(0, 3)) {
    const [kind, text] = String(a.id || '').startsWith('quests:') ? ['quests', 'finished all three daily quests'] : /^streak_\d+/.test(a.id || '') ? ['streak', `hit a ${String(a.id).split('_')[1]}-day streak`] : a.kind === 'quest' ? [] : ['achievement', `unlocked ${a.name}`];
    if (kind) cloud.rpc('feed_post', { p_kind: kind, p_text: text }).catch(() => {});
  }
}
// 4.3.0 Seasonal events: progress counts from the moment you first see the event (a snapshot of your Stats counters),
// and quests are claimed for you as soon as they're done. All four → the event's frame.
const EVENT_KEYS = ['chats', 'study_review', 'focus', 'study_cards', 'write', 'huddle'];
let eventsCache = { at: 0, list: [] }, eventsTimer = null;
function eventsSoon() { clearTimeout(eventsTimer); eventsTimer = setTimeout(() => eventsState({ claim: true }).catch(() => {}), 8000); }
async function eventsState({ claim = false, fresh = false } = {}) {
  if (!cloud?.session) return { ok: false, signedIn: false, list: [] };
  if (fresh || Date.now() - eventsCache.at > 10 * 60e3) { const r = await cloud.rpc('event_state', {}); eventsCache = { at: Date.now(), list: Array.isArray(r) ? r : [] }; }
  const raw = metrics.load(), streak = metrics.summary().streak || 0, s = store.getSettings();
  const base = { ...(s.eventBase || {}) }; let changed = false;
  const list = [];
  for (const e of eventsCache.list) {
    if (e.live && !base[e.id]) { base[e.id] = Object.fromEntries(EVENT_KEYS.map(k => [k, raw[k] || 0])); changed = true; }
    const b = base[e.id] || {};
    const quests = (e.quests || []).map(q => { const have = q.event === 'streak' ? streak : Math.max(0, (raw[q.event] || 0) - (b[q.event] || 0)); return { ...q, progress: Math.min(q.n, have), claimed: (e.claimed || []).includes(q.id) }; });
    list.push({ ...e, quests });
  }
  if (changed) store.setSettings({ eventBase: Object.fromEntries(Object.entries(base).filter(([id]) => eventsCache.list.some(e => e.id === id))) });
  if (claim) for (const e of list) if (e.live) for (const q of e.quests) if (!q.claimed && q.progress >= q.n) {
    const r = await cloud.rpc('event_claim', { p_event: e.id, p_quest: q.id }).catch(() => null);
    if (r?.ok) { q.claimed = true; e.claimed = [...(e.claimed || []), q.id]; notify(`❄ ${e.name}: quest done`, `${q.text} · ${r.claimed}/${r.total}`);
      if (r.rewarded) { e.rewarded = true; notify(`🎁 ${e.name} complete!`, 'You earned the event frame. Wear it from Profile → Cirkts shop.'); cirktsSync(true).catch(() => {}); }
      eventsCache.at = 0; }
  }
  broadcast('events:changed', list);
  return { ok: true, signedIn: true, list };
}
ipcMain.handle('events:state', async () => { try { return await eventsState({ claim: true }); } catch (e) { return { ok: false, error: e.message, list: [] }; } });

ipcMain.handle('chat:abort', (_e, { requestId }) => {
  inflight.get(requestId)?.abort();
  for (const [, p] of pendingConfirms) if (p.requestId === requestId) p.resolve(false);
  return true;
});
ipcMain.handle('agent:confirmReply', (_e, { callId, approve }) => { pendingConfirms.get(callId)?.resolve(!!approve); return true; });
ipcMain.handle('preview:get', (_e, url) => web.linkPreview(url));

// ---------------- Connectors (MCP) + activity log
function connectorSecrets(id) { return store.getSecretJSON('mcp:' + id); }
function maskSecrets(sec) {
  const mask = o => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, v ? '••••••' : '']));
  return { env: mask(sec.env), headers: mask(sec.headers) };
}
function connectorsState() {
  const s = store.getSettings();
  return {
    connectors: s.connectors.map(c => ({ ...c, secrets: maskSecrets(connectorSecrets(c.id)) })),
    status: mcp.status(), presets: PRESETS
  };
}
async function connectEnabled() {
  const s = store.getSettings();
  await Promise.all(s.connectors.filter(c => c.enabled).map(c => mcp.connect(c, connectorSecrets(c.id)).then(() => broadcast('connectors:changed', connectorsState()))));
}
ipcMain.handle('connectors:state', () => connectorsState());
ipcMain.handle('connectors:save', async (_e, { connector, secrets }) => {
  const s = store.getSettings();
  const id = connector.id || ('m' + Date.now().toString(36));
  const clean = {
    id, name: (connector.name || 'Connector').slice(0, 40), type: connector.type === 'http' ? 'http' : 'stdio',
    command: connector.command || '', args: Array.isArray(connector.args) ? connector.args : [], url: connector.url || '',
    enabled: connector.enabled !== false, confirmWrites: connector.confirmWrites !== false, preset: connector.preset || 'custom'
  };
  if (secrets) {
    // "••••••" means unchanged: keep the stored value.
    const old = connectorSecrets(id);
    const merge = (next, prev) => Object.fromEntries(Object.entries(next || {}).filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v === '••••••' ? (prev?.[k] || '') : v]));
    store.setSecretJSON('mcp:' + id, { env: merge(secrets.env, old.env), headers: merge(secrets.headers, old.headers) });
  }
  const list = s.connectors.filter(c => c.id !== id).concat(clean);
  store.setSettings({ connectors: list });
  if (clean.enabled) { broadcast('connectors:changed', { ...connectorsState(), status: { ...mcp.status(), [id]: { status: 'connecting', tools: [] } } }); await mcp.connect(clean, connectorSecrets(id)); }
  else await mcp.disconnect(id);
  const st = connectorsState();
  broadcast('connectors:changed', st);
  return st;
});
ipcMain.handle('connectors:remove', async (_e, id) => {
  const s = store.getSettings();
  store.setSettings({ connectors: s.connectors.filter(c => c.id !== id) });
  store.setSecretJSON('mcp:' + id, null);
  await mcp.disconnect(id);
  const st = connectorsState(); broadcast('connectors:changed', st); return st;
});
ipcMain.handle('connectors:reconnect', async (_e, id) => {
  const c = store.getSettings().connectors.find(x => x.id === id);
  if (c) await mcp.connect(c, connectorSecrets(id));
  const st = connectorsState(); broadcast('connectors:changed', st); return st;
});
ipcMain.handle('actions:list', () => store.listActions());
ipcMain.handle('actions:clear', () => { store.clearActions(); return []; });

// ---------------- Voice
async function micAccess() {
  if (process.platform !== 'darwin') return true;
  try { return await systemPreferences.askForMediaAccess('microphone'); } catch { return true; }
}
ipcMain.handle('voice:helperInfo', () => refreshHelperCaps());
ipcMain.handle('voice:listen', async (e, { id, locale }) => {
  if (!(await micAccess())) return { ok: false, error: 'Microphone access is off. Turn it on in System Settings → Privacy & Security → Microphone.' };
  listeners.set(id, e.sender);
  pauseWake('listen');
  if (!helper.send({ cmd: 'listen', id, locale: locale || '' })) {
    listeners.delete(id);
    resumeWake('listen');
    return { ok: false, error: 'On-device speech needs the NexusCore helper. Run "npm run build:helper", or pick OpenAI/ElevenLabs speech-to-text in Settings → Voice.' };
  }
  return { ok: true };
});
ipcMain.handle('voice:stop', (_e, { id }) => { helper.send({ cmd: 'stop', id }); return true; });
ipcMain.handle('voice:cancel', (_e, { id }) => { listeners.delete(id); helper.send({ cmd: 'cancel', id }); if (!listeners.size) resumeWake('listen'); return true; });
ipcMain.handle('wake:status', () => wakeStatus());
ipcMain.handle('voice:micAccess', () => micAccess());
// 3.9: is Nexus speech (free Whisper through Supabase) available? Checked once per session after sign-in.
let speechOk = null;
ipcMain.handle('voice:speechInfo', async () => {
  if (speechOk === null && cloud) speechOk = await cloud.speechAvailable();
  return { available: !!speechOk && !!cloud?.session, signedIn: !!cloud?.session, win: WIN };
});
// 3.12 voice notes: record, transcribe (same speech engine as dictation), keep the audio as an attachment
ipcMain.handle('voice:note', async (_e, { audio, mime, seconds = 0, engine = '' }) => {
  let text = '';
  const s = store.getSettings(), keyed = ['openai', 'groq', 'elevenlabs'].some(k => store.getKey(k));
  const first = engine || (s.voice.stt === 'nexus' || !keyed ? 'nexus' : '');
  try { let r = await transcribeAudio({ audio, mime, engine: first, seconds }); if (!r.ok && first !== 'nexus') r = await transcribeAudio({ audio, mime, engine: 'nexus', seconds }); text = r.ok ? r.text || '' : ''; } catch {}
  return attOk(() => attachments.fromVoice(audio, mime, text, seconds));
});
ipcMain.handle('voice:noteAudio', (_e, id) => { const a = attachments.audio(String(id || '')); return a ? { ok: true, mime: a.mime, bytes: a.bytes } : { ok: false }; });
ipcMain.handle('voice:transcribe', (_e, args) => transcribeAudio(args));
async function transcribeAudio({ audio, mime, engine = '', seconds = 0 }) {
  const s = store.getSettings();
  const buf = Buffer.from(audio);
  try {
    if (engine === 'nexus') return { ok: true, text: await cloud.speech(buf, mime, seconds, (s.voice.locale || app.getLocale() || '').slice(0, 2)) };
    const text = s.voice.stt === 'elevenlabs' ? await voice.sttElevenLabs({ key: store.getKey('elevenlabs'), audio: buf, mime })
      : s.voice.stt === 'groq' || (!store.getKey('openai') && store.getKey('groq')) ? await voice.sttGroq({ key: store.getKey('groq'), audio: buf, mime })
      : await voice.sttOpenAI({ key: store.getKey('openai'), audio: buf, mime });
    return { ok: true, text };
  } catch (err) { return { ok: false, error: err.message }; }
}
ipcMain.handle('voice:speak', async (_e, { text, purpose, persona, render = false }) => {
  const s = { ...store.getSettings().voice };
  if (purpose === 'read' && s.readAloud !== 'reply') s.tts = 'system'; // read-aloud → macOS System Voice (Siri)
  // Per-agent voice for whichever engine is speaking.
  const av = persona && s.agentVoices?.[persona]?.[s.tts];
  if (av) { if (s.tts === 'system') s.systemVoice = av; else if (s.tts === 'elevenlabs') s.elevenVoice = av; else if (s.tts === 'openai') s.openaiVoice = av; }
  const say = voice.speakable(text);
  if (!say) return { ok: true, done: true };
  try {
    if (s.tts === 'elevenlabs') {
      const r = await voice.ttsElevenLabs({ key: store.getKey('elevenlabs'), voice: s.elevenVoice, text: say });
      return { ok: true, audio: new Uint8Array(r.audio), mime: r.mime };
    }
    if (s.tts === 'openai') {
      const r = await voice.ttsOpenAI({ key: store.getKey('openai'), voice: s.openaiVoice, text: say });
      return { ok: true, audio: new Uint8Array(r.audio), mime: r.mime };
    }
    // v3.1: for read-along, render the macOS voice to audio first, so the highlight follows what you actually hear
    if (render && say.length <= 6000) {
      try { const r = await voice.renderSystem(say, { voice: s.systemVoice, rate: s.rate, lossless: true }); return { ok: true, audio: new Uint8Array(r.audio), mime: r.mime }; }
      catch { return { ok: true, renderFailed: true }; }      // the renderer falls back to plain `say` (estimated timing)
    }
    return { ...(await voice.speakSystem(say, { voice: s.systemVoice, rate: s.rate })), done: true };
  } catch (err) { return { ok: false, error: err.message }; }
});
// N28C read-aloud in your Mac's voice: the same engine and per-agent voice as Nexus's spoken replies on this Mac
// (ElevenLabs, OpenAI, or a macOS voice), rendered to audio and handed to the phone through companion_sync ("tts").
async function phoneTts({ text, agent }) {
  const s = { ...store.getSettings().voice };
  const av = agent && s.agentVoices?.[agent]?.[s.tts];
  if (av) { if (s.tts === 'system') s.systemVoice = av; else if (s.tts === 'elevenlabs') s.elevenVoice = av; else if (s.tts === 'openai') s.openaiVoice = av; }
  const say = voice.speakable(String(text || '')).slice(0, 3500);
  if (!say) throw new Error('Nothing to read.');
  let r;
  if (s.tts === 'elevenlabs' && store.getKey('elevenlabs')) r = await voice.ttsElevenLabs({ key: store.getKey('elevenlabs'), voice: s.elevenVoice, text: say });
  else if (s.tts === 'openai' && store.getKey('openai')) r = await voice.ttsOpenAI({ key: store.getKey('openai'), voice: s.openaiVoice, text: say });
  else r = await voice.renderSystem(say, { voice: s.systemVoice, rate: s.rate });
  const id = 't' + Date.now().toString(36);
  await companion.put('tts', { id, mime: r.mime, b64: r.audio.toString('base64') });
  return { id, mime: r.mime, bytes: r.audio.length };
}
const ttsLabel = () => { const s = store.getSettings().voice; return s.tts === 'elevenlabs' && store.getKey('elevenlabs') ? 'ElevenLabs' : s.tts === 'openai' && store.getKey('openai') ? `OpenAI · ${s.openaiVoice}` : `macOS · ${s.systemVoice || 'System Voice'}`; };
ipcMain.handle('voice:stopSpeaking', () => { voice.stopSpeaking(); return true; });
ipcMain.handle('voice:systemVoices', () => voice.listSystemVoices());

// ---------------- Attachments, screen, quick answers, export, feedback
const attOk = async fn => { try { return { ok: true, attachment: attachments.public(await fn()) }; } catch (e) { return { ok: false, error: e.message, permission: !!e.permission }; } };
ipcMain.handle('files:pick', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [
    { name: 'Images, videos, PDFs and text', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'mp4', 'mov', 'm4v', 'webm', 'pdf', 'txt', 'md', 'csv', 'json', 'html', 'js', 'ts', 'py', 'swift', 'css', 'xml', 'yaml', 'yml', 'log'] },
    { name: 'All files', extensions: ['*'] }] });
  if (r.canceled) return [];
  const out = [];
  for (const f of r.filePaths.slice(0, 6)) out.push(await attOk(() => attachments.fromPath(f)));
  return out;
});
ipcMain.handle('files:add', async (_e, paths) => { const out = []; for (const f of (paths || []).slice(0, 6)) out.push(await attOk(() => attachments.fromPath(f))); return out; });
ipcMain.handle('files:addData', (_e, { name, mime, bytes }) => attOk(() => attachments.fromData(name, mime, bytes)));
ipcMain.handle('screen:capture', async (_e, opts) => { const r = await attOk(() => screenAware.capture(opts || {})); if (r.ok) recordMetric('screen'); return r; });
ipcMain.handle('screen:permission', () => screenAware.permission());
ipcMain.handle('screen:openPermission', () => { screenAware.openPermission(); return true; });
// Study: flashcard decks with spaced repetition
const studyState = () => ({ decks: study.decks(), stats: study.stats() });
const studyChanged = () => { const st = studyState(); broadcast('study:changed', st); companion?.mark('study', 'status'); return st; };
const sOk = fn => { try { const r = fn(); studyChanged(); return { ok: true, ...(r && typeof r === 'object' && !Array.isArray(r) ? r : { result: r }) }; } catch (e) { return { ok: false, error: e.message }; } };
ipcMain.handle('study:state', () => studyState());
ipcMain.handle('study:createDeck', (_e, name) => sOk(() => ({ deck: study.createDeck({ name }) })));
ipcMain.handle('study:renameDeck', (_e, { id, name }) => sOk(() => ({ deck: study.renameDeck(id, name) })));
ipcMain.handle('study:removeDeck', (_e, id) => sOk(() => study.removeDeck(id)));
ipcMain.handle('study:cards', (_e, deckId) => study.cards(deckId));
ipcMain.handle('study:addCards', (_e, { deck, cards, source }) => sOk(() => { const r = study.addCards(deck, cards, { source }); if (r.added) recordMetric('study_cards'); return r; }));
ipcMain.handle('study:editCard', (_e, { id, front, back }) => sOk(() => ({ card: study.editCard(id, { front, back }) })));
ipcMain.handle('study:removeCard', (_e, id) => sOk(() => study.removeCard(id)));
ipcMain.handle('study:queue', (_e, deckId) => study.queue(deckId || null));
ipcMain.handle('study:review', (_e, { cardId, grade }) => sOk(() => { const c = study.review(cardId, grade); recordMetric('study_review'); return { card: c }; }));
ipcMain.handle('study:practice', (_e, deckId) => { try { return { ok: true, questions: study.practice(deckId) }; } catch (e) { return { ok: false, error: e.message }; } });
// "Make a deck about…": an agent writes the cards (no tools), Nexus saves them.
ipcMain.handle('study:makeDeck', (_e, args) => makeDeck(args));
async function makeDeck({ topic, count = 12, agent, source = '' }) {
  topic = String(topic || '').trim().slice(0, 200);
  if (topic.length < 3) return { ok: false, error: 'What should the deck be about?' };
  const s = store.getSettings();
  const pick = [agent, 'neodela', 'lyte', 'flash'].filter(Boolean).find(id => { const p = allPersonas().find(x => x.id === id); return p && accessDecision(p, bindingFor(p, s), s, allPersonas()).mode !== 'blocked'; });
  const n = Math.max(4, Math.min(30, +count || 12));
  const res = await runChat({ personaId: pick || 'flash', noTools: true, noHandoff: true, messages: [{ role: 'user', content: source ? `Make ${n} flashcards to study what's in these chats of mine ("${topic}"). Cover the facts and ideas, not the chatting.\n\n${source}` : `Make ${n} flashcards to study: ${topic}` }],
    systemExtra: `\n\n[FLASHCARD MAKER] Reply with ONLY a fenced code block with the language tag nexus-flashcards containing JSON: {"title":"short deck name","cards":[{"front":"question or term","back":"short answer"}]}. Exactly ${n} cards, accurate, one fact per card, answers under 25 words.` });
  if (!res.ok) return { ok: false, error: res.error };
  const parsed = cardsFromText(res.text);
  if (!parsed.cards.length) return { ok: false, error: "The agent didn't return usable cards. Try again or pick another agent." };
  const r = study.addCards({ name: parsed.title || topic.replace(/^./, c => c.toUpperCase()).slice(0, 60) }, parsed.cards, { source: { topic, agent: pick } });
  recordMetric('study_cards'); studyChanged();
  return { ok: true, deck: r.deck, added: r.added, agent: pick };
}

// Agents together: Huddle + Debate
const groupNames = id => allPersonas().find(p => p.id === id)?.name || id;
function groupAsk({ personaId, history, systemExtra, signal, noTools }) {
  return runChat({ personaId, messages: toApi(history, personaId), systemExtra, signal, noTools, noHandoff: true, maxSteps: 4, confirm: async () => false, interactive: true });
}
let group = null;
ipcMain.handle('group:huddle', async (_e, opts) => {
  try { const r = await group.huddle(opts || {}); recordMetric('huddle'); return { ok: r.ok, id: r.id }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('group:debate', async (_e, opts) => {
  try { const r = await group.debate(opts || {}); recordMetric('debate'); return { ok: true, id: r.id, convId: r.convId }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('group:stop', (_e, id) => id ? group.stop(id) : (group.stopAll(), true));

// CodeComplex: run JavaScript in a locked-down hidden window (Chromium sandbox, no Node, no network), 3 s limit.
let runner = null;
async function runJS(code) {
  if (!runner || runner.isDestroyed()) {
    const ses = session.fromPartition('nexus-code-runner');
    ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(data|about|devtools):/.test(d.url) }));
    ses.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    runner = new BrowserWindow({ show: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, webSecurity: true } });
    runner.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    runner.webContents.on('will-navigate', e => e.preventDefault());
    await runner.loadURL('data:text/html,<meta charset=utf-8><title>run</title>');
  }
  const wrapped = `(async () => { const out = []; const fmt = v => { try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2) ?? String(v); } catch { return String(v); } };
    const con = { log: (...a) => out.push(a.map(fmt).join(' ')), info: (...a) => out.push(a.map(fmt).join(' ')), warn: (...a) => out.push('⚠ ' + a.map(fmt).join(' ')), error: (...a) => out.push('✖ ' + a.map(fmt).join(' ')), table: v => out.push(fmt(v)) };
    try { const fn = new (Object.getPrototypeOf(async function () {}).constructor)('console', ${JSON.stringify('"use strict";\n' + String(code).slice(0, 20000))}); const r = await fn(con); if (r !== undefined) out.push('→ ' + fmt(r)); return { ok: true, out: out.join('\\n').slice(0, 8000) }; }
    catch (e) { return { ok: false, out: out.join('\\n').slice(0, 8000), error: String(e && e.message || e) }; } })()`;
  const timeout = new Promise(res => setTimeout(() => res({ ok: false, error: 'Stopped after 3 seconds (infinite loop?)', timeout: true }), 3000));
  const r = await Promise.race([runner.webContents.executeJavaScript(wrapped, true), timeout]);
  if (r.timeout) { try { runner.destroy(); } catch {} runner = null; }
  return r;
}
ipcMain.handle('code:run', async (_e, code) => { try { return await runJS(code); } catch (e) { return { ok: false, error: e.message }; } });
const LANG_EXT = { javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', swift: 'swift', bash: 'sh', sh: 'sh', zsh: 'sh', sql: 'sql', java: 'java', c: 'c', cpp: 'cpp', go: 'go', rust: 'rs', ruby: 'rb', php: 'php', svg: 'svg', md: 'md', markdown: 'md', yaml: 'yml', xml: 'xml', kotlin: 'kt', csharp: 'cs' };
ipcMain.handle('code:save', async (e, { code, lang }) => {
  const ext = LANG_EXT[String(lang || '').toLowerCase()] || 'txt';
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = process.env.NEXUS_TEST_EXPORT_DIR ? { filePath: path.join(process.env.NEXUS_TEST_EXPORT_DIR, `snippet.${ext}`) }
    : await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), `snippet.${ext}`) });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { fsLog.writeFileSync(r.filePath, String(code)); return { ok: true, path: r.filePath }; } catch (err) { return { ok: false, error: err.message }; }
});
// Proactix 2.0 "Remind me": an Apple Reminder when Reminders is on, otherwise say how to turn it on.
ipcMain.handle('reminder:add', async (_e, title) => {
  const s = store.getSettings();
  if (!helperCaps.eventkit || !s.apple?.reminders) return { ok: false, error: 'Turn on Apple Reminders in Settings → Connectors to add reminders.' };
  try { const ev = await helper.request({ cmd: 'rem_create', id: 'rem-' + Date.now(), title: String(title).slice(0, 200), notes: 'Added by Nexus' }, ['result'], 15000); return { ok: true, list: ev.data?.list }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Your Mac
ipcMain.handle('mac:axStatus', () => ({ trusted: axTrusted(false), mac: process.platform === 'darwin' }));
ipcMain.handle('mac:axOpen', () => { openAccessibility(); return true; });
ipcMain.handle('mac:selection', async (_e, opts) => {
  const r = await readSelection();
  if (r.denied && !opts?.quiet) openAccessibility();
  if (!r.text) return { ok: false, error: r.error, accessibility: !!r.denied };
  return { ok: true, attachment: attachments.public(attachments.fromText(r.text, `Selected text${r.app ? ' · ' + r.app : ''}`)), app: r.app, preview: r.text.slice(0, 280) };
});
ipcMain.handle('mac:timers', () => mac.listTimers());
ipcMain.handle('mac:cancelTimer', (_e, id) => mac.cancelTimer(id));
ipcMain.handle('clip:list', () => store.getSettings().clipboard.history === false ? [] : clipHist.list());
// 3.7 beta smart clipboard chips: something you copied in the last few minutes, and what to do with it
let clipOffered = '';
ipcMain.handle('clip:suggest', () => {
  if (!flagOn('clip_chips') || store.getSettings().clipChips === false) return null;
  let text = '', at = 0;
  const top = store.getSettings().clipboard.history === false ? null : clipHist?.list?.()[0];
  if (top) { text = top.text; at = top.at; } else { try { text = clipboard.readText(); at = Date.now(); } catch {} }
  if (!text || Date.now() - at > 3 * 60e3) return null;
  const key = text.slice(0, 200); if (key === clipOffered) return null;
  const r = require('./src/clipkind').classify(text); if (!r) return null;
  clipOffered = key; betaEvent('clip_chips');
  return { ...r, preview: text.replace(/\s+/g, ' ').slice(0, 90) };
});
ipcMain.handle('clip:copy', async (_e, id) => { const it = clipHist.get(id); if (it) await clipboard.writeText(it.text); return !!it; });
ipcMain.handle('clip:remove', (_e, id) => { clipHist.remove(id); return clipHist.list(); });
ipcMain.handle('clip:clear', () => { clipHist.clear(); return []; });
ipcMain.handle('clip:attach', (_e, id) => {
  const it = clipHist.get(id);
  if (!it) return { ok: false, error: 'That clipboard item is gone.' };
  const first = it.text.trim().split('\n')[0].slice(0, 40);
  return { ok: true, attachment: attachments.public(attachments.fromText(it.text, `Copied · ${first || 'text'}`)) };
});
ipcMain.handle('files:find', async (_e, q) => {
  if (store.getSettings().files.enabled === false) return { ok: false, error: 'The file finder is off (Settings → Mac).' };
  try { return { ok: true, files: await mac.findFiles(typeof q === 'string' ? { query: q, limit: 8 } : { limit: 8, ...q }) }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('files:open', async (_e, p) => { const err = await shell.openPath(String(p || '')); return err ? { ok: false, error: err } : { ok: true }; });
ipcMain.handle('files:reveal', (_e, p) => { shell.showItemInFolder(String(p || '')); return true; });
ipcMain.handle('files:attachPath', (_e, p) => attOk(() => attachments.fromPath(String(p || ''))));
ipcMain.handle('watch:windows', async () => { try { return { ok: true, windows: await watchWindows() }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('watch:start', (_e, opts) => { try { return { ok: true, watch: watcher.start(opts || {}) }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('watch:front', async (_e, condition) => { try { return { ok: true, watch: await watchFront(condition) }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('watch:stop', (_e, id) => watcher.stop(id));
ipcMain.handle('watch:dismiss', (_e, id) => { watcher.dismiss(id); return watcher.state(); });
ipcMain.handle('watch:state', () => watcher.state());
ipcMain.handle('quick:calc', (_e, text) => { const r = quickcalc.quick(text); if (r && !r.error) recordMetric('calc'); return r; });

let mdRender = null;
function renderMarkdown(md) {
  if (!mdRender) { const ctx = { window: {} }; require('vm').runInNewContext(require('fs').readFileSync(path.join(__dirname, 'renderer', 'markdown.js'), 'utf8'), ctx); mdRender = ctx.window.NexusMarkdown.render; }
  return mdRender(md);
}
ipcMain.handle('export:chat', async (e, { convId, format, ts }) => {
  let conv = convos.get(convId) || convos.active();
  // One reply (Monolog "Export"): that reply plus the question it answered.
  if (conv && ts) {
    const i = conv.messages.findIndex(m => m.ts === ts);
    if (i < 0) return { ok: false, error: 'That reply is gone.' };
    const q = [...conv.messages.slice(0, i)].reverse().find(m => m.role === 'user' && !m.hidden);
    const first = String(conv.messages[i].content || '').match(/^#{1,3}\s+(.+)$/m)?.[1];
    conv = { ...conv, title: (first || conv.title).slice(0, 80), messages: [...(q ? [q] : []), conv.messages[i]] };
  }
  const f = exporter.FORMATS[format];
  if (!conv || !f) return { ok: false, error: 'Nothing to export.' };
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = process.env.NEXUS_TEST_EXPORT_DIR ? { filePath: path.join(process.env.NEXUS_TEST_EXPORT_DIR, `${exporter.safeName(conv.title)}.${f.ext}`) }
    : await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), `${exporter.safeName(conv.title)}.${f.ext}`), filters: [{ name: f.label, extensions: [f.ext] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  const all = allPersonas();
  try {
    let data;
    if (format === 'md') data = exporter.toMarkdown(conv, all);
    else if (format === 'txt') data = exporter.toText(conv, all);
    else if (format === 'json') data = exporter.toJSON(conv, all);
    else if (format === 'docx') data = await exporter.toDocx(conv, all);
    else {
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      try {
        await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(exporter.toHTML(conv, all, renderMarkdown)));
        data = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'Letter', margins: { marginType: 'default' } });
      } finally { pdfWin.destroy(); }
    }
    require('fs').writeFileSync(r.filePath, data);
    recordMetric('export');
    return { ok: true, path: r.filePath };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('export:reveal', (_e, p) => { if (p) shell.showItemInFolder(p); return true; });

// Feedback goes to the developer by email (same address as the web Nexus), with optional app details.
const FEEDBACK_TO = 'apojidelegraphics101010@gmail.com';
function appInfo() {
  const s = store.getSettings();
  const p = allPersonas().find(x => x.id === s.activePersona);
  const fl = flagState();
  return [`Nexus '28 v${app.getVersion()} (desktop)`, `macOS ${process.getSystemVersion?.() || ''} · ${process.arch}`,
    `Agent: ${p?.name || s.activePersona} · Model: ${bindingFor(p || allPersonas()[0], s).provider || ''}`,
    `Channel: ${fl.realChannel}${fl.channel !== fl.realChannel ? ` (previewing ${fl.channel})` : ''} · Signed in: ${cloud.session ? 'yes' : 'no'} · Helper: ${helperCaps.built ? 'v' + (helperCaps.version || '?') : 'not built'}`].join('\n');
}
// GitHub issue (public) or email (private). GitHub opens a prefilled "New issue" page; nothing is posted until you submit it.
function githubIssueUrl({ title, body, labels = [], template = '' }) {
  const q = new URLSearchParams({ title: String(title).slice(0, 200), body: String(body).slice(0, 6000) });
  if (labels.length) q.set('labels', labels.join(','));
  if (template) q.set('template', template);
  return `https://github.com/${GITHUB_REPO}/issues/new?${q}`;
}
// v2.2: feedback also goes to the admin portal's inbox (when you're signed in); admins reply there and you see it here
// v3.1: every report reaches the Apoji Team's inbox in Apoji Admin, whichever way it's sent (Apoji Team, GitHub or
// email) and even when you're not signed in. `channel` says which way it went.
async function attachFeedbackPictures(id, pictures) {
  const paths = [];
  for (const [i, p] of pictures.slice(0, 4).entries()) {
    const m = String(p || '').match(/^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/); if (!m) continue;
    const buf = Buffer.from(m[3], 'base64'); if (buf.length > 6e6) continue;
    paths.push(await cloud.uploadFeedbackFile(`${id}-${Date.now()}-${i}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`, buf, m[1]));
  }
  if (paths.length) await cloud.write('PATCH', `feedback_reports?id=eq.${id}`, { attachments: paths }, 'return=minimal');
  return paths;
}
// 3.8: a screenshot of the Nexus window, for a bug report
ipcMain.handle('feedback:shot', async () => { try { const w = hud && !hud.isDestroyed() ? hud : null; if (!w) return { ok: false }; const img = await w.webContents.capturePage(); return { ok: true, data: img.resize({ width: Math.min(1600, img.getSize().width) }).toDataURL() }; } catch (e) { return { ok: false, error: e.message }; } });
async function saveFeedback({ type, text, includeInfo, feature, channel = 'app' }) {
  if (!String(text).trim()) return { saved: false };
  const a = cloud.account();
  const kind = /bug/i.test(type) ? 'bug' : /feature|idea/i.test(type) ? 'feature' : /beta/i.test(type) ? 'beta' : 'feedback';
  const body = String(text).trim(), title = (body.split('\n')[0] || type).slice(0, 150), info = includeInfo ? appInfo().slice(0, 4000) : '';
  const err = e => /feedback_reports|42P01|PGRST20|404/.test(e.message) ? '' : e.message.replace(/^Nexus cloud \d+: /, '');
  if (!a.signedIn) {
    try { const r = await cloud.anonRpc('submit_feedback_anon', { p_kind: kind, p_title: title, p_body: body.slice(0, 8000), p_info: info, p_version: app.getVersion(), p_channel: channel }); return { saved: !!r?.success }; }
    catch (e) { return { saved: false, error: err(e) }; }
  }
  const row = { email: a.email || '', username: String(a.username || '').slice(0, 60), kind, title, body: body.slice(0, 8000), feature: String(feature || '').slice(0, 60), info, app_version: app.getVersion(), source: 'desktop' };
  try {
    const rows = await cloud.write('POST', 'feedback_reports', { ...row, channel });
    return { saved: true, id: rows?.[0]?.id };
  } catch (e) {
    if (/channel/.test(e.message)) try { const rows = await cloud.write('POST', 'feedback_reports', row); return { saved: true, id: rows?.[0]?.id }; } catch (e2) { return { saved: false, error: err(e2) }; }   // before nexus-v3.1.sql
    return { saved: false, error: err(e) };
  }
}
ipcMain.handle('feedback:mine', async () => {
  if (!cloud.session) return { ok: true, reports: [], signedIn: false };
  try {
    const reports = await cloud.authedGet('feedback_reports?select=id,kind,title,body,status,created_at,updated_at,reply_at,user_seen_at&order=updated_at.desc&limit=30');
    const ids = reports.map(r => r.id);
    const replies = ids.length ? await cloud.authedGet(`feedback_replies?select=id,report_id,author_name,is_staff,body,created_at&report_id=in.(${ids.join(',')})&order=id`) : [];
    return { ok: true, signedIn: true, reports: reports.map(r => ({ ...r, replies: replies.filter(x => x.report_id === r.id), unread: !!r.reply_at && (!r.user_seen_at || r.reply_at > r.user_seen_at) })) };
  } catch (e) { return { ok: false, error: /feedback_reports|42P01|PGRST20|404/.test(e.message) ? 'Feedback replies need the v2.2 Supabase SQL.' : e.message }; }
});
ipcMain.handle('feedback:reply', async (_e, { id, body }) => {
  try { await cloud.write('POST', 'feedback_replies', { report_id: +id, body: String(body || '').trim().slice(0, 4000), author_name: String(cloud.account().username || '').slice(0, 60) }, 'return=minimal'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message.replace(/^Nexus cloud \d+: /, '') }; }
});
ipcMain.handle('feedback:seen', async (_e, id) => { try { await cloud.rpc('feedback_mark_seen', { p_report: +id }); } catch {} return { ok: true }; });
// Replies from the Apoji Team → a notification (checked with each cloud sync)
// v2.3: a broadcast from the Apoji Team → one Mac notification (and one on your phone) per broadcast, ever
function deliverBroadcasts() {
  const list = cloud.broadcasts || []; if (!list.length) return;
  const s = store.getSettings(), seen = s.broadcastsSeen || [];
  const fresh = list.filter(b => !seen.includes(b.id));
  if (!fresh.length) return;
  for (const b of fresh.slice(0, 3)) {
    notify(`📡 ${b.title}`, b.body || "From the Nexus '28 team", () => { if (b.url) shell.openExternal(b.url); else showHud(); });
    if (b.phone) push?.send('broadcast', { title: `📡 ${b.title}`, body: b.body || "From the Nexus '28 team", tag: 'bc-' + b.id, url: b.url || './' }).catch(() => {});
  }
  store.setSettings({ broadcastsSeen: [...seen, ...fresh.map(b => b.id)].slice(-60) });
}
async function checkFeedbackReplies() {
  if (!cloud.session) return;
  try {
    const rows = await cloud.authedGet('feedback_reports?select=id,title,reply_at,user_seen_at&reply_at=not.is.null&order=reply_at.desc&limit=10');
    const seen = store.getSettings().feedbackNotified || {};
    const fresh = rows.filter(r => (!r.user_seen_at || r.reply_at > r.user_seen_at) && seen[r.id] !== r.reply_at);
    if (!fresh.length) return;
    notify('📮 The Apoji Team replied', fresh.length === 1 ? `About “${fresh[0].title}”` : `${fresh.length} of your reports have replies`, () => { showHud(); broadcast('feedback:open', { id: fresh[0].id }); });
    const next = { ...seen }; for (const r of fresh) next[r.id] = r.reply_at;
    store.setSettings({ feedbackNotified: Object.fromEntries(Object.entries(next).slice(-50)) });
    broadcast('feedback:unread', fresh.length);
  } catch {}
}
// Reporting something in Shared Spaces / a shared agent (goes to the admin portal's Reports)
ipcMain.handle('content:report', async (_e, { kind, targetId, label = '', reason = 'other', details = '' }) => {
  if (!['space', 'post', 'agent', 'session'].includes(kind) || !targetId) return { ok: false, error: 'Nothing to report.' };
  try { await cloud.write('POST', 'content_reports', { kind, target_id: String(targetId).slice(0, 80), target_label: String(label).slice(0, 200), reason: ['spam', 'harassment', 'inappropriate', 'cheating', 'other'].includes(reason) ? reason : 'other', details: String(details).slice(0, 1000) }, 'return=minimal'); return { ok: true }; }
  catch (e) { return { ok: false, error: /duplicate|23505/.test(e.message) ? 'You already reported this. Thanks!' : /content_reports|42P01|404/.test(e.message) ? 'Reporting needs the v2.2 Supabase SQL.' : e.message.replace(/^Nexus cloud \d+: /, '') }; }
});
ipcMain.handle('feedback:send', async (_e, { type = 'General Feedback', text = '', includeInfo = true, to = 'email', feature = '', pictures = [] }) => {
  const info = includeInfo ? `\n\n=== App details ===\n${appInfo()}` : '';
  const inbox = await saveFeedback({ type, text, includeInfo, feature, channel: to === 'inbox' ? 'app' : to === 'github' ? 'github' : 'email' });
  // 3.8: screenshots go with the copy in the Apoji Team inbox (private storage; only you and the team can see them)
  if (inbox.saved && inbox.id && pictures.length) attachFeedbackPictures(inbox.id, pictures).catch(e => log('feedback pictures', e.message));
  if (to === 'inbox') return inbox.saved ? { ok: true, to: 'inbox', inbox: true } : { ok: false, error: inbox.error || 'Sign in to your Nexus account to send feedback here, or pick email / GitHub.' };
  const what = String(text).trim() || '(describe your feedback here)';
  if (to === 'github') {
    const label = /bug/i.test(type) ? 'bug' : /feature/i.test(type) ? 'enhancement' : /beta/i.test(type) ? 'beta' : 'feedback';
    const title = `${type}${feature ? ` (${feature})` : ''}: ${what.split('\n')[0].slice(0, 70)}`;
    shell.openExternal(githubIssueUrl({ title, body: `${what}${info}`, labels: [label, ...(feature ? ['beta'] : [])] }));
    return { ok: true, to: 'github', inbox: inbox.saved };
  }
  const subject = `Nexus '28 v${app.getVersion()} ${type}${feature ? ` — ${feature}` : ''}`;
  shell.openExternal(`mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(what + info)}`);
  return { ok: true, to: FEEDBACK_TO, inbox: inbox.saved };
});
// Beta tester sign-up. GitHub issues are public, so the email address is only included in the email version.
// Beta tester sign-up (v2.0, Settings → Profile): saved to public.beta_requests (the admin portal's queue — admins
// approve with one click), then a prefilled GitHub issue and email open so the request also reaches the developer.
ipcMain.handle('beta:signup', async (_e, { why = '', uses = '', to = 'all' } = {}) => {
  const a = cloud.account();
  why = String(why).trim().slice(0, 2000); uses = String(uses).trim().slice(0, 1000);
  let saved = false, already = false, error = '';
  if (a.signedIn) {
    try {
      await cloud.write('POST', 'beta_requests', { email: a.email || '', username: String(a.username || '').slice(0, 60), why, uses, app_version: app.getVersion(), source: 'desktop' }, 'return=minimal');
      saved = true;
    } catch (e) { if (/duplicate|23505|unique/i.test(e.message)) already = true; else error = /beta_requests|42P01|404/.test(e.message) ? 'The beta request list isn\'t set up yet (v2.0 SQL).' : e.message; }
  }
  const who = a.signedIn ? `${a.username || '(no username)'}` : '(not signed in to a Nexus account)';
  const body = [`**Nexus account:** ${who}`, `**Why I want to test:** ${why || '—'}`, `**What I use Nexus for:** ${uses || '—'}`, saved ? '_Also saved to the admin portal\'s Beta requests._' : '', '', '=== App details ===', appInfo(),
    '', a.signedIn ? '' : '_To get beta features, sign in to a Nexus account in the app (Settings → Profile) so an admin can turn on beta for it._'].join('\n');
  if (to === 'all' || to === 'github') shell.openExternal(githubIssueUrl({ title: `Beta tester sign-up: ${a.signedIn ? a.username || 'Nexus user' : 'Nexus user'}`, body, labels: ['beta-signup'] }));
  if (to === 'all' || to === 'email') setTimeout(() => shell.openExternal(`mailto:${FEEDBACK_TO}?subject=${encodeURIComponent("Nexus '28 beta tester sign-up")}&body=${encodeURIComponent(body.replace(/\*\*/g, '').replace(/_/g, '').replace(/Nexus account: .*/, `Nexus account: ${who} <${a.email || 'no email'}>`))}`), 1200);
  return { ok: true, to, signedIn: !!a.signedIn, saved, already, error };
});
ipcMain.handle('beta:myRequest', async () => {
  if (!cloud.session) return null;
  try { return (await cloud.authedGet('beta_requests?select=status,created_at,note&order=created_at.desc&limit=1'))[0] || null; } catch { return null; }
});
ipcMain.handle('flags:state', () => flagState());
// 3.7 one-tap beta report: what you typed + which beta feature + everything Apoji needs to reproduce it, straight to
// the Apoji Admin inbox (Feedback & bugs, tagged with the feature, counted on the Beta dashboard)
// 3.7 Beta dashboard: a tiny event when a beta feature gets used (once a day per feature) or rated 👍 / 👎. No text
// from your chats, only the feature's name, your platform and a note if you typed one.
const betaSeen = new Map();
// 3.8: "active on" for Apoji Admin — which app you're using right now (one tiny row per app, every 2 minutes)
function presenceTick() { if (cloud?.session) cloud.rpc('presence_ping', { p_surface: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux', p_version: app.getVersion() }).catch(() => {}); }
// 3.8: right after signing in: a temporary password must be replaced, and beta testers' training consent is loaded
async function afterSignIn() {
  speechOk = null;
  if (!cloud?.session) return;
  if (cloud.account().mustChangePassword) { try { showHud(); setTimeout(() => hud?.webContents.send('settings:openTab', 'account'), 900); } catch {} notify("Nexus '28", 'Pick a new password: you signed in with a temporary one.'); }
  await training.refresh().catch(() => {});
  statSync?.start(); statSync?.cycle?.().catch?.(() => {});   // 3.11.1: also when you sign in after Nexus started
  broadcast('flags:changed', flagState());
  setTimeout(askTraining, 25e3);   // 3.10
}
// 3.7: who this computer is to N28C and chat sync: { id, name, platform } (the id stays the same for this install)
function thisDevice() {
  const s = store.getSettings();
  let id = s.chatSync?.device;
  if (!id) { id = `${require('os').hostname().slice(0, 40)}#${Math.random().toString(36).slice(2, 8)}`; store.setSettings({ chatSync: { ...(s.chatSync || {}), device: id } }); }
  const host = require('os').hostname().replace(/\.local$/, '').slice(0, 40);
  return { id, name: s.deviceName || host || (process.platform === 'win32' ? 'PC' : 'Mac'), platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux' };
}
function betaEvent(feature, kind = 'use', note = null) {
  try {
    if (!cloud?.session || !/^[a-z0-9_]{2,48}$/.test(feature)) return;
    if (kind === 'use') { const k = feature + new Date().toDateString(); if (betaSeen.has(k)) return; betaSeen.set(k, 1); }
    cloud.write('POST', 'beta_events', { feature, kind, platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'other', note: note ? String(note).slice(0, 500) : null }, 'return=minimal').catch(() => {});
  } catch {}
}
ipcMain.on('win:ctl', (e, a) => { const w = BrowserWindow.fromWebContents(e.sender); if (!w || w === hud) return; if (a === 'close') w.close(); else if (a === 'min') w.minimize(); else if (a === 'max') w.isMaximized() ? w.unmaximize() : w.maximize(); });
// 3.9: a mind map of your chats, in its own window (src/mindmap.js builds it; renderer/mindmap.html draws it)
let mindWin = null;
ipcMain.handle('mindmap:open', () => {
  if (mindWin && !mindWin.isDestroyed()) { mindWin.show(); mindWin.focus(); return true; }
  // 4.0.4: looks like the Nexus window (rounded, no system title bar), not a standard window
  mindWin = new BrowserWindow({ width: 1180, height: 780, minWidth: 640, minHeight: 460, title: 'Mind map of your chats', frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: true, show: false, autoHideMenuBar: true, webPreferences });
  mindWin.loadFile(path.join(__dirname, 'renderer', 'mindmap.html'));
  mindWin.once('ready-to-show', () => mindWin.show());
  mindWin.on('closed', () => { mindWin = null; });
  return true;
});
ipcMain.handle('mindmap:data', () => { const d = convos.load(); const smart = flagOn('smart_topics') ? smartTopics(d.list) : null; return { ...require('./src/mindmap').build({ list: d.list, spaces: d.spaces || [], topics: smart }), flags: { askMap: flagOn('ask_map'), smartTopics: !!smart, smartPending: flagOn('smart_topics') && !smart }, mode: store.getSettings().mindmapMode || 'tree', settings: { theme: store.getSettings().theme, customThemes: store.getSettings().customThemes || [] }, personas: publicPersonas().map(p => ({ id: p.id, name: p.name, color: p.color })) }; });
// 3.10: tree / graph remembered; Ask the map; a study deck from a branch; Smarter topics (beta)
ipcMain.handle('mindmap:setMode', (_e, m) => { store.setSettings({ mindmapMode: m === 'graph' ? 'graph' : 'tree' }); return true; });
function chatDigest(ids, { perChat = 6, chars = 280, max = 40 } = {}) {
  return ids.slice(0, max).map(id => convos.get(id)).filter(c => c && !c.incognito).map(c => `### ${c.title || 'Chat'} (${new Date(c.updated || Date.now()).toLocaleDateString()})\n`
    + (c.messages || []).filter(m => !m.hidden && typeof m.content === 'string').slice(-perChat).map(m => `${m.role === 'user' ? 'Me' : 'Nexus'}: ${m.content.replace(/\s+/g, ' ').slice(0, chars)}`).join('\n')).join('\n\n');
}
ipcMain.handle('mindmap:ask', async (_e, { question, ids = [], branch = '' }) => {
  if (!flagOn('ask_map')) return { ok: false, error: 'Ask the map is switched off right now.' };
  const q = String(question || '').trim().slice(0, 600); if (q.length < 3) return { ok: false, error: 'What do you want to know?' };
  const all = ids.length ? ids : convos.load().list.filter(c => !c.incognito).sort((a, b) => (b.updated || 0) - (a.updated || 0)).map(c => c.id);
  const digest = chatDigest(all, { perChat: all.length > 20 ? 3 : 6 });
  if (!digest) return { ok: false, error: 'No chats there yet.' };
  const s = store.getSettings();
  const pick = ['lyte', 'flash'].find(id => { const p = allPersonas().find(x => x.id === id); return p && accessDecision(p, bindingFor(p, s), s, allPersonas()).mode !== 'blocked'; }) || 'flash';
  const res = await runChat({ personaId: pick, noTools: true, noHandoff: true, noMemory: true, messages: [{ role: 'user', content: q }],
    systemExtra: `\n\n[ASK THE MAP] The user is looking at a mind map of their own chats${branch ? ` (the branch "${branch}")` : ''} and asks about them. Answer from these chats only, briefly, and name the chats you mean in **bold**. If the chats don't say, say so.\n\n${digest.slice(0, 14000)}` });
  return res.ok ? { ok: true, text: res.text, agent: pick } : { ok: false, error: res.error };
});
ipcMain.handle('mindmap:makeDeck', async (_e, { ids = [], name = '' }) => {
  const digest = chatDigest(ids, { perChat: 8, chars: 400, max: 15 });
  if (!digest) return { ok: false, error: 'No chats in that branch.' };
  return makeDeck({ topic: String(name || 'These chats').slice(0, 80), count: Math.min(20, 6 + ids.length * 2), source: digest.slice(0, 12000) });
});
let smartBusy = false;
function smartTopics(list) {
  const chats = list.filter(c => !c.incognito && !c.spaceId && (c.messages || []).some(m => m.role === 'user')).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 150);
  if (chats.length < 4) return null;
  const key = require('crypto').createHash('sha1').update(chats.map(c => c.id + '|' + c.title).join('\n')).digest('hex');
  const file = path.join(app.getPath('userData'), 'mindtopics.json');
  let cache = null; try { cache = JSON.parse(fsLog.readFileSync(file, 'utf8')); } catch {}
  if (cache?.key === key) return cache.topics;
  if (!smartBusy) {
    smartBusy = true;
    const mm = require('./src/mindmap');
    runChat({ personaId: 'flash', noTools: true, noHandoff: true, noMemory: true, messages: [{ role: 'user', content: mm.topicsPrompt(chats) }], systemExtra: '\n\n[TOPIC SORTER] Reply with JSON only.' })
      .then(r => { const t = r.ok && mm.parseTopics(r.text, chats); if (t) { fsLog.writeFileSync(file, JSON.stringify({ key, topics: t, at: Date.now() })); if (mindWin && !mindWin.isDestroyed()) mindWin.webContents.send('mindmap:changed'); } })
      .catch(e => log('smart topics', e.message)).finally(() => { smartBusy = false; });
  }
  return cache?.topics || null;   // the last good sort while the new one is made
}
// 3.10 Backlinks: chats that link here, and chats about the same things
ipcMain.handle('conv:backlinks', (_e, id) => { const c = convos.get(id); if (!c) return { linked: [], linksTo: [], similar: [] }; return require('./src/mindmap').backlinks({ list: convos.load().list.filter(x => !x.incognito), id }); });
// 3.10 Continue on my other computer (beta): the open chat goes to your other Mac / PC through your account
ipcMain.handle('handoff:send', async (_e, id) => {
  if (!flagOn('continue_on')) return { ok: false, error: 'This is switched off right now.' };
  if (!cloud?.session) return { ok: false, error: 'Sign in on both computers first.' };
  const c = convos.get(id); if (!c || c.incognito) return { ok: false, error: c?.incognito ? 'Incognito chats stay on this computer.' : 'Open a chat first.' };
  const conv = { id: c.id, title: c.title, created: c.created, updated: c.updated, spaceId: null, messages: (c.messages || []).slice(-80).map(m => ({ ...m, attachments: undefined })) };
  const data = { conv, from: thisDevice(), at: Date.now() };
  if (JSON.stringify(data).length > 400000) return { ok: false, error: 'That chat is too long to send. Turn on chat sync instead (Settings → Profile).' };
  try { await cloud.write('POST', 'companion_sync?on_conflict=user_id,key', { key: 'handoff', data, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
let handoffSeen = 0;
async function handoffTick() {
  if (!cloud?.session || !flagOn('continue_on')) return;
  try {
    const [row] = await cloud.authedGet('companion_sync?select=data,updated_at&key=eq.handoff&limit=1');
    const d = row?.data; if (!d?.conv?.id || !d.at || d.from?.id === thisDevice().id) return;
    if (!handoffSeen) handoffSeen = store.getSettings().handoffSeen || 0;
    if (d.at <= handoffSeen || Date.now() - d.at > 30 * 60e3) return;   // only fresh ones (30 minutes)
    handoffSeen = d.at; store.setSettings({ handoffSeen: d.at });
    const all = convos.load(), have = all.list.find(x => x.id === d.conv.id);
    if (have) { if ((d.conv.updated || 0) > (have.updated || 0)) { have.messages = d.conv.messages; have.title = d.conv.title; have.updated = d.conv.updated; } }
    else all.list.push({ ...d.conv, messages: d.conv.messages || [] });
    convos.save(); convos.select(d.conv.id); broadcastConvos();
    const n = new Notification({ title: `Continue: ${d.conv.title || 'a chat'}`, body: `Sent from ${d.from?.name || 'your other computer'}. Click to open it.` });
    n.on('click', () => showHud()); n.show(); showHud();
  } catch (e) { log('handoff', e.message); }
}
setInterval(handoffTick, 12e3).unref?.();
ipcMain.handle('mindmap:openChat', (_e, id) => { if (!convos.get(id)) return false; convos.select(id); broadcastConvos(); showHud(); return true; });
// 3.8 "needs testing": what the Apoji Team wants beta testers to check (Apoji Admin → Testing), and my results
const PLATFORM_TEST = process.platform === 'win32' ? 'windows' : 'mac';
ipcMain.handle('tests:list', async () => {
  if (!cloud?.session) return { ok: false, error: 'Sign in to your Nexus account first.' };
  try {
    const items = await cloud.authedGet(`test_items?select=id,release,platform,title,steps,sort&archived=eq.false&platform=in.(all,${PLATFORM_TEST})&order=release.desc,sort.asc,id.asc&limit=200`);
    const q = cols => cloud.authedGet(`test_results?select=${cols}&user_id=eq.${cloud.session.user.id}&item_id=in.(${items.map(i => i.id).join(',')})`);
    const mine = items.length ? await q('item_id,status,note,image,updated_at,reply,reply_at').catch(() => q('item_id,status,note,image,updated_at')) : [];   // 3.13: replies from the Apoji Team (Apoji Admin 2.8.1)
    const assigned = await cloud.authedGet(`test_assignments?select=item_id&user_id=eq.${cloud.session.user.id}`).catch(() => []);   // 3.10: asked of you by the Apoji Team
    return { ok: true, platform: PLATFORM_TEST, version: app.getVersion(), items, mine, assigned: assigned.map(a => a.item_id) };
  } catch (e) { return { ok: false, error: /test_items|42P01|PGRST20|404/.test(e.message) ? 'This needs the 3.8 database update.' : e.message }; }
});
// 3.13: a reply from the Apoji Team on one of your test results → one notification each
async function checkTestReplies() {
  if (!cloud?.session) return;
  try {
    const rows = await cloud.authedGet(`test_results?select=item_id,reply,reply_at&user_id=eq.${cloud.session.user.id}&reply_at=not.is.null&order=reply_at.desc&limit=20`);
    const s = store.getSettings(), seen = s.testRepliesSeen || {}, fresh = rows.filter(r => r.reply && seen[r.item_id] !== r.reply_at);
    if (!fresh.length) return;
    if (Object.keys(seen).length || s.testRepliesInit) for (const r of fresh.slice(0, 3)) notify('Reply on your test result', r.reply.slice(0, 180), () => { showHud(); setTimeout(() => hud?.webContents.send('settings:openTab', 'beta'), 400); });
    for (const r of fresh) seen[r.item_id] = r.reply_at;
    store.setSettings({ testRepliesSeen: seen, testRepliesInit: true });
  } catch {}
}
setTimeout(checkTestReplies, 45e3); setInterval(checkTestReplies, 20 * 60e3).unref?.();
ipcMain.handle('tests:report', async (_e, { id, status, note = '', picture = '' }) => {
  if (!cloud?.session) return { ok: false, error: 'Sign in first.' };
  try {
    let image = null;
    const m = String(picture || '').match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);
    if (m) image = await cloud.uploadFeedbackFile(`test-${id}-${Date.now()}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`, Buffer.from(m[3], 'base64'), m[1]);
    await cloud.write('POST', 'test_results?on_conflict=item_id,user_id', { item_id: +id, user_id: cloud.session.user.id, status, platform: PLATFORM_TEST, note: String(note).slice(0, 1000), ...(image ? { image } : {}), updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
// 3.8 training data: status, consent, rate an answer, give a better one, delete everything I gave
ipcMain.handle('training:state', async () => ({ ok: true, ...(await training.refresh()) }));
ipcMain.handle('training:consent', async (_e, on) => { try { const st = await training.setConsent(!!on); store.setSettings({ trainingAsked: true }); if (on && !(metrics.raw().trainer > 0)) recordMetric('trainer'); broadcast('flags:changed', flagState()); return { ok: true, ...st }; } catch (e) { return { ok: false, error: /training_set_consent|PGRST20|404/.test(e.message) ? 'This needs the 3.8 database update.' : e.message }; } });
// 3.10: what Nexus learned lately, your own rules, and asking once whether you'd like to help
ipcMain.handle('training:news', async () => cloud?.session ? { ok: true, list: await training.news(), lessons: await training.lessons() } : { ok: false, list: [] });
function askTraining() {
  const st = training.state(), s = store.getSettings();
  if (!cloud?.session || !st.loaded || st.tester || st.on || st.asked || s.trainingAsked || !s.onboarded) return;
  broadcast('training:ask', {});
}
// 3.10: the Terms (renderer/terms-data.js); signed in, accepting is recorded in Supabase too
const TERMS = require('./renderer/terms-data.js').TERMS;
// 3.12 known issues & bugs (public; posted in Apoji Admin)
ipcMain.handle('issues:match', async (_e, text) => { try { const app_ = WIN ? 'windows' : 'mac'; const list = await cloud.anonRpc('known_issue_match', { p_text: String(text || '').slice(0, 600), p_app: app_ }); return { ok: true, list: Array.isArray(list) ? list : [] }; } catch { return { ok: false, list: [] }; } });
ipcMain.handle('issues:follow', async (_e, id) => { if (!cloud?.session) return { ok: false, error: 'signin' }; try { return await cloud.rpc('known_issue_follow', { p_id: +id, p_on: true }); } catch (e) { return { ok: false, error: /known_issue|PGRST20|404/.test(e.message) ? 'This needs the 3.12 database update.' : e.message }; } });
ipcMain.handle('issues:list', async () => { try { return { ok: true, list: await cloud.anonRpc('public_known_issues', {}) || [] }; } catch { return { ok: false, list: [] }; } });
// 3.11 Subscription tab: your plans, renewals, the Paragon & Axiom key and the people in your plan
const subErr = e => /my_subscription|plan_|premium_|PGRST20|404/.test(e.message) ? 'This needs the 3.11 database update.' : e.message;
ipcMain.handle('sub:get', async () => { if (!cloud?.session) return { ok: false, error: 'Sign in first.' }; try { const r = await cloud.subscription(); broadcastAccess(); return { ok: true, ...r }; } catch (e) { return { ok: false, error: subErr(e) }; } });
ipcMain.handle('sub:invite', async (_e, { order, who } = {}) => { try { return await cloud.planInvite(order, who); } catch (e) { return { ok: false, error: subErr(e) }; } });
ipcMain.handle('sub:respond', async (_e, { id, accept } = {}) => { try { const r = await cloud.planRespond(id, accept); await cloud.loadExtras(); broadcastAccess(); return r; } catch (e) { return { ok: false, error: subErr(e) }; } });
ipcMain.handle('sub:remove', async (_e, id) => { try { const r = await cloud.planRemove(id); await cloud.loadExtras(); broadcastAccess(); return r; } catch (e) { return { ok: false, error: subErr(e) }; } });
ipcMain.handle('terms:accept', async () => {
  const settings = store.setSettings({ termsSeen: TERMS.version });
  if (cloud?.session) cloud.rpc('terms_accept', { p_version: TERMS.version, p_surface: PLATFORM_TEST }).catch(() => {});
  broadcast('settings:changed', settings);
  return { ok: true, settings };
});
// 3.10: your Nexus speech minutes today (Settings → Voice)
ipcMain.handle('voice:speechUsage', async () => {
  if (!cloud?.session) return { ok: false };
  try { const r = await cloud.rpc('stt_my_usage'); return { ok: true, ...r }; } catch (e) { return { ok: false, error: /stt_my_usage|PGRST20|404/.test(e.message) ? 'needs-sql' : e.message }; }
});
ipcMain.handle('training:delete', async () => { try { return { ok: true, deleted: await training.deleteMine() }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('training:rate', async (_e, { ref, v }) => { try { if (ref) await training.rate(String(ref), +v); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('training:correct', async (_e, { ref, text }) => { try { if (ref && String(text).trim()) await training.correct(String(ref), String(text)); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('beta:thumb', async (_e, { feature = '', up = true, note = '' } = {}) => {
  if (!cloud?.session) return { ok: false, error: 'Sign in to your Nexus account to send beta feedback.' };
  try { await cloud.write('POST', 'beta_events', { feature: String(feature), kind: up ? 'up' : 'down', platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'other', note: String(note || '').trim().slice(0, 500) || null }, 'return=minimal'); return { ok: true }; }
  catch (e) { return { ok: false, error: /beta_events|42P01|404/.test(e.message) ? 'Beta feedback needs the 3.7 database update.' : e.message }; }
});
ipcMain.handle('beta:report', async (_e, { text = '', feature = '' } = {}) => {
  const fs0 = flagState(), on = Object.entries(fs0.flags || {}).filter(([k, f]) => f.on && f.stage !== 'all').map(([k]) => k);
  const conv = convos.active(), lastAi = [...(conv?.messages || [])].reverse().find(m => m.role === 'assistant');
  const extra = [`Beta features on: ${on.join(', ') || 'none'}`, `Platform: ${process.platform} ${process.arch} · Nexus ${app.getVersion()} · ${fs0.channel || ''} channel`,
    `Agent: ${store.getSettings().activePersona}${lastAi ? ` · last answer by ${lastAi.persona || '?'} (${lastAi.model || '?'})${lastAi.error ? ' · it was an error: ' + String(lastAi.content).slice(0, 200) : ''}` : ''}`,
    `Helper: ${helperCaps.built ? 'v' + (helperCaps.version || '?') + (helperCaps.platform ? ' ' + helperCaps.platform : '') : 'missing'}${helperCaps.error ? ' · ' + helperCaps.error : ''}`].join('\n');
  const r = await saveFeedback({ type: 'Beta bug', text: `${String(text).trim() || '(no description)'}\n\n${extra}`, includeInfo: true, feature: String(feature || on[0] || 'beta').slice(0, 60), channel: 'app' });
  return r.saved ? { ok: true } : { ok: false, error: r.error || 'Sign in to your Nexus account to send beta reports.' };
});
// ---------- Agent Builder IPC
const agentsChanged = () => { broadcast('settings:changed', store.getSettings()); broadcast('personas:changed', publicPersonas()); broadcastAccess(); companion?.mark('status'); };
ipcMain.handle('agents:saveCustom', (_e, a) => {
  try {
    const list = store.getSettings().customAgents || [];
    if (!a?.id && list.length >= 20) throw new Error('You can have up to 20 custom agents.');
    const clean = cleanCustomAgent(a);
    const next = list.some(x => x.id === clean.id) ? list.map(x => x.id === clean.id ? clean : x) : [...list, clean];
    store.setSettings({ customAgents: next });
    if (a.voice !== undefined) { const v = store.getSettings().voice, av = { ...(v.agentVoices || {}) }; av[clean.id] = { ...(av[clean.id] || {}), [v.tts]: String(a.voice || '') }; store.setSettings({ voice: { agentVoices: av } }); }
    agentsChanged(); return { ok: true, agent: clean };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('agents:removeCustom', (_e, id) => { store.setSettings({ customAgents: (store.getSettings().customAgents || []).filter(x => x.id !== id) }); agentsChanged(); return { ok: true }; });
ipcMain.handle('agents:share', async (_e, id) => {
  const a = (store.getSettings().customAgents || []).find(x => x.id === id);
  if (!a) return { ok: false, error: 'That agent is gone.' };
  if (!cloud.session) return { ok: false, error: 'Sign in to your Nexus account to share (Settings → Profile).' };
  try { const code = await cloud.write('POST', 'rpc/share_agent', { p_agent: { name: a.name, handle: a.handle, color: a.color, emoji: a.emoji, base: a.base, prompt: a.prompt, features: a.features } }); return { ok: true, code: String(code).replace(/"/g, '') }; }
  catch (e) { return { ok: false, error: /share_agent|404|PGRST/.test(e.message) ? 'Sharing needs the v2.1 Supabase SQL.' : e.message.replace(/^Nexus cloud \d+: /, '') }; }
});
ipcMain.handle('agents:import', async (_e, code) => {
  if (!cloud.session) return { ok: false, error: 'Sign in to your Nexus account to import (Settings → Profile).' };
  try {
    const got = await cloud.write('POST', 'rpc/get_shared_agent', { p_code: String(code || '').replace(/\s/g, '').toUpperCase() });
    const list = store.getSettings().customAgents || [];
    let handle = String(got.handle || got.name || 'agent').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'agent';
    const taken = new Set(allPersonas().map(p => p.handle)); let h = handle, i = 2; while (taken.has(h)) h = (handle.slice(0, 13) + i++);
    const clean = cleanCustomAgent({ ...got, id: undefined, handle: h, from: String(code || '').replace(/\s/g, '').toUpperCase() });
    store.setSettings({ customAgents: [...list, clean] }); agentsChanged();
    return { ok: true, agent: clean };
  } catch (e) { return { ok: false, error: /No agent/.test(e.message) ? 'No agent with that code.' : /get_shared_agent|404|PGRST/.test(e.message) ? 'Importing needs the v2.1 Supabase SQL.' : e.message.replace(/^Nexus cloud \d+: /, '') }; }
});

// ---------------- v1.7: citations, homework, wrapped, phone companion
ipcMain.handle('cite:fromUrl', async (_e, url) => { try { return { ok: true, source: await citations.fromUrl(url, web) }; } catch (e) { return { ok: false, error: e.message }; } });
// The page open in your front browser (Safari, Chrome, Arc, Edge, Brave) — macOS may ask to let Nexus control it.
ipcMain.handle('cite:fromBrowser', async () => {
  if (process.platform !== 'darwin') return { ok: false, error: 'This only works on macOS.' };
  const fw = await screenAware.frontWindow();
  const app0 = fw?.app || '';
  const scripts = { Safari: 'tell application "Safari" to return URL of front document', 'Google Chrome': 'tell application "Google Chrome" to return URL of active tab of front window',
    Arc: 'tell application "Arc" to return URL of active tab of front window', 'Microsoft Edge': 'tell application "Microsoft Edge" to return URL of active tab of front window', 'Brave Browser': 'tell application "Brave Browser" to return URL of active tab of front window' };
  const order = scripts[app0] ? [app0] : Object.keys(scripts);
  for (const b of order) {
    try {
      const out = execFileSync('osascript', ['-e', `if application "${b}" is running then\n${scripts[b]}\nend if`], { timeout: 4000 }).toString().trim();
      if (/^https?:/.test(out)) return { ok: true, url: out, browser: b };
    } catch {}
  }
  return { ok: false, error: "Couldn't read your browser's page. Paste the link instead (macOS may need you to allow Nexus to control your browser)." };
});
// 4.2.0: making a citation counts for the "Cite a source" quest and challenge, however you made it: copying it from the
// citation window, an @Cite card in a chat, or N28C's Cite. Each source counts once a day, so the same link can't be farmed.
// 4.3.0: the window can call these database functions with your sign-in (classes, the friends feed, gifts, events,
// pinned achievements, widget themes). Nothing else goes through here.
const CLOUD_RPC = new Set(['my_classrooms', 'classroom_create', 'classroom_join', 'classroom_leave', 'classroom_view', 'classroom_deck_add', 'classroom_deck_remove', 'classroom_progress_set',
  'friends_feed', 'feed_react', 'feed_post', 'cirkts_gift', 'event_state', 'event_claim', 'profile_pins_set', 'profile_wtheme_set']);
ipcMain.handle('cloud:rpc', async (_e, { fn, args } = {}) => {
  if (!CLOUD_RPC.has(fn)) return { ok: false, error: 'Not allowed.' };
  if (!cloud?.session) return { ok: false, error: 'Sign in to your Nexus account first (Settings → Profile).' };
  try { const r = await cloud.rpc(fn, args || {}); if (fn === 'cirkts_gift' && r?.ok !== false) cirktsSync(true).catch(() => {}); return r; } catch (e) { return { ok: false, error: e.message.replace(/^Nexus cloud \d+: /, '') }; }
});
// your decks, for sharing one with a class
ipcMain.handle('study:forClass', () => study.decks().map(k => ({ name: k.name, cards: study.cards(k.id).map(c => ({ f: c.front, b: c.back })) })).filter(k => k.cards.length));
// 4.3.0 Developers: your "Ask Nexus" bots (public.embed_bots, only yours)
ipcMain.handle('dev:list', async () => { if (!cloud?.session) throw new Error('Sign in to your Nexus account first (Settings → Profile).'); await cloud.ensureFresh(); return await cloud.rest('embed_bots?select=*&order=created_at.desc', { auth: true }) || []; });
ipcMain.handle('dev:save', async (_e, bot) => {
  if (!cloud?.session) throw new Error('Sign in first.');
  const row = { id: String(bot.id), name: bot.name, agent: bot.agent, web: !!bot.web, rules: bot.rules || '', knowledge: bot.knowledge || '', greeting: bot.greeting || '', color: bot.color, origins: bot.origins || [], daily_limit: +bot.daily_limit || 200, active: bot.active !== false, owner: cloud.session.user.id, updated_at: new Date().toISOString() };
  return cloud.write('POST', 'embed_bots?on_conflict=id', row, 'resolution=merge-duplicates,return=representation');
});
ipcMain.handle('dev:remove', async (_e, id) => cloud.write('DELETE', `embed_bots?id=eq.${encodeURIComponent(String(id))}`, undefined, 'return=minimal'));
// 4.2.0 Session replays (anonymous; Settings → General → "Share anonymous usage replays"). The window records steps
// (renderer/replay.js); they're sent here and saved with replay_save. No account id goes with them.
function replayDevice() { const st = store.getSettings(); if (/^[a-z0-9]{8,40}$/.test(st.replayDevice || '')) return st.replayDevice; const d = require('crypto').randomBytes(12).toString('hex').slice(0, 20); store.setSettings({ replayDevice: d }); return d; }
ipcMain.handle('replay:info', () => ({ on: store.getSettings().replays !== false, device: replayDevice(), app: WIN ? 'windows' : 'mac', version: app.getVersion(), variants: flagsLib.variantsOf(flagState()) }));
ipcMain.handle('replay:save', async (_e, p) => {
  if (store.getSettings().replays === false || !p || !Array.isArray(p.events)) return { ok: false };
  try { const r = await cloud.anonRpc('replay_save', { p_app: WIN ? 'windows' : 'mac', p_version: app.getVersion(), p_device: replayDevice(), p_variants: flagsLib.variantsOf(flagState()), p_screen: p.screen || {}, p_events: p.events.slice(0, 600), p_started: p.started || null }); return { ok: !!r?.ok }; }
  catch (e) { return { ok: false, error: e.message }; }
});
// 4.2.0 Media connectors (Settings → Connectors → Media)
let mediaInst = null;
const mediaKit = () => { if (!mediaInst) { mediaInst = require('./src/media').createMedia(); mediaInst.open = u => { if (/^https:\/\//.test(u)) shell.openExternal(u); }; } return mediaInst; };
ipcMain.handle('media:test', () => mediaKit().test());
ipcMain.handle('media:now', async () => { try { return { ok: true, now: await mediaKit().nowPlaying() }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('media:control', async (_e, { action, app: a }) => { try { return { ok: true, text: await mediaKit().control(action, a) }; } catch (e) { return { ok: false, error: e.message }; } });
const citeSeen = new Map();
function citeUsed(key) {
  const day = new Date().toDateString(), k = String(key || '').trim().toLowerCase().slice(0, 300) || 'x';
  if (citeSeen.get(k) === day) return false;
  citeSeen.set(k, day); if (citeSeen.size > 500) citeSeen.delete(citeSeen.keys().next().value);
  recordMetric('cite'); return true;
}
ipcMain.handle('cite:used', (_e, c) => ({ ok: true, counted: citeUsed(c?.url || c?.title) }));
ipcMain.handle('cite:list', () => ({ list: citeStore.all(), projects: citeStore.projects() }));
ipcMain.handle('cite:save', (_e, c) => { const r = citeStore.add(c); citeUsed(c?.url || c?.title); return { ok: true, item: r, list: citeStore.all(), projects: citeStore.projects() }; });
ipcMain.handle('cite:update', (_e, { id, patch }) => { citeStore.update(id, patch); return { ok: true, list: citeStore.all() }; });
ipcMain.handle('cite:remove', (_e, id) => { citeStore.remove(id); return { ok: true, list: citeStore.all(), projects: citeStore.projects() }; });
ipcMain.handle('cite:format', (_e, { source, style }) => ({ mla: citations.format(source, 'mla', { md: false }), apa: citations.format(source, 'apa', { md: false }), chicago: citations.format(source, 'chicago', { md: false }), style }));
ipcMain.handle('cite:bibliography', (_e, { project, style }) => citations.bibliography(citeStore.all().filter(c => !project || c.project === project), style, { md: false }));
ipcMain.handle('homework:metric', () => { recordMetric('homework'); return true; });
ipcMain.handle('wrapped:data', (_e, year) => {
  recordMetric('wrapped');
  return wrapped.build({ list: convos.load().list, metrics: metrics.summary(), study: study.stats(), personas: publicPersonas(), year: +year || new Date().getFullYear() });
});
ipcMain.handle('wrapped:save', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const img = await win.webContents.capturePage();
  const name = `Nexus Wrapped ${new Date().getFullYear()}.png`;
  const pick = process.env.NEXUS_TEST_EXPORT_DIR ? { filePath: path.join(process.env.NEXUS_TEST_EXPORT_DIR, name) } : await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('pictures'), name) });
  if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
  fsLog.writeFileSync(pick.filePath, img.toPNG());
  return { ok: true, path: pick.filePath };
});
// Phone companion (beta): relay through your Nexus account.
const PHONE_SPACE = () => convos.ensureSpace('phone', { name: 'Phone', color: '#ff8fb8' });
async function handleFromPhone(row) {
  const s = store.getSettings();
  const all = allPersonas();
  const agent = all.find(p => p.id === row.agent) ? row.agent : s.phone?.agent || 'flash';
  // Continue any chat you opened on the phone, or the phone's own chat.
  const meta = row.meta || {};
  const spaceId = /^[0-9a-f-]{36}$/i.test(String(meta.spaceId || '')) ? String(meta.spaceId) : '';
  // Continue any chat you opened on the phone, a Shared Space's chat, or the phone's own chat.
  let conv = meta.convId && convos.get(String(meta.convId));
  if (!conv && spaceId) conv = spaceChat(spaceId, String(meta.spaceName || 'Shared Space'));
  // v3.1: Apoji Admin's Nexus chat: each portal chat gets its own chat here (the portal remembers its id)
  if (!conv && meta.from === 'portal') { conv = convos.create({ activate: false, spaceId: PHONE_SPACE().id, title: '◆ ' + (String(row.content || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'From Apoji Admin'), kind: 'phone' }); broadcastConvos(); }
  if (!conv) conv = s.phone?.convId && convos.get(s.phone.convId);
  if (!conv) conv = convos.get(newPhoneChat());
  let att = null;
  if (meta.fileId) { try { att = await phoneAttachment(String(meta.fileId)); } catch (e) { return { ok: false, error: e.message, agent }; } }
  else if (row.file) { try { att = await fileAttachment(row.file); } catch (e) { return { ok: false, error: e.message, agent }; } }
  const context = spaceId && meta.context ? `[Recent messages in the Shared Space "${String(meta.spaceName || '').slice(0, 40)}"]\n${String(meta.context).slice(0, 3000)}\n\n` : '';
  convos.appendTo(conv.id, { role: 'user', content: context + String(row.content || (att ? 'Here is a photo.' : '')).slice(0, 8000), via: 'phone', ...(att ? { attachments: [att] } : {}) });
  broadcastConvos();
  const feats = Array.isArray(meta.features) ? meta.features.map(String).slice(0, 6) : [];
  const res = await runChat({ personaId: agent, messages: toApi(convos.get(conv.id).messages, agent), convId: conv.id, confirm: bgConfirm('Phone'), features: feats, apexKind: 'phone',
    systemExtra: "\n\nThe user is asking from their phone, so keep the answer phone-sized and readable without wide tables." + (spaceId ? ' Your answer is posted to a Shared Space where the user studies with friends, so write for the group.' : ''), interactive: true });
  convos.appendTo(conv.id, (res.ok ? { role: 'assistant', persona: res.persona || agent, content: res.text || '(no reply)', model: res.model, via: 'phone', activity: res.activity || [], sources: res.sources || [] }
    : { role: 'assistant', persona: agent, content: res.error, error: true, via: 'phone' }));
  broadcastConvos();
  companion?.mark('chats', 'status');
  const who = all.find(p => p.id === (res.persona || agent)) || {};
  if (spaceId && res.ok) {
    await cloud.write('POST', 'shared_space_posts', { space_id: spaceId, nickname: `${(who.name || 'Nexus').replace("Nexus '28 ", '')} · for ${String(meta.nick || nicknameOf(s) || 'a friend').slice(0, 20)}`.slice(0, 40), kind: 'ai',
      content: String(res.text || '').slice(0, 12000), data: { agent: who.id || agent, color: who.color || '', q: String(row.content || '').slice(0, 300) } }, 'return=minimal').catch(e => log('space post', e.message));
  }
  push?.send('replies', { title: who.name || 'Nexus', body: res.ok ? res.text : res.error, tag: 'reply', url: spaceId ? './#space=' + spaceId : './#chat' }).catch(() => {});
  return { ok: res.ok, text: res.text, error: res.error, agent: res.persona || agent, model: res.model, convId: conv.id, trail: require('./src/companion').trailOf(res.activity) };
}
function spaceChat(spaceId, name) {
  const map = { ...(store.getSettings().phone?.spaceConvs || {}) };
  let conv = map[spaceId] && convos.get(map[spaceId]);
  if (!conv) {
    conv = convos.create({ activate: false, spaceId: PHONE_SPACE().id, title: '👥 ' + name.slice(0, 40), kind: 'phone' });
    map[spaceId] = conv.id;
    store.setSettings({ phone: { ...(store.getSettings().phone || {}), spaceConvs: map } });
  }
  return conv;
}
// A photo or text file the phone uploaded (companion_files). Picked up once, then deleted from the cloud.
async function phoneAttachment(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Bad file id.');
  const rows = await cloud.authedGet(`companion_files?select=name,mime,data&id=eq.${id}`);
  if (!rows[0]) throw new Error('That photo is gone. Send it again.');
  cloud.write('DELETE', `companion_files?id=eq.${id}`, undefined, 'return=minimal').catch(() => {});
  return fileAttachment(rows[0]);
}
// v2.3: photos sent straight over Tailscale arrive inline (they never touch the cloud)
async function fileAttachment(f) {
  const buf = Buffer.from(String(f.data || ''), 'base64');
  if (!buf.length || buf.length > 9 * 1024 * 1024) throw new Error('That photo is too big.');
  const a = f.mime === 'text/plain' ? attachments.fromText(buf.toString('utf8'), f.name || 'note.txt') : await attachments.fromImage(buf, { name: f.name || 'photo.jpg' });
  return attachments.public(a);
}
const within = (p, ms = 1500) => Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('The Mac clipboard did not answer.')), ms))]);
function inboxChat() {
  const id = store.getSettings().phone?.inboxId;
  let conv = id && convos.get(id);
  if (!conv) { conv = convos.create({ activate: false, spaceId: PHONE_SPACE().id, title: '📥 Sent from your phone', kind: 'phone' }); store.setSettings({ phone: { ...(store.getSettings().phone || {}), inboxId: conv.id } }); }
  return conv;
}
// Send to Mac: open a link, copy to the clipboard, save into a chat, or have an agent summarize / answer it.
// v3.0 N28C ↻ Redo: answer the last message again (kept as another version, like the Mac's regenerate)
async function regenerateConv(convId) {
  const c = convos.get(convId), last = c?.messages.filter(m => !m.hidden).at(-1);
  if (!last || last.role !== 'assistant' || last.local || last.huddle || last.debate) throw new Error("There's no answer to redo in this chat.");
  if (busyConvs.has(convId)) throw new Error('Nexus is already answering in this chat.');
  const agent = allPersonas().find(p => p.id === last.persona) ? last.persona : 'flash';
  const history = c.messages.slice(0, c.messages.lastIndexOf(last));
  (async () => {
    const res = await runChat({ personaId: agent, messages: toApi(history, agent), convId, confirm: bgConfirm('Phone'), apexKind: 'phone', interactive: true });
    convos.addVersion(convId, res.ok ? { role: 'assistant', persona: agent, content: res.text || '(no reply)', model: res.model, via: 'phone', sources: res.sources || [] } : { role: 'assistant', persona: agent, content: res.error, error: true, via: 'phone' });
    broadcastConvos(); companion?.mark('chats');
  })().catch(e => log('phone redo', e.message));
  return { started: true };
}
// v3.3.2 N28C "Edit & ask again": answer the chat's last (edited) message as a new reply
async function answerConv(convId, agentId) {
  const c = convos.get(convId), last = c?.messages.filter(m => !m.hidden).at(-1);
  if (!last || last.role !== 'user') throw new Error('Nothing to answer in this chat.');
  if (busyConvs.has(convId)) throw new Error('Nexus is already answering in this chat.');
  const agent = allPersonas().find(p => p.id === agentId) ? agentId : (store.getSettings().phone || {}).agent || 'flash';
  (async () => {
    const res = await runChat({ personaId: agent, messages: toApi(c.messages, agent), convId, confirm: bgConfirm('Phone'), apexKind: 'phone', interactive: true });
    convos.appendTo(convId, res.ok ? { role: 'assistant', persona: agent, content: res.text || '(no reply)', model: res.model, via: 'phone', sources: res.sources || [] } : { role: 'assistant', persona: agent, content: res.error, error: true, via: 'phone' });
    broadcastConvos(); companion?.mark('chats');
  })().catch(e => log('phone resend', e.message));
  return { started: true };
}
async function phoneInbox(meta) {
  const text = String(meta.text || '').slice(0, 20000), url = /^https?:\/\/\S+$/i.test(String(meta.url || '').trim()) ? String(meta.url).trim().slice(0, 2000) : '';
  const act = ['open', 'clipboard', 'save', 'summarize', 'ask'].includes(meta.action) ? meta.action : 'save';
  const att = meta.fileId ? await phoneAttachment(String(meta.fileId)) : null;
  if (act === 'open') { if (!url) throw new Error('There is no link to open.'); await shell.openExternal(url); notify('📱 Opened from your phone', url); return { done: 'Opened on your Mac' }; }
  if (act === 'clipboard') {
    if (att?.kind === 'image') { const m = attachments.meta(att.id); clipboard.writeImage(nativeImage.createFromPath(attachments.file(att.id, m.ext))); }
    else { const t = text || url; if (!t) throw new Error('Nothing to copy.'); await within(clipboard.writeText(t)); }
    notify('📋 Copied from your phone', att ? 'A photo' : (text || url).slice(0, 120));
    return { done: 'Copied on your Mac' };
  }
  const body = [text, url && !text.includes(url) ? url : ''].filter(Boolean).join('\n\n') || (att ? 'Photo from my phone' : '');
  if (!body && !att) throw new Error('Nothing to send.');
  const conv = inboxChat();
  const content = act === 'summarize' ? `Summarize this for me${url ? ' (open the link)' : ''}:\n\n${body}` : body;
  convos.appendTo(conv.id, { role: 'user', content, via: 'phone', ...(att ? { attachments: [att] } : {}) });
  broadcastConvos(); companion?.mark('chats');
  if (act === 'save') { notify('📥 From your phone', body.slice(0, 140), () => openConv(conv.id)); return { done: '✓ Sent to your Mac', convId: conv.id }; }
  const agent = allPersonas().find(p => p.id === meta.agent) ? meta.agent : 'flash';
  (async () => {
    const res = await runChat({ personaId: agent, messages: toApi(convos.get(conv.id).messages, agent), convId: conv.id, confirm: bgConfirm('Phone'), systemExtra: '\n\nThe user sent this from their phone. Keep it phone-sized.', interactive: true });
    convos.appendTo(conv.id, res.ok ? { role: 'assistant', persona: agent, content: res.text || '(no reply)', model: res.model, via: 'phone', sources: res.sources || [] } : { role: 'assistant', persona: agent, content: res.error, error: true, via: 'phone' });
    broadcastConvos(); companion?.mark('chats');
    push?.send('replies', { title: act === 'summarize' ? '📥 Summary ready' : '📥 Answer ready', body: res.ok ? res.text : res.error, tag: 'inbox', url: './#chat=' + conv.id }, { evenIfLooking: true }).catch(() => {});
  })().catch(e => log('inbox', e.message));
  return { done: "On it. You'll get a notification when it's ready.", convId: conv.id };
}
async function clipForPhone() {
  let text = '';
  try { const t = await within(clipboard.readText()); text = typeof t === 'string' ? t : ''; } catch {}
  const recent = store.getSettings().clipboard.history === false ? [] : (clipHist?.list() || []).slice(0, 8).map(i => String(i.text || '').slice(0, 2000));
  return { text: text.slice(0, 20000), recent };
}
// Shared Spaces: tell your phone when friends post (checked every minute while the phone companion is on).
async function checkSpaces() {
  const me = cloud.session?.user?.id; if (!me) return;
  shared?.updateStats().catch(() => {});
  const mine = await cloud.authedGet(`shared_space_members?select=space_id&user_id=eq.${me}`).catch(() => []);
  if (!mine.length) return;
  const st = store.getSettings().phone || {};
  const since = st.spacesSeen || new Date(Date.now() - 5 * 60e3).toISOString();
  const posts = await cloud.authedGet(`shared_space_posts?select=space_id,nickname,kind,content,created_at&space_id=in.(${mine.map(m => m.space_id).join(',')})&user_id=neq.${me}&created_at=gt.${encodeURIComponent(since)}&order=created_at.asc&limit=20`).catch(() => null);
  if (!posts) return;
  if (posts.length) {
    store.setSettings({ phone: { ...st, spacesSeen: posts.at(-1).created_at } });
    const p = posts.at(-1);
    notify(posts.length > 1 ? `👥 ${posts.length} new in your Shared Spaces` : `👥 ${p.nickname}`, p.kind === 'deck' ? `shared a deck: ${p.content}` : p.content, () => { showHud(); broadcast('shared:open', p.space_id); });
    broadcast('shared:changed', p.space_id);
    if (st.enabled && cloud.session) await push?.send('spaces', { title: posts.length > 1 ? `👥 ${posts.length} new in your Shared Spaces` : `👥 ${p.nickname}`, body: p.kind === 'deck' ? `shared a deck: ${p.content}` : p.content, tag: 'space-' + p.space_id, url: './#space=' + p.space_id });
  } else if (!st.spacesSeen) store.setSettings({ phone: { ...st, spacesSeen: since } });
}
function newPhoneChat() {
  const conv = convos.create({ activate: false, spaceId: PHONE_SPACE().id, title: '📱 From your phone', kind: 'phone' });
  store.setSettings({ phone: { ...(store.getSettings().phone || {}), convId: conv.id } });
  broadcastConvos();
  return conv.id;
}
const phoneState = async () => {
  const s = store.getSettings(), on = true;   // N28C is for everyone since v1.9
  let qr = '';
  try { qr = await require('qrcode').toDataURL(COMPANION_URL, { margin: 1, width: 220, color: { dark: '#0b1a14', light: '#ffffff' } }); } catch {}
  let devices = 0; try { devices = cloud.session && push ? (await push.subscriptions()).length : 0; } catch {}
  return { available: on, enabled: !!s.phone?.enabled, agent: s.phone?.agent || 'flash', url: COMPANION_URL, qr, signedIn: !!cloud.session, relay: relay?.state || { status: 'off' }, direct: { want: !!s.phone?.direct, ...(direct?.state || {}) },
    notify: push?.prefs() || null, devices, outbox: (s.phone?.outbox || []).slice(0, 20), remote: !!s.phone?.remote, peek: !!s.phone?.peek, inboxId: s.phone?.inboxId && convos.get(s.phone.inboxId) ? s.phone.inboxId : '' };
};
ipcMain.handle('phone:state', () => phoneState());
ipcMain.handle('phone:sent', () => ({ ok: true, items: companion?.sentLog?.() || [], on: !!companion?.enabled?.() }));
ipcMain.handle('phone:set', async (_e, patch = {}) => {
  const clean = {};
  if (patch.enabled !== undefined) clean.enabled = !!patch.enabled;
  if (typeof patch.agent === 'string' && allPersonas().some(p => p.id === patch.agent)) clean.agent = patch.agent;
  if (patch.direct !== undefined) clean.direct = !!patch.direct;
  if (patch.remote !== undefined) clean.remote = !!patch.remote;   // 4.3.0 remote actions from N28C
  if (patch.peek !== undefined) clean.peek = !!patch.peek;         // 4.3.0 screen peek
  if (patch.notify && push) push.setPrefs(patch.notify);
  store.setSettings({ phone: { ...(store.getSettings().phone || {}), ...clean } });
  companion?.mark('status');
  relay?.poll();
  if (patch.enabled && cloud.session) companion?.publish().catch(e => log('companion publish', e.message));
  if (patch.direct !== undefined || patch.enabled !== undefined) await syncDirect();
  if (patch.refreshDirect) await direct?.refresh();
  return phoneState();
});


// v2.3: direct connection on when N28C + "Direct connection" are on and you're signed in; off otherwise
let directBusy = false;
async function syncDirect() {
  if (!direct || directBusy) return; directBusy = true;
  const s = store.getSettings(), want = !!(s.phone?.enabled && s.phone?.direct && cloud.session);
  try { if (want && !direct.state.on) await direct.start(); else if (!want && direct.state.on) await direct.stop(); } catch (e) { log('direct', e.message); } finally { directBusy = false; }
}
// Send to phone (v1.9): text or a link from this Mac lands in N28C → Mac tab → "From your Mac", with a notification.
async function sendToPhone({ text = '', url = '' } = {}) {
  const s = store.getSettings();
  if (!s.phone?.enabled || !cloud.session) return { ok: false, error: 'Turn on N28C first (Settings → Phone) and sign in.' };
  text = String(text || '').trim().slice(0, 8000); url = /^https?:\/\/\S+$/i.test(String(url || '').trim()) ? String(url).trim().slice(0, 2000) : '';
  if (!text && !url) return { ok: false, error: 'Nothing to send.' };
  if (!url) { const m = text.match(/^https?:\/\/\S+$/i); if (m) { url = m[0]; text = ''; } }
  const item = { id: 'o' + Date.now().toString(36), text, url, at: Date.now() };
  const outbox = [item, ...(s.phone.outbox || [])].slice(0, 20);
  store.setSettings({ phone: { ...s.phone, outbox } });
  await companion.put('outbox', { items: outbox }).catch(e => log('outbox', e.message));
  const sent = await push?.send('mac', { title: '💻 From your Mac', body: text || url, tag: 'outbox', url: './#mac' }, { evenIfLooking: true }).catch(() => 0);
  return { ok: true, sent: sent || 0 };
}
ipcMain.handle('phone:send', (_e, args) => sendToPhone(args));
ipcMain.handle('phone:sendClipboard', async () => { let t = ''; try { t = await within(clipboard.readText()); } catch {} return sendToPhone({ text: typeof t === 'string' ? t : '' }); });
ipcMain.handle('phone:test', async () => { if (!push || !cloud.session) return { ok: false, error: 'Sign in first.' }; const n = await push.send('test', { title: 'N28C', body: 'Notifications from your Mac work. 🎉', tag: 'test' }, { evenIfLooking: true }).catch(() => 0); return { ok: true, sent: n }; });
ipcMain.handle('phone:openInbox', () => { const id = store.getSettings().phone?.inboxId; if (id && convos.get(id)) { openConv(id); return true; } return false; });

// ---------------- Meeting notes (v2.1)
const meetingParts = new Map();   // id → [text per chunk]
// ---------------- 4.0 videos: Nexus "watches" a video (stills + speech) so every agent can answer about it
const videoKit = require('./src/video');
let videoQueue = Promise.resolve();
function watchVideo(file) {   // one at a time, in a hidden window (renderer/videoproc)
  const run = async () => {
    const w = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { sandbox: true, contextIsolation: true, webSecurity: false, backgroundThrottling: false, offscreen: false } });
    try {
      await w.loadFile(path.join(__dirname, 'renderer', 'videoproc.html'));
      const href = require('url').pathToFileURL(file).href;
      const r = await Promise.race([w.webContents.executeJavaScript(`processVideo(${JSON.stringify(href)}, { frames: 8 })`), new Promise((_, rej) => setTimeout(() => rej(new Error('Watching the video took too long.')), 180000))]);
      let transcript = '', transcriptSource = '', note = '';
      if (r.wav) {
        const buf = Buffer.from(r.wav, 'base64'), tmp = path.join(app.getPath('temp'), 'nexus-video-' + Date.now() + '.wav');
        fs.writeFileSync(tmp, buf);
        try { transcript = String(await transcribeWav(tmp, buf) || '').trim(); transcriptSource = 'speech-to-text'; }
        catch (e) { try { if (cloud?.session) { transcript = String(await cloud.speech(buf, 'audio/wav', Math.round(buf.length / 32000), (store.getSettings().voice.locale || app.getLocale() || '').slice(0, 2)) || '').trim(); transcriptSource = 'Nexus speech'; } else note = 'The sound couldn\'t be turned into words (speech-to-text needs an OpenAI or Groq key, the helper, or signing in).'; } catch (e2) { note = 'The sound couldn\'t be turned into words: ' + e2.message; } }
        finally { try { fs.unlinkSync(tmp); } catch {} }
        if ((r.duration || 0) > 600) note = (note ? note + ' ' : '') + 'Only the first 10 minutes of sound were transcribed.';
      } else note = r.audioError === 'silent' ? 'The video has no speech (its sound is silent).' : r.audioError ? 'The video has no sound track.' : '';
      return { duration: r.duration, times: r.times, frames: r.frames, transcript, transcriptSource, note };
    } finally { try { w.destroy(); } catch {} }
  };
  const p = videoQueue.then(run, run); videoQueue = p.catch(() => {}); return p;
}
async function downloadVideo(url, { max = 150 * 1024 * 1024, signal } = {}) {
  await web.assertPublicUrl(url);
  const res = await require('electron').net.fetch(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const len = +res.headers.get('content-length') || 0; if (len > max) throw new Error('The video is over 150 MB.');
  if (!/video|octet-stream|mp4/i.test(res.headers.get('content-type') || 'video/mp4')) throw new Error('That link isn\'t a video file.');
  const file = path.join(app.getPath('temp'), 'nexus-dl-' + Date.now() + '.mp4'), out = fs.createWriteStream(file); let size = 0;
  const reader = res.body.getReader();
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new Error('The video is over 150 MB.'); if (!out.write(Buffer.from(value))) await new Promise(r => out.once('drain', r)); } }
  catch (e) { out.destroy(); try { fs.unlinkSync(file); } catch {} throw e; }
  await new Promise(r => out.end(r)); return file;
}
// Links to videos in your latest message: read the page/transcript, and watch the video itself when the page gives a file
const videoCache = new Map();   // url → { at, v, frames }
async function videoForLink(url, { signal, onStatus } = {}) {
  const hit = videoCache.get(url); if (hit && Date.now() - hit.at < 3600e3) return hit;
  onStatus?.('Looking at the video');
  const v = await videoKit.info(url, { fetchText: web.fetchText, signal });
  let frames = [], times = [];
  if (v.videoUrl && !v.transcript) {
    onStatus?.('Watching the video');
    try { const f = await downloadVideo(v.videoUrl, { signal }); try { const w = await watchVideo(f); frames = w.frames || []; times = w.times || []; if (w.transcript) { v.transcript = w.transcript; v.transcriptSource = w.transcriptSource; } if (!v.duration) v.duration = w.duration; if (w.note) v.note = (v.note ? v.note + ' ' : '') + w.note; } finally { try { fs.unlinkSync(f); } catch {} } }
    catch (e) { log('video download', e.message); }
  }
  let thumb = null;
  if (!frames.length && v.thumb) { try { await web.assertPublicUrl(v.thumb); const r = await require('electron').net.fetch(v.thumb, { signal }); if (r.ok && /image/.test(r.headers.get('content-type') || '')) { const b = Buffer.from(await r.arrayBuffer()); if (b.length < 4e6) thumb = { mime: (r.headers.get('content-type') || 'image/jpeg').split(';')[0], data: b.toString('base64') }; } } catch {} }
  const out = { at: Date.now(), v, frames, times, thumb };
  videoCache.set(url, out); if (videoCache.size > 40) videoCache.delete(videoCache.keys().next().value);
  return out;
}
async function addVideoLinks(messages, { signal, onStatus } = {}) {
  let lastUser = -1; messages.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
  const recent = messages.map((m, i) => i).filter(i => messages[i].role === 'user').slice(-4);
  for (const i of recent) {
    const links = videoKit.videoLinks(messages[i].content); if (!links.length) continue;
    const newest = i === lastUser, blocks = [], imgs = [];
    for (const u of links) {
      try {
        const r = newest ? await videoForLink(u, { signal, onStatus }) : videoCache.get(u); if (!r) continue;
        const v = { ...r.v, frames: newest ? r.frames.length : 0, times: r.times, thumbAttached: newest && !r.frames.length && !!r.thumb };
        blocks.push(videoKit.describe(v, { max: newest ? 14000 : 1500 }));
        if (newest) { for (const d of r.frames.slice(0, 8)) imgs.push({ mime: 'image/jpeg', data: String(d).split(',')[1] }); if (!r.frames.length && r.thumb) imgs.push(r.thumb); }
      } catch (e) { if (newest) blocks.push(`[VIDEO] ${u}\nNexus couldn't open this video (${String(e.message).slice(0, 80)}). Say so, and ask the user to describe it or attach the file.`); }
    }
    if (blocks.length) messages[i] = { ...messages[i], content: `${messages[i].content}\n\n${blocks.join('\n\n')}`, ...(imgs.length ? { images: [...(messages[i].images || []), ...imgs] } : {}) };
  }
  return messages;
}
async function transcribeWav(file, buf) {
  const s = store.getSettings(), want = s.voice.stt;
  const viaHelper = () => helper.request({ cmd: 'transcribe_file', id: 'tf-' + Math.random().toString(36).slice(2), path: file, locale: s.voice.locale || '' }, ['result'], 180000).then(ev => String(ev.data?.text || ''));
  if (want === 'openai' && store.getKey('openai')) return voice.sttOpenAI({ key: store.getKey('openai'), audio: buf, mime: 'audio/wav' });
  if (want === 'elevenlabs' && store.getKey('elevenlabs')) return voice.sttElevenLabs({ key: store.getKey('elevenlabs'), audio: buf, mime: 'audio/wav' });
  if (want === 'groq' && store.getKey('groq')) return voice.sttGroq({ key: store.getKey('groq'), audio: buf, mime: 'audio/wav' });
  if (helperCaps.transcribeFile) return viaHelper();
  if (store.getKey('openai')) return voice.sttOpenAI({ key: store.getKey('openai'), audio: buf, mime: 'audio/wav' });
  if (store.getKey('elevenlabs')) return voice.sttElevenLabs({ key: store.getKey('elevenlabs'), audio: buf, mime: 'audio/wav' });
  throw new Error('Meeting notes need speech-to-text: update the NexusCore helper (npm run build:helper) for free on-device transcription, or add an OpenAI key (Settings → Models & keys).');
}
// 3.13: while a meeting records, the chat window keeps running when it's hidden (it used to be throttled, so it only
// heard you while the window was open) and doesn't hide itself when you click away
let meetingRecording = false, meetingBlock = null;
ipcMain.handle('meeting:recording', (e, on) => { meetingRecording = !!on; try { e.sender.setBackgroundThrottling(!on); } catch {}
  const psb = require('electron').powerSaveBlocker; if (on && meetingBlock == null) meetingBlock = psb.start('prevent-app-suspension'); if (!on && meetingBlock != null) { try { psb.stop(meetingBlock); } catch {} meetingBlock = null; } return true; });
ipcMain.handle('meeting:chunk', async (_e, { id, index, wav }) => {
  const buf = Buffer.from(wav || []);
  if (!/^m[a-z0-9]{4,20}$/.test(String(id)) || !meeting.isWav(buf)) return { ok: false, error: 'Bad audio.' };
  const file = path.join(require('os').tmpdir(), `nexus-meeting-${id}-${index}.wav`);
  try {
    fsLog.writeFileSync(file, buf);
    const text = String(await transcribeWav(file, buf) || '').trim();
    const parts = meetingParts.get(id) || []; parts[index] = text; meetingParts.set(id, parts);
    return { ok: true, text };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { try { fsLog.unlinkSync(file); } catch {} }
});
ipcMain.handle('meeting:finish', async (_e, { id, title = '', agent = '', minutes = 0 }) => {
  const transcript = (meetingParts.get(id) || []).filter(Boolean).join(' ').trim();
  meetingParts.delete(id);
  if (transcript.length < 20) return { ok: false, error: "Nothing was heard. Check your mic, or speak closer to it." };
  const usable = usableAgents().map(p => p.id);
  const who = [agent, 'neodela', 'lyte', 'flash'].find(x => x && usable.includes(x)) || usable[0];
  if (!who) return { ok: false, error: 'No agent is available to write the notes.' };
  const today = new Date().toISOString().slice(0, 10);
  const res = await runChat({ personaId: who, noTools: true, noHandoff: true, systemExtra: meeting.PROMPT + `\nToday is ${today}.`,
    messages: [{ role: 'user', content: `Meeting transcript${title ? ` ("${String(title).slice(0, 80)}")` : ''}:\n\n${transcript.slice(0, 60000)}` }] });
  if (!res.ok) return { ok: false, error: res.error, transcript };
  const notes = meeting.parseNotes(res.text);
  if (title && !notes.title) notes.title = String(title).slice(0, 80);
  const sp = convos.ensureSpace('meetings', { name: 'Meetings', color: '#ffd36b' });
  const conv = convos.create({ activate: false, spaceId: sp.id, title: '📝 ' + (notes.title || title || 'Meeting notes'), kind: 'meeting' });
  convos.appendTo(conv.id, { role: 'user', content: `🎙 Meeting transcript (${Math.round(minutes) || 1} min):\n\n${transcript}`, via: 'meeting' });
  convos.appendTo(conv.id, { role: 'assistant', persona: who, content: meeting.toMarkdown(notes, { minutes }), model: res.model, via: 'meeting' });
  broadcastConvos(); recordMetric('meeting'); companion?.mark('chats');
  return { ok: true, convId: conv.id, notes, canRemind: !!helperCaps.eventkit && !!store.getSettings().apple?.reminders };
});
ipcMain.handle('meeting:cancel', (_e, id) => { meetingParts.delete(id); return true; });
ipcMain.handle('meeting:remind', async (_e, items = []) => {
  const s = store.getSettings();
  if (!helperCaps.eventkit || !s.apple?.reminders) return { ok: false, error: 'Turn on Apple Reminders in Settings → Connectors first.' };
  let added = 0;
  for (const a of items.slice(0, 25)) {
    try { await helper.request({ cmd: 'rem_create', id: 'rem-' + Date.now() + added, title: String(a.task).slice(0, 200), notes: 'From your meeting notes (Nexus)', ...(a.due ? { due: new Date(a.due + 'T09:00:00').getTime() / 1000 } : {}) }, ['result'], 15000); added++; } catch {}
  }
  return { ok: true, added };
});

// ---------------- Calendar-aware study (v2.1): cram plans for test dates + study slots in today's free time
let slotDay = { day: 0, slots: [], fired: [], fromCalendar: false };
async function planStudySlots(force) {
  const s = store.getSettings(), today = studyplan.dayStart(Date.now());
  if (!force && slotDay.day === today && slotDay.planned > Date.now() - 3600e3) return slotDay;
  const plans = studyplan.cramPlans(study.decks(), id => study.cards(id));
  const active = plans.filter(p => p.daysLeft >= 0);
  let events = [], fromCalendar = false;
  if (s.apple?.calendar && helperCaps.eventkit) {
    try { events = await helper.request({ cmd: 'cal_list', id: 'sp-' + Date.now(), start: today / 1000, end: today / 1000 + 86400 }, ['result'], 15000).then(ev => ev.data || []); fromCalendar = true; } catch {}
  }
  const slots = fromCalendar ? studyplan.freeSlots(events, { max: active.length ? 3 : 2 })
    : [16, 19].map(h => today + h * 3600e3).filter(t => t > Date.now() + 5 * 60e3).slice(0, active.length ? 2 : 1);
  slotDay = { day: today, slots, fired: slotDay.day === today ? slotDay.fired : [], fromCalendar, planned: Date.now(), plans };
  return slotDay;
}
function studySlotTick() {
  if (store.getSettings().studyPlan?.slots === false || focus.muting()) return;
  const now = Date.now(), due = study.stats().due;
  for (const t of slotDay.slots || []) {
    if (now >= t && now - t < 15 * 60e3 && !slotDay.fired.includes(t)) {
      slotDay.fired.push(t);
      const cram = (slotDay.plans || []).find(p => p.daysLeft >= 0 && p.daysLeft <= 3);
      if (!due && !cram) continue;
      const body = cram ? `${cram.name}: test ${cram.daysLeft === 0 ? 'today' : cram.daysLeft === 1 ? 'tomorrow' : `in ${cram.daysLeft} days`}. ${cram.tip}` : `${due} card${due === 1 ? '' : 's'} due. 20 minutes fits before your next thing.`;
      notify('📚 Study slot', body, () => { showHud(); broadcast('study:open', ''); });
      push?.send('study', { title: '📚 Study slot', body, tag: 'study-slot', url: './#study' }).catch(() => {});
    }
  }
}
ipcMain.handle('study:plan', async (_e, force) => { const d = await planStudySlots(!!force); return { plans: studyplan.cramPlans(study.decks(), id => study.cards(id)), slots: d.slots, fired: d.fired, fromCalendar: d.fromCalendar, enabled: store.getSettings().studyPlan?.slots !== false, calendarOn: !!store.getSettings().apple?.calendar }; });
ipcMain.handle('study:setTestDate', (_e, { id, date }) => { study.setTestDate(id, date); studyChanged(); planStudySlots(true).catch(() => {}); return { ok: true }; });
ipcMain.handle('study:slots', (_e, on) => { store.setSettings({ studyPlan: { ...(store.getSettings().studyPlan || {}), slots: !!on } }); return { ok: true }; });

// ---------------- Write mode (v2.1)
ipcMain.handle('write:list', () => { jotsMove(); return docs.list(); });
ipcMain.handle('write:get', (_e, id) => docs.get(id));
ipcMain.handle('write:save', (_e, d) => docs.put(d || {}));
ipcMain.handle('write:templates', () => Object.entries(writer.TEMPLATES).map(([id, t]) => ({ id, title: t.title })));   // 4.0
ipcMain.handle('write:fromTemplate', (_e, id) => { const t = writer.TEMPLATES[id]; return docs.put(t ? { title: t.title, text: t.text } : { title: '', text: '' }); });
ipcMain.handle('write:versions', (_e, id) => docs.versions(id));
ipcMain.handle('write:restore', (_e, { id, i }) => docs.restore(id, +i));
ipcMain.handle('write:remove', (_e, id) => { docs.remove(id); return docs.list(); });
ipcMain.handle('write:suggest', async (_e, { text, mode = 'improve', instruction = '', agent = '', selection = '' }) => {
  text = String(text || '').slice(0, writer.MAX_CHARS);
  if (!text.trim()) return { ok: false, error: 'Write something first.' };
  const usable = usableAgents().map(p => p.id);
  const who = [agent, 'lyte', 'neodela', 'flash'].find(x => x && usable.includes(x)) || usable[0];
  if (!who) return { ok: false, error: 'No agent is available.' };
  const task = String(instruction).trim() ? `Do this: ${String(instruction).trim().slice(0, 500)}` : (writer.MODES[mode] || writer.MODES.improve);
  const part = selection && text.includes(selection) ? `\n\nOnly edit inside this part of the document:\n<<<\n${String(selection).slice(0, 4000)}\n>>>` : '';
  const res = await runChat({ personaId: who, noTools: true, noHandoff: true, systemExtra: writer.PROMPT(String(instruction).trim() ? 'edit' : mode === 'continue' ? 'continue' : writer.ASIDE.has(mode) ? mode : 'edit'),
    messages: [{ role: 'user', content: `${task}${part}\n\n=== DOCUMENT ===\n${text}` }] });
  if (!res.ok) return { ok: false, error: res.error };
  recordMetric('write');
  return { ok: true, agent: who, ...writer.parseSuggestions(res.text, text) };
});
ipcMain.handle('write:export', async (e, { title, text, format = 'md' }) => {
  format = ['md', 'txt', 'docx', 'pdf'].includes(format) ? format : 'md';
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: `${String(title || 'Document').replace(/[^\w .,'()-]/g, '').slice(0, 60) || 'Document'}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    if (format === 'pdf') {   // 4.0: a clean printable page
      const esc = x => String(x).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const inline = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>');
      const body = String(text).split(/\n{2,}/).map(b => { const l = b.trim(); if (!l) return ''; const h = l.match(/^(#{1,3})\s+(.*)$/); if (h && !l.includes('\n')) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
        if (/^([-*]|\d+[.)])\s/.test(l)) return `<ul>${l.split('\n').map(x => `<li>${inline(x.replace(/^([-*]|\d+[.)])\s+(\[[ x]\]\s*)?/, ''))}</li>`).join('')}</ul>`; return `<p>${l.split('\n').map(inline).join('<br>')}</p>`; }).join('\n');
      const html = `<!doctype html><meta charset="utf-8"><style>body{font:12pt/1.6 Georgia,serif;color:#111;margin:0}h1{font:700 22pt/1.2 -apple-system,Segoe UI,sans-serif;margin:0 0 14pt}h2{font:700 15pt -apple-system,Segoe UI,sans-serif;margin:18pt 0 6pt}h3{font:700 12.5pt -apple-system,Segoe UI,sans-serif}p{margin:0 0 10pt}</style>${/^#\s/.test(String(text).trim()) ? '' : `<h1>${esc(title || 'Document')}</h1>`}${body}`;
      const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      try { await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)); const pdf = await w.webContents.printToPDF({ pageSize: 'Letter', margins: { top: .8, bottom: .8, left: .9, right: .9 } }); fsLog.writeFileSync(r.filePath, pdf); } finally { w.destroy(); }
      return { ok: true, path: r.filePath };
    }
    fsLog.writeFileSync(r.filePath, format === 'docx' ? await exporter.textToDocx(title, text) : String(text)); return { ok: true, path: r.filePath }; }
  catch (err) { return { ok: false, error: err.message }; }
});

// ---------------- Focus timer (v2.1)
const focus = new Focus({
  onState: st => { broadcast('focus:state', st); companion?.mark('status'); },
  onBlockDone: (st, held = []) => { recordMetric('focus'); challengeQueue.focus += Math.round(st.minutes || 25); notify(st.block >= st.blocks ? '◷ Focus done!' : `◷ Block ${st.block} done, take ${st.breakMinutes} minutes`, (st.task ? `“${st.task}”. +5 Cirkts.` : '+5 Cirkts. Nice work.') + (held.length ? ` You missed ${held.length}: ${held.slice(-2).map(h => h.title).join(' · ')}` : ''), () => showHud(), { force: true }); },
  onEnd: sum => {
    if (sum.held.length) notify(`◷ While you focused: ${sum.held.length} notification${sum.held.length === 1 ? '' : 's'}`, sum.held.slice(-3).map(h => h.title).join(' · '), () => showHud(), { force: true });
    if (sum.finished) push?.send('routines', { title: '◷ Focus session done', body: `${sum.done} block${sum.done === 1 ? '' : 's'} · ${sum.minutes} minutes${sum.task ? ' · ' + sum.task : ''}`, tag: 'focus', url: './#you' }).catch(() => {});
  }
});
ipcMain.handle('focus:start', (_e, o) => focus.start(o || {}));
ipcMain.handle('focus:stop', () => focus.stop(false));
ipcMain.handle('focus:pause', () => focus.pause());
ipcMain.handle('focus:resume', () => focus.resume());
ipcMain.handle('focus:skip', () => focus.skip());
ipcMain.handle('focus:state', () => ({ ...focus.state(), heldList: focus.held.slice(-10) }));

// ---------------- N28C v2.0: huddle, debate and citations from the phone
const usableAgents = () => { const s = store.getSettings(); return allPersonas().filter(p => !p.legacy && accessDecision(p, bindingFor(p, s), s).mode !== 'blocked'); };
function phoneGroupChat(title) { const c = convos.create({ activate: false, spaceId: PHONE_SPACE().id, title: title.slice(0, 80), kind: 'phone' }); broadcastConvos(); return c; }
async function phoneHuddle({ question, agents = [] }) {
  question = String(question || '').trim().slice(0, 4000);
  if (question.length < 2) throw new Error('What should they talk about?');
  const ok = usableAgents().map(p => p.id);
  const hs = store.getSettings().huddle || {};
  let list = (agents.length >= 2 ? agents : hs.agents || ['neodela', 'lyte', 'flash']).map(String).filter(id => ok.includes(id)).slice(0, 4);
  if (list.length < 2) list = ok.slice(0, 3);
  if (list.length < 2) throw new Error('A huddle needs two agents you can use on this Mac.');
  const conv = phoneGroupChat('◍ Huddle: ' + question);
  convos.appendTo(conv.id, { role: 'user', content: question, via: 'phone' });
  const synth = hs.synth && list.includes(hs.synth) ? hs.synth : list[0];
  group.huddle({ convId: conv.id, agents: list, synth }).then(() => {
    recordMetric('huddle'); broadcastConvos(); companion?.mark('chats');
    push?.send('replies', { title: '◍ Huddle done', body: question, tag: 'huddle', url: './#chat=' + conv.id }).catch(() => {});
  }).catch(e => log('phone huddle', e.message));
  return { convId: conv.id, title: conv.title, agents: list };
}
async function phoneDebate({ topic, pro, con, judge = '', rounds = 2 }) {
  const ok = usableAgents().map(p => p.id);
  pro = ok.includes(pro) ? pro : ok[0]; con = ok.includes(con) && con !== pro ? con : ok.find(x => x !== pro);
  judge = judge && ok.includes(judge) ? judge : '';
  if (!pro || !con) throw new Error('A debate needs two agents you can use on this Mac.');
  topic = String(topic || '').trim();
  if (topic.length < 4) throw new Error('What should they debate?');
  const conv = phoneGroupChat('⚖ Debate: ' + topic);
  group.debate({ convId: conv.id, topic, pro, con, judge, rounds: +rounds || 2 }).then(() => {
    recordMetric('debate'); broadcastConvos(); companion?.mark('chats');
    push?.send('replies', { title: '⚖ Debate finished', body: topic, tag: 'debate', url: './#chat=' + conv.id }).catch(() => {});
  }).catch(e => log('phone debate', e.message));
  return { convId: conv.id, title: conv.title };
}
// Camera scan → flashcards (v2.1): a photo of notes or a textbook page becomes a deck.
async function phoneScanDeck({ fileId, count = 12, name = '' }) {
  const att = await phoneAttachment(String(fileId));
  const usable = usableAgents().map(p => p.id);
  const who = ['neodela', 'lyte', 'flash'].find(x => usable.includes(x)) || usable[0];
  if (!who) throw new Error('No agent is available to read the photo.');
  const n = Math.max(4, Math.min(30, +count || 12));
  const res = await runChat({ personaId: who, noTools: true, noHandoff: true, messages: [{ role: 'user', content: `Make ${n} flashcards from the notes in this photo.${name ? ` The deck is about: ${name}.` : ''}`, attachments: [att] }],
    systemExtra: `\n\n[FLASHCARD MAKER] Read the photo (handwritten or printed notes, a textbook page, slides). Reply with ONLY a fenced code block with the language tag nexus-flashcards containing JSON: {"title":"short deck name","cards":[{"front":"question or term","back":"short answer"}]}. About ${n} cards, only facts that are in the photo, answers under 25 words.` });
  if (!res.ok) throw new Error(res.error);
  const parsed = cardsFromText(res.text);
  if (!parsed.cards.length) throw new Error("Couldn't find enough in that photo. Try a clearer, closer shot.");
  const r = study.addCards({ name: String(name || parsed.title || 'Scanned notes').slice(0, 60) }, parsed.cards, { source: { via: 'scan' } });
  recordMetric('study_cards'); studyChanged();
  return { deck: r.deck?.name, deckId: r.deck?.id, added: r.added };
}
async function phoneCite({ url, save, project }) {
  if (!/^https?:\/\/\S+$/i.test(String(url || '').trim())) throw new Error('Paste a link that starts with http.');
  const source = await citations.fromUrl(String(url).trim(), web);
  const out = { title: source.title || '', mla: citations.format(source, 'mla', { md: false }), apa: citations.format(source, 'apa', { md: false }), chicago: citations.format(source, 'chicago', { md: false }) };
  if (save) citeStore.add({ ...source, project: String(project || '').slice(0, 60) });
  citeUsed(source.url);   // 4.2.0: making one on N28C counts for the Cite quest, saved or not
  return out;
}

// ---------------- Shared Spaces on the Mac (v1.9)
const sharedOk = async fn => {
  if (!shared) return { ok: false, error: 'Starting up…' };
  const down = maint.blockFor(cloud.maintenance, 'spaces', { admin: cloud.isAdmin() });
  if (down) return { ok: false, error: maint.message(down, 'Shared Spaces'), maintenance: true };
  const mod = cloud.moderation(); if (mod) return { ok: false, error: `${maint.moderationText(mod)} Shared Spaces are off until then.` };
  try { return { ok: true, ...(await fn()) }; }
  catch (e) { return { ok: false, error: /shared_space|create_shared_space|42P01|PGRST20|404/.test(e.message) ? 'Shared Spaces need the v1.8 Supabase SQL.' : e.message.replace(/^Nexus cloud \d+: /, '').replace(/^\{.*"message":"([^"]+)".*$/, '$1') }; }
};
// ---------------- 4.0 Cirkts, the shop, your profile, friends, Spaces chat, Apoji-wide search
async function cirktsSync(force) {
  if (!cirkts) return null;
  const st = await cirkts.sync(force).catch(e => { log('cirkts', e.message); return cirkts.state(); });
  if (cloud?.session) {
    const m = metrics.summary(); cirkts.publish({ stats: { streak: m.streak || 0, best: m.bestStreak || 0, achievements: (m.achievements || []).filter(a => a.unlocked).length, cirkts: st.balance, chats: m.chats || 0 } }).catch(() => {});
    // 4.0.6: what friends see on your profile: favorite agent, chats, best streak and your newest badges
    const fav = m.favorite ? (publicPersonas().find(p => p.id === m.favorite.agent)?.name || '') : '';
    const badges = (m.achievements || []).filter(a => a.unlocked).sort((a, b) => b.unlocked - a.unlocked).slice(0, 8).map(a => a.name);
    cirkts.publishExtra({ fav_agent: String(fav).replace(/^Nexus\s*'?28\s*/i, '').slice(0, 24), chats: m.chats || 0, best: m.bestStreak || 0, badges }).catch(() => {});
  }
  broadcast('cirkts:changed', st); companion?.mark?.('status'); return st;
}
const socOk = async fn => { try { return { ok: true, ...((await fn()) || {}) }; } catch (e) { return { ok: false, error: String(e.message || e).replace(/^Nexus cloud \d+: /, '') }; } };
ipcMain.handle('cirkts:state', () => ({ ...cirkts.state(), catalog: cosmetics.CATALOG, signedIn: !!cloud?.session, skin: store.getSettings().orbSkin || 'aurora', theme: store.getSettings().theme || 'green', all: allSkins(), mine: mineOn() }));
ipcMain.handle('cirkts:sync', () => cirktsSync(true));
// 4.0.6: sets (buy what's missing for 25% less; use them all at once), and Make your own (beta)
ipcMain.handle('cirkts:buyPack', async (_e, id) => { const r = await cirkts.buyPack(String(id || ''), cosmetics.PACKS); if (r.ok) { recordMetric('shop'); broadcast('cirkts:changed', cirkts.state()); companion?.mark?.('status'); } return r; });
ipcMain.handle('cirkts:usePack', async (_e, id) => {
  const p = cosmetics.pack(String(id || '')); if (!p) return { ok: false, error: 'That set isn\'t in the shop.' };
  const patch = {}, missing = [], sett = {};
  for (const iid of p.items) {
    const it = cosmetics.item(iid); if (!it) continue;
    if (!cirkts.owns(iid)) { missing.push(it.name); continue; }
    if (it.kind === 'skin') sett.orbSkin = it.key;
    else if (it.kind === 'theme') sett.theme = it.free ? it.key : 'shop-' + it.key;
    else patch[it.kind] = iid;
  }
  const r = Object.keys(patch).length ? await cirkts.equip(patch) : { ok: true };
  if (Object.keys(sett).length) applySettings(sett);
  broadcast('cirkts:changed', cirkts.state()); broadcast('settings:changed', store.getSettings()); companion?.mark?.('status');
  return { ok: r.ok !== false, error: r.error, missing, skin: sett.orbSkin || '' };
});
const mineOn = () => flagOn('make_your_own') || !!cloud?.account?.()?.admin;
ipcMain.handle('cirkts:custom', async (_e, custom) => {
  if (!mineOn()) return { ok: false, error: 'Make your own is in beta right now.' };
  const r = await cirkts.setCustom(custom, cosmetics.cleanCustom);
  broadcast('cirkts:changed', cirkts.state()); broadcast('settings:changed', store.getSettings()); return r;
});
ipcMain.handle('cirkts:mineUpload', async (_e, { kind, bytes, mime } = {}) => {
  try {
    if (!mineOn()) return { ok: false, error: 'Make your own is in beta right now.' };
    if (!cloud?.session) return { ok: false, error: 'Sign in to your Nexus account first.' };
    if (!['frame', 'overlay'].includes(kind)) return { ok: false, error: 'Unknown kind.' };
    const buf = Buffer.from(bytes || []);
    if (!buf.length || buf.length > 1e6 || !/^image\/(png|webp|gif)$/.test(mime)) return { ok: false, error: 'Pick a PNG, WebP or GIF with a see-through middle, under 1 MB.' };
    const url = await cloud.uploadMine(kind, buf, mime);
    const r = await cirkts.rpc('cosmetic_upload_submit', { p_kind: kind, p_url: url });
    if (r?.missing) return { ok: false, error: 'This needs the 4.0.6 database update.' };
    if (!r?.ok) return { ok: false, error: r?.error || 'Couldn\'t send it.' };
    const st = cirkts.state(); store.setSettings({ cirkts: { ...(store.getSettings().cirkts || {}), equip: { ...(st.equip || {}), [kind + '_pending']: url } } });
    // 4.1.0: put it on right away (you see it now; everyone else once it's approved). Before, the picture only showed if
    // you also picked Make your own → "My own picture", so an approved upload looked like it did nothing.
    const part = kind === 'frame' ? 'frame' : 'pframe', cur = cosmetics.cleanCustom(cirkts.state().equip?.custom || {});
    await cirkts.setCustom({ ...cur, [part]: { ...cur[part], style: 'image' } }, cosmetics.cleanCustom).catch(() => {});
    await cirkts.equip({ [part]: part + ':mine' }).catch(() => {});
    broadcast('cirkts:changed', cirkts.state()); broadcast('settings:changed', store.getSettings()); return { ok: true, status: 'pending', url };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('cirkts:mineUploads', async () => { if (!cloud?.session) return []; const r = await cirkts.rpc('my_cosmetic_uploads').catch(() => []); return Array.isArray(r) ? r : []; });
ipcMain.handle('cirkts:mineRemove', async (_e, kind) => {
  if (!cloud?.session) return { ok: false, error: 'Sign in first.' };
  const r = await cirkts.rpc('cosmetic_upload_remove', { p_kind: String(kind || '') }).catch(e => ({ ok: false, error: e.message }));
  const st = cirkts.state(), eq = { ...(st.equip || {}) }; delete eq[kind + '_pending']; if (kind === 'frame') eq.frame_img = ''; if (kind === 'overlay') eq.overlay_img = '';
  store.setSettings({ cirkts: { ...(store.getSettings().cirkts || {}), equip: eq } }); broadcast('cirkts:changed', cirkts.state()); return r || { ok: true };
});
ipcMain.handle('cirkts:buy', async (_e, id) => { const r = await cirkts.buy(String(id || '')); if (r.ok) { recordMetric('shop'); broadcast('cirkts:changed', cirkts.state()); companion?.mark?.('status'); } return r; });
ipcMain.handle('cirkts:banner', async (_e, { bytes, mime }) => {   // 4.0.2: your own banner image
  try {
    const buf = Buffer.from(bytes || []);
    if (!buf.length || buf.length > 2e6 || !/^image\/(png|jpeg|webp|gif)$/.test(mime)) return { ok: false, error: 'Pick a PNG, JPEG, WebP or GIF under 2 MB.' };
    if (!cirkts.owns('banner:custom')) return { ok: false, error: 'Get "Your own image" in the shop first.' };
    const url = await cloud.uploadBanner(buf, mime);
    const r = await cirkts.equip({ banner: 'banner:custom', banner_url: url });
    if (r.ok) { broadcast('cirkts:changed', cirkts.state()); broadcast('settings:changed', store.getSettings()); }
    return r;
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('cirkts:presence', async (_e, st) => { const r = await cirkts.presence(String(st || '')); if (r.ok) { broadcast('cirkts:changed', cirkts.state()); companion?.mark?.('status'); } return r; });   // 4.0.4
ipcMain.handle('cirkts:equip', async (_e, patch) => { const r = await cirkts.equip(patch || {}); if (r.ok) { broadcast('cirkts:changed', cirkts.state()); broadcast('settings:changed', store.getSettings()); companion?.mark?.('status'); } return r; });
ipcMain.handle('social:friends', () => socOk(() => social.friends()));
ipcMain.handle('social:visit', (_e, id) => socOk(() => social.visit(id)));
ipcMain.handle('social:visitors', (_e, d) => socOk(() => social.visitors(d)));
ipcMain.handle('social:request', (_e, u) => socOk(() => social.request(u)));
ipcMain.handle('social:respond', (_e, { id, yes }) => socOk(() => social.respond(id, yes)));
ipcMain.handle('social:remove', (_e, id) => socOk(() => social.remove(id)));
ipcMain.handle('social:block', (_e, { id, on }) => socOk(() => social.block(id, on)));
ipcMain.handle('social:card', (_e, u) => socOk(() => social.card(u)));
ipcMain.handle('social:invites', () => socOk(async () => ({ list: await social.invites() })));
ipcMain.handle('social:inviteRespond', (_e, { space, yes }) => socOk(() => social.inviteRespond(space, yes)));
ipcMain.handle('social:invite', (_e, { space, user }) => socOk(() => social.invite(space, user)));
ipcMain.handle('social:people', (_e, space) => socOk(async () => ({ list: await social.people(space) })));
ipcMain.handle('social:report', (_e, r) => socOk(() => social.report(r || {})));
ipcMain.handle('social:linkCode', () => socOk(() => social.linkCode()));
ipcMain.handle('apoji:search', (_e, q) => socOk(async () => ({ list: await social.search(q) })));
ipcMain.handle('spacechat:list', (_e, { id, after, before }) => sharedOk(() => shared.chat(id, { after, before })));
ipcMain.handle('spacechat:send', (_e, { id, body, replyTo }) => sharedOk(() => shared.chatSend(id, body, replyTo)));
ipcMain.handle('spacechat:edit', (_e, { msgId, body }) => sharedOk(() => shared.chatEdit(msgId, body)));
ipcMain.handle('spacechat:remove', (_e, msgId) => sharedOk(() => shared.chatRemove(msgId)));
ipcMain.handle('shared:list', () => sharedOk(() => shared.list()));
ipcMain.handle('shared:create', (_e, a) => sharedOk(() => shared.create(a || {})));
ipcMain.handle('shared:join', (_e, a) => sharedOk(() => shared.join(a || {})));
ipcMain.handle('shared:feed', (_e, id) => sharedOk(() => shared.feed(id)));
ipcMain.handle('shared:post', (_e, { id, content }) => sharedOk(() => shared.post(id, { content })));
ipcMain.handle('shared:ask', (_e, { id, text, agent }) => sharedOk(() => shared.ask(id, { text, agent })));
ipcMain.handle('shared:shareDeck', (_e, { id, deckId }) => sharedOk(() => shared.shareDeck(id, deckId)));
ipcMain.handle('shared:takeDeck', (_e, { id, postId }) => sharedOk(async () => { const r = await shared.takeDeck(id, postId); studyChanged(); return r; }));
ipcMain.handle('shared:leave', (_e, id) => sharedOk(() => shared.leave(id)));
ipcMain.handle('shared:remove', (_e, id) => sharedOk(() => shared.remove(id)));
ipcMain.handle('shared:rename', (_e, nick) => sharedOk(() => shared.rename(nick)));
ipcMain.handle('shared:sessionStart', (_e, { id, deckId, minutes }) => sharedOk(() => shared.sessionStart(id, deckId, minutes)));
ipcMain.handle('shared:sessions', (_e, id) => sharedOk(() => shared.sessions(id)));
ipcMain.handle('shared:session', (_e, sid) => sharedOk(() => shared.session(sid)));
ipcMain.handle('shared:sessionScore', (_e, { sid, score }) => sharedOk(() => shared.sessionScore(sid, score || {})));
ipcMain.handle('shared:sessionEnd', (_e, sid) => sharedOk(() => shared.sessionEnd(sid)));

// ---------------- Routines + Morning Brief
const ROUTINE_NOTE = "\n\nThis is a scheduled routine the user set up; they aren't watching live. Answer directly and self-contained, short enough to read in a notification-sized glance plus details below.";
function routinesSpace() { return convos.ensureSpace('routines', { name: 'Routines', color: '#ffd36b' }); }
function firstLine(t) { return String(t || '').replace(/[#*_`>|]/g, '').split('\n').map(x => x.trim()).find(Boolean) || ''; }
async function runRoutine(r, why) {
  if (r.kind === 'brief') return runBrief({ why });
  if (r.kind === 'wrap') return runWrap({ why });
  let conv = r.convId && convos.get(r.convId);
  if (!conv) conv = convos.create({ activate: false, spaceId: routinesSpace().id, title: '⟳ ' + r.name, kind: 'routine' });
  convos.appendTo(conv.id, { role: 'user', content: r.prompt, via: 'routine' });
  broadcastConvos();
  const res = await runChat({ personaId: r.agent, messages: toApi(convos.get(conv.id).messages, r.agent), convId: conv.id, confirm: bgConfirm(`Routine "${r.name}"`), systemExtra: ROUTINE_NOTE });
  convos.appendTo(conv.id, res.ok ? { role: 'assistant', persona: r.agent, content: res.text || '(no reply)', model: res.model, via: 'routine', activity: res.activity || [], sources: res.sources || [], cards: res.cards || [] }
    : { role: 'assistant', persona: r.agent, content: res.error, error: true, via: 'routine' });
  broadcastConvos();
  recordMetric('routine_run');
  if (why !== 'manual' || !hud?.isVisible()) notify(`⟳ ${r.name}${String(why).startsWith('trigger:') ? ' · ' + why.slice(8) : ''}`, res.ok ? firstLine(res.text) : res.error, () => openConv(conv.id));
  if (res.ok && r.speak) voice.speakSystem(voice.speakable(res.text), { voice: store.getSettings().voice.systemVoice });
  return { ok: res.ok, error: res.error, convId: conv.id };
}
// macOS caches app icons. After an update, re-register Nexus with Launch Services and nudge Finder/Dock so the new
// icon (the layered macOS 26 icon that tints with your appearance) replaces the cached one. Once per version.
function refreshIconCache() {
  if (process.platform !== 'darwin' || !app.isPackaged || store.getSettings().updates?.iconRefreshed === app.getVersion()) return;
  const bundle = path.resolve(app.getPath('exe'), '../../..');
  if (!bundle.endsWith('.app')) return;
  const { execFile } = require('child_process');
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  execFile('touch', [bundle], () => execFile(lsregister, ['-f', bundle], () => {
    execFile('killall', ['Dock'], () => {});   // the Dock redraws in a second; windows stay put
    store.setSettings({ updates: { ...store.getSettings().updates, iconRefreshed: app.getVersion() } });
    log('icon cache refreshed for', bundle);
  }));
}
function openConv(id) { if (convos.get(id)) { convos.select(id); broadcastConvos(); } showHud(); }
// 4.1.0 "Ask my Spaces": one question across every Shared Space you're in. Their recent posts and chat go to the agent as
// context (only for this answer, nothing is saved anywhere new), and the answer says which Space each part came from.
async function askSpaces(question, { agent = '', from = 'mac' } = {}) {
  const q = String(question || '').trim().slice(0, 1000); if (q.length < 3) throw new Error('Ask a question first.');
  if (!shared || !cloud?.session) throw new Error('Sign in to your Nexus account to ask your Spaces.');
  const { spaces = [], me } = await shared.list();
  if (!spaces.length) throw new Error('You aren\'t in any Shared Spaces yet.');
  const parts = await Promise.all(spaces.slice(0, 12).map(async sp => {
    const [f, ch] = await Promise.all([shared.feed(sp.id).catch(() => null), shared.chat(sp.id).catch(() => null)]);
    const nick = new Map((f?.members || []).map(m => [m.user_id, m.nickname]));
    const posts = (f?.posts || []).slice(-25).map(p => `- ${p.user_id === me ? 'You' : p.nickname || 'Member'}${p.kind === 'ai' ? ' (AI answer)' : p.kind === 'deck' ? ' (shared a deck)' : ''}: ${String(p.content || '').replace(/\s+/g, ' ').slice(0, 600)}`);
    const msgs = (ch?.messages || []).filter(m => !m.deleted).slice(-40).map(m => `- ${m.user_id === me ? 'You' : nick.get(m.user_id) || 'Member'} (${new Date(m.created_at).toLocaleDateString()}): ${String(m.body || '').replace(/\s+/g, ' ').slice(0, 400)}`);
    return posts.length || msgs.length ? `### Space: ${sp.name}\n${posts.length ? 'Posts:\n' + posts.join('\n') + '\n' : ''}${msgs.length ? 'Chat:\n' + msgs.join('\n') : ''}` : `### Space: ${sp.name}\n(nothing posted yet)`;
  }));
  let ctxText = parts.join('\n\n'); if (ctxText.length > 26000) ctxText = ctxText.slice(-26000);
  const agentId = allPersonas().find(p => p.id === agent && !p.apex) ? agent : (allPersonas().find(p => p.id === 'neodela') ? 'neodela' : 'flash');
  const c = convos.create({ activate: from === 'mac', title: 'Ask my Spaces: ' + q.slice(0, 48), kind: 'spaces' });
  convos.appendTo(c.id, { role: 'user', content: q, askSpaces: spaces.length });
  broadcastConvos();
  const systemExtra = `\n\n[ASK MY SPACES — the user is asking about their Shared Spaces (${spaces.length}). Below are recent posts and chat from each. Answer from this; say which Space something came from ("In Study crew, Maya said…"). If the answer isn't there, say so plainly. Don't invent messages.]\n${ctxText}`;
  const res = await runChat({ personaId: agentId, messages: toApi(convos.get(c.id).messages, agentId), convId: c.id, systemExtra, noTools: true, noMemory: true, apexKind: from === 'phone' ? 'phone' : 'chat' });
  convos.appendTo(c.id, res.ok ? { role: 'assistant', persona: agentId, content: res.text || '(no reply)', model: res.model } : { role: 'assistant', persona: agentId, content: res.error || 'That didn\'t work.', error: true });
  broadcastConvos(); companion?.mark?.('chats'); recordMetric('chat', { agent: agentId });
  return { ok: true, convId: c.id, spaces: spaces.length };
}
ipcMain.handle('spaces:ask', async (_e, { q, agent } = {}) => { try { const r = await askSpaces(q, { agent }); openConv(r.convId); return r; } catch (e) { return { ok: false, error: e.message }; } });

async function runBrief({ why = 'manual', speak } = {}) {
  const b = routines.brief();
  const s = store.getSettings();
  const facts = await brief.gather({ sections: b.sections, topics: b.topics, settings: s, deps: {
    weather: weatherApi, web, helper, helperCaps, mcp, cloud: cloud.state(), access: accessState(), getKey: store.getKey, study } });
  let conv = b.convId && convos.get(b.convId);
  if (!conv) conv = convos.create({ activate: false, spaceId: routinesSpace().id, title: '☀ Morning Brief', kind: 'brief' });
  const prompt = brief.briefPrompt({ ...facts, nickname: nicknameOf(s) });
  const res = await runChat({ personaId: b.agent || 'flash', messages: [{ role: 'user', content: prompt }], convId: conv.id, noTools: true });
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  convos.appendTo(conv.id, { role: 'user', content: `Morning Brief · ${day}`, via: 'brief', local: true });
  convos.appendTo(conv.id, res.ok ? { role: 'assistant', persona: b.agent || 'flash', content: res.text || '(empty brief)', model: res.model, via: 'brief', brief: true }
    : { role: 'assistant', persona: b.agent || 'flash', content: res.error, error: true, via: 'brief' });
  b.convId = conv.id;
  broadcastConvos();
  if (res.ok) {
    recordMetric('brief');
    broadcast('brief:ready', { convId: conv.id, text: res.text });
    if (why === 'schedule') notify('☀ Your Morning Brief is ready', firstLine(res.text.replace(/^.*?\n/, '')) || 'Open Nexus to read it.', () => openConv(conv.id));
    if (speak ?? (why === 'schedule' && b.speak)) voice.speakSystem(voice.speakable(res.text), { voice: s.voice.systemVoice });
  }
  return { ok: res.ok, error: res.error, convId: conv.id, text: res.text };
}
// ---------- v2.7: memory, weekly recap, auto-sorted Spaces, clipboard orb, share, group challenges, changelog email
ipcMain.handle('memory:state', () => memory.state());
// 4.1.0 agent memory cards: everything an agent knows about you, in one place (and what it never sees)
ipcMain.handle('agents:knows', (_e, id) => {
  const pid = String(id || ''), p = publicPersonas().find(x => x.id === pid) || { id: pid, name: pid }, st = store.getSettings(), m = metrics.summary();
  const mem = memory.state(), spaces = (convos.load().spaces || []);
  const chats = convos.load().list.filter(c => !c.incognito && c.messages?.some(x => x.persona === pid)).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return {
    agent: { id: pid, name: p.name, color: p.color || '' },
    memoryOn: mem.enabled, memory: mem.items.filter(x => !x.space).map(x => ({ id: x.id, text: x.text, at: x.at, source: x.source })),
    spaceMemory: spaces.map(sp => ({ id: sp.id, name: sp.name, n: mem.items.filter(x => x.space === sp.id).length })).filter(x => x.n),
    nickname: st.nickname || '', rules: (st.myRules || []).slice(0, 20), about: String(st.personal?.about || st.aboutMe || '').slice(0, 400),
    chats: m.agents?.[pid] || 0, lastAt: chats[0]?.updated || 0, recent: chats.slice(0, 5).map(c => ({ id: c.id, title: c.title || 'Chat', at: c.updated || 0 }))
  };
});
ipcMain.handle('memory:add', (_e, text, space) => { const sp = space && typeof space === 'object' ? (space.convId ? convos.get(space.convId)?.spaceId || null : null) : space || null; const r = memory.add(String(text || ''), 'you', sp); broadcast('memory:changed', memory.state()); return r ? { ok: true, item: r } : { ok: false, error: 'Already remembered (or too short).' }; });
ipcMain.handle('memory:edit', (_e, { id, text }) => { memory.edit(String(id), text); broadcast('memory:changed', memory.state()); return { ok: true }; });
ipcMain.handle('memory:space', (_e, { id, space }) => { memory.setSpace(String(id), space || null); broadcast('memory:changed', memory.state()); return { ok: true }; });
ipcMain.handle('memory:remove', (_e, id) => { memory.remove(String(id)); broadcast('memory:changed', memory.state()); return { ok: true }; });
ipcMain.handle('memory:clear', () => { memory.clear(); broadcast('memory:changed', memory.state()); return { ok: true }; });
ipcMain.handle('memory:enabled', (_e, on) => { const r = memory.setEnabled(on); broadcast('memory:changed', r); return r; });

function runRecap(why = 'manual') {
  const s = store.getSettings();
  const r = recapMod.build({ list: convos.load().list, log: study.load().log || [], unlocked: metrics.load().unlocked || {}, achievements: ACHIEVEMENTS, personas: allPersonas(), streak: study.stats().streak || 0 });
  const map = s.recapConv; let conv = map && convos.get(map);
  if (!conv) { conv = convos.create({ activate: false, spaceId: routinesSpace().id, title: '📊 Weekly recap', kind: 'brief' }); store.setSettings({ recapConv: conv.id }); }
  convos.appendTo(conv.id, { role: 'assistant', persona: 'flash', content: recapMod.markdown(r, nicknameOf(s)), local: true, via: 'brief', model: 'Weekly recap' });
  if (why === 'schedule') store.setSettings({ recap: { ...(s.recap || {}), lastKey: r.key } });   // peeking early doesn't skip Sunday's
  broadcastConvos();
  if (why === 'schedule' && (r.messages || r.reviews)) {
    const line = [r.messages ? `${r.messages} messages` : '', r.reviews ? `${r.reviews} cards` : '', r.streak ? `${r.streak}-day streak` : ''].filter(Boolean).join(' · ');
    notify('📊 Your week in Nexus', line || 'Your weekly recap is ready.', () => openConv(conv.id));
    if (s.phone?.enabled && cloud.session) push?.send('routines', { title: '📊 Your week in Nexus', body: line, tag: 'recap', url: './#chats' }).catch(() => {});
  }
  return { ok: true, convId: conv.id, recap: r };
}
ipcMain.handle('recap:now', () => { const r = runRecap('manual'); openConv(r.convId); return r; });

// 4.3.0 Weekly report card: grades from the recap + Focus sessions and quests this week (from a Monday baseline of the
// Stats counters, saved in settings). Shown in the app (⌘K "Report card"), sent to N28C with the status.
function weekCounters() {
  const raw = metrics.load(), key = recapMod.weekBounds().key, s = store.getSettings();
  const now = { focus: raw.focus || 0, quests: raw.quests?.total || 0 };
  let base = s.weekBase;
  if (!base || base.key !== key) { base = { key, ...now }; store.setSettings({ weekBase: base }); }
  return { focusSessions: Math.max(0, now.focus - base.focus), questsDone: Math.max(0, now.quests - base.quests) };
}
function weeklyReport() {
  const r = recapMod.build({ list: convos.load().list, log: study.load().log || [], unlocked: metrics.load().unlocked || {}, achievements: ACHIEVEMENTS, personas: allPersonas(), streak: study.stats().streak || 0 });
  return { ...recapMod.grade(r, weekCounters()), name: nicknameOf(store.getSettings()) || cloud.profile?.username || '' };
}
ipcMain.handle('report:week', () => weeklyReport());
ipcMain.handle('report:save', async (e, rect) => {   // the card as a PNG
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return { ok: false };
  const r = rect && { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.round(rect.width), height: Math.round(rect.height) };
  const img = await w.webContents.capturePage(r || undefined);
  const out = await dialog.showSaveDialog(w, { defaultPath: path.join(app.getPath('downloads'), `Nexus report card ${recapMod.weekBounds().key}.png`), filters: [{ name: 'PNG image', extensions: ['png'] }] });
  if (out.canceled || !out.filePath) return { ok: false };
  fs.writeFileSync(out.filePath, img.toPNG()); return { ok: true, path: out.filePath };
});

// 4.4.0 Solis: StoryLattice notes on the chat, and LuminaRender pictures (your own OpenRouter key)
function latticeApply(convId, text) {
  const { text: out, patches } = latticeMod.extract(text);
  if (patches.length && convId && convos.get(convId)) {
    let l = convos.get(convId).lattice || {};
    for (const p of patches) l = latticeMod.merge(l, p);
    convos.setLattice(convId, l); broadcastConvos();
  }
  return out;
}
const newAttId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
async function luminaRun(args, convId, signal) {
  const key = store.getKey('openrouter') || process.env.OPENROUTER_API_KEY || '';
  const r = await luminaMod.render(args, { key, fetch: (u, o) => require('electron').net.fetch(u, o), signal });
  const buf = Buffer.from(r.b64, 'base64'), ext = r.mime === 'image/svg+xml' ? '.svg' : r.mime === 'image/jpeg' ? '.jpg' : r.mime === 'image/webp' ? '.webp' : '.png';
  const id = newAttId(); fs.mkdirSync(path.join(store.dir(), 'attachments'), { recursive: true }); fs.writeFileSync(attachments.file(id, ext), buf);
  let thumb = '', small = '';
  try { const img = nativeImage.createFromBuffer(buf); if (!img.isEmpty()) { const w = img.getSize().width; thumb = img.resize({ width: Math.min(560, w), quality: 'good' }).toDataURL(); small = 'data:image/jpeg;base64,' + img.resize({ width: Math.min(120, w) }).toJPEG(70).toString('base64'); } } catch {}
  if (!thumb && ext === '.svg') thumb = 'data:image/svg+xml;base64,' + r.b64;
  attachments.save({ id, name: `LuminaRender ${new Date().toISOString().slice(0, 10)}${ext}`, kind: 'image', mime: r.mime, ext, thumb: small || thumb, created: Date.now(), lumina: { prompt: r.prompt, model: r.model, aspect: r.aspect_ratio, resolution: r.resolution } });
  if (convId && convos.get(convId)) { convos.setLattice(convId, latticeMod.merge(convos.get(convId).lattice || {}, { frame: { att: id, prompt: r.prompt, model: r.model, thumb: small, at: Date.now() } })); broadcastConvos(); }
  recordMetric('feature', {});
  return { ...r, b64: undefined, card: { type: 'lumina', att: id, thumb: thumb.length < 400000 ? thumb : small, prompt: r.prompt, model: r.model, aspect: r.aspect_ratio, resolution: r.resolution, cost: r.cost } };
}
ipcMain.handle('lumina:image', (_e, id) => { const m = attachments?.meta(String(id)); if (!m?.lumina) return null; try { return `data:${m.mime};base64,` + fs.readFileSync(attachments.file(m.id, m.ext)).toString('base64'); } catch { return null; } });
ipcMain.handle('lumina:save', async (e, id) => {
  const m = attachments?.meta(String(id)); if (!m?.lumina) return { ok: false };
  const out = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: path.join(app.getPath('downloads'), m.name.replace(/[\\/:*?"<>|]/g, '-')) });
  if (out.canceled || !out.filePath) return { ok: false };
  fs.copyFileSync(attachments.file(m.id, m.ext), out.filePath); return { ok: true, path: out.filePath };
});
ipcMain.handle('lattice:set', (_e, { convId, lattice } = {}) => { if (!convos.get(String(convId))) return { ok: false }; const l = latticeMod.merge({}, { ...(lattice || {}) }); const old = latticeMod.clean(convos.get(String(convId)).lattice || {}); l.frames = old.frames; convos.setLattice(String(convId), latticeMod.clean(l)); broadcastConvos(); return { ok: true, lattice: convos.get(String(convId)).lattice }; });

// 4.3.0 N28C: extra status (daily brief card, approvals, live mission steps, Live Spaces, report card) and remote actions.
function dailyBriefCard() {
  const s = store.getSettings(), now = Date.now(), m = metrics.summary(), st = study.stats();
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const rem = (s.chatReminders || []).filter(r => !r.done && r.at <= end.getTime()).sort((a, b) => a.at - b.at).slice(0, 4).map(r => ({ text: r.note || r.title || 'Reminder', at: r.at }));
  const g = goals.state(s.weeklyGoals), left = g.items.filter(i => !i.done);
  const bc = routines.brief?.()?.convId && convos.get(routines.brief().convId);
  const last = bc ? [...bc.messages].reverse().find(x => x.role === 'assistant' && x.brief && !x.error) : null;
  const today = last && new Date(last.ts || 0).toDateString() === new Date().toDateString();
  const h = new Date().getHours();
  return { hello: (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (nicknameOf(s) ? ', ' + nicknameOf(s) : ''),
    due: st.due || 0, streak: m.streak || 0, quests: m.quests ? { done: m.quests.done.length, total: m.quests.list.length } : null,
    reminders: rem, goals: { left: left.length, total: g.items.length, next: left[0]?.text || '' },
    activeToday: activeToday(),
    brief: today ? String(last.content || '').replace(/```[\s\S]*?```/g, '').slice(0, 900) : '', briefConv: bc?.id || null, at: now };
}
function phoneExtra() {
  const ph = store.getSettings().phone || {};
  const approvals = [...pendingConfirms.entries()].filter(([, p]) => p.requestId === 'bg').slice(0, 5).map(([id, p]) => ({ id, label: String(p.label || 'Approve an action').slice(0, 120), detail: String(p.detail || '').slice(0, 240), source: p.source || 'Nexus', at: p.at || 0 }));
  const ms = missions.state();
  const live = ms && missionSteps.id === ms.id ? { id: ms.id, status: ms.status, steps: missionSteps.list.slice(-12) } : null;
  const spaces = convos.summary().spaces || [];
  let report = null; try { report = weeklyReport(); } catch (e) { log('report', e.message); }
  return { approvals, missionLive: live, brief: dailyBriefCard(), report,
    spacesLive: spaces.filter(x => !x.builtin).slice(0, 8).map(x => spaceLive(x.id)).filter(Boolean),   // 4.3.1: your own Spaces (not Routines, Missions, Phone)
    focus: (() => { const f = focus.state(); return f.on ? { phase: f.phase, task: f.task || '', left: f.left, endsAt: f.endsAt, paused: f.paused, block: f.block, blocks: f.blocks, minutes: f.minutes } : null; })(),   // 4.3.1 Focus timer in N28C
    remote: { on: !!ph.remote, peek: !!ph.peek, platform: process.platform } };
}
const missionSteps = { id: null, list: [] };
function missionStepLog(st) {
  if (!st) return;
  if (missionSteps.id !== st.id) { missionSteps.id = st.id; missionSteps.list = []; }
  const last = missionSteps.list[missionSteps.list.length - 1], a = String(st.activity || '').slice(0, 120);
  if (a && (!last || last.text !== a || last.round !== st.round)) { missionSteps.list.push({ text: a, round: st.round, at: Date.now() }); if (missionSteps.list.length > 30) missionSteps.list.shift(); }
}
function phoneDocs() {
  return { at: Date.now(), list: docs.list().slice(0, 60).map(d => {
    const full = docs.get(d.id);
    return { id: d.id, kind: d.kind, title: d.title || (d.text || '').slice(0, 60), updated: d.updated, words: d.words, text: String(full?.text || '').slice(0, d.kind === 'jot' ? 1200 : 4000) };
  }) };
}
async function lockComputer() {
  const { execFile } = require('child_process'), run = (c, a) => new Promise((res, rej) => execFile(c, a, err => err ? rej(err) : res()));
  if (process.platform === 'darwin') await run('pmset', ['displaysleepnow']);
  else if (process.platform === 'win32') await run('rundll32.exe', ['user32.dll,LockWorkStation']);
  else await run('loginctl', ['lock-session']);
}
async function screenPeek() {
  const d = screen.getPrimaryDisplay(), sz = d.size, k = Math.min(1, 1280 / sz.width);
  const src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(sz.width * k), height: Math.round(sz.height * k) } }))[0];
  if (!src) throw new Error('Could not see the screen.');
  const jpg = src.thumbnail.toJPEG(62);
  await companion.put('peek', { at: Date.now(), mime: 'image/jpeg', b64: jpg.toString('base64'), w: src.thumbnail.getSize().width, h: src.thumbnail.getSize().height });
  notify('👀 Your phone peeked at your screen', 'N28C took one screenshot. Turn this off in Settings → Phone.', null, { force: true });
}
async function phoneAct(op, m) {
  const ph = store.getSettings().phone || {};
  const needRemote = () => { if (!ph.remote) throw new Error('Turn on "Remote actions" in Nexus on your computer (Settings → Phone) first.'); };
  if (op === 'approve' || op === 'deny') { const p = pendingConfirms.get(String(m.id)); if (!p || p.requestId !== 'bg') throw new Error('That approval is gone.'); p.resolve(op === 'approve'); return {}; }
  if (op === 'jot_add') { const d = jotAdd(String(m.text || '')); if (!d) throw new Error('Type something to jot.'); companion.mark('docs'); return { id: d.id }; }
  if (op === 'docs_sync') { await companion.put('docs', phoneDocs()); return {}; }
  if (op === 'credit') {   // a phone-only answer counts toward your quests and streak (at most 60 a day)
    const day = new Date().toDateString(), c = store.getSettings().phoneCredit || {}; const n = c.day === day ? c.n : 0;
    if (m.event === 'chat' && n < 60) { store.setSettings({ phoneCredit: { day, n: n + 1 } }); recordMetric('chat', { phone: true }); }
    return {};
  }
  if (op === 'focus_start') { needRemote(); const r = focus.start({ minutes: Math.max(5, Math.min(120, +m.minutes || 25)), task: String(m.task || '').slice(0, 80) }); broadcast('focus:state', focus.state()); return { focus: !!r }; }
  if (op === 'focus_stop') { needRemote(); focus.stop(false); broadcast('focus:state', focus.state()); return {}; }
  if (op === 'music') { needRemote(); const a = ['play', 'pause', 'playpause', 'next', 'previous'].includes(m.action) ? m.action : 'playpause'; return { text: await mediaKit().control(a, '') }; }
  if (op === 'now_playing') { try { return { now: await mediaKit().nowPlaying() }; } catch { return { now: null }; } }
  if (op === 'lock') { needRemote(); await lockComputer(); return {}; }
  if (op === 'screen_peek') { if (!ph.peek) throw new Error('Turn on "Screen peek" in Nexus on your computer (Settings → Phone) first.'); await screenPeek(); return {}; }
  return undefined;
}

// Auto-sorted Spaces: after a new chat's first answer (Settings → Personal → Sort new chats into Spaces)
function autoSortConv(c) {
  if (!store.getSettings().autoSort?.enabled || c.spaceId || c.kind || c.sorted) return null;
  const d = convos.load(), best = autosort.suggest(c, d.spaces, id => d.list.filter(x => x.spaceId === id));
  c.sorted = true;
  if (best) { convos.moveToSpace(c.id, best.id); broadcastConvos(); broadcast('autosort:moved', { convId: c.id, space: best.name }); }
  return best;
}
ipcMain.handle('autosort:all', () => {
  const d = convos.load(); let n = 0;
  for (const c of d.list.filter(x => !x.spaceId && !x.kind && x.messages.length)) { const best = autosort.suggest(c, d.spaces, id => d.list.filter(x => x.spaceId === id)); if (best) { convos.moveToSpace(c.id, best.id); n++; } }
  broadcastConvos(); return { ok: true, moved: n };
});

// Highlight orb (v2.7.1): highlight text in any app → a small orb with Explain · Summarize · Translate · Copy ·
// Remember · Phone. The NexusCore helper watches mouse-ups and reads the highlighted text through Accessibility
// (read-only; never presses ⌘C or touches the clipboard, skips password fields and Nexus itself).
const orbSel = { text: '', app: '', bundle: '', status: 'off', error: '', bounds: null };
let clipOrbHide = null, lastOrbAt = 0;
function openQuickChatWithText(text, { app = 'Clipboard', auto = null, label = 'Copied text' } = {}) {
  if (!quickChat) createQuickChat();
  const a = attachments.fromText(text, `${label}${app ? ' · ' + app : ''}`);
  quickChat.show(); quickChat.focus();
  quickChat.webContents.send('quickchat:shown');
  quickChat.webContents.send('quickchat:attach', { attachment: attachments.public(a), explain: { app, preview: text.slice(0, 280), chars: text.length, auto } });
}
// The orb the person sees: Axiom's own Crucible skin while Axiom is active, otherwise their own skin
function orbLook() {
  const s = store.getSettings(), p = allPersonas().find(x => x.id === s.activePersona) || {};
  const skin = p.apex ? 'crucible' : flagOn('orb_skins') && s.orbSkin && orbSkinOk(s.orbSkin) ? s.orbSkin : 'aurora';
  return { color: HEX.test(p.color || '') ? p.color : '#3dffa0', skin };
}
const orbMuted = () => (store.getSettings().orbMutedApps || []).map(a => String(a.bundle || a.name || ''));
function selWatchWanted() { return store.getSettings().clipOrb !== false && !!helperCaps.selwatch && helper.available(); }
let selRetry = null;
function syncSelWatch() {
  clearTimeout(selRetry);
  if (selWatchWanted()) { if (orbSel.status !== 'on' && helper.send({ cmd: 'sel_watch_start', pid: process.pid })) orbSel.status = 'starting'; }
  else { if (orbSel.status === 'on' || orbSel.status === 'starting') helper.send({ cmd: 'sel_watch_stop' }); orbSel.status = helperCaps.platform === 'win32' && !helperCaps.selwatch ? 'windows' : helperCaps.built && !helperCaps.selwatch ? 'old-helper' : 'off'; hideOrb(); }
}
function orbStatus() { return { status: orbSel.status, error: orbSel.error, helper: !!helperCaps.built, helperVersion: helperCaps.version || 0, supported: !!helperCaps.selwatch, muted: store.getSettings().orbMutedApps || [], last: orbSel.last || null }; }
function hideOrb() { clearTimeout(clipOrbHide); if (clipOrb && !clipOrb.isDestroyed() && clipOrb.isVisible()) clipOrb.hide(); orbSel.bounds = null; }
function inOrb(pt) { const b = orbSel.bounds; return !!b && pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height; }
function onSelectionEvent(ev) {
  if (ev.event === 'sel_watch') {
    orbSel.status = ev.ok ? 'on' : ev.error === 'AX_DENIED' ? 'needs-access' : 'error'; orbSel.error = ev.ok ? '' : ev.error || '';
    log('highlight orb', ev.ok ? 'watching' : 'not started: ' + (ev.error || '?'));
    if (!ev.ok && selWatchWanted()) selRetry = setTimeout(syncSelWatch, 60e3);      // try again once Accessibility is on
    broadcast('cliporb:status', orbStatus()); return;
  }
  if (ev.event === 'sel_clear') { if (!inOrb(screen.getCursorScreenPoint())) hideOrb(); return; }
  if (ev.event === 'sel_miss') { orbSel.last = { at: Date.now(), app: String(ev.app || '').slice(0, 60), ok: false }; broadcast('cliporb:status', orbStatus()); return; }
  if (ev.event === 'selection') { orbSel.last = { at: Date.now(), app: String(ev.app || '').slice(0, 60), ok: true, chars: String(ev.text || '').length }; showOrb(ev); broadcast('cliporb:status', orbStatus()); }
}
function showOrb(ev, { test = false } = {}) {
  const s = store.getSettings(), text = String(ev.text || '');
  if (s.clipOrb === false || text.trim().length < 2 || orbMuted().includes(ev.bundle || ev.app)) return;
  if (!test && (focus?.muting?.() || BrowserWindow.getFocusedWindow())) return;      // not while you focus, never over Nexus itself
  if (text === orbSel.text && Date.now() - lastOrbAt < 1200 && clipOrb?.isVisible()) return;
  lastOrbAt = Date.now(); Object.assign(orbSel, { text, app: String(ev.app || '').slice(0, 60), bundle: String(ev.bundle || '').slice(0, 120) });
  if (!clipOrb || clipOrb.isDestroyed()) {
    clipOrb = new BrowserWindow({ width: 460, height: 64, show: false, frame: false, transparent: true, resizable: false, movable: false, hasShadow: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, fullscreenable: false,
      backgroundColor: '#00000000', ...(process.platform === 'darwin' ? { type: 'panel' } : {}), webPreferences });
    clipOrb.setAlwaysOnTop(true, 'pop-up-menu'); clipOrb.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    addFades(clipOrb, { inMs: 160, outMs: 140 });
    clipOrb.loadFile(path.join(__dirname, 'renderer', 'cliporb.html'));
    clipOrb.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); clipOrb.webContents.on('will-navigate', e => e.preventDefault());
    clipOrb.on('closed', () => { clipOrb = null; orbSel.bounds = null; });
  }
  orbSel.fresh = true;
  // 3.6 Windows: the helper reports physical pixels; Electron places windows in DIPs
  const pt = Number.isFinite(ev.x) && Number.isFinite(ev.y) ? (ev.physical && screen.screenToDipPoint ? screen.screenToDipPoint({ x: ev.x, y: ev.y }) : { x: ev.x, y: ev.y }) : null;
  orbSel.anchor = pt ? { x: Math.round(pt.x), y: Math.round(pt.y) } : screen.getCursorScreenPoint();
  const send = () => {
    clipOrb?.webContents.send('cliporb:show', { chars: text.length, preview: text.replace(/\s+/g, ' ').slice(0, 80), app: orbSel.app, ...orbLook() });
    // The orb reports its size (cliporb:size) and is placed then; if it doesn't within 400 ms, place it at its usual size anyway
    clearTimeout(orbSel.sizeWait); orbSel.sizeWait = setTimeout(() => { if (orbSel.fresh) placeOrb(460, 64); }, 400);
  };
  if (clipOrb.webContents.isLoading()) clipOrb.webContents.once('did-finish-load', send); else send();
}
// The orb tells us its real size once it's drawn; then it's placed just above the end of the highlight
ipcMain.on('cliporb:size', (e, { w, h } = {}) => {
  if (!clipOrb || clipOrb.isDestroyed() || e.sender !== clipOrb.webContents || !orbSel.anchor) return;
  placeOrb(w, h);
});
function placeOrb(w, h) {
  if (!clipOrb || clipOrb.isDestroyed() || !orbSel.anchor) return;
  clearTimeout(orbSel.sizeWait);
  const width = Math.max(120, Math.min(640, Math.round(+w || 460))), height = Math.max(40, Math.min(120, Math.round(+h || 64)));
  const a = orbSel.anchor, wa = screen.getDisplayNearestPoint(a).workArea;
  let x = a.x - 28, y = a.y - height - 12;                                 // above, orb over the pointer
  if (y < wa.y + 4) y = a.y + 18;                                           // no room: below
  x = Math.min(Math.max(x, wa.x + 6), wa.x + wa.width - width - 6); y = Math.min(Math.max(y, wa.y + 4), wa.y + wa.height - height - 4);
  orbSel.bounds = { x: Math.round(x), y: Math.round(y), width, height };
  clipOrb.setBounds(orbSel.bounds); clipOrb.showInactive();
  if (orbSel.fresh) { orbSel.fresh = false; clearTimeout(clipOrbHide); clipOrbHide = setTimeout(hideOrb, 8000); }
}
ipcMain.on('cliporb:hover', (e, on) => { if (e.sender !== clipOrb?.webContents) return; clearTimeout(clipOrbHide); if (!on) clipOrbHide = setTimeout(hideOrb, 2500); });
ipcMain.handle('cliporb:status', async () => { if (!helperCaps.built || helperCaps.error) await refreshHelperCaps().catch(() => {}); if (orbSel.status === 'off' && selWatchWanted()) syncSelWatch(); return orbStatus(); });
// Settings → Personal → "Show it now": the orb with sample text by your pointer (checks the orb itself, without the helper)
ipcMain.handle('cliporb:test', () => {
  setTimeout(() => { const pt = screen.getCursorScreenPoint(); showOrb({ text: 'This is what the highlight orb looks like.', app: 'Nexus', bundle: '', x: pt.x, y: pt.y }, { test: true }); }, 150);
  return { ok: true };
});
ipcMain.handle('cliporb:unmute', (_e, key) => { const list = (store.getSettings().orbMutedApps || []).filter(a => (a.bundle || a.name) !== key); broadcast('settings:changed', store.setSettings({ orbMutedApps: list })); return orbStatus(); });
ipcMain.handle('cliporb:act', async (e, act) => {
  if (e.sender !== clipOrb?.webContents) return { ok: false };
  const text = orbSel.text; if (!text) { hideOrb(); return { ok: false }; }
  if (act === 'copy') { clipboard.writeText(text); clearTimeout(clipOrbHide); clipOrbHide = setTimeout(hideOrb, 900); return { ok: true }; }
  hideOrb();
  const opts = { app: orbSel.app, label: 'Highlighted text' };
  if (act === 'explain') openQuickChatWithText(text, { ...opts, auto: 0 });
  else if (act === 'summarize') openQuickChatWithText(text, { ...opts, auto: 2 });
  else if (act === 'translate') openQuickChatWithText(text, { ...opts, auto: 5 });
  else if (act === 'more') openQuickChatWithText(text, opts);
  else if (act === 'jot') { jotAdd(text); notify('✎ Jotted', text.slice(0, 120) + ' · in Jots & Docs'); }   // 4.3.0
  else if (act === 'remember') { const r = memory.add(text.slice(0, 300), 'highlight'); broadcast('memory:changed', memory.state()); notify('🧠 Remembered', r ? r.text.slice(0, 120) : 'Already in your memory.'); }
  else if (act === 'phone') { const r = await sendToPhone({ text }); notify(r.ok ? '📱 Sent to your phone' : '📱 Not sent', r.ok ? text.slice(0, 80) : r.error); }
  else if (act === 'mute' && (orbSel.bundle || orbSel.app)) {
    const list = (store.getSettings().orbMutedApps || []).filter(a => (a.bundle || a.name) !== (orbSel.bundle || orbSel.app)).concat({ bundle: orbSel.bundle, name: orbSel.app }).slice(-40);
    broadcast('settings:changed', store.setSettings({ orbMutedApps: list })); notify('Orb off in ' + (orbSel.app || 'this app'), 'Turn it back on in Settings → Personal.');
  }
  return { ok: true };
});

// Share sheet: share an answer with AirDrop, Messages, Mail, Notes… and send things to Nexus from any app's share menu
ipcMain.handle('share:text', (e, { text = '', title = '' } = {}) => {
  const { ShareMenu } = require('electron');
  if (WIN) { clipboard.writeText(String(text).slice(0, 50000)); return { ok: true, copied: true, note: 'Copied. Paste it into any app.' }; }   // 3.6 Windows: no share sheet; copy it
  if (!ShareMenu || process.platform !== 'darwin') return { ok: false, error: 'Sharing needs macOS.' };
  const menu = new ShareMenu({ texts: [String(text).slice(0, 50000)], ...(title ? {} : {}) });
  menu.popup({ window: BrowserWindow.fromWebContents(e.sender) || undefined });
  return { ok: true };
});
// 3.12 Watch & guide me: Nexus looks at your screen every few seconds and tells you the next click
const guideWatch = require('./src/guidewatch');
const gw = { on: false, goal: '', steps: [], win: null, timer: null, busy: false, last: '', same: 0, persona: '' };
function guideSend(st) { if (gw.win && !gw.win.isDestroyed()) gw.win.webContents.send('guide:step', { goal: gw.goal, count: gw.steps.length, ...st }); }
function guideAgent() {
  const s = store.getSettings(), all = allPersonas();
  const order = [s.guideAgent, 'neodela', 'paragon', 'lyte', 'flash'].filter(Boolean);
  for (const id of order) { const p = all.find(x => x.id === id && !x.apex); if (p && accessDecision(p, bindingFor(p, s), s, all).mode !== 'blocked') return p.id; }
  return '';
}
function guideWindow() {
  if (gw.win && !gw.win.isDestroyed()) return gw.win;
  const { workArea } = screen.getPrimaryDisplay(), W = 360;
  gw.win = new BrowserWindow({ width: W, height: 170, x: workArea.x + workArea.width - W - 16, y: workArea.y + 16, show: false, frame: false, transparent: true, resizable: false, movable: true, hasShadow: false,
    fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: true, backgroundColor: '#00000000', webPreferences });
  gw.win.setAlwaysOnTop(true, 'screen-saver'); gw.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  try { gw.win.setContentProtection(true); } catch {}   // never in its own screenshots
  gw.win.loadFile(path.join(__dirname, 'renderer', 'gw.html'));
  gw.win.once('ready-to-show', () => gw.win.showInactive());
  gw.win.on('closed', () => { gw.win = null; guideStop(); });
  return gw.win;
}
async function guideLook(note = '') {
  if (!gw.on || gw.busy) return;
  gw.busy = true; guideSend({ busy: true });
  try {
    const shot = await screenAware.capture({ mode: 'screen' });
    const drop = id => { for (const ext of ['.json', '.png', '.jpg']) { try { require('fs').unlinkSync(attachments.file(id, ext)); } catch {} } };
    if (gw.shot) drop(gw.shot); gw.shot = shot.id;   // only the latest look is kept, and it's removed when guiding stops
    const sig = require('crypto').createHash('sha1').update(require('fs').readFileSync(attachments.file(shot.id, shot.ext))).digest('hex');
    if (!note && sig === gw.last && gw.steps.length && gw.same < 3) { gw.same++; return; }   // nothing changed yet
    gw.same = 0; gw.last = sig;
    const r = await runChat({ personaId: gw.persona, messages: [{ role: 'user', content: guideWatch.prompt(gw.goal, gw.steps, note), attachments: [{ id: shot.id }] }],
      systemExtra: '\n\n' + guideWatch.SYSTEM, noTools: true, noMemory: true, noCount: gw.steps.length > 0, interactive: false });
    if (!gw.on) return;
    if (!r?.ok) { guideSend({ say: r?.error || 'Nexus couldn’t look at the screen.', where: '' }); if (r?.fatal || r?.blocked) guideStop(false); return; }
    const st = guideWatch.parse(r.text); if (!st) return;
    if (st.say !== gw.steps[gw.steps.length - 1]?.say) gw.steps.push(st);
    guideSend({ ...st, busy: false });
    if (st.done || gw.steps.length >= guideWatch.MAX_STEPS) { if (!st.done) guideSend({ say: "That's a lot of steps. Stop here, or start again with a smaller goal.", where: '' }); guideStop(false); }
  } catch (e) { guideSend({ say: e.permission ? e.message : 'Couldn’t see the screen: ' + e.message, where: '' }); if (e.permission) guideStop(false); }
  finally { gw.busy = false; guideSend({ busy: false }); }
}
function guideStart(goal) {
  goal = String(goal || '').trim().slice(0, 300); if (!goal) return { ok: false, error: 'Say what you want to do first.' };
  const persona = guideAgent(); if (!persona) return { ok: false, error: 'No agent can look at pictures right now. Check Settings → Models & keys.' };
  guideStop(false);
  Object.assign(guide, { on: true, goal, steps: [], last: '', same: 0, persona });
  guideWindow(); if (typeof hud !== 'undefined' && hud && !hud.isDestroyed?.()) hud.hide();
  setTimeout(() => guideLook(), 900);
  gw.timer = setInterval(() => guideLook(), guideWatch.EVERY_MS);
  recordMetric('guide');
  return { ok: true, persona };
}
function guideStop(close = true) {
  if (gw.shot) { for (const ext of ['.json', '.png', '.jpg']) { try { require('fs').unlinkSync(attachments.file(gw.shot, ext)); } catch {} } gw.shot = null; }
  gw.on = false; clearInterval(gw.timer); gw.timer = null;
  if (close && gw.win && !gw.win.isDestroyed()) gw.win.close();
}
ipcMain.handle('guide:start', (_e, goal) => guideStart(goal));
ipcMain.handle('guide:next', (_e, note) => { gw.same = 99; guideLook(typeof note === 'string' ? note : 'I did that step.'); return { ok: true }; });
ipcMain.handle('guide:stop', () => { guideStop(true); return { ok: true }; });
ipcMain.on('guide:resize', (_e, h) => { if (gw.win && !gw.win.isDestroyed()) { const b = gw.win.getBounds(), nh = Math.max(120, Math.min(400, +h + 12 || 170)); if (Math.abs(b.height - nh) > 2) gw.win.setBounds({ ...b, height: nh }); } });
// 3.13: the numbers the home-screen widget and the desktop widgets show
const widgetSnapshot = st => { const g = goals.state(store.getSettings().weeklyGoals), next = (store.getSettings().chatReminders || []).filter(r => !r.done && r.at > Date.now()).sort((a, b) => a.at - b.at)[0];
        const last = convos.summary().list[0];
        return { at: Date.now(), points: (() => { try { return cirkts ? cirkts.state().balance : st.stats?.points || 0; } catch { return st.stats?.points || 0; } })(),   // 4.0: your Cirkts balance
           streak: st.stats?.streak || 0, challenge: st.challenge ? { text: st.challenge.text, progress: st.challenge.progress, n: st.challenge.n, done: !!st.challenge.done } : null,
          goals: { done: g.items.filter(i => i.done).length, total: g.items.length, next: (g.items.find(i => !i.done) || {}).text || '', items: g.items.slice(0, 6).map(i => ({ id: i.id, text: i.text.slice(0, 60), done: !!i.done })) },
          reminder: next ? { at: next.at, title: next.title || next.note || 'A chat' } : null,
          reminders: (store.getSettings().chatReminders || []).filter(r => !r.done && r.at > Date.now()).sort((a, b) => a.at - b.at).slice(0, 4).map(r => ({ id: r.id, at: r.at, title: String(r.note || r.title || 'A chat').slice(0, 60) })),
          best: st.stats?.bestStreak || 0, lastChat: last ? { title: last.title } : null, due: st.study?.due || 0, device: st.device?.name || '',
          quests: st.quests ? { done: st.quests.done, all: st.quests.all, bonus: st.quests.bonus, list: st.quests.list.map(q => ({ text: q.text, n: q.n, progress: q.progress, done: q.done, reward: q.reward })) } : null,
          nextup: nextUp(st, g) }; };
// 4.1.0 smart "Next up" widget: the few things that matter most right now, most urgent first
function nextUp(st, g) {
  const now = Date.now(), out = [], rems = (store.getSettings().chatReminders || []).filter(r => !r.done).sort((a, b) => a.at - b.at);
  const soon = rems.find(r => r.at < now + 3 * 3600e3); if (soon) out.push({ kind: 'reminder', icon: 'alarm', text: String(soon.note || soon.title || 'A reminder').slice(0, 60), at: soon.at, id: soon.id, late: soon.at < now });
  try { const f = focus.state(); if (f?.on) out.push({ kind: 'focus', icon: 'focus', text: f.phase === 'break' ? 'Focus break' : `Focus block ${f.block}/${f.blocks}`, endsAt: f.endsAt || 0 }); } catch {}
  if ((st.study?.due || 0) > 0) out.push({ kind: 'study', icon: 'cards', text: `${st.study.due} card${st.study.due === 1 ? '' : 's'} to review`, open: 'study' });
  const q = st.quests?.list?.find(x => !x.done); if (q) out.push({ kind: 'quest', icon: 'star', text: q.text, small: `+${q.reward}`, progress: `${q.progress}/${q.n}` });
  const goal = g.items.find(i => !i.done); if (goal) out.push({ kind: 'goal', icon: 'target', text: goal.text.slice(0, 60), id: goal.id });
  if (!soon && rems[0]) out.push({ kind: 'reminder', icon: 'alarm', text: String(rems[0].note || rems[0].title || 'A reminder').slice(0, 60), at: rems[0].at, id: rems[0].id });
  return out.slice(0, 3);
}
// 4.1.0 the Jot widget: quick notes, kept in a "Jots" chat so they're searchable and synced like any chat
function jotConv() { const d = convos.load(); return d.list.find(c => c.kind === 'jot' && !c.incognito) || null; }
// 4.2.0: jots are saved in Jots & Docs (the Write window) and no longer listed in the widget. The old Jots chat is copied
// over once (the chat itself is left alone).
function jotsMove() {
  const st = store.getSettings(); if (st.jotsMoved) return;
  const c = jotConv(); let n = 0;
  if (c) for (const m of c.messages.filter(m => m.role === 'user')) if (docs.addJot(m.content, m.ts || Date.now())) n++;
  store.setSettings({ jotsMoved: true }); if (n) log('jots moved to Jots & Docs', { n });
}
function jotList() { return docs.jots(10).map(d => ({ text: d.text.slice(0, 120), ts: d.updated })); }
function jotAdd(text) {
  jotsMove();
  const d = docs.addJot(text); if (!d) return null;
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) try { w.webContents.send('write:changed', { jot: d.id }); } catch {}
  companion?.mark?.('docs');   // 4.3.0 N28C sees it too
  return d;
}
// 4.3.0 Jots everywhere: a tiny jot box from anywhere (⌥⇧J / Alt+Shift+J, or the menu bar)
let jotWin = null;
function openJotWindow() {
  if (jotWin && !jotWin.isDestroyed()) { jotWin.show(); jotWin.focus(); return; }
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  jotWin = new BrowserWindow({ width: 460, height: 64, x: Math.round(d.x + (d.width - 460) / 2), y: Math.round(d.y + d.height * 0.22), frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: '#00000000', webPreferences });
  jotWin.loadFile(path.join(__dirname, 'renderer', 'jot.html'));
  jotWin.once('ready-to-show', () => { jotWin.show(); jotWin.focus(); });
  jotWin.on('blur', () => { if (jotWin && !jotWin.isDestroyed()) jotWin.hide(); });
}
ipcMain.on('jotwin:close', () => { if (jotWin && !jotWin.isDestroyed()) jotWin.hide(); });
ipcMain.handle('write:jot', (_e, text) => { const d = jotAdd(text); return d ? { ok: true, id: d.id } : { ok: false }; });   // 4.2.0
const widgetLocal = () => { const m = metrics.summary(), ch = m.challenge; return widgetSnapshot({ stats: { points: m.points, streak: m.streak, bestStreak: m.bestStreak }, challenge: ch ? { text: ch.text, progress: ch.progress, n: ch.n, done: ch.done } : null, quests: m.quests, study: study.stats(), device: thisDevice() }); };
// 3.13 desktop widgets: a small floating panel with the widgets you pick (Settings → General → Desktop widgets)
// 4.0.2: every desktop widget is its own small window (like macOS widgets): drag each one by its title, each remembers its spot
const deskWins = new Map();   // widget id → BrowserWindow
const DESK_ITEMS = ['nextup', 'streak', 'goals', 'reminders', 'challenge', 'quests', 'study', 'clock', 'ask', 'jot', 'focus', 'flashcard', 'music', 'weather', 'visitors'];   // 4.1.0: + nextup, quests, jot, visitors   // 4.0: + ask, focus, flashcard, music, weather
const DESK_H = { nextup: 130, quests: 120, jot: 120, visitors: 96, streak: 86, goals: 150, reminders: 110, challenge: 96, study: 86, clock: 86, ask: 92, focus: 110, flashcard: 130, music: 104, weather: 96 };   // first-time guesses, for laying them out
function deskCfg() { const d = store.getSettings().deskWidgets || {}; return { on: !!d.on, items: (d.items || ['streak', 'goals', 'reminders']).filter(x => DESK_ITEMS.includes(x)), top: !!d.top, pos: d.pos || null, spots: d.spots || {}, carry: d.carry !== false, theme: wthemeOk(d.theme) ? d.theme : 'plain' }; }
// 4.3.0 widget themes from the Cirkts shop (Frosted is free)
function wthemeOk(k) { if (!k || !/^[a-z0-9_-]{2,30}$/.test(k)) return false; const it = cosmetics.item('wtheme:' + k); return !!it && (it.price === 0 || cirkts?.owns?.(it.id) || allSkins()); }
function deskSpot(k, i, c) {
  const saved = c.spots[k];
  // 4.0.6: a saved spot is never thrown away. If its screen is gone or it hangs off an edge, it's pulled onto the nearest screen.
  if (saved && Number.isFinite(+saved.x) && Number.isFinite(+saved.y)) {
    // 4.0.7: clamp to the whole screen, not the work area. On a Mac with Stage Manager (or the Dock on the left) the work
    // area starts ~220px in, so widgets you'd parked at the left edge were pushed right on every launch and saved there.
    // 4.2.0: a widget remembers which monitor it was on. If that monitor is unplugged it goes to the same corner of your
    // main monitor (Settings → Desktop widgets → "Move widgets when a monitor is unplugged"), and back when it returns.
    const DS = require('./src/deskspot'), home = DS.homeDisplay(saved, screen.getAllDisplays());
    if (home) return DS.clampSpot(saved, home);
    if (saved.d != null && saved.fb && c.carry) return DS.carrySpot(saved, saved.fb, screen.getPrimaryDisplay().bounds, 260, DESK_H[k] || 100);
    return require('./src/deskspot').clampSpot(saved, screen.getDisplayNearestPoint({ x: Math.round(saved.x + 130), y: Math.round(saved.y + 20) }));
  }
  // first time: columns from the top right corner (or from where the old single panel was), going down, then left
  const { workArea: wa } = screen.getPrimaryDisplay(), W = 260, G = 12;
  let x = c.pos ? c.pos.x : wa.x + wa.width - W - 20, y = c.pos ? c.pos.y : wa.y + 60;
  const top = y;
  for (const k2 of c.items.slice(0, i)) { y += (DESK_H[k2] || 100) + G; if (y + (DESK_H[k] || 100) > wa.y + wa.height - 20) { y = top; x -= W + G; } }
  if (y + (DESK_H[k] || 100) > wa.y + wa.height - 20) { y = top; x -= W + G; }
  return { x: Math.max(wa.x, x), y };
}
// 4.0.6: where a widget is gets saved no matter which window events the system sends (a Mac drag by the title
// row didn't always send them): on move/moved, every 2 seconds while widgets are open, and when Nexus quits.
// 4.2.1: around sleep, wake and monitors coming and going, macOS moves (and sometimes stretches) windows on its own.
// While that settles nothing is saved; then every widget goes back to its saved spot at its real width.
let deskFrozenUntil = 0;
const deskFreeze = ms => { deskFrozenUntil = Math.max(deskFrozenUntil, Date.now() + ms); };
const DESK_W = 260;
function deskKeep(k, w, why = 'move') {
  if (Date.now() < deskFrozenUntil && why !== 'quit') return false;
  if (!w || w.isDestroyed() || w._sizing || Date.now() - (w._placed || 0) < 1500) return false;
  const b = w.getBounds(), cur = store.getSettings().deskWidgets || {}, old = (cur.spots || {})[k];
  // 4.0.7: the 2-second check only saves a move you made. Where Nexus (or the system) put it isn't a move you made.
  if (why === 'check' && w._want && Math.abs(w._want.x - b.x) <= 2 && Math.abs(w._want.y - b.y) <= 2) return false;
  if (old && old.x === b.x && old.y === b.y && (w._carried || old.d != null)) return false;
  if (w._carried && why === 'check') return false;   // 4.2.0: carried to another monitor by Nexus: keep the spot on its own monitor
  const dsp = screen.getDisplayMatching(b);
  store.setSettings({ deskWidgets: { ...cur, spots: { ...(cur.spots || {}), [k]: deskSpotOf(b, dsp) } } }); w._carried = false;
  log('desk widget saved', { k, x: b.x, y: b.y, why });
  return true;
}
// 4.2.0: a saved spot remembers its monitor (id + its size then), so it can go back there
const deskSpotOf = (b, dsp) => ({ x: b.x, y: b.y, d: dsp.id, fb: { x: dsp.bounds.x, y: dsp.bounds.y, width: dsp.bounds.width, height: dsp.bounds.height } });
// a monitor was plugged in or out: put every widget where it belongs now (its own monitor if connected, else carried)
function deskReplace(why) {
  if (!deskWins.size) return;
  const c = deskCfg();
  [...deskWins.entries()].forEach(([k, w], i) => {
    if (w.isDestroyed()) return;   // 4.2.1: ones you never moved go back to their first spot too
    const at = deskSpot(k, c.items.indexOf(k), c), b = w.getBounds();
    const home = require('./src/deskspot').homeDisplay(c.spots[k], screen.getAllDisplays());
    w._carried = !home;
    const h = w._pendingH ? Math.max(50, Math.ceil(w._pendingH) + 4) : b.height; w._pendingH = 0;
    if (Math.abs(b.x - at.x) > 2 || Math.abs(b.y - at.y) > 2 || b.width !== DESK_W || b.height !== h) { w._sizing = true; w._want = { x: at.x, y: at.y }; w.setBounds({ x: at.x, y: at.y, width: DESK_W, height: h }); setTimeout(() => { if (!w.isDestroyed()) w._sizing = false; }, 400); }
  });
  log('desk widgets replaced', { why, displays: screen.getAllDisplays().length });
}
let deskSettleT = null;
const deskSettle = (why, ms = 2500) => { deskFreeze(ms + 1500); clearTimeout(deskSettleT); deskSettleT = setTimeout(() => deskReplace(why), ms); };
app.whenReady().then(() => {
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => deskSettle(ev));
  powerMonitor.on('suspend', () => deskFreeze(24 * 3600e3));   // asleep: nothing the system does counts as a move
  powerMonitor.on('resume', () => { deskFrozenUntil = 0; deskSettle('woke', 3500); });
  powerMonitor.on('unlock-screen', () => { if (Date.now() < deskFrozenUntil) return; deskSettle('unlocked', 1500); });
});
let deskPoll = null;
function deskPollSet() {
  if (deskWins.size && !deskPoll) deskPoll = setInterval(() => { for (const [k, w] of deskWins) deskKeep(k, w, 'check'); }, 2000);
  if (!deskWins.size && deskPoll) { clearInterval(deskPoll); deskPoll = null; }
}
app.on('before-quit', () => { for (const [k, w] of deskWins) deskKeep(k, w, 'quit'); });
function syncDeskWidgets() {
  const c = deskCfg(), want = c.on ? c.items : [];
  for (const [k, w] of deskWins) if (!want.includes(k)) { if (!w.isDestroyed()) w.close(); deskWins.delete(k); }
  want.forEach((k, i) => {
    const old = deskWins.get(k);
    if (old && !old.isDestroyed()) { old.setAlwaysOnTop(c.top, 'floating'); old.webContents.send('deskw:data', { cfg: { ...c, items: [k] }, data: widgetLocal() }); return; }
    const at = deskSpot(k, i, c), W = 260;
    const w = new BrowserWindow({ width: W, height: DESK_H[k] || 100, x: Math.round(at.x), y: Math.round(at.y), frame: false, transparent: true, resizable: false, movable: true,
      skipTaskbar: true, hasShadow: false, fullscreenable: false, minimizable: false, maximizable: false, focusable: true, show: false, backgroundColor: '#00000000', webPreferences });
    w.setAlwaysOnTop(c.top, 'floating');
    w.loadFile(path.join(__dirname, 'renderer', 'deskwidgets.html'), { query: { k } });
    w.once('ready-to-show', () => w.showInactive());
    // 4.0.4: remember where you put it (on 'moved' and, in case that doesn't fire, shortly after any move you make)
    const keep = () => deskKeep(k, w);
    let moveT = null;
    w.on('moved', keep); w.on('move', () => { clearTimeout(moveT); moveT = setTimeout(keep, 500); });
    // 4.2.1: a widget is always 260 wide (after waking, macOS sometimes stretched them)
    w.on('resize', () => { if (w.isDestroyed() || w._sizing) return; const b = w.getBounds(); if (b.width !== DESK_W) { w._sizing = true; w.setBounds({ ...b, width: DESK_W }); setTimeout(() => { if (!w.isDestroyed()) w._sizing = false; }, 300); } });
    w._placed = Date.now(); w._want = { x: Math.round(at.x), y: Math.round(at.y) }; w._fresh = true;   // 4.2.0: its first size keeps the top (that's the saved spot)
    w._carried = !!(c.spots[k] && c.spots[k].d != null && !require('./src/deskspot').homeDisplay(c.spots[k], screen.getAllDisplays()));
    // 4.0.7: if the system moved it while opening (it likes to keep new windows out of the Stage Manager / Dock strip), put it back
    w.once('show', () => setTimeout(() => { if (w.isDestroyed()) return; const b = w.getBounds(); if (Math.abs(b.x - w._want.x) > 2 || Math.abs(b.y - w._want.y) > 2) { w._sizing = true; w.setPosition(w._want.x, w._want.y); setTimeout(() => { if (!w.isDestroyed()) w._sizing = false; }, 300); log('desk widget put back', { k, from: { x: b.x, y: b.y }, to: w._want }); } }, 120));
    w.on('closed', () => { if (deskWins.get(k) === w) deskWins.delete(k); deskPollSet(); });
    deskWins.set(k, w);
  });
  deskPollSet();
}
const deskOf = sender => { for (const [k, w] of deskWins) if (!w.isDestroyed() && w.webContents === sender) return { k, w }; return null; };
ipcMain.handle('deskw:get', e => { const c = deskCfg(), me = deskOf(e.sender); return { cfg: me ? { ...c, items: [me.k] } : c, data: widgetLocal() }; });
ipcMain.handle('deskw:set', (_e, patch) => { const cur = store.getSettings().deskWidgets || {}; store.setSettings({ deskWidgets: { ...cur, ...patch } }); syncDeskWidgets(); return deskCfg(); });
ipcMain.handle('deskw:arrange', () => { const cur = store.getSettings().deskWidgets || {}; store.setSettings({ deskWidgets: { ...cur, spots: {}, pos: null } }); for (const w of deskWins.values()) if (!w.isDestroyed()) w.close(); deskWins.clear(); syncDeskWidgets(); return { ok: true }; });
ipcMain.on('deskw:size', (e, h) => {
  const me = deskOf(e.sender); if (!me) return;
  if (Date.now() < deskFrozenUntil) { me.w._pendingH = +h; return; }   // 4.2.1: settles after wake / a monitor change
  const b = { ...me.w.getBounds(), width: DESK_W }, sb = screen.getDisplayMatching(b).bounds, want = Math.max(50, Math.ceil(+h) + 4), nh = Math.min(want, sb.height - 20);
  if (Math.abs(b.height - nh) <= 2) { me.w._fresh = false; return; }
  const settle = (w, nb) => { if (w._want) w._want = { x: nb.x, y: nb.y }; w._sizing = true; w.setBounds(nb); setTimeout(() => { if (!w.isDestroyed()) w._sizing = false; }, 300); };
  if (me.w._fresh || Date.now() - (me.w._placed || 0) < 3000) {
    // first sizes after opening (it can measure twice while its font loads): the top stays (it's the saved spot); only a widget that would run off the bottom of the screen moves up
    me.w._fresh = false;
    const ny = b.y + nh > sb.y + sb.height ? Math.max(sb.y, sb.y + sb.height - nh) : b.y;
    return settle(me.w, { ...b, y: ny, height: nh });
  }
  // 4.2.0: after that, the bottom stays where it is and the top moves (Spotify's song name got longer → the widget grows
  // upward), and widgets stacked on it in the same column move with it so nothing overlaps and the gaps stay the same.
  const others = [...deskWins.entries()].filter(([k, w]) => k !== me.k && !w.isDestroyed()).map(([k, w]) => { const o = w.getBounds(); return { k, x: o.x, y: o.y, w: o.width, h: o.height }; })
    .filter(o => { const d = screen.getDisplayMatching({ x: o.x, y: o.y, width: o.w, height: o.h }); return String(d.id) === String(screen.getDisplayMatching(b).id); });
  const r = require('./src/deskspot').layoutResize({ k: me.k, x: b.x, y: b.y, w: b.width, h: b.height }, nh, others, sb);
  settle(me.w, { ...b, y: r.me.y, height: nh });
  const cur = store.getSettings().deskWidgets || {}, spots = { ...(cur.spots || {}) };
  for (const m of r.moved) { const w = deskWins.get(m.k); if (!w || w.isDestroyed()) continue; const ob = w.getBounds(); settle(w, { ...ob, width: DESK_W, y: m.y }); if (!w._carried) spots[m.k] = deskSpotOf({ x: ob.x, y: m.y }, screen.getDisplayMatching(ob)); }
  if (!me.w._carried) spots[me.k] = deskSpotOf({ x: b.x, y: r.me.y }, screen.getDisplayMatching(b));
  store.setSettings({ deskWidgets: { ...cur, spots } });
  if (r.moved.length) log('desk widgets made room', { k: me.k, grew: nh - b.height, moved: r.moved.map(m => m.k) });
});
// 4.3.0 Widget layouts: save which widgets are on and where (like "School", "Home", "Gaming") and switch with one click,
// on a schedule (a time of day on some weekdays), or when a set of monitors is plugged in.
const monitorsSig = () => screen.getAllDisplays().map(d => `${d.size.width}x${d.size.height}`).sort().join('+');
function deskLayouts() { const d = store.getSettings().deskWidgets || {}; return { list: Array.isArray(d.layouts) ? d.layouts : [], active: d.layout || '' }; }
function deskLayoutUse(id, why = 'you') {
  const cur = store.getSettings().deskWidgets || {}, L = (cur.layouts || []).find(x => x.id === id); if (!L) return { ok: false, error: 'That layout is gone.' };
  for (const w of deskWins.values()) if (!w.isDestroyed()) w.close();
  deskWins.clear();
  store.setSettings({ deskWidgets: { ...cur, on: true, items: L.items.filter(x => DESK_ITEMS.includes(x)), spots: { ...(L.spots || {}) }, layout: L.id, ...(L.theme !== undefined ? { theme: L.theme } : {}) } });
  syncDeskWidgets(); log('desk layout', { name: L.name, why }); broadcast('deskw:layout', { id: L.id, name: L.name });
  return { ok: true, name: L.name };
}
ipcMain.handle('deskw:layouts', () => ({ ...deskLayouts(), monitors: monitorsSig() }));
ipcMain.handle('deskw:layoutSave', (_e, { name, auto } = {}) => {
  const cur = store.getSettings().deskWidgets || {}, list = (cur.layouts || []).slice(), nm = String(name || '').trim().slice(0, 24) || 'Layout';
  const c = deskCfg(), spots = { ...c.spots };
  for (const [k, w] of deskWins) if (!w.isDestroyed()) { const b = w.getBounds(); spots[k] = deskSpotOf(b, screen.getDisplayMatching(b)); }
  const old = list.find(x => x.name.toLowerCase() === nm.toLowerCase());
  const L = { id: old?.id || 'l' + Date.now().toString(36), name: nm, items: c.items, spots, theme: cur.theme || '', auto: auto && typeof auto === 'object' ? cleanAuto(auto) : old?.auto || null };
  const next = old ? list.map(x => x === old ? L : x) : [...list, L].slice(-8);
  store.setSettings({ deskWidgets: { ...cur, layouts: next, layout: L.id } }); return { ok: true, layout: L };
});
ipcMain.handle('deskw:layoutAuto', (_e, { id, auto }) => { const cur = store.getSettings().deskWidgets || {}; store.setSettings({ deskWidgets: { ...cur, layouts: (cur.layouts || []).map(x => x.id === id ? { ...x, auto: auto ? cleanAuto(auto) : null } : x) } }); return deskLayouts(); });
ipcMain.handle('deskw:layoutUse', (_e, id) => deskLayoutUse(id));
ipcMain.handle('deskw:layoutRemove', (_e, id) => { const cur = store.getSettings().deskWidgets || {}; store.setSettings({ deskWidgets: { ...cur, layouts: (cur.layouts || []).filter(x => x.id !== id), layout: cur.layout === id ? '' : cur.layout } }); return deskLayouts(); });
function cleanAuto(a) {
  if (a.kind === 'time' && /^\d{2}:\d{2}$/.test(a.from || '') && /^\d{2}:\d{2}$/.test(a.to || '')) return { kind: 'time', from: a.from, to: a.to, days: (Array.isArray(a.days) ? a.days : [1, 2, 3, 4, 5]).map(Number).filter(d => d >= 0 && d <= 6) };
  if (a.kind === 'monitors') return { kind: 'monitors', sig: String(a.sig || monitorsSig()).slice(0, 200) };
  return null;
}
// which layout should be on right now (a monitor match wins over a schedule); null = leave it alone
function deskLayoutWanted(now = new Date()) {
  const { list } = deskLayouts(), sig = monitorsSig(), hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return list.find(L => L.auto?.kind === 'monitors' && L.auto.sig === sig) || list.find(L => L.auto?.kind === 'time' && L.auto.days.includes(now.getDay()) && (L.auto.from <= L.auto.to ? hm >= L.auto.from && hm < L.auto.to : hm >= L.auto.from || hm < L.auto.to)) || null;
}
let deskAutoLast = '';
function deskLayoutTick(why = 'time') {
  const c = deskCfg(); if (!c.on && !deskLayouts().list.some(L => L.auto)) return;
  const L = deskLayoutWanted(); if (!L) { deskAutoLast = ''; return; }
  if (L.id === deskAutoLast) return;   // switched to it already (you can still pick another by hand)
  deskAutoLast = L.id; if (deskLayouts().active !== L.id) deskLayoutUse(L.id, why);
}
app.whenReady().then(() => { setTimeout(() => deskLayoutTick('start'), 6000); setInterval(() => deskLayoutTick('time'), 60e3); screen.on('display-added', () => setTimeout(() => deskLayoutTick('monitors'), 4000)); screen.on('display-removed', () => setTimeout(() => deskLayoutTick('monitors'), 4000)); });
// 4.2.0: the monitors you can move your widgets to, and "move them all there"
ipcMain.handle('deskw:displays', () => { const p = screen.getPrimaryDisplay(); return screen.getAllDisplays().map((d, i) => ({ id: String(d.id), label: d.label || (d.id === p.id ? 'Main monitor' : `Monitor ${i + 1}`), main: d.id === p.id, w: d.size.width, h: d.size.height })); });
ipcMain.handle('deskw:moveAll', (_e, id) => {
  const to = screen.getAllDisplays().find(d => String(d.id) === String(id)); if (!to) return { ok: false, error: 'That monitor isn\'t connected.' };
  const DS = require('./src/deskspot'), cur = store.getSettings().deskWidgets || {}, spots = { ...(cur.spots || {}) };
  let n = 0;
  for (const [k, w] of deskWins) {
    if (w.isDestroyed()) continue;
    const b = w.getBounds(), from = screen.getDisplayMatching(b);
    if (String(from.id) === String(to.id)) continue;
    const at = DS.carrySpot({ x: b.x, y: b.y }, from.bounds, to.bounds, b.width, b.height);
    w._sizing = true; w._carried = false; w._want = at; w.setPosition(at.x, at.y); setTimeout(() => { if (!w.isDestroyed()) w._sizing = false; }, 400);
    spots[k] = deskSpotOf({ x: at.x, y: at.y }, to); n++;
  }
  store.setSettings({ deskWidgets: { ...cur, spots } });
  return { ok: true, moved: n };
});
ipcMain.on('deskw:open', (_e, what) => { showHud(); if (what === 'goals' || what === 'reminders') hud?.webContents.send('hud:open', what); else if (what === 'study') hud?.webContents.send('hud:open', 'study'); else if (what === 'jots') hud?.webContents.send('hud:open', 'jots'); });
const deskRefresh = () => { if (!deskWins.size) return; const c = deskCfg(), data = widgetLocal(); for (const [k, w] of deskWins) if (!w.isDestroyed()) w.webContents.send('deskw:data', { cfg: { ...c, items: [k] }, data }); };
// 4.0: the widgets do things: tick goals, finish or snooze reminders, ask a question, start focus, review a card, control Spotify, see the weather
let deskWx = { at: 0, v: null };
let deskVis = { at: 0, v: null };
ipcMain.handle('deskw:extra', async () => {
  const s = store.getSettings(), out = {};
  try { const q = study.queue(null, { limit: 1, newLimit: 1 }); const c = Array.isArray(q) ? q[0] : (q?.cards || q?.queue || [])[0]; if (c) out.card = { id: c.id, front: String(c.front || '').slice(0, 220), back: String(c.back || '').slice(0, 300) }; } catch {}
  try { out.focus = focus.state(); } catch {}
  if (cloud?.session && (s.deskWidgets?.items || []).includes('visitors')) { if (Date.now() - deskVis.at > 5 * 60e3) { try { const r = await social.visitors(7); deskVis = { at: Date.now(), v: { total: r?.total || 0, list: (r?.visitors || []).slice(0, 5).map(v => ({ name: v.hidden ? 'someone' : (v.name || v.username || ''), avatar: v.hidden ? '' : v.avatar_url || '', frame: v.frame || '', custom: v.custom || null, frameImg: v.frame_img || '' })) } }; } catch {} } out.visitors = deskVis.v; }
  if (s.spotify?.connected && s.spotify?.enabled !== false) try { out.music = (await spotify.call('spotify_now_playing')).text; } catch (e) { out.music = e.message; }
  // 4.2.0: without Spotify connected (or when it has nothing), the music widget shows what's playing in Apple Music / Spotify (Mac) or any media app (Windows)
  if ((!out.music || /nothing|not playing/i.test(out.music)) && (s.media || {}).nowPlaying !== false && (process.platform === 'darwin' || WIN)) try { const n = await mediaKit().nowPlaying(); if (n) { out.music = mediaKit().describe(n); out.media = n; } } catch {}
  if (s.weather?.enabled !== false && s.weather?.location) { if (Date.now() - deskWx.at > 20 * 60e3) { try { const r = await weatherApi.forecast({ location: s.weather.location, days: 1, units: s.weather.units }); deskWx = { at: Date.now(), v: r.card ? { place: r.card.place, temp: r.card.now.temp, unit: r.card.unit, text: r.card.now.text, hi: r.card.daily?.[0]?.hi, lo: r.card.daily?.[0]?.lo } : null }; } catch { deskWx.at = Date.now() - 15 * 60e3; } } out.weather = deskWx.v; }
  return out;
});
ipcMain.handle('deskw:action', async (_e, a = {}) => {
  try {
    if (a.type === 'goal') { goalsSave(goals.toggle(store.getSettings().weeklyGoals, a.id)); }
    else if (a.type === 'jot') { jotAdd(a.text); }   // 4.1.0
    else if (a.type === 'reminderDone') { store.setSettings({ chatReminders: (store.getSettings().chatReminders || []).filter(r => r.id !== a.id) }); broadcast('reminders:changed'); }
    else if (a.type === 'snooze') { store.setSettings({ chatReminders: (store.getSettings().chatReminders || []).map(r => r.id === a.id ? { ...r, at: Math.max(r.at, Date.now()) + 3600e3 } : r) }); broadcast('reminders:changed'); }
    else if (a.type === 'ask' && String(a.text || '').trim()) { showHud(); setTimeout(() => hud?.webContents.send('hud:ask', String(a.text).slice(0, 4000)), 250); }
    else if (a.type === 'focus') { const st = focus.state(); if (st?.on) focus.stop(false); else focus.start({ minutes: 25 }); }
    else if (a.type === 'grade') { study.review(a.id, Math.max(0, Math.min(3, +a.grade))); recordMetric('study_review'); studyChanged(); }
    else if (a.type === 'music') { const act = ['pause', 'resume', 'next', 'previous'].includes(a.action) ? a.action : 'resume';
      // 4.2.0: the buttons drive whatever the widget shows (Spotify through your account, else Apple Music / the system's media controls)
      if (a.source === 'media' || !(store.getSettings().spotify?.connected)) await mediaKit().control(act === 'resume' ? 'play' : act, a.app || ''); else await spotify.call('spotify_control', { action: act }); }
    deskRefresh(); return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
setInterval(deskRefresh, 60e3).unref?.();
// 3.12 Share to Nexus: things you shared from your phone (an iPhone Shortcut) wait in your inbox
let inboxSeen = null;
async function inboxList() {
  if (!cloud.session) return { ok: false, error: 'Sign in to your Nexus account first (Settings → Profile).' };
  try { await cloud.ensureFresh(); const list = await cloud.rest('share_inbox?select=id,kind,text,url,image,created_at&handled_at=is.null&order=created_at.desc&limit=30', { auth: true }); return { ok: true, list }; }
  catch (e) { return { ok: false, error: /share_inbox/.test(e.message) ? 'Share to Nexus needs the 3.12 Supabase SQL.' : e.message }; }
}
ipcMain.handle('inbox:list', () => inboxList());
ipcMain.handle('inbox:done', async (_e, id) => { try { await cloud.write('PATCH', `share_inbox?id=eq.${+id}`, { handled_at: new Date().toISOString() }, 'return=minimal'); broadcast('inbox:changed'); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('inbox:ask', async (_e, id) => {
  const r = await inboxList(); const it = r.ok && r.list.find(x => x.id === +id); if (!it) return { ok: false, error: 'That share is gone.' };
  if (it.kind === 'image' && it.image) { const m = it.image.match(/^data:(image\/[a-z+]+);base64,(.+)$/); if (m) { const a = await attachments.fromImage(Buffer.from(m[2], 'base64'), { name: 'Shared picture' }); showHud(); broadcast('hud:attach', { attachments: [attachments.public(a)] }); } }
  else openQuickChatWithText([it.text, it.url && it.url !== it.text ? it.url : ''].filter(Boolean).join('\n'), { app: 'Your phone', label: 'Shared from your phone' });
  await cloud.write('PATCH', `share_inbox?id=eq.${+id}`, { handled_at: new Date().toISOString() }, 'return=minimal').catch(() => {}); broadcast('inbox:changed');
  return { ok: true };
});
setInterval(async () => {
  if (!cloud.session) return; const r = await inboxList(); if (!r.ok) return;
  const ids = new Set(r.list.map(x => x.id));
  if (inboxSeen) { const fresh = r.list.filter(x => !inboxSeen.has(x.id)); if (fresh.length) { notify('📥 Shared to Nexus', fresh.length === 1 ? (fresh[0].url || fresh[0].text || 'A picture').slice(0, 120) : `${fresh.length} new things from your phone`, () => broadcast('inbox:open')); broadcast('inbox:changed'); } }
  inboxSeen = ids;
}, 90e3).unref?.();
// 3.12 Test Run → the app: chats from try_chats (same Nexus account) become normal chats here
async function tryChatImport(ids) {
  if (!cloud.session) return { ok: false, error: 'Sign in to your Nexus account first (Settings → Profile).' };
  try {
    await cloud.ensureFresh();
    const q = ids?.length ? `&id=in.(${ids.filter(x => /^[0-9a-f-]{36}$/i.test(x)).join(',')})` : '';
    const rows = await cloud.rest(`try_chats?select=id,title,agent,messages,updated_at&order=updated_at.desc&limit=100${q}`, { auth: true });
    const done = store.getSettings().tryImported || {}; let count = 0, last = null;
    for (const r of rows) {
      if (done[r.id] && convos.get(done[r.id])) { last = done[r.id]; continue; }
      const c = convos.create({ activate: false, title: String(r.title || 'Chat from Test Run').slice(0, 120) });
      for (const m of (r.messages || []).slice(-200)) if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        convos.appendTo(c.id, { role: m.role, content: m.content, ...(m.role === 'assistant' ? { persona: allPersonas().some(p => p.id === (m.agent || r.agent)) ? (m.agent || r.agent) : 'flash', model: m.model || 'Test Run' } : {}), ...(m.error ? { error: true } : {}) });
      done[r.id] = c.id; count++; last = c.id;
    }
    // 4.2.0: your Test Run Spaces and memory come along. A Space with the same name here is used; new ones are made.
    let spaces = 0, mems = 0;
    try {
      const st = (await cloud.rest('try_state?select=spaces,chat_space,memory', { auth: true }))?.[0];
      if (st) {
        const d = convos.load(), map = {};
        for (const sp of (Array.isArray(st.spaces) ? st.spaces : []).slice(0, 12)) {
          const name = String(sp?.name || '').trim().slice(0, 32); if (!name) continue;
          const have = d.spaces.find(x => x.name.toLowerCase() === name.toLowerCase());
          map[sp.id] = (have || (spaces++, convos.addSpace({ name, color: /^#[0-9a-f]{6}$/i.test(sp.color || '') ? sp.color : undefined }))).id;
        }
        for (const [tryId, spId] of Object.entries(st.chat_space || {})) if (done[tryId] && map[spId] && convos.get(done[tryId]) && !convos.get(done[tryId]).spaceId) convos.moveToSpace(done[tryId], map[spId]);
        for (const m of (Array.isArray(st.memory) ? st.memory : []).slice(0, 60)) if (m?.text && memory.add(String(m.text), 'test run')) mems++;
      }
    } catch (e) { log('try state import', e.message); }
    store.setSettings({ tryImported: done }); broadcastConvos();
    return { ok: true, count, last, spaces, memory: mems };
  } catch (e) { return { ok: false, error: /try_chats/.test(e.message) ? 'Test Run chats aren’t set up on the server.' : e.message }; }
}
ipcMain.handle('trychats:list', async () => {
  if (!cloud.session) return { ok: false, error: 'Sign in first.' };
  try { await cloud.ensureFresh(); const done = store.getSettings().tryImported || {}; const rows = await cloud.rest('try_chats?select=id,title,updated_at&order=updated_at.desc&limit=100', { auth: true }); return { ok: true, list: rows.map(r => ({ ...r, imported: !!(done[r.id] && convos.get(done[r.id])) })) }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('trychats:import', async (_e, ids) => { const r = await tryChatImport(Array.isArray(ids) ? ids : null); if (r.ok && ids?.length === 1 && r.last) openConv(r.last); return r; });
// nexus28://share?text=…&url=…  (from an Apple Shortcut in the share sheet)  ·  nexus28://ask?q=…  ·  3.12: nexus28://trychat?id=…
function handleNexusUrl(raw) {
  let u; try { u = new URL(raw); } catch { return; }
  if (u.protocol !== 'nexus28:') return;
  const kind = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase();
  const text = [u.searchParams.get('text'), u.searchParams.get('url')].filter(Boolean).join('\n').slice(0, 20000);
  if (kind === 'share' && text) openQuickChatWithText(text, { app: 'Share sheet' });
  else if (kind === 'trychat' && u.searchParams.get('id')) tryChatImport([u.searchParams.get('id')]).then(r => { if (r.ok && r.last) { const ag = String(u.searchParams.get('agent') || ''); if (ag && allPersonas().some(p => p.id === ag && !p.apex)) applySettings({ activePersona: ag }); openConv(r.last); } else { showHud(); notify('Couldn’t bring that chat over', r.error || 'Sign in with the same account as Test Run.'); } });
  else if (kind === 'ask') { if (!quickChat) createQuickChat(); quickChat.show(); quickChat.focus(); quickChat.webContents.send('quickchat:shown'); if (u.searchParams.get('q')) quickChat.webContents.send('quickchat:prefill', u.searchParams.get('q').slice(0, 4000)); }
  else showHud();
}
let pendingUrl = null;
app.on('open-url', (e, url) => { e.preventDefault(); if (app.isReady() && attachments) handleNexusUrl(url); else pendingUrl = url; });

// Group challenges in Shared Spaces (counts sent once a minute, not per card)
const challengeQueue = { cards: 0, focus: 0, day: '' };
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;   // your day, not UTC's
async function flushChallenges() {
  if (!challengeQueue.cards && !challengeQueue.focus) return;
  if (!cloud?.session) { challengeQueue.cards = 0; challengeQueue.focus = 0; return; }     // signed out: nothing to count toward
  const q = { ...challengeQueue }; challengeQueue.cards = 0; challengeQueue.focus = 0;
  try {
    if (q.cards) { await cloud.rpc('challenge_report', { p_kind: 'cards', p_amount: q.cards }); await cloud.rpc('challenge_report', { p_kind: 'days', p_amount: 1, p_day: q.day || localDay() }); }
    if (q.focus) await cloud.rpc('challenge_report', { p_kind: 'focus', p_amount: q.focus });
  } catch (e) { if (!/challenge_report|404|PGRST20/.test(e.message)) { challengeQueue.cards = Math.min(500, challengeQueue.cards + q.cards); challengeQueue.focus = Math.min(240, challengeQueue.focus + q.focus); } }
}
ipcMain.handle('challenges:list', async (_e, spaceId) => { try { const r = await cloud.rpc('space_challenges_for', { p_space: String(spaceId) }); return r?.success ? { ok: true, challenges: r.challenges } : { ok: false, error: r?.error || 'failed' }; } catch (e) { return { ok: false, error: /space_challenges_for|404|PGRST20/.test(e.message) ? 'Group challenges need the v2.7 Nexus database.' : e.message }; } });
ipcMain.handle('challenges:create', async (_e, { spaceId, kind, goal, title, days = 7 }) => {
  try {
    if (!['cards', 'days', 'focus'].includes(kind)) throw new Error('Pick a challenge.');
    const g = Math.max(1, Math.min(100000, Math.round(+goal || 0))); if (!g) throw new Error('Set a goal.');
    const ends = new Date(Date.now() + Math.max(1, Math.min(31, +days || 7)) * 864e5).toISOString();
    await cloud.write('POST', 'space_challenges', { space_id: String(spaceId), kind, goal: g, title: String(title || '').slice(0, 80), ends_at: ends }, 'return=minimal');
    return { ok: true };
  } catch (e) { return { ok: false, error: /row-level|42501/.test(e.message) ? 'A space can run up to 3 challenges at a time.' : e.message.replace(/^Nexus cloud \d+: /, '') }; }
});
ipcMain.handle('challenges:remove', async (_e, id) => { try { await cloud.write('DELETE', `space_challenges?id=eq.${encodeURIComponent(String(id))}`, undefined, 'return=minimal'); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });

// Changelog email (opt in; Apoji Admin sends each release with EmailJS)
ipcMain.handle('changelog:state', async () => { if (!cloud.session) return { signedIn: false }; try { const r = await cloud.authedGet('changelog_subscribers?select=user_id'); return { signedIn: true, on: r.length > 0 }; } catch { return { signedIn: true, on: false, missing: true }; } });
ipcMain.handle('changelog:set', async (_e, on) => { try { const r = await cloud.rpc('changelog_subscribe', { p_on: !!on }); return { ok: !!r?.success, on: !!on }; } catch (e) { return { ok: false, error: /changelog_subscribe|404|PGRST20/.test(e.message) ? 'Needs the v2.7 Nexus database.' : e.message }; } });

// ---------- v2.6 Axiom: Operations, Sentinel, Rollback
async function axiomTool(name, a) {
  if (!apexOn()) throw new Error("Axiom isn't available to this account.");
  if (name === 'start_operation') { const op = ops.addOperation({ title: a.title, goal: a.goal, every: a.every_minutes, maxRuns: a.max_runs, days: a.days }); return { content: `Operation "${op.title}" started: a step every ${op.every} minutes, up to ${op.maxRuns} steps, until ${new Date(op.endsAt).toDateString()}. It shows in Settings → Axiom → Operations.`, activity: { summary: 'Operation started' } }; }
  if (name === 'set_sentinel') { const sn = ops.addSentinel({ title: a.title, source: a.source, url: a.url, condition: a.condition, every: a.every_minutes, actions: { notify: true, phone: true, draft: !!a.draft, threat: !!a.track_threat } }); return { content: `Sentinel "${sn.title}" is watching ${sn.source === 'url' ? sn.url : sn.source} every ${sn.every} minutes (it only thinks when something changes).`, activity: { summary: 'Sentinel set' } }; }
  const minutes = Math.max(1, Math.min(7 * 1440, +a.minutes || 60));
  const r = await rollback.undoSince(Date.now() - minutes * 60e3); broadcast('rollback:changed');
  return { content: `Undid ${r.done.length} change${r.done.length === 1 ? '' : 's'}${r.done.length ? ': ' + r.done.map(x => `${x.label} (${x.detail})`).join('; ') : ''}.${r.failed.length ? ` Couldn't undo: ${r.failed.map(x => `${x.label} (${x.error})`).join('; ')}.` : ''}${r.skipped.length ? ` Can't be undone: ${r.skipped.map(x => x.label).join(', ')}.` : ''}`, activity: { summary: `${r.done.length} undone` } };
}
function setupAxiomOps() {
  const osa = script => new Promise((res, rej) => require('child_process').execFile('osascript', ['-e', script], { timeout: 8000 }, (e, out) => e ? rej(e) : res(String(out).trim())));
  // 3.5 Windows: undo for dark mode (the registry); volume can't be read back there, so it isn't undoable
  const DARK_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
  const winRb = WIN ? {
    getVolume: null, setVolume: null,
    getDark: async () => /0x0\b/.test(await runCmd('reg', ['query', DARK_KEY, '/v', 'AppsUseLightTheme'])),
    setDark: async on => { for (const v of ['AppsUseLightTheme', 'SystemUsesLightTheme']) await runCmd('reg', ['add', DARK_KEY, '/v', v, '/t', 'REG_DWORD', '/d', on ? '0' : '1', '/f']); }
  } : {};
  rollback = new Rollback({ file: path.join(store.dir(), 'rollback.json'), helper, clipboard,
    getVolume: async () => { const o = await osa('get volume settings'); return { level: +(o.match(/output volume:(\d+)/) || [])[1] || 50, muted: /output muted:true/.test(o) }; },
    setVolume: async (level, muted) => { await osa(`set volume output volume ${Math.max(0, Math.min(100, level | 0))}`); await osa(`set volume output muted ${!!muted}`); },
    getDark: async () => (await osa('tell application "System Events" to tell appearance preferences to get dark mode')) === 'true',
    setDark: async on => { await osa(`tell application "System Events" to tell appearance preferences to set dark mode to ${!!on}`); }, ...winRb });
  ops = new Operations({ file: path.join(store.dir(), 'operations.json'),
    think: (prompt, { tools: useTools }) => runChat({ personaId: 'axiom', messages: [{ role: 'user', content: prompt }], apexKind: 'operation', noTools: !useTools, noHandoff: true, maxSteps: 6, confirm: async () => false }),
    allowed: async () => { await apex?.session(true); if (!apexOn()) return { ok: false, reason: "Axiom isn't available right now." }; const m = apex.meter(); if (m && !m.unlimited && (m.left ?? 0) < 10) return { ok: false, reason: 'Paused: fewer than 10 Axiom minutes left this week.' }; return { ok: true }; },
    gather: async sn => {
      const s = store.getSettings();
      if (sn.source === 'url') { const r = await tools.execute('fetch_url', { url: sn.url }, { settings: s, getKey: store.getKey, helper, mcp, mac }); return { text: r.content }; }
      if (sn.source === 'calendar') { if (!helper?.available() || !helperCaps.eventkit) return { error: 'Turn on Apple Calendar (Settings → Connectors).' }; const now = Date.now() / 1000; const ev = await helper.request({ cmd: 'cal_list', id: 'sn-' + Date.now(), start: now, end: now + 2 * 86400 }, ['result'], 8000); return { text: (ev.data || []).map(e => `${e.title} — ${new Date(e.start * 1000).toLocaleString()}${e.location ? ' @ ' + e.location : ''}`).join('\n') || 'No events in the next 2 days.' }; }
      if (sn.source === 'study') { const st = study.stats(); return { text: `Due now: ${st.due}. Reviewed today: ${st.reviewedToday}. Streak: ${st.streak} days.\n` + study.decks().map(d => `${d.name}: ${d.due} due, ${d.mastered}/${d.total} mastered${d.testDate ? ', test ' + d.testDate : ''}`).join('\n') }; }
      if (sn.source === 'threats') return { text: axiomData.threats().map(t => `${t.level}: ${t.title} (${t.note || ''})`).join('\n') || 'Nothing tracked.' };
      return { error: 'Unknown source.' };
    },
    notify: (title, body, meta = {}) => { if (meta.mac !== false) notify(title, body, () => showHud('axiom')); if (meta.phone && store.getSettings().phone?.enabled && cloud.session) push?.send('missions', { title, body, tag: meta.kind + '-' + meta.id, url: './#mac' }).catch(() => {}); },
    track: t => { axiomData.track(t, 'sentinel'); broadcastAxiom(); },
    draft: async (title, text) => { const sp = routinesSpace(); const map = store.getSettings().sentinelConv; let conv = map && convos.get(map); if (!conv) { conv = convos.create({ activate: false, spaceId: sp.id, title: '⚑ Sentinel', kind: 'brief' }); store.setSettings({ sentinelConv: conv.id }); }
      convos.appendTo(conv.id, { role: 'assistant', persona: 'axiom', content: `**${title}**\n\n${text}`, via: 'brief' }); broadcastConvos(); },
    onChange: () => broadcast('ops:changed', { ...ops.state(), usage: ops.usage() }) });
  setInterval(() => { if (apexOn()) ops.tick().catch(e => log('ops', e.message)); }, 60e3);
}
const opsOnly = fn => (...a) => { if (!apexOn()) return { ok: false, error: "Axiom isn't available to your account." }; try { return fn(...a); } catch (e) { return { ok: false, error: e.message }; } };
ipcMain.handle('ops:state', () => ops ? { ...ops.state(), usage: ops.usage() } : { ops: [], sentinels: [] });
ipcMain.handle('ops:addOperation', opsOnly((_e, p) => ({ ok: true, op: ops.addOperation(p || {}) })));
ipcMain.handle('ops:addSentinel', opsOnly((_e, p) => ({ ok: true, sentinel: ops.addSentinel(p || {}) })));
ipcMain.handle('ops:set', opsOnly((_e, { id, patch }) => ({ ok: !!ops.set(String(id), patch || {}) })));
ipcMain.handle('ops:remove', opsOnly((_e, id) => ({ ok: ops.remove(String(id)) })));
ipcMain.handle('ops:runNow', opsOnly(async (_e, id) => ({ ok: true, result: await ops.runNow(String(id)) })));
ipcMain.handle('rollback:list', () => rollback ? rollback.entries().slice(0, 100) : []);
ipcMain.handle('rollback:undo', async (_e, id) => { const r = await rollback.undoOne(String(id)); broadcast('rollback:changed'); return r; });
ipcMain.handle('rollback:undoSince', async (_e, minutes) => { const r = await rollback.undoSince(Date.now() - Math.max(1, Math.min(10080, +minutes || 60)) * 60e3); broadcast('rollback:changed'); return { ok: true, ...r }; });
// ---------- v2.5 Axiom: Briefing Room, Dossier, Threat Board
async function runAxiomBriefing({ why = 'manual' } = {}) {
  if (!apexOn()) return { ok: false, error: "Axiom isn't available to your account." };
  const s = store.getSettings(), b = axiomData.briefing();
  const facts = await brief.gather({ sections: routines.brief().sections, topics: routines.brief().topics, settings: s, deps: {
    weather: weatherApi, web, helper, helperCaps, mcp, cloud: cloud.state(), access: accessState(), getKey: store.getKey, study } });
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  let conv = b.convId && convos.get(b.convId);
  if (!conv) conv = convos.create({ activate: false, spaceId: routinesSpace().id, title: '▲ Briefing Room', kind: 'brief' });
  const prompt = axiomMod.briefingPrompt({ facts, dossier: axiomData.dossierPrompt(), threats: axiomData.threatPrompt(), nickname: nicknameOf(s), day });
  const res = await runChat({ personaId: 'axiom', messages: [{ role: 'user', content: prompt }], convId: conv.id, noTools: true, apexKind: 'other' });
  convos.appendTo(conv.id, { role: 'user', content: `Briefing Room · ${day}`, via: 'brief', local: true });
  convos.appendTo(conv.id, res.ok ? { role: 'assistant', persona: 'axiom', content: res.text || '(empty briefing)', model: res.model, via: 'brief', featureData: res.featureData }
    : { role: 'assistant', persona: 'axiom', content: res.error, error: true, via: 'brief' });
  axiomData.setBriefing({ convId: conv.id });
  broadcastConvos();
  let tracked = 0;
  if (res.ok) for (const t of axiomMod.threatList(res.text)) if (axiomData.track(t, 'briefing')) tracked++;
  broadcastAxiom();
  if (res.ok && why === 'schedule') notify('▲ Briefing Room', `Your strategic briefing is ready${tracked ? ` · ${tracked} threat${tracked === 1 ? '' : 's'} on the board` : ''}.`, () => openConv(conv.id));
  if (res.ok && why === 'schedule' && b.speak) voice.speakSystem(voice.speakable(res.text.replace(/```[\s\S]*?```/g, '')), { voice: s.voice.systemVoice });
  return { ok: res.ok, error: res.error, convId: conv.id, tracked };
}
const axiomState = () => axiomData ? { available: apexOn(), dossier: axiomData.dossier(), threats: axiomData.threats({ all: true }), summary: axiomData.summary(), briefing: axiomData.briefing(), meter: apex?.meter() || null } : { available: false };
function broadcastAxiom() { broadcast('axiom:changed', axiomState()); }
const axiomOnly = fn => (...a) => apexOn() ? fn(...a) : { ok: false, error: "Axiom isn't available to your account." };
ipcMain.handle('axiom:state', () => axiomState());
ipcMain.handle('axiom:addEntry', axiomOnly((_e, entry) => { const r = axiomData.addEntry(entry || {}, 'you'); broadcastAxiom(); return r ? { ok: true, entry: r } : { ok: false, error: 'Already in your Dossier (or empty).' }; }));
ipcMain.handle('axiom:editEntry', axiomOnly((_e, { id, patch }) => { const r = axiomData.editEntry(String(id), patch || {}); broadcastAxiom(); return { ok: !!r }; }));
ipcMain.handle('axiom:removeEntry', axiomOnly((_e, id) => { axiomData.removeEntry(String(id)); broadcastAxiom(); return { ok: true }; }));
ipcMain.handle('axiom:track', axiomOnly((_e, t) => { const r = axiomData.track(t || {}, t?.source || 'you'); broadcastAxiom(); return r ? { ok: true, threat: r } : { ok: false }; }));
ipcMain.handle('axiom:setThreat', axiomOnly((_e, { id, patch }) => { const r = axiomData.setThreat(String(id), patch || {}); broadcastAxiom(); return { ok: !!r }; }));
ipcMain.handle('axiom:removeThreat', axiomOnly((_e, id) => { axiomData.removeThreat(String(id)); broadcastAxiom(); return { ok: true }; }));
ipcMain.handle('axiom:setBriefing', axiomOnly((_e, p) => { const r = axiomData.setBriefing(p || {}); broadcastAxiom(); return { ok: true, briefing: r }; }));
ipcMain.handle('axiom:briefNow', axiomOnly(async () => { const r = await runAxiomBriefing({ why: 'manual' }); if (r.convId) openConv(r.convId); return r; }));
// Evening Wrap-up: Nexus gathers today's facts itself, then an agent writes it (no tools, any agent works).
async function runWrap({ why = 'manual', speak } = {}) {
  const w = routines.wrap();
  const s = store.getSettings();
  const facts = await brief.gatherWrap({ sections: w.sections, settings: s, deps: { convos, helper, helperCaps, metrics, study } });
  let conv = w.convId && convos.get(w.convId);
  if (!conv) conv = convos.create({ activate: false, spaceId: routinesSpace().id, title: '☾ Evening Wrap-up', kind: 'wrap' });
  const res = await runChat({ personaId: w.agent || 'flash', messages: [{ role: 'user', content: brief.wrapPrompt({ ...facts, nickname: nicknameOf(s) }) }], convId: conv.id, noTools: true });
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  convos.appendTo(conv.id, { role: 'user', content: `Evening Wrap-up · ${day}`, via: 'wrap', local: true });
  convos.appendTo(conv.id, res.ok ? { role: 'assistant', persona: w.agent || 'flash', content: res.text || '(empty wrap-up)', model: res.model, via: 'wrap', brief: true }
    : { role: 'assistant', persona: w.agent || 'flash', content: res.error, error: true, via: 'wrap' });
  w.convId = conv.id;
  broadcastConvos();
  if (res.ok) {
    recordMetric('wrap');
    if (why === 'schedule') notify('☾ Your Evening Wrap-up is ready', firstLine(res.text.replace(/^.*?\n/, '')) || 'Open Nexus to read it.', () => openConv(conv.id));
    if (speak ?? (why === 'schedule' && w.speak)) voice.speakSystem(voice.speakable(res.text), { voice: s.voice.systemVoice });
  }
  return { ok: res.ok, error: res.error, convId: conv.id, text: res.text };
}
const routinesState = () => routines.list();
ipcMain.handle('wrap:run', () => routines.runNow('wrap', 'manual').then(r => ({ ...r, text: convos.get(r.convId)?.messages.at(-1)?.content || '' })));
ipcMain.handle('triggers:status', async () => ({ wifi: triggers?.status.wifi || null, audio: triggers?.status.audio || null, mac: process.platform === 'darwin' || WIN }));
ipcMain.handle('routines:list', () => routinesState());
ipcMain.handle('routines:save', (_e, r) => {
  try {
    const isNew = !r.id;
    const saved = routines.upsert(r);
    if (isNew && saved.kind === 'routine') recordMetric('routine_created');
    return { ok: true, routine: saved, list: routinesState() };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('routines:remove', (_e, id) => { try { routines.remove(id); return { ok: true, list: routinesState() }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('routines:runNow', (_e, id) => routines.runNow(id, 'manual'));
ipcMain.handle('routines:parse', (_e, text) => {
  const r = schedule.parseRoutine(text);
  return r ? { ...r, when: schedule.describe(r.schedule), name: schedule.shortName(r.prompt) } : null;
});
ipcMain.handle('brief:run', (_e, opts) => routines.runNow('brief', 'manual').then(r => ({ ...r, text: convos.get(r.convId)?.messages.at(-1)?.content || '' })));
ipcMain.handle('clip:write', (_e, t) => { clipboard.writeText(String(t ?? '').slice(0, 2e6)); return true; });   // 3.13: copy that always works
ipcMain.handle('open:conv', (_e, id) => { openConv(id); return true; });

// ---------------- Missions
const missionsSpace = () => convos.ensureSpace('missions', { name: 'Missions', color: '#5ce1ff' });
ipcMain.handle('missions:state', () => missions.state());
ipcMain.handle('missions:start', (_e, args) => startMission(args));
// Mission chains (v2.1): "research → outline → draft". When a step finishes, the next one starts with the previous
// report handed over. missionChain = { steps: [goal, …], i, minutes, prevConv }
let missionChain = null, missionKey = '';
const chainLabel = () => missionChain ? `(Step ${missionChain.i + 1} of ${missionChain.steps.length}) ` : '';
function startMission({ goal, minutes, then = [] }) {
  const steps = [String(goal || ''), ...(Array.isArray(then) ? then : [])].map(x => String(x || '').trim()).filter(Boolean).slice(0, 5);
  if (steps.length > 1) { const r = startMissionStep({ goal: `(Step 1 of ${steps.length}) ${steps[0]}`, minutes }); if (r.ok) missionChain = { steps, i: 0, minutes, prevConv: r.state.convId }; return { ...r, chain: steps.length }; }
  missionChain = null;
  return startMissionStep({ goal, minutes });
}
function nextChainStep(done) {
  const ch = missionChain; if (!ch) return;
  if (done.status === 'error' || ch.i + 1 >= ch.steps.length) { missionChain = null; return; }
  ch.i++;
  const prev = convos.get(done.convId);
  const report = [...(prev?.messages || [])].reverse().find(m => m.role === 'assistant' && !m.error)?.content || '';
  missions.dismiss();
  const goal = `${chainLabel()}${ch.steps[ch.i]}\n\n--- The previous step ("${ch.steps[ch.i - 1].slice(0, 80)}") produced this report; build on it: ---\n${report.slice(0, 7000)}`;
  const r = startMissionStep({ goal, minutes: ch.minutes });
  if (!r.ok) { notify('Mission chain stopped', r.error); missionChain = null; return; }
  ch.prevConv = r.state.convId; broadcast('mission:state', r.state);
}
function startMissionStep({ goal, minutes }) {
  const s = store.getSettings();
  const p = allPersonas().find(x => x.id === 'paragon');
  const d = accessDecision(p, bindingFor(p, s), s);
  if (d.mode !== 'own') return { ok: false, error: d.mode === 'local' ? "Missions need Paragon's tools, and this local model can't use them. Give Paragon a cloud model with your own key (Settings → Agents)." : 'Missions run on Paragon, which needs your own API key (Settings → Providers).' };
  try { const st = missions.start({ goal, minutes }); broadcastConvos(); return { ok: true, state: st }; }
  catch (e) { return { ok: false, error: e.message }; }
}
ipcMain.handle('missions:templates', () => ({ builtin: missionTemplates.BUILTIN, mine: store.getSettings().missionTemplates || [] }));
ipcMain.handle('missions:saveTemplate', (_e, t) => {
  const list = store.getSettings().missionTemplates || [];
  const cleaned = missionTemplates.cleanTemplates([t]);
  if (!cleaned.length) return { ok: false, error: 'Write a goal of at least 10 characters. Use {blanks} for parts you fill in each time.' };
  const next = t.id ? list.map(x => x.id === t.id ? { ...cleaned[0], id: t.id } : x) : [...list, cleaned[0]];
  const settings = store.setSettings({ missionTemplates: missionTemplates.cleanTemplates(next) });
  broadcast('settings:changed', settings);
  return { ok: true, mine: settings.missionTemplates };
});
ipcMain.handle('missions:removeTemplate', (_e, id) => {
  const settings = store.setSettings({ missionTemplates: (store.getSettings().missionTemplates || []).filter(t => t.id !== id) });
  broadcast('settings:changed', settings);
  return { ok: true, mine: settings.missionTemplates };
});
// Mission sharing: a formatted report (cover, report, sources, how Paragon got there).
ipcMain.handle('missions:export', async (e, { convId, format = 'pdf' }) => {
  const conv = convos.get(convId);
  if (!conv || conv.kind !== 'mission') return { ok: false, error: 'That chat is not a mission.' };
  const r = missionReport.build(conv);
  const ext = { pdf: 'pdf', docx: 'docx', md: 'md' }[format];
  if (!ext) return { ok: false, error: 'Unknown format.' };
  const name = `${exporter.safeName('Mission report - ' + r.title)}.${ext}`;
  const win = BrowserWindow.fromWebContents(e.sender);
  const pick = process.env.NEXUS_TEST_EXPORT_DIR ? { filePath: path.join(process.env.NEXUS_TEST_EXPORT_DIR, name) }
    : await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), name) });
  if (pick.canceled || !pick.filePath) return { ok: false, canceled: true };
  try {
    let data;
    if (format === 'md') data = missionReport.toMarkdown(r);
    else if (format === 'docx') data = await missionReport.toDocx(r);
    else {
      const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
      try {
        await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(missionReport.toHTML(r, renderMarkdown)));
        data = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: 'Letter', margins: { marginType: 'none' } });
      } finally { pdfWin.destroy(); }
    }
    fsLog.writeFileSync(pick.filePath, data);
    recordMetric('export');
    return { ok: true, path: pick.filePath };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('missions:reportText', (_e, convId) => { const c = convos.get(convId); return c?.kind === 'mission' ? missionReport.toMarkdown(missionReport.build(c)) : ''; });
ipcMain.handle('missions:pause', () => missions.pause());
ipcMain.handle('missions:resume', () => missions.resume());
ipcMain.handle('missions:end', () => missions.end());
ipcMain.handle('missions:dismiss', () => { missions.dismiss(); return null; });

// ---------------- Profile (nickname), stats, login item
ipcMain.handle('profile:setNickname', async (_e, name) => {
  const nickname = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const settings = store.setSettings({ nickname });
  broadcast('settings:changed', settings);
  const synced = await cloud.changeNickname(nickname).catch(() => false);
  return { ok: true, nickname, synced, column: cloud.nicknameColumn !== false };
});
ipcMain.handle('metrics:summary', () => metrics.summary());
function applyLoginItem() {
  if (!['darwin', 'win32'].includes(process.platform) || !app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!store.getSettings().openAtLogin, openAsHidden: true, ...(WIN ? { args: ['--hidden'] } : {}) }); } catch (e) { log('login item', e); }
}

// ---------------- Windows
ipcMain.handle('hud:hide', () => { hud?.hide(); return true; });
ipcMain.handle('quick:hide', () => { hideQuick(); return true; });
ipcMain.handle('quick:active', (_e, on) => { setEsc(!!on); return true; });
ipcMain.handle('quick:openChat', (_e, convId) => { quickChat?.hide(); if (convId && convos.get(convId)) { convos.select(convId); broadcastConvos(); } showHud(); return true; });
ipcMain.handle('quickchat:resize', (_e, h) => {
  if (!quickChat) return false;
  const [x, y] = quickChat.getPosition(), height = Math.max(80, Math.min(640, Math.round(h)));
  if (quickChat.getBounds().height === height) return true;   // 3.12: nothing to do (and don't disturb a drag)
  quickChat.setBounds({ x, y, width: QC_WIDTH, height });
  return true;
});
// 3.12: Quick Chat is dragged by its header in script (the OS drag region kept getting reset while a chat was open)
ipcMain.on('quickchat:move', (_e, { dx, dy } = {}) => { if (!quickChat || !Number.isFinite(dx) || !Number.isFinite(dy)) return; const [x, y] = quickChat.getPosition(); quickChat.setPosition(Math.round(x + dx), Math.round(y + dy)); });
ipcMain.handle('quickchat:hide', () => { quickChat?.hide(); return true; });
// 3.11: one button that copies what's needed to fix voice / the highlight orb on someone else's computer
ipcMain.handle('diag:copy', () => {
  const os = require('os'), st = store.getSettings();
  let tail = [];
  try { tail = fsLog.readFileSync(logPath || path.join(app.getPath('logs'), 'main.log'), 'utf8').split(/\r?\n/).filter(l => /wake|speech|selwatch|orb|helper|listen|stt|mic|error/i.test(l)).slice(-40); } catch {}
  const text = [`Nexus '28 ${app.getVersion()} · ${process.platform} ${os.release()} ${process.arch} · Electron ${process.versions.electron}`,
    `Speech-to-text: ${st.voice?.stt || 'apple'} · Nexus speech available: ${speechOk} · signed in: ${!!cloud?.session}`,
    `Hey Nexus: ${JSON.stringify(wakeStatus())}`,
    `Highlight orb: ${JSON.stringify(orbStatus())}`,
    `Helper: ${JSON.stringify({ built: helperCaps.built, version: helperCaps.version, wake: helperCaps.wake, selwatch: helperCaps.selwatch, stt: helperCaps.stt })}`,
    '', 'Recent log:', ...tail].join('\n').replace(/sk-[A-Za-z0-9_-]{12,}/g, '[key]').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  clipboard.writeText(text);
  return { ok: true, lines: tail.length };
});
ipcMain.handle('open:external', (_e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); return true; });
// v2.10 Settings → Permissions: every macOS permission Nexus uses, in one place, with its status and a button
const PANE = k => 'x-apple.systempreferences:com.apple.preference.security?Privacy_' + k;
const PERMS = [
  { id: 'accessibility', name: 'Accessibility', why: 'Highlight orb, Explain this (⌥⇧E), reading the selected text', pane: PANE('Accessibility') },
  { id: 'microphone', name: 'Microphone', why: 'Voice chat, Quick Ask, "Hey Nexus", meeting notes', pane: PANE('Microphone'), ask: 'microphone' },
  { id: 'speech', name: 'Speech Recognition', why: 'On-device speech-to-text (Settings → Voice → Apple)', pane: PANE('SpeechRecognition') },
  { id: 'screen', name: 'Screen Recording', why: 'LOOK, Watch mode, the Homework helper, look_at_screen', pane: PANE('ScreenCapture') },
  { id: 'calendar', name: 'Calendars', why: 'Agents reading and adding events (Settings → Connectors)', pane: PANE('Calendars') },
  { id: 'reminders', name: 'Reminders', why: 'Agents reading and adding reminders, "Remind me"', pane: PANE('Reminders') },
  { id: 'automation', name: 'Automation', why: 'App actions: music, dark mode, volume, Notes, Mail and Messages (asked per app)', pane: PANE('Automation'), ask: 'automation' },
  { id: 'notifications', name: 'Notifications', why: 'Replies, routines, timers, reminders from your phone', pane: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension' }
];
// 3.5: what Windows can ask for (most of it needs no permission at all)
const PERMS_WIN = [
  { id: 'microphone', name: 'Microphone', why: 'Voice chat, Quick Ask, "Hey Nexus", meeting notes', pane: 'ms-settings:privacy-microphone' },
  { id: 'speech', name: 'Speech recognition', why: 'On-device speech-to-text (Settings → Voice → Windows). Install a speech language if Windows asks.', pane: 'ms-settings:speech' },
  { id: 'screen', name: 'Screen capture', why: 'LOOK, Watch mode, the Homework helper. Windows doesn\'t need a permission for this.', pane: 'ms-settings:privacy' },
  { id: 'calendar', name: 'Outlook calendar & tasks', why: 'Agents reading and adding events and reminders. Uses Outlook (classic) if it\'s installed.', pane: 'outlookcal:' },
  { id: 'notifications', name: 'Notifications', why: 'Replies, routines, timers, reminders from your phone', pane: 'ms-settings:notifications' }
];
async function permsState() {
  const mac = process.platform === 'darwin';
  if (WIN) {
    const media = k => { try { const v = systemPreferences.getMediaAccessStatus(k); return v === 'not-determined' ? 'unknown' : v; } catch { return 'unknown'; } };
    const st = { microphone: media('microphone'), speech: helperCaps.stt ? 'see-settings' : 'unknown', screen: 'granted', calendar: helperCaps.eventkit ? 'granted' : 'unknown', notifications: Notification.isSupported() ? 'see-settings' : 'denied' };
    return { mac: false, win: true, helper: !!helperCaps.built, helperError: helperCaps.error || '', list: PERMS_WIN.map(p => ({ ...p, status: st[p.id] || 'unknown' })) };
  }
  let h = {};
  if (mac && helperCaps.perms) try { h = (await helper.request({ cmd: 'perm_status', id: 'perm-' + Date.now() }, ['result'], 4000)).data || {}; } catch {}
  const speech = ['unknown', 'denied', 'restricted', 'granted'][h.speech] || 'unknown';
  const ek = v => ({ 0: 'unknown', 1: 'restricted', 2: 'denied', 3: 'granted', 4: 'partial' })[v] || 'unknown';
  const media = k => { try { const v = systemPreferences.getMediaAccessStatus(k); return v === 'not-determined' ? 'unknown' : v; } catch { return 'unknown'; } };
  const status = { accessibility: axTrusted(false) ? 'granted' : 'denied', microphone: media('microphone'), speech, screen: media('screen'), calendar: ek(h.calendar), reminders: ek(h.reminders), automation: 'per-app', notifications: Notification.isSupported() ? 'see-settings' : 'unknown' };
  return { mac, helper: !!helperCaps.perms, list: PERMS.map(p => ({ ...p, status: status[p.id] || 'unknown' })) };
}
ipcMain.handle('perms:state', () => permsState());
ipcMain.handle('perms:open', (_e, id) => { const p = (WIN ? PERMS_WIN : PERMS).find(x => x.id === id); if (p) shell.openExternal(p.pane); return true; });
ipcMain.handle('perms:ask', async (_e, id) => {
  if (WIN) {
    if (id === 'notifications') { notify("🔔 Nexus '28", 'Notifications work. You can change how they show in Windows Settings → System → Notifications.', () => showHud(), { force: true }); return permsState(); }
    const p = PERMS_WIN.find(x => x.id === id); if (p) shell.openExternal(p.pane); return permsState();
  }
  if (id === 'microphone') { try { await systemPreferences.askForMediaAccess('microphone'); } catch {} }
  else if (id === 'accessibility') axTrusted(true);
  else if (id === 'screen') { try { await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }); } catch {} }
  else if (id === 'automation') {
    // Touch each app once with a harmless read, so macOS asks now instead of in the middle of a task
    for (const app of ['System Events', 'Notes', 'Mail', 'Messages', 'Music']) await runCmd('osascript', ['-e', `tell application "${app}" to get name`], { timeout: 15000 }).catch(() => {});
  } else if ((id === 'calendar' || id === 'reminders') && helperCaps.eventkit) { try { await helper.request({ cmd: id === 'calendar' ? 'cal_list' : 'rem_list', id: 'pa-' + Date.now(), start: Date.now() / 1000, end: Date.now() / 1000 + 60 }, ['result'], 30000); } catch {} }
  else if (id === 'speech' && helperCaps.stt) { const sid = 'perm-stt-' + Date.now(); helper.send({ cmd: 'listen', id: sid }); setTimeout(() => helper.send({ cmd: 'cancel', id: sid }), 1500); }
  return permsState();
});
ipcMain.handle('open:spokenContent', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.universalaccess?SpokenContent'));

// ---------------- Nexus cloud
// v2.4: is Axiom available to this account right now, and how many minutes are left? (cached 2 min; forced every 5)
let apexSig = '';
async function refreshApex(force = false) {
  if (!apex) return;
  await apex.session(force);
  const sig = JSON.stringify([apex.visible(), apex.meter()]);
  if (sig === apexSig) return;
  apexSig = sig;
  broadcast('personas:changed', publicPersonas()); broadcastAccess(); companion?.mark('status'); broadcastAxiom();
  const s = store.getSettings();
  if (s.activePersona === 'axiom' && !apex.visible()) broadcast('settings:changed', store.setSettings({ activePersona: 'flash' }));
}
function broadcastCloud() { syncDirect(); refreshApex(); broadcast('cloud:changed', cloud.state()); broadcast('personas:changed', publicPersonas()); broadcast('flags:changed', flagState()); broadcastAccess(); }
ipcMain.handle('access:state', () => accessState());
ipcMain.handle('cloud:state', () => cloud.state());
ipcMain.handle('cloud:sync', async () => { await cloud.sync(); broadcastCloud(); return cloud.state(); });
function syncThemeToProfile() { if (cloud.session) cloud.saveTheme(phoneTheme(store.getSettings())).catch(() => {}); }
// v2.2 profile picture: the renderer sends a small square image (it crops + resizes it first)
ipcMain.handle('account:setAvatar', async (_e, { bytes, mime }) => {
  try {
    const buf = Buffer.from(bytes || []);
    if (!buf.length || buf.length > 1.5e6 || !/^image\/(png|jpeg|webp)$/.test(mime)) return { ok: false, error: 'Pick a PNG, JPEG or WebP image.' };
    const url = await cloud.uploadAvatar(buf, mime); broadcastCloud(); companion?.mark('status'); return { ok: true, url };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('account:removeAvatar', async () => { try { await cloud.removeAvatar(); broadcastCloud(); companion?.mark('status'); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('cloud:signIn', async (_e, { email, password }) => {
  try { await cloud.signIn(email, password); broadcastCloud(); setTimeout(() => { syncThemeToProfile(); cloud.logActivity('desktop', app.getVersion()); cirktsSync(true).catch(() => {}); }, 2000); return { ok: true, state: cloud.state() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('cloud:signOut', async () => { await cloud.signOut(); broadcastCloud(); return cloud.state(); });
// Account editing: each returns { ok, state } or { ok: false, error }
const accountOp = fn => async (_e, arg) => {
  try { const extra = await fn(arg || {}); broadcastCloud(); return { ok: true, state: cloud.state(), ...(extra && typeof extra === 'object' && !Array.isArray(extra) && 'confirmed' in extra ? { confirmed: extra.confirmed } : {}), ...(extra && extra.pending !== undefined ? { pending: extra.pending } : {}) }; }
  catch (e) { return { ok: false, error: e.message }; }
};
ipcMain.handle('cloud:signUp', accountOp(({ email, password, username }) => cloud.signUp(email, password, username)));
ipcMain.handle('cloud:resetPassword', accountOp(({ email }) => cloud.resetPassword(email)));
ipcMain.handle('cloud:changeEmail', accountOp(({ email }) => cloud.changeEmail(email)));
ipcMain.handle('cloud:changePassword', accountOp(({ password }) => cloud.changePassword(password)));
ipcMain.handle('cloud:changeUsername', accountOp(({ username }) => cloud.changeUsername(username)));
ipcMain.handle('cloud:refreshAccount', accountOp(() => cloud.loadProfile()));
// 4.0: the ↻ next to STANDBY: fetch everything from the Nexus cloud again (account, plan, flags, maintenance, agents,
// broadcasts, the Paragon key, Axiom), instead of waiting for the next minute's check
ipcMain.handle('cloud:refreshAll', async () => {
  const t0 = Date.now(), done = [], failed = [];
  const step = async (name, fn) => { try { await fn(); done.push(name); } catch (e) { failed.push(name); log('refresh', name, e.message); } };
  if (!cloud) return { ok: false, error: 'Offline' };
  await step('account', () => cloud.session ? cloud.loadProfile() : null);
  await step('sync', () => cloud.sync());
  await step('live', () => cloud.syncLive(app.getVersion()));
  await step('premium', () => cloud.session ? cloud.refreshPremium() : null);
  await step('axiom', () => refreshApex(true));
  try { deliverBroadcasts(); } catch {}
  broadcastCloud(); companion?.mark('status');
  return { ok: !failed.length || done.length > failed.length, online: !!cloud.online?.() || done.includes('live'), ms: Date.now() - t0, failed };
});
ipcMain.handle('cloud:redeem', async (_e, { orderId }) => {
  try { const r = await cloud.redeem(orderId); broadcastCloud(); recordMetric('redeem'); return { ok: true, result: r, state: cloud.state() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
// v3.1: un-redeem an order, and ask the Apoji Team for access (Settings → Profile)
ipcMain.handle('cloud:unredeem', async (_e, { orderId }) => {
  try { await cloud.unredeem(orderId); broadcastCloud(); return { ok: true, state: cloud.state() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('access:request', async (_e, req = {}) => {
  try { await cloud.requestAccess(req || {}); broadcastCloud(); return { ok: true, state: cloud.state() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('access:cancel', async (_e, id) => {
  try { await cloud.cancelRequest(id); broadcastCloud(); return { ok: true, state: cloud.state() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
// v3.2: keep this Mac awake (for the phone link) + lid-closed mode, for everyone (src/awake.js)
let awake = null, dimmer = null, brightness = null;
// v3.3: works on battery by default (down to 20%); the screen dims when you're away even with "keep the screen on"
const awakeCfg = () => { const a = store.getSettings().awake || {}; return { keepAwake: false, keepDisplay: false, lidMode: false, dim: true, dimAfter: 120, ...a, pluggedOnly: a.v33 ? !!a.pluggedOnly : false }; };
const setAwake = patch => store.setSettings({ awake: { ...awakeCfg(), ...patch, v33: true } });
ipcMain.handle('awake:state', async () => ({ cfg: awakeCfg(), state: awake ? await awake.status() : {}, brightness: brightness?.status() || null }));   // 3.8: looking no longer re-applies
ipcMain.handle('awake:reset', async () => { try { return { ok: true, state: await awake.reset() }; } catch (e) { return { ok: false, error: e.message }; } });
// v3.4: try the dimmer now, and check the real-brightness support again
ipcMain.handle('awake:testDim', () => dimmer ? { ok: true, ...dimmer.test(4000) } : { ok: false, error: 'The dimmer is not running.' });
ipcMain.handle('awake:checkBrightness', async () => ({ ok: true, brightness: brightness ? await brightness.check() : null }));
ipcMain.handle('awake:set', async (_e, patch = {}) => {
  const clean = {}; for (const k of ['keepAwake', 'pluggedOnly', 'keepDisplay', 'dim']) if (k in patch) clean[k] = !!patch[k];
  if ('dimAfter' in patch) clean.dimAfter = Math.min(1800, Math.max(30, +patch.dimAfter || 120));
  if ('dimLevel' in patch) clean.dimLevel = Math.min(1, Math.max(0, +patch.dimLevel || 0));
  // 3.8: keep awake for a while (minutes from now; 0 = until I turn it off), and the battery floor (0 = never stop)
  if ('forMinutes' in patch) clean.until = +patch.forMinutes > 0 ? Date.now() + Math.min(24 * 60, +patch.forMinutes) * 60e3 : null;
  if ('batteryFloor' in patch) clean.batteryFloor = Math.max(0, Math.min(50, +patch.batteryFloor || 0));
  if (patch.keepAwake === false) clean.until = null;
  setAwake(clean); return { ok: true, state: await awake?.apply() };
});
ipcMain.handle('awake:lid', async (_e, on) => {
  try {
    if (on && !awake.ruleReady()) await awake.grant();       // one macOS password prompt
    setAwake({ lidMode: !!on }); return { ok: true, state: await awake.apply() };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('awake:revoke', async () => { try { setAwake({ lidMode: false }); await awake.revoke(); return { ok: true, state: await awake.apply() }; } catch (e) { return { ok: false, error: e.message }; } });
ipcMain.handle('cloud:dismiss', (_e, id) => {
  const s = store.getSettings();
  const settings = store.setSettings({ dismissedAnnouncements: [...new Set([...(s.dismissedAnnouncements || []), id])].slice(-50) });
  broadcast('settings:changed', settings);
  return true;
});

// ---------------- Lifecycle
app.whenReady().then(() => {
  try { awake = require('./src/awake').createAwake({ app: 'nexus', getCfg: awakeCfg, power: require('electron').powerMonitor, blocker: require('electron').powerSaveBlocker, onChange: st => broadcast('awake:changed', st), onExpire: () => { if (awakeCfg().keepAwake) { setAwake({ keepAwake: false, until: null }); notify?.("Nexus '28", 'Keep awake ended: the time you picked is up.'); } } }); awake.apply(); } catch (e) { log('awake', e.message); }
  // v3.4: real display brightness where the screen allows it (checked once on start), the dark layer elsewhere
  try { const B = require('./src/brightness'); brightness = B.createBrightness({ bin: B.helperPath({ app, dir: __dirname }), stateFile: path.join(app.getPath('userData'), 'brightness-saved.json'), winInternal: () => require('electron').screen.getAllDisplays().filter(d => d.internal).map(d => d.id), log }); brightness.check().catch(() => {}); } catch (e) { log('brightness', e.message); }
  try { const { BrowserWindow: BW, screen: scr, powerMonitor: pm } = require('electron'); dimmer = require('./src/dimmer').createDimmer({ BrowserWindow: BW, screen: scr, powerMonitor: pm, getCfg: awakeCfg, isAwake: () => !!awake?.state().on, brightness }); } catch (e) { log('dimmer', e.message); }
  // v3.1: Apoji Delegraphics branding in Nexus '28 → About
  try { app.setAboutPanelOptions({ applicationName: "Nexus '28", applicationVersion: app.getVersion(), copyright: `© ${new Date().getFullYear()} Apoji Delegraphics. All rights reserved.`, credits: "Nexus '28, N28C and Apoji Admin are made by Apoji Delegraphics.", website: 'https://apojidelegraphics.github.io/Nexus-28/' }); } catch {}
  if (process.platform === 'darwin') app.dock.hide();
  adoptLoginPath();
  convos = new Conversations(store.dir());
  convos.onFirstAnswer = c => autoSortConv(c);   // v2.7 auto-sorted Spaces
  // People updating from an earlier version skip the first-run tour (they get a "what's new" banner instead).
  if (!store.getSettings().onboarded && convos.summary().list.length) store.setSettings({ onboarded: true });
  features.setCustom(store.getSettings().customFeatures);
  attachments = new Attachments({ dir: store.dir(), nativeImage, helper, watchVideo });
  group = createGroup({ ask: groupAsk, convos, nameOf: groupNames, onProgress: ev => broadcast('group:progress', ev), onAppend: () => broadcastConvos() });
  screenAware = createScreen({ desktopCapturer, systemPreferences, shell, helper, attachments });
  metrics = new Metrics({ dir: store.dir() });
  // 3.9: points, achievements and the challenge across your Mac and PC (src/statsync.js)
  cirkts = require('./src/cirkts').createCirkts({ getSettings: () => store.getSettings(), setSettings: p => store.setSettings(p), earned: () => metrics.summary().points || 0, cloud: () => cloud, catalog: cosmetics.CATALOG, all: () => allSkins(), isOwner: () => !!cloud?.account?.()?.owner, log });
  social = require('./src/social').createSocial({ cloud: () => cloud });
  setTimeout(() => cirktsSync(true), 20e3); setInterval(() => cirktsSync(false), 5 * 60e3).unref?.();
  statSync = require('./src/statsync').createStatSync({ cloud: { get session() { return cloud?.session; }, write: (...a) => cloud.write(...a), authedGet: (...a) => cloud.authedGet(...a) }, metrics, device: () => thisDevice().id, onChange: () => { broadcast('metrics:changed', metrics.summary()); companion?.mark('status'); }, log });
  study = new Study({ dir: store.dir() });
  memory = new Memory({ file: path.join(store.dir(), 'memory.json') });
  // v2.7 group challenges: every review (Mac or phone) counts toward your Shared Spaces' challenges, sent in batches
  { const orig = study.review.bind(study); study.review = (...a) => { const r = orig(...a); if (r && r.ok !== false) { challengeQueue.cards++; challengeQueue.day = localDay(); } return r; }; }
  docs = new writer.Docs(store.dir());
  citeStore = new citations.CitationStore({ dir: store.dir() });
  routines = new Routines({ dir: store.dir(), run: async (r, why) => {
    const res = await runRoutine(r, why);
    const last = res?.convId && convos.get(res.convId)?.messages.at(-1);
    push?.send('routines', { title: `${r.kind === 'brief' ? '☀' : r.kind === 'wrap' ? '☾' : '⟳'} ${r.name}`, body: res?.ok === false ? res.error : last?.content || 'Done.', tag: 'routine-' + r.id, url: res?.convId ? './#chat=' + res.convId : './' }).catch(() => {});
    return res;
  }, isLocked: () => screenLocked, onChange: list => broadcast('routines:changed', list) });
  missions = new Missions({
    convos, space: missionsSpace,
    step: async ({ convId, extra, signal, onEvent, noTools }) => {
      const r = await runChat({ personaId: 'paragon', messages: toApi(convos.get(convId).messages, 'paragon'), convId, signal, systemExtra: extra, noTools, maxSteps: 10, confirm: bgConfirm('Mission'), onEvent });
      setTimeout(broadcastConvos, 0);
      return r;
    },
    onState: st => {
      broadcast('mission:state', st);
      missionStepLog(st);   // 4.3.0 live mission view in N28C
      const key = st ? `${st.status}|${st.round}|${st.activity}` : 'none';
      if (key !== missionKey) { missionKey = key; companion?.mark('status');
        if (st && st.status === 'running' && st.round > 0) push?.send('missions', { title: `⚑ ${missionChain ? chainLabel() : ''}${st.title}`, body: `Round ${st.round} · ${st.activity || 'working'} · ${Math.max(0, Math.round((st.budget - st.elapsed) / 60000))} min left`, tag: 'mission-live', silent: true, url: './#chat=' + st.convId }).catch(() => {}); }
    },
    onDone: st => {
      broadcastConvos();
      if (st.status !== 'error') recordMetric('mission');
      notify(st.error ? 'Mission stopped' : '⚑ Mission complete', `${st.title} — ${st.error || 'your report is ready.'}`, () => openConv(st.convId));
      companion?.mark('status', 'chats');
      push?.send('missions', { title: st.error ? 'Mission stopped' : missionChain && missionChain.i + 1 < missionChain.steps.length ? `⚑ Step ${missionChain.i + 1} done, starting the next` : '⚑ Mission complete', body: `${st.title} — ${st.error || 'your report is ready.'}`, tag: 'mission', url: './#chat=' + st.convId }).catch(() => {});
      setTimeout(() => nextChainStep(st), 1500);
    }
  });
  mac = createMac({ openExternal: u => shell.openExternal(u), openPath: p => shell.openPath(p), clipboard, notify: (t, b) => notify(t, b),
    speak: text => voice.speakSystem(text, { voice: store.getSettings().voice.systemVoice }),
    platform: process.env.NEXUS_FAKE_MAC === '1' ? 'darwin' : process.platform });
  clipHist = createClipHistory({ clipboard, enabled: () => store.getSettings().clipboard.history !== false, onChange: list => { broadcast('clip:changed', list.slice(0, 50)); } });
  setInterval(() => { flushChallenges(); const s = store.getSettings(); if (s.recap?.enabled !== false && recapMod.due(s.recap?.lastKey)) runRecap('schedule'); }, 60e3);
  try { app.setAsDefaultProtocolClient('nexus28'); } catch {}
  if (pendingUrl) setTimeout(() => { handleNexusUrl(pendingUrl); pendingUrl = null; }, 1500);
  clipHist.start();
  watcher = new watchMode.Watcher({
    capture: watchCapture, judge: watchJudge,
    onState: list => broadcast('watch:state', list),
    onHit: (w, why) => { recordMetric('watch'); notify(`👁 ${w.title || w.app || 'Watch'}`, why, () => showHud()); broadcast('watch:hit', { ...w, why }); }
  });
  watcher.onEnd = (w, why) => { if (w.status !== 'stopped') notify(`Stopped watching ${w.title || w.app || 'the window'}`, why); };
  const cloudFile = path.join(store.dir(), 'cloud.json');
  cloud = new NexusCloud({
    url: process.env.NEXUS_CLOUD_URL || undefined, key: process.env.NEXUS_CLOUD_KEY || undefined,
    loadCache: () => { try { return JSON.parse(require('fs').readFileSync(cloudFile, 'utf8')); } catch { return null; } },
    saveCache: d => { try { require('fs').writeFileSync(cloudFile, JSON.stringify(d)); } catch {} },
    loadRefresh: () => store.getKey('nexus:refresh'),
    saveRefresh: t => { try { store.setKey('nexus:refresh', t); } catch {} }
  });
  apex = new Apex({ cloud });
  axiomData = new axiomMod.AxiomData({ file: path.join(store.dir(), 'axiom.json') });
  setupAxiomOps();
  // 3.13: copy buttons need clipboard-sanitized-write (it was being refused, so Copy did nothing)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'clipboard-sanitized-write'].includes(permission) && wc.getURL().startsWith('file://')));
  session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'clipboard-sanitized-write' ? !!wc?.getURL?.().startsWith('file://') : permission === 'media' ? true : undefined);
  createTray();
  createHud();
  createQuick();
  createQuickChat();
  // 3.5 Windows: opening Nexus from the Start menu shows the chat (it lives in the tray after that). Not when Windows
  // starts it at sign-in (--hidden), and a nexus28:// link it was opened with is handled.
  if (WIN && !process.argv.includes('--hidden') && !process.env.NEXUS_TEST_ALLOW_PRIVATE) hud.once('ready-to-show', () => showHud());
  if (WIN) { const u = process.argv.find(a => /^nexus28:\/\//i.test(a)); if (u) setTimeout(() => handleNexusUrl(u), 1500); }
  const s = store.getSettings();
  registerHotkey('toggle', s.hotkeyToggle);
  registerHotkey('quick', s.hotkeyQuick);
  registerHotkey('quickChat', s.hotkeyQuickChat);
  registerHotkey('screen', s.hotkeyScreen);
  registerHotkey('explain', s.hotkeyExplain);
  registerHotkey('jot', s.hotkeyJot || 'Alt+Shift+J');   // 4.3.0 jot from anywhere
  showHud();
  setTimeout(connectEnabled, 1500);
  routines.start();
  triggers = new TriggerWatcher({ list: () => routines.load(), fire: (r, why) => { log('trigger', r.name, why); routines.runNow(r.id, 'trigger:' + why); } });
  triggers.start();
  const phoneOn = () => !!store.getSettings().phone?.enabled && !!cloud.session;
  push = new Push({ cloud, webpush: () => require('web-push'), getSettings: () => store.getSettings(), setSettings: patch => store.setSettings(patch),
    getSecret: () => store.getSecretJSON('vapid'), setSecret: v => store.setSecretJSON('vapid', v) });
  push.isMuted = () => focus.muting();
  companion = new Companion({ cloud, settings: () => store.getSettings(), push, convos,
    actions: {
      device: () => thisDevice(),
      clipGet: clipForPhone, clipSet: async t => { await within(clipboard.writeText(t)); notify('📋 Copied from your phone', t.slice(0, 120)); },
      inbox: phoneInbox, busy: () => [...busyConvs.keys()], lastUsed: () => lastUsed, current: currentModel, regenerate: regenerateConv, answer: answerConv, isBusy: id => busyConvs.has(id), convosChanged: () => broadcastConvos(), missionStart: startMission, missionEnd: () => missions.end(), missionState: () => missions.state(),
      templates: () => [...missionTemplates.BUILTIN, ...(store.getSettings().missionTemplates || [])],
      makeDeck: async args => { const r = await makeDeck(args); if (r.ok) push?.send('study', { title: '📚 New deck ready', body: `${r.deck?.name} · ${r.added} cards`, tag: 'deck', url: './#study' }, { evenIfLooking: false }).catch(() => {}); return r; },
      patchWidget: patchWidget, tts: phoneTts, ttsLabel,
      widget: st => widgetSnapshot(st),
      shop: () => ({ skin: store.getSettings().orbSkin || 'aurora', theme: store.getSettings().theme || 'green', all: allSkins() }),
      plan: () => { const g = goals.state(store.getSettings().weeklyGoals); return { goals: { week: g.week, items: g.items.map(i => ({ id: i.id, text: i.text, done: !!i.done })) }, reminders: (store.getSettings().chatReminders || []).filter(r => !r.done).sort((a, b) => a.at - b.at).slice(0, 20).map(r => ({ id: r.id, at: r.at, title: String(r.note || r.title || 'A chat').slice(0, 120), convId: r.convId || null })) }; },
      shopUse: async m => {
        const kind = String(m.kind || ''), key = String(m.key || '').slice(0, 30);
        await cirktsSync(true).catch(() => {});
        if (kind === 'skin') { if (!orbSkinOk(key)) return { ok: false, error: 'You don\'t own that skin yet.' }; applySettings({ orbSkin: key }); return { ok: true }; }
        if (kind === 'theme') { const id = !key ? 'green' : cosmetics.item('theme:' + key)?.free ? key : String(key).startsWith('custom-') ? key : 'shop-' + key; if (!shopThemeOk(id)) return { ok: false, error: 'You don\'t own that theme yet.' }; applySettings({ theme: id }); return { ok: true }; }
        if (kind === 'wtheme') {   // 4.3.0 widget themes from N28C
          const id = String(m.key || '').slice(0, 40), it = cosmetics.item(id);
          if (!it || it.kind !== 'wtheme' || !wthemeOk(it.key)) return { ok: false, error: 'You don\'t own that widget theme yet.' };
          store.setSettings({ deskWidgets: { ...(store.getSettings().deskWidgets || {}), theme: it.key } }); syncDeskWidgets(); return { ok: true };
        }
        return { ok: false, error: 'Unknown item.' };
      },
      extra: () => phoneExtra(), docs: () => phoneDocs(), act: phoneAct,   // 4.3.0
      planOp: async (op, m) => {
        const S = () => store.getSettings();
        if (op === 'goal_add') { const t = String(m.text || '').trim().slice(0, 140); if (!t) throw new Error('Type a goal.'); goalsSave(goals.add(S().weeklyGoals, t)); }
        if (op === 'goal_toggle') goalsSave(goals.toggle(S().weeklyGoals, String(m.id)));
        if (op === 'goal_remove') goalsSave(goals.remove(S().weeklyGoals, String(m.id)));
        if (op === 'reminder_add') { const t = m.at ? +m.at : remind.when(String(m.when || '')); if (!t || t <= Date.now()) throw new Error('Pick a time in the future.'); const r = addReminder({ convId: m.convId || null, at: t, note: String(m.note || '').slice(0, 200) }); return { reminder: { id: r.id, at: r.at } }; }
        if (op === 'reminder_done') { store.setSettings({ chatReminders: (S().chatReminders || []).filter(r => r.id !== String(m.id)) }); broadcast('reminders:changed'); }
        if (op === 'reminder_snooze') { store.setSettings({ chatReminders: (S().chatReminders || []).map(r => r.id === String(m.id) ? { ...r, at: Math.max(r.at, Date.now()) + (+m.minutes || 60) * 60e3 } : r) }); broadcast('reminders:changed'); }
        return { plan: companion?.actions?.plan?.() || null };   // 4.3.1: N28C shows the new state right away (no flicker)
      },
      huddle: phoneHuddle, debate: phoneDebate, askSpaces: o => askSpaces(o.q, { agent: o.agent, from: 'phone' }), cite: phoneCite, scanDeck: phoneScanDeck,
      agentsUsable: () => usableAgents().map(p => p.id),
      routineEnable: (id, on) => { const r = routines.get(id); if (!r) throw new Error('No such routine.'); routines.upsert({ id, enabled: !!on }); routines.onChange(routines.list()); return true; },
      outboxRemove: id => { const ph = store.getSettings().phone || {}; const outbox = (ph.outbox || []).filter(i => i.id !== id); store.setSettings({ phone: { ...ph, outbox } }); companion.put('outbox', { items: outbox }).catch(() => {}); }
    }, study, metrics, routines, version: app.getVersion(), enabled: phoneOn, newPhoneChat,
    personas: () => allPersonas(), runRoutine: id => routines.runNow(id, 'phone') });
  setInterval(() => { if (phoneOn()) companion.publish().catch(e => log('companion publish', e.message)); }, 120000);
  setInterval(() => { if (cloud.session) eventsState({ claim: true }).catch(() => {}); }, 30 * 60e3);   // 4.3.0 seasonal events
  // Every minute: study reminder, streak-saver, Shared Space posts → your phone
  setTimeout(() => planStudySlots(true).catch(e => log('study slots', e.message)), 20000);
  setInterval(() => { planStudySlots().then(studySlotTick).catch(e => log('study slots', e.message)); }, 60000);
  setInterval(() => {
    if (cloud.session) checkSpaces().catch(e => log('spaces', e.message));
    if (cloud.session && cloud.account?.()?.owner && !store.getSettings().creatorMarked) { store.setSettings({ creatorMarked: true }); recordMetric('creator'); }   // 4.3.1 The Creator
    if (!phoneOn()) return;
    const m = metrics.summary();
    if (focus.muting()) return;   // reminders wait until the focus block ends
    visitorsPush().catch(() => {});   // 4.3.0 profile visitors → your phone
    push.tick({ due: study.stats().due, challengeDone: !!m.challenge?.done, challengeText: m.challenge?.text, streak: m.streak || 0, activeToday: activeToday() }).catch(e => log('push tick', e.message));
  }, 60000);
  shared = new SharedSpaces({ cloud, study,
    nick: () => String(store.getSettings().phone?.nick || nicknameOf(store.getSettings()) || cloud.profile?.username || 'Friend').slice(0, 24),
    setNick: n => { n = String(n || '').trim().slice(0, 24); if (n) store.setSettings({ phone: { ...(store.getSettings().phone || {}), nick: n } }); },
    runAsk: async ({ agent, text, context, spaceName }) => {
      const p = allPersonas().find(x => x.id === agent) || allPersonas().find(x => x.id === 'flash');
      const res = await runChat({ personaId: p.id, messages: [{ role: 'user', content: `[Recent messages in the Shared Space "${spaceName}"]\n${context}\n\n${text}` }], noHandoff: true, noMemory: true, confirm: async () => false,
        systemExtra: '\n\nYour answer is posted to a Shared Space where the user studies with friends, so write for the group and keep it short.' });
      return { ok: res.ok, text: res.text, error: res.error, persona: res.persona || p.id, color: p.color, name: p.name.replace("Nexus '28 ", '') };
    } });
  let phoneLooking = false;   // N28C open right now? → the relay polls faster
  setInterval(() => { if (phoneOn() && push) push.phoneLooking().then(v => { phoneLooking = v; }).catch(() => {}); else phoneLooking = false; }, 15000);
  relay = new Relay({ cloud, device: thisDevice, fast: () => phoneLooking, handle: row => phoneGate(row) || handleFromPhone(row), onRequest: row => { const g = phoneGate(row); if (g) throw new Error(g.error); return companion.request(row); }, version: app.getVersion(), enabled: () => !!store.getSettings().phone?.enabled,
    agents: () => allPersonas().map(p => ({ id: p.id, name: p.name, color: p.color, legacy: !!p.legacy })), onState: st => broadcast('phone:relay', st) });
  routines.onChange = (orig => list => { orig(list); companion?.mark('status'); })(routines.onChange);
  relay.start();
  // v2.3: N28C straight to this Mac over Tailscale (Settings → Phone → Direct connection)
  direct = new Direct({ tailnet: createTailnet(), cloud, version: app.getVersion(),
    ask: row => phoneGate(row) || handleFromPhone(row),
    request: row => { const g = phoneGate(row); if (g) throw new Error(g.error); return companion.request(row); },
    agents: () => allPersonas().map(p => ({ id: p.id, name: p.name, color: p.color, legacy: !!p.legacy })),
    publish: d => cloud.session ? companion.put('direct', { ...d, device: thisDevice().id, at: Date.now() }) : Promise.resolve(),
    onState: st => broadcast('phone:direct', st) });
  setTimeout(syncDirect, 6000);
  setInterval(() => { if (direct?.state.on) direct.refresh(); }, 5 * 60e3);
  powerMonitor.on('resume', () => setTimeout(() => { if (direct?.state.on) direct.refresh(); }, 8000));
  applyLoginItem();
  powerMonitor.on('lock-screen', () => { screenLocked = true; });
  powerMonitor.on('unlock-screen', () => { screenLocked = false; setTimeout(() => routines.tick(), 3000); setTimeout(() => triggers?.unlocked('Mac unlocked'), 2500); });
  powerMonitor.on('resume', () => { setTimeout(() => routines.tick(), 5000); setTimeout(() => triggers?.unlocked('Mac woke'), 6000); });
  refreshHelperCaps().then(() => { syncWake(); syncSelWatch(); });
  setTimeout(() => { try { syncDeskWidgets(); } catch (e) { log('desk widgets', e.message); } }, 1500);   // 3.13
  try { spend = require('./src/spend').createSpend({ file: path.join(store.dir(), 'spend.json') }); } catch (e) { log('spend', e.message); }
  // 3.7 chat sync between your computers (opt-in, Settings → Profile)
  try {
    thisDevice();
    chatSync = require('./src/chatsync').createChatSync({ cloud, convos, getSettings: store.getSettings, setSettings: p => store.setSettings(p), onChanged: () => broadcastConvos(), device: store.getSettings().chatSync.device, log });
    chatSync.start();
  } catch (e) { log('chat sync', e.message); }
  // 3.7: web search goes through Chromium's network stack (search engines refuse Node's requests far more often)
  try { const { net } = require('electron'); if (net?.fetch && !process.env.NEXUS_TEST_ALLOW_PRIVATE) web.setFetch((u, o) => net.fetch(u, o)); } catch {}
  setupWinUpdates();
  // v3.6: a fresh install (few chats) with an upload waiting from another computer → offer to bring it over, once
  setTimeout(async () => {
    try {
      if (store.getSettings().transferOffered || !cloud.session || convos.summary().list.length > 2) return;
      const i = await cloud.transferInfo(); if (!i?.at) return;
      store.setSettings({ transferOffered: true });
      notify('🔁 Bring your chats over?', 'Your chats from your other computer are waiting. Click to copy them here (Settings → General).', () => showHud('general'));
    } catch {}
  }, 20000);
  setTimeout(() => { if (store.getSettings().updates.auto || winUp) checkUpdates(false); }, 12000);
  setTimeout(refreshIconCache, 8000);   // lsregister is slow; don't compete with the first window
  setInterval(() => { if (store.getSettings().updates.auto || winUp) checkUpdates(false); }, 6 * 3600e3);
  cloud.restore().then(() => cloud.sync()).then(broadcastCloud).then(() => { syncReleases().catch(e => log('releases', e.message)); syncThemeToProfile(); cloud.logActivity('desktop', app.getVersion()).then(broadcastCloud); checkFeedbackReplies(); presenceTick(); afterSignIn(); statSync?.start(); });
  setInterval(presenceTick, 120e3);
  setInterval(() => cloud.ensureFresh().then(() => cloud.sync()).then(broadcastCloud).then(checkFeedbackReplies).then(() => syncReleases()).catch(() => {}), 10 * 60 * 1000);
  // v2.2: maintenance + announcements (v2.3: + broadcasts) every minute, check-in for the admin dashboard every 3 hours
  setInterval(() => refreshApex(true), 5 * 60e3);
  setInterval(() => { const day = axiomData?.briefingDue(); if (day && apexOn()) { axiomData.setBriefing({ lastDay: day }); runAxiomBriefing({ why: 'schedule' }).catch(e => log('briefing', e.message)); } }, 60e3);
  setInterval(() => cloud.syncLive(app.getVersion()).then(changed => { if (changed) { broadcastCloud(); companion?.mark('status'); } deliverBroadcasts(); }), 60e3);
  setTimeout(() => cloud.syncLive(app.getVersion()).then(changed => { if (changed) broadcastCloud(); deliverBroadcasts(); }), 15e3);
  setInterval(() => cloud.logActivity('desktop', app.getVersion()).then(r => { if (r) broadcastCloud(); }), 3 * 3600e3);
});
app.on('second-instance', (_e, argv = []) => { const u = argv.find(a => /^nexus28:\/\//i.test(a)); if (u && attachments) handleNexusUrl(u); else showHud(); });
app.on('window-all-closed', () => {});
app.on('will-quit', () => { awake?.quit(); dimmer?.stop(); if (direct?.state.serving) direct.tailnet.unserve(direct.httpsPort); globalShortcut.unregisterAll(); clipHist?.stop(); watcher?.stopAll(); group?.stopAll(); triggers?.stop(); relay?.stop(); voice.stopSpeaking(); helper.kill(); mcp.closeAll(); });
