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
// 4.3.0 Weekly report card: letter grades from the recap (no AI call). Each subject is graded against a simple goal,
// and the overall grade is the average. Subjects with nothing to grade (no flashcards this week) are left out.
const LETTERS = [[93, 'A'], [85, 'A-'], [78, 'B+'], [70, 'B'], [62, 'B-'], [55, 'C+'], [47, 'C'], [38, 'C-'], [25, 'D'], [0, 'F']];
const letter = n => LETTERS.find(([min]) => n >= min)[1];
function grade(r, { focusSessions = 0, questsDone = 0 } = {}) {
  const sc = (v, goal) => Math.max(0, Math.min(100, Math.round(v / goal * 100)));
  const activeDays = r.days.filter(d => d.chats + d.cards > 0).length;
  const items = [
    { key: 'consistency', label: 'Consistency', score: sc(activeDays, 6), note: `${activeDays}/7 days active` },
    { key: 'curiosity', label: 'Curiosity', score: sc(r.messages, 40), note: `${r.messages} message${r.messages === 1 ? '' : 's'} in ${r.chats} chat${r.chats === 1 ? '' : 's'}` }
  ];
  if (r.reviews) items.push({ key: 'study', label: 'Study', score: Math.round(sc(r.reviews, 80) * 0.6 + (r.accuracy || 0) * 0.4), note: `${r.reviews} cards · ${r.accuracy}% remembered` });
  if (focusSessions) items.push({ key: 'focus', label: 'Focus', score: sc(focusSessions, 7), note: `${focusSessions} Focus session${focusSessions === 1 ? '' : 's'}` });
  if (questsDone) items.push({ key: 'quests', label: 'Quests', score: sc(questsDone, 15), note: `${questsDone} quest${questsDone === 1 ? '' : 's'} done` });
  if (r.streak) items.push({ key: 'streak', label: 'Streak', score: sc(r.streak, 7), note: `${r.streak}-day streak` });
  for (const i of items) i.grade = letter(i.score);
  const avg = items.length ? Math.round(items.reduce((a, i) => a + i.score, 0) / items.length) : 0;
  const best = items.slice().sort((a, b) => b.score - a.score)[0], low = items.slice().sort((a, b) => a.score - b.score)[0];
  const tip = !r.messages && !r.reviews ? 'A quiet week. One chat or ten flashcards a day lifts every grade.'
    : low && low.score < 60 ? { consistency: 'Show up a little every day: even 5 minutes counts.', curiosity: 'Ask Nexus about one thing you are curious about each day.', study: 'Ten flashcards a day adds up fast.', focus: 'Try one 25-minute Focus block a day.', quests: 'Daily quests are quick Cirkts: check them each morning.', streak: 'Keep the streak alive tomorrow.' }[low.key] : 'Great week. Keep the same rhythm.';
  return { key: r.key, from: r.from, to: r.to, overall: letter(avg), score: avg, items, best: best && best.score >= 40 ? best.label : '', tip, achievements: r.achievements || [] };
}
// Sunday from 18:00, once per week
const due = (lastKey, now = Date.now(), hour = 18) => { const d = new Date(now); return d.getDay() === 0 && d.getHours() >= hour && weekBounds(now).key !== lastKey; };
module.exports = { build, markdown, weekBounds, due, grade, letter };
