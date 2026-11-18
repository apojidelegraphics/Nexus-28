// NexusCore for Windows (v3.5): the same JSON-lines protocol as the Mac's Swift helper (native/NexusCore.swift), done
// with what Windows already has, through PowerShell. Runs as Node inside Electron (ELECTRON_RUN_AS_NODE=1), so nothing
// extra is installed.
//   voice + "Hey Nexus"  → System.Speech (on-device)        text in pictures → Windows.Media.Ocr (on-device)
//   PDFs                 → Windows.Data.Pdf pages + OCR       the front window → user32 (EnumWindows, z-order)
//   highlighted text     → Ctrl+C, then the clipboard is put back
//   calendar + reminders → Outlook (classic) if it's installed (calendar items + tasks)
// Not on Windows: Apple's on-device model, and the highlight orb's selection watcher.
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = o => { try { process.stdout.write(JSON.stringify(o) + '\n'); } catch {} };
const enc = s => Buffer.from(s, 'utf16le').toString('base64');
const PRE = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue';
function Out-Nx($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 6)); [Console]::Out.Flush() }
`;
// One PowerShell run → the last JSON line it prints. Arguments go in as JSON through an environment variable.
function ps(script, args = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(PRE + `$A = $env:NX_ARGS | ConvertFrom-Json\n` + script)],
      { windowsHide: true, env: { ...process.env, NX_ARGS: JSON.stringify(args) } });
    let so = '', se = '';
    const t = setTimeout(() => { try { p.kill(); } catch {} reject(new Error('Windows took too long.')); }, timeout);
    p.stdout.on('data', d => so += d); p.stderr.on('data', d => se += d);
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('exit', code => {
      clearTimeout(t);
      const last = so.trim().split(/\r?\n/).filter(Boolean).pop();
      let j = null; try { j = JSON.parse(last); } catch {}
      if (j && j.error) return reject(new Error(j.error));
      if (code !== 0 && !j) return reject(new Error((se.trim().split(/\r?\n/).find(l => l && !/^\s*(At line|\+|CategoryInfo|FullyQualified)/.test(l)) || 'PowerShell failed').slice(0, 220)));
      resolve(j);
    });
  });
}

// ---------- WinRT helpers (OCR, PDF) for Windows PowerShell 5.1
const WINRT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$__asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $__asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait() | Out-Null; $task.Result }
$__asAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
function AwaitAction($op) { $task = $__asAction.Invoke($null, @($op)); $task.Wait() | Out-Null }
[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics,ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime] | Out-Null
$__eng = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($__eng -eq $null) { throw "Windows text recognition isn't installed for your language (Settings > Time & language > Language)." }
function Ocr-Stream($stream) {
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $max = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
  $k = [Math]::Min(1.0, $max / [Math]::Max($dec.PixelWidth, $dec.PixelHeight))
  $tr = New-Object Windows.Graphics.Imaging.BitmapTransform
  $tr.ScaledWidth = [uint32][Math]::Floor($dec.PixelWidth * $k); $tr.ScaledHeight = [uint32][Math]::Floor($dec.PixelHeight * $k)
  $bmp = Await ($dec.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied, $tr, [Windows.Graphics.Imaging.ExifOrientationMode]::RespectExifOrientation, [Windows.Graphics.Imaging.ColorManagementMode]::DoNotColorManage)) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($__eng.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  ($res.Lines | ForEach-Object { $_.Text }) -join "\`n"
}
function Open-File($p) {
  $f = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p)) ([Windows.Storage.StorageFile])
  Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
}
`;
const OCR = WINRT + `$s = Open-File $A.path; Out-Nx @{ text = (Ocr-Stream $s) }`;
const PDF = WINRT + `
[Windows.Data.Pdf.PdfDocument,Windows.Data.Pdf,ContentType=WindowsRuntime] | Out-Null
$f = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($A.path)) ([Windows.Storage.StorageFile])
$doc = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($f)) ([Windows.Data.Pdf.PdfDocument])
$n = [int]$doc.PageCount; $parts = @()
for ($i = 0; $i -lt [Math]::Min($n, 40); $i++) {
  $page = $doc.GetPage([uint32]$i)
  $ms = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $opt = New-Object Windows.Data.Pdf.PdfPageRenderOptions; $opt.DestinationWidth = [uint32]1800
  AwaitAction ($page.RenderToStreamAsync($ms, $opt))
  $parts += (Ocr-Stream $ms)
  $page.Dispose()
}
Out-Nx @{ text = ($parts -join "\`n\`n"); pages = $n }`;

