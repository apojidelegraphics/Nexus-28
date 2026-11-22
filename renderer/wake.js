// 3.13 (Windows): "Hey Nexus" without Windows speech. Listens to the mic in this hidden window, finds short bursts of
// speech (0.4 to 2.6 seconds, the length of "Hey Nexus"), and sends only those to Nexus to check. Longer talking, music
// and silence are never sent. Runs only while Hey Nexus is on.
(async function () {
  const api = window.nexus, RATE = 16000;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch { return; }
  const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(2048, 1, 1), ratio = ctx.sampleRate / RATE;
  const FRAME = 2048 / ratio;                  // samples per frame at 16 kHz
  let floor = 0.006, speaking = false, voiced = 0, quiet = 0, buf = [], pre = [], busy = false, cool = 0;
  const wav = pcm => { const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true); return new Uint8Array(b); };
  const send = async frames => {
    const n = frames.reduce((s, f) => s + f.length, 0), secs = n / RATE;
    if (secs < 0.4 || secs > 2.6 || busy || Date.now() < cool) return;
    const pcm = new Int16Array(n); let o = 0; for (const f of frames) { pcm.set(f, o); o += f.length; }
    busy = true;
    try { const r = await api.wake.check(wav(pcm), secs); if (r?.woke) cool = Date.now() + 4000; if (r?.limited) cool = Date.now() + 10 * 60e3; } catch {}
    busy = false;
  };
  proc.onaudioprocess = e => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const inp = e.inputBuffer.getChannelData(0), n = Math.floor(inp.length / ratio), out = new Int16Array(n);
    let sum = 0; for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, inp[Math.floor(i * ratio)])); out[i] = x * 0x7fff; sum += x * x; }
    const rms = Math.sqrt(sum / Math.max(1, n)), on = rms > Math.max(0.012, floor * 3.2);
    if (!speaking) floor = floor * 0.97 + Math.min(rms, 0.05) * 0.03;   // follows the room's background noise
    if (on) { voiced++; quiet = 0; } else quiet++;
    if (!speaking) {
      pre.push(out); if (pre.length > 3) pre.shift();                 // ~0.3 s before the speech starts
      if (voiced >= 2) { speaking = true; buf = pre.slice(); pre = []; }
      if (!on) voiced = 0;
    } else {
      buf.push(out);
      const secs = buf.length * FRAME / RATE;
      if (quiet >= 4 || secs > 3) { const frames = buf; speaking = false; voiced = 0; quiet = 0; buf = []; if (secs <= 3) send(frames); }
    }
  };
  src.connect(proc); proc.connect(ctx.destination);
})();
