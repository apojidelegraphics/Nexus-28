// v3.9.1 tests: the chats mind map is a Notion-style tree (renderer/mindtree.js, shared with Apoji Admin).
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const mt = read('renderer/mindtree.js'), mm = read('renderer/mindmap.js'), html = read('renderer/mindmap.html');
// the tree component: two sides, curved branches, folding, search that opens the way to matches, pan / zoom / fit
for (const s of ['function layout()', "side !== 'left'", ' C${mx},', 'collapsed', 'expandAll()', 'collapseAll()', 'search(q)', "'wheel'", 'data-z="fit"', 'p.collapsed = false', 'aria-expanded'])
  assert.ok(mt.includes(s), 'mindtree.js: ' + s);
assert.ok(/root\.MindTree = \{ create, esc \}/.test(mt));
ok('mindtree.js: Notion-style mind map (both sides, curved branches, fold, search, zoom, keyboard)');
// load order (CSP is script-src 'self': no inline scripts)
const order = ['theme.js', 'mindtree.js', 'mindmap.js'].map(f => html.indexOf(`<script src="${f}">`));
assert.ok(order.every(i => i > 0) && order[0] < order[1] && order[1] < order[2] && !/<script>(?!<)/.test(html));
assert.ok(html.includes('id="expand"') && html.includes('id="collapse"') && html.includes('id="q"'));
ok('the window loads the tree, with search, Expand all and Collapse all');
// your chats → the tree: Spaces first, then topics, then "Other chats" (by month when there are lots)
assert.ok(mm.includes("label: 'Your chats'") && mm.includes("'Other chats'") && mm.includes("'month:'") && mm.includes('open: true') && mm.includes('MindTree.create'));
assert.ok(mm.includes("(a.kind === 'space' ? 0 : 1)") && mm.includes('kids.length > 8'));
ok('chats become branches: Spaces, topics, other chats by month; big branches start folded');
const pkg = JSON.parse(read('package.json')), ch = JSON.parse(read('docs/whats-new/changes.json'));
assert.strictEqual(pkg.version, '3.9.1'); assert.strictEqual(ch[0].version, '3.9.1'); assert.ok(read('docs/whats-new/feed.xml').includes('3.9.1'));
ok('3.9.1');
console.log(`v3.9.1: ${n} checks passed`);
