window.nxCopy = window.nxCopy || (t => Promise.resolve(window.nexus?.copyText ? window.nexus.copyText(t) : navigator.clipboard.writeText(t)));   // 3.13: copy that works in the app (and in N28C)
// Write mode (v2.1): your document on the left, an agent's suggested edits on the right. Hover a suggestion to see
// where it goes, accept or skip each one. Documents autosave on this Mac.
//   NexusWrite.mount({ api, personas: () => list, toast(text) }) → { open(docId?) }
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODES = [['improve', 'Improve'], ['grammar', 'Grammar'], ['shorter', 'Shorter'], ['longer', 'Longer'], ['simpler', 'Simpler'], ['flow', 'Flow'], ['formal', 'Formal'], ['casual', 'Casual'], ['persuasive', 'Persuasive'], ['continue', 'Continue']];
  const TOOLS = [['feedback', 'Feedback'], ['summary', 'Summary'], ['outline', 'Outline'], ['titles', 'Title ideas']];   // 4.0: answers beside the document
  const FMT = [['h1', 'H1', '# '], ['h2', 'H2', '## '], ['b', '<b>B</b>', '**'], ['i', '<i>I</i>', '*'], ['ul', '• List', '- '], ['ol', '1. List', '1. '], ['q', '❝ Quote', '> '], ['todo', '☐ To-do', '- [ ] ']];

  function mount({ api, personas }) {
    let doc = null, list = [], sugg = null, saveTimer = null, busy = false, preview = false, focusMode = false, findOpen = false;
    const goals = (() => { try { return JSON.parse(localStorage.getItem('nx-write-goals') || '{}'); } catch { return {}; } })();
    const saveGoals = () => { try { localStorage.setItem('nx-write-goals', JSON.stringify(goals)); } catch {} };
    const ed = () => $('wrText');
    // 4.2.0: Jots & Docs. Jots (from the Jot widget, ⌘K or N28C) sit above your documents; open one to edit it like a doc.
    let jotsOpen = true;
    async function open(id, o = {}) {
      $('writeModal').hidden = false;
      list = await api.write.list();
      if (o.jots) jotsOpen = true;
      const firstDoc = list.find(d => d.kind !== 'jot') || list[0];
      if (id || firstDoc) await load(id || firstDoc.id); else await newDoc();
      setTimeout(() => (o.focusJot ? $('wrJotIn') : ed())?.focus(), 50);
    }
    api.write.onChanged?.(async () => { if ($('writeModal').hidden) return; list = await api.write.list(); paintList(); });
    function close() { flush(); $('writeModal').hidden = true; }
    async function load(id) { flush(); doc = await api.write.get(id); sugg = null; render(); }
    async function newDoc(tpl) { flush(); doc = tpl && api.write.fromTemplate ? await api.write.fromTemplate(tpl) : await api.write.save({ title: '', text: '' }); list = await api.write.list(); sugg = null; render(); $('wrTitle')?.focus(); }
    function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; persist(); } }
    async function persist() { if (!doc || !$('wrText')) return; doc = await api.write.save({ id: doc.id, title: $('wrTitle').value, text: ed().value }); list = await api.write.list(); paintList(); $('wrSaved').textContent = 'Saved'; }
    const dirty = () => { $('wrSaved').textContent = 'Editing…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 800); paintCount(); markStale(); };
    const words = t => (String(t).match(/\S+/g) || []).length;
    function paintCount() {
      const t = ed()?.value || '', w = words(t), mins = Math.max(1, Math.round(w / 230)), goal = doc && goals[doc.id];
      $('wrCount').textContent = `${w} words · ${t.length} characters · ${mins} min read`;
      const g = $('wrGoal'); if (g) { g.hidden = !goal; if (goal) { const p = Math.min(100, Math.round(w / goal * 100)); g.innerHTML = `<i style="width:${p}%"></i><span>${w} / ${goal} words${p >= 100 ? ' · goal reached' : ''}</span>`; g.classList.toggle('done', p >= 100); } }
      if (preview) paintPreview();
    }
    function md(t) {   // a small Markdown preview (headings, bold, italic, lists, to-dos, quotes)
      const inl = x => esc(x).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
      return String(t).split(/\n{2,}/).map(b => { const l = b.replace(/\s+$/, ''); if (!l.trim()) return ''; const h = l.match(/^(#{1,3})\s+(.*)$/); if (h && !l.includes('\n')) return `<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`;
        if (/^>\s/.test(l)) return `<blockquote>${l.split('\n').map(x => inl(x.replace(/^>\s?/, ''))).join('<br>')}</blockquote>`;
        if (/^([-*]|\d+[.)])\s/.test(l)) return `<${/^\d/.test(l) ? 'ol' : 'ul'}>${l.split('\n').map(x => { const td = x.match(/^[-*]\s+\[([ x])\]\s*(.*)$/i); return td ? `<li class="td ${td[1].trim() ? 'on' : ''}">${inl(td[2])}</li>` : `<li>${inl(x.replace(/^([-*]|\d+[.)])\s+/, ''))}</li>`; }).join('')}</${/^\d/.test(l) ? 'ol' : 'ul'}>`;
        return `<p>${l.split('\n').map(inl).join('<br>')}</p>`; }).join('');
    }
    function paintPreview() { const p = $('wrPreview'); if (p) p.innerHTML = md(ed()?.value || '') || '<p class="note">Nothing to preview yet.</p>'; }
    function fmt(kind) {
      const el = ed(), [, , mark] = FMT.find(f => f[0] === kind), a = el.selectionStart, b = el.selectionEnd, t = el.value;
      if (kind === 'b' || kind === 'i') { const sel = t.slice(a, b) || (kind === 'b' ? 'bold' : 'italic'); el.setRangeText(mark + sel + mark, a, b, 'select'); }
      else { const ls = t.lastIndexOf('\n', a - 1) + 1, le = t.indexOf('\n', b) < 0 ? t.length : t.indexOf('\n', b);
        const lines = t.slice(ls, le).split('\n').map((x, i) => { const bare = x.replace(/^(#{1,6}\s+|[-*]\s+(\[[ x]\]\s+)?|\d+[.)]\s+|>\s+)/, ''); return (kind === 'ol' ? `${i + 1}. ` : mark) + bare; });
        el.setRangeText(lines.join('\n'), ls, le, 'end'); }
      el.focus(); dirty();
    }
    function paintList() {
      const jots = list.filter(d => d.kind === 'jot'), docsL = list.filter(d => d.kind !== 'jot');
      const ago = t => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
      $('wrList').innerHTML = `<div class="wr-sec"><button class="wr-sec-h" data-jotsec>${jotsOpen ? '▾' : '▸'} Jots <small>${jots.length}</small></button></div>
        ${jotsOpen ? `<form class="wr-jotform" id="wrJotForm"><input id="wrJotIn" placeholder="Jot something… (Enter)" maxlength="4000"></form>
        ${jots.map(d => `<div class="wr-jot ${d.id === doc?.id ? 'sel' : ''}"><button class="wr-jot-t" data-doc="${esc(d.id)}" title="Open it">${esc(d.text || d.title)}</button><small>${ago(d.updated)}</small><span class="wr-jot-a"><button data-jot2doc="${esc(d.id)}" title="Make it a document">Doc</button><button data-jotdel="${esc(d.id)}" title="Delete">✕</button></span></div>`).join('') || '<div class="note">No jots yet. Type one above, or use the Jot widget.</div>'}` : ''}
        <div class="wr-sec"><span class="wr-sec-h">Docs <small>${docsL.length}</small></span></div>
        ${docsL.map(d => `<button class="wr-doc ${d.id === doc?.id ? 'sel' : ''}" data-doc="${esc(d.id)}"><b>${esc(d.title)}</b><small>${d.words} words</small></button>`).join('') || '<div class="note">No documents yet.</div>'}`;
    }
    function render() {
      const ps = personas().filter(p => !p.legacy && !p.agentic);
      $('wrBody').innerHTML = `
        <aside class="wr-side"><button class="ghost-btn primary" id="wrNew">＋ New</button><select id="wrTpl" title="Start from a template"><option value="">From a template…</option><option value="essay">Essay</option><option value="email">Email</option><option value="cover">Cover letter</option><option value="notes">Meeting notes</option><option value="story">Story outline</option><option value="lab">Lab report</option></select><div class="wr-list" id="wrList"></div></aside>
        <section class="wr-main">
          <input id="wrTitle" class="wr-title" placeholder="Title" value="${esc(doc.title === 'Untitled' ? '' : doc.title)}">
          <div class="wr-tools">${FMT.map(([k, l]) => `<button class="wr-fmt" data-fmt="${k}" title="${k}">${l}</button>`).join('')}<span class="wr-sep"></span>
            <button class="wr-fmt ${preview ? 'on' : ''}" data-tool="preview" title="Preview">Preview</button><button class="wr-fmt" data-tool="find" title="Find and replace (Ctrl/⌘F)">Find</button><button class="wr-fmt" data-tool="goal" title="Set a word goal">Goal</button><button class="wr-fmt" data-tool="history" title="Earlier versions">History</button><button class="wr-fmt ${focusMode ? 'on' : ''}" data-tool="focus" title="Focus: hide everything but the page">Focus</button></div>
          <div class="wr-find" id="wrFind" ${findOpen ? '' : 'hidden'}><input id="wrFindQ" placeholder="Find"><input id="wrRepl" placeholder="Replace with"><button class="link-btn" data-tool="findnext">Next</button><button class="link-btn" data-tool="replace">Replace</button><button class="link-btn" data-tool="replaceall">All</button><span class="note" id="wrFindN"></span></div>
          <div class="wr-goal" id="wrGoal" hidden></div>
          <div class="wr-page ${preview ? 'split' : ''}"><textarea id="wrText" class="wr-text" spellcheck="true" placeholder="Start writing, or paste something to polish…">${esc(doc.text)}</textarea>${preview ? '<div class="wr-preview" id="wrPreview"></div>' : ''}</div>
          <div class="wr-foot"><span id="wrCount"></span><span id="wrSaved" class="note">Saved</span><span style="flex:1"></span>
            <button class="link-btn" data-exp="md">.md</button><button class="link-btn" data-exp="docx">Word</button><button class="link-btn" data-exp="pdf">PDF</button><button class="link-btn" id="wrCopy">Copy</button><button class="link-btn danger" id="wrDel">Delete</button></div>
        </section>
        <aside class="wr-ai">
          <div class="wr-lbl">EDIT</div><div class="wr-modes">${MODES.map(([m, l]) => `<button class="wr-mode" data-mode="${m}">${l}</button>`).join('')}</div>
          <div class="wr-lbl">ASK ABOUT IT</div><div class="wr-modes">${TOOLS.map(([m, l]) => `<button class="wr-mode alt" data-mode="${m}">${l}</button>`).join('')}</div>
          <div class="row"><input id="wrAsk" placeholder="Or ask: make the intro punchier…"><select id="wrAgent">${ps.map(p => `<option value="${esc(p.id)}" ${p.id === 'neodela' ? 'selected' : ''}>${esc(p.handle)}</option>`).join('')}</select></div>
          <div class="note" id="wrHint">Select text first to work on just that part.</div>
          <div class="wr-sugg" id="wrSugg"></div>
        </aside>`;
      $('writeModal').classList.toggle('wr-focus', focusMode);
      paintList(); paintCount(); paintSugg();
    }
    function paintSugg() {
      const box = $('wrSugg'); if (!box) return;
      if (busy) { box.innerHTML = '<div class="wr-busy"><span></span><span></span><span></span> Reading your document…</div>'; return; }
      if (!sugg) { box.innerHTML = '<div class="note">Pick an action above. Suggestions show up here; nothing changes until you accept.</div>'; return; }
      if (sugg.error) { box.innerHTML = `<div class="note err">${esc(sugg.error)}</div>`; return; }
      if (sugg.aside) { box.innerHTML = `<div class="wr-s aside"><div class="wr-aside">${md(sugg.aside)}</div><div class="row"><button class="ghost-btn" data-copyaside>Copy</button><button class="ghost-btn" data-addaside>Add to the end</button><button class="ghost-btn" data-skipall>Close</button></div></div>`; return; }
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
    $('writeModal').addEventListener('submit', async e => {
      if (e.target.id !== 'wrJotForm') return; e.preventDefault();
      const v = $('wrJotIn').value.trim(); if (!v) return;
      await api.write.jot(v); list = await api.write.list(); paintList(); setTimeout(() => $('wrJotIn')?.focus(), 0);
    });
    $('writeModal').addEventListener('input', e => { if (e.target.id === 'wrText' || e.target.id === 'wrTitle') dirty(); });
    $('writeModal').addEventListener('change', e => { if (e.target.id === 'wrTpl' && e.target.value) newDoc(e.target.value); });
    $('writeModal').addEventListener('mousedown', e => { if (!e.target.closest('.wr-pop') && !e.target.closest('[data-tool="goal"],[data-tool="history"]')) document.querySelectorAll('.wr-pop').forEach(p => p.remove()); });
    $('writeModal').addEventListener('mouseover', e => { const s = e.target.closest('.wr-s[data-i]'); if (s && sugg?.edits) show(sugg.edits[+s.dataset.i]); });
    $('writeModal').addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && /^[bif]$/i.test(e.key) && !$('writeModal').hidden) { e.preventDefault(); e.stopPropagation(); if (e.key.toLowerCase() === 'f') { findOpen = true; $('wrFind').hidden = false; $('wrFindQ').focus(); } else fmt(e.key.toLowerCase()); return; }
      if (e.target.id === 'wrFindQ' && e.key === 'Enter') { e.preventDefault(); $('writeModal').querySelector('[data-tool="findnext"]').click(); return; }
      if (e.target.id === 'wrAsk' && e.key === 'Enter') ask('ask'); if (e.key === 'Escape' && !$('writeModal').hidden) { e.stopPropagation(); close(); } });
    $('writeModal').addEventListener('click', async e => {
      if (e.target.closest('[data-close]') || e.target === $('writeModal')) return close();
      const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'wrNew') return newDoc();
      if (b.dataset.jotsec !== undefined) { jotsOpen = !jotsOpen; return paintList(); }
      if (b.dataset.jotdel) { await api.write.remove(b.dataset.jotdel); list = await api.write.list(); if (doc?.id === b.dataset.jotdel) { const f = list.find(d => d.kind !== 'jot') || list[0]; if (f) await load(f.id); else await newDoc(); } return paintList(); }
      if (b.dataset.jot2doc) { const j = await api.write.get(b.dataset.jot2doc); await api.write.save({ id: j.id, title: j.title, text: j.text, kind: 'doc' }); list = await api.write.list(); return load(j.id); }
      if (b.dataset.fmt) return fmt(b.dataset.fmt);
      if (b.dataset.copyaside !== undefined) { nxCopy(sugg.aside).catch(() => {}); b.textContent = 'Copied'; return; }
      if (b.dataset.addaside !== undefined) { const t = ed().value; ed().value = t.replace(/\s*$/, '') + '\n\n' + sugg.aside; sugg = null; dirty(); paintSugg(); return; }
      if (b.dataset.tool) {
        const k = b.dataset.tool, q = $('wrFindQ')?.value || '', r = $('wrRepl')?.value || '';
        const keep = () => { if (doc && ed()) { doc.text = ed().value; doc.title = $('wrTitle').value || doc.title; } flush(); };   // re-rendering must not lose what you just typed
        if (k === 'preview') { keep(); preview = !preview; return render(); }
        if (k === 'focus') { keep(); focusMode = !focusMode; return render(); }
        if (k === 'find') { findOpen = !findOpen; $('wrFind').hidden = !findOpen; if (findOpen) $('wrFindQ').focus(); return; }
        if (k === 'findnext' || k === 'replace') { if (!q) return; const el = ed(), t = el.value; let i = t.toLowerCase().indexOf(q.toLowerCase(), k === 'replace' && el.value.slice(el.selectionStart, el.selectionEnd).toLowerCase() === q.toLowerCase() ? el.selectionStart : el.selectionEnd); if (i < 0) i = t.toLowerCase().indexOf(q.toLowerCase());
          if (i < 0) { $('wrFindN').textContent = 'Not found'; return; }
          if (k === 'replace' && el.value.slice(el.selectionStart, el.selectionEnd).toLowerCase() === q.toLowerCase()) { el.setRangeText(r, el.selectionStart, el.selectionEnd, 'end'); dirty(); return; }
          el.focus(); el.setSelectionRange(i, i + q.length); $('wrFindN').textContent = ''; return; }
        if (k === 'replaceall') { if (!q) return; const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), n = (ed().value.match(re) || []).length; ed().value = ed().value.replace(re, r); $('wrFindN').textContent = `Replaced ${n}`; dirty(); return; }
        if (k === 'goal') { const g = document.createElement('div'); g.className = 'wr-pop'; g.innerHTML = `<b>Word goal</b><input type="number" min="0" step="50" value="${goals[doc.id] || ''}" placeholder="e.g. 500"><div class="row"><button class="ghost-btn primary" data-goalset>Set</button><button class="ghost-btn" data-goalclear>Clear</button></div>`; b.after(g); g.querySelector('input').focus();
          g.addEventListener('click', ev => { ev.stopPropagation(); const v = +g.querySelector('input').value; if (ev.target.closest('[data-goalset]')) { if (v > 0) goals[doc.id] = Math.round(v); else delete goals[doc.id]; saveGoals(); g.remove(); paintCount(); } if (ev.target.closest('[data-goalclear]')) { delete goals[doc.id]; saveGoals(); g.remove(); paintCount(); } });
          g.querySelector('input').addEventListener('keydown', ev => { if (ev.key === 'Enter') g.querySelector('[data-goalset]').click(); }); return; }
        if (k === 'history') { flush(); const vs = await api.write.versions(doc.id); const g = document.createElement('div'); g.className = 'wr-pop wide'; g.innerHTML = `<b>Earlier versions</b>${vs.length ? vs.map(v => `<button class="wr-ver" data-ver="${v.i}"><span>${new Date(v.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${v.words} words</span><small>${esc(v.preview)}</small></button>`).join('') : '<div class="note">No earlier versions yet. Nexus keeps one every few minutes while you write.</div>'}`; b.after(g);
          g.addEventListener('click', async ev => { ev.stopPropagation(); const v = ev.target.closest('[data-ver]'); if (!v) return; if (!confirm('Go back to this version? Your current text is kept in History too.')) return; doc = await api.write.restore(doc.id, v.dataset.ver); g.remove(); render(); }); return; }
      }
      if (b.dataset.doc) return load(b.dataset.doc);
      if (b.dataset.mode) return ask(b.dataset.mode);
      if (b.dataset.acc) return accept(+b.dataset.acc);
      if (b.dataset.skip) { sugg.edits[+b.dataset.skip].done = true; return paintSugg(); }
      if (b.dataset.acceptall !== undefined) { sugg.edits.forEach((x, i) => { if (!x.done && !x.stale) accept(i); }); return; }
      if (b.dataset.skipall !== undefined) { sugg = null; return paintSugg(); }
      if (b.dataset.append !== undefined) { const t = ed().value; ed().value = t.replace(/\s*$/, '') + (t.trim() ? '\n\n' : '') + sugg.append; sugg = null; dirty(); paintSugg(); ed().scrollTop = ed().scrollHeight; return; }
      if (b.id === 'wrCopy') { nxCopy(ed().value).catch(() => {}); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1200); return; }
      if (b.dataset.exp) { flush(); const r = await api.write.export({ title: $('wrTitle').value || doc.title, text: ed().value, format: b.dataset.exp }); if (r.ok) $('wrSaved').textContent = 'Exported'; else if (!r.canceled) $('wrSaved').textContent = r.error; return; }
      if (b.id === 'wrDel') { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Delete this document?'; return; } clearTimeout(saveTimer); saveTimer = null; list = await api.write.remove(doc.id); if (list[0]) await load(list[0].id); else await newDoc(); return; }
    });
    return { open, close };
  }
  window.NexusWrite = { mount };
})();
