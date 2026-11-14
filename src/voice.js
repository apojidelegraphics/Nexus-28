// Nexus voice layer: NexusCore helper (on-device STT + Apple Foundation Models), macOS `say`
// (uses the System Voice, which can be a Siri voice), and ElevenLabs / OpenAI cloud speech.
const { spawn, execFile } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');

// ---------------- NexusCore helper process
class Helper extends EventEmitter {
  constructor(binPath) {
    super();
    this.binPath = binPath;
    this.proc = null;
    this.buf = '';
  }
  available() { try { fs.accessSync(this.binPath, fs.constants.X_OK); return true; } catch { return false; } }
  ensure() {
    if (this.proc) return true;
    if (!this.available()) return false;
    this.proc = spawn(this.binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', d => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        try { this.emit('event', JSON.parse(line)); } catch {}
      }
    });
    this.proc.stderr.on('data', () => {});
    this.proc.on('exit', code => {
      this.proc = null; this.buf = '';
      this.emit('exit', code);
    });
    this.proc.stdin.on('error', () => {});
    return true;
  }
  send(obj) {
    if (!this.ensure()) return false;
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
    return true;
  }
  // One-shot request: resolves with the first event for `id` whose type is in `types`.
  request(obj, types, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      if (!this.send(obj)) return reject(new Error('NexusCore helper is not built. Run: npm run build:helper'));
      const onEvent = ev => {
        const sameId = ev.id === obj.id || (obj.cmd === 'info' && ev.event === 'info' && ev.id === undefined);
        if (!sameId || !types.includes(ev.event) && ev.event !== 'error') return;
        cleanup();
        ev.event === 'error' ? reject(new Error(ev.error)) : resolve(ev);
      };
      const onExit = () => { cleanup(); reject(new Error('NexusCore helper stopped unexpectedly.')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('NexusCore helper timed out.')); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.off('event', onEvent); this.off('exit', onExit); };
      this.on('event', onEvent); this.once('exit', onExit);
    });
  }
  async info() {
    if (!this.available()) return { built: false };
    try {
      const ev = await this.request({ cmd: 'info', id: 'info' }, ['info'], 5000);
      return { built: true, stt: !!ev.stt, eventkit: !!ev.eventkit, wake: !!ev.wake, screen: !!ev.screen, ax: !!ev.ax, transcribeFile: !!ev.transcribeFile, version: ev.version || (ev.eventkit ? 3 : 2), fm: ev.fm };
    } catch (e) { return { built: true, error: e.message }; }
  }
  kill() { this.proc?.kill(); }
}

