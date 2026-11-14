// Meeting notes (v2.1): the HUD records your mic in ~30 s WAV chunks; each chunk is transcribed (on-device with the
// NexusCore helper, or OpenAI / ElevenLabs speech-to-text), then an agent writes a summary, decisions and action items.
// Notes are saved as a chat in the "Meetings" space; action items can become Apple Reminders.
const PROMPT = `\n\n[MEETING NOTES] You get a raw, machine transcript of a meeting, class or call (it may have errors and no speaker names).
Reply with ONLY a JSON object, no prose, no code fence:
{"title":"short meeting title","summary":"3-6 sentence summary","decisions":["decision", …],"actions":[{"task":"what to do","owner":"name or ''","due":"YYYY-MM-DD or ''"}],"topics":["topic", …],"followups":["open question", …]}
Only include actions someone actually needs to do. Use today's date to resolve words like "Friday". Don't invent facts.`;

function parseNotes(text) {
  const t = String(text || '');
  const m = t.match(/\{[\s\S]*\}/);
  let j = null;
  if (m) { for (const x of [m[0], m[0].replace(/,\s*([}\]])/g, '$1')]) { try { j = JSON.parse(x); break; } catch {} } }
  if (!j || typeof j !== 'object') return { title: '', summary: t.trim().slice(0, 2000), decisions: [], actions: [], topics: [], followups: [] };
  const arr = (v, n) => (Array.isArray(v) ? v : []).map(x => typeof x === 'string' ? x.trim() : x).filter(Boolean).slice(0, n);
  return {
    title: String(j.title || '').trim().slice(0, 80), summary: String(j.summary || '').trim().slice(0, 3000),
    decisions: arr(j.decisions, 15).map(String), topics: arr(j.topics, 12).map(String), followups: arr(j.followups, 10).map(String),
    actions: arr(j.actions, 25).map(a => typeof a === 'string' ? { task: a, owner: '', due: '' } : { task: String(a.task || '').trim().slice(0, 200), owner: String(a.owner || '').trim().slice(0, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(a.due || '') ? a.due : '' }).filter(a => a.task)
  };
}
function toMarkdown(n, { minutes = 0, date = new Date() } = {}) {
  const L = [`**${n.title || 'Meeting notes'}** · ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${minutes ? ` · ${minutes} min` : ''}`, '', n.summary];
  if (n.decisions.length) L.push('', '**Decisions**', ...n.decisions.map(d => `- ${d}`));
  if (n.actions.length) L.push('', '**Action items**', ...n.actions.map(a => `- [ ] ${a.task}${a.owner ? ` (${a.owner})` : ''}${a.due ? ` · due ${a.due}` : ''}`));
  if (n.followups.length) L.push('', '**Open questions**', ...n.followups.map(d => `- ${d}`));
  if (n.topics.length) L.push('', `_Topics: ${n.topics.join(', ')}_`);
  return L.join('\n');
}
// WAV header sanity check (the HUD sends 16-bit PCM mono)
function isWav(buf) { return buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE'; }

module.exports = { PROMPT, parseNotes, toMarkdown, isWav };
