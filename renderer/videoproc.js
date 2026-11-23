// 4.0: watches a video file for an agent, in a hidden window: stills spread across it (JPEG, 768px wide) and the sound as
// 16 kHz mono WAV (first 10 minutes) for speech-to-text. Chromium decodes everything here; nothing is uploaded from this page.
//   window.processVideo(fileUrl, { frames }) → { duration, width, height, times, frames: [dataURL], wav: base64|'' , audioError }
(function () {
  const wait = (el, ev, ms = 20000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('Timed out reading the video.')), ms); el.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true }); el.addEventListener('error', () => { clearTimeout(t); rej(new Error('This video format can\'t be opened (try MP4).')); }, { once: true }); });
  function wav(samples, rate) {
    const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
    return new Uint8Array(b);
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  window.processVideo = async (url, { frames = 8 } = {}) => {
    const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = url;
    await wait(v, 'loadedmetadata');
    const dur = isFinite(v.duration) ? v.duration : 0;
    const n = Math.max(1, Math.min(frames, dur < 4 ? 1 : dur < 15 ? 4 : dur < 60 ? 6 : frames));
    const times = Array.from({ length: n }, (_, i) => n === 1 ? Math.min(dur / 2, 1) : Math.min(dur - 0.05, dur * (i + 0.5) / n));
    const W = Math.min(768, v.videoWidth || 768), H = Math.round(W * (v.videoHeight || 432) / (v.videoWidth || 768));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const shots = [];
    for (const t of times) {
      try { v.currentTime = t; await wait(v, 'seeked', 15000); g.drawImage(v, 0, 0, W, H); shots.push(c.toDataURL('image/jpeg', 0.8)); } catch {}
    }
    let wavB64 = '', audioError = '';
    try {
      const buf = await new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer'; x.onload = () => x.response ? res(x.response) : rej(new Error('no data')); x.onerror = () => rej(new Error('Could not read the file.')); x.send(); });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const audio = await ac.decodeAudioData(buf); ac.close();
      const secs = Math.min(audio.duration, 600), rate = 16000;
      const off = new OfflineAudioContext(1, Math.ceil(secs * rate), rate);
      const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start(0, 0, secs);
      const out = (await off.startRendering()).getChannelData(0);
      let peak = 0; for (let i = 0; i < out.length; i += 64) peak = Math.max(peak, Math.abs(out[i]));
      if (peak > 0.01) wavB64 = b64(wav(out, rate)); else audioError = 'silent';
    } catch (e) { audioError = /decode|Unable/i.test(e.message) ? 'no sound track' : e.message; }
    return { duration: dur, width: v.videoWidth, height: v.videoHeight, times: times.slice(0, shots.length), frames: shots, wav: wavB64, audioError };
  };
})();
