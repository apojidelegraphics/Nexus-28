// Mission templates (v1.6): ready-made goals with blanks to fill. Your own templates live in settings.missionTemplates.
//   template: { id, icon, name, desc, goal: 'Text with {blank} fields', fields: [{ key, label, placeholder }], minutes }
const BUILTIN = [
  { id: 'compare', icon: '⚖', name: 'Research & compare', desc: 'Compare options and pick a winner', minutes: 20,
    goal: 'Research the best {things} for {who} with a budget of {budget}. Compare the top 4–5 options in a table (price, pros, cons, where to buy) and recommend one.',
    fields: [{ key: 'things', label: 'What', placeholder: 'laptops for coding' }, { key: 'who', label: 'For', placeholder: 'a high school student' }, { key: 'budget', label: 'Budget', placeholder: '$800' }] },
  { id: 'trip', icon: '✈', name: 'Trip planner', desc: 'Day-by-day plan with costs', minutes: 30,
    goal: 'Plan a {days}-day trip to {place} for {who}. Make a day-by-day itinerary with must-sees, food spots, getting around, a rough budget in {currency}, and booking tips.',
    fields: [{ key: 'place', label: 'Where', placeholder: 'Tokyo' }, { key: 'days', label: 'Days', placeholder: '5' }, { key: 'who', label: 'Who', placeholder: 'two friends who love food' }, { key: 'currency', label: 'Currency', placeholder: 'USD' }] },
  { id: 'study', icon: '📚', name: 'Study guide', desc: 'Guide + flashcards for a test', minutes: 20,
    goal: 'Build a study guide for {subject} covering {topics}. Include key concepts, worked examples, common mistakes, and finish with 10–15 flashcards in a ```nexus-flashcards block so I can save them to a deck.',
    fields: [{ key: 'subject', label: 'Subject', placeholder: 'AP Biology unit 3' }, { key: 'topics', label: 'Topics', placeholder: 'cell respiration, photosynthesis' }] },
  { id: 'news', icon: '📰', name: 'Topic deep dive', desc: "What's happening and why it matters", minutes: 15,
    goal: 'Find what happened with {topic} in the last {period}. Summarize the key developments with dates and sources, explain why it matters, and list what to watch next.',
    fields: [{ key: 'topic', label: 'Topic', placeholder: 'Apple Vision Pro' }, { key: 'period', label: 'Period', placeholder: 'month' }] },
  { id: 'kickoff', icon: '🚀', name: 'Project kickoff', desc: 'Plan, tools, and first steps', minutes: 20,
    goal: 'Help me start {project}. Research how others do it, then write a plan: goal, milestones for {timeframe}, tools/resources (free first), risks, and a checklist for this week.',
    fields: [{ key: 'project', label: 'Project', placeholder: 'a YouTube channel about game dev' }, { key: 'timeframe', label: 'Timeframe', placeholder: 'the next 2 months' }] },
  { id: 'skill', icon: '🎯', name: 'Learn a skill', desc: 'A 30-day learning path', minutes: 20,
    goal: 'Make a {weeks}-week plan to learn {skill} from {level}, with {hours} hours a week. Pick the best free resources, set weekly goals and a small project for each week.',
    fields: [{ key: 'skill', label: 'Skill', placeholder: 'Swift and SwiftUI' }, { key: 'level', label: 'Starting from', placeholder: 'zero' }, { key: 'weeks', label: 'Weeks', placeholder: '4' }, { key: 'hours', label: 'Hours/week', placeholder: '5' }] },
  { id: 'gift', icon: '🎁', name: 'Gift finder', desc: 'Ideas that fit the person', minutes: 10,
    goal: 'Find 8 gift ideas for {who} who likes {likes}, under {budget}. For each: what it is, why it fits, price, and where to buy. Mark my top 3.',
    fields: [{ key: 'who', label: 'For', placeholder: 'my mom' }, { key: 'likes', label: 'Likes', placeholder: 'gardening and mystery novels' }, { key: 'budget', label: 'Budget', placeholder: '$50' }] },
  { id: 'inbox', icon: '✉', name: 'Inbox catch-up', desc: 'Needs Gmail connected', minutes: 10,
    goal: 'Go through my unread email from the last {period}. Group it into needs-a-reply, FYI and can-ignore, draft short replies for the important ones (do not send), and list deadlines.',
    fields: [{ key: 'period', label: 'From the last', placeholder: '3 days' }] }
];
const fieldsOf = goal => [...new Set([...String(goal).matchAll(/\{([a-z][\w]{0,20})\}/gi)].map(m => m[1]))];
function fill(t, values = {}) {
  const missing = (t.fields || fieldsOf(t.goal).map(key => ({ key }))).filter(f => !String(values[f.key] || '').trim()).map(f => f.label || f.key);
  const goal = String(t.goal).replace(/\{([a-z][\w]{0,20})\}/gi, (m, k) => String(values[k] || '').trim() || m);
  return { goal, missing };
}
function cleanTemplates(list) {
  return (Array.isArray(list) ? list : []).filter(t => t && String(t.goal || '').trim().length >= 10).slice(0, 30).map(t => {
    const goal = String(t.goal).trim().slice(0, 1500);
    return { id: /^my-[a-z0-9]{1,12}$/.test(t.id) ? t.id : 'my-' + Math.random().toString(36).slice(2, 8), icon: String(t.icon || '★').slice(0, 2), name: String(t.name || 'My template').trim().slice(0, 32),
      desc: String(t.desc || '').trim().slice(0, 60), goal, minutes: [5, 10, 15, 20, 30, 60, 120].includes(+t.minutes) ? +t.minutes : 20,
      fields: fieldsOf(goal).map(key => ({ key, label: key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), placeholder: '' })), custom: true };
  });
}
module.exports = { BUILTIN, fill, fieldsOf, cleanTemplates };
