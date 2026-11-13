// Screen awareness — only when the user asks. Captures the front window (not Nexus's own), its app name
// and title, and the text in it (read on this Mac by NexusCore's Vision OCR). Nothing is kept except the
// attachment the user sends with a message.
//
// deps: { desktopCapturer, systemPreferences, shell, helper, attachments, platform, excludePids }

function createScreen({ desktopCapturer, systemPreferences, shell, helper, attachments, platform = process.platform, excludePids = [process.pid] }) {
  const permission = () => {
    if (platform !== 'darwin') return 'granted';
    try { return systemPreferences.getMediaAccessStatus('screen'); } catch { return 'unknown'; }
  };
  const openPermission = () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');

  async function frontWindow() {
    if (!helper?.available()) return null;
    try {
      const ev = await helper.request({ cmd: 'front_window', id: 'fw-' + Math.random().toString(36).slice(2), exclude: excludePids }, ['result'], 4000);
      return ev.data || null;
    } catch { return null; }
  }

  // mode: 'window' (front window, default) | 'screen' (whole main display)
  async function capture({ mode = 'window' } = {}) {
    const perm = permission();
    if (perm === 'denied' || perm === 'restricted') {
      const err = new Error("Nexus needs Screen Recording permission to see your screen. Turn on Nexus '28 in System Settings → Privacy & Security → Screen & System Audio Recording, then try again.");
      err.permission = true; throw err;
    }
    const win = mode === 'window' ? await frontWindow() : null;
    const types = win ? ['window'] : ['screen'];
    const sources = await desktopCapturer.getSources({ types, thumbnailSize: { width: 1800, height: 1800 }, fetchWindowIcons: false });
    let src = win ? sources.find(s => s.id.startsWith(`window:${win.windowId}:`)) : null;
    if (!src) src = (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1800, height: 1800 } }))[0];
    if (!src || src.thumbnail.isEmpty()) {
      const err = new Error("Nexus couldn't capture the screen. Check Screen Recording permission for Nexus '28 in System Settings → Privacy & Security, then try again.");
      err.permission = true; throw err;
    }
    const app = win?.app || (src.id.startsWith('screen:') ? 'Screen' : '');
    const title = win?.title || (src.id.startsWith('window:') ? src.name : '');
    const name = `${app || 'Screen'}${title ? ' — ' + title : ''}`.slice(0, 120);
    return attachments.fromImage(src.thumbnail.toPNG(), { name: name + '.png', kind: 'screen', extra: { app, title, mode: win ? 'window' : 'screen' } });
  }

  return { capture, permission, openPermission, frontWindow };
}

module.exports = { createScreen };
