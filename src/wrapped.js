// Nexus Wrapped (v1.7): your year in Nexus, from chats on this Mac + Stats. Nothing leaves your Mac.
//   build({ list: conversations, metrics: summary(), study: stats(), personas, year, now }) → { slides data }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STOP = new Set('the a an and or but if of to in on for with is are was were be been it this that these those i you me my your we our they them what how why when where who can could would should do does did not no yes so just like about from at by as into than then there here have has had will get got make made want need know think help please thanks thank ok okay hey nexus really also some any more most very much many one two its it\'s im i\'m dont don\'t can\'t whats what\'s give tell show find use using write explain'.split(' '));

function build({ list = [], metrics = {}, study = {}, personas = [], year = new Date().getFullYear(), now = Date.now() } = {}) {
  const from = new Date(year, 0, 1).getTime(), to = new Date(year + 1, 0, 1).getTime();
  const msgs = [];
  const chats = list.filter(c => (c.messages || []).some(m => m.ts >= from && m.ts < to && !m.hidden));
  for (const c of chats) for (const m of c.messages) if (m.ts >= from && m.ts < to && !m.hidden) msgs.push({ ...m, conv: c });
  const you = msgs.filter(m => m.role === 'user' && !m.local && !m.via?.match?.(/routine|brief|wrap|mission/));
  const replies = msgs.filter(m => m.role === 'assistant' && !m.error && !m.local);
  const hours = Array(24).fill(0), days = Array(7).fill(0), months = Array(12).fill(0);
  for (const m of you) { const d = new Date(m.ts); hours[d.getHours()]++; days[d.getDay()]++; months[d.getMonth()]++; }
  const top = (arr) => arr.reduce((b, v, i) => (v > arr[b] ? i : b), 0);
  const agentCount = {};
  for (const m of replies) agentCount[m.persona] = (agentCount[m.persona] || 0) + 1;
  const agents = Object.entries(agentCount).sort((a, b) => b[1] - a[1]).map(([id, n]) => { const p = personas.find(x => x.id === id); return { id, n, name: p?.name || id, color: p?.color || '#3dffa0' }; });
  const featCount = {};
  for (const m of replies) for (const f of m.features || []) featCount[f] = (featCount[f] || 0) + 1;
  const features = Object.entries(featCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ id, n }));
  const words = you.reduce((n, m) => n + String(m.content || '').split(/\s+/).filter(Boolean).length, 0);
  const wordCount = {};
  for (const m of you) for (const w of String(m.content || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) if (!STOP.has(w)) wordCount[w] = (wordCount[w] || 0) + 1;
  const topics = Object.entries(wordCount).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
  const longest = chats.map(c => ({ title: c.title, n: c.messages.filter(m => !m.hidden && m.ts >= from && m.ts < to).length })).sort((a, b) => b.n - a.n)[0] || null;
  const first = you.reduce((a, m) => (!a || m.ts < a.ts ? m : a), null);
  const voice = you.filter(m => m.via === 'voice').length;
  const h = top(hours);
  // v3.4: more to show
  const byDay = {};
  for (const m of you) { const k = new Date(m.ts).toDateString(); byDay[k] = (byDay[k] || 0) + 1; }
  const bigDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0] || null;
  const activeDays = Object.keys(byDay).length;
  const questions = you.filter(m => /\?\s*$/.test(String(m.content || '').trim())).length;
  const lateNight = you.filter(m => { const x = new Date(m.ts).getHours(); return x < 4; }).length;
  const aiWords = replies.reduce((n, m) => n + String(m.content || '').split(/\s+/).filter(Boolean).length, 0);
  const regenerated = replies.filter(m => (m.versions || []).length > 1).length;
  const edited = you.filter(m => m.edited).length;
  const widgets = replies.reduce((n, m) => n + (String(m.content || '').match(/```nexus-/g) || []).length, 0);
  const spaces = new Set(chats.map(c => c.spaceId).filter(Boolean)).size;
  const agentShare = agents.slice(0, 5).map(a => ({ ...a, pct: Math.round(a.n / Math.max(1, replies.length) * 100) }));
  const persona = personality({ hours, voice, you: you.length, features, metrics, study, agents });
  // 4.0: a calendar of the whole year, what the agents did for you, what you showed them, and your word of the year
  const dayMap = Array.from({ length: Math.round((to - from) / 864e5) }, () => 0);
  for (const m of you) { const i = Math.floor((new Date(new Date(m.ts).toDateString()).getTime() - from) / 864e5); if (i >= 0 && i < dayMap.length) dayMap[i]++; }
  let run = 0, bestRun = 0, bestRunEnd = -1; dayMap.forEach((n, i) => { run = n ? run + 1 : 0; if (run > bestRun) { bestRun = run; bestRunEnd = i; } });
  const KIND = t => /^(web_search|knowledge_lookup)$/.test(t) ? 'searches' : /^(fetch_url|deep_browse|cite_source)$/.test(t) ? 'pages' : /^calendar/.test(t) ? 'calendar' : /^reminders/.test(t) ? 'reminders' : /^spotify_/.test(t) ? 'music' : /^(find_files|read_file)$/.test(t) ? 'files' : t === 'look_at_screen' ? 'screen' : t === 'weather' ? 'weather' : t === 'video' ? 'video' : /^(open_app|open_url|open_file|set_volume|dark_mode|media_control|set_timer|copy_to_clipboard|run_shortcut)$/.test(t) ? 'computer' : /__|^mcp/.test(t) ? 'connectors' : null;
  const did = {};
  for (const m of replies) for (const a of m.activity || []) { const k = KIND(a.tool); if (k && a.status !== 'error' && a.status !== 'denied') did[k] = (did[k] || 0) + 1; }
  const shown = { pictures: 0, videos: 0, voice: 0, files: 0 };
  for (const m of you) for (const a of m.attachments || []) { const k = a.kind === 'image' || a.kind === 'screen' ? 'pictures' : a.kind === 'video' ? 'videos' : a.kind === 'voice' ? 'voice' : 'files'; shown[k]++; }
  const dayPart = { morning: 0, afternoon: 0, evening: 0, night: 0 }; hours.forEach((n, h) => { dayPart[h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night'] += n; });
  return {
    year, empty: you.length < 3,
    messages: you.length, replies: replies.length, chats: chats.length, words, voice,
    firstChat: first ? { at: first.ts, text: String(first.content || '').slice(0, 90) } : null,
    busiestHour: h, busiestHourLabel: `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`, hours,
    busiestDay: DAYS[top(days)], days, busiestMonth: MONTHS[top(months)], months,
    agents, topAgent: agents[0] || null, features, topics, longest,
    points: metrics.points || 0, bestStreak: metrics.bestStreak || 0, achievements: (metrics.achievements || []).filter(a => a.unlocked).length, achievementsTotal: (metrics.achievements || []).length,
    missions: metrics.missions || 0, screen: metrics.screen || 0, huddles: metrics.huddles || 0, debates: metrics.debates || 0,
    cardsReviewed: study.totalReviews || 0, cards: study.cards || 0, challenges: metrics.challenge?.total || 0,
    bigDay: bigDay ? { date: bigDay[0], n: bigDay[1] } : null, activeDays, questions, lateNight, aiWords, pages: Math.round(aiWords / 300),
    regenerated, edited, widgets, spaces, agentShare, streak: metrics.streak || 0,
    persona,
    dayMap, startDay: new Date(from).getDay(), bestRun, bestRunEnd: bestRunEnd >= 0 ? from + bestRunEnd * 864e5 : null,
    did, didTotal: Object.values(did).reduce((a, b) => a + b, 0), shown, dayPart, wordOfYear: topics[0] || '',
    writes: metrics.counts?.write || metrics.write || 0, focusMinutes: metrics.focusMinutes || 0
  };
}
// A fun label for the year, from what you did most.
function personality({ hours, voice, you, features, metrics, study, agents }) {
  const night = hours.slice(0, 5).reduce((a, b) => a + b, 0) + hours[23] + hours[22];
  const morning = hours.slice(5, 9).reduce((a, b) => a + b, 0);
  const f = new Set(features.map(x => x.id));
  const options = [
    [night / Math.max(1, you) > .3, 'The Night Owl', 'Your best ideas showed up after dark.'],
    [morning / Math.max(1, you) > .3, 'The Early Riser', 'You were up and building before most people had coffee.'],
    [(study.totalReviews || 0) >= 100 || f.has('StudyMode') || f.has('Magyk'), 'The Scholar', 'Flashcards, quizzes, and a lot of learning.'],
    [voice / Math.max(1, you) > .3, 'The Talker', 'Why type when you can just say it?'],
    [f.has('Seek') || f.has('Knowledge') || (metrics.missions || 0) >= 3, 'The Researcher', 'You went digging for answers, and found them.'],
    [f.has('Synergy') || f.has('Envision'), 'The Idea Machine', 'Brainstorms, boards, and big ideas.'],
    [(metrics.huddles || 0) + (metrics.debates || 0) >= 3, 'The Moderator', 'You loved getting the agents to argue it out.'],
    [agents.length >= 4, 'The Explorer', 'You tried every agent on the roster.'],
    [(metrics.missions || 0) >= 1 && agents[0]?.id === 'paragon', 'The Commander', 'You gave Paragon the goals and let it run.'],
    [(metrics.bestStreak || 0) >= 14, 'The Unstoppable', 'Two weeks or more without missing a day.']
  ];
  const hit = options.find(o => o[0]) || [true, 'The Builder', 'Steady, curious, and always making something.'];
  return { title: hit[1], line: hit[2] };
}
module.exports = { build, personality, STOP };
