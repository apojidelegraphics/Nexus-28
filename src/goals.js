// Weekly goals (3.12): a short list for this week. Every agent knows them (so "plan my week" uses them), you tick them
// off in ☰ → Weekly goals, and on Monday the unfinished ones can carry over. Kept on this computer (settings.weeklyGoals).
//   week(now) → '2026-W47'      state(saved, now) → { week, items, last }      add/toggle/remove/carry → new saved value
'use strict';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
function week(now = Date.now()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  const n = 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(n).padStart(2, '0')}`;
}
// the saved value is { week, items:[{id,text,done,at}], last:{ week, items } } — a new week moves this week's list to last
function state(saved, now = Date.now()) {
  const w = week(now), s = saved && typeof saved === 'object' ? saved : {};
  if (s.week === w) return { week: w, items: Array.isArray(s.items) ? s.items : [], last: s.last || null };
  const old = s.week && Array.isArray(s.items) && s.items.length ? { week: s.week, items: s.items } : (s.last || null);
  return { week: w, items: [], last: old };
}
const id = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function add(saved, text, now = Date.now()) {
  const s = state(saved, now), t = clip(text, 160).replace(/[.!]+$/, '');
  if (t.length < 2 || s.items.length >= 12 || s.items.some(i => i.text.toLowerCase() === t.toLowerCase())) return s;
  return { ...s, items: [...s.items, { id: id(), text: t, done: false, at: now }] };
}
const toggle = (saved, gid, now = Date.now()) => { const s = state(saved, now); return { ...s, items: s.items.map(i => i.id === gid ? { ...i, done: !i.done, doneAt: !i.done ? now : undefined } : i) }; };
const remove = (saved, gid, now = Date.now()) => { const s = state(saved, now); return { ...s, items: s.items.filter(i => i.id !== gid) }; };
// bring last week's unfinished goals into this week
function carry(saved, now = Date.now()) {
  const s = state(saved, now); let out = { ...s };
  for (const i of (s.last?.items || []).filter(x => !x.done)) out = add(out, i.text, now);
  return { ...out, last: s.last ? { ...s.last, carried: true } : null };
}
// "my goal this week is to finish the essay" / "add a weekly goal: run 3 times"
const SAY = /^\s*(?:(?:my|a)\s+(?:weekly\s+)?goals?\s+(?:for\s+)?this\s+week\s+(?:is|are)\s+(?:to\s+)?|add\s+(?:a\s+)?(?:weekly\s+)?goal[\s:,-]+(?:to\s+)?|this\s+week\s+i\s+want\s+to\s+)(.{2,160})$/i;
const fromMessage = text => { const m = String(text || '').match(SAY); return m ? m[1].split(/\s*(?:;|,? and also |\n)\s*/).map(x => clip(x, 160)).filter(x => x.length > 1) : null; };
function prompt(saved, now = Date.now()) {
  const s = state(saved, now); if (!s.items.length) return '';
  const left = s.items.filter(i => !i.done), done = s.items.filter(i => i.done);
  return `\n\n[WEEKLY GOALS the user set for this week (${s.items.length - left.length} of ${s.items.length} done). Use them when they ask to plan, prioritize or what to do next; don't bring them up otherwise]\n${left.map(i => '- [ ] ' + i.text).join('\n')}${done.length ? '\n' + done.map(i => '- [x] ' + i.text).join('\n') : ''}`;
}
module.exports = { week, state, add, toggle, remove, carry, fromMessage, prompt };
