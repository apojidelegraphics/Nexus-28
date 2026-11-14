// Write mode (v2.1): your document on the left, an agent's suggested edits on the right. Hover a suggestion to see
// where it goes, accept or skip each one. Documents autosave on this Mac.
//   NexusWrite.mount({ api, personas: () => list, toast(text) }) → { open(docId?) }
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = [['improve', '✨ Improve'], ['grammar', '✓ Grammar'], ['shorter', '✂ Shorter'], ['formal', '🎩 Formal'], ['casual', '😊 Casual'], ['continue', '➜ Continue']];

  function mount({ api, personas }) {
    let doc = null, list = [], sugg = null, saveTimer = null, busy = false;
    const ed = () => $('wrText');
    async function open(id) {
      $('writeModal').hidden = false;
      list = await api.write.list();
      if (id || list[0]) await load(id || list[0].id); else await newDoc();
      setTimeout(() => ed()?.focus(), 50);
    }
    function close() { flush(); $('writeModal').hidden = true; }
    async function load(id) { flush(); doc = await api.write.get(id); sugg = null; render(); }
    async function newDoc() { flush(); doc = await api.write.save({ title: '', text: '' }); list = await api.write.list(); sugg = null; render(); $('wrTitle')?.focus(); }
    function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persist(); } }
    async function persist() { if (!doc || !$('wrText')) return; doc = await api.write.save({ id: doc.id, title: $('wrTitle').value, text: ed().value }); list = await api.write.list(); paintList(); $('wrSaved').textContent = 'Saved'; }
    const dirty = () => { $('wrSaved').textContent = 'Editing…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 800); paintCount(); markStale(); };
    const words = t => (String(t).match(/\S+/g) || []).length;
    function paintCount() { const t = ed()?.value || ''; $('wrCount').textContent = `${words(t)} words · ${t.length} characters`; }
    function paintList() {
      $('wrList').innerHTML = list.map(d => `<button class="wr-doc ${d.id === doc?.id ? 'sel' : ''}" data-doc="${esc(d.id)}"><b>${esc(d.title)}</b><small>${d.words} words</small></button>`).join('') || '<div class="note">No documents yet.</div>';
    }
    function render() {
      const ps = personas().filter(p => !p.legacy && !p.agentic);
      $('wrBody').innerHTML = `
        <aside class="wr-side"><button class="ghost-btn primary" id="wrNew">＋ New</button><div class="wr-list" id="wrList"></div></aside>
        <section class="wr-main">
          <input id="wrTitle" class="wr-title" placeholder="Title" value="${esc(doc.title === 'Untitled' ? '' : doc.title)}">
          <textarea id="wrText" class="wr-text" spellcheck="true" placeholder="Start writing, or paste something to polish…">${esc(doc.text)}</textarea>
          <div class="wr-foot"><span id="wrCount"></span><span id="wrSaved" class="note">Saved</span><span style="flex:1"></span>
            <button class="link-btn" data-exp="md">.md</button><button class="link-btn" data-exp="docx">Word</button><button class="link-btn" id="wrCopy">Copy</button><button class="link-btn danger" id="wrDel">Delete</button></div>
        </section>
        <aside class="wr-ai">
          <div class="wr-modes">${MODES.map(([m, l]) => `<button class="wr-mode" data-mode="${m}">${l}</button>`).join('')}</div>
          <div class="row"><input id="wrAsk" placeholder="Or ask: make the intro punchier…"><select id="wrAgent">${ps.map(p => `<option value="${esc(p.id)}" ${p.id === 'neodela' ? 'selected' : ''}>${esc(p.handle)}</option>`).join('')}</select></div>
          <div class="note" id="wrHint">Select text first to work on just that part.</div>
          <div class="wr-sugg" id="wrSugg"></div>
        </aside>`;
      paintList(); paintCount(); paintSugg();
    }
    function paintSugg() {
      const box = $('wrSugg'); if (!box) return;
      if (busy) { box.innerHTML = '<div class="wr-busy"><span></span><span></span><span></span> Reading your document…</div>'; return; }
      if (!sugg) { box.innerHTML = '<div class="note">Pick an action above. Suggestions show up here; nothing changes until you accept.</div>'; return; }
      if (sugg.error) { box.innerHTML = `<div class="note err">${esc(sugg.error)}</div>`; return; }
      if (sugg.append) { box.innerHTML = `<div class="wr-s"><div class="wr-why">Continue writing</div><div class="wr-new">${esc(sugg.append)}</div><div class="row"><button class="ghost-btn primary" data-append>Add to the end</button><button class="ghost-btn" data-skipall>Skip</button></div></div>`; return; }
      const open = sugg.edits.filter(e => !e.done);
      box.innerHTML = (sugg.note ? `<div class="note">${esc(sugg.note)}</div>` : '') +
        (open.length ? `<div class="row"><button class="ghost-btn primary" data-acceptall>Accept all ${open.length}</button><button class="ghost-btn" data-skipall>Skip all</button></div>` : '<div class="note ok">✓ All done.</div>') +
        sugg.edits.map((e, i) => e.done ? '' : `<div class="wr-s ${e.stale ? 'stale' : ''}" data-i="${i}"><div class="wr-old">${esc(e.find)}</div><div class="wr-new">${esc(e.replace) || '<i>(delete)</i>'}</div>${e.why ? `<div class="wr-why">${esc(e.why)}</div>` : ''}
          <div class="row"><button class="link-btn" data-acc="${i}" ${e.stale ? 'disabled' : ''}>Accept</button><button class="link-btn" data-skip="${i}">Skip</button>${e.stale ? '<span class="note">text changed</span>' : ''}</div></div>`).join('');
    }
    function markStale() { if (!sugg?.edits) return; const t = ed().value; let ch = false; sugg.edits.forEach(e => { const st = !e.done && !t.includes(e.find); if (st !== !!e.stale) { e.stale = st; ch = true; } }); if (ch) paintSugg(); }
    function show(e) { const t = ed().value, at = t.indexOf(e.find); if (at < 0) return; ed().focus(); ed().setSelectionRange(at, at + e.find.length);
      const before = t.slice(0, at).split('\n').length; ed().scrollTop = Math.max(0, (before - 4) * 20); }
    function accept(i) { const e = sugg.edits[i]; const t = ed().value, at = t.indexOf(e.find); if (at < 0) { e.stale = true; return paintSugg(); }
      ed().value = t.slice(0, at) + e.replace + t.slice(at + e.find.length); e.done = true; dirty(); paintSugg(); }
    async function ask(mode) {
      if (busy) return;
      const t = ed().value; if (!t.trim()) { sugg = { error: 'Write something first.' }; return paintSugg(); }
      const sel = t.slice(ed().selectionStart, ed().selectionEnd);
      busy = true; paintSugg();
      const r = await api.write.suggest({ text: t, mode, instruction: mode === 'ask' ? $('wrAsk').value : '', agent: $('wrAgent').value, selection: sel.length > 3 ? sel : '' });
      busy = false; sugg = r.ok ? r : { error: r.error };
      if (r.ok && !r.append && !r.edits.length) sugg.note = sugg.note || 'Looks good. No changes suggested.';
      paintSugg();
    }
    $('writeModal').addEventListener('input', e => { if (e.target.id === 'wrText' || e.target.id === 'wrTitle') dirty(); });
    $('writeModal').addEventListener('mouseover', e => { const s = e.target.closest('.wr-s[data-i]'); if (s && sugg?.edits) show(sugg.edits[+s.dataset.i]); });
    $('writeModal').addEventListener('keydown', e => { if (e.target.id === 'wrAsk' && e.key === 'Enter') ask('ask'); if (e.key === 'Escape' && !$('writeModal').hidden) { e.stopPropagation(); close(); } });
    $('writeModal').addEventListener('click', async e => {
      if (e.target.closest('[data-close]') || e.target === $('writeModal')) return close();
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'wrNew') return newDoc();
      if (b.dataset.doc) return load(b.dataset.doc);
      if (b.dataset.mode) return ask(b.dataset.mode);
      if (b.dataset.acc) return accept(+b.dataset.acc);
      if (b.dataset.skip) { sugg.edits[+b.dataset.skip].done = true; return paintSugg(); }
      if (b.dataset.acceptall !== undefined) { sugg.edits.forEach((x, i) => { if (!x.done && !x.stale) accept(i); }); return; }
      if (b.dataset.skipall !== undefined) { sugg = null; return paintSugg(); }
      if (b.dataset.append !== undefined) { const t = ed().value; ed().value = t.replace(/\s*$/, '') + (t.trim() ? '\n\n' : '') + sugg.append; sugg = null; dirty(); paintSugg(); ed().scrollTop = ed().scrollHeight; return; }
      if (b.id === 'wrCopy') { navigator.clipboard.writeText(ed().value).catch(() => {}); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); return; }
      if (b.dataset.exp) { flush(); const r = await api.write.export({ title: $('wrTitle').value || doc.title, text: ed().value, format: b.dataset.exp }); if (r.ok) $('wrSaved').textContent = 'Exported'; else if (!r.canceled) $('wrSaved').textContent = r.error; return; }
      if (b.id === 'wrDel') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Delete this document?'; return; } clearTimeout(saveTimer); saveTimer = null; list = await api.write.remove(doc.id); if (list[0]) await load(list[0].id); else await newDoc(); return; }
    });
    return { open, close };
  }
  window.NexusWrite = { mount };
})();
