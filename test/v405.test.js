// 4.0.5: N28C inputs dark, shop previews not clipped, crown in the corner
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = R('docs/companion/index.html');
assert.ok(html.includes('.pl-add input, .pl-add select { -webkit-appearance: none; appearance: none;') && html.includes('.pl-add select option { background: #0b1210;'));
assert.ok(html.includes('.sh-sw { height: 64px; display: grid; place-items: center; overflow: visible;'));
assert.ok(R('renderer/cosmetics.js').includes('left: 14.6%; top: 14.6%;') && R('docs/companion/cosmetics.js').includes('left: 14.6%; top: 14.6%;'));
const pkg = JSON.parse(R('package.json')); assert.strictEqual(JSON.parse(R('docs/whats-new/changes.json'))[0].version, pkg.version);

// The installed app lives at "/Applications/Nexus '28.app". 4.0.4 put that path inside url('…'), the apostrophe ended
// the string early and the whole cosmetics stylesheet stopped working (giant crown, blank frames). Simulate that path.
{
  const vm = require('vm'); let css = '';
  const document = { currentScript: { src: "file:///Applications/Nexus%20'28.app/Contents/Resources/app.asar/renderer/cosmetics.js" }, getElementById: () => null,
    createElement: () => ({}), head: { appendChild: st => { css = st.textContent; } } };
  vm.runInNewContext(R('renderer/cosmetics.js'), { window: {}, document, URL, globalThis: {} });
  const faces = css.split('\n').filter(l => l.startsWith('@font-face'));
  assert.strictEqual(faces.length, 4);
  for (const f of faces) { const u = f.match(/url\("([^"]*)"\)/); assert.ok(u, f); assert.ok(!/['()\s]/.test(u[1]), 'unsafe font path: ' + u[1]); assert.ok(u[1].includes('Nexus%2027.app') || u[1].includes('%27'), u[1]); }
  console.log("  ✓ fonts load from a path with an apostrophe without breaking the stylesheet");
}
console.log('  ✓ N28C fields + shop previews, crown in the corner\nv4.0.5: 2 passed');
