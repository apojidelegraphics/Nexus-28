// Nexus Desktop — main process: menu bar, chat HUD, Quick Ask orb, Quick Chat, hotkeys, agent + voice IPC.
const { app, BrowserWindow, Tray, Menu, Notification, globalShortcut, ipcMain, nativeImage, screen, shell, session, systemPreferences, desktopCapturer, dialog } = require('electron');
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
const hotkeys = { toggle: null, quick: null, quickChat: null, screen: null };
let escRegistered = false, enterRegistered = false;
const inflight = new Map();       // requestId -> AbortController
const listeners = new Map();      // speech session id -> webContents
const pendingConfirms = new Map(); // callId -> { resolve, requestId }
let convos = null;
let cloud = null;
let attachments = null, screenAware = null;

// Core agents (prompt + features from Nexus cloud when synced) + legacy models from Supabase.
function allPersonas() {
  const core = PERSONAS.map(p => {
    const c = cloud?.prompts[p.id];
    return { ...p, prompt: c?.prompt || p.prompt, features: features.canonical(c?.features?.length ? c.features : p.features) };
  });
  const legacy = buildLegacy(cloud?.legacy || [], core.map(p => p.handle)).map(p => ({ ...p, features: features.canonical(p.features) }));
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
  if (ev.event === 'wake') { wake.active = false; log('wake word heard'); triggerQuick(); return; }
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
function triggerQuick() {
  if (!quick) createQuick();
  pauseWake('quick');
  if (hud?.isVisible()) hud.hide();
  if (!quick.isVisible()) quick.showInactive();
  quick.webContents.send('quick:trigger');
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

// ---------------- Hotkeys + tray
const HOTKEY_FNS = { toggle: () => toggleHud(), quick: () => triggerQuick(), quickChat: () => toggleQuickChat(), screen: () => screenToQuickChat() };
const SLOT_OF = { hotkeyToggle: 'toggle', hotkeyQuick: 'quick', hotkeyQuickChat: 'quickChat', hotkeyScreen: 'screen' };
function registerHotkey(slot, accel) {
  if (hotkeys[slot]) { try { globalShortcut.unregister(hotkeys[slot]); } catch {} }
  hotkeys[slot] = null;
  try { if (accel && globalShortcut.register(accel, HOTKEY_FNS[slot])) { hotkeys[slot] = accel; return true; } } catch {}
  return false;
}
const hotkeyStatus = () => ({ toggle: !!hotkeys.toggle, quick: !!hotkeys.quick, quickChat: !!hotkeys.quickChat, screen: !!hotkeys.screen });

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
ipcMain.handle('conv:get', (_e, id) => convos.get(id));
ipcMain.handle('conv:addVersion', (_e, { convId, msg }) => { const c = convos.addVersion(convId, msg); broadcastConvos(); return c; });
ipcMain.handle('conv:setVersion', (_e, { convId, index }) => { const c = convos.setVersion(convId, index); broadcastConvos(); return c; });
ipcMain.handle('conv:new', () => { convos.create(); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:select', (_e, id) => { convos.select(id); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:delete', (_e, id) => { convos.remove(id); broadcastConvos(); return convos.active(); });
ipcMain.handle('conv:rename', (_e, { id, title }) => { convos.rename(id, title); broadcastConvos(); return true; });
ipcMain.handle('conv:clearAll', () => { convos.clearAll(); broadcastConvos(); return convos.active(); });

// ---------------- App + settings
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
  wake: wakeStatus()
}));

