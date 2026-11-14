// Prints the GitHub release notes for a tag from docs/whats-new/changes.json (the same file the What's new page reads).
//   node scripts/release-notes.js v2.1.0 > release-notes.md
const fs = require('fs');
const path = require('path');
const tag = String(process.argv[2] || '').replace(/^v/, '').replace(/-.*$/, '');
let entry = null;
try { entry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'whats-new', 'changes.json'), 'utf8')).find(e => e.version === tag); } catch {}
const out = [];
if (entry) out.push(`## ${entry.title}`, '', ...entry.highlights.map(h => `- ${h}`), '', `[See everything that's new](https://apojidelegraphics.github.io/Nexus-28/whats-new/)`, '');
out.push('## Install', "1. Open the DMG and drag **Nexus '28** to Applications.", '2. Run once in Terminal:', '```', `xattr -cr "/Applications/Nexus '28.app"`, `codesign --force --deep --sign - "/Applications/Nexus '28.app"`, '```',
  "Already have Nexus '28? Download, replace the app, and run the two commands again. Settings, chats and keys are kept.");
process.stdout.write(out.join('\n') + '\n');
