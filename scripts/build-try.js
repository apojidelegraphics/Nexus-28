// Builds the shared pieces of Nexus '28 Test Run (docs/try) from the Mac app's own source, so the web version uses
// the same @features, widgets prompts and Markdown as the desktop:  npm run sync:try   (a test checks they match)
//   docs/try/nexuskit.js  ← src/features.js (catalog, prompts) + src/featurekit.js (what each feature does)
//   docs/try/markdown.js  ← renderer/markdown.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'docs', 'try');
const head = '/* Generated from the Nexus \'28 Mac app by scripts/build-try.js — edit the original, not this copy. */\n';
const wrap = (name, src) => `mods['./${name}'] = (function (require) { const module = { exports: {} }; const exports = module.exports;\n${src}\nreturn module.exports; })(req);\n`;
function build() {
  const src = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
  const kit = `${head}(function () {\n  const mods = {}; const req = n => { if (!(n in mods)) throw new Error('nexuskit: ' + n); return mods[n]; };\n` +
    wrap('featurekit', src('featurekit.js')) + wrap('features', src('features.js')) +
    `  window.NexusKit = { features: mods['./features'], kit: mods['./featurekit'] };\n})();\n`;
  return { 'nexuskit.js': kit, 'markdown.js': head + fs.readFileSync(path.join(root, 'renderer', 'markdown.js'), 'utf8') };
}
if (require.main === module) { fs.mkdirSync(out, { recursive: true }); for (const [f, txt] of Object.entries(build())) fs.writeFileSync(path.join(out, f), txt); console.log('Built nexuskit.js, markdown.js → docs/try'); }
module.exports = { build };
