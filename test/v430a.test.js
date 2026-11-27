// 4.3.0: Test Run shop previews aren't clipped, the color picker, the comparison table
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = R('docs/try/try.css'), js = R('docs/try/try.js');
assert.ok(/\.sh-sw \{[^}]*overflow: visible/.test(css) && !/\.sh-sw \{[^}]*overflow: hidden/.test(css), 'shop previews must not clip the frame glows');
assert.ok(css.includes(".swatch-custom::after { content: '+'") && !js.includes("${custom ? '' : '＋'}") && js.includes("sw.classList.add('on')"));
for (const row of ['@huddle and @debate', 'Memory you control', 'Profile, Cirkts, daily quests and the shop', "'Up to 3'"]) assert.ok(js.includes(row), row);
assert.ok(!js.includes("['Huddles, debates, Write mode', 0, 1]"));
console.log('v4.3.0 (Test Run touch-ups): 3 passed');
