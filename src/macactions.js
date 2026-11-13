// Things Paragon can do on your Mac (it asks first for anything that changes something), and the
// Spotlight file finder. Everything runs through macOS's own command-line tools.
//   createMac({ run, openExternal, openPath, clipboard, notify, speak, platform }) — run(cmd, args) → Promise<stdout>
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const runDefault = (cmd, args, { timeout = 15000 } = {}) => new Promise((resolve, reject) =>
  execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => err ? reject(new Error((stderr || err.message).toString().trim().slice(0, 300))) : resolve(String(stdout))));
const asStr = s => String(s ?? '').trim();
const esc = s => asStr(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const home = os.homedir();

// Spotlight query for find_files
const KINDS = {
  pdf: 'kMDItemContentType == "com.adobe.pdf"',
  image: 'kMDItemContentTypeTree == "public.image"',
  document: '(kMDItemContentTypeTree == "public.text" || kMDItemContentTypeTree == "public.composite-content" || kMDItemContentType == "com.microsoft.word.doc" || kMDItemContentType == "org.openxmlformats.wordprocessingml.document")',
  spreadsheet: '(kMDItemContentType == "com.microsoft.excel.xls" || kMDItemContentType == "org.openxmlformats.spreadsheetml.sheet" || kMDItemContentType == "public.comma-separated-values-text" || kMDItemContentType == "com.apple.iwork.numbers.numbers")',
  presentation: '(kMDItemContentType == "com.microsoft.powerpoint.ppt" || kMDItemContentType == "org.openxmlformats.presentationml.presentation" || kMDItemContentType == "com.apple.iwork.keynote.key")',
  video: 'kMDItemContentTypeTree == "public.movie"',
  audio: 'kMDItemContentTypeTree == "public.audio"',
  folder: 'kMDItemContentType == "public.folder"',
  app: 'kMDItemContentType == "com.apple.application-bundle"'
};
function spotlightQuery({ query = '', kind = '', days = 0 }) {
  const words = asStr(query).replace(/["*\\]/g, ' ').split(/\s+/).filter(w => w.length > 1).slice(0, 6);
  const parts = [];
  if (words.length) parts.push('(' + words.map(w => `(kMDItemDisplayName == "*${w}*"cd || kMDItemTextContent == "${w}"cd)`).join(' && ') + ')');
  if (KINDS[kind]) parts.push(KINDS[kind]);
  if (days > 0) parts.push(`kMDItemFSContentChangeDate >= $time.today(-${Math.min(3650, Math.round(days))})`);
  return parts.join(' && ') || 'kMDItemFSName == "*"';
}
const SKIP = /\/(Library|\.Trash|node_modules|\.git|\.cache|Caches)\//;

function createMac({ run = runDefault, openExternal, openPath, clipboard, notify = () => {}, speak = () => {}, platform = process.platform } = {}) {
  const mac = platform === 'darwin';
  const needMac = () => { if (!mac) throw new Error('This only works on macOS.'); };
  const timers = new Map();

  async function findFiles({ query, kind, days, limit = 15 }) {
    needMac();
    const q = spotlightQuery({ query, kind, days });
    const out = await run('mdfind', ['-onlyin', home, q], { timeout: 12000 });
    const paths = out.split('\n').map(s => s.trim()).filter(p => p && !SKIP.test(p)).slice(0, 400);
    const rows = [];
    for (const p of paths) {
      try { const st = fs.statSync(p); rows.push({ path: p, name: path.basename(p), size: st.size, modified: st.mtimeMs, dir: st.isDirectory() }); } catch {}
    }
    // Name matches first, then most recently changed.
    const words = asStr(query).toLowerCase().split(/\s+/).filter(Boolean);
    const nameHit = r => words.filter(w => r.name.toLowerCase().includes(w)).length;
    rows.sort((a, b) => nameHit(b) - nameHit(a) || b.modified - a.modified);
    return rows.slice(0, limit);
  }
  async function findApp(name) {
    const n = asStr(name).replace(/\.app$/i, '');
    if (!n) throw new Error('Which app?');
    const out = await run('mdfind', [`kMDItemContentType == "com.apple.application-bundle" && kMDItemDisplayName == "*${n.replace(/["*\\]/g, '')}*"cd`], { timeout: 8000 }).catch(() => '');
    const apps = out.split('\n').map(s => s.trim()).filter(p => /\.app$/.test(p) && !SKIP.test(p));
    const score = p => { const b = path.basename(p, '.app').toLowerCase(); return (b === n.toLowerCase() ? 100 : 0) + (b.startsWith(n.toLowerCase()) ? 20 : 0) + (/^\/(System\/)?Applications\//.test(p) ? 10 : 0) - b.length * .1; };
    apps.sort((a, b) => score(b) - score(a));
    return apps[0] || null;
  }

  const actions = {
    async open_app({ name }) {
      needMac();
      const app = await findApp(name);
      if (!app) throw new Error(`I couldn't find an app called "${name}".`);
      await run('open', [app]);
      return `Opened ${path.basename(app, '.app')}.`;
    },
    async open_url({ url }) {
      if (!/^https?:\/\//i.test(asStr(url))) throw new Error('Only http(s) links can be opened.');
      await openExternal(url);
      return `Opened ${url}.`;
    },
    async open_file({ path: p }) {
      const full = path.resolve(asStr(p).replace(/^~(?=\/|$)/, home));
      if (!fs.existsSync(full)) throw new Error(`No file at ${p}.`);
      const err = await openPath(full);
      if (err) throw new Error(err);
      return `Opened ${path.basename(full)}.`;
    },
    async list_shortcuts() {
      needMac();
      const out = await run('shortcuts', ['list'], { timeout: 10000 });
      const names = out.split('\n').map(s => s.trim()).filter(Boolean);
      return names.length ? `Shortcuts on this Mac (${names.length}):\n${names.slice(0, 150).join('\n')}` : 'No shortcuts found.';
    },
    async run_shortcut({ name, input }) {
      needMac();
      const args = ['run', asStr(name)];
      let tmp = null;
      if (input) { tmp = path.join(os.tmpdir(), `nexus-sc-${Date.now()}.txt`); fs.writeFileSync(tmp, String(input)); args.push('--input-path', tmp); }
      try {
        const out = await run('shortcuts', args, { timeout: 60000 });
        return `Ran the "${name}" shortcut.${out.trim() ? `\nOutput: ${out.trim().slice(0, 2000)}` : ''}`;
      } finally { if (tmp) try { fs.unlinkSync(tmp); } catch {} }
    },
    async set_volume({ level, mute }) {
      needMac();
      if (mute === true || mute === false) { await run('osascript', ['-e', `set volume output muted ${mute}`]); return mute ? 'Muted.' : 'Unmuted.'; }
      const v = Math.max(0, Math.min(100, Math.round(+level)));
      if (!Number.isFinite(v)) throw new Error('Give a volume from 0 to 100.');
      await run('osascript', ['-e', `set volume output volume ${v}`]);
      return `Volume set to ${v}%.`;
    },
    async dark_mode({ on }) {
      needMac();
      const v = on === undefined ? 'not dark mode' : String(!!on);
      await run('osascript', ['-e', `tell application "System Events" to tell appearance preferences to set dark mode to ${v}`]);
      return on === undefined ? 'Switched light/dark mode.' : `Dark mode ${on ? 'on' : 'off'}.`;
    },
    async media_control({ action = 'playpause', app }) {
      needMac();
      const cmd = { play: 'play', pause: 'pause', playpause: 'playpause', next: 'next track', previous: 'previous track' }[action];
      if (!cmd) throw new Error('Use play, pause, playpause, next or previous.');
      let target = app;
      if (!target) {
        for (const a of ['Spotify', 'Music']) {
          const running = (await run('osascript', ['-e', `application "${a}" is running`]).catch(() => 'false')).trim() === 'true';
          if (running) { target = a; break; }
        }
      }
      if (!target) throw new Error('Neither Spotify nor Music is open.');
      await run('osascript', ['-e', `tell application "${esc(target)}" to ${cmd}`]);
      return `${target}: ${action}.`;
    },
    async set_timer({ minutes, label }) {
      const m = +minutes;
      if (!(m > 0 && m <= 24 * 60)) throw new Error('Timers can be 1 second to 24 hours (minutes can be decimals).');
      const id = 't' + Date.now().toString(36);
      const name = asStr(label) || `${m} minute timer`;
      const at = Date.now() + m * 60000;
      const handle = setTimeout(() => { timers.delete(id); notify(`⏱ ${name}`, "Time's up."); speak(`Timer done: ${name}`); }, m * 60000);
      timers.set(id, { id, name, at, handle });
      return `Timer set: ${name}, done at ${new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`;
    },
    async copy_to_clipboard({ text }) {
      await clipboard.writeText(String(text ?? ''));
      return `Copied ${String(text ?? '').length} characters to the clipboard.`;
    }
  };
  const listTimers = () => [...timers.values()].map(({ id, name, at }) => ({ id, name, at }));
  const cancelTimer = id => { const t = timers.get(id); if (t) { clearTimeout(t.handle); timers.delete(id); } return !!t; };
  return { findFiles, findApp, actions, listTimers, cancelTimer };
}

module.exports = { createMac, spotlightQuery, KINDS };
