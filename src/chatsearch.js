// Multi-chat awareness: search past chats, read one, and make a compact digest of a linked chat.
// Everything here is local (the chat history on this Mac); only the snippets an agent asks for go to the model.

const STOP = new Set('a an and are as at be but by can did do does for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to us was we were what when where which who why will with you your yeah ok okay please'.split(' '));
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9#@'\s-]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const day = ts => new Date(ts || 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Does this message refer to an earlier conversation? (Gives chat agents the search tools for that turn.)
const RECALL = /\b(we (talked|discussed|chatted|spoke|went over)|last (time|week|month|chat|conversation|night)|earlier|the other day|previous(ly)?|you (said|told me|mentioned|suggested|recommended)|i (said|told you|mentioned|asked)( you)?|remember (when|what|that|the)|my other chat|another chat|that chat|in (a|my|our) (past|old|previous) chat|before,? (you|we|i))\b/i;
const wantsRecall = text => RECALL.test(String(text || ''));

// Score every chat against the query. Returns [{ id, title, updated, score, snippets: [{ role, text }] }]
function search(list, query, { exclude = [], limit = 5, nameOf = id => id } = {}) {
  const q = words(query);
  if (!q.length) return [];
  const phrase = String(query || '').toLowerCase().trim();
  const results = [];
  for (const c of list) {
    if (exclude.includes(c.id) || !c.messages?.length) continue;
    let score = 0;
    const title = c.title.toLowerCase();
    for (const w of q) if (title.includes(w)) score += 4;
    const hits = [];
    c.messages.forEach((m, i) => {
      if (m.hidden || m.error || !m.content) return;
      const t = m.content.toLowerCase();
      let s = 0;
      for (const w of q) if (t.includes(w)) s += 1 + Math.min(2, t.split(w).length - 2);
      if (phrase.length > 6 && t.includes(phrase)) s += 4;
      if (s) { score += s; hits.push({ i, s }); }
    });
    if (!score) continue;
    // Recency bonus (up to +2 for this week).
    score += Math.max(0, 2 - (Date.now() - (c.updated || 0)) / (3.5 * 86400e3));
    const snippets = hits.sort((a, b) => b.s - a.s).slice(0, 3).sort((a, b) => a.i - b.i).map(({ i }) => {
      const m = c.messages[i];
      return { role: m.role === 'user' ? 'User' : nameOf(m.persona), text: clip(m.content, 280) };
    });
    results.push({ id: c.id, title: c.title, updated: c.updated, score: +score.toFixed(2), snippets });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

function formatResults(results) {
  if (!results.length) return 'No past chats matched. Answer from what you know, and say you could not find it in earlier chats if that matters.';
  return results.map((r, n) => `${n + 1}. "${r.title}" (chat id ${r.id}, ${day(r.updated)})\n` + r.snippets.map(s => `   ${s.role}: ${s.text}`).join('\n')).join('\n\n') +
    '\n\nUse read_chat with a chat id to read more of one.';
}

// Plain transcript of one chat (newest messages kept when long).
function transcript(c, { max = 9000, nameOf = id => id } = {}) {
  const lines = c.messages.filter(m => !m.hidden && !m.error && m.content).map(m => `${m.role === 'user' ? 'User' : nameOf(m.persona)}: ${m.content.trim()}`);
  let out = '', i = lines.length;
  while (i > 0 && out.length + lines[i - 1].length < max) out = lines[--i] + '\n\n' + out;
  return `Chat "${c.title}" (${day(c.created || c.updated)}${i > 0 ? `, last ${lines.length - i} of ${lines.length} messages` : ''}):\n\n${out.trim()}`;
}

// Compact digest for a linked chat: first question, key facts the user stated, and the latest exchange.
function digest(c, { max = 2400, nameOf = id => id } = {}) {
  const msgs = c.messages.filter(m => !m.hidden && !m.error && m.content);
  if (!msgs.length) return `Linked chat "${c.title}" is empty.`;
  const users = msgs.filter(m => m.role === 'user');
  const facts = users.flatMap(m => m.content.split(/(?<=[.!?])\s+|\n+/)).map(s => s.trim())
    .filter(s => /\b(i am|i'm|my|i have|i've|i like|i prefer|i want|i need|we are|we're|our|call me|i live|i work|i study|deadline|due|budget)\b/i.test(s) && s.length < 220).slice(0, 8);
  const parts = [`Linked chat "${c.title}" (${day(c.updated)}, ${msgs.length} messages).`];
  if (users[0]) parts.push(`It started with: ${clip(users[0].content, 260)}`);
  if (facts.length) parts.push('Things the user said there:\n' + facts.map(f => '- ' + clip(f, 200)).join('\n'));
  const tail = msgs.slice(-4).map(m => `${m.role === 'user' ? 'User' : nameOf(m.persona)}: ${clip(m.content, 420)}`);
  parts.push('Latest in that chat:\n' + tail.join('\n'));
  const out = parts.join('\n\n');
  return out.length > max ? out.slice(0, max - 1) + '…' : out;
}

module.exports = { search, formatResults, transcript, digest, wantsRecall, words };
