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

// ---------- Windows (3.5): the same actions through PowerShell and Windows' own tools
const psArgs = script => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(`[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'\n` + script, 'utf16le').toString('base64')];
const psq = v => "'" + String(v ?? '').replace(/'/g, "''") + "'";
const WIN_EXT = { pdf: ['.pdf'], spreadsheet: ['.xlsx', '.xls', '.csv', '.ods', '.numbers'], presentation: ['.pptx', '.ppt', '.odp', '.key'] };
const WIN_KIND = { image: 'picture', video: 'video', audio: 'music', document: 'document', folder: 'folder', app: 'program' };
// Windows Search (the index behind the Start menu), with a plain folder walk if the index isn't available
function windowsSearch({ query = '', kind = '', days = 0, root = home }) {
  const words = asStr(query).replace(/['"%*\[\]]/g, ' ').split(/\s+/).filter(w => w.length > 1).slice(0, 6);
  const where = [`SCOPE='file:${root.replace(/\\/g, '/').replace(/'/g, "''")}'`];
  for (const w of words) where.push(`(System.FileName LIKE '%${w}%' OR CONTAINS(System.Search.Contents, '"${w}"'))`);
  if (WIN_EXT[kind]) where.push('(' + WIN_EXT[kind].map(e => `System.FileExtension = '${e}'`).join(' OR ') + ')');
  else if (WIN_KIND[kind]) where.push(`System.Kind = '${WIN_KIND[kind]}'`);
  if (days > 0) where.push(`System.DateModified >= '${new Date(Date.now() - Math.min(3650, days) * 864e5).toISOString().slice(0, 19).replace('T', ' ')}'`);
  return `SELECT TOP 300 System.ItemPathDisplay FROM SYSTEMINDEX WHERE ${where.join(' AND ')} ORDER BY System.DateModified DESC`;
}
const WIN_FIND = `
try {
  $c = New-Object -ComObject ADODB.Connection; $c.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
  $rs = $c.Execute($env:NX_SQL); while (-not $rs.EOF) { $rs.Fields.Item('System.ItemPathDisplay').Value; $rs.MoveNext() }
} catch {
  $w = @($env:NX_WORDS -split ' ' | Where-Object { $_ })
  foreach ($d in @('Desktop', 'Documents', 'Downloads', 'Pictures', 'Videos', 'Music', 'OneDrive')) {
    $p = Join-Path $env:USERPROFILE $d; if (-not (Test-Path $p)) { continue }
    Get-ChildItem -Path $p -Recurse -Depth 6 -ErrorAction SilentlyContinue | Where-Object { $n = $_.Name; ($w | Where-Object { $n -like "*$_*" }).Count -eq $w.Count } | Select-Object -First 200 | ForEach-Object { $_.FullName }
  }
}`;
const WIN_AUDIO = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume { int f(); int g(); int h(); int i(); int SetMasterVolumeLevelScalar(float fLevel, Guid ctx); int j(); int GetMasterVolumeLevelScalar(out float pfLevel); int k(); int l(); int m(); int n(); int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid ctx); int GetMute(out bool pbMute); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class NxAudio {
  static IAudioEndpointVolume Vol() { var en = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator; IMMDevice dev; Marshal.ThrowExceptionForHR(en.GetDefaultAudioEndpoint(0, 1, out dev)); IAudioEndpointVolume v; var id = typeof(IAudioEndpointVolume).GUID; Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out v)); return v; }
  public static void Set(float level) { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(level, Guid.Empty)); }
  public static void Mute(bool m) { Marshal.ThrowExceptionForHR(Vol().SetMute(m, Guid.Empty)); }
}
"@
`;
const WIN_KEY = vk => `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte v, byte s, uint f, UIntPtr e);' -Name K -Namespace Nx; [Nx.K]::keybd_event(${vk}, 0, 1, [UIntPtr]::Zero); [Nx.K]::keybd_event(${vk}, 0, 3, [UIntPtr]::Zero)`;
const START_MENUS = () => [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
function walkLnk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  let list = []; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) { const p = path.join(dir, e.name); if (e.isDirectory()) walkLnk(p, depth + 1, out); else if (/\.(lnk|url|appref-ms)$/i.test(e.name)) out.push(p); }
  return out;
}

