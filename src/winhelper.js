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
      if (code !== 0 && !j) return reject(new Error(psError(se) || 'PowerShell failed'));
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

// ---------- 3.6 the highlight orb: a mouse hook watches for a drag or a double-click, then asks UI Automation what's
// selected in the focused control (never the clipboard, never password fields). Coordinates are physical pixels.
const SELWATCH = `
try {
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms, WindowsBase
$refs = [AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { @('UIAutomationClient', 'UIAutomationTypes', 'System.Windows.Forms', 'WindowsBase') -contains $_.GetName().Name } | ForEach-Object { $_.Location }
Add-Type -ReferencedAssemblies $refs -TypeDefinition @"
using System; using System.Diagnostics; using System.Runtime.InteropServices; using System.Text; using System.Threading; using System.Windows.Forms; using System.Windows.Automation;
public class NxSel {
  // 3.8: no low-level mouse hook any more (security software often blocks hooks run from PowerShell, which is why
  // the orb said "Couldn't start"). A background thread checks the left button and the pointer every 25 ms instead.
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern bool GetCursorPos(out PT p);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  [StructLayout(LayoutKind.Sequential)] struct PT { public int x; public int y; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  static int downX, downY, ownPid; static int lastUpAt; static bool showing;
  static object lk = new object();
  public static void Run(int pid) {
    ownPid = pid; try { SetProcessDPIAware(); } catch {}
    int vk = GetSystemMetrics(23) != 0 ? 0x02 : 0x01;     // swapped mouse buttons: the "left" click is the right button
    Out("{\\"event\\":\\"sel_watch\\",\\"ok\\":true,\\"mode\\":\\"poll\\"}");
    bool wasDown = false;
    while (true) {
      bool down = (GetAsyncKeyState(vk) & 0x8000) != 0; PT p; GetCursorPos(out p);
      if (down && !wasDown) { downX = p.x; downY = p.y; }
      else if (!down && wasDown) {
        int now = Environment.TickCount; bool dbl = now - lastUpAt < 450; lastUpAt = now;
        int dx = p.x - downX, dy = p.y - downY; bool drag = dx * dx + dy * dy > 64; int x = p.x, y = p.y;
        if (drag || dbl) ThreadPool.QueueUserWorkItem(delegate { Check(x, y); });
        else if (showing) { showing = false; Out("{\\"event\\":\\"sel_clear\\",\\"x\\":" + x + ",\\"y\\":" + y + ",\\"physical\\":true}"); }
      }
      wasDown = down; Thread.Sleep(25);
    }
  }
  static void Check(int x, int y) {
    Thread.Sleep(130);
    string app = "";
    try {
      uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid);
      if ((int)pid == ownPid) return;
      try { app = Process.GetProcessById((int)pid).ProcessName; } catch {}
      AutomationElement el = AutomationElement.FocusedElement; string text = "";
      if (el != null) {
        object pw = el.GetCurrentPropertyValue(AutomationElement.IsPasswordProperty);
        if (pw is bool && (bool)pw) return;
        object pat;
        if (el.TryGetCurrentPattern(TextPattern.Pattern, out pat)) { foreach (TextPatternRange r in ((TextPattern)pat).GetSelection()) text += r.GetText(20000); }
      }
      text = text.Trim();
      if (text.Length == 0) { Out("{\\"event\\":\\"sel_miss\\",\\"app\\":\\"" + Esc(app) + "\\",\\"bundle\\":\\"" + Esc(app) + "\\"}"); return; }
      showing = true;
      Out("{\\"event\\":\\"selection\\",\\"text\\":\\"" + Esc(text) + "\\",\\"app\\":\\"" + Esc(app) + "\\",\\"bundle\\":\\"" + Esc(app) + "\\",\\"x\\":" + x + ",\\"y\\":" + y + ",\\"physical\\":true}");
    } catch (Exception e) { Out("{\\"event\\":\\"sel_miss\\",\\"app\\":\\"" + Esc(app) + "\\",\\"error\\":\\"" + Esc(e.Message) + "\\"}"); }
  }
  static void Out(string s) { lock (lk) { Console.Out.WriteLine(s); Console.Out.Flush(); } }
  static string Esc(string s) { StringBuilder b = new StringBuilder(); foreach (char c in s ?? "") { if (c == '"' || c == '\\\\') { b.Append('\\\\'); b.Append(c); } else if (c < ' ') b.Append("\\\\u" + ((int)c).ToString("x4")); else b.Append(c); } return b.ToString(); }
}
"@
} catch { Out-Nx @{ event = 'error'; error = "Windows wouldn't let Nexus start the highlight watcher: $($_.Exception.Message)" }; exit }
[NxSel]::Run([int]$A.pid)`;

