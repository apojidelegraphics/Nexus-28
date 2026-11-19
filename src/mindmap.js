// Mind map of your chats (3.9): every chat as a dot, grouped by its Space (or by topic when it isn't in one), and
// joined to the chats it's about the same things as. Built here from the saved chats; the window draws it.
//   build({ list, spaces, topics }) → { nodes: [{ id, kind: 'chat'|'space'|'topic', label, … }], links: [{ a, b, kind, w }] }
//   3.10: topics = { chatId: 'Topic name' } from Smarter topics (AI) replaces the keyword topics; backlinks() for a chat.
'use strict';
const STOP = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself also like get got make made want need please thanks thank hey hi hello okay ok yes yeah sure tell give show help know think one two use using used way really much many lot new good best better nexus can\'t don\'t i\'m it\'s what\'s let\'s').split(/\s+/));
const words = t => (String(t || '').toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || []).map(w => w.replace(/'s$/, '')).filter(w => !STOP.has(w) && w.length > 2);
const text = c => [c.title, c.title, ...(c.messages || []).filter(m => m.role === 'user' && !m.hidden).slice(0, 12).map(m => typeof m.content === 'string' ? m.content.slice(0, 600) : '')].join(' ');

function build({ list = [], spaces = [], max = 260, topics: aiTopics = null } = {}) {
  const chats = list.filter(c => !c.incognito && (c.messages || []).some(m => m.role === 'user')).sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, max);
  // keywords: tf-idf over your chats, the 6 most telling words per chat
  const df = new Map(), tf = new Map();
  for (const c of chats) { const counts = new Map(); for (const w of words(text(c))) counts.set(w, (counts.get(w) || 0) + 1); tf.set(c.id, counts); for (const w of counts.keys()) df.set(w, (df.get(w) || 0) + 1); }
  const N = chats.length || 1, top = new Map();
  for (const c of chats) {
    const scored = [...tf.get(c.id)].map(([w, n]) => [w, n * Math.log(1 + N / (df.get(w) || 1)) * (df.get(w) > 1 ? 1.25 : 1)]).sort((a, b) => b[1] - a[1]);
    top.set(c.id, scored.slice(0, 6).map(x => x[0]));
  }
  const spaceById = new Map(spaces.map(s => [s.id, s])), nodes = [], links = [], hubs = new Map();
  const hub = (id, label, kind, color) => { if (!hubs.has(id)) { hubs.set(id, true); nodes.push({ id, kind, label, color }); } return id; };
  // topics for chats outside Spaces: the shared keyword most of them have
  const topicOf = new Map(), wordChats = new Map();
  for (const c of chats) if (!spaceById.has(c.spaceId)) for (const w of top.get(c.id).slice(0, 3)) (wordChats.get(w) || wordChats.set(w, []).get(w)).push(c.id);
  const topics = [...wordChats].filter(([, ids]) => ids.length >= 2).sort((a, b) => b[1].length - a[1].length);
  if (aiTopics) { for (const c of chats) if (!spaceById.has(c.spaceId) && aiTopics[c.id]) topicOf.set(c.id, String(aiTopics[c.id]).slice(0, 40)); }
  else for (const [w, ids] of topics) for (const id of ids) if (!topicOf.has(id)) topicOf.set(id, w);
  for (const c of chats) {
    const persona = Object.entries((c.messages || []).reduce((m, x) => { if (x.persona) m[x.persona] = (m[x.persona] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    nodes.push({ id: c.id, kind: 'chat', label: String(c.title || 'Chat').slice(0, 80), updated: c.updated || 0, count: (c.messages || []).filter(m => !m.hidden).length, persona, words: top.get(c.id), pinned: !!c.pinned, space: c.spaceId || null });
    const sp = spaceById.get(c.spaceId);
    if (sp) links.push({ a: c.id, b: hub('space:' + sp.id, sp.name, 'space', sp.color || ''), kind: 'space', w: 1 });
    else if (topicOf.has(c.id)) links.push({ a: c.id, b: hub('topic:' + topicOf.get(c.id), topicOf.get(c.id), 'topic', ''), kind: 'topic', w: 1 });
    for (const l of c.links || []) if (chats.some(x => x.id === l)) links.push({ a: c.id, b: l, kind: 'link', w: 1 });
  }
  // chats about the same things: shared keywords (at most 3 per chat, strongest first)
  const per = new Map();
  for (let i = 0; i < chats.length; i++) for (let j = i + 1; j < chats.length; j++) {
    const A = top.get(chats[i].id), B = new Set(top.get(chats[j].id)), shared = A.filter(w => B.has(w));
    if (shared.length >= 2) { const w = shared.length / 6; for (const id of [chats[i].id, chats[j].id]) (per.get(id) || per.set(id, []).get(id)).push({ a: chats[i].id, b: chats[j].id, w, shared }); }
  }
  const seen = new Set();
  for (const list2 of per.values()) for (const l of list2.sort((x, y) => y.w - x.w).slice(0, 3)) { const k = l.a + '|' + l.b; if (!seen.has(k)) { seen.add(k); links.push({ a: l.a, b: l.b, kind: 'similar', w: l.w, shared: l.shared.slice(0, 3) }); } }
  return { nodes, links, total: list.length };
}
// 3.10 Backlinks (Obsidian-style): chats that link to this one, and chats about the same things
function backlinks({ list = [], id }) {
  const linked = list.filter(c => c.id !== id && (c.links || []).includes(id)).map(c => ({ id: c.id, title: c.title || 'Chat', updated: c.updated || 0 }));
  const links = list.find(c => c.id === id)?.links || [];
  const linksTo = list.filter(c => links.includes(c.id)).map(c => ({ id: c.id, title: c.title || 'Chat', updated: c.updated || 0 }));
  const g = build({ list });
  const similar = g.links.filter(l => l.kind === 'similar' && (l.a === id || l.b === id)).sort((x, y) => y.w - x.w).slice(0, 5)
    .map(l => { const o = l.a === id ? l.b : l.a, c = list.find(x => x.id === o); return c && { id: o, title: c.title || 'Chat', updated: c.updated || 0, shared: l.shared || [] }; }).filter(Boolean);
  return { linked, linksTo, similar };
}
// 3.10 Smarter topics: ask an agent to sort chat titles into topics; parse its JSON answer
function topicsPrompt(chats) {
  return 'Sort these chats into 3 to 12 topics by what they are about. Use short, clear topic names (1 to 3 words, like "Python", "Japan trip", "Chemistry"). Every chat goes in exactly one topic.\n'
    + 'Reply with ONLY JSON: {"topics":[{"name":"Topic","chats":[1,4,7]}]} using the numbers below.\n\n' + chats.map((c, i) => `${i + 1}. ${String(c.title || 'Chat').slice(0, 80)}`).join('\n');
}
function parseTopics(text, chats) {
  const m = String(text || '').match(/\{[\s\S]*\}/); if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  const out = {};
  for (const t of Array.isArray(j.topics) ? j.topics : []) for (const n of Array.isArray(t.chats) ? t.chats : []) { const c = chats[+n - 1]; if (c && t.name) out[c.id] = String(t.name).slice(0, 40); }
  return Object.keys(out).length ? out : null;
}
module.exports = { build, words, backlinks, topicsPrompt, parseTopics };
