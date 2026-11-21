// Reminders from chat (3.12): "remind me about this tomorrow at 9" or "remind me to call Sam in 2 hours". Worked out on
// this computer, no AI needed. When it's time, the chat comes back to the top with a notification (and your phone).
//   parse(text, now) → { at (ms), note, phrase } | null
//   when(phrase, now) → ms | null   (just the time part)
'use strict';
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45, half: 0.5 };
const n = s => (NUM[String(s).toLowerCase()] ?? parseFloat(s));

// "9", "9am", "9:30 pm", "21:00", "noon", "midnight" → [h, m] or null
function clock(s) {
  s = String(s || '').trim().toLowerCase();
  if (s === 'noon') return [12, 0]; if (s === 'midnight') return [0, 0];
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/); if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0), ap = (m[3] || '').replace(/\./g, '');
  if (h > 23 || mi > 59) return null;
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 6) h += 12;            // "at 3" means the afternoon
  return [h, mi];
}
const at = (base, [h, m]) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime(); };

function when(phrase, now = Date.now()) {
  let p = String(phrase || '').toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ').trim();
  if (!p) return null;
  let m;
  if ((m = p.match(/^in (a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|half an?|\d+(?:\.\d+)?) ?(min(?:ute)?s?|h(?:ou)?rs?|hours?|days?|weeks?)$/))) {
    const v = /^half/.test(m[1]) ? 0.5 : n(m[1]), u = m[2];
    const ms = /^min/.test(u) ? 60e3 : /^h/.test(u) ? 3600e3 : /^d/.test(u) ? 864e5 : 7 * 864e5;
    return Number.isFinite(v) && v > 0 ? Math.round(now + v * ms) : null;
  }
  if ((m = p.match(/^in an? hour$/))) return now + 3600e3;
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const timePart = s => { const t = s.match(/^(?:at |@ ?)?(.+)$/); return t ? clock(t[1]) : null; };
  if (p === 'tonight') return at(now, [20, 0]) > now ? at(now, [20, 0]) : null;
  if (p === 'this evening') return at(now, [18, 0]) > now ? at(now, [18, 0]) : null;
  if (p === 'this afternoon') return at(now, [15, 0]) > now ? at(now, [15, 0]) : null;
  if (p === 'later' || p === 'later today') return now + 3 * 3600e3;
  if ((m = p.match(/^tomorrow(?: (morning|afternoon|evening|night))?(?: (?:at )?(.+))?$/))) {
    const t = m[2] ? clock(m[2]) : ({ morning: [9, 0], afternoon: [14, 0], evening: [18, 0], night: [20, 0] }[m[1]] || [9, 0]);
    return t ? at(d0.getTime() + 864e5, t) : null;
  }
  if ((m = p.match(/^tonight at (.+)$/))) { const t = clock(m[1]); return t ? at(now, t[0] < 12 ? [t[0] + 12, t[1]] : t) : null; }
  if ((m = p.match(/^(?:on |next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?: (?:at )?(.+))?$/))) {
    const want = DAYS.indexOf(m[1]); let add = (want - d0.getDay() + 7) % 7; if (add === 0 || /^next /.test(p)) add = add || 7;
    const t = m[2] ? clock(m[2]) : [9, 0]; return t ? at(d0.getTime() + add * 864e5, t) : null;
  }
  if (p === 'next week') return at(d0.getTime() + ((8 - d0.getDay()) % 7 || 7) * 864e5, [9, 0]);
  const t = timePart(p); if (t) { const x = at(now, t); return x > now ? x : x + 864e5; }   // "at 5pm" (tomorrow if it's passed)
  return null;
}

const LEAD = /^(?:hey nexus[, ]+|nexus[, ]+|please |can you |could you )*remind me\b/i;
function parse(text, now = Date.now()) {
  const s = String(text || '').trim();
  if (!LEAD.test(s) || s.length > 300) return null;
  let rest = s.replace(LEAD, '').trim().replace(/^[,:]\s*/, '');
  let note = '';
  // "about this (chat)", "about it", "of this"
  rest = rest.replace(/^(?:about|of) (?:this(?: chat)?|it|that)\b\s*/i, '');
  // "to call Sam in 2 hours" / "that the essay is due tomorrow at 9"
  const tm = rest.match(/^(?:to|that|about) (.+?) ((?:in|at|on|tomorrow|tonight|this|next|later)\b.*|(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b.*)$/i);
  if (tm) { note = tm[1].trim(); rest = tm[2].trim(); }
  // "in 2 hours to call Sam"
  else { const am = rest.match(/^(.+?) (?:to|that|about) (.+)$/i); if (am && when(am[1], now)) { rest = am[1]; note = am[2].trim(); } }
  const t = when(rest, now);
  if (!t || t <= now || t - now > 366 * 864e5) return null;
  return { at: t, note: note.replace(/[.!?]+$/, ''), phrase: rest };
}
const fmt = (ms, now = Date.now()) => {
  const d = new Date(ms), today = new Date(now); today.setHours(0, 0, 0, 0);
  const day = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 864e5);
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (ms - now < 3600e3 * 2 && day === 0) { const mins = Math.round((ms - now) / 60e3); return mins < 60 ? `in ${mins} minute${mins === 1 ? '' : 's'}` : `at ${t}`; }
  return day === 0 ? `today at ${t}` : day === 1 ? `tomorrow at ${t}` : day < 7 ? `${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${t}` : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${t}`;
};
module.exports = { parse, when, clock, fmt };