// ---------- the front window (top of the z-order, skipping Nexus's own windows)
const WIN32 = `
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class NxWin {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);
  public struct RECT { public int L, T, R, B; }
  public static List<string> Top(int[] skip) {
    var outp = new List<string>(); var sk = new HashSet<int>(skip);
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || IsIconic(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (sk.Contains((int)pid)) return true;
      RECT r; GetWindowRect(h, out r); int w = r.R - r.L, hh = r.B - r.T; if (w < 80 || hh < 60) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, 512); if (sb.Length == 0) return true;
      outp.Add(h.ToInt64() + "\\t" + pid + "\\t" + w + "\\t" + hh + "\\t" + sb.ToString());
      return outp.Count < 3;
    }, IntPtr.Zero);
    return outp;
  }
  public static bool ModsDown() { foreach (var k in new[] { 0x10, 0x11, 0x12, 0x5B, 0x5C }) if ((GetAsyncKeyState(k) & 0x8000) != 0) return true; return false; }
}
"@
`;
const FRONT = WIN32 + `
$rows = [NxWin]::Top([int[]]@($A.exclude))
if (-not $rows -or $rows.Count -eq 0) { Out-Nx @{ none = $true }; exit }
$c = $rows[0].Split("\`t", 5); $procId = [int]$c[1]; $app = ''
try { $p = Get-Process -Id $procId; $app = $p.MainModule.FileVersionInfo.FileDescription; if (-not $app) { $app = $p.ProcessName } } catch { $app = '' }
Out-Nx @{ windowId = [int64]$c[0]; pid = $procId; width = [int]$c[2]; height = [int]$c[3]; title = $c[4]; app = $app }`;

// ---------- highlighted text: wait for the hotkey's keys to come up, Ctrl+C, read, put the clipboard back
const SELECTED = WIN32 + `
Add-Type -AssemblyName System.Windows.Forms
for ($i = 0; $i -lt 30 -and [NxWin]::ModsDown(); $i++) { Start-Sleep -Milliseconds 50 }
$had = [System.Windows.Forms.Clipboard]::ContainsText(); $old = if ($had) { [System.Windows.Forms.Clipboard]::GetText() } else { '' }
$mark = '__nexus_' + [guid]::NewGuid().ToString('N')
[System.Windows.Forms.Clipboard]::SetText($mark)
[System.Windows.Forms.SendKeys]::SendWait('^c')
$t = ''
for ($i = 0; $i -lt 12; $i++) { Start-Sleep -Milliseconds 60; if ([System.Windows.Forms.Clipboard]::ContainsText()) { $t = [System.Windows.Forms.Clipboard]::GetText(); if ($t -ne $mark) { break } } }
if ($t -eq $mark) { $t = '' }
if ($had) { [System.Windows.Forms.Clipboard]::SetText($old) } else { [System.Windows.Forms.Clipboard]::Clear() }
$app = ''; try { $rows = [NxWin]::Top([int[]]@($A.exclude)); if ($rows) { $c = $rows[0].Split("\`t", 5); $app = (Get-Process -Id ([int]$c[1])).ProcessName } } catch {}
Out-Nx @{ text = $t; app = $app; method = 'copy' }`;

