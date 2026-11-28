// 4.2.0 Media connectors: Apple Music and "Now playing", next to Spotify (Settings → Connectors → Media).
//   Mac: Apple Music (the Music app) and Spotify through AppleScript, plus media tabs in browsers (4.3.1); the buttons press
//   the keyboard's media keys for anything else that plays.
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
// 4.3.1: also a video or song playing in a browser tab (YouTube, YouTube Music, SoundCloud, Spotify or Apple Music on the
// web, Twitch, Netflix…). Browsers only tell us the tab's title, so these show as "Now playing".
const MEDIA_SITES = ['youtube.com', 'music.youtube.com', 'soundcloud.com', 'open.spotify.com', 'music.apple.com', 'twitch.tv', 'netflix.com', 'pandora.com', 'tidal.com', 'deezer.com', 'bandcamp.com', 'vimeo.com', 'audible.com', 'podcasts.apple.com'];
const BROWSERS = [['Safari', 'safari'], ['Google Chrome', 'chrome'], ['Arc', 'chrome'], ['Microsoft Edge', 'chrome'], ['Brave Browser', 'chrome']];
const MAC_TABS = BROWSERS.map(([a, kind]) => `
if application "${a}" is running then
  try
    tell application "${a}"
      repeat with w in windows
        set tb to ${kind === 'safari' ? 'current tab of w' : 'active tab of w'}
        set u to URL of tb
        if ${MEDIA_SITES.map(d => `u contains "${d}"`).join(' or ')} then
          set out to out & "${a}${SEP}tab${SEP}" & (${kind === 'safari' ? 'name' : 'title'} of tb) & "${SEP}${SEP}${SEP}0${SEP}0" & linefeed
          exit repeat
        end if
      end repeat
    end tell
  end try
end if`).join('\n');
const MAC_SCRIPT = `set out to ""\n${MAC_NOW}\n${MAC_TABS}\nreturn out`;
// 4.3.1: the keyboard's play/pause, next and previous keys, so the controls work with whatever owns "Now Playing" on the
// Mac (Podcasts, a browser tab, VLC, IINA…), not only Apple Music and Spotify. JavaScript for Automation, no helper needed.
const MEDIA_KEY = { playpause: 16, play: 16, pause: 16, next: 17, previous: 18 };
const macKeyScript = code => `ObjC.import('Cocoa'); ObjC.import('CoreGraphics');
[true, false].forEach(function (down) {
  var ev = $.NSEvent.otherEventWithTypeLocationModifierFlagsTimestampWindowNumberContextSubtypeData1Data2(14, $.NSMakePoint(0, 0), down ? 0xa00 : 0xb00, 0, 0, $(), 8, (${code} << 16) | ((down ? 0xa : 0xb) << 8), -1);
  $.CGEventPost(0, ev.CGEvent);
}); 'ok'`;
const TAB_TITLE = t => String(t || '').replace(/\s*[-–—|]\s*(YouTube Music|YouTube|SoundCloud|Spotify|Apple Music|Twitch|Netflix|Pandora|TIDAL|Deezer|Vimeo)\s*$/i, '').replace(/^\(\d+\)\s*/, '').trim();

function parseMac(text) {
  const rows = String(text || '').split(/\r?\n/).filter(Boolean).map(l => {
    const [app, state, title, artist, album, pos, dur] = l.split(SEP);
    let d = parseFloat(String(dur || '').replace(',', '.')) || 0;
    if (app === 'Spotify') d = d / 1000;   // Spotify reports milliseconds, Music seconds
    if (state === 'tab') return { app, state: 'tab', title: TAB_TITLE(title), artist: '', album: '', position: 0, duration: 0, tab: true };
    return { app: app === 'Music' ? 'Apple Music' : app, state: /play/i.test(state) ? 'playing' : /pause/i.test(state) ? 'paused' : String(state || ''), title: title || '', artist: artist || '', album: album || '', position: parseFloat(String(pos || '').replace(',', '.')) || 0, duration: d };
  });
  return rows.find(r => r.state === 'playing') || rows.find(r => r.tab) || rows[0] || null;
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
  if (n.tab) return `Now playing in ${n.app}: "${n.title}"`;
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
  // A short, friendly line after a button press: "Paused", "Playing “Song” in Spotify", "Skipped"…
  const said = (action, n) => {
    const what = n && n.title ? ` “${n.title}”${n.artist ? ' by ' + n.artist : ''}${n.app ? ' in ' + n.app : ''}` : '';
    if (action === 'next') return 'Skipped' + (what ? ' to' + what : '');
    if (action === 'previous') return 'Went back' + (what ? ' to' + what : '');
    if (n && n.state === 'paused') return 'Paused' + (n.app ? ' ' + n.app : '');
    if (n && n.state === 'playing') return 'Playing' + what;
    return action === 'pause' ? 'Paused' : action === 'play' ? 'Playing' : 'Done';
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function control(action = 'playpause', app = '') {
    if (!WIN_CTL[action]) throw new Error('Use play, pause, playpause, next or previous.');
    if (win && pwsh) {
      const r = (await pwsh(winCtl(WIN_CTL[action]), 12000)).trim(); if (r === 'none') throw new Error('Nothing is playing on this PC.');
      if (r !== 'ok') return 'The app playing didn’t take it.';
      await wait(500); return said(action, await nowPlaying().catch(() => null));
    }
    if (!mac) throw new Error('Media controls work on Mac and Windows.');
    const cmd = { play: 'play', pause: 'pause', playpause: 'playpause', next: 'next track', previous: 'previous track' }[action];
    let target = /spotify/i.test(app) ? 'Spotify' : /music/i.test(app) ? 'Music' : '';
    if (!target) { const n = await nowPlaying().catch(() => null); if (n && !n.tab && /Apple Music|Spotify/.test(n.app)) target = n.app === 'Apple Music' ? 'Music' : n.app; }
    if (target) await osa(`tell application "${esc(target)}" to ${cmd}`);
    else {   // anything else that plays (a browser tab, Podcasts, VLC…): press the media key
      try { await run('osascript', ['-l', 'JavaScript', '-e', macKeyScript(MEDIA_KEY[action])], { timeout: 6000 }); }
      catch (e) { throw new Error(/not allowed|assistive|accessib/i.test(e.message) ? 'Allow Nexus in System Settings → Privacy & Security → Accessibility to control what’s playing.' : e.message); }
    }
    await wait(450);
    return said(action, await nowPlaying().catch(() => null));
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
    try { const n = await nowPlaying(); return { ok: true, text: n ? describe(n) : (mac ? 'Works. Nothing is playing right now.' : 'Works. Nothing is playing right now.') }; }
    catch (e) { return { ok: false, error: mac && /not allowed|-1743|authoriz/i.test(e.message) ? 'macOS blocked it. Allow Nexus in System Settings → Privacy & Security → Automation (Music, Spotify).' : e.message }; }
  }
  return { nowPlaying, control, musicPlay, musicSearch, test, describe };
}

module.exports = { createMedia, parseMac, parseWin, appName, describe, SEP, MAC_SCRIPT, WIN_NOW, macKeyScript, TAB_TITLE };
