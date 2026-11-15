// Auto-sorted Spaces (v2.7, toggle in Settings → Personal): after a new chat's first answer, Nexus files it into the
// Space it clearly belongs to, by comparing words with each Space's name, project goal and the chats already in it.
// Worked out on this Mac (no AI call). It only moves a chat when one Space is a clear winner.
const { STOP } = require('./wrapped');
const words = t => (String(t || '').toLowerCase().match(/[a-z0-9][a-z0-9'+#.-]{2,}/g) || []).map(w => w.replace(/[.'-]+$/, '')).filter(w => w.length > 2 && !STOP.has(w));

function profile(space, chats) {
  const p = {};
  const add = (t, wt) => { for (const w of words(t)) p[w] = (p[w] || 0) + wt; };
  add(space.name, 4);
  if (space.project) { add(space.project.goal, 3); add(space.project.notes, 1); }
  for (const c of chats.slice(-30)) { add(c.title, 1.5); const u = (c.messages || []).find(m => m.role === 'user'); add(String(u?.content || '').slice(0, 300), .5); }
  return p;
}
//   conv: the chat · spaces: user spaces (no builtin ones) · chatsIn(spaceId) → chats in it
function suggest(conv, spaces, chatsIn) {
  const firstUser = (conv.messages || []).find(m => m.role === 'user'), firstAi = (conv.messages || []).find(m => m.role === 'assistant' && !m.error);
  const ws = [...new Set([...words(conv.title), ...words(String(firstUser?.content || '').slice(0, 800)), ...words(String(firstAi?.content || '').slice(0, 400))])];
  if (ws.length < 2) return null;
  const scores = spaces.filter(s => !s.builtin).map(s => { const p = profile(s, chatsIn(s.id).filter(c => c.id !== conv.id)); return { id: s.id, name: s.name, score: ws.reduce((a, w) => a + (p[w] ? Math.min(p[w], 6) : 0), 0) }; })
    .sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (!best || best.score < 4 || (next && best.score < next.score * 1.6)) return null;
  return best;
}
module.exports = { suggest, words, profile };