// ---------- Outlook (classic): calendar + tasks, as Calendar / Reminders
const OUTLOOK = `
try { $ol = New-Object -ComObject Outlook.Application } catch { throw "Calendar and reminders on Windows use Outlook. Install or open Outlook (classic) and try again." }
$ns = $ol.GetNamespace('MAPI')
function FromTs($n) { [DateTimeOffset]::FromUnixTimeSeconds([int64]$n).LocalDateTime }
function Ts($d) { if ($d -eq $null -or $d.Year -ge 4500) { $null } else { [int64]([DateTimeOffset]$d).ToUnixTimeSeconds() } }
`;
const CAL = {
  cal_list: OUTLOOK + `
$s = if ($A.start) { FromTs $A.start } else { Get-Date }; $e = if ($A.end) { FromTs $A.end } else { $s.AddDays(7) }
$cal = $ns.GetDefaultFolder(9); $items = $cal.Items; $items.IncludeRecurrences = $true; $items.Sort('[Start]')
$f = "[Start] < '" + $e.ToString('g') + "' AND [End] > '" + $s.ToString('g') + "'"
$rows = @(); foreach ($i in $items.Restrict($f)) { if ($rows.Count -ge 100) { break }
  $rows += @{ title = $i.Subject; start = (Ts $i.Start); end = (Ts $i.End); allDay = [bool]$i.AllDayEvent; location = "$($i.Location)"; calendar = $cal.Name; notes = ("$($i.Body)".Substring(0, [Math]::Min(300, "$($i.Body)".Length))) } }
Out-Nx @{ list = $rows }`,
  cal_create: OUTLOOK + `
$a = $ol.CreateItem(1); $a.Subject = if ($A.title) { $A.title } else { 'New event' }
$s = if ($A.start) { FromTs $A.start } else { Get-Date }; $a.Start = $s; $a.End = if ($A.end) { FromTs $A.end } else { $s.AddHours(1) }
$a.AllDayEvent = [bool]$A.allDay; if ($A.location) { $a.Location = $A.location }; if ($A.notes) { $a.Body = $A.notes }; $a.Save()
Out-Nx @{ created = $true; title = $a.Subject; start = (Ts $a.Start); end = (Ts $a.End); calendar = 'Outlook'; id = $a.EntryID }`,
  rem_list: OUTLOOK + `
$tasks = $ns.GetDefaultFolder(13).Items; $rows = @()
foreach ($t in $tasks.Restrict('[Complete] = False')) { if ($rows.Count -ge 100) { break }
  $rows += @{ title = $t.Subject; due = (Ts $t.DueDate); list = 'Outlook Tasks'; notes = ("$($t.Body)".Substring(0, [Math]::Min(300, "$($t.Body)".Length))) } }
Out-Nx @{ list = $rows }`,
  rem_create: OUTLOOK + `
$t = $ol.CreateItem(3); $t.Subject = if ($A.title) { $A.title } else { 'Reminder' }; if ($A.notes) { $t.Body = $A.notes }
if ($A.due) { $d = FromTs $A.due; $t.DueDate = $d.Date; $t.ReminderSet = $true; $t.ReminderTime = $d }
$t.Save(); Out-Nx @{ created = $true; title = $t.Subject; due = $(if ($A.due) { [int64]$A.due } else { $null }); list = 'Outlook Tasks'; id = $t.EntryID }`,
  cal_delete: OUTLOOK + `try { $ns.GetItemFromID($A.eventId).Delete(); Out-Nx @{ deleted = $true } } catch { Out-Nx @{ deleted = $false; gone = $true } }`,
  rem_delete: OUTLOOK + `try { $ns.GetItemFromID($A.reminderId).Delete(); Out-Nx @{ deleted = $true } } catch { Out-Nx @{ deleted = $false; gone = $true } }`
};

