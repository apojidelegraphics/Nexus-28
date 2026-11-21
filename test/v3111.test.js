// v3.11.1: rules in every message, stats/Spaces sync, Windows wake + orb errors, retries, map button, gold crown.
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let n = 0; const ok = m => { n++; console.log('  ✓ ' + m); };
(async () => {
  const main = read('main.js'), wh = read('src/winhelper.js');
  assert.ok(main.includes('(Follow my rules: ') && main.includes("messages.map(m => m.role).lastIndexOf('user')"));
  ok('your rules ride along with your latest message');

  const { createStatSync } = require('../src/statsync');
  let writes = 0; const s = createStatSync({ cloud: { session: {}, write: async () => { writes++; }, authedGet: async () => [] }, metrics: { raw: () => ({ points: 5 }), setOthers() {}, others: [] }, device: () => 'mac' });
  assert.strictEqual(typeof s.nudge, 'function'); await s.cycle(); assert.strictEqual(writes, 1);
  assert.ok(main.includes('statSync?.nudge?.()') && main.includes("statSync?.start(); statSync?.cycle?.()"));
  const { createChatSync } = require('../src/chatsync');
  let settings = { chatSync: { enabled: true } }; const rows = [];
  const data = { activeId: null, list: [], spaces: [{ id: 'sLOC', name: 'Routines', builtin: 'routines' }] };
  const cs = createChatSync({ cloud: { session: {}, rest: async () => [{ id: '__spaces__', updated_at: new Date().toISOString(), device: 'pc', data: { at: Date.now(), spaces: [{ id: 'sR', name: 'Routines', builtin: 'routines' }, { id: 'sX', name: 'School' }] } }, { id: 'c2', updated_at: new Date().toISOString(), device: 'pc', data: { id: 'c2', title: 'y', updated: Date.now(), spaceId: 'sR' } }], write: async (m, p, b) => rows.push(...b) },
    convos: { load: () => data, save() {} }, getSettings: () => settings, setSettings: p => Object.assign(settings, p), device: 'mac' });
  await cs.pull();
  assert.deepStrictEqual(data.spaces.map(x => x.id), ['sLOC', 'sX']); assert.strictEqual(data.list[0].spaceId, 'sLOC');
  data.spaces.push({ id: 's' + Date.now().toString(36) + 'abc', name: 'New one' }); await cs.push();
  assert.ok(rows.some(r => r.id === '__spaces__' && r.data.spaces.length === 3));
  ok('points sync a few seconds after they change; Spaces sync with chats (built-in ones matched by kind)');

  assert.ok(wh.includes("GetMethod('Add').Invoke($r.Constraints") && wh.includes("winrt-dictation") && wh.includes('Windows said: $($_.Exception.Message)'));
  const src = wh + ';return psError;'; const psError = new Function('require', 'module', 'exports', 'process', src)(require, { exports: {} }, {}, process);
  assert.strictEqual(psError('#< CLIXML\r\n<Objs><Obj S="progress"><AV>Preparing modules for first use.</AV></Obj><S S="Error">Add-Type : Cannot add type._x000D__x000A_</S></Objs>'), 'Add-Type : Cannot add type.');
  assert.ok(wh.includes("highlight watcher: $($_.Exception.Message)") && wh.includes("if (ev.event === 'error') return emit({ event: 'sel_watch', ok: false"));
  ok('Windows: wake phrases added another way (or dictation), real reasons instead of #< CLIXML');

  const prov = read('src/providers.js');
  assert.ok(prov.includes('const TRANSIENT') && /idle timeout\|/.test(prov) && prov.includes('attempt >= 2'));
  const providers = require('../src/providers');
  let calls = 0; const realFetch = global.fetch;
  global.fetch = async () => { calls++; if (calls === 1) throw new Error('terminated'); return new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }); };
  const r = await providers.chat({ provider: 'openrouter', model: 'x/y', key: 'k', messages: [{ role: 'user', content: 'q' }] });
  global.fetch = realFetch;
  assert.ok(r.text === 'hi' && calls === 2);
  ok('a dropped connection is tried again before any words show');

  assert.ok(read('renderer/mapview.js').includes("LABEL: ICON + '<span>Map</span>'") && read('docs/try/try.js').includes('MapView.LABEL') && read('docs/companion/app.js').includes('MapView?.LABEL'));
  assert.ok(read('renderer/icons.js').includes('.ico.ico-crown{fill:#ffd36b'));
  assert.ok(read('supabase/functions/try-chat/index.ts').includes("'apoji://admin'") && read('supabase/functions/premium-chat/index.ts').includes("'Access-Control-Allow-Origin': '*'"));
  assert.ok(require('../package.json').version >= '3.11.1');
  ok('map button, gold crown, functions reachable from Apoji Admin, version 3.11.1');
  console.log(`v3.11.1: ${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
