// aARgon3 for Mac and Windows: the staff terminal as its own app. Its files ship inside the app and load from
// aargon3://app (a private, secure origin), so it opens instantly and doesn't depend on GitHub Pages. Sign-in, the
// clock and sales work exactly like the web terminal, through the same Supabase "staff" function.
const { app, BrowserWindow, Menu, protocol, net, shell, ipcMain, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { resolveFile, newer } = require('./paths');

const ROOT = path.join(__dirname, '..');
const MAC = process.platform === 'darwin', WIN = process.platform === 'win32';
if (WIN) app.setAppUserModelId(app.isPackaged ? 'com.apojidelegraphics.aargon3' : process.execPath);
const HOME = 'aargon3://app/terminal/index.html';
const SITE = 'https://apojidelegraphics.github.io/aArgon3/';
const RELEASES = 'https://github.com/apojidelegraphics/aArgon3/releases/latest';
const BG = '#040b14';
protocol.registerSchemesAsPrivileged([{ scheme: 'aargon3', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
let win = null;

function serve() {
  protocol.handle('aargon3', req => {
    const u = new URL(req.url);
    if (u.host !== 'app') return new Response('Not found', { status: 404 });
    if (process.env.A3_TEST_MOCK && u.pathname === '/__mock.js') return net.fetch(pathToFileURL(process.env.A3_TEST_MOCK).toString());
    const file = resolveFile(ROOT, u.pathname);
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Not found', { status: 404 });
  });
  // tests only: swap the CDN scripts (Supabase, QR) for a local stand-in
  if (process.env.A3_TEST_MOCK) session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://cdn.jsdelivr.net/npm/@supabase/*'] }, (d, cb) => cb({ redirectURL: 'aargon3://app/__mock.js' }));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 840, minWidth: 380, minHeight: 560, show: false, title: 'aARgon3', backgroundColor: BG,
    ...(MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: BG, symbolColor: '#e4f7ff', height: 68 }, icon: path.join(ROOT, 'build', 'icon.png'), autoHideMenuBar: true }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true }
  });
  win.loadURL(HOME);
  win.once('ready-to-show', () => win.show());
  // Links (the store, Stripe, GitHub) open in your browser; the app itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('aargon3://app/')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
  setTimeout(() => checkUpdates(false), 4000);
}

// "Pay here": Stripe Checkout in its own window, so a customer can pay on this computer. It closes by itself once
// Stripe sends them to the thank-you page; the terminal notices the payment on its own.
let payWin = null;
function openPayment(url) {
  if (!/^https:\/\/checkout\.stripe\.com\//.test(url)) return;
  if (payWin) payWin.close();
  payWin = new BrowserWindow({ width: 520, height: 820, parent: win || undefined, title: 'Pay with Stripe', backgroundColor: '#ffffff', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'stripe-checkout' } });
  payWin.loadURL(url);
  const done = u => { if (u.startsWith(SITE + 'success.html')) setTimeout(() => payWin?.close(), 1500); };
  payWin.webContents.on('did-navigate', (_e, u) => done(u));
  payWin.webContents.setWindowOpenHandler(({ url: u }) => { if (/^https?:/.test(u)) shell.openExternal(u); return { action: 'deny' }; });
  payWin.on('closed', () => { payWin = null; });
}

// New versions.
//   Windows: updates itself. electron-updater reads latest.yml from the GitHub Release, downloads the new installer in the
//   background, and installs it when you restart (or the next time you quit). You get a note when it's ready.
//   Mac: an unsigned app can't replace itself, so it's a note in the terminal with a download link.
let updater = null, updateReady = null, manualCheck = false;
function setupWindowsUpdates() {
  if (!WIN || !app.isPackaged) return false;
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch { return false; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', i => win?.webContents.send('update', { downloading: i.version }));
  updater.on('update-not-available', () => { if (manualCheck) win?.webContents.send('update', { current: app.getVersion() }); manualCheck = false; });
  updater.on('update-downloaded', i => { updateReady = i.version; win?.webContents.send('update', { ready: i.version }); });
  updater.on('error', e => { console.error('[update]', e?.message || e); if (manualCheck) checkRelease(true); manualCheck = false; });
  setInterval(() => updater.checkForUpdates().catch(() => {}), 4 * 3600e3);   // and every 4 hours while it's open
  return true;
}
function checkUpdates(manual) {
  if (updater) {
    if (updateReady) return win?.webContents.send('update', { ready: updateReady });
    manualCheck = manual;
    return updater.checkForUpdates().catch(() => { if (manual) checkRelease(true); });
  }
  return checkRelease(manual);
}
async function checkRelease(manual) {
  try {
    const res = await net.fetch('https://api.github.com/repos/apojidelegraphics/aArgon3/releases/latest', { headers: { 'User-Agent': 'aARgon3' } });
    if (!res.ok) throw new Error(res.status);
    const r = await res.json();
    if (newer(r.tag_name, app.getVersion())) win?.webContents.send('update', { latest: r.tag_name.replace(/^v/, ''), url: r.html_url || RELEASES });
    else if (manual) win?.webContents.send('update', { current: app.getVersion() });
  } catch (e) { if (manual) shell.openExternal(RELEASES); }
}

ipcMain.handle('version', () => app.getVersion());
ipcMain.on('pay', (_e, url) => openPayment(String(url || '')));
ipcMain.on('releases', () => shell.openExternal(RELEASES));
ipcMain.on('install-update', () => { if (updater && updateReady) setImmediate(() => updater.quitAndInstall(true, true)); });
ipcMain.on('attention', () => { if (win && !win.isFocused()) { if (MAC) app.dock?.bounce('informational'); else win.flashFrame(true); } });

function menu() {
  const page = p => () => { if (!win) createWindow(); win.show(); win.webContents.send('menu', p); };
  const cmd = MAC ? 'Cmd' : 'Ctrl';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(MAC ? [{ label: 'aARgon3', submenu: [{ role: 'about' }, { label: 'Check for Updates…', click: () => checkUpdates(true) }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Terminal', submenu: [
      { label: 'Today', accelerator: `${cmd}+1`, click: page('today') }, { label: 'New Sale', accelerator: `${cmd}+N`, click: page('sale') },
      { label: 'Orders', accelerator: `${cmd}+F`, click: page('orders') }, { label: 'Catalog', click: page('catalog') },
      { label: 'Schedule', click: page('schedule') }, { label: 'Timesheet', accelerator: `${cmd}+T`, click: page('time') }, { label: 'Sales', click: page('sales') },
      { label: 'Profile', accelerator: `${cmd}+,`, click: page('profile') },
      { type: 'separator' }, { label: 'Sign Out', click: page('signout') }, ...(MAC ? [] : [{ type: 'separator' }, { label: 'Check for Updates…', click: () => checkUpdates(true) }, { role: 'quit' }])] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Open the aARgon3 Store', click: () => shell.openExternal(SITE) }, { label: 'Terminal on the Web', click: () => shell.openExternal(SITE + 'terminal/') }, { label: 'Releases', click: () => shell.openExternal(RELEASES) }] }
  ]));
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.whenReady().then(() => {
  serve(); setupWindowsUpdates(); menu(); createWindow();
  if (MAC) app.setAboutPanelOptions({ applicationName: 'aARgon3', copyright: '© 2026 Apoji Delegraphics. All rights reserved.' });
  app.on('activate', () => { if (!win) createWindow(); else win.show(); });
});
app.on('window-all-closed', () => { if (!MAC) app.quit(); });

