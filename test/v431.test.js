// 4.3.1: The Creator, Focus in N28C, any-player media controls, widget frames, the window remembers its size, events
// backdrop, goals that don't flicker, Ask Nexus errors.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = t => { n++; console.log('  ✓ ' + t); };
(async () => {
  const { Metrics, ACHIEVEMENTS } = require('../src/metrics');
  const cr = ACHIEVEMENTS.find(a => a.id === 'the_creator'); assert.ok(cr && cr.test({ creator: 1 }) && !cr.test({}));
  const main = R('main.js');
  assert.ok(main.includes("cloud.account?.()?.owner && !store.getSettings().creatorMarked") && main.includes("recordMetric('creator')"));
  assert.ok(R('docs/companion/achlist.js').includes('"the_creator"'));
  ok('The Creator: only the Owner account unlocks it; N28C and Test Run can pin it');

  const M = require('../src/media'), S = M.SEP;
  const tab = M.parseMac(`Safari${S}tab${S}(2) Lofi beats to study to - YouTube${S}${S}${S}0${S}0`);
  assert.strictEqual(tab.title, 'Lofi beats to study to'); assert.ok(tab.tab);
  assert.ok(M.MAC_SCRIPT.includes('youtube.com') && M.MAC_SCRIPT.includes('Google Chrome'));
  const calls = []; const spot = `Spotify${S}paused${S}Song${S}Art${S}Alb${S}1${S}200000\n`;
  let md = M.createMedia({ platform: 'darwin', run: async (c, a) => { calls.push(a); return a.join(' ').includes('player state') ? spot : ''; } });
  assert.strictEqual(await md.control('pause'), 'Paused Spotify'); assert.ok(calls.some(a => a[1] === 'tell application "Spotify" to pause'));
  calls.length = 0; md = M.createMedia({ platform: 'darwin', run: async (c, a) => { calls.push(a); return ''; } });
  await md.control('next'); assert.ok(calls.some(a => a[0] === '-l' && a[1] === 'JavaScript' && /CGEventPost/.test(a[3]) && /17 << 16/.test(a[3])), 'nothing from Music/Spotify → the media key');
  ok('media: browser tabs count as now playing; the buttons press the media key for any other player; friendly replies');

  const dw = R('renderer/deskwidgets.html');
  const wcss = require('../renderer/cosmetics').widgetCss();   // 4.4.0: the frames moved into cosmetics.js
  for (const k of ['neon', 'aurora', 'frost']) assert.ok(wcss.includes(`body.wt-${k} .dw`), k);
  assert.ok(wcss.includes('@property --wta'));
  assert.ok(require('../renderer/cosmetics').KINDS.some(([k, l]) => k === 'wtheme' && l === 'Widget frames'));
  ok('widget frames (neon glow, aurora ring, terminal corners, paper tape…); admins with everything unlocked can pick them');

  assert.ok(main.includes('function hudStart()') && main.includes("hud.on('resize', hudKeep)") && main.includes('hudBounds'));
  assert.ok(R('renderer/hud.js').includes("back.className = 'ev-back'") && /\.ev-back \{ position: fixed/.test(R('renderer/hud.css')));
  assert.ok(main.includes("focus: (() => { const f = focus.state()") && main.includes('spaces.filter(x => !x.builtin)') && main.includes('return { plan: companion?.actions?.plan?.() || null }'));
  ok('the chat window remembers its size; events have their own backdrop; N28C gets the Focus timer, your own Spaces and fresh goals');

  const n43 = R('docs/companion/n43.js'); new vm.Script(n43);
  for (const k of ['function focusPill', 'const planPend = new Map()', 'planOp = async function', 'let pinsCache', "ic('sparkles')", 'n43-report', 'YOUR SPACES']) assert.ok(n43.includes(k), k);
  assert.ok(!/<i>⏮<\/i>|<i>⏯<\/i>|🎛/.test(n43 + R('renderer/settings.js')), 'no emoji buttons');
  assert.ok(R('docs/embed/chat.js').includes('Can’t reach Nexus right now'));
  const ch = require('../docs/whats-new/changes.json').find(x => x.version === '4.3.1'); assert.ok(ch); assert.ok(!/axiom/i.test(JSON.stringify(ch)));
  ok('N28C: Today strip, Focus timer, Spaces row, report card alone, goals without flicker, icons not emojis; 4.3.1 notes');
  // 4.3.2
  assert.ok(R('renderer/deskwidgets.js').includes('<i class="dwf"></i>') && wcss.includes('#w { isolation: isolate; }') && wcss.includes('wfFlicker'));
  for (const k of ['n43-trow', 'n43-home', 'FOCUS TIMER', 'n43-tbig', 'Stop Focus', 'Play/Pause', 'color-mix(in srgb,var(--accent) 35%,#ffffff)']) assert.ok(n43.includes(k), k);
  assert.ok(require('../docs/whats-new/changes.json').some(x => x.version === '4.3.2'));
  ok('4.3.2: widget frames with their own pieces; N28C home row under Ask Nexus; Focus timer section with light numbers; 3-across remote');
  console.log(`v4.3.1: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
