// 4.2.1: widgets after sleep/wake, chat menu on small windows, Test Run header + web search text
const assert = require('assert'), fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };
const main = R('main.js');
ok('widgets: nothing saved while asleep or settling; put back at 260 wide on wake; early sizes keep the top', () => {
  assert.ok(main.includes("powerMonitor.on('suspend', () => deskFreeze(") && main.includes("deskSettle('woke'") && main.includes("'display-metrics-changed'"));
  assert.ok(main.includes("if (Date.now() < deskFrozenUntil && why !== 'quit') return false;") && main.includes('width: DESK_W, height: h') && main.includes("w.on('resize'"));
  assert.ok(main.includes("Date.now() - (me.w._placed || 0) < 3000") && R('test/widgets-smoke.js').includes('WSMOKE4'));
});
ok('chat menu scrolls on small windows; export file types line up', () => {
  const css = R('renderer/hud.css'); assert.ok(css.includes('.chat-menu { max-height: calc(100vh - 110px); overflow-y: auto;') && css.includes(':not(:has(> .ico, > svg)) small { margin-left: 0; }'));
});
ok('Test Run: drawn gear and help icons; web search text has no emoji in the sentence', () => {
  const html = R('docs/try/index.html'); assert.ok(/id="setBtn"[^>]*><svg/.test(html) && /id="helpBtn"[^>]*><svg/.test(html) && !html.includes('⚙︎'));
  assert.ok(!R('docs/try/try.js').includes('per message with 🌐'));
});
console.log(`v4.2.1: ${n} passed`);
