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
    if (want === 'nexus') return 'nexus';
    const keys = state.keys || {};
    if (want === 'apple') {
      if (state.helperBuilt) return 'apple';
      if (keys.openai) return 'openai';
      if (keys.elevenlabs) return 'elevenlabs';
      throw new Error('On-device speech needs the NexusCore helper (run "npm run build:helper"), or add an OpenAI/ElevenLabs key and choose it in Settings → Voice.');
    }
    if (!keys[want]) throw new Error(`Speech-to-text is set to ${want === 'openai' ? 'OpenAI' : want === 'groq' ? 'Groq' : 'ElevenLabs'} but no key is stored.${want === 'groq' ? ' Get a free one at console.groq.com/keys and add it in Settings → Models & keys.' : ''}`);
    return want;
  }

  // 2.8: when on-device speech hears nothing, say why instead of silently giving up
  const WIN = !!window.nexusPlatform?.win;
  function whyNothing(ev) {
    const r = String(ev.reason || ''), peak = +ev.peak || 0;
    // 3.8: Windows wording (it used to send Windows users to macOS System Settings)
    if (WIN) {
      if (/no sound/i.test(r) || peak < 0.004) return "Windows' speech recognition isn't getting sound from your microphone. Check Windows Settings → Privacy & security → Microphone (\"Let desktop apps access your microphone\") and the input in Settings → System → Sound, then try Settings → Voice → Test my microphone. Tip: Groq Whisper (free key) hears much better.";
      return "Windows heard you but didn't catch any words. Its built-in recognizer often mishears; for much better results choose Groq Whisper (free key) in Settings → Voice.";
    }
    if (/\b1110\b|no speech/i.test(r)) return '';                                    // you just didn't say anything
    if (/\b(1101|1700)\b|siri|dictation/i.test(r)) return 'On-device speech recognition is switched off on this Mac. Turn on Dictation in System Settings → Keyboard → Dictation, or choose OpenAI speech-to-text in Settings → Voice.';
    if (r) return `Speech recognition stopped: ${r.replace(/^\S+ \d+: /, '')}. Try again, or choose OpenAI speech-to-text in Settings → Voice.`;
    if (peak < 0.004) return "Your microphone is on but Nexus isn't getting any sound. Check the input device in System Settings → Sound → Input.";
    return "Nexus could hear you, but macOS speech recognition didn't return any words. Make sure Dictation is on (System Settings → Keyboard → Dictation) with your language downloaded, or choose OpenAI speech-to-text in Settings → Voice.";
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
        // Nothing after 8 s: ask the helper to wrap up (not cancel), so it can say why it heard nothing
        let gaveUp = false;
        const noSpeech = setTimeout(() => { if (!text) { gaveUp = true; api.voice.stop(id); setTimeout(() => finish(''), 2500); } }, NO_SPEECH_MS);
        const maxTimer = setTimeout(() => api.voice.stop(id), MAX_MS);
        const cleanup = () => { clearTimeout(silenceTimer); clearTimeout(noSpeech); clearTimeout(maxTimer); sessions.delete(id); active = null; };
        sessions.set(id, ev => {
          if (ev.event === 'level') onLevel(ev.level);
          else if (ev.event === 'partial') {
            text = ev.text; onPartial(text);
            clearTimeout(silenceTimer);
            if (text.trim()) silenceTimer = setTimeout(() => api.voice.stop(id), SILENCE_MS);
          } else if (ev.event === 'final') {
            const said = (ev.text || text).trim();
            const why = !said && (ev.reason || gaveUp) ? whyNothing(ev) : '';
            why ? fail(new Error(why)) : finish(said);
          }
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

    function startCloud(engine = '') {
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
          const r = await api.voice.transcribe(new Uint8Array(await blob.arrayBuffer()), blob.type, engine, (performance.now() - started) / 1000);
          r.ok ? resolve((r.text || '').trim()) : reject(new Error(r.error));
        };
        active = { stop: () => { heard = true; stopRec(); }, cancel: () => { cancelled = true; stopRec(); } };
        rec.start(250);
        raf = requestAnimationFrame(tick);
      });
    }

    return {
      engine: () => { try { return pickEngine(getState()); } catch { return null; } },
      // 3.9: on Windows, "on-device" means Nexus speech (free Whisper, much more accurate) when you're signed in and
      // it's switched on; Windows' own recognizer is the fallback. Anywhere, Nexus speech also stands in when nothing
      // else is set up.
      async start() {
        if (active) active.cancel();
        const st = getState(), want = st.settings.voice.stt;
        let engine = null, err = null;
        try { engine = pickEngine(st); } catch (e) { err = e; }
        if (engine === 'nexus' || err || (WIN && engine === 'apple')) {
          const si = await api.voice.speechInfo?.().catch(() => null);
          if (si?.available) engine = 'nexus';
          else if (want === 'nexus') throw new Error(si?.signedIn === false ? 'Nexus speech needs your Nexus account: sign in from Settings → Profile.' : 'Nexus speech isn’t switched on yet. Pick another speech-to-text in Settings → Voice.');
          else if (err) throw err;
        }
        return engine === 'apple' ? startApple() : startCloud(engine === 'nexus' ? 'nexus' : '');
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
        // v3.1: with read-along on, the macOS voice is rendered to audio first (Nexus then plays it), so the highlight
        // follows the real audio. Without read-along, `say` speaks straight away. If rendering fails, `say` still speaks
        // (and the highlight's timing is estimated).
        const render = engine === 'system' && !!opts.onStart;
        if (engine === 'system' && !render) opts.onStart?.({ mode: 'say', wpm: v.rate || 185 });
        let r = await api.voice.speak(text, purpose, opts.persona, render);
        if (r.ok && r.renderFailed && !stopped) { opts.onStart?.({ mode: 'say', wpm: v.rate || 185 }); r = await api.voice.speak(text, purpose, opts.persona, false); }
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
              const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 5);
              onLevel(lvl);
              // v3.1: when the first word is actually heard (read-along waits for this)
              if (audio && audio._lead == null && lvl > 0.06) audio._lead = Math.max(0, audio.currentTime - 0.05);
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
