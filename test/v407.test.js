// 4.0.7: widgets at the screen edge stay put, no flicker in the Profile jump bar, bigger Ember flames, small fixes
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const main = R('main.js'), set = R('renderer/settings.js'), cos = require('../renderer/cosmetics');
ok('a widget at the left edge of a Mac with Stage Manager opens where you left it', () => {
  const { clampSpot } = require('../src/deskspot');
  const mac = { bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 221, y: 38, width: 1291, height: 944 } };   // the user's Mac: work area starts at 221
  assert.deepStrictEqual(clampSpot({ x: 0, y: 113 }, mac), { x: 0, y: 113 });
  assert.deepStrictEqual(clampSpot({ x: 1000, y: 821 }, mac), { x: 1000, y: 821 });
  const far = clampSpot({ x: -900, y: 5000 }, mac); assert.ok(far.x >= -200 && far.y <= 982 - 40);
  assert.ok(main.includes("require('./src/deskspot').clampSpot(saved"));
  // the 2-second check never saves where Nexus itself put the widget, and the system moving it on open is undone
  assert.ok(main.includes("if (why === 'check' && w._want") && main.includes("log('desk widget put back'"));
});
ok('the Profile jump bar stays on what you clicked', () => {
  assert.ok(set.includes('if (accJumping) return;') && set.includes("addEventListener('scrollend'") && set.includes('accJumping = id;'));
});
ok('Ember flames are bigger', () => { assert.ok(/\.nxp-pf-flame \.nxp-pfg::after \{[^}]*height: 42px/.test(cos.CSS) && cos.CSS.includes('height: 80px;')); });
ok('small fixes from the screenshots', () => {
  const css = R('renderer/hud.css');
  assert.ok(css.includes('.wr-did { display: flex !important') && css.includes('grid-template-columns: max-content minmax(0, 1fr) auto') && css.includes('.pp-view { max-height: min(88vh, 860px); overflow: auto;'));
  assert.ok(cos.detailsHtml({ more: { active_on: ['aargon3', 'mac'] } }).includes('aARgon3, Mac') && cos.CSS.includes('.nxp-full .nxp-name { filter: drop-shadow'));
});
ok('this version is first in What\'s new', () => { assert.strictEqual(JSON.parse(R('docs/whats-new/changes.json'))[0].version, JSON.parse(R('package.json')).version); });
console.log(`v4.0.7: ${n} passed`);
