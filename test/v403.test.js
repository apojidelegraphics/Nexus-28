// 4.0.3: richer announcements from Apoji Admin 2.10 (title, style, button, apps, pinned)
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { annMap } = require('../src/cloud');
const rows = [{ id: 1, message: 'old row, no new columns', created_at: 'x' }, { id: 2, message: 'phone only', apps: ['phone'] }, { id: 3, message: 'm', title: 'T', style: 'critical', link_url: 'https://x.y', link_label: 'Go', apps: ['desktop'], pinned: true }, { id: 4, message: 'bad', style: 'weird', link_url: 'javascript:alert(1)', apps: ['desktop', 'phone'] }];
const out = annMap(rows);
assert.deepStrictEqual(out.map(a => a.id), [3, 1, 4], 'desktop only, pinned first, old rows still work');
assert.ok(out[0].style === 'critical' && out[0].url === 'https://x.y' && out[0].label === 'Go' && out[0].pinned && out[0].title === 'T');
assert.ok(out[2].style === 'info' && out[2].url === '');
const hud = R('renderer/hud.js'), app = R('docs/companion/app.js');
assert.ok(hud.includes("a.pinned || !dismissed.includes(a.id)") && hud.includes("${b.kind === 'info' && !b.pinned ? '<button class=\"b-x\"") && R('renderer/hud.css').includes('.banner.ann-critical'));
assert.ok(app.includes("x.apps.includes('phone')") && app.includes("sb.from('announcements').select('*')"));
assert.ok(R('src/cloud.js').includes("announcements?select=*&active=eq.true"));
const pkg = JSON.parse(R('package.json')); assert.strictEqual(JSON.parse(R('docs/whats-new/changes.json'))[0].version, pkg.version);
console.log('  ✓ announcements: apps, pinned first, styles, safe button links (desktop + N28C)\nv4.0.3: 1 passed');
