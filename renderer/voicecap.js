// Shared voice I/O for the HUD and Quick Ask.
//   capture = NexusVoice.createCapture(api, { getState, onPartial, onLevel })
//     await capture.start()  → transcript string ('' if nothing heard, null if cancelled)
//     capture.stop()         → finish now and transcribe
//     capture.cancel()
//   speaker = NexusVoice.createSpeaker(api, { onLevel, getSettings })
//     await speaker.speak(text, purpose?, { persona, onStart }); speaker.stop()
//     onStart({ mode: 'say', wpm }) as macOS starts speaking, or ({ mode: 'audio', audio }) for cloud voices
//     (used for read-along highlighting)
(function () {
  const SILENCE_MS = 1500;      // stop after this much quiet once you've spoken
  const NO_SPEECH_MS = 8000;    // give up if nothing is said
  const MAX_MS = 45000;

  // One IPC subscription, dispatched to whichever helper session is live.
  const sessions = new Map();
  let subscribed = false;
  function subscribe(api) {
    if (subscribed) return;
    subscribed = true;
    api.voice.onEvent(ev => sessions.get(ev.id)?.(ev));
  }

  function pickEngine(state) {
    const want = state.settings.voice.stt;
    const keys = state.keys || {};
    if (want === 'apple') {
      if (state.helperBuilt) return 'apple';
      if (keys.openai) return 'openai';
      if (keys.elevenlabs) return 'elevenlabs';
      throw new Error('On-device speech needs the NexusCore helper (run "npm run build:helper"), or add an OpenAI/ElevenLabs key and choose it in Settings → Voice.');
    }
    if (!keys[want]) throw new Error(`Speech-to-text is set to ${want === 'openai' ? 'OpenAI' : 'ElevenLabs'} but no key is stored.`);
    return want;
  }

  function createCapture(api, { getState, onPartial = () => {}, onLevel = () => {} }) {
    subscribe(api);
    let active = null; // { stop, cancel }

    function startApple() {
      const id = 'stt-' + Math.random().toString(36).slice(2);
      return new Promise(async (resolve, reject) => {
        let text = '', silenceTimer = null, done = false;
        const finish = val => { if (done) return; done = true; cleanup(); resolve(val); };
        const fail = err => { if (done) return; done = true; cleanup(); reject(err); };
        const noSpeech = setTimeout(() => { if (!text) { api.voice.cancel(id); finish(''); } }, NO_SPEECH_MS);
        const maxTimer = setTimeout(() => api.voice.stop(id), MAX_MS);
        const cleanup = () => { clearTimeout(silenceTimer); clearTimeout(noSpeech); clearTimeout(maxTimer); sessions.delete(id); active = null; };
        sessions.set(id, ev => {
          if (ev.event === 'level') onLevel(ev.level);
          else if (ev.event === 'partial') {
            text = ev.text; onPartial(text);
            clearTimeout(silenceTimer);
            if (text.trim()) silenceTimer = setTimeout(() => api.voice.stop(id), SILENCE_MS);
          } else if (ev.event === 'final') finish((ev.text || text).trim());
          else if (ev.event === 'error') fail(new Error(ev.error));
        });
        active = {
          stop: () => api.voice.stop(id),
          cancel: () => { api.voice.cancel(id); finish(null); }
        };
        const r = await api.voice.listen(id);
        if (!r.ok) fail(new Error(r.error));
      });
    }

    function startCloud() {
      return new Promise(async (resolve, reject) => {
        let stream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
        catch { return reject(new Error('Microphone access was denied. Allow it in System Settings → Privacy & Security → Microphone.')); }
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        const chunks = [];
        const ac = new AudioContext();
        const analyser = ac.createAnalyser();
        analyser.fftSize = 1024;
        ac.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let heard = false, lastLoud = performance.now(), cancelled = false, raf = 0;
        const started = performance.now();

        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += v * v;
          const rms = Math.sqrt(sum / buf.length);
          onLevel(Math.min(1, rms * 12));
          const now = performance.now();
          if (rms > 0.03) { heard = true; lastLoud = now; }
          if ((heard && now - lastLoud > SILENCE_MS) || (!heard && now - started > NO_SPEECH_MS) || now - started > MAX_MS) return stopRec();
          raf = requestAnimationFrame(tick);
        };
        const stopRec = () => { cancelAnimationFrame(raf); if (rec.state !== 'inactive') rec.stop(); };
        const release = () => { stream.getTracks().forEach(t => t.stop()); ac.close().catch(() => {}); active = null; };

        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = async () => {
          release();
          if (cancelled) return resolve(null);
          if (!heard) return resolve('');
          onPartial('…');
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          const r = await api.voice.transcribe(new Uint8Array(await blob.arrayBuffer()), blob.type);
          r.ok ? resolve((r.text || '').trim()) : reject(new Error(r.error));
        };
        active = { stop: () => { heard = true; stopRec(); }, cancel: () => { cancelled = true; stopRec(); } };
        rec.start(250);
        raf = requestAnimationFrame(tick);
      });
    }

    return {
      engine: () => { try { return pickEngine(getState()); } catch { return null; } },
      start() {
        if (active) active.cancel();
        let engine;
        try { engine = pickEngine(getState()); } catch (e) { return Promise.reject(e); }
        return engine === 'apple' ? startApple() : startCloud();
      },
      stop() { active?.stop(); },
      cancel() { active?.cancel(); },
      get listening() { return !!active; }
    };
  }

  function createSpeaker(api, { onLevel = () => {}, getSettings = null } = {}) {
    let audio = null, url = null, ac = null, raf = 0, stopped = false;
    const cleanup = () => {
      cancelAnimationFrame(raf);
      if (audio) { audio.pause(); audio.src = ''; audio = null; }
      if (url) { URL.revokeObjectURL(url); url = null; }
      if (ac) { ac.close().catch(() => {}); ac = null; }
    };
    return {
      async speak(text, purpose, opts = {}) {
        this.stop();
        stopped = false;
        const v = getSettings?.()?.voice || {};
        const engine = purpose === 'read' && v.readAloud !== 'reply' ? 'system' : v.tts || 'system';
        // macOS `say` starts right away and the call returns when it finishes; estimate timing from the rate.
        if (engine === 'system') opts.onStart?.({ mode: 'say', wpm: v.rate || 185 });
        const r = await api.voice.speak(text, purpose, opts.persona);
        if (stopped) return { ok: true, interrupted: true };
        if (!r.ok) return r;
        if (!r.audio) return r; // macOS `say` already finished speaking
        return new Promise(resolve => {
          url = URL.createObjectURL(new Blob([r.audio], { type: r.mime || 'audio/mpeg' }));
          audio = new Audio(url);
          opts.onStart?.({ mode: 'audio', audio });
          try {
            ac = new AudioContext();
            const an = ac.createAnalyser(); an.fftSize = 512;
            const src = ac.createMediaElementSource(audio);
            src.connect(an); an.connect(ac.destination);
            const buf = new Uint8Array(an.fftSize);
            const tick = () => {
              an.getByteTimeDomainData(buf);
              let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
              onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
              raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          } catch {}
          const end = interrupted => { cleanup(); resolve({ ok: true, interrupted }); };
          audio.onended = () => end(false);
          audio.onerror = () => end(false);
          audio._end = () => end(true);
          audio.play().catch(() => end(false));
        });
      },
      stop() {
        stopped = true;
        api.voice.stopSpeaking();
        if (audio) audio._end ? audio._end() : cleanup();
      }
    };
  }

  window.NexusVoice = { createCapture, createSpeaker };
})();
