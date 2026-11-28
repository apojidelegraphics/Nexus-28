// 4.4.0 StoryLattice panel: Solis's creative notes for this chat (title, look, palette, characters, world rules, and the
// pictures made with LuminaRender). Shown at the top of the chat while Solis is the agent, or when the chat has notes.
// Collapsed it's one line; open it to read or edit. Solis keeps it up to date by itself.
//   NexusLattice.paint({ el, conv, persona, api, toast })
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let open = false, editing = false, lastSig = '', ctx = null;
  const has = l => !!(l && (l.title || l.style || (l.characters || []).length || (l.palette || []).length || (l.rules || []).length || (l.frames || []).length));
  function paint(o) {
    ctx = o; const { el, conv, persona } = o; if (!el) return;
    const l = conv?.lattice || {}, show = !!conv && !conv.incognito && (persona?.id === 'solis' || has(l));
    if (!show) { el.hidden = true; el.innerHTML = ''; lastSig = ''; return; }
    const sig = JSON.stringify([conv.id, l.updated, (l.frames || []).length, open, editing, persona?.id]);
    if (sig === lastSig && !el.hidden) return; lastSig = sig;
    if (editing && el.querySelector('.lt-edit')) return;   // don't wipe what you're typing
    el.hidden = false;
    const chars = l.characters || [], frames = l.frames || [], pal = l.palette || [];
    const summary = [chars.length ? `${chars.length} character${chars.length === 1 ? '' : 's'}` : '', pal.length ? `${pal.length} colors` : '', frames.length ? `${frames.length} picture${frames.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    el.innerHTML = `<div class="lt-head" data-lt="toggle"><span class="lt-k">STORYLATTICE</span><b>${esc(l.title || (has(l) ? 'Untitled world' : 'Your world'))}</b><small>${esc(summary || 'Solis fills this in as you build your world')}</small>
        ${pal.length ? `<span class="lt-pal">${pal.slice(0, 6).map(c => `<i style="background:${esc(c)}"></i>`).join('')}</span>` : ''}<span class="lt-chev">${open ? 'Hide' : 'Open'}</span></div>
      ${open ? (editing ? editHtml(l) : viewHtml(l)) : ''}`;
  }
  function viewHtml(l) {
    const chars = l.characters || [], frames = l.frames || [], pal = l.palette || [], rules = l.rules || [];
    return `<div class="lt-body">
      ${l.style ? `<div class="lt-row"><span>LOOK</span><p>${esc(l.style)}</p></div>` : ''}
      ${pal.length ? `<div class="lt-row"><span>PALETTE</span><div class="lt-sw">${pal.map(c => `<button data-lt="copy" data-v="${esc(c)}" title="Copy ${esc(c)}"><i style="background:${esc(c)}"></i>${esc(c)}</button>`).join('')}</div></div>` : ''}
      ${chars.length ? `<div class="lt-row"><span>CHARACTERS</span><div class="lt-chars">${chars.map(c => `<div><b>${esc(c.name)}</b>${c.note ? `<small>${esc(c.note)}</small>` : ''}</div>`).join('')}</div></div>` : ''}
      ${rules.length ? `<div class="lt-row"><span>WORLD RULES</span><ul>${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      ${frames.length ? `<div class="lt-row"><span>PICTURES</span><div class="lt-frames">${frames.slice(-12).reverse().map(f => `<button data-lt="frame" data-att="${esc(f.att)}" title="${esc(f.prompt)}">${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : '<i></i>'}</button>`).join('')}</div></div>` : ''}
      ${has(l) ? '' : '<p class="lt-empty">Tell Solis about your world (a title, characters, the look you want) and it keeps the notes here, so every answer and picture stays consistent.</p>'}
      <div class="lt-acts"><button data-lt="edit">Edit</button></div></div>`;
  }
  function editHtml(l) {
    return `<div class="lt-body lt-edit">
      <label>Title<input data-f="title" maxlength="80" value="${esc(l.title || '')}"></label>
      <label>Look and style<input data-f="style" maxlength="240" value="${esc(l.style || '')}" placeholder="Watercolor, soft morning light…"></label>
      <label>Palette (hex colors)<input data-f="palette" value="${esc((l.palette || []).join(', '))}" placeholder="#F59E0B, #FDE68A"></label>
      <label>Characters (one per line: Name: note)<textarea data-f="characters" rows="4">${esc((l.characters || []).map(c => c.name + (c.note ? ': ' + c.note : '')).join('\n'))}</textarea></label>
      <label>World rules (one per line)<textarea data-f="rules" rows="3">${esc((l.rules || []).join('\n'))}</textarea></label>
      <div class="lt-acts"><button data-lt="cancel">Cancel</button><button class="pri" data-lt="save">Save</button></div></div>`;
  }
  async function onClick(e) {
    const b = e.target.closest('[data-lt]'); if (!b || !ctx) return;
    const k = b.dataset.lt, el = ctx.el;
    if (k === 'toggle') { open = !open; if (!open) editing = false; lastSig = ''; return paint(ctx); }
    if (k === 'edit') { editing = true; lastSig = ''; return paint(ctx); }
    if (k === 'cancel') { editing = false; lastSig = ''; return paint(ctx); }
    if (k === 'copy') { try { await navigator.clipboard.writeText(b.dataset.v); ctx.toast?.('Copied ' + b.dataset.v); } catch {} return; }
    if (k === 'frame') { ctx.api?.lumina?.save(b.dataset.att); return; }
    if (k === 'save') {
      const v = f => el.querySelector(`[data-f="${f}"]`)?.value || '';
      const lattice = { title: v('title'), style: v('style'), palette: v('palette').split(/[\s,]+/).filter(Boolean),
        characters: v('characters').split('\n').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf(':'); return i > 0 ? { name: x.slice(0, i).trim(), note: x.slice(i + 1).trim() } : { name: x, note: '' }; }),
        rules: v('rules').split('\n').map(x => x.trim()).filter(Boolean) };
      const r = await ctx.api?.lattice?.set(ctx.conv.id, lattice);
      editing = false; lastSig = '';
      if (r?.ok) { ctx.conv.lattice = r.lattice; ctx.toast?.('StoryLattice saved'); }
      paint(ctx);
    }
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => { if (e.target.closest('#lattice')) onClick(e); });
  root.NexusLattice = { paint };
})(typeof window !== 'undefined' ? window : globalThis);
