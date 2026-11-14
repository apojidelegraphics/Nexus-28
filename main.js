// Nexus Desktop — main process: menu bar, chat HUD, Quick Ask orb, Quick Chat, hotkeys, agent + voice IPC.
const { app, BrowserWindow, Tray, Menu, Notification, globalShortcut, ipcMain, nativeImage, screen, shell, session, systemPreferences, desktopCapturer, dialog, powerMonitor, clipboard } = require('electron');
const path = require('path');
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
const { Metrics } = require('./src/metrics');
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
const { Companion } = require('./src/companion');
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
const fsLog = require('fs');
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
const hotkeys = { toggle: null, quick: null, quickChat: null, screen: null, explain: null };
let escRegistered = false, enterRegistered = false;
const inflight = new Map();       // requestId -> AbortController
const listeners = new Map();      // speech session id -> webContents
const pendingConfirms = new Map(); // callId -> { resolve, requestId }
let convos = null;
let cloud = null;
let attachments = null, screenAware = null, routines = null, metrics = null, missions = null, mac = null, clipHist = null, watcher = null, study = null, triggers = null, citeStore = null, relay = null, companion = null, push = null, shared = null;
let screenLocked = false;

// Core agents (prompt + features from Nexus cloud when synced) + legacy models from Supabase.
function allPersonas() {
  const core = PERSONAS.map(p => {
    const c = cloud?.prompts[p.id];
    return { ...p, prompt: c?.prompt || p.prompt, features: [...new Set([...features.canonical(c?.features?.length ? c.features : p.features), ...features.universal(flagOn), ...features.customFor(p.id)])] };
  });
  const legacy = buildLegacy(cloud?.legacy || [], core.map(p => p.handle)).map(p => ({ ...p, features: [...new Set([...features.canonical(p.features), ...features.universal(flagOn), ...features.customFor(p.id)])] }));
  return [...core, ...customPersonas(core), ...legacy];
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
    base: CUSTOM_BASES.includes(a.base) ? a.base : 'flash', prompt, features: features.canonical(Array.isArray(a.features) ? a.features : []).slice(0, 20), created: a.created || Date.now() };
}
// ---------- Beta channel: which features are on for this person (admins → beta testers → everyone)
function flagState() {
  const s = store.getSettings();
  return flagsLib.resolve({ remote: cloud?.flags || [], account: cloud?.account() || {}, preview: s.beta?.preview || '', optOut: s.beta?.optOut || [], version: app.getVersion() });
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
    comped: !!cloud.profile?.comped, unlocked: access.unlockedBy(cloud.extras?.orders, all).has(persona.base || persona.id), used: usedFor(persona)
  });
}
function accessState() {
  const s = store.getSettings(), all = allPersonas();
  const unlocked = access.unlockedBy(cloud.extras?.orders, all);
  return Object.fromEntries(all.map(p => {
    const d = accessDecision(p, bindingFor(p, s), s, all);
    const limit = d.mode === 'free' ? (d.limit === Infinity ? null : d.limit) : (d.limit && d.limit !== Infinity ? d.limit : null);
    return [p.id, { mode: d.mode, tier: d.tier.id, tierLabel: d.tier.label, used: usedFor(p), limit, unlocked: unlocked.has(p.id), reason: d.reason || '' }];
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
const helper = new voice.Helper(helperPath);
// ---------------- "Hey Nexus" wake word (runs in the helper, on-device only)
const wake = { active: false, error: '', paused: new Set() };
function wakeWanted() { return !!store.getSettings().wakeWord && !!helperCaps.wake && wake.paused.size === 0; }
function setWakeWord(on) {
  const settings = store.setSettings({ wakeWord: !!on });
  broadcast('settings:changed', settings);
  setTimeout(syncWake, 0);
  return wakeStatus();
}
ipcMain.handle('wake:set', (_e, on) => setWakeWord(on));
function syncWake() {
  if (wakeWanted()) { if (!wake.active && helper.send({ cmd: 'wake_start' })) { wake.active = true; wake.error = ''; } }
  else if (wake.active) { helper.send({ cmd: 'wake_stop' }); wake.active = false; }
  broadcast('wake:status', wakeStatus());
}
function wakeStatus() { return { enabled: !!store.getSettings().wakeWord, supported: !!helperCaps.wake, listening: wake.active, error: wake.error }; }
function pauseWake(reason) { wake.paused.add(reason); if (wake.active) { helper.send({ cmd: 'wake_stop' }); wake.active = false; } }
function resumeWake(reason, delay = 600) { wake.paused.delete(reason); setTimeout(syncWake, delay); }

helper.on('event', ev => {
  if (ev.event === 'wake') { wake.active = false; log('wake word heard'); recordMetric('wake'); triggerQuick('wake'); return; }
  if (ev.event === 'wake_error') { wake.active = false; wake.error = ev.error; log('wake error', ev.error); broadcast('wake:status', wakeStatus()); return; }
  if (ev.event === 'wake_listening') return;
  const wc = listeners.get(ev.id);
  if (!wc || wc.isDestroyed()) return;
  wc.send('voice:event', ev);
  if (ev.event === 'final' || ev.event === 'error') { listeners.delete(ev.id); if (!listeners.size) resumeWake('listen'); }
});
let helperExits = [];
helper.on('exit', () => {
  wake.active = false;
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
}

// ---------------- Chat HUD
function createHud() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 900, height = 640;
  hud = new BrowserWindow({
    width, height,
    x: Math.round(workArea.x + (workArea.width - width) / 2), y: Math.round(workArea.y + workArea.height * 0.1),
    show: false, frame: false, transparent: true, resizable: true, minWidth: 620, minHeight: 440,
    hasShadow: true, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true,
    vibrancy: 'under-window', visualEffectState: 'active', backgroundColor: '#00000000', webPreferences
  });
  hud.setAlwaysOnTop(true, 'floating');
  hud.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  hud.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  hud.on('blur', () => {
    if (store.getSettings().hideOnBlur && !hud.webContents.isDevToolsOpened() && !hasPendingConfirm(hud)) hud.hide();
  });
  lockDown(hud);
}
function showHud(panel) {
  if (!hud) createHud();
  hideQuick();
  hud.show(); hud.focus();
  hud.webContents.send('hud:shown', { panel: panel || null });
}
function toggleHud() { if (hud && hud.isVisible() && hud.isFocused()) hud.hide(); else showHud(); }
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
  if (process.platform !== 'darwin') return false;
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
const HOTKEY_FNS = { toggle: () => toggleHud(), quick: () => triggerQuick(), quickChat: () => toggleQuickChat(), screen: () => screenToQuickChat(), explain: () => explainSelection() };
const SLOT_OF = { hotkeyToggle: 'toggle', hotkeyQuick: 'quick', hotkeyQuickChat: 'quickChat', hotkeyScreen: 'screen', hotkeyExplain: 'explain' };
function registerHotkey(slot, accel) {
  if (hotkeys[slot]) { try { globalShortcut.unregister(hotkeys[slot]); } catch {} }
  hotkeys[slot] = null;
  try { if (accel && globalShortcut.register(accel, HOTKEY_FNS[slot])) { hotkeys[slot] = accel; return true; } } catch {}
  return false;
}
const hotkeyStatus = () => ({ toggle: !!hotkeys.toggle, quick: !!hotkeys.quick, quickChat: !!hotkeys.quickChat, screen: !!hotkeys.screen, explain: !!hotkeys.explain });

function createTray() {
  // Same hexagon logo as the chat window header; a template image so macOS tints it for light/dark menu bars.
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Nexus '28");
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Chat', accelerator: hotkeys.toggle || undefined, click: () => showHud() },
    { label: 'Quick Chat', accelerator: hotkeys.quickChat || undefined, click: () => toggleQuickChat() },
    { label: 'Quick Ask (voice)', accelerator: hotkeys.quick || undefined, click: () => triggerQuick() },
    { label: 'Ask About My Screen', accelerator: hotkeys.screen || undefined, click: () => screenToQuickChat() },
    { label: 'Explain Highlighted Text', accelerator: hotkeys.explain || undefined, click: () => explainSelection() },
    { label: 'Watch a Window…', click: () => showHud('watch') },
    { label: 'Morning Brief', click: () => routines.runNow('brief', 'manual').then(r => r.convId && openConv(r.convId)) },
    { label: missions?.state() && !['done', 'error'].includes(missions.state().status) ? 'Mission in progress…' : 'Start a Mission…', click: () => showHud('mission') },
    { label: 'Routines…', click: () => showHud('routines') },
    { label: 'New Chat', click: () => { convos.create(); broadcastConvos(); showHud(); } },
    { type: 'separator' },
    { label: '"Hey Nexus"', type: 'checkbox', checked: !!store.getSettings().wakeWord, enabled: !!helperCaps.wake, click: m => setWakeWord(m.checked) },
    { label: 'Settings…', click: () => showHud('settings') },
    ...(updateState.newer ? [{ type: 'separator' }, { label: `Update available: v${updateState.latest}…`, click: () => shell.openExternal(updateState.download || updateState.url) }] : []),
    { label: 'Check for Updates…', click: () => checkUpdates(true).then(r => { if (!r.newer) showHud('general'); }) },
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
async function checkUpdates(manual) {
  try {
    const fs0 = flagState();
    const pre = fs0.realChannel !== 'stable' && store.getSettings().beta?.prerelease !== false;
    const r = await updater.checkLatest({ current: app.getVersion(), base: process.env.NEXUS_UPDATE_BASE || undefined, prerelease: pre });
    updateState = { ...r, checkedAt: Date.now(), error: '' };
  } catch (e) { updateState = { ...updateState, current: app.getVersion(), checkedAt: Date.now(), error: e.message }; }
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
ipcMain.handle('update:check', () => checkUpdates(true));
ipcMain.handle('update:open', () => { shell.openExternal(updateState.download || updateState.url || `https://github.com/${updater.REPO}/releases`); return true; });
ipcMain.handle('update:skip', (_e, version) => { store.setSettings({ updates: { skip: version } }); updateState.skipped = true; broadcast('update:state', updateState); return true; });

// ---------------- Conversations
function broadcastConvos() { broadcast('conv:changed', { summary: convos.summary(), active: convos.active() }); companion?.mark('chats'); }
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
ipcMain.handle('conv:addVersion', (_e, { convId, msg }) => { const c = convos.addVersion(convId, msg); broadcastConvos(); if (!msg.error) recordMetric('regenerate'); return c; });
ipcMain.handle('conv:new', (_e, opts) => { convos.create({ spaceId: opts?.spaceId || null }); broadcastConvos(); return convos.active(); });
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
ipcMain.handle('conv:delete', (_e, id) => { convos.remove(id); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:rename', (_e, { id, title }) => { convos.rename(id, title); broadcastConvos(); return true; });
ipcMain.handle('conv:pin', (_e, { id, on }) => { convos.pin(id, on !== false); broadcastConvos(); return true; });
ipcMain.handle('conv:clearAll', () => { convos.clearAll(); broadcastConvos(); return convos.active(); });

// ---------------- App + settings
const ORB_SKINS = { aurora: 0, reactor: 100, nebula: 250, pulse: 500, prism: 750, pixel: 1000, eclipse: 1500, overlord: 2000 };
// Admins can unlock every skin (Settings → Stats → "Unlock all skins"), or turn it off to earn them like everyone.
const allSkins = () => flagState().realChannel === 'admin' && store.getSettings().beta?.allSkins === true;
const orbSkinOk = id => id in ORB_SKINS && flagOn('orb_skins') && (allSkins() || (metrics?.summary().points || 0) >= ORB_SKINS[id]);
const HEX = /^#[0-9a-f]{6}$/i;
function cleanThemes(list) {
  return (Array.isArray(list) ? list : []).filter(t => t && HEX.test(t.accent) && HEX.test(t.bg)).slice(0, 12).map(t => ({
    id: /^custom-[a-z0-9]{1,12}$/.test(t.id) ? t.id : 'custom-' + Math.random().toString(36).slice(2, 8), name: String(t.name || 'My theme').slice(0, 24),
    accent: t.accent, accent2: HEX.test(t.accent2) ? t.accent2 : t.accent, bg: t.bg, text: HEX.test(t.text) ? t.text : '#e8f0ff', glass: Math.max(.6, Math.min(1, +t.glass || .88)) }));
}
const publicPersonas = () => allPersonas().map(({ prompt, defaultBinding, ...rest }) => rest);
const publicProviders = () => Object.fromEntries(Object.entries(providers.PROVIDERS).map(([id, p]) =>
  [id, { label: p.label, needsKey: p.needsKey, local: !!p.local, base: p.base, defaultModel: p.defaultModel, kind: p.kind, noTools: !!p.noTools }]));

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

ipcMain.handle('settings:set', (_e, patch) => {
  for (const [k, slot] of Object.entries(SLOT_OF)) if (patch[k] !== undefined) registerHotkey(slot, patch[k]);
  if (patch.customFeatures !== undefined) patch = { ...patch, customFeatures: features.cleanCustom(patch.customFeatures) };
  if (patch.customThemes !== undefined) patch = { ...patch, customThemes: cleanThemes(patch.customThemes) };
  if (patch.orbSkin !== undefined && !orbSkinOk(patch.orbSkin)) { const { orbSkin, ...rest } = patch; patch = rest; }
  if (patch.missionTemplates !== undefined) patch = { ...patch, missionTemplates: missionTemplates.cleanTemplates(patch.missionTemplates) };
  if (patch.freeKey) {
    // The free key can only ever point at a free model; the fetched list is set by main, never by a renderer.
    const { models: _ignored, ...fk } = patch.freeKey;
    if (fk.model !== undefined) fk.model = freeModels.safeFreeModel(fk.model, freeModelCache || store.getSettings().freeKey?.models);
    patch = { ...patch, freeKey: fk };
  }
  const settings = store.setSettings(patch);
  setTimeout(broadcastAccess, 0);
  if (patch.wakeWord !== undefined) setTimeout(syncWake, 0);
  if (patch.openAtLogin !== undefined) applyLoginItem();
  if (patch.clipboard?.history === false) clipHist?.clear();
  if (patch.beta !== undefined) { broadcast('flags:changed', flagState()); broadcast('personas:changed', publicPersonas()); }
  if (patch.customFeatures !== undefined) { features.setCustom(settings.customFeatures); broadcast('features:changed', { catalog: features.publicCatalog(), personas: publicPersonas() }); }
  if (patch.theme !== undefined || patch.customThemes !== undefined || patch.orbSkin !== undefined) companion?.mark('status'); // phone follows the desktop theme
  broadcast('settings:changed', settings);
  return { settings, hotkeys: hotkeyStatus() };
});
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
function chatTools(convId) {
  return {
    search: q => { const r = chatsearch.search(convos.load().list, q, { exclude: [convId], nameOf }); return { text: chatsearch.formatResults(r), count: r.length, found: r.map(x => ({ id: x.id, title: x.title })) }; },
    read: id => { const c = convos.get(id); return c ? { text: chatsearch.transcript(c, { nameOf }), title: c.title } : { text: 'No chat with that id. Use search_chats first.', title: '' }; }
  };
}

// One agent reply. Used by the chat windows (chat:send) and by Routines, the Morning Brief and Missions.
//   confirm({ callId, label, detail, tool }) → Promise<boolean>
async function runChat(args) {
  const { personaId, messages: raw = [], voiceMode = false, features: requested = [], convId, signal, onText = () => {}, onEvent = () => {}, confirm, systemExtra = '', noTools = false, maxSteps, interactive = false, noHandoff = false } = args;
  const s = store.getSettings();
  const all = allPersonas();
  const persona = all.find(p => p.id === personaId) || all[0];
  const binding = bindingFor(persona, s);
  const decision = accessDecision(persona, binding, s, all);
  if (decision.mode === 'blocked') return { ok: false, error: decision.reason, blocked: true, fatal: true };
  let route = { provider: binding.provider, model: binding.model, key: store.getKey(binding.provider), baseUrl: s.baseUrls[binding.provider] };
  if (decision.mode === 'free') {
    const fk = await cloud.freeKey();
    if (!fk) return { ok: false, error: "The free Nexus key isn't reachable right now. Check your connection, or add your own API key in Settings → Providers." };
    route = { provider: 'openrouter', model: freeModels.safeFreeModel(s.freeKey?.model, freeModelCache || s.freeKey?.models), key: fk, baseUrl: process.env.NEXUS_FREE_BASE || undefined };
  }
  // @Features: only ones this agent has, and not taken offline by feature maintenance.
  const down = new Set(cloud.featuresDown());
  const asked = [...new Set(requested.map(f => features.lookup(f)?.id).filter(Boolean))];
  const activeFeatures = asked.filter(id => persona.features.includes(id) && !down.has(features.norm(id)));
  const rejected = asked.filter(id => !activeFeatures.includes(id)).map(id => ({ id, reason: down.has(features.norm(id)) ? 'maintenance' : 'not available for this agent' }));
  const kit = featurekit.plan(activeFeatures, { custom: features.customMap(), agentic: persona.agentic && !noTools });
  // SwiftStream: only the recent part of the chat goes along, so the reply starts sooner.
  const trimmed = kit.swift ? raw.slice(-6) : raw;
  const messages = attachments.expand(withLinks(trimmed, convId));
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
  let featureBlock = features.featurePrompt(activeFeatures) + featurekit.blockPrompt(kit.blocks);
  if (kit.history) featureBlock += echoDigest(convId || convos.active()?.id);
  { const pc = convos.get(convId || convos.active()?.id), psp = pc?.spaceId && convos.space(pc.spaceId);    // Projects (v2.1)
    if (psp?.project) { try { featureBlock += projects.projectContext({ space: psp, convId: pc.id, convos, study, citeStore, citations, attachments }); } catch (e) { log('project context', e.message); } } }
  const fd = {};               // featureData saved with the reply (the chat shows it)
  const cards = [];
  const status = label => onEvent({ type: 'status', status: 'tool', tool: 'feature', label, detail: '' });
  const complete = ({ system, messages: ms }) => providers.chat({ provider: route.provider, model: route.model, baseUrl: route.baseUrl, key: route.key, appleFM,
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
      featureBlock += r.note || '';
    } catch (e) { if (signal?.aborted) break; log('feature pre-pass failed', kind, e.message); }
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
  const textOut = t => { if (!firstToken) firstToken = Date.now() - started; gate ? gate.push(t) : onText(t); };

  try {
    const result = await runAgent({
      chat: providers.chat,
      request: {
        provider: route.provider, model: route.model, baseUrl: route.baseUrl,
        key: route.key, appleFM,
        system: systemPromptFor(persona, { voice: !!voiceMode, tools: toolset.labels, omnibrief: s.omnibrief, nickname: nicknameOf(s) }) + featureBlock + featurekit.handoffNote(targets) + systemExtra
      },
      messages, tools: toolset.tools, routes: toolset.routes,
      exec: (name, a, { routes, signal }) => tools.execute(name, a, { settings: s, getKey: store.getKey, helper, mcp, routes, signal, screen: screenAware, chats: chatTools(convId), mac, clip: s.clipboard.history !== false ? clipHist : null, attachments, cite: citeStore }),
      describe: tools.describe, needsConfirm: tools.needsConfirm, confirm: confirm || (async () => false),
      signal, maxSteps,
      onText: textOut,
      onEvent: ev => onEvent(ev.type === 'status' && ev.status === 'connecting' ? { ...ev, label: prov.label } : ev)
    });
    const h = gate && featurekit.parseHandoff(result.text);
    if (h && targets.includes(h.to) && !signal?.aborted) {
      const tp = all.find(p => p.id === h.to);
      onEvent({ type: 'status', status: 'tool', tool: 'feature', label: `Handing off to ${tp.name}`, detail: h.reason });
      log('handoff', persona.id, '→', h.to, h.reason);
      const r2 = await runChat({ ...args, personaId: h.to, noHandoff: true });
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
    if (kit.swift) fd.latency = { first: firstToken || Date.now() - started, total: Date.now() - started, kept: trimmed.length, of: raw.length };
    const extras = { activity, images: result.images, sources: result.sources, cards: [...cards, ...result.cards].slice(0, 4), attachments: result.attachments, chatRefs: result.chatRefs };
    const featureData = Object.keys(fd).length ? fd : undefined;
    if (signal?.aborted) return { ok: true, aborted: true, text, ...extras, featureData };
    let usage = null;
    if (decision.mode === 'free' && text) { usage = { used: await recordUsage(persona), limit: decision.limit === Infinity ? null : decision.limit, tier: decision.tier.label }; broadcastAccess(); }
    if (interactive && text) recordMetric('chat', { agent: persona.id, voice: !!voiceMode, features: activeFeatures });
    return { ok: true, text, provider: route.provider, model: (decision.mode === 'free' ? 'Nexus free key · ' : '') + (route.model || prov.defaultModel), freeKey: decision.mode === 'free', usage, ...extras, features: activeFeatures, rejected, featureData, persona: persona.id };
  } catch (err) {
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
    return await runChat({ personaId, messages, voiceMode, features: requested, convId, signal: ctrl.signal, confirm, interactive: true,
      onText: t => send('chat:chunk', { text: t }), onEvent: ev => send('chat:event', ev) });
  } finally {
    inflight.delete(requestId);
    for (const [, p] of pendingConfirms) if (p.requestId === requestId) p.resolve(false);
  }
});

// Approvals for work running in the background (Routines, Missions): a banner in the chat window + a notification.
function bgConfirm(source) {
  return ({ callId, label, detail, tool }) => new Promise(resolve => {
    const timer = setTimeout(() => { pendingConfirms.delete(callId); broadcast('bg:confirmDone', { callId }); resolve(false); }, 30 * 60 * 1000);
    pendingConfirms.set(callId, { requestId: 'bg', wc: hud?.webContents, resolve: v => { clearTimeout(timer); pendingConfirms.delete(callId); broadcast('bg:confirmDone', { callId }); resolve(v); } });
    broadcast('bg:confirm', { callId, label, detail, tool, source });
    notify(`${source} needs your OK`, `${label}${detail ? ' — ' + detail : ''}`, () => showHud());
  });
}
function notify(title, body, onClick, { force = false } = {}) {
  if (!force && focus?.muting()) { focus.hold(title, body); broadcast('focus:state', focus.state()); return; }   // Focus timer holds notifications
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body: String(body || '').slice(0, 220) });
  if (onClick) n.on('click', onClick);
  n.show();
}
function recordMetric(event, data) {
  if (!metrics) return;
  companion?.mark('status');
  const fresh = metrics.record(event, data);
  if (fresh.length) {
    broadcast('metrics:achievement', fresh);
    if (!hud?.isVisible()) for (const a of fresh) notify(`Achievement unlocked: ${a.name}`, a.desc);
  }
}

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
ipcMain.handle('voice:transcribe', async (_e, { audio, mime }) => {
  const s = store.getSettings();
  const buf = Buffer.from(audio);
  try {
    const text = s.voice.stt === 'elevenlabs'
      ? await voice.sttElevenLabs({ key: store.getKey('elevenlabs'), audio: buf, mime })
      : await voice.sttOpenAI({ key: store.getKey('openai'), audio: buf, mime });
    return { ok: true, text };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('voice:speak', async (_e, { text, purpose, persona }) => {
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
    { name: 'Images, PDFs and text', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'pdf', 'txt', 'md', 'csv', 'json', 'html', 'js', 'ts', 'py', 'swift', 'css', 'xml', 'yaml', 'yml', 'log'] },
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
async function makeDeck({ topic, count = 12, agent }) {
  topic = String(topic || '').trim().slice(0, 200);
  if (topic.length < 3) return { ok: false, error: 'What should the deck be about?' };
  const s = store.getSettings();
  const pick = [agent, 'neodela', 'lyte', 'flash'].filter(Boolean).find(id => { const p = allPersonas().find(x => x.id === id); return p && accessDecision(p, bindingFor(p, s), s, allPersonas()).mode !== 'blocked'; });
  const n = Math.max(4, Math.min(30, +count || 12));
  const res = await runChat({ personaId: pick || 'flash', noTools: true, noHandoff: true, messages: [{ role: 'user', content: `Make ${n} flashcards to study: ${topic}` }],
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
ipcMain.handle('feedback:send', (_e, { type = 'General Feedback', text = '', includeInfo = true, to = 'email', feature = '' }) => {
  const info = includeInfo ? `\n\n=== App details ===\n${appInfo()}` : '';
  const what = String(text).trim() || '(describe your feedback here)';
  if (to === 'github') {
    const label = /bug/i.test(type) ? 'bug' : /feature/i.test(type) ? 'enhancement' : /beta/i.test(type) ? 'beta' : 'feedback';
    const title = `${type}${feature ? ` (${feature})` : ''}: ${what.split('\n')[0].slice(0, 70)}`;
    shell.openExternal(githubIssueUrl({ title, body: `${what}${info}`, labels: [label, ...(feature ? ['beta'] : [])] }));
    return { ok: true, to: 'github' };
  }
  const subject = `Nexus '28 v${app.getVersion()} ${type}${feature ? ` — ${feature}` : ''}`;
  shell.openExternal(`mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(what + info)}`);
  return { ok: true, to: FEEDBACK_TO };
});
// Beta tester sign-up. GitHub issues are public, so the email address is only included in the email version.
// Beta tester sign-up (v2.0, Settings → Account): saved to public.beta_requests (the admin portal's queue — admins
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
    '', a.signedIn ? '' : '_To get beta features, sign in to a Nexus account in the app (Settings → Account) so an admin can turn on beta for it._'].join('\n');
  if (to === 'all' || to === 'github') shell.openExternal(githubIssueUrl({ title: `Beta tester sign-up: ${a.signedIn ? a.username || 'Nexus user' : 'Nexus user'}`, body, labels: ['beta-signup'] }));
  if (to === 'all' || to === 'email') setTimeout(() => shell.openExternal(`mailto:${FEEDBACK_TO}?subject=${encodeURIComponent("Nexus '28 beta tester sign-up")}&body=${encodeURIComponent(body.replace(/\*\*/g, '').replace(/_/g, '').replace(/Nexus account: .*/, `Nexus account: ${who} <${a.email || 'no email'}>`))}`), 1200);
  return { ok: true, to, signedIn: !!a.signedIn, saved, already, error };
});
ipcMain.handle('beta:myRequest', async () => {
  if (!cloud.session) return null;
  try { return (await cloud.authedGet('beta_requests?select=status,created_at,note&order=created_at.desc&limit=1'))[0] || null; } catch { return null; }
});
ipcMain.handle('flags:state', () => flagState());
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
  if (!cloud.session) return { ok: false, error: 'Sign in to your Nexus account to share (Settings → Account).' };
  try { const code = await cloud.write('POST', 'rpc/share_agent', { p_agent: { name: a.name, handle: a.handle, color: a.color, emoji: a.emoji, base: a.base, prompt: a.prompt, features: a.features } }); return { ok: true, code: String(code).replace(/"/g, '') }; }
  catch (e) { return { ok: false, error: /share_agent|404|PGRST/.test(e.message) ? 'Sharing needs the v2.1 Supabase SQL.' : e.message.replace(/^Nexus cloud \d+: /, '') }; }
});
ipcMain.handle('agents:import', async (_e, code) => {
  if (!cloud.session) return { ok: false, error: 'Sign in to your Nexus account to import (Settings → Account).' };
  try {
    const got = await cloud.write('POST', 'rpc/get_shared_agent', { p_code: String(code || '').replace(/\s/g, '').toUpperCase() });
    const list = store.getSettings().customAgents || [];
    let handle = String(got.handle || got.name || 'agent').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'agent';
    const taken = new Set(allPersonas().map(p => p.handle)); let h = handle, i = 2; while (taken.has(h)) h = (handle.slice(0, 13) + i++);
    const clean = cleanCustomAgent({ ...got, id: undefined, handle: h });
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
ipcMain.handle('cite:list', () => ({ list: citeStore.all(), projects: citeStore.projects() }));
ipcMain.handle('cite:save', (_e, c) => { const r = citeStore.add(c); recordMetric('cite'); return { ok: true, item: r, list: citeStore.all(), projects: citeStore.projects() }; });
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
  if (!conv) conv = s.phone?.convId && convos.get(s.phone.convId);
  if (!conv) conv = convos.get(newPhoneChat());
  let att = null;
  if (meta.fileId) { try { att = await phoneAttachment(String(meta.fileId)); } catch (e) { return { ok: false, error: e.message, agent }; } }
  const context = spaceId && meta.context ? `[Recent messages in the Shared Space "${String(meta.spaceName || '').slice(0, 40)}"]\n${String(meta.context).slice(0, 3000)}\n\n` : '';
  convos.appendTo(conv.id, { role: 'user', content: context + String(row.content || (att ? 'Here is a photo.' : '')).slice(0, 8000), via: 'phone', ...(att ? { attachments: [att] } : {}) });
  broadcastConvos();
  const feats = Array.isArray(meta.features) ? meta.features.map(String).slice(0, 6) : [];
  const res = await runChat({ personaId: agent, messages: toApi(convos.get(conv.id).messages, agent), convId: conv.id, confirm: bgConfirm('Phone'), features: feats,
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
  return { ok: res.ok, text: res.text, error: res.error, agent: res.persona || agent, model: res.model };
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
  const f = rows[0], buf = Buffer.from(f.data, 'base64');
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
  if (act === 'save') { notify('📥 Saved from your phone', body.slice(0, 140), () => openConv(conv.id)); return { done: 'Saved on your Mac', convId: conv.id }; }
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
    if (phoneOn()) await push?.send('spaces', { title: posts.length > 1 ? `👥 ${posts.length} new in your Shared Spaces` : `👥 ${p.nickname}`, body: p.kind === 'deck' ? `shared a deck: ${p.content}` : p.content, tag: 'space-' + p.space_id, url: './#space=' + p.space_id });
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
  return { available: on, enabled: !!s.phone?.enabled, agent: s.phone?.agent || 'flash', url: COMPANION_URL, qr, signedIn: !!cloud.session, relay: relay?.state || { status: 'off' },
    notify: push?.prefs() || null, devices, outbox: (s.phone?.outbox || []).slice(0, 20), inboxId: s.phone?.inboxId && convos.get(s.phone.inboxId) ? s.phone.inboxId : '' };
};
ipcMain.handle('phone:state', () => phoneState());
ipcMain.handle('phone:set', async (_e, patch = {}) => {
  const clean = {};
  if (patch.enabled !== undefined) clean.enabled = !!patch.enabled;
  if (typeof patch.agent === 'string' && allPersonas().some(p => p.id === patch.agent)) clean.agent = patch.agent;
  if (patch.notify && push) push.setPrefs(patch.notify);
  store.setSettings({ phone: { ...(store.getSettings().phone || {}), ...clean } });
  companion?.mark('status');
  relay?.poll();
  if (patch.enabled && cloud.session) companion?.publish().catch(e => log('companion publish', e.message));
  return phoneState();
});


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
async function transcribeWav(file, buf) {
  const s = store.getSettings(), want = s.voice.stt;
  const viaHelper = () => helper.request({ cmd: 'transcribe_file', id: 'tf-' + Math.random().toString(36).slice(2), path: file, locale: s.voice.locale || '' }, ['result'], 180000).then(ev => String(ev.data?.text || ''));
  if (want === 'openai' && store.getKey('openai')) return voice.sttOpenAI({ key: store.getKey('openai'), audio: buf, mime: 'audio/wav' });
  if (want === 'elevenlabs' && store.getKey('elevenlabs')) return voice.sttElevenLabs({ key: store.getKey('elevenlabs'), audio: buf, mime: 'audio/wav' });
  if (helperCaps.transcribeFile) return viaHelper();
  if (store.getKey('openai')) return voice.sttOpenAI({ key: store.getKey('openai'), audio: buf, mime: 'audio/wav' });
  if (store.getKey('elevenlabs')) return voice.sttElevenLabs({ key: store.getKey('elevenlabs'), audio: buf, mime: 'audio/wav' });
  throw new Error('Meeting notes need speech-to-text: update the NexusCore helper (npm run build:helper) for free on-device transcription, or add an OpenAI key (Settings → Models & keys).');
}
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
ipcMain.handle('write:list', () => docs.list());
ipcMain.handle('write:get', (_e, id) => docs.get(id));
ipcMain.handle('write:save', (_e, d) => docs.put(d || {}));
ipcMain.handle('write:remove', (_e, id) => { docs.remove(id); return docs.list(); });
ipcMain.handle('write:suggest', async (_e, { text, mode = 'improve', instruction = '', agent = '', selection = '' }) => {
  text = String(text || '').slice(0, writer.MAX_CHARS);
  if (!text.trim()) return { ok: false, error: 'Write something first.' };
  const usable = usableAgents().map(p => p.id);
  const who = [agent, 'lyte', 'neodela', 'flash'].find(x => x && usable.includes(x)) || usable[0];
  if (!who) return { ok: false, error: 'No agent is available.' };
  const task = String(instruction).trim() ? `Do this: ${String(instruction).trim().slice(0, 500)}` : (writer.MODES[mode] || writer.MODES.improve);
  const part = selection && text.includes(selection) ? `\n\nOnly edit inside this part of the document:\n<<<\n${String(selection).slice(0, 4000)}\n>>>` : '';
  const res = await runChat({ personaId: who, noTools: true, noHandoff: true, systemExtra: writer.PROMPT(mode === 'continue' && !String(instruction).trim() ? 'continue' : 'edit'),
    messages: [{ role: 'user', content: `${task}${part}\n\n=== DOCUMENT ===\n${text}` }] });
  if (!res.ok) return { ok: false, error: res.error };
  recordMetric('write');
  return { ok: true, agent: who, ...writer.parseSuggestions(res.text, text) };
});
ipcMain.handle('write:export', async (e, { title, text, format = 'md' }) => {
  format = ['md', 'txt', 'docx'].includes(format) ? format : 'md';
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath: `${String(title || 'Document').replace(/[^\w .,'()-]/g, '').slice(0, 60) || 'Document'}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try { fsLog.writeFileSync(r.filePath, format === 'docx' ? await exporter.textToDocx(title, text) : String(text)); return { ok: true, path: r.filePath }; }
  catch (err) { return { ok: false, error: err.message }; }
});

// ---------------- Focus timer (v2.1)
const focus = new Focus({
  onState: st => { broadcast('focus:state', st); companion?.mark('status'); },
  onBlockDone: (st, held = []) => { recordMetric('focus'); notify(st.block >= st.blocks ? '◷ Focus done!' : `◷ Block ${st.block} done, take ${st.breakMinutes} minutes`, (st.task ? `“${st.task}”. +5 points.` : '+5 points. Nice work.') + (held.length ? ` You missed ${held.length}: ${held.slice(-2).map(h => h.title).join(' · ')}` : ''), () => showHud(), { force: true }); },
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
  if (save) { citeStore.add({ ...source, project: String(project || '').slice(0, 60) }); recordMetric('cite'); }
  return out;
}

// ---------------- Shared Spaces on the Mac (v1.9)
const sharedOk = async fn => {
  if (!shared) return { ok: false, error: 'Starting up…' };
  try { return { ok: true, ...(await fn()) }; }
  catch (e) { return { ok: false, error: /shared_space|create_shared_space|42P01|PGRST20|404/.test(e.message) ? 'Shared Spaces need the v1.8 Supabase SQL.' : e.message.replace(/^Nexus cloud \d+: /, '').replace(/^\{.*"message":"([^"]+)".*$/, '$1') }; }
};
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
ipcMain.handle('triggers:status', async () => ({ wifi: triggers?.status.wifi || null, audio: triggers?.status.audio || null, mac: process.platform === 'darwin' }));
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
  if (process.platform !== 'darwin' || !app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!store.getSettings().openAtLogin, openAsHidden: true }); } catch (e) { log('login item', e); }
}

// ---------------- Windows
ipcMain.handle('hud:hide', () => { hud?.hide(); return true; });
ipcMain.handle('quick:hide', () => { hideQuick(); return true; });
ipcMain.handle('quick:active', (_e, on) => { setEsc(!!on); return true; });
ipcMain.handle('quick:openChat', (_e, convId) => { quickChat?.hide(); if (convId && convos.get(convId)) { convos.select(convId); broadcastConvos(); } showHud(); return true; });
ipcMain.handle('quickchat:resize', (_e, h) => {
  if (!quickChat) return false;
  const [x, y] = quickChat.getPosition();
  quickChat.setBounds({ x, y, width: QC_WIDTH, height: Math.max(80, Math.min(640, Math.round(h))) });
  return true;
});
ipcMain.handle('quickchat:hide', () => { quickChat?.hide(); return true; });
ipcMain.handle('open:external', (_e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); return true; });
ipcMain.handle('open:spokenContent', () => shell.openExternal('x-apple.systempreferences:com.apple.preference.universalaccess?SpokenContent'));

// ---------------- Nexus cloud
function broadcastCloud() { broadcast('cloud:changed', cloud.state()); broadcast('personas:changed', publicPersonas()); broadcast('flags:changed', flagState()); broadcastAccess(); }
ipcMain.handle('access:state', () => accessState());
ipcMain.handle('cloud:state', () => cloud.state());
ipcMain.handle('cloud:sync', async () => { await cloud.sync(); broadcastCloud(); return cloud.state(); });
ipcMain.handle('cloud:signIn', async (_e, { email, password }) => {
  try { await cloud.signIn(email, password); broadcastCloud(); return { ok: true, state: cloud.state() }; }
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
ipcMain.handle('cloud:redeem', async (_e, { orderId }) => {
  try { const r = await cloud.redeem(orderId); broadcastCloud(); recordMetric('redeem'); return { ok: true, result: r, state: cloud.state() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('cloud:dismiss', (_e, id) => {
  const s = store.getSettings();
  const settings = store.setSettings({ dismissedAnnouncements: [...new Set([...(s.dismissedAnnouncements || []), id])].slice(-50) });
  broadcast('settings:changed', settings);
  return true;
});

// ---------------- Lifecycle
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock.hide();
  adoptLoginPath();
  convos = new Conversations(store.dir());
  // People updating from an earlier version skip the first-run tour (they get a "what's new" banner instead).
  if (!store.getSettings().onboarded && convos.summary().list.length) store.setSettings({ onboarded: true });
  features.setCustom(store.getSettings().customFeatures);
  attachments = new Attachments({ dir: store.dir(), nativeImage, helper });
  group = createGroup({ ask: groupAsk, convos, nameOf: groupNames, onProgress: ev => broadcast('group:progress', ev), onAppend: () => broadcastConvos() });
  screenAware = createScreen({ desktopCapturer, systemPreferences, shell, helper, attachments });
  metrics = new Metrics({ dir: store.dir() });
  study = new Study({ dir: store.dir() });
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
  clipHist = createClipHistory({ clipboard, enabled: () => store.getSettings().clipboard.history !== false, onChange: list => broadcast('clip:changed', list.slice(0, 50)) });
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
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'media' && wc.getURL().startsWith('file://')));
  createTray();
  createHud();
  createQuick();
  createQuickChat();
  const s = store.getSettings();
  registerHotkey('toggle', s.hotkeyToggle);
  registerHotkey('quick', s.hotkeyQuick);
  registerHotkey('quickChat', s.hotkeyQuickChat);
  registerHotkey('screen', s.hotkeyScreen);
  registerHotkey('explain', s.hotkeyExplain);
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
      clipGet: clipForPhone, clipSet: async t => { await within(clipboard.writeText(t)); notify('📋 Copied from your phone', t.slice(0, 120)); },
      inbox: phoneInbox, missionStart: startMission, missionEnd: () => missions.end(), missionState: () => missions.state(),
      templates: () => [...missionTemplates.BUILTIN, ...(store.getSettings().missionTemplates || [])],
      makeDeck: async args => { const r = await makeDeck(args); if (r.ok) push?.send('study', { title: '📚 New deck ready', body: `${r.deck?.name} · ${r.added} cards`, tag: 'deck', url: './#study' }, { evenIfLooking: false }).catch(() => {}); return r; },
      patchWidget: patchWidget, tts: phoneTts, ttsLabel,
      huddle: phoneHuddle, debate: phoneDebate, cite: phoneCite, scanDeck: phoneScanDeck,
      agentsUsable: () => usableAgents().map(p => p.id),
      routineEnable: (id, on) => { const r = routines.get(id); if (!r) throw new Error('No such routine.'); routines.upsert({ id, enabled: !!on }); routines.onChange(routines.list()); return true; },
      outboxRemove: id => { const ph = store.getSettings().phone || {}; const outbox = (ph.outbox || []).filter(i => i.id !== id); store.setSettings({ phone: { ...ph, outbox } }); companion.put('outbox', { items: outbox }).catch(() => {}); }
    }, study, metrics, routines, version: app.getVersion(), enabled: phoneOn, newPhoneChat,
    personas: () => allPersonas(), runRoutine: id => routines.runNow(id, 'phone') });
  setInterval(() => { if (phoneOn()) companion.publish().catch(e => log('companion publish', e.message)); }, 120000);
  // Every minute: study reminder, streak-saver, Shared Space posts → your phone
  setTimeout(() => planStudySlots(true).catch(e => log('study slots', e.message)), 20000);
  setInterval(() => { planStudySlots().then(studySlotTick).catch(e => log('study slots', e.message)); }, 60000);
  setInterval(() => {
    if (cloud.session) checkSpaces().catch(e => log('spaces', e.message));
    if (!phoneOn()) return;
    const m = metrics.summary();
    if (focus.muting()) return;   // reminders wait until the focus block ends
    push.tick({ due: study.stats().due, challengeDone: !!m.challenge?.done, challengeText: m.challenge?.text }).catch(e => log('push tick', e.message));
  }, 60000);
  shared = new SharedSpaces({ cloud, study,
    nick: () => String(store.getSettings().phone?.nick || nicknameOf(store.getSettings()) || cloud.profile?.username || 'Friend').slice(0, 24),
    setNick: n => { n = String(n || '').trim().slice(0, 24); if (n) store.setSettings({ phone: { ...(store.getSettings().phone || {}), nick: n } }); },
    runAsk: async ({ agent, text, context, spaceName }) => {
      const p = allPersonas().find(x => x.id === agent) || allPersonas().find(x => x.id === 'flash');
      const res = await runChat({ personaId: p.id, messages: [{ role: 'user', content: `[Recent messages in the Shared Space "${spaceName}"]\n${context}\n\n${text}` }], noHandoff: true, confirm: async () => false,
        systemExtra: '\n\nYour answer is posted to a Shared Space where the user studies with friends, so write for the group and keep it short.' });
      return { ok: res.ok, text: res.text, error: res.error, persona: res.persona || p.id, color: p.color, name: p.name.replace("Nexus '28 ", '') };
    } });
  let phoneLooking = false;   // N28C open right now? → the relay polls faster
  setInterval(() => { if (phoneOn() && push) push.phoneLooking().then(v => { phoneLooking = v; }).catch(() => {}); else phoneLooking = false; }, 15000);
  relay = new Relay({ cloud, fast: () => phoneLooking, handle: handleFromPhone, onRequest: row => companion.request(row), version: app.getVersion(), enabled: () => !!store.getSettings().phone?.enabled,
    agents: () => allPersonas().map(p => ({ id: p.id, name: p.name, color: p.color, legacy: !!p.legacy })), onState: st => broadcast('phone:relay', st) });
  routines.onChange = (orig => list => { orig(list); companion?.mark('status'); })(routines.onChange);
  relay.start();
  applyLoginItem();
  powerMonitor.on('lock-screen', () => { screenLocked = true; });
  powerMonitor.on('unlock-screen', () => { screenLocked = false; setTimeout(() => routines.tick(), 3000); setTimeout(() => triggers?.unlocked('Mac unlocked'), 2500); });
  powerMonitor.on('resume', () => { setTimeout(() => routines.tick(), 5000); setTimeout(() => triggers?.unlocked('Mac woke'), 6000); });
  refreshHelperCaps().then(syncWake);
  setTimeout(() => { if (store.getSettings().updates.auto) checkUpdates(false); }, 12000);
  setTimeout(refreshIconCache, 8000);   // lsregister is slow; don't compete with the first window
  setInterval(() => { if (store.getSettings().updates.auto) checkUpdates(false); }, 6 * 3600e3);
  cloud.restore().then(() => cloud.sync()).then(broadcastCloud);
  setInterval(() => cloud.ensureFresh().then(() => cloud.sync()).then(broadcastCloud), 10 * 60 * 1000);
});
app.on('second-instance', () => showHud());
app.on('window-all-closed', () => {});
app.on('will-quit', () => { globalShortcut.unregisterAll(); clipHist?.stop(); watcher?.stopAll(); group?.stopAll(); triggers?.stop(); relay?.stop(); voice.stopSpeaking(); helper.kill(); mcp.closeAll(); });
