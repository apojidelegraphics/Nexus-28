// 4.2.0 Media connectors: Apple Music and "Now playing", next to Spotify (Settings → Connectors → Media).
//   Mac: Apple Music (the Music app) and Spotify through AppleScript. Now playing = whichever of them is playing.
//   Windows: Now playing = Windows' own media controls (whatever shows in the volume flyout: Apple Music, Spotify, a
//   browser tab, Media Player…), through the system media session (GlobalSystemMediaTransportControls).
//   createMedia({ platform, run, pwsh }) → { nowPlaying(), control(action, app), musicPlay(query), musicSearch(query), test() }
'use strict';
const { execFile } = require('child_process');
const esc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const SEP = '␞';   // a separator a song title won't contain

// one AppleScript that reports both apps without opening either (a closed app is skipped)
const MAC_NOW = ['Music', 'Spotify'].map(a => `
if application "${a}" is running then
  try
    tell application "${a}"
      set st to player state as text
      if st is not "stopped" then
        set t to current track
        set d to duration of t
        set out to out & "${a}${SEP}" & st & "${SEP}" & (name of t) & "${SEP}" & (artist of t) & "${SEP}" & (album of t) & "${SEP}" & (player position as text) & "${SEP}" & (d as text) & linefeed
      end if
    end tell
  end try
end if`).join('\n');
const MAC_SCRIPT = `set out to ""\n${MAC_NOW}\nreturn out`;

function parseMac(text) {
  const rows = String(text || '').split(/\r?\n/).filter(Boolean).map(l => {
    const [app, state, title, artist, album, pos, dur] = l.split(SEP);
    let d = parseFloat(String(dur || '').replace(',', '.')) || 0;
    if (app === 'Spotify') d = d / 1000;   // Spotify reports milliseconds, Music seconds
    return { app: app === 'Music' ? 'Apple Music' : app, state: /play/i.test(state) ? 'playing' : /pause/i.test(state) ? 'paused' : String(state || ''), title: title || '', artist: artist || '', album: album || '', position: parseFloat(String(pos || '').replace(',', '.')) || 0, duration: d };
  });
  return rows.find(r => r.state === 'playing') || rows[0] || null;
}

const WIN_PRE = `Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $t) { $m = $asTask.MakeGenericMethod($t); $task = $m.Invoke($null, @($op)); $null = $task.Wait(8000); $task.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$s = $mgr.GetCurrentSession()
`;
const WIN_NOW = WIN_PRE + `if (-not $s) { '{}'; exit }
$p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$info = $s.GetPlaybackInfo(); $tl = $s.GetTimelineProperties()
[pscustomobject]@{ app = $s.SourceAppUserModelId; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; state = "$($info.PlaybackStatus)"; position = $tl.Position.TotalSeconds; duration = $tl.EndTime.TotalSeconds } | ConvertTo-Json -Compress`;
const WIN_CTL = { play: 'TryPlayAsync', pause: 'TryPauseAsync', playpause: 'TryTogglePlayPauseAsync', next: 'TrySkipNextAsync', previous: 'TrySkipPreviousAsync' };
const winCtl = m => WIN_PRE + `if (-not $s) { 'none'; exit }\n$ok = Await ($s.${m}()) ([bool])\nif ($ok) { 'ok' } else { 'no' }`;

