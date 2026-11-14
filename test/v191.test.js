// v1.9.1 tests: N28C reads aloud in your Mac's voice, compact composer, orb follows the agent, new empty-state title,
// and the Mac refreshes its icon cache after an update.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const { Companion } = require('../src/companion');
  const asked = [];
  const comp = new Companion({ cloud: { session: {} }, convos: { summary: () => ({ list: [], spaces: [] }) }, study: { stats: () => ({}) }, metrics: { summary: () => ({ achievements: [] }) },
    routines: { list: () => [] }, personas: () => [], push: null, settings: () => ({}), version: '1.9.1', enabled: () => true,
    actions: { tts: async a => { asked.push(a); return { id: 't1', mime: 'audio/mpeg', bytes: 10 }; }, ttsLabel: () => 'ElevenLabs' } });
  assert.deepStrictEqual(await comp.request({ meta: { op: 'tts', text: 'Hello there', agent: 'lyte' } }), { ok: true, id: 't1', mime: 'audio/mpeg', bytes: 10 });
  assert.deepStrictEqual(asked[0], { text: 'Hello there', agent: 'lyte' });
  assert.strictEqual(comp.status().voice.label, 'ElevenLabs');
  ok('phone asks the Mac to speak (per-agent voice), status names the Mac voice');

  const voice = require('../src/voice');
  assert.strictEqual(typeof voice.renderSystem, 'function');
  const main = read('main.js');
  assert.ok(/async function phoneTts/.test(main) && main.includes("companion.put('tts'") && main.includes('voice.renderSystem('));
  assert.ok(/function refreshIconCache/.test(main) && main.includes('lsregister') && main.includes('iconRefreshed'));
  ok('Mac renders speech (ElevenLabs / OpenAI / macOS voice to .m4a); icon cache refreshed once per version');

  const app = read('docs/companion/app.js'), html = read('docs/companion/index.html');
  assert.ok(app.includes('Ask Nexus anything, from anywhere') && !app.includes('Ask your Mac anything'));
  assert.ok(app.includes('const voicePref') && app.includes('function unlockAudio') && app.includes("request('tts'") && app.includes("Your Mac's voice"));
  assert.ok(app.includes("orbs.forEach(o => o.setColor(a.color))"), 'orb follows the agent');
  assert.ok(html.includes('class="pill"') && html.includes('id="featBtn"') && !html.includes('id="agentName"'), 'compact composer');
  ok('N28C: voice picker, Mac voice playback, agent-colored orb, compact composer, new title');
  console.log(`v1.9.1: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
