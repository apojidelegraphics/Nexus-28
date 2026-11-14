// Meeting notes (v2.1): record your mic, see the transcript build up, then get a summary, decisions and action items
// (which can become Apple Reminders). Audio is sent in ~30 s WAV pieces to be transcribed and isn't kept.
//   NexusMeeting.mount({ api, personas: () => list, openChat(id) }) → { open() }
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RATE = 16000, CHUNK_S = 30;

  function wav(samples) {   // Int16 mono → WAV bytes
    const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b), w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    new Int16Array(b, 44).set(samples); return new Uint8Array(b);
  }

  function mount({ api, personas, openChat }) {
    let rec = null, notes = null;
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    function open() { $('meetingModal').hidden = false; if (!rec && !notes) idle(); }
    function close() { if (rec && !confirm('Stop recording and throw this meeting away?')) return; if (rec) cancel(); $('meetingModal').hidden = true; notes = null; }
    function idle(err = '') {
      const ps = personas().filter(p => !p.legacy && !p.agentic);
      $('mtBody').innerHTML = `<div class="note">Records your microphone (a class, a call on speaker, an in-person meeting), shows the transcript as it goes, then writes the notes: a summary, decisions and action items you can send to Reminders. Ask people before you record them.</div>
        <input id="mtTitle" placeholder="What's this? e.g. Bio lecture, Project sync (optional)" maxlength="80">
        <div class="row"><span class="note" style="flex:none">Notes by</span><select id="mtAgent" style="flex:none;width:auto">${ps.map(p => `<option value="${esc(p.id)}" ${p.id === 'neodela' ? 'selected' : ''}>${esc(p.handle)}</option>`).join('')}</select><span style="flex:1"></span>
          <button class="ghost-btn primary" id="mtGo">● Start recording</button></div>${err ? `<div class="note err">${esc(err)}</div>` : ''}`;
    }
    async function start() {
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { return idle('Microphone access was blocked. Allow Nexus in System Settings → Privacy & Security → Microphone.'); }
      const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const ratio = ctx.sampleRate / RATE;
      rec = { id: 'm' + Date.now().toString(36), title: $('mtTitle').value.trim(), agent: $('mtAgent').value, stream, ctx, proc, buf: [], len: 0, index: 0, started: Date.now(), parts: [], pending: 0, errors: 0, level: 0, paused: false };
      proc.onaudioprocess = e => {
        if (!rec || rec.paused) return;
        const inp = e.inputBuffer.getChannelData(0), n = Math.floor(inp.length / ratio), out = new Int16Array(n);
        let sum = 0;
        for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, inp[Math.floor(i * ratio)])); out[i] = s * 0x7fff; sum += s * s; }
        rec.level = Math.min(1, Math.sqrt(sum / Math.max(1, n)) * 8);
        rec.buf.push(out); rec.len += n;
        if (rec.len >= RATE * CHUNK_S) flushChunk();
      };
      src.connect(proc); proc.connect(ctx.destination);
      rec.tick = setInterval(paintRec, 250);
      paintRec(true);
    }
    function flushChunk() {
      if (!rec || !rec.len) return Promise.resolve();
      const all = new Int16Array(rec.len); let o = 0; for (const b of rec.buf) { all.set(b, o); o += b.length; }
      rec.buf = []; rec.len = 0;
      const index = rec.index++, id = rec.id; rec.pending++;
      return api.meeting.chunk(id, index, wav(all)).then(r => {
        if (!rec || rec.id !== id) return;
        rec.pending--;
        if (r.ok) rec.parts[index] = r.text; else { rec.errors++; rec.lastError = r.error; }
        paintRec(true);
      });
    }
    function paintRec(full) {
      if (!rec) return;
      const secs = (Date.now() - rec.started) / 1000;
      if (full || !$('mtTime')) {
        $('mtBody').innerHTML = `<div class="mt-rec"><span class="mt-dot ${rec.paused ? 'paused' : ''}"></span><b id="mtTime">${fmt(secs)}</b><span class="mt-lvl"><i id="mtLvl"></i></span><span class="note">${esc(rec.title || 'Recording')}</span></div>
          <div class="mt-trans" id="mtTrans">${rec.parts.filter(Boolean).map(esc).join(' ') || '<span class="note">The transcript shows up here every ~30 seconds…</span>'}${rec.pending ? ' <span class="note">…</span>' : ''}</div>
          ${rec.errors ? `<div class="note err">${esc(rec.lastError || 'Some audio could not be transcribed.')}</div>` : ''}
          <div class="row"><button class="ghost-btn" id="mtPause">${rec.paused ? 'Resume' : 'Pause'}</button><button class="ghost-btn danger" id="mtCancel">Discard</button><span style="flex:1"></span><button class="ghost-btn primary" id="mtStop">■ Stop &amp; write notes</button></div>`;
        const t = $('mtTrans'); t.scrollTop = t.scrollHeight;
      }
      $('mtTime').textContent = fmt(secs); $('mtLvl').style.width = Math.round(rec.level * 100) + '%';
    }
    function teardown() { clearInterval(rec.tick); try { rec.proc.disconnect(); rec.ctx.close(); } catch {} rec.stream.getTracks().forEach(t => t.stop()); }
    function cancel() { const id = rec.id; teardown(); rec = null; api.meeting.cancel(id); idle(); }
    async function stop() {
      const r0 = rec; r0.paused = true; teardown();
      $('mtBody').innerHTML = '<div class="wr-busy"><span></span><span></span><span></span> Finishing the transcript and writing your notes…</div>';
      await flushChunk();
      while (r0.pending) await new Promise(r => setTimeout(r, 300));
      const minutes = Math.round((Date.now() - r0.started) / 60000);
      rec = null;
      const r = await api.meeting.finish({ id: r0.id, title: r0.title, agent: r0.agent, minutes });
      if (!r.ok) return idle(r.error);
      notes = r; showNotes();
    }
    function showNotes() {
      const n = notes.notes;
      $('mtBody').innerHTML = `<div class="mt-notes"><h3>📝 ${esc(n.title || 'Meeting notes')}</h3><p>${esc(n.summary)}</p>
        ${n.decisions.length ? `<b>Decisions</b><ul>${n.decisions.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        ${n.actions.length ? `<b>Action items</b><div class="mt-acts">${n.actions.map((a, i) => `<label class="check"><input type="checkbox" data-ai="${i}" checked> ${esc(a.task)}${a.owner ? ` <small class="note">(${esc(a.owner)})</small>` : ''}${a.due ? ` <small class="note">· due ${esc(a.due)}</small>` : ''}</label>`).join('')}</div>` : ''}
        ${n.followups.length ? `<b>Open questions</b><ul>${n.followups.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div>
        <div class="row">${n.actions.length ? `<button class="ghost-btn" id="mtRemind" ${notes.canRemind ? '' : 'title="Turn on Apple Reminders in Settings → Connectors"'}>Add checked to Reminders</button>` : ''}<span class="note" id="mtNote" style="flex:1"></span>
          <button class="ghost-btn" id="mtNew">New recording</button><button class="ghost-btn primary" id="mtOpen">Open notes chat</button></div>`;
    }
    $('meetingModal').addEventListener('click', async e => {
      if (e.target.closest('[data-close]') || e.target === $('meetingModal')) return close();
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'mtGo') return start();
      if (b.id === 'mtPause') { rec.paused = !rec.paused; return paintRec(true); }
      if (b.id === 'mtCancel') { if (confirm('Throw this recording away?')) cancel(); return; }
      if (b.id === 'mtStop') return stop();
      if (b.id === 'mtOpen') { const id = notes.convId; notes = null; $('meetingModal').hidden = true; return openChat(id); }
      if (b.id === 'mtNew') { notes = null; return idle(); }
      if (b.id === 'mtRemind') {
        const items = notes.notes.actions.filter((_, i) => document.querySelector(`[data-ai="${i}"]`)?.checked);
        const r = await api.meeting.remind(items);
        $('mtNote').className = 'note ' + (r.ok ? 'ok' : 'err'); $('mtNote').textContent = r.ok ? `✓ Added ${r.added} reminder${r.added === 1 ? '' : 's'}` : r.error;
      }
    });
    return { open, close, recording: () => !!rec };
  }
  window.NexusMeeting = { mount };
})();
