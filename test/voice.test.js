// Voice layer tests: helper protocol, macOS say wrapper, cloud TTS/STT wire formats.
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const voice = require('../src/voice');

let n = 0; const ok = m => { n++; console.log('  ✓', m); };
const seen = {};

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    seen[req.url.split('?')[0]] = { headers: req.headers, body, url: req.url };
    if (req.url.startsWith('/el/text-to-speech/')) { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.from('ID3fake-mp3')); }
    if (req.url === '/oa/audio/speech') { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.from('ID3oa')); }
    if (req.url === '/oa/audio/transcriptions') { res.writeHead(200); return res.end(JSON.stringify({ text: 'hello from whisper' })); }
    if (req.url === '/el/speech-to-text') { res.writeHead(200); return res.end(JSON.stringify({ text: 'hello from scribe' })); }
    if (req.url.startsWith('/bad/')) { res.writeHead(401); return res.end(JSON.stringify({ detail: { message: 'invalid_api_key' } })); }
    res.writeHead(404); res.end();
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const B = `http://127.0.0.1:${server.address().port}`;

  // ---- speakable
  assert.strictEqual(voice.speakable('**Hi** there!\n\n- one\n- two\n```js\nx()\n```\nSee [docs](https://x.y) or https://a.b/c'),
    'Hi there! one two (code omitted) See docs or a link');
  ok('markdown → speakable text');

  // ---- fmPrompt
  const p = voice.fmPrompt([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]);
  assert.ok(p.startsWith('User: a') && p.includes('Assistant: b') && p.endsWith('Assistant:'));
  ok('Foundation Models prompt flattening');

  // ---- Helper protocol (fake helper)
  const missing = new voice.Helper('/nope/nexuscore');
  assert.strictEqual(missing.available(), false);
  assert.deepStrictEqual(await missing.info(), { built: false });
  await assert.rejects(missing.request({ cmd: 'fm', id: 'x' }, ['fm']), /not built/);
  ok('missing helper reported cleanly');

  const h = new voice.Helper(path.join(__dirname, 'fake-helper.js'));
  assert.deepStrictEqual(await h.info(), { built: true, stt: true, eventkit: true, wake: true, screen: true, ax: true, transcribeFile: true, version: 6, fm: 'available' });
  process.env.FAKE_HELPER_OLD = '1';
  const old = new voice.Helper(path.join(__dirname, 'fake-helper.js'));
  const oi = await old.info();
  assert.ok(oi.built && oi.eventkit === false && oi.version === 2, JSON.stringify(oi));
  old.kill(); delete process.env.FAKE_HELPER_OLD;
  ok('helper info (and an outdated helper is detected)');
  assert.strictEqual((await h.request({ cmd: 'fm', id: 'f1', prompt: 'hi' }, ['fm'])).text, 'on-device says hi');
  await assert.rejects(h.request({ cmd: 'fm', id: 'f2', prompt: 'FAIL' }, ['fm']), /model busy/);
  ok('helper Foundation Models request + error');

  const events = [];
  await new Promise(resolve => {
    const on = ev => { if (ev.id !== 's1') return; events.push(ev.event); if (ev.event === 'partial' && ev.text.endsWith('is it')) h.send({ cmd: 'stop', id: 's1' }); if (ev.event === 'final') { h.off('event', on); resolve(); } };
    h.on('event', on);
    h.send({ cmd: 'listen', id: 's1' });
  });
  assert.deepStrictEqual(events, ['listening', 'level', 'partial', 'partial', 'final']);
  ok('helper listen → partials → stop → final');
  h.kill();

  // ---- macOS say wrapper (fake say)
  process.env.NEXUS_SAY_BIN = path.join(__dirname, 'fake-say.sh');
  const log = path.join(os.tmpdir(), 'nexus-say.log');
  process.env.FAKE_SAY_LOG = log;
  let r = await voice.speakSystem('Hello Lucas', { voice: 'Albert', rate: 190 });
  assert.deepStrictEqual(r, { ok: true, interrupted: false });
  assert.deepStrictEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['-v', 'Albert', '-r', '190', '--', 'Hello Lucas']);
  ok('say: voice, rate and text passed safely');
  process.env.FAKE_SAY_SECS = '5';
  const t0 = Date.now();
  const pending = voice.speakSystem('long speech');
  setTimeout(() => voice.stopSpeaking(), 100);
  r = await pending;
  assert.ok(r.interrupted && Date.now() - t0 < 2000);
  ok('say: barge-in stops speech');
  r = await voice.speakSystem('-- not a flag');
  assert.ok(r.ok);
  ok('say: text starting with dashes is not treated as a flag');
  const voices = await voice.listSystemVoices();
  assert.deepStrictEqual(voices.map(v => v.name), ['Albert', 'Eddy (English (US))', 'Amélie']);
  ok('say: voice list parsed');

  // ---- Cloud TTS
  let a = await voice.ttsElevenLabs({ key: 'ek', voice: 'JBFqnCBsd6RMkjVDRZzb', text: 'hi', base: B + '/el' });
  assert.strictEqual(a.audio.toString(), 'ID3fake-mp3');
  const el = seen['/el/text-to-speech/JBFqnCBsd6RMkjVDRZzb'];
  assert.strictEqual(el.headers['xi-api-key'], 'ek');
  assert.strictEqual(JSON.parse(el.body).text, 'hi');
  ok('ElevenLabs TTS');
  a = await voice.ttsOpenAI({ key: 'ok', voice: 'alloy', text: 'hi', base: B + '/oa' });
  assert.strictEqual(a.audio.toString(), 'ID3oa');
  assert.strictEqual(JSON.parse(seen['/oa/audio/speech'].body).voice, 'alloy');
  ok('OpenAI TTS');
  await assert.rejects(voice.ttsElevenLabs({ key: 'k', voice: 'v', text: 'x', base: B + '/bad' }), /401: invalid_api_key/);
  await assert.rejects(voice.ttsElevenLabs({ key: '', voice: 'v', text: 'x' }), /No ElevenLabs key/);
  ok('TTS errors surface');

  // ---- Cloud STT (multipart upload)
  const audio = Buffer.from('fake-webm-bytes');
  assert.strictEqual(await voice.sttOpenAI({ key: 'ok', audio, mime: 'audio/webm', base: B + '/oa' }), 'hello from whisper');
  let body = seen['/oa/audio/transcriptions'].body.toString();
  assert.ok(body.includes('fake-webm-bytes') && body.includes('gpt-4o-mini-transcribe') && body.includes('speech.webm'));
  assert.strictEqual(seen['/oa/audio/transcriptions'].headers.authorization, 'Bearer ok');
  ok('OpenAI transcription upload');
  assert.strictEqual(await voice.sttElevenLabs({ key: 'ek', audio, mime: 'audio/mp4', base: B + '/el' }), 'hello from scribe');
  body = seen['/el/speech-to-text'].body.toString();
  assert.ok(body.includes('scribe_v1') && body.includes('speech.m4a'));
  ok('ElevenLabs transcription upload');

  console.log(`\n${n} voice checks passed`);
  server.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
