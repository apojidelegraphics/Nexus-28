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
let attachments = null, screenAware = null, routines = null, metrics = null, missions = null, mac = null, clipHist = null, watcher = null;
let screenLocked = false;

// Core agents (prompt + features from Nexus cloud when synced) + legacy models from Supabase.
function allPersonas() {
  const core = PERSONAS.map(p => {
    const c = cloud?.prompts[p.id];
    return { ...p, prompt: c?.prompt || p.prompt, features: [...features.canonical(c?.features?.length ? c.features : p.features), ...features.customFor(p.id)] };
  });
  const legacy = buildLegacy(cloud?.legacy || [], core.map(p => p.handle)).map(p => ({ ...p, features: [...features.canonical(p.features), ...features.customFor(p.id)] }));
  return [...core, ...legacy];
}
// ---------- Access: free Nexus key, tiers, chat limits, redeemed orders
const freeModels = require('./src/freemodels');
const FREE_MODEL = freeModels.ROUTER;
let freeModelCache = null; // fetched list of free OpenRouter models (this session)
const usageFile = () => path.join(store.dir(), 'usage.json');
function localUsage() { try { return JSON.parse(require('fs').readFileSync(usageFile(), 'utf8')); } catch { return {}; } }
function bindingFor(persona, s) {
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
    comped: !!cloud.profile?.comped, unlocked: access.unlockedBy(cloud.extras?.orders, all).has(persona.id), used: usedFor(persona)
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
    const r = await updater.checkLatest({ current: app.getVersion(), base: process.env.NEXUS_UPDATE_BASE || undefined });
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
function broadcastConvos() { broadcast('conv:changed', { summary: convos.summary(), active: convos.active() }); }
ipcMain.handle('conv:state', () => ({ summary: convos.summary(), active: convos.active() }));
ipcMain.handle('conv:append', (_e, msg, convId) => { const c = convos.appendTo(convId, msg); broadcastConvos(); return c; });
// Widget state saved on a reply (checklist ticks, quiz answers, starred ideas). Only the `widget` field can change.
ipcMain.handle('conv:patchWidget', (_e, { convId, ts, key, value }) => {
  const c = convos.get(convId); const m = c?.messages.find(x => x.ts === ts);
  if (!m || !/^[\w-]{1,40}$/.test(String(key))) return false;
  m.widget = { ...(m.widget || {}), [key]: JSON.parse(JSON.stringify(value ?? null)) };
  convos.save(); return true;
});
ipcMain.handle('conv:get', (_e, id) => convos.get(id));
ipcMain.handle('conv:addVersion', (_e, { convId, msg }) => { const c = convos.addVersion(convId, msg); broadcastConvos(); if (!msg.error) recordMetric('regenerate'); return c; });
ipcMain.handle('conv:new', (_e, opts) => { convos.create({ spaceId: opts?.spaceId || null }); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:move', (_e, { convId, spaceId }) => { convos.moveToSpace(convId, spaceId); broadcastConvos(); return true; });
ipcMain.handle('conv:links', (_e, { convId, links }) => { const c = convos.setLinks(convId, links); broadcastConvos(); return c?.links || []; });
ipcMain.handle('spaces:add', (_e, sp) => { const r = convos.addSpace(sp || {}); broadcastConvos(); return r; });
ipcMain.handle('spaces:update', (_e, { id, patch }) => { const r = convos.updateSpace(id, patch || {}); broadcastConvos(); return r; });
ipcMain.handle('spaces:remove', (_e, id) => { convos.removeSpace(id); broadcastConvos(); return true; });
ipcMain.handle('conv:setVersion', (_e, { convId, index }) => { const c = convos.setVersion(convId, index); broadcastConvos(); return c; });
ipcMain.handle('conv:select', (_e, id) => { convos.select(id); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:delete', (_e, id) => { convos.remove(id); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:rename', (_e, { id, title }) => { convos.rename(id, title); broadcastConvos(); return true; });
ipcMain.handle('conv:clearAll', () => { convos.clearAll(); broadcastConvos(); return convos.active(); });

// ---------------- App + settings
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
  watches: watcher.state(),
  ax: { trusted: axTrusted(false), mac: process.platform === 'darwin' }
}));

ipcMain.handle('settings:set', (_e, patch) => {
  for (const [k, slot] of Object.entries(SLOT_OF)) if (patch[k] !== undefined) registerHotkey(slot, patch[k]);
  if (patch.customFeatures !== undefined) patch = { ...patch, customFeatures: features.cleanCustom(patch.customFeatures) };
  if (patch.customThemes !== undefined) patch = { ...patch, customThemes: cleanThemes(patch.customThemes) };
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
  if (patch.customFeatures !== undefined) { features.setCustom(settings.customFeatures); broadcast('features:changed', { catalog: features.publicCatalog(), personas: publicPersonas() }); }
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
  }
  let featureBlock = features.featurePrompt(activeFeatures) + featurekit.blockPrompt(kit.blocks);
  if (kit.history) featureBlock += echoDigest(convId || convos.active()?.id);
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
      exec: (name, a, { routes, signal }) => tools.execute(name, a, { settings: s, getKey: store.getKey, helper, mcp, routes, signal, screen: screenAware, chats: chatTools(convId), mac, clip: s.clipboard.history !== false ? clipHist : null, attachments }),
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
function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body: String(body || '').slice(0, 220) });
  if (onClick) n.on('click', onClick);
  n.show();
}
function recordMetric(event, data) {
  if (!metrics) return;
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
ipcMain.handle('feedback:send', (_e, { type = 'General Feedback', text = '', includeInfo = true }) => {
  const s = store.getSettings();
  const p = allPersonas().find(x => x.id === s.activePersona);
  const info = includeInfo ? [
    '', '=== App details ===', `Nexus '28 v${app.getVersion()} (desktop)`, `macOS ${process.getSystemVersion?.() || ''} · ${process.arch}`,
    `Agent: ${p?.name || s.activePersona}`, `Model: ${bindingFor(p || allPersonas()[0], s).provider || ''}`,
    `Signed in: ${cloud.session ? 'yes' : 'no'} · Helper: ${helperCaps.built ? 'v' + (helperCaps.version || '?') : 'not built'}`
  ].join('\n') : '';
  const subject = `Nexus '28 v${app.getVersion()} ${type}`;
  const body = `${String(text).trim() || '(describe your feedback here)'}\n${info}`;
  shell.openExternal(`mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  return { ok: true, to: FEEDBACK_TO };
});

// ---------------- Routines + Morning Brief
const ROUTINE_NOTE = "\n\nThis is a scheduled routine the user set up; they aren't watching live. Answer directly and self-contained, short enough to read in a notification-sized glance plus details below.";
function routinesSpace() { return convos.ensureSpace('routines', { name: 'Routines', color: '#ffd36b' }); }
function firstLine(t) { return String(t || '').replace(/[#*_`>|]/g, '').split('\n').map(x => x.trim()).find(Boolean) || ''; }
async function runRoutine(r, why) {
  if (r.kind === 'brief') return runBrief({ why });
  let conv = r.convId && convos.get(r.convId);
  if (!conv) conv = convos.create({ activate: false, spaceId: routinesSpace().id, title: '⟳ ' + r.name, kind: 'routine' });
  convos.appendTo(conv.id, { role: 'user', content: r.prompt, via: 'routine' });
  broadcastConvos();
  const res = await runChat({ personaId: r.agent, messages: toApi(convos.get(conv.id).messages, r.agent), convId: conv.id, confirm: bgConfirm(`Routine "${r.name}"`), systemExtra: ROUTINE_NOTE });
  convos.appendTo(conv.id, res.ok ? { role: 'assistant', persona: r.agent, content: res.text || '(no reply)', model: res.model, via: 'routine', activity: res.activity || [], sources: res.sources || [], cards: res.cards || [] }
    : { role: 'assistant', persona: r.agent, content: res.error, error: true, via: 'routine' });
  broadcastConvos();
  recordMetric('routine_run');
  if (why !== 'manual' || !hud?.isVisible()) notify(`⟳ ${r.name}`, res.ok ? firstLine(res.text) : res.error, () => openConv(conv.id));
  if (res.ok && r.speak) voice.speakSystem(voice.speakable(res.text), { voice: store.getSettings().voice.systemVoice });
  return { ok: res.ok, error: res.error, convId: conv.id };
}
function openConv(id) { if (convos.get(id)) { convos.select(id); broadcastConvos(); } showHud(); }

async function runBrief({ why = 'manual', speak } = {}) {
  const b = routines.brief();
  const s = store.getSettings();
  const facts = await brief.gather({ sections: b.sections, topics: b.topics, settings: s, deps: {
    weather: weatherApi, web, helper, helperCaps, mcp, cloud: cloud.state(), access: accessState(), getKey: store.getKey } });
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
const routinesState = () => routines.list();
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
ipcMain.handle('missions:start', (_e, { goal, minutes }) => {
  const s = store.getSettings();
  const p = allPersonas().find(x => x.id === 'paragon');
  const d = accessDecision(p, bindingFor(p, s), s);
  if (d.mode !== 'own') return { ok: false, error: d.mode === 'local' ? "Missions need Paragon's tools, and this local model can't use them. Give Paragon a cloud model with your own key (Settings → Agents)." : 'Missions run on Paragon, which needs your own API key (Settings → Providers).' };
  try { const st = missions.start({ goal, minutes }); broadcastConvos(); return { ok: true, state: st }; }
  catch (e) { return { ok: false, error: e.message }; }
});
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
function broadcastCloud() { broadcast('cloud:changed', cloud.state()); broadcast('personas:changed', publicPersonas()); broadcastAccess(); }
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
  routines = new Routines({ dir: store.dir(), run: runRoutine, isLocked: () => screenLocked, onChange: list => broadcast('routines:changed', list) });
  missions = new Missions({
    convos, space: missionsSpace,
    step: async ({ convId, extra, signal, onEvent, noTools }) => {
      const r = await runChat({ personaId: 'paragon', messages: toApi(convos.get(convId).messages, 'paragon'), convId, signal, systemExtra: extra, noTools, maxSteps: 10, confirm: bgConfirm('Mission'), onEvent });
      setTimeout(broadcastConvos, 0);
      return r;
    },
    onState: st => broadcast('mission:state', st),
    onDone: st => {
      broadcastConvos();
      if (st.status !== 'error') recordMetric('mission');
      notify(st.error ? 'Mission stopped' : '⚑ Mission complete', `${st.title} — ${st.error || 'your report is ready.'}`, () => openConv(st.convId));
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
  applyLoginItem();
  powerMonitor.on('lock-screen', () => { screenLocked = true; });
  powerMonitor.on('unlock-screen', () => { screenLocked = false; setTimeout(() => routines.tick(), 3000); });
  powerMonitor.on('resume', () => setTimeout(() => routines.tick(), 5000));
  refreshHelperCaps().then(syncWake);
  setTimeout(() => { if (store.getSettings().updates.auto) checkUpdates(false); }, 12000);
  setInterval(() => { if (store.getSettings().updates.auto) checkUpdates(false); }, 6 * 3600e3);
  cloud.restore().then(() => cloud.sync()).then(broadcastCloud);
  setInterval(() => cloud.ensureFresh().then(() => cloud.sync()).then(broadcastCloud), 10 * 60 * 1000);
});
app.on('second-instance', () => showHud());
app.on('window-all-closed', () => {});
app.on('will-quit', () => { globalShortcut.unregisterAll(); clipHist?.stop(); watcher?.stopAll(); group?.stopAll(); voice.stopSpeaking(); helper.kill(); mcp.closeAll(); });
