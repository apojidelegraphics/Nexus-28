// Daily challenge (v1.7): one small thing to try each day, the same for everyone that day. Finishing it earns
// bonus points and keeps a challenge streak. Progress is counted from the same events as Stats.
//   { id, text, event, n, feature? }   event: a metrics event; feature: a specific @feature
const LIST = [
  { id: 'chat5', icon: '💬', text: 'Send 5 messages', event: 'chats', n: 5 },
  { id: 'voice2', icon: '🎙', text: 'Ask Nexus something by voice twice', event: 'voice', n: 2 },
  { id: 'screen1', icon: '👁', text: 'Ask about your screen', event: 'screen', n: 1 },
  { id: 'feat3', icon: '@', text: 'Use 3 different @features', event: 'featureKinds', n: 3 },
  { id: 'cognition', icon: '🧠', text: 'Use @Cognition on a tricky question', event: 'feature', feature: 'Cognition', n: 1 },
  { id: 'synergy', icon: '💡', text: 'Brainstorm with @Synergy', event: 'feature', feature: 'Synergy', n: 1 },
  { id: 'studymode', icon: '📝', text: 'Take a @StudyMode quiz', event: 'feature', feature: 'StudyMode', n: 1 },
  { id: 'fortress', icon: '📊', text: 'Get a chart from @FortressLens', event: 'feature', feature: 'FortressLens', n: 1 },
  { id: 'huddle', icon: '◍', text: 'Start a @huddle', event: 'huddle', n: 1 },
  { id: 'debate', icon: '⚖', text: 'Run an agent @debate', event: 'debate', n: 1 },
  { id: 'review10', icon: '📚', text: 'Review 10 flashcards', event: 'study_review', n: 10 },
  { id: 'deck', icon: '🗂', text: 'Make or save a flashcard deck', event: 'study_cards', n: 1 },
  { id: 'calc3', icon: '∑', text: 'Do 3 quick calculations or conversions', event: 'calc', n: 3 },
  { id: 'explain', icon: '✎', text: 'Highlight text and use Explain this', event: 'explain', n: 1 },
  { id: 'regen', icon: '↻', text: 'Regenerate a reply with another agent', event: 'regenerate', n: 1 },
  { id: 'cite', icon: '❝', text: 'Cite a source with the Citation helper', event: 'cite', n: 1 },
  { id: 'homework', icon: '📐', text: 'Get hints from the Homework helper', event: 'homework', n: 1 },
  { id: 'routine', icon: '⟳', text: 'Create a routine', event: 'routine_created', n: 1 }
];
const BONUS = 25;
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function forDay(t = Date.now(), list = LIST) { return list[hash('nexus-' + dayKey(t)) % list.length]; }
// day: { counts: { event: n }, features: { id: n } }
function progress(ch, day = {}) {
  const c = day.counts || {}, f = day.features || {};
  const got = ch.event === 'feature' ? (f[ch.feature] || 0) : ch.event === 'featureKinds' ? Object.keys(f).length : (c[ch.event] || 0);
  return Math.min(ch.n, got);
}
module.exports = { LIST, BONUS, forDay, progress, dayKey };