ipcMain.handle('settings:set', (_e, patch) => {
  for (const [k, slot] of Object.entries(SLOT_OF)) if (patch[k] !== undefined) registerHotkey(slot, patch[k]);
  if (patch.freeKey) {
    // The free key can only ever point at a free model; the fetched list is set by main, never by a renderer.
    const { models: _ignored, ...fk } = patch.freeKey;
    if (fk.model !== undefined) fk.model = freeModels.safeFreeModel(fk.model, freeModelCache || store.getSettings().freeKey?.models);
    patch = { ...patch, freeKey: fk };
  }
  const settings = store.setSettings(patch);
  setTimeout(broadcastAccess, 0);
  if (patch.wakeWord !== undefined) setTimeout(syncWake, 0);
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

ipcMain.handle('chat:send', async (e, { requestId, personaId, messages: raw, voice: voiceMode, features: requested = [], convId }) => {
  const messages = attachments.expand(raw || []);
  const s = store.getSettings();
  const all = allPersonas();
  const persona = all.find(p => p.id === personaId) || all[0];
  const binding = bindingFor(persona, s);
  const decision = accessDecision(persona, binding, s, all);
  if (decision.mode === 'blocked') return { ok: false, error: decision.reason, blocked: true };
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
  const prov = providers.PROVIDERS[route.provider] || {};
  const ctrl = new AbortController();
  inflight.set(requestId, ctrl);
  const wc = e.sender;
  const send = (ch, d) => { if (!wc.isDestroyed()) wc.send(ch, { requestId, ...d }); };

  const toolset = prov.noTools ? { tools: [], routes: {}, labels: [] }
    : tools.buildToolset({ agentic: persona.agentic, settings: s, helperBuilt: !!helperCaps.eventkit, mcp });
  // @Seek researches the web for that message, even on chat-only agents (read-only tools).
  if (!prov.noTools && s.web.enabled !== false && activeFeatures.some(id => features.lookup(id)?.web) && !toolset.labels.includes('web_search')) {
    const extra = tools.buildToolset({ agentic: false, settings: { ...s, web: { ...s.web, chatAgents: true }, weather: { enabled: false } }, helperBuilt: false });
    toolset.tools.push(...extra.tools); toolset.labels.push(...extra.labels);
  }
  let featureBlock = features.featurePrompt(activeFeatures);
  if (activeFeatures.includes('Echo')) featureBlock += echoDigest(convId || convos.active()?.id);
  const confirm = ({ callId, label, detail, tool }) => new Promise(resolve => {
    const timer = setTimeout(() => { pendingConfirms.delete(callId); resolve(false); }, 5 * 60 * 1000);
    pendingConfirms.set(callId, { requestId, wc, resolve: v => { clearTimeout(timer); pendingConfirms.delete(callId); resolve(v); } });
    send('agent:confirm', { callId, label, detail, tool, persona: persona.id });
  });

  try {
    const result = await runAgent({
      chat: providers.chat,
      request: {
        provider: route.provider, model: route.model, baseUrl: route.baseUrl,
        key: route.key, appleFM,
        system: systemPromptFor(persona, { voice: !!voiceMode, tools: toolset.labels, omnibrief: s.omnibrief }) + featureBlock
      },
      messages, tools: toolset.tools, routes: toolset.routes,
      exec: (name, args, { routes, signal }) => tools.execute(name, args, { settings: s, getKey: store.getKey, helper, mcp, routes, signal, screen: screenAware }),
      describe: tools.describe, needsConfirm: tools.needsConfirm, confirm,
      signal: ctrl.signal,
      onText: t => send('chat:chunk', { text: t }),
      onEvent: ev => send('chat:event', ev.type === 'status' && ev.status === 'connecting' ? { ...ev, label: prov.label } : ev)
    });
    for (const a of result.activity) if (a.tool !== 'system') store.logAction({ persona: persona.id, tool: a.tool, label: a.label, detail: a.detail, status: a.status, summary: a.summary || '' });
    const activity = result.activity.map(a => ({ tool: a.tool, label: a.label, detail: a.detail, status: a.status, summary: a.summary || '', sources: (a.sources || []).slice(0, 5) }));
    if (ctrl.signal.aborted) return { ok: true, aborted: true, text: result.text, activity, images: result.images, sources: result.sources, cards: result.cards, attachments: result.attachments };
    let usage = null;
    if (decision.mode === 'free' && result.text) { usage = { used: await recordUsage(persona), limit: decision.limit === Infinity ? null : decision.limit, tier: decision.tier.label }; broadcastAccess(); }
    return { ok: true, text: result.text, provider: route.provider, model: (decision.mode === 'free' ? 'Nexus free key · ' : '') + (route.model || prov.defaultModel), freeKey: decision.mode === 'free', usage, activity, images: result.images, sources: result.sources, cards: result.cards, attachments: result.attachments, features: activeFeatures, rejected };
  } catch (err) {
    if (err.name === 'AbortError' || ctrl.signal.aborted) return { ok: true, aborted: true };
    return { ok: false, error: err.message };
  } finally {
    inflight.delete(requestId);
    for (const [id, p] of pendingConfirms) if (p.requestId === requestId) p.resolve(false);
  }
});
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
ipcMain.handle('voice:speak', async (_e, { text, purpose }) => {
  const s = { ...store.getSettings().voice };
  if (purpose === 'read' && s.readAloud !== 'reply') s.tts = 'system'; // read-aloud → macOS System Voice (Siri)
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
ipcMain.handle('screen:capture', (_e, opts) => attOk(() => screenAware.capture(opts || {})));
ipcMain.handle('screen:permission', () => screenAware.permission());
ipcMain.handle('screen:openPermission', () => { screenAware.openPermission(); return true; });
ipcMain.handle('quick:calc', (_e, text) => quickcalc.quick(text));

let mdRender = null;
function renderMarkdown(md) {
  if (!mdRender) { const ctx = { window: {} }; require('vm').runInNewContext(require('fs').readFileSync(path.join(__dirname, 'renderer', 'markdown.js'), 'utf8'), ctx); mdRender = ctx.window.NexusMarkdown.render; }
  return mdRender(md);
}
ipcMain.handle('export:chat', async (e, { convId, format }) => {
  const conv = convos.get(convId) || convos.active();
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
  try { const r = await cloud.redeem(orderId); broadcastCloud(); return { ok: true, result: r, state: cloud.state() }; }
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
  attachments = new Attachments({ dir: store.dir(), nativeImage, helper });
  screenAware = createScreen({ desktopCapturer, systemPreferences, shell, helper, attachments });
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
  showHud();
  setTimeout(connectEnabled, 1500);
  refreshHelperCaps().then(syncWake);
  setTimeout(() => { if (store.getSettings().updates.auto) checkUpdates(false); }, 12000);
  setInterval(() => { if (store.getSettings().updates.auto) checkUpdates(false); }, 6 * 3600e3);
  cloud.restore().then(() => cloud.sync()).then(broadcastCloud);
  setInterval(() => cloud.ensureFresh().then(() => cloud.sync()).then(broadcastCloud), 10 * 60 * 1000);
});
app.on('second-instance', () => showHud());
app.on('window-all-closed', () => {});
app.on('will-quit', () => { globalShortcut.unregisterAll(); voice.stopSpeaking(); helper.kill(); mcp.closeAll(); });
