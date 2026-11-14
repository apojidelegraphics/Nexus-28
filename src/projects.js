// Projects (v2.1): a Space can become a project for one class or goal. It holds a goal, a due date, notes, files,
// flashcard decks, a citations project and its chats + missions, and agents in any chat of that project can see all
// of it (a compact digest goes along with each message). Everything stays on this Mac.
//   cleanProject(patch, { decks, citeProjects, attachments }) → stored on the space as space.project
//   projectContext({ space, convId, convos, study, citeStore, citations, attachments }) → text for the agent
const MAX_FILES = 12, FILE_CHARS = 2500, TOTAL_CHARS = 14000;
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

function cleanProject(p = {}, { deckIds = [], citeProjects = [] } = {}) {
  return {
    on: p.on !== false,
    goal: clip(String(p.goal || '').trim(), 300),
    due: /^\d{4}-\d{2}-\d{2}$/.test(p.due || '') ? p.due : '',
    notes: clip(String(p.notes || ''), 6000),
    decks: [...new Set((Array.isArray(p.decks) ? p.decks : []).map(String))].filter(id => deckIds.includes(id)).slice(0, 12),
    cite: citeProjects.includes(p.cite) ? p.cite : '',
    files: [...new Set((Array.isArray(p.files) ? p.files : []).map(String))].filter(id => /^a[a-z0-9]+$/.test(id)).slice(0, MAX_FILES)
  };
}

function projectContext({ space, convId, convos, study, citeStore, citations, attachments, now = Date.now() }) {
  const p = space?.project;
  if (!p || p.on === false) return '';
  const out = [`\n\n[PROJECT "${space.name}" — this chat is part of the user's project; use what's here when it helps]`];
  if (p.goal) out.push(`Goal: ${p.goal}`);
  if (p.due) { const days = Math.ceil((new Date(p.due + 'T23:59:59').getTime() - now) / 864e5); out.push(`Due: ${p.due}${days >= 0 ? ` (${days} day${days === 1 ? '' : 's'} left)` : ' (past due)'}`); }
  if (p.notes) out.push(`Project notes:\n${clip(p.notes, 3000)}`);
  const chats = convos.load().list.filter(c => c.spaceId === space.id && c.id !== convId && c.messages.length).sort((a, b) => b.updated - a.updated);
  if (chats.length) out.push(`Other chats in this project (${chats.length}; read one with read_chat if you can):\n` + chats.slice(0, 15).map(c => {
    const last = [...c.messages].reverse().find(m => m.role === 'assistant' && !m.error);
    return `• ${c.kind === 'mission' ? '⚑ Mission ' : ''}"${clip(c.title, 70)}" [${c.id}]${last ? ` — ${clip(String(last.content).replace(/\s+/g, ' '), 160)}` : ''}`;
  }).join('\n'));
  for (const id of p.decks || []) {
    const d = study.decks().find(x => x.id === id); if (!d) continue;
    const cards = study.cards(id);
    out.push(`Flashcard deck "${d.name}" (${cards.length} cards, ${d.mastered} mastered, ${d.due} due): ` + cards.slice(0, 12).map(c => `${clip(c.front, 60)} → ${clip(c.back, 60)}`).join(' · '));
  }
  if (p.cite && citeStore) {
    const list = citeStore.all().filter(c => c.project === p.cite).slice(0, 12);
    if (list.length) out.push(`Sources (citation project "${p.cite}"):\n` + list.map(c => `• ${clip(citations.format(c, 'mla', { md: false }), 220)}`).join('\n'));
  }
  let budget = TOTAL_CHARS - out.join('\n').length;
  for (const id of p.files || []) {
    const m = attachments.meta(id); if (!m || budget < 300) continue;
    const text = clip(m.text || '', Math.min(FILE_CHARS, budget));
    out.push(`File "${m.name}"${text ? `:\n${text}` : ' (no readable text)'}`);
    budget -= text.length + 40;
  }
  return out.join('\n');
}

module.exports = { cleanProject, projectContext };
