// Routine schedules: when the next run is, how to say it, and turning "every weekday at 8, …" into a routine.
//   schedule: { type: 'daily' | 'weekdays' | 'weekly' | 'hourly' | 'once', time: 'HH:MM', days: [0-6] (Sun=0), at: ms }

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_RE = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function hm(time) {
  const m = String(time || '08:00').match(/^(\d{1,2}):(\d{2})$/);
  return m ? [Math.min(23, +m[1]), Math.min(59, +m[2])] : [8, 0];
}
const at = (d, [h, m]) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };

// Next run strictly after `from` (ms). Returns ms or null (a 'once' routine in the past).
function nextRun(schedule, from = Date.now()) {
  const s = schedule || {};
  const t = hm(s.time);
  if (s.type === 'once') return s.at && s.at > from ? s.at : null;
  if (s.type === 'hourly') {
    const x = new Date(from); x.setMinutes(t[1], 0, 0);
    if (x.getTime() <= from) x.setHours(x.getHours() + 1);
    return x.getTime();
  }
  const allowed = s.type === 'weekdays' ? [1, 2, 3, 4, 5] : s.type === 'weekly' ? (s.days?.length ? s.days : [1]) : [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 8; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i);
    const c = at(d, t);
    if (c.getTime() > from && allowed.includes(c.getDay())) return c.getTime();
  }
  return null;
}

function fmtTime(time) {
  const [h, m] = hm(time);
  return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
}
function describe(s = {}) {
  if (s.type === 'hourly') return s.time && hm(s.time)[1] ? `Every hour at :${String(hm(s.time)[1]).padStart(2, '0')}` : 'Every hour';
  if (s.type === 'once') return s.at ? `Once · ${new Date(s.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Once';
  if (s.type === 'weekdays') return `Weekdays at ${fmtTime(s.time)}`;
  if (s.type === 'weekly') {
    const days = (s.days?.length ? s.days : [1]).slice().sort();
    return `${days.length === 7 ? 'Every day' : days.map(d => DAY_NAMES[d].slice(0, 3)).join(', ')} at ${fmtTime(s.time)}`;
  }
  return `Every day at ${fmtTime(s.time)}`;
}

// "8", "8am", "8:30 pm", "08:00", "noon", "midnight" → "HH:MM"
function parseTime(str, { pmBelow = 0 } = {}) {
  const t = String(str || '').toLowerCase().trim().replace(/\./g, '');
  if (t === 'noon') return '12:00';
  if (t === 'midnight') return '00:00';
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1]; const min = +(m[2] || 0);
  if (h > 23 || min > 59) return null;
  const ap = m[3];
  if (ap?.startsWith('p') && h < 12) h += 12;
  if (ap?.startsWith('a') && h === 12) h = 0;
  if (!ap && h < pmBelow) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// "every weekday at 8, tell me what's due" / "every morning at 7:30 give me the weather" /
// "each Friday at 5pm recap my week" / "every hour, check the news" → { schedule, prompt } or null.
const PART_OF_DAY = { morning: '08:00', afternoon: '13:00', evening: '18:00', night: '21:00' };
function parseRoutine(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  let m = t.match(/^(?:hey nexus[, ]+)?(?:every|each)\s+hour\b[,:]?\s*(?:at\s+:?(\d{1,2})\b[,:]?\s*)?(.+)$/i);
  if (m) {
    const prompt = cleanPrompt(m[2]);
    return prompt ? { schedule: { type: 'hourly', time: `00:${String(Math.min(59, +(m[1] || 0))).padStart(2, '0')}` }, prompt } : null;
  }
  m = t.match(/^(?:hey nexus[, ]+)?(?:every|each)\s+(day|morning|afternoon|evening|night|weekday|weekdays|week ?day|weekend|weekends|(?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*(?:\s*(?:,|and|&)\s*)?)+)\s*(?:at\s+([0-9:apm. ]+?|noon|midnight))?\s*[,:-]?\s+(.+)$/i);
  if (!m) return null;
  const when = m[1].toLowerCase();
  let time = m[2] ? parseTime(m[2], { pmBelow: /evening|night/.test(when) ? 12 : /afternoon/.test(when) ? 7 : 0 }) : PART_OF_DAY[when] || null;
  if (m[2] && !time) return null;
  if (!time) return null; // need a time (or morning/evening…) so plain "every day I …" sentences aren't routines
  let schedule;
  if (/^(day|morning|afternoon|evening|night)$/.test(when)) schedule = { type: 'daily', time };
  else if (/^week ?days?$/.test(when)) schedule = { type: 'weekdays', time };
  else if (/^weekends?$/.test(when)) schedule = { type: 'weekly', time, days: [0, 6] };
  else {
    const days = [...new Set((when.match(/(sun|mon|tue|wed|thu|fri|sat)/g) || []).map(d => DAY_RE[d]))];
    if (!days.length) return null;
    schedule = { type: 'weekly', time, days };
  }
  const prompt = cleanPrompt(m[3]);
  return prompt ? { schedule, prompt } : null;
}
function cleanPrompt(p) {
  const s = String(p || '').trim().replace(/^(?:please\s+|can you\s+|could you\s+|nexus[, ]+)/i, '').replace(/^(?:remind me to)\s+/i, 'Remind me to ');
  return s.length >= 4 ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
const shortName = prompt => { const s = prompt.replace(/[.?!]+$/, ''); return s.length > 40 ? s.slice(0, 38).replace(/\s+\S*$/, '') + '…' : s; };

module.exports = { nextRun, describe, parseRoutine, parseTime, fmtTime, shortName, DAY_NAMES };
