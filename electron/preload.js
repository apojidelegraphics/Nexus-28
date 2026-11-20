// The only things the terminal page can ask the desktop app for.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aargonDesktop', {
  platform: process.platform,
  version: () => ipcRenderer.invoke('version'),
  openPayment: url => ipcRenderer.send('pay', url),
  openReleases: () => ipcRenderer.send('releases'),
  installUpdate: () => ipcRenderer.send('install-update'),
  attention: () => ipcRenderer.send('attention'),
  onUpdate: fn => ipcRenderer.on('update', (_e, u) => fn(u)),
  onMenu: fn => ipcRenderer.on('menu', (_e, p) => fn(p))
});
