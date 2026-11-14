// Copies the shared pieces of the Mac app into the N28C phone app (docs/companion), so the phone draws the same
// orb skins and the same interactive answers (quizzes, flashcards, checklists, charts…). Run after changing
// renderer/orb.js, renderer/widgets.js or the widget styles:  npm run sync:companion   (a test checks they match)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'docs', 'companion');
const head = '/* Generated from the Nexus \'28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */\n';

function widgetCss() {
  const css = fs.readFileSync(path.join(root, 'renderer', 'chatview.css'), 'utf8');
  const cut = (a, b) => { const i = css.indexOf(a); if (i < 0) throw new Error('marker missing: ' + a); const j = b ? css.indexOf(b, i) : css.length; return css.slice(i, j < 0 ? css.length : j); };
  const codeBar = css.split('\n').filter(l => /^\.code-bar|^pre\.has-bar|^\.code-out/.test(l)).join('\n');
  return cut('/* ===== v1.5: feature widgets ===== */', '/* feature panels */') + '\n' + cut('/* v1.7: flashcard widget spacing */') + '\n' + codeBar + '\n';
}
function build() {
  return {
    'orb.js': head + fs.readFileSync(path.join(root, 'renderer', 'orb.js'), 'utf8'),
    'widgets.js': head + fs.readFileSync(path.join(root, 'renderer', 'widgets.js'), 'utf8'),
    'widgets.css': head + widgetCss()
  };
}
if (require.main === module) { for (const [f, txt] of Object.entries(build())) fs.writeFileSync(path.join(out, f), txt); console.log('Synced orb.js, widgets.js, widgets.css → docs/companion'); }
module.exports = { build };