// ---------- speech: a PowerShell session per "listen" (dictation) and one for "Hey Nexus"
const LISTEN = `
Add-Type -AssemblyName System.Speech
try { $r = if ($A.locale) { New-Object System.Speech.Recognition.SpeechRecognitionEngine ([Globalization.CultureInfo]::new($A.locale.Replace('_','-'))) } else { New-Object System.Speech.Recognition.SpeechRecognitionEngine } }
catch { try { $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine } catch { Out-Nx @{ event = 'error'; error = "Windows speech recognition isn't set up. Turn it on in Settings > Time & language > Speech, or pick a cloud voice in Nexus Settings > Voice." }; exit } }
try { $r.SetInputToDefaultAudioDevice() } catch { Out-Nx @{ event = 'error'; error = "No microphone found, or Windows isn't letting desktop apps use it (Settings > Privacy & security > Microphone > Let desktop apps access your microphone). Windows said: $($_.Exception.Message)" }; exit }
if ($A.mode -eq 'wake') {
  $c = New-Object System.Speech.Recognition.Choices; foreach ($w in @('hey nexus', 'okay nexus', 'hi nexus')) { $c.Add($w) }
  $gb = New-Object System.Speech.Recognition.GrammarBuilder; $gb.Append($c); $r.LoadGrammar((New-Object System.Speech.Recognition.Grammar($gb)))
} else {
  # 3.6: dictation that keeps the words still being heard when you stop, and waits for the last phrase to finish
  $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  try { $sp = New-Object System.Speech.Recognition.DictationGrammar('grammar:dictation#spelling'); $sp.Weight = 0.2; $r.LoadGrammar($sp) } catch {}
  $r.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8); $r.BabbleTimeout = [TimeSpan]::FromSeconds(0); $r.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(500); $r.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(700)
}
Register-ObjectEvent $r RecognizeCompleted -SourceIdentifier done | Out-Null
Register-ObjectEvent $r SpeechHypothesized -SourceIdentifier hyp | Out-Null
Register-ObjectEvent $r SpeechRecognized -SourceIdentifier rec | Out-Null
Register-ObjectEvent $r AudioLevelUpdated -SourceIdentifier lvl | Out-Null
$r.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
Out-Nx @{ event = 'started' }
$acc = ''; $pending = ''; $peak = 0.0; $level = -1; $lastLvl = Get-Date; $stopAt = $null; $completed = $false
$line = [Console]::In.ReadLineAsync()
while ($true) {
  foreach ($e in @(Get-Event)) {
    $a = $e.SourceEventArgs
    switch ($e.SourceIdentifier) {
      'hyp' { if ($A.mode -ne 'wake') { $pending = $a.Result.Text; Out-Nx @{ event = 'partial'; text = (($acc + ' ' + $pending).Trim()) } } }
      'rec' { if ($A.mode -eq 'wake') { if ($a.Result.Confidence -ge 0.42) { Out-Nx @{ event = 'wake'; text = $a.Result.Text; confidence = [string][math]::Round($a.Result.Confidence, 2) } } else { Out-Nx @{ event = 'heard'; text = $a.Result.Text; confidence = [string][math]::Round($a.Result.Confidence, 2) } } }
              else { $acc = ($acc + ' ' + $a.Result.Text).Trim(); $pending = ''; Out-Nx @{ event = 'partial'; text = $acc } } }
      'done' { $completed = $true }
      'lvl' { $level = [double]$a.AudioLevel / 100.0; if ($level -gt $peak) { $peak = $level } }
    }
    Remove-Event -EventIdentifier $e.EventIdentifier
  }
  if ($A.mode -ne 'wake' -and $level -ge 0 -and ((Get-Date) - $lastLvl).TotalMilliseconds -gt 120) { Out-Nx @{ event = 'level'; level = $level }; $lastLvl = Get-Date }
  if ($line.IsCompleted -and $stopAt -eq $null) {
    $cmd = $line.Result
    if ($cmd -eq 'cancel') { $r.RecognizeAsyncCancel(); exit }
    if ($cmd -eq $null -or $cmd -eq 'stop') { $r.RecognizeAsyncStop(); $stopAt = (Get-Date).AddMilliseconds(2500) } else { $line = [Console]::In.ReadLineAsync() }
  }
  if ($stopAt -ne $null -and ($completed -or (Get-Date) -gt $stopAt)) {
    $text = $acc; if ($pending -and -not $acc.EndsWith($pending)) { $text = ($acc + ' ' + $pending).Trim() }   # words still being heard count too
    $ev = @{ event = 'final'; text = $text; peak = $peak }; if (-not $text) { $ev.reason = $(if ($peak -lt 0.03) { 'no sound from the microphone' } else { 'no words recognized' }) }
    Out-Nx $ev; exit
  }
  Start-Sleep -Milliseconds 70
}`;
// 3.9: "Hey Nexus" with Windows' newer speech engine (Windows.Media.SpeechRecognition, the one behind Win+H voice
// typing): a short list of phrases, which it hears far more reliably than the old System.Speech grammar. Runs offline.
// If it can't start (older Windows, speech turned off), it says so and Nexus falls back to System.Speech.
const WAKE_WINRT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$__asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, [Type]$t) { $task = $__asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait() | Out-Null; $task.Result }
try {
  [Windows.Media.SpeechRecognition.SpeechRecognizer,Windows.Media.SpeechRecognition,ContentType=WindowsRuntime] | Out-Null
  $r = New-Object Windows.Media.SpeechRecognition.SpeechRecognizer
  $phrases = [string[]]@('hey nexus', 'okay nexus', 'ok nexus', 'hi nexus', 'hey nexus twenty eight')
  # 3.11.1: in Windows PowerShell the WinRT list sometimes shows up as a bare COM object with no Add(); then call Add
  # through the .NET interface, and if even that fails, listen with Windows' dictation and look for "nexus" in the words
  $lc = New-Object Windows.Media.SpeechRecognition.SpeechRecognitionListConstraint($phrases, 'wake'); $dict = $false
  try { $r.Constraints.Add($lc) } catch {
    try { [System.Collections.Generic.ICollection[Windows.Media.SpeechRecognition.ISpeechRecognitionConstraint]].GetMethod('Add').Invoke($r.Constraints, @($lc)) | Out-Null }
    catch { $dict = $true }
  }
  $c = Await ($r.CompileConstraintsAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionCompilationResult])
  if ($c.Status -ne [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]::Success) { Out-Nx @{ event = 'error'; winrt = $true; error = $(if ($dict) { "Windows speech: $($c.Status) (turn on Settings > Privacy & security > Speech > Online speech recognition)" } else { "Windows speech: $($c.Status)" }) }; exit }
  $r.Timeouts.InitialSilenceTimeout = [TimeSpan]::FromSeconds(20); $r.Timeouts.BabbleTimeout = [TimeSpan]::FromSeconds(4)
} catch { Out-Nx @{ event = 'error'; winrt = $true; error = $_.Exception.Message }; exit }
Out-Nx @{ event = 'started'; engine = $(if ($dict) { 'winrt-dictation' } else { 'winrt' }) }
# 3.11: every pass reports back (tick), so Nexus knows it isn't stuck; what it heard (or why not) goes to Settings
$S = [Windows.Media.SpeechRecognition.SpeechRecognitionResultStatus]; $fails = 0
while ($true) {
  try {
    $res = Await ($r.RecognizeAsync()) ([Windows.Media.SpeechRecognition.SpeechRecognitionResult])
    $st = "$($res.Status)"
    Out-Nx @{ event = 'tick'; status = $st }
    if ($res.Status -eq $S::Success -and $res.Text) {
      $fails = 0
      if ($dict) { if ($res.Text -match '\b(hey|okay|ok|hi)\b[ ,.]*nexus') { Out-Nx @{ event = 'wake'; text = $res.Text; confidence = 'dictation' } } else { Out-Nx @{ event = 'heard'; text = $res.Text; confidence = 'not the wake word' } } }
      elseif ($res.Confidence -ne [Windows.Media.SpeechRecognition.SpeechRecognitionConfidence]::Rejected) { Out-Nx @{ event = 'wake'; text = $res.Text; confidence = "$($res.Confidence)" } }
      else { Out-Nx @{ event = 'heard'; text = $res.Text; confidence = 'Rejected' } }
    }
    elseif ($res.Status -ne $S::TimeoutExceeded -and $res.Status -ne $S::Success) {
      $fails++; Out-Nx @{ event = 'heard'; status = $st }
      if ($fails -ge 6) { Out-Nx @{ event = 'error'; winrt = $true; error = "Windows speech keeps failing ($st)" }; exit }
      Start-Sleep -Milliseconds 400
    }
  } catch { Out-Nx @{ event = 'error'; winrt = $true; error = $_.Exception.Message }; exit }
}`;
const TRANSCRIBE = `
Add-Type -AssemblyName System.Speech
$r = New-Object System.Speech.Recognition.SpeechRecognitionEngine
$r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); $r.SetInputToWaveFile($A.path)
$parts = @(); while ($true) { $res = $r.Recognize(); if ($res -eq $null) { break }; $parts += $res.Text }
Out-Nx @{ text = ($parts -join ' ') }`;

function speechSession(mode, args, onEvent, script = LISTEN, { mta = false } = {}) {
  // 3.11: Windows' newer speech engine (WinRT) needs PowerShell in MTA mode; in the default STA mode RecognizeAsync can
  // wait forever without a message pump, which looked like "LISTENING" that never heard anything
  const p = spawn('powershell.exe', [...(mta ? ['-Mta'] : []), '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc(PRE + `$A = $env:NX_ARGS | ConvertFrom-Json\n` + script)],
    { windowsHide: true, env: { ...process.env, NX_ARGS: JSON.stringify({ ...args, mode }) } });
  let buf = '', err = '';
  p.stderr?.setEncoding?.('utf8'); p.stderr?.on?.('data', d => { err = (err + d).slice(-4000); });
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; try { onEvent(JSON.parse(l)); } catch {} } });
  p.stdin.on('error', () => {});
  // 3.8: the first real line of what PowerShell complained about, so Settings can say why instead of just "STOPPED"
  const why = () => psError(err);
  return { proc: p, why, send: s => { try { p.stdin.write(s + '\n'); } catch {} }, kill: () => { try { p.kill(); } catch {} } };
}

// 3.11.1: PowerShell started with -EncodedCommand writes its errors as CLIXML ("#< CLIXML" then XML), which is what
// Settings showed. This pulls out the error text (and ignores progress messages like "Preparing modules for first use").
function psError(raw) {
  const t = String(raw || '');
  if (/#< CLIXML/.test(t)) {
    const dec = x => x.replace(/_x000D_|_x000A_/g, ' ').replace(/_x([0-9A-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const errs = [...t.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)].map(m => dec(m[1]).trim()).filter(Boolean);
    const line = errs.find(l => !/^(At line|\+|CategoryInfo|FullyQualified|~)/.test(l)) || errs[0];
    return (line || '').replace(/\s+/g, ' ').slice(0, 240);
  }
  return (t.split(/\r?\n/).map(l => l.trim()).find(l => l && !/^(At line|\+|CategoryInfo|FullyQualified|~)/.test(l)) || '').slice(0, 240);
}

// ---------- the protocol
function outlookInstalled() {
  if (process.env.NX_FAKE_OUTLOOK) return process.env.NX_FAKE_OUTLOOK === '1';
  try { execFileSync('reg', ['query', 'HKCR\\Outlook.Application'], { stdio: 'ignore', windowsHide: true, timeout: 3000 }); return true; } catch { return false; }
}
function createWinHelper({ run = ps, session = speechSession, emit = out, outlook = outlookInstalled } = {}) {
  let listen = null, listenId = '', wake = null, wakeWanted = false, selw = null, selWanted = false;
  const result = (id, data) => emit({ event: 'result', id, data });
  const error = (id, e) => emit({ event: 'error', id, error: String(e?.message || e).slice(0, 300) });
  const req = (id, script, args, timeout) => run(script, args, timeout).then(d => result(id, d), e => error(id, e));
  // 3.9: Windows' newer engine first; if it can't start, the old System.Speech grammar (remembered for this session)
  let wakeOld = false;
  // 3.11: a watchdog. The WinRT engine reports back at least every ~20 s (its silence timeout); if it goes quiet for
  // 60 s it's stuck, so Nexus switches to the older System.Speech listener for the rest of this session.
  let wakeDog = null, lastTick = 0;
  const toOld = (w, why) => { if (wakeOld) return; wakeOld = true; emit({ event: 'wake_heard', status: 'switching', text: why }); if (wake === w) { wake = null; clearInterval(wakeDog); try { w.kill(); } catch {} setTimeout(() => { if (wakeWanted && !listen) startWake(); }, 300); } };
  function startWake() {
    if (wake) return;
    const engine = wakeOld ? 'sapi' : 'winrt';
    lastTick = Date.now();
    const w = wake = session('wake', {}, ev => {
      lastTick = Date.now();
      if (ev.event === 'started') emit({ event: 'wake_listening', engine: ev.engine || engine });
      if (ev.event === 'wake') emit({ event: 'wake', text: ev.text, confidence: ev.confidence || '' });
      if (ev.event === 'heard') emit({ event: 'wake_heard', engine, status: ev.status || '', text: ev.text || '', confidence: ev.confidence || '' });
      if (ev.event === 'error' && ev.winrt && !wakeOld) return toOld(w, ev.error);
      if (ev.event === 'error') { emit({ event: 'wake_error', error: ev.error }); wake = null; }
    }, wakeOld ? LISTEN : WAKE_WINRT, { mta: !wakeOld });
    clearInterval(wakeDog);
    if (!wakeOld) { wakeDog = setInterval(() => { if (wake === w && Date.now() - lastTick > 60e3) toOld(w, 'Windows speech stopped answering'); }, 10e3); wakeDog.unref?.(); }
    wake.proc.on('exit', () => {
      if (wake === w && wakeWanted) { const why = w.why?.(); if (why) emit({ event: 'wake_heard', engine, status: 'exited', text: why }); wake = null; setTimeout(() => { if (wakeWanted && !listen) startWake(); }, 1500); }
      else if (wake === w) wake = null;
    });
  }
  function stopWake() { const w = wake; wake = null; clearInterval(wakeDog); if (w) { w.send('cancel'); setTimeout(() => w.kill(), 300); } }
  let caps = null;
  return function handle(m) {
    const id = m.id || '';
    switch (m.cmd) {
      case 'info':
        caps = caps || { event: 'info', id, version: 8, platform: 'win32', perms: true, stt: true, eventkit: outlook(), wake: true, screen: true, ax: true, transcribeFile: true, selwatch: true, pdf: true, fm: 'unavailable' };
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
      case 'sel_watch_start': {   // 3.6: the highlight orb on Windows
        if (selw) return emit({ event: 'sel_watch', ok: true });
        selw = session('selwatch', { pid: +m.pid || process.ppid }, ev => { if (ev.event === 'error') return emit({ event: 'sel_watch', ok: false, error: ev.error }); if (ev.event) emit(ev); }, SELWATCH);
        selw.proc.on('exit', code => { const was = selw; selw = null; if (was && selWanted) emit({ event: 'sel_watch', ok: false, error: (was.why?.() || `it stopped (code ${code})`) + (/ScriptBlock|malicious|blocked|antivirus|AMSI/i.test(was.why?.() || '') ? ' — your security software blocked it' : '') }); });
        selWanted = true; return;
      }
      case 'sel_watch_stop': selWanted = false; if (selw) { const w = selw; selw = null; w.kill(); } return;
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
module.exports = { createWinHelper, ps, SCRIPTS: { OCR, PDF, FRONT, SELECTED, LISTEN, TRANSCRIBE, CAL, SELWATCH, WAKE_WINRT } };
