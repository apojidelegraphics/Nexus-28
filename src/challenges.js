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
// 4.1.0 daily quests: three small things a day on top of the challenge, each pays Cirkts, plus a bonus for all three.
// The same three for everyone that day (picked from QUESTS by the date), one easy, one medium, one bigger.
const QUESTS = [
  { id: 'q_chat3', icon: '💬', text: 'Send 3 messages', event: 'chats', n: 3, tier: 0 },
  { id: 'q_voice1', icon: '🎙', text: 'Ask something by voice', event: 'voice', n: 1, tier: 0 },
  { id: 'q_calc1', icon: '∑', text: 'Do a quick calculation or conversion', event: 'calc', n: 1, tier: 0 },
  { id: 'q_feat1', icon: '@', text: 'Use any @feature', event: 'featureKinds', n: 1, tier: 0 },
  { id: 'q_review5', icon: '📚', text: 'Review 5 flashcards', event: 'study_review', n: 5, tier: 0 },
  { id: 'q_chat10', icon: '💬', text: 'Send 10 messages', event: 'chats', n: 10, tier: 1 },
  { id: 'q_screen', icon: '👁', text: 'Ask about your screen', event: 'screen', n: 1, tier: 1 },
  { id: 'q_regen', icon: '↻', text: 'Try another agent on a reply', event: 'regenerate', n: 1, tier: 1 },
  { id: 'q_explain', icon: '✎', text: 'Highlight something and use Explain this', event: 'explain', n: 1, tier: 1 },
  { id: 'q_export', icon: '⤓', text: 'Export or share a chat', event: 'export', n: 1, tier: 1 },
  { id: 'q_feat3', icon: '@', text: 'Use 3 different @features', event: 'featureKinds', n: 3, tier: 1 },
  { id: 'q_focus', icon: '◔', text: 'Finish a Focus session', event: 'focus', n: 1, tier: 2 },
  { id: 'q_huddle', icon: '◍', text: 'Start a @huddle', event: 'huddle', n: 1, tier: 2 },
  { id: 'q_debate', icon: '⚖', text: 'Run an agent @debate', event: 'debate', n: 1, tier: 2 },
  { id: 'q_review20', icon: '📚', text: 'Review 20 flashcards', event: 'study_review', n: 20, tier: 2 },
  { id: 'q_deck', icon: '🗂', text: 'Make a flashcard deck', event: 'study_cards', n: 1, tier: 2 },
  { id: 'q_write', icon: '✍', text: 'Write something in Write', event: 'write', n: 1, tier: 2 },
  { id: 'q_cite', icon: '❝', text: 'Cite a source', event: 'cite', n: 1, tier: 2 }
];
const QUEST_PAY = [15, 20, 30], QUEST_ALL = 25;
function questsForDay(t = Date.now(), list = QUESTS) {
  const k = dayKey(t), h = hash('quests-' + k);
  return [0, 1, 2].map(tier => { const pool = list.filter(q => q.tier === tier); return { ...pool[(h >>> (tier * 5)) % pool.length], reward: QUEST_PAY[tier] }; });
}
module.exports = { LIST, BONUS, forDay, progress, dayKey, QUESTS, QUEST_PAY, QUEST_ALL, questsForDay };