// Flatten a chat into a single prompt for Apple Foundation Models (small context window).
function fmPrompt(messages) {
  return messages.slice(-6).map(m => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`).join('\n\n').slice(-6000) + '\n\nAssistant:';
}

// ---------------- Speakable text
function speakable(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, ' (code omitted) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^[\s:|-]+$/gm, '')
    .replace(/[*_~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------- macOS `say`
let sayProc = null;
function sayCommand() { return process.env.NEXUS_SAY_BIN || 'say'; }

function speakSystem(text, { voice = '', rate = 0 } = {}) {
  stopSpeaking();
  return new Promise(resolve => {
    const args = [];
    if (voice) args.push('-v', voice);
    if (rate) args.push('-r', String(rate));
    args.push('--', text);
    const p = spawn(sayCommand(), args, { stdio: 'ignore' });
    sayProc = p;
    p.on('error', () => { if (sayProc === p) sayProc = null; resolve({ ok: false, error: 'macOS speech (say) is unavailable.' }); });
    p.on('exit', (code, signal) => {
      if (sayProc === p) sayProc = null;
      resolve({ ok: true, interrupted: !!signal });
    });
  });
}
// Render speech to an AAC (.m4a) file instead of the speakers — for N28C, so your phone hears your Mac's voice.
function renderSystem(text, { voice = '', rate = 0, tmpDir = require('os').tmpdir() } = {}) {
  return new Promise((resolve, reject) => {
    const out = require('path').join(tmpDir, `nexus-tts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.m4a`);
    const args = ['-o', out, '--file-format=m4af', '--data-format=aac'];
    if (voice) args.push('-v', voice);
    if (rate) args.push('-r', String(rate));
    args.push('--', text);
    execFile(sayCommand(), args, { timeout: 120000 }, err => {
      if (err) return reject(new Error('macOS speech (say) could not render audio.'));
      try { const audio = fs.readFileSync(out); fs.unlinkSync(out); resolve({ audio, mime: 'audio/mp4' }); } catch (e) { reject(e); }
    });
  });
}
function stopSpeaking() {
  if (sayProc) { try { sayProc.kill('SIGTERM'); } catch {} sayProc = null; }
}
function listSystemVoices() {
  return new Promise(resolve => {
    execFile(sayCommand(), ['-v', '?'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve([]);
      const voices = [];
      for (const line of stdout.split('\n')) {
        const m = line.match(/^(.+?)\s+([a-z]{2,3}[_-][A-Za-z0-9_-]+)\s+#/);
        if (m) voices.push({ name: m[1].trim(), lang: m[2] });
      }
      resolve(voices);
    });
  });
}

// ---------------- Cloud speech
const ELEVEN = 'https://api.elevenlabs.io/v1';
const OPENAI = 'https://api.openai.com/v1';

async function bad(res, label) {
  if (res.ok) return;
  let msg = '';
  try { const t = await res.text(); try { const j = JSON.parse(t); msg = j.detail?.message || j.detail || j.error?.message || t; } catch { msg = t; } } catch {}
  if (typeof msg !== 'string') msg = JSON.stringify(msg);
  throw new Error(`${label} ${res.status}: ${msg.slice(0, 200)}`);
}

async function ttsElevenLabs({ key, voice, text, base = ELEVEN }) {
  if (!key) throw new Error('No ElevenLabs key set (Settings → Voice).');
  const res = await fetch(`${base}/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_turbo_v2_5' })
  });
  await bad(res, 'ElevenLabs');
  return { audio: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
}
async function ttsOpenAI({ key, voice, text, base = OPENAI }) {
  if (!key) throw new Error('No OpenAI key set (Settings → Providers).');
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3' })
  });
  await bad(res, 'OpenAI TTS');
  return { audio: Buffer.from(await res.arrayBuffer()), mime: 'audio/mpeg' };
}

function audioForm(field, audio, mime, extra) {
  const form = new FormData();
  const ext = /mp4|m4a/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : 'webm';
  form.append(field, new Blob([audio], { type: mime }), `speech.${ext}`);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}
async function sttOpenAI({ key, audio, mime, base = OPENAI }) {
  if (!key) throw new Error('No OpenAI key set (Settings → Providers).');
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` },
    body: audioForm('file', audio, mime, { model: 'gpt-4o-mini-transcribe' })
  });
  await bad(res, 'OpenAI transcription');
  return (await res.json()).text || '';
}
async function sttElevenLabs({ key, audio, mime, base = ELEVEN }) {
  if (!key) throw new Error('No ElevenLabs key set (Settings → Voice).');
  const res = await fetch(`${base}/speech-to-text`, {
    method: 'POST', headers: { 'xi-api-key': key },
    body: audioForm('file', audio, mime, { model_id: 'scribe_v1' })
  });
  await bad(res, 'ElevenLabs transcription');
  return (await res.json()).text || '';
}

const ELEVEN_VOICES = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' }
];
const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'];

module.exports = {
  Helper, fmPrompt, speakable,
  speakSystem, renderSystem, stopSpeaking, listSystemVoices,
  ttsElevenLabs, ttsOpenAI, sttOpenAI, sttElevenLabs,
  ELEVEN_VOICES, OPENAI_VOICES
};