function createMac({ run = runDefault, openExternal, openPath, clipboard, notify = () => {}, speak = () => {}, platform = process.platform } = {}) {
  const mac = platform === 'darwin', win = platform === 'win32';
  const needMac = () => { if (!mac && !win) throw new Error('This only works on a Mac or a Windows PC.'); };
  const needAppleMac = () => { if (!mac) throw new Error('This only works on macOS.'); };
  const pwsh = (script, timeout = 15000, env = {}) => win ? new Promise((resolve, reject) => execFile('powershell.exe', psArgs(script), { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ...env } }, (e, so, se) => e ? reject(new Error(String(se || e.message).trim().split(/\r?\n/)[0].slice(0, 300))) : resolve(String(so)))) : Promise.reject(new Error('Windows only.'));
  const timers = new Map();

  async function findFiles({ query, kind, days, limit = 15 }) {
    needMac();
    const out = win ? await (run.win || pwsh)(WIN_FIND, 20000, { NX_SQL: windowsSearch({ query, kind, days }), NX_WORDS: asStr(query) })
      : await run('mdfind', ['-onlyin', home, spotlightQuery({ query, kind, days })], { timeout: 12000 });
    const skip = win ? /[\\/](AppData|node_modules|\.git|\$Recycle\.Bin)[\\/]/i : SKIP;
    const paths = out.split(/\r?\n/).map(s => s.trim()).filter(p => p && !skip.test(p)).slice(0, 400);
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
    if (win) {   // Start menu shortcuts first, then Store apps (Get-StartApps)
      const want = n.toLowerCase(), base = p => path.basename(p).replace(/\.(lnk|url|appref-ms)$/i, '').toLowerCase();
      const hits = START_MENUS().flatMap(d => walkLnk(d)).filter(p => base(p).includes(want) && !/uninstall/i.test(base(p)));
      hits.sort((a, b) => (base(b) === want) - (base(a) === want) || base(a).length - base(b).length);
      if (hits[0]) return hits[0];
      const out = await pwsh(`Get-StartApps | Where-Object { $_.Name -like ${psq('*' + n + '*')} } | Select-Object -First 1 | ForEach-Object { $_.Name + "\t" + $_.AppID }`).catch(() => '');
      const [nm, appId] = out.trim().split('\t'); return appId ? `shell:AppsFolder\\${appId}|${nm}` : null;
    }
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
      if (win) {
        if (app.startsWith('shell:AppsFolder')) { const [target, nm] = app.split('|'); await run('explorer.exe', [target]).catch(() => {}); return `Opened ${nm}.`; }
        const err = await openPath(app); if (err) throw new Error(err);
        return `Opened ${path.basename(app).replace(/\.(lnk|url|appref-ms)$/i, '')}.`;
      }
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
      needAppleMac();
      const out = await run('shortcuts', ['list'], { timeout: 10000 });
      const names = out.split('\n').map(s => s.trim()).filter(Boolean);
      return names.length ? `Shortcuts on this Mac (${names.length}):\n${names.slice(0, 150).join('\n')}` : 'No shortcuts found.';
    },
    async run_shortcut({ name, input }) {
      needAppleMac();
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
      if (win) {
        if (mute === true || mute === false) { await pwsh(WIN_AUDIO + `[NxAudio]::Mute($${mute})`); return mute ? 'Muted.' : 'Unmuted.'; }
        const v = Math.max(0, Math.min(100, Math.round(+level))); if (!Number.isFinite(v)) throw new Error('Give a volume from 0 to 100.');
        await pwsh(WIN_AUDIO + `[NxAudio]::Mute($false); [NxAudio]::Set(${(v / 100).toFixed(2)})`); return `Volume set to ${v}%.`;
      }
      if (mute === true || mute === false) { await run('osascript', ['-e', `set volume output muted ${mute}`]); return mute ? 'Muted.' : 'Unmuted.'; }
      const v = Math.max(0, Math.min(100, Math.round(+level)));
      if (!Number.isFinite(v)) throw new Error('Give a volume from 0 to 100.');
      await run('osascript', ['-e', `set volume output volume ${v}`]);
      return `Volume set to ${v}%.`;
    },
    async dark_mode({ on }) {
      needMac();
      if (win) {   // apps + Windows itself; 0 = dark
        const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize';
        let dark = on; if (dark === undefined) { const q = await run('reg', ['query', key, '/v', 'AppsUseLightTheme']).catch(() => ''); dark = /0x1\b/.test(q); }
        for (const v of ['AppsUseLightTheme', 'SystemUsesLightTheme']) await run('reg', ['add', key, '/v', v, '/t', 'REG_DWORD', '/d', dark ? '0' : '1', '/f']);
        return on === undefined ? `Switched to ${dark ? 'dark' : 'light'} mode.` : `Dark mode ${on ? 'on' : 'off'}.`;
      }
      const v = on === undefined ? 'not dark mode' : String(!!on);
      await run('osascript', ['-e', `tell application "System Events" to tell appearance preferences to set dark mode to ${v}`]);
      return on === undefined ? 'Switched light/dark mode.' : `Dark mode ${on ? 'on' : 'off'}.`;
    },
    async media_control({ action = 'playpause', app }) {
      needMac();
      if (win) {   // the media keys: whatever is playing (Spotify, a browser, Media Player…) responds
        const vk = { play: 0xB3, pause: 0xB3, playpause: 0xB3, next: 0xB0, previous: 0xB1 }[action];
        if (!vk) throw new Error('Use play, pause, playpause, next or previous.');
        await pwsh(WIN_KEY(vk)); return `Media: ${action}.`;
      }
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

module.exports = { createMac, spotlightQuery, KINDS, windowsSearch };
