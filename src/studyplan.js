// Calendar-aware study (v2.1): give a deck a test date and Nexus makes a cram plan (how many reviews a day until the
// test, all of it on the last day), then finds free 20-minute study slots between your calendar events today and
// reminds you then. Without calendar access it uses default times (4 pm and 7 pm).
const DAY = 864e5;
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// events: [{ start, end, allDay }] in seconds (EventKit). Returns up to `max` slot start times (ms) today, after now.
function freeSlots(events = [], { now = Date.now(), from = 8, to = 21, len = 20, gap = 10, max = 3, spread = 90 } = {}) {
  const d0 = dayStart(now), lo = Math.max(now + 5 * 60e3, d0 + from * 3600e3), hi = d0 + to * 3600e3;
  const busy = events.filter(e => !e.allDay).map(e => [e.start * 1000 - gap * 60e3, e.end * 1000 + gap * 60e3]).filter(([s, e]) => e > lo && s < hi).sort((a, b) => a[0] - b[0]);
  const out = [];
  let t = Math.ceil(lo / (5 * 60e3)) * 5 * 60e3;
  while (t + len * 60e3 <= hi && out.length < max) {
    const clash = busy.find(([s, e]) => t < e && t + len * 60e3 > s);
    if (clash) { t = Math.ceil(clash[1] / (5 * 60e3)) * 5 * 60e3; continue; }
    out.push(t); t += Math.max(len, spread) * 60e3;   // keep slots apart
  }
  return out;
}
// decks: from study.decks() (with testDate). cardsOf(deckId) → cards. Returns per-deck plan for decks with a future test.
function cramPlans(decks, cardsOf, { now = Date.now() } = {}) {
  const today = dayStart(now);
  return decks.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.testDate || '')).map(d => {
    const test = dayStart(new Date(d.testDate + 'T12:00:00').getTime());
    const daysLeft = Math.round((test - today) / DAY);
    const cards = cardsOf(d.id);
    const shaky = cards.filter(c => (c.interval || 0) < 21).length;   // not mastered yet
    // Each shaky card wants ~3 more good reviews before the test; spread them over the days left (test day = cram).
    const need = shaky * 3 + Math.round((cards.length - shaky) * 0.5);
    const perDay = daysLeft > 0 ? Math.min(cards.length * 2, Math.ceil(need / daysLeft)) : cards.length;
    const phase = daysLeft < 0 ? 'past' : daysLeft === 0 ? 'test day' : daysLeft === 1 ? 'cram' : daysLeft <= 3 ? 'final push' : 'steady';
    return { deckId: d.id, name: d.name, color: d.color, testDate: d.testDate, daysLeft, total: cards.length, mastered: cards.length - shaky, perDay, phase,
      tip: phase === 'past' ? 'The test date has passed. Clear it or set a new one.' : phase === 'test day' ? 'Test day! One quick cram of every card, then trust yourself.'
        : phase === 'cram' ? 'Tomorrow is the test: cram every card today, then sleep.' : phase === 'final push' ? `Final push: ${perDay} reviews a day, focus on the cards you miss.` : `${perDay} reviews a day keeps you on track.` };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
}
module.exports = { freeSlots, cramPlans, dayStart };
