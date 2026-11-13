// Stats, points and achievements (kept on this Mac). Points work like the web Nexus: actions earn points,
// and the web's "100+ Points Club", "500+ Points Elite" and "Chat Veteran" achievements carry over.
const fs = require('fs');
const path = require('path');

const POINTS = { chat: 1, voice: 1, screen: 2, regenerate: 1, export: 2, calc: 1, mission: 10, routine_created: 5, routine_run: 1, brief: 2, wake: 1, watch: 2, explain: 1, huddle: 2, debate: 3, redeem: 15, feature: 1, achievement: 10 };

const ACHIEVEMENTS = [
  { id: 'first_chat', icon: '✦', name: 'Hello, Nexus', desc: 'Send your first message.', test: s => s.chats >= 1 },
  { id: 'chat_veteran', icon: '◆', name: 'Chat Veteran', desc: '50 messages sent.', test: s => s.chats >= 50 },
  { id: 'centurion', icon: '⬢', name: 'Centurion', desc: '250 messages sent.', test: s => s.chats >= 250 },
  { id: 'points_100', icon: '★', name: '100+ Points Club', desc: 'Earn 100 points.', test: s => s.points >= 100 },
  { id: 'points_500', icon: '✪', name: '500+ Points Elite', desc: 'Earn 500 points.', test: s => s.points >= 500 },
  { id: 'full_roster', icon: '◎', name: 'Full Roster', desc: 'Chat with Paragon, Neodela, Lyte and Flash.', test: s => ['paragon', 'neodela', 'lyte', 'flash'].every(a => s.agents[a]) },
  { id: 'time_traveler', icon: '⌛', name: 'Time Traveler', desc: 'Chat with a classic model.', test: s => Object.keys(s.agents).some(a => a.startsWith('legacy:')) },
  { id: 'hey_nexus', icon: '◉', name: 'Hey Nexus', desc: 'Wake Nexus with your voice.', test: s => s.wake >= 1 },
  { id: 'talker', icon: '🎙', name: 'Talker', desc: '10 voice messages.', test: s => s.voice >= 10 },
  { id: 'screen_detective', icon: '👁', name: 'Screen Detective', desc: 'Ask Nexus about your screen.', test: s => s.screen >= 1 },
  { id: 'eagle_eye', icon: '🦅', name: 'Eagle Eye', desc: '25 screen looks.', test: s => s.screen >= 25 },
  { id: 'second_opinion', icon: '↻', name: 'Second Opinion', desc: 'Regenerate a reply.', test: s => s.regenerate >= 1 },
  { id: 'archivist', icon: '⤓', name: 'Archivist', desc: 'Export a chat.', test: s => s.export >= 1 },
  { id: 'number_cruncher', icon: '∑', name: 'Number Cruncher', desc: '10 calculations or conversions.', test: s => s.calc >= 10 },
  { id: 'feature_creep', icon: '@', name: 'Feature Creep', desc: 'Use 5 different @features.', test: s => Object.keys(s.features).length >= 5 },
  { id: 'mission_accomplished', icon: '⚑', name: 'Mission Accomplished', desc: 'Finish a mission.', test: s => s.mission >= 1 },
  { id: 'creature_of_habit', icon: '⟳', name: 'Creature of Habit', desc: 'Create a routine.', test: s => s.routine_created >= 1 },
  { id: 'morning_person', icon: '☀', name: 'Morning Person', desc: 'Get 5 Morning Briefs.', test: s => s.brief >= 5 },
  { id: 'streak_7', icon: '🔥', name: '7-Day Streak', desc: 'Use Nexus 7 days in a row.', test: s => s.bestStreak >= 7 },
  { id: 'night_owl', icon: '☾', name: 'Night Owl', desc: 'Chat between midnight and 4 AM.', test: s => s.nightOwl >= 1 },
  { id: 'early_bird', icon: '☼', name: 'Early Bird', desc: 'Chat between 5 and 7 AM.', test: s => s.earlyBird >= 1 },
  { id: 'lookout', icon: '🔭', name: 'Lookout', desc: 'Catch something with Watch mode.', test: s => s.watch >= 1 },
  { id: 'explainer', icon: '💡', name: 'Explain Like I\'m Five', desc: 'Use Explain this 5 times.', test: s => s.explain >= 5 },
  { id: 'round_table', icon: '◍', name: 'Round Table', desc: 'Start an agent huddle.', test: s => s.huddle >= 1 },
  { id: 'moderator', icon: '⚖', name: 'Moderator', desc: 'Run an agent debate.', test: s => s.debate >= 1 },
  { id: 'feature_master', icon: '✺', name: 'Feature Master', desc: 'Use 12 different @features.', test: s => Object.keys(s.features).length >= 12 },
  { id: 'supporter', icon: '♥', name: 'Supporter', desc: 'Redeem an aARgon3 / Mexel order.', test: s => s.redeem >= 1 }
];

