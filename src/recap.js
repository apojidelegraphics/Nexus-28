// Weekly recap (v2.7): every Sunday evening, your week in Nexus: chats, agents, topics, flashcards, streaks and
// achievements, worked out on this Mac (no AI call, nothing sent anywhere). Shows in Routines and on your phone.
const { STOP } = require('./wrapped');
const DAY = 864e5;

function weekBounds(now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return { from: monday.getTime(), to: monday.getTime() + 7 * DAY, key: monday.toISOString().slice(0, 10) };
}
//   list: conversations with messages · log: study review log [{ t, g }] · unlocked: { achievementId: ts } · achievements: [{ id, name, icon }]
function build({ list = [], log = [], unlocked = {}, achievements = [], personas = [], streak = 0, now = Date.now() } = {}) {
  const { from, to, key } = weekBounds(now);
  const prevFrom = from - 7 * DAY;
  const inWeek = t => t >= from && t < to, inPrev = t => t >= prevFrom && t < from;
  const mine = (c, test) => (c.messages || []).filter(m => m.role === 'user' && !m.local && !m.hidden && !/routine|brief|wrap|mission/.test(m.via || '') && test(m.ts));
  const you = list.flatMap(c => mine(c, inWeek).map(m => ({ ...m, conv: c }))), prevYou = list.reduce((n, c) => n + mine(c, inPrev).length, 0);
  const replies = list.flatMap(c => (c.messages || []).filter(m => m.role === 'assistant' && !m.error && !m.local && inWeek(m.ts || 0)));
  const agents = Object.entries(replies.reduce((a, m) => (a[m.persona] = (a[m.persona] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([id, n]) => { const p = personas.find(x => x.id === id); return { id, n, name: (p?.name || id).replace("Nexus '28 ", ''), color: p?.color || '#3dffa0' }; });
  const words = {}; for (const m of you) for (const w of String(m.content || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) if (!STOP.has(w)) words[w] = (words[w] || 0) + 1;
  const topics = Object.entries(words).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  const chats = new Set(you.map(m => m.conv.id));
  const longest = [...chats].map(id => { const c = list.find(x => x.id === id); return { title: c.title, n: mine(c, inWeek).length }; }).sort((a, b) => b.n - a.n)[0] || null;
  const reviews = log.filter(l => inWeek(l.t)), prevReviews = log.filter(l => inPrev(l.t)).length;
  const studyDays = new Set(reviews.map(l => new Date(l.t).toDateString())).size;
  const right = reviews.filter(l => l.g >= 2).length;
  const days = Array.from({ length: 7 }, (_, i) => { const s = from + i * DAY; return { label: 'MTWTFSS'[i], chats: you.filter(m => m.ts >= s && m.ts < s + DAY).length, cards: reviews.filter(l => l.t >= s && l.t < s + DAY).length }; });
  const busiest = days.reduce((b, d, i) => (d.chats + d.cards > days[b].chats + days[b].cards ? i : b), 0);
  const unl = achievements.filter(a => inWeek(unlocked[a.id] || 0)).map(a => ({ name: a.name, icon: a.icon }));
  const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
  return { key, from, to, messages: you.length, chats: chats.size, vsLast: pct(you.length, prevYou), agents, topics, longest, reviews: reviews.length, accuracy: reviews.length ? Math.round(right / reviews.length * 100) : null,
    reviewsVsLast: pct(reviews.length, prevReviews), studyDays, streak, days, busiest: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][busiest], achievements: unl };
}
const trend = p => p == null ? '' : p > 0 ? ` (↑ ${p}% vs last week)` : p < 0 ? ` (↓ ${-p}% vs last week)` : ' (same as last week)';
function markdown(r, nickname = '') {
  const range = `${new Date(r.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(r.to - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const lines = [`## 📊 ${nickname ? nickname + "'s" : 'Your'} week in Nexus · ${range}`, ''];
  if (!r.messages && !r.reviews) return lines.concat(['A quiet week. Nothing to recap, and that\'s fine. 🌙']).join('\n');
  if (r.messages) lines.push(`**${r.messages} message${r.messages === 1 ? '' : 's'}** across ${r.chats} chat${r.chats === 1 ? '' : 's'}${trend(r.vsLast)}.`);
  if (r.agents.length) lines.push(`**Most help from:** ${r.agents.map(a => `${a.name} (${a.n})`).join(', ')}.`);
  if (r.topics.length) lines.push(`**On your mind:** ${r.topics.join(', ')}.`);
  if (r.longest?.n > 2) lines.push(`**Deepest chat:** “${r.longest.title}” (${r.longest.n} messages).`);
  if (r.reviews) lines.push(`**Flashcards:** ${r.reviews} reviewed on ${r.studyDays} day${r.studyDays === 1 ? '' : 's'}, ${r.accuracy}% remembered${trend(r.reviewsVsLast)}.`);
  if (r.streak) lines.push(`**Streak:** ${r.streak} day${r.streak === 1 ? '' : 's'} 🔥`);
  lines.push(`**Busiest day:** ${r.busiest}.`);
  if (r.achievements.length) lines.push(`**Unlocked:** ${r.achievements.map(a => `${a.icon} ${a.name}`).join(' · ')}`);
  lines.push('', '```nexus-chart\n' + JSON.stringify({ type: 'bar', title: 'This week', labels: r.days.map(d => d.label), series: [{ name: 'Messages', data: r.days.map(d => d.chats) }, { name: 'Cards', data: r.days.map(d => d.cards) }] }) + '\n```');
  return lines.join('\n');
}
// Sunday from 18:00, once per week
const due = (lastKey, now = Date.now(), hour = 18) => { const d = new Date(now); return d.getDay() === 0 && d.getHours() >= hour && weekBounds(now).key !== lastKey; };
module.exports = { build, markdown, weekBounds, due };