// ---------- speech: a PowerShell session per "listen" (dictation) and one for "Hey Nexus"
const LISTEN = `
Add-Type -AssemblyName System.Speech
try { $r = if ($A.locale) { New-Object System.Speech.Recognition.SpeechRecognitionEngine ([Globalization.CultureInfo]::new($A.locale.Replace('_','-'))) } else { New-Object System.Speech.Recognition.SpeechRecognitionEngine } }
catch { try { $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine } catch { Out-Nx @{ event = 'error'; error = "Windows speech recognition isn't set up. Turn it on in Settings > Time & language > Speech, or pick a cloud voice in Nexus Settings > Voice." }; exit } }
try { $r.SetInputToDefaultAudioDevice() } catch { Out-Nx @{ event = 'error'; error = "No microphone found, or Windows isn't letting apps use it (Settings > Privacy & security > Microphone)." }; exit }
if ($A.mode -eq 'wake') {
  $c = New-Object System.Speech.Recognition.Choices; foreach ($w in @('hey nexus', 'okay nexus', 'hi nexus')) { $c.Add($w) }
  $gb = New-Object System.Speech.Recognition.GrammarBuilder; $gb.Append($c); $r.LoadGrammar((New-Object System.Speech.Recognition.Grammar($gb)))
} else { $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)) }
Register-ObjectEvent $r SpeechHypothesized -SourceIdentifier hyp | Out-Null
Register-ObjectEvent $r SpeechRecognized -SourceIdentifier rec | Out-Null
Register-ObjectEvent $r AudioLevelUpdated -SourceIdentifier lvl | Out-Null
$r.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
Out-Nx @{ event = 'started' }
$acc = ''; $peak = 0.0; $level = -1; $lastLvl = Get-Date; $stopAt = $null
$line = [Console]::In.ReadLineAsync()
while ($true) {
  foreach ($e in @(Get-Event)) {
    $a = $e.SourceEventArgs
    switch ($e.SourceIdentifier) {
      'hyp' { if ($A.mode -ne 'wake') { Out-Nx @{ event = 'partial'; text = (($acc + ' ' + $a.Result.Text).Trim()) } } }
      'rec' { if ($A.mode -eq 'wake') { if ($a.Result.Confidence -ge 0.55) { Out-Nx @{ event = 'wake'; text = $a.Result.Text } } }
              elseif ($a.Result.Confidence -ge 0.2) { $acc = ($acc + ' ' + $a.Result.Text).Trim(); Out-Nx @{ event = 'partial'; text = $acc } } }
      'lvl' { $level = [double]$a.AudioLevel / 100.0; if ($level -gt $peak) { $peak = $level } }
    }
    Remove-Event -EventIdentifier $e.EventIdentifier
  }
  if ($A.mode -ne 'wake' -and $level -ge 0 -and ((Get-Date) - $lastLvl).TotalMilliseconds -gt 120) { Out-Nx @{ event = 'level'; level = $level }; $lastLvl = Get-Date }
  if ($line.IsCompleted -and $stopAt -eq $null) {
    $cmd = $line.Result
    if ($cmd -eq 'cancel') { $r.RecognizeAsyncCancel(); exit }
    if ($cmd -eq $null -or $cmd -eq 'stop') { $r.RecognizeAsyncStop(); $stopAt = (Get-Date).AddMilliseconds(1200) } else { $line = [Console]::In.ReadLineAsync() }
  }
  if ($stopAt -ne $null -and (Get-Date) -gt $stopAt) { Out-Nx @{ event = 'final'; text = $acc; peak = $peak }; exit }
  Start-Sleep -Milliseconds 70
}`;
const TRANSCRIBE = `
Add-Type -AssemblyName System.Speech
$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); $r.SetInputToWaveFile($A.path)
$parts = @(); while ($true) { $res = $r.Recognize(); if ($res -eq $null) { break }; $parts += $res.Text }
Out-Nx @{ text = ($parts -join ' ') }`;

function speechSession(mode, args, onEvent) {
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(PRE + `$A = $env:NX_ARGS | ConvertFrom-Json\n` + LISTEN)],
    { windowsHide: true, env: { ...process.env, NX_ARGS: JSON.stringify({ ...args, mode }) } });
  let buf = '';
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; try { onEvent(JSON.parse(l)); } catch {} } });
  p.stdin.on('error', () => {});
  return { proc: p, send: s => { try { p.stdin.write(s + '\n'); } catch {} }, kill: () => { try { p.kill(); } catch {} } };
}