const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const EMPTY = () => ({ points: 0, chats: 0, voice: 0, typed: 0, screen: 0, regenerate: 0, export: 0, calc: 0, mission: 0, routine_created: 0, routine_run: 0, brief: 0, wake: 0, watch: 0, explain: 0, huddle: 0, debate: 0, redeem: 0,
  nightOwl: 0, earlyBird: 0, agents: {}, features: {}, days: [], streak: 0, bestStreak: 0, unlocked: {}, since: Date.now() });

class Metrics {
  constructor({ dir, now = () => Date.now() }) { this.file = path.join(dir, 'metrics.json'); this.now = now; this.s = null; }
  load() {
    if (this.s) return this.s;
    try { this.s = { ...EMPTY(), ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { this.s = EMPTY(); }
    return this.s;
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.s)); } catch {} }

  // event: chat | screen | regenerate | export | calc | mission | routine_created | routine_run | brief | wake | redeem
  // data (chat): { agent, voice, features: [] }
  // Returns achievements unlocked by this event: [{ id, name, desc, icon }]
  record(event, data = {}) {
    const s = this.load();
    const now = this.now();
    const key = event === 'chat' ? 'chats' : event;
    if (event in POINTS && event !== 'feature' && event !== 'achievement') s[key] = (s[key] || 0) + 1;
    s.points += POINTS[event] || 0;
    if (event === 'chat') {
      if (data.agent) s.agents[data.agent] = (s.agents[data.agent] || 0) + 1;
      if (data.voice) { s.voice++; s.points += POINTS.voice; } else s.typed++;
      for (const f of data.features || []) { s.features[f] = (s.features[f] || 0) + 1; s.points += POINTS.feature; }
      const h = new Date(now).getHours();
      if (h < 4) s.nightOwl++;
      if (h >= 5 && h < 7) s.earlyBird++;
      this.markDay(now);
    }
    const fresh = [];
    for (const a of ACHIEVEMENTS) if (!s.unlocked[a.id] && a.test(s)) { s.unlocked[a.id] = now; s.points += POINTS.achievement; fresh.push({ id: a.id, name: a.name, desc: a.desc, icon: a.icon }); }
    // Points from new achievements can unlock the points achievements in the same go.
    for (const a of ACHIEVEMENTS) if (!s.unlocked[a.id] && a.test(s)) { s.unlocked[a.id] = now; fresh.push({ id: a.id, name: a.name, desc: a.desc, icon: a.icon }); }
    this.save();
    return fresh;
  }
  markDay(now) {
    const s = this.s, today = dayKey(now);
    if (s.days[s.days.length - 1] === today) return;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    s.streak = s.days[s.days.length - 1] === dayKey(y.getTime()) ? s.streak + 1 : 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.days = [...s.days, today].slice(-400);
  }
  summary() {
    const s = this.load();
    const today = dayKey(this.now()), y = new Date(this.now()); y.setDate(y.getDate() - 1);
    const streak = s.days.at(-1) === today || s.days.at(-1) === dayKey(y.getTime()) ? s.streak : 0;
    const fav = Object.entries(s.agents).sort((a, b) => b[1] - a[1])[0];
    const topFeatures = Object.entries(s.features).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ id, n }));
    return {
      points: s.points, chats: s.chats, voice: s.voice, typed: s.typed, screen: s.screen, regenerate: s.regenerate, export: s.export, calc: s.calc,
      missions: s.mission, routines: s.routine_created, briefs: s.brief, streak, bestStreak: s.bestStreak, daysActive: s.days.length, since: s.since,
      favorite: fav ? { agent: fav[0], n: fav[1] } : null, agents: s.agents, topFeatures,
      achievements: ACHIEVEMENTS.map(a => ({ id: a.id, icon: a.icon, name: a.name, desc: a.desc, unlocked: s.unlocked[a.id] || null }))
    };
  }
}

module.exports = { Metrics, ACHIEVEMENTS, POINTS };
