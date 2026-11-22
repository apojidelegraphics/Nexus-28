// 3.13: Spotify, more connectors, activity chips everywhere, the answer bar (⋯ menu, thumbs always), answer widgets,
// desktop + iPhone widgets, new orb skins, Windows wake engine, meeting notes / Watch & guide / backlinks / copy fixes,
// Second Look identity fix, the home page "no subscription needed", and replies to test results.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const main = R('main.js'), preload = R('preload.js'), settings = R('renderer/settings.js'), chatview = R('renderer/chatview.js');

(async () => {
  // ---------- Spotify
  const sp = require('../src/spotify');
  const tools = require('../src/tools');
  for (const k of Object.keys(sp.TOOLS)) assert.ok(tools.DEFS[k], 'tool ' + k);
  assert.ok(tools.needsConfirm('spotify_create_playlist') && !tools.needsConfirm('spotify_play'));
  const names = (o, text = '') => tools.buildToolset({ agentic: o.agentic, settings: { spotify: o.sp }, text, platform: 'linux' }).labels;
  assert.ok(!names({ agentic: true, sp: {} }).includes('spotify_play'));
  assert.ok(names({ agentic: true, sp: { connected: true } }).includes('spotify_play'));
  assert.ok(!names({ agentic: false, sp: { connected: true } }, 'what is the capital of France').includes('spotify_play'));
  assert.ok(names({ agentic: false, sp: { connected: true } }, 'play some music').includes('spotify_play'));
  assert.ok(!names({ agentic: true, sp: { connected: true, enabled: false } }).includes('spotify_play'));
  // a fake Spotify: token refresh, search → play, errors in plain words
  let keys = { spotify: JSON.stringify({ client_id: 'c'.repeat(32), refresh_token: 'r1', access_token: 'old', expires_at: 0 }) }; const calls = [];
  const fake = async (url, o = {}) => {
    calls.push([o.method || 'GET', url]);
    const J = (status, body) => ({ ok: status < 400, status, statusText: '', json: async () => body });
    if (url.includes('accounts.spotify.com/api/token')) return J(200, { access_token: 'new', expires_in: 3600 });
    if (url.includes('/search')) return J(200, { tracks: { items: [{ name: 'Clair de Lune', artists: [{ name: 'Debussy' }], uri: 'spotify:track:abc' }] } });
    if (url.endsWith('/me/player/play') && o.method === 'PUT') return { ok: true, status: 204, json: async () => ({}) };
    if (url.includes('/me/player/next')) return J(404, { error: { message: 'Player command failed: No active device found' } });
    if (url.includes('/me/player/volume')) return J(403, { error: { message: 'Player command failed: Premium required' } });
    return J(200, {});
  };
  const s = sp.createSpotify({ getKey: k => keys[k], setKey: (k, v) => { keys[k] = v; }, openExternal: () => {}, fetch: fake });
  const r = await s.call('spotify_play', { query: 'clair de lune' });
  assert.ok(/Playing Clair de Lune by Debussy/.test(r.text), r.text);
  assert.strictEqual(JSON.parse(keys.spotify).access_token, 'new');
  assert.ok(calls.some(([m, u]) => m === 'PUT' && u.endsWith('/me/player/play')));
  await assert.rejects(s.call('spotify_control', { action: 'next' }), /No Spotify device is open/);
  await assert.rejects(s.call('spotify_control', { action: 'volume', volume: 30 }), /Premium/);
  assert.ok(!(await s.connect('nope')).ok);
  s.disconnect(); assert.strictEqual(keys.spotify, '');
  await assert.rejects(s.call('spotify_now_playing'), /isn.t connected/);
  const exec = await tools.execute('spotify_now_playing', {}, { settings: {}, spotify: s });
  assert.ok(exec.error && /connected/.test(exec.content));
  assert.ok(main.includes("ipcMain.handle('spotify:connect'") && main.includes('guide: guideCtx(), spotify })') && preload.includes("connect: id => call('spotify:connect', id)"));
  assert.ok(settings.includes('id="spotifyCard"') && settings.includes('http://127.0.0.1:8765/callback') && sp.REDIRECT === 'http://127.0.0.1:8765/callback');
  assert.ok(R('docs/guide/index.html').includes('id="conn-spotify"') && R('src/guide.js').includes("['Spotify',"));
  ok('Spotify: tools only when connected, token refresh, search → play, plain-word errors, Settings card, guide');

  const { PRESETS } = require('../src/mcp');
  for (const p of ['linear', 'asana', 'atlassian', 'git', 'sqlite', 'time', 'thinking']) assert.ok(PRESETS.find(x => x.preset === p), p);
  assert.strictEqual(PRESETS[PRESETS.length - 1].preset, 'custom');
  ok('more connector presets (custom stays last)');

  // ---------- chips everywhere
  const { trailOf, chipKind } = require('../src/companion');
  assert.deepStrictEqual(['web_search', 'fetch_url', 'spotify_play', 'calendar_events', 'weather', 'open_app', 'mcp__notion__search', 'nexus_guide'].map(chipKind), ['search', 'read', 'music', 'calendar', 'weather', 'device', 'connector', 'guide']);
  const t = trailOf([{ tool: 'spotify_play', label: 'Playing on Spotify', detail: 'lofi', status: 'ok' }, { tool: 'x', status: 'skipped' }, { tool: 'calendar_create_event', label: 'Add event', status: 'denied' }]);
  assert.strictEqual(t.length, 2); assert.strictEqual(t[0].label, 'Playing on Spotify'); assert.ok(!t[1].ok && t[1].note === 'declined');
  const app = R('docs/companion/app.js'), tj = R('docs/try/try.js');
  assert.ok(app.includes("music: ['note', 'Spotify']") && app.includes('NexusIcons?.icon(n)') && !/🔍|📄/.test(app.match(/const trailHtml[^\n]+/)[0]));
  assert.ok(tj.includes("knowledge: ['books', 'Looked up']") && tj.includes("chip({ kind: 'chats'") && tj.includes("chip({ kind: 'think'") && tj.includes("kind: 'look'") && !tj.includes("'🔍 Searched'"));
  ok('activity chips for every action in N28C, and the applicable ones in Test Run, drawn with the icon set');

  // ---------- answer bar, copy, widgets, skins
  assert.ok(chatview.includes('mt-more') && chatview.includes('opts.onRate && !m.error') && chatview.includes('Send to my phone'));
  for (const f of ['renderer/chatview.js', 'renderer/hud.js', 'renderer/settings.js', 'renderer/widgets.js']) assert.ok(R(f).startsWith('window.nxCopy = window.nxCopy ||'), f);
  assert.ok(main.includes("ipcMain.handle('clip:write'") && main.includes('clipboard-sanitized-write'));
  const fk = require('../src/featurekit');
  assert.deepStrictEqual(fk.GENERAL_WIDGETS, ['timeline', 'compare', 'timer']);
  assert.ok(R('renderer/widgets.js').includes('nexus-timeline') && main.includes('generalWidgetsPrompt()'));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'renderer', 'deskwidgets.html')) && main.includes('function syncDeskWidgets') && !/\p{Extended_Pictographic}/u.test(R('renderer/deskwidgets.js')));
  assert.ok(!/\p{Extended_Pictographic}/u.test(R('docs/widget/nexus-widget.js')) && R('docs/widget/nexus-widget.js').includes('accessoryCircular'));
  for (const k of ['tide', 'vortex', 'circuit', 'solar']) assert.ok(main.includes(k + ':') && R('renderer/orb.js').includes(`'${k}'`) || R('renderer/orb.js').includes(k), k);
  ok('answer bar (⋯ menu, thumbs always), copy everywhere, answer widgets, desktop and iPhone widgets with no emojis, new skins');

  // ---------- fixes
  assert.ok(main.includes("ipcMain.handle('wake:check'") && fs.existsSync(path.join(__dirname, '..', 'renderer', 'wake.js')) && settings.includes('data-voice="wakeEngine"'));
  assert.ok(main.includes("ipcMain.handle('meeting:recording'") && R('renderer/meeting.js').includes('recording?.(true)'));
  assert.ok(main.includes("model: 'openrouter/free' }") && main.includes('messages.some(m => m.images?.length)'));
  assert.ok(main.includes('you are (nexus|neodela|flash|lyte|paragon)'));
  assert.ok(main.includes('async function checkTestReplies') && settings.includes('test-reply'));
  ok('Windows wake engine, meeting notes keep listening, pictures on the free key, Second Look identity, test replies');

  // ---------- site
  const home = R('docs/index.html');
  assert.ok(home.includes('No subscription needed.') && home.includes('id="free"') && home.includes('Do I need a subscription?'));
  const readme = R('README.md');
  assert.ok(readme.includes('no subscription needed') && readme.includes('## The website') && readme.includes('docs/guide/img/activity-chips.webp') && !readme.includes('- **** '));
  for (const f of ['activity-chips', 'answer-menu', 'answer-widgets', 'answer-compare', 'desk-widgets', 'orb-skins']) assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'guide', 'img', f + '.webp')), f);
  const gif = fs.readFileSync(path.join(__dirname, '..', 'docs', 'assets', 'hero.gif'));
  assert.ok(gif.slice(0, 6).toString() === 'GIF89a' && gif.length < 3e6);
  const ch = JSON.parse(R('docs/whats-new/changes.json'))[0];
  assert.strictEqual(ch.version, require('../package.json').version);
  assert.ok(!ch.highlights.join(' ').match(/\p{Extended_Pictographic}/u) && !/axiom/i.test(ch.highlights.join(' ')));
  ok('home page and README say no subscription is needed; new screenshots, hero.gif, changelog');
  console.log(`v3.13: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