// ---------- the protocol
function outlookInstalled() {
  if (process.env.NX_FAKE_OUTLOOK) return process.env.NX_FAKE_OUTLOOK === '1';
  try { execFileSync('reg', ['query', 'HKCR\\Outlook.Application'], { stdio: 'ignore', windowsHide: true, timeout: 3000 }); return true; } catch { return false; }
}
function createWinHelper({ run = ps, session = speechSession, emit = out, outlook = outlookInstalled } = {}) {
  let listen = null, listenId = '', wake = null, wakeWanted = false;
  const result = (id, data) => emit({ event: 'result', id, data });
  const error = (id, e) => emit({ event: 'error', id, error: String(e?.message || e).slice(0, 300) });
  const req = (id, script, args, timeout) => run(script, args, timeout).then(d => result(id, d), e => error(id, e));
  function startWake() {
    if (wake) return;
    wake = session('wake', {}, ev => {
      if (ev.event === 'started') emit({ event: 'wake_listening' });
      if (ev.event === 'wake') emit({ event: 'wake', text: ev.text });
      if (ev.event === 'error') { emit({ event: 'wake_error', error: ev.error }); wake = null; }
    });
    wake.proc.on('exit', () => { if (wake && wakeWanted) { wake = null; setTimeout(() => { if (wakeWanted && !listen) startWake(); }, 1500); } else wake = null; });
  }
  function stopWake() { const w = wake; wake = null; if (w) { w.send('cancel'); setTimeout(() => w.kill(), 300); } }
  let caps = null;
  return function handle(m) {
    const id = m.id || '';
    switch (m.cmd) {
      case 'info':
        caps = caps || { event: 'info', id, version: 8, platform: 'win32', perms: true, stt: true, eventkit: outlook(), wake: true, screen: true, ax: true, transcribeFile: true, selwatch: false, pdf: true, fm: 'unavailable' };
        return emit({ ...caps, id });
      case 'listen': {
        stopWake();
        if (listen) listen.kill();
        listenId = id; const mine = id;
        listen = session('listen', { locale: m.locale || '' }, ev => {
          if (mine !== listenId) return;
          if (ev.event === 'started') emit({ event: 'listening', id });
          else if (ev.event === 'error') { emit({ event: 'error', id, error: ev.error }); listen = null; }
          else emit({ ...ev, id });
        });
        listen.proc.on('exit', () => { if (listenId === mine) { listen = null; if (wakeWanted) startWake(); } });
        return;
      }
      case 'stop': if (listen && id === listenId) listen.send('stop'); return;
      case 'cancel': if (listen) { listen.send('cancel'); const l = listen; setTimeout(() => l.kill(), 400); listen = null; } if (wakeWanted) startWake(); return;
      case 'wake_start': wakeWanted = true; return startWake();
      case 'wake_stop': wakeWanted = false; stopWake(); return emit({ event: 'wake_stopped' });
      case 'front_window': return run(FRONT, { exclude: (m.exclude || []).map(Number).filter(Boolean) }, 15000).then(d => result(id, d && !d.none ? d : null), () => result(id, null));
      case 'ocr': return req(id, OCR, { path: m.path || '' }, 45000);
      case 'pdf_text': return req(id, PDF, { path: m.path || '' }, 180000);
      case 'ax_status': return result(id, { trusted: true });
      case 'selected_text': return run(SELECTED, { exclude: [process.ppid] }, 15000).then(d => result(id, d), e => error(id, e));
      case 'perm_status': return result(id, { speech: 3, calendar: outlook() ? 3 : 0, reminders: outlook() ? 3 : 0, accessibility: true, platform: 'win32' });
      case 'transcribe_file': return req(id, TRANSCRIBE, { path: m.path || '' }, 120000);
      case 'cal_list': case 'rem_list': return run(CAL[m.cmd], m, 30000).then(d => result(id, d?.list || []), e => error(id, e));
      case 'cal_create': case 'rem_create': case 'cal_delete': case 'rem_delete': return req(id, CAL[m.cmd], m, 30000);
      case 'sel_watch_start': return emit({ event: 'sel_watch', ok: false, error: 'NOT_ON_WINDOWS' });
      case 'sel_watch_stop': return;
      case 'fm': return emit({ event: 'error', id, error: "Apple's on-device model is only on Macs. Try Ollama or LM Studio on Windows." });
      default: return emit({ event: 'error', id, error: 'unknown command ' + m.cmd });
    }
  };
}

if (require.main === module) {
  const handle = createWinHelper();
  out({ event: 'ready' });
  require('readline').createInterface({ input: process.stdin }).on('line', line => { let m; try { m = JSON.parse(line); } catch { return; } try { handle(m); } catch (e) { out({ event: 'error', id: m.id, error: e.message }); } }).on('close', () => process.exit(0));
}
module.exports = { createWinHelper, ps, SCRIPTS: { OCR, PDF, FRONT, SELECTED, LISTEN, TRANSCRIBE, CAL } };
