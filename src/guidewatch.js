// Watch & guide me (3.12): you say what you want to do, Nexus looks at your screen every few seconds and tells you the
// next click, one step at a time, until it's done. Nothing is kept: each look is a screenshot sent with that one question.
//   prompt(goal, steps, note) → the instruction for one look      parse(text) → { say, where, done, wait }
'use strict';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const SYSTEM = `You are Nexus "Watch & guide me". The user is trying to do something on their computer and you can see their screen (the attached screenshot, taken just now).
Tell them the ONE next thing to do: what to click, type or press, and where it is on the screen ("the blue Share button, top right"). Plain words, one or two short sentences, no markdown.
If the last step isn't done yet (the screen hasn't changed), say so kindly and repeat it more clearly. If you can't see what you need, tell them how to get there (open the app, scroll, etc.).
Never ask for or read out passwords, card numbers or codes; if a step needs one, tell them to type it themselves.
Reply with ONLY this JSON: {"say":"the next step","where":"short place on screen, or empty","done":false,"wait":false}
Set "done": true when the goal is finished (say what they did). Set "wait": true if something is loading and they should just wait.`;
function prompt(goal, steps = [], note = '') {
  const hist = steps.slice(-6).map((s, i) => `${i + 1}. ${s.say}`).join('\n');
  return `GOAL: ${clip(goal, 300)}\n${hist ? `STEPS YOU ALREADY GAVE (oldest first):\n${hist}\n` : 'This is the first look.\n'}${note ? `THE USER SAYS: ${clip(note, 200)}\n` : ''}What should they do next?`;
}
function parse(text) {
  const t = String(text || '').trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { const j = JSON.parse(m[0]); if (j && typeof j.say === 'string' && j.say.trim()) return { say: clip(j.say, 400), where: clip(j.where || '', 120), done: j.done === true, wait: j.wait === true }; } catch {} }
  const plain = clip(t.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`]/g, ''), 400);
  return plain ? { say: plain, where: '', done: /\b(you'?re all set|that'?s it|all done|you did it)\b/i.test(plain), wait: false } : null;
}
module.exports = { SYSTEM, prompt, parse, MAX_STEPS: 30, EVERY_MS: 6000 };
