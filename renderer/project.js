// Project panel (v2.1): turn a Space into a project for a class or goal. Goal, due date, notes, files, decks and a
// citations project; agents in the project's chats see all of it.
//   NexusProject.mount({ api, openChat(id), newChatIn(spaceId), startMission(goal) }) → { open(spaceId) }
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ago = t => { const d = Date.now() - t; return d < 3600e3 ? Math.max(1, Math.round(d / 60e3)) + 'm' : d < 864e5 ? Math.round(d / 3600e3) + 'h' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

  function mount({ api, openChat, newChatIn, startMission }) {
    let id = null, data = null, notesTimer = null;
    const save = patch => api.spaces.update(id, { project: patch });
    async function load() { data = await api.project.get(id); if (!data) return close(); render(); }
    function open(spaceId) { id = spaceId; $('projectModal').hidden = false; load(); }
    function close() { $('projectModal').hidden = true; clearTimeout(notesTimer); }
    function render() {
      const sp = data.space, p = sp.project || {}, on = !!sp.project && p.on !== false;
      const chats = data.chats.filter(c => c.kind !== 'mission'), missions = data.chats.filter(c => c.kind === 'mission');
      const days = p.due ? Math.ceil((new Date(p.due + 'T23:59:59') - Date.now()) / 864e5) : null;
      $('pjTitle').innerHTML = `<i style="background:${esc(sp.color)}"></i>${esc(sp.name)}${days !== null ? `<span class="pj-due ${days < 3 ? 'soon' : ''}">${days >= 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'past due'}</span>` : ''}`;
      $('pjBody').innerHTML = `
        <label class="check"><input type="checkbox" id="pjOn" ${on ? 'checked' : ''}> <b>Make this space a project</b> <span class="note">agents in its chats see the goal, notes, files, decks, sources and other chats</span></label>
        <div class="pj-grid ${on ? '' : 'off'}">
          <div class="pj-col">
            <input id="pjGoal" placeholder="Goal, e.g. Ace the AP Bio final" value="${esc(p.goal || '')}" maxlength="300">
            <div class="row"><span class="note" style="flex:none">Due</span><input id="pjDue" type="date" value="${esc(p.due || '')}" style="flex:none;width:auto"><span style="flex:1"></span></div>
            <textarea id="pjNotes" rows="7" placeholder="Notes for you and your agents: what the teacher said, requirements, ideas…">${esc(p.notes || '')}</textarea>
            <div class="pj-sec"><b>📎 Files</b><button class="link-btn" id="pjAddFiles">＋ Add files</button></div>
            <div class="pj-list">${data.files.map(f => `<div class="pj-item"><span>${f.kind === 'image' ? '🖼' : f.kind === 'pdf' ? '📄' : '📝'} ${esc(f.name)}</span><small>${f.chars ? Math.round(f.chars / 1000) + 'k chars' : ''}</small><button class="link-btn danger" data-rmfile="${esc(f.id)}">Remove</button></div>`).join('') || '<div class="note">Add notes, PDFs, slides or photos. Agents read their text.</div>'}</div>
          </div>
          <div class="pj-col">
            <div class="pj-sec"><b>💬 Chats</b><button class="link-btn" id="pjNewChat">＋ New chat here</button></div>
            <div class="pj-list">${chats.slice(0, 12).map(c => `<div class="pj-item link" data-chat="${esc(c.id)}"><span>${esc(c.title)}</span><small>${ago(c.updated)}</small></div>`).join('') || '<div class="note">No chats yet. Drag chats onto this space, or start one here.</div>'}</div>
            <div class="pj-sec"><b>⚑ Missions</b><button class="link-btn" id="pjMission">＋ Mission for this project</button></div>
            <div class="pj-list">${missions.slice(0, 6).map(c => `<div class="pj-item link" data-chat="${esc(c.id)}"><span>${esc(c.title)}</span><small>${ago(c.updated)}</small></div>`).join('') || '<div class="note">None yet.</div>'}</div>
            <div class="pj-sec"><b>📚 Decks</b></div>
            <div class="pj-checks">${data.decks.map(d => `<label class="check"><input type="checkbox" data-deck="${esc(d.id)}" ${(p.decks || []).includes(d.id) ? 'checked' : ''}> ${esc(d.name)} <small class="note">${d.total} cards</small></label>`).join('') || '<div class="note">Make decks in Study.</div>'}</div>
            <div class="pj-sec"><b>❝ Sources</b></div>
            <select id="pjCite"><option value="">No citations project</option>${data.citeProjects.map(c => `<option ${p.cite === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          </div>
        </div>`;
    }
    $('projectModal').addEventListener('click', async e => {
      if (e.target.closest('[data-close]') || e.target === $('projectModal')) return close();
      const t = e.target.closest('button, [data-chat]'); if (!t) return;
      if (t.dataset.chat) { close(); return openChat(t.dataset.chat); }
      if (t.id === 'pjAddFiles') { t.textContent = 'Adding…'; const r = await api.project.addFiles(id); if (r.errors?.length) alert(r.errors.join('\n')); return load(); }
      if (t.dataset.rmfile) { await save({ files: (data.space.project?.files || []).filter(f => f !== t.dataset.rmfile) }); return load(); }
      if (t.id === 'pjNewChat') { close(); return newChatIn(id); }
      if (t.id === 'pjMission') { const p = data.space.project || {}; close(); return startMission(`For my project "${data.space.name}"${p.goal ? ` (goal: ${p.goal})` : ''}: `); }
    });
    $('projectModal').addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'pjOn') { await (t.checked ? save({ on: true }) : api.spaces.update(id, { project: { ...(data.space.project || {}), on: false } })); return load(); }
      if (t.id === 'pjGoal') await save({ goal: t.value });
      if (t.id === 'pjDue') { await save({ due: t.value }); return load(); }
      if (t.id === 'pjCite') await save({ cite: t.value });
      if (t.dataset.deck) { const set = new Set(data.space.project?.decks || []); t.checked ? set.add(t.dataset.deck) : set.delete(t.dataset.deck); await save({ decks: [...set] }); data = await api.project.get(id); }
    });
    $('projectModal').addEventListener('input', e => { if (e.target.id === 'pjNotes') { clearTimeout(notesTimer); const v = e.target.value; notesTimer = setTimeout(() => save({ notes: v }), 600); } });
    return { open, close };
  }
  window.NexusProject = { mount };
})();
