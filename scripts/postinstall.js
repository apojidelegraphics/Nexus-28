// Runs after npm install. On a Mac it builds the Swift helpers (NexusCore + apoji-brightness). On Windows nothing is
// built: Nexus uses src/winhelper.js (Windows' own speech, OCR and Outlook, through PowerShell) instead.
if (process.platform === 'darwin') {
  try { require('child_process').execFileSync('sh', [require('path').join(__dirname, 'build-helper.sh')], { stdio: 'inherit' }); } catch {}
} else console.log('NexusCore: not needed on ' + process.platform + ' (uses src/winhelper.js)');