// "Spotify.exe", "AppleInc.AppleMusicWin_nzyj5cx40ttqa!App", "Chrome" → a name people know
function appName(id) {
  const s = String(id || '');
  if (/applemusic|itunes/i.test(s)) return 'Apple Music';
  if (/spotify/i.test(s)) return 'Spotify';
  if (/chrome/i.test(s)) return 'Chrome'; if (/msedge|edge/i.test(s)) return 'Edge'; if (/firefox/i.test(s)) return 'Firefox';
  if (/zunemusic|media ?player/i.test(s)) return 'Media Player';
  return s.replace(/\.exe$/i, '').replace(/^.*[!\\]/, '').replace(/_[a-z0-9]{10,}$/i, '') || 'An app';
}
function parseWin(text) {
  let j = {}; try { j = JSON.parse(String(text || '').trim() || '{}'); } catch { return null; }
  if (!j || !j.title) return null;
  return { app: appName(j.app), state: /playing/i.test(j.state) ? 'playing' : /paused/i.test(j.state) ? 'paused' : String(j.state || '').toLowerCase(), title: j.title, artist: j.artist || '', album: j.album || '', position: +j.position || 0, duration: +j.duration || 0 };
}
const mmss = s => { s = Math.max(0, Math.round(+s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function describe(n) {
  if (!n) return 'Nothing is playing.';
  return `${n.state === 'playing' ? 'Playing' : n.state === 'paused' ? 'Paused' : 'Now playing'} in ${n.app}: "${n.title}"${n.artist ? ' by ' + n.artist : ''}${n.album ? ` (${n.album})` : ''}${n.duration ? ` · ${mmss(n.position)} / ${mmss(n.duration)}` : ''}.`;
}

function createMedia({ platform = process.platform, run, pwsh } = {}) {
  const mac = platform === 'darwin', win = platform === 'win32';
  run = run || ((cmd, args, o = {}) => new Promise((res, rej) => execFile(cmd, args, { timeout: o.timeout || 8000 }, (e, so, se) => e ? rej(new Error(String(se || e.message).trim().split('\n')[0])) : res(String(so)))));
  const osa = s => run('osascript', ['-e', s], { timeout: 8000 });
  pwsh = pwsh || (win ? (script, timeout = 12000) => new Promise((res, rej) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(`[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'\n` + script, 'utf16le').toString('base64')], { timeout, windowsHide: true }, (e, so, se) => e ? rej(new Error(String(se || e.message).replace(/#< CLIXML[\s\S]*?<S S="Error">([^<]*)[\s\S]*/, '$1').trim().split(/\r?\n/)[0].slice(0, 300))) : res(String(so)))) : null);
  async function nowPlaying() {
    if (mac) return parseMac(await osa(MAC_SCRIPT));
    if (win && pwsh) return parseWin(await pwsh(WIN_NOW, 12000));
    return null;
  }
  async function control(action = 'playpause', app = '') {
    if (!WIN_CTL[action]) throw new Error('Use play, pause, playpause, next or previous.');
    if (win && pwsh) { const r = (await pwsh(winCtl(WIN_CTL[action]), 12000)).trim(); if (r === 'none') throw new Error('Nothing is playing on this PC.'); return `${action}: ${r === 'ok' ? 'done' : 'the app didn’t take it'}.`; }
    if (!mac) throw new Error('Media controls work on Mac and Windows.');
    const cmd = { play: 'play', pause: 'pause', playpause: 'playpause', next: 'next track', previous: 'previous track' }[action];
    let target = /spotify/i.test(app) ? 'Spotify' : /music/i.test(app) ? 'Music' : '';
    if (!target) { const n = await nowPlaying().catch(() => null); target = n ? (n.app === 'Apple Music' ? 'Music' : n.app) : 'Music'; }
    await osa(`tell application "${esc(target)}" to ${cmd}`);
    return `${target === 'Music' ? 'Apple Music' : target}: ${action}.`;
  }
  // Apple Music: play something from your library by name (Mac). On Windows the Apple Music app can't be scripted, so
  // it opens the search in Apple Music instead.
  async function musicPlay(query) {
    const q = String(query || '').trim().slice(0, 200); if (!q) throw new Error('What should it play?');
    if (mac) {
      const r = (await osa(`tell application "Music"
  set hits to (search playlist "Library" for "${esc(q)}")
  if (count of hits) is 0 then return "none"
  play item 1 of hits
  return (name of item 1 of hits) & " by " & (artist of item 1 of hits)
end tell`)).trim();
      if (r === 'none') return { ok: false, text: `Nothing called "${q}" in your Apple Music library.`, url: 'https://music.apple.com/search?term=' + encodeURIComponent(q) };
      return { ok: true, text: 'Playing ' + r + ' in Apple Music.' };
    }
    return { ok: false, open: 'https://music.apple.com/search?term=' + encodeURIComponent(q), text: `Opened "${q}" in Apple Music.` };
  }
  async function musicSearch(query) {
    const q = String(query || '').trim().slice(0, 200); if (!q) throw new Error('Search for what?');
    if (!mac) return { text: 'Searching your Apple Music library works on a Mac. On Windows, Nexus can open the search in Apple Music.' };
    const r = await osa(`tell application "Music"
  set hits to (search playlist "Library" for "${esc(q)}")
  set out to ""
  repeat with i from 1 to (count of hits)
    if i > 10 then exit repeat
    set t to item i of hits
    set out to out & (name of t) & " — " & (artist of t) & " (" & (album of t) & ")" & linefeed
  end repeat
  return out
end tell`);
    return { text: r.trim() || `Nothing called "${q}" in your library.` };
  }
  async function test() {
    try { const n = await nowPlaying(); return { ok: true, text: n ? describe(n) : (mac ? 'Works. Nothing is playing in Apple Music or Spotify right now.' : 'Works. Nothing is playing right now.') }; }
    catch (e) { return { ok: false, error: mac && /not allowed|-1743|authoriz/i.test(e.message) ? 'macOS blocked it. Allow Nexus in System Settings → Privacy & Security → Automation (Music, Spotify).' : e.message }; }
  }
  return { nowPlaying, control, musicPlay, musicSearch, test, describe };
}

module.exports = { createMedia, parseMac, parseWin, appName, describe, SEP, MAC_SCRIPT, WIN_NOW };
