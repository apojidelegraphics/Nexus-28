// Study (v1.6): flashcard decks with spaced repetition (SM-2, like Anki), kept on this Mac in study.json.
// Cards come from @Magyk flashcards, missed @StudyMode quiz questions, or a deck an agent makes from a topic.
//   grade: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
const fs = require('fs');
const path = require('path');

const DAY = 86400e3;
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const COLORS = ['#3dffa0', '#5ce1ff', '#ffb547', '#ff8fb8', '#b18cff', '#9bd65c', '#ffd36b'];

// SM-2 step. Returns the updated scheduling fields.
function schedule(card, grade, now = Date.now()) {
  const c = { ease: 2.5, interval: 0, reps: 0, lapses: 0, ...card };
  const q = [1, 3, 4, 5][Math.max(0, Math.min(3, grade))];   // map to SM-2 quality
  if (grade === 0) {
    c.reps = 0; c.lapses += 1; c.interval = 0;
    c.due = now + 10 * 60e3;                                 // see it again in 10 minutes
  } else {
    c.reps += 1;
    if (c.reps === 1) c.interval = grade === 3 ? 4 : grade === 1 ? 1 : 1;
    else if (c.reps === 2) c.interval = grade === 3 ? 7 : grade === 1 ? 3 : 6;
    else c.interval = Math.round(c.interval * (grade === 1 ? 1.2 : grade === 3 ? c.ease * 1.3 : c.ease));
    c.interval = Math.max(1, Math.min(3650, c.interval));
    c.due = startOfDay(now) + c.interval * DAY + 4 * 3600e3;    // due 4 AM that day
  }
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  c.last = now;
  return c;
}
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
const label = days => days < 1 ? '10 min' : days < 30 ? `${Math.round(days)} d` : days < 365 ? `${Math.round(days / 30)} mo` : `${(days / 365).toFixed(1)} y`;

class Study {
  constructor({ dir, now = () => Date.now() }) { this.file = path.join(dir, 'study.json'); this.now = now; this.d = null; }
  load() {
    if (this.d) return this.d;
    try { this.d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.d = null; }
    if (!this.d || !Array.isArray(this.d.decks)) this.d = { decks: [], cards: [], log: [] };
    this.d.log = this.d.log || [];
    return this.d;
  }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.d)); fs.renameSync(this.file + '.tmp', this.file); }

  decks() {
    const d = this.load(), now = this.now();
    return d.decks.map(k => {
      const cards = d.cards.filter(c => c.deckId === k.id);
      return { ...k, total: cards.length, due: cards.filter(c => (c.due || 0) <= now).length, fresh: cards.filter(c => !c.reps && !c.lapses).length,
        mastered: cards.filter(c => (c.interval || 0) >= 21).length };
    }).sort((a, b) => b.due - a.due || (b.updated || 0) - (a.updated || 0));
  }
  deck(id) { return this.load().decks.find(k => k.id === id) || null; }
  cards(deckId) { return this.load().cards.filter(c => c.deckId === deckId); }
  dueCount() { const now = this.now(); return this.load().cards.filter(c => (c.due || 0) <= now).length; }
  dueTomorrow() { const end = startOfDay(this.now()) + 2 * DAY; return this.load().cards.filter(c => (c.due || 0) < end).length; }

  createDeck({ name, source = null }) {
    const d = this.load();
    const n = clean(name, 60) || 'New deck';
    const k = { id: newId('k'), name: n, color: COLORS[d.decks.length % COLORS.length], created: this.now(), updated: this.now(), ...(source ? { source } : {}) };
    d.decks.push(k); this.save(); return k;
  }
  renameDeck(id, name) { const k = this.deck(id); if (k && clean(name, 60)) { k.name = clean(name, 60); this.save(); } return k; }
  removeDeck(id) { const d = this.load(); d.decks = d.decks.filter(k => k.id !== id); d.cards = d.cards.filter(c => c.deckId !== id); this.save(); }

  // Add cards (dedupes by front text). deck: an id, or { name } to find-or-create by name.
  addCards(deck, cards, { source } = {}) {
    const d = this.load();
    let k = typeof deck === 'string' ? this.deck(deck) : d.decks.find(x => x.name.toLowerCase() === clean(deck?.name, 60).toLowerCase());
    if (!k) k = this.createDeck({ name: deck?.name || 'New deck', source });
    const have = new Set(d.cards.filter(c => c.deckId === k.id).map(c => c.front.toLowerCase()));
    let added = 0;
    for (const raw of (cards || []).slice(0, 200)) {
      const front = clean(raw.front ?? raw.q, 400), back = clean(raw.back ?? raw.a, 800);
      if (!front || !back || have.has(front.toLowerCase())) continue;
      have.add(front.toLowerCase());
      d.cards.push({ id: newId('c'), deckId: k.id, front, back, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: this.now(), created: this.now() });
      added++;
    }
    k.updated = this.now(); this.save();
    return { deck: k, added, skipped: (cards || []).length - added };
  }
  editCard(id, { front, back }) {
    const c = this.load().cards.find(x => x.id === id); if (!c) return null;
    if (clean(front, 400)) c.front = clean(front, 400); if (clean(back, 800)) c.back = clean(back, 800);
    this.save(); return c;
  }
  removeCard(id) { const d = this.load(); d.cards = d.cards.filter(c => c.id !== id); this.save(); }

  // Next cards to review: due first (oldest due first), new ones mixed in up to `newLimit`.
  queue(deckId, { limit = 30, newLimit = 15 } = {}) {
    const now = this.now();
    const pool = this.load().cards.filter(c => (!deckId || c.deckId === deckId) && (c.due || 0) <= now);
    const review = pool.filter(c => c.reps || c.lapses).sort((a, b) => a.due - b.due);
    const fresh = pool.filter(c => !c.reps && !c.lapses).slice(0, newLimit);
    const out = [];
    while (out.length < limit && (review.length || fresh.length)) out.push(fresh.length && (out.length % 4 === 3 || !review.length) ? fresh.shift() : review.shift());
    return out.map(c => ({ ...c, preview: this.preview(c) }));
  }
  // What each button would do (shown on the buttons).
  preview(c) { const now = this.now(); return [0, 1, 2, 3].map(g => { const n = schedule(c, g, now); return g === 0 ? '10 min' : label(n.interval); }); }

  review(cardId, grade) {
    const d = this.load();
    const i = d.cards.findIndex(c => c.id === cardId);
    if (i < 0) throw new Error('Card not found.');
    const g = Math.max(0, Math.min(3, Math.round(+grade)));
    d.cards[i] = { ...d.cards[i], ...schedule(d.cards[i], g, this.now()) };
    d.log.push({ t: this.now(), c: cardId, g });
    if (d.log.length > 5000) d.log = d.log.slice(-5000);
    const k = this.deck(d.cards[i].deckId); if (k) k.updated = this.now();
    this.save();
    return d.cards[i];
  }
  stats() {
    const d = this.load(), today = startOfDay(this.now());
    const todays = d.log.filter(l => l.t >= today);
    const days = new Set(d.log.map(l => startOfDay(l.t)));
    let streak = 0; for (let t = today; days.has(t) || (t === today && streak === 0 && days.has(t - DAY)); t -= DAY) { if (days.has(t)) streak++; else if (t !== today) break; }
    return { reviewedToday: todays.length, correctToday: todays.filter(l => l.g >= 2).length, totalReviews: d.log.length, cards: d.cards.length, decks: d.decks.length, due: this.dueCount(), streak };
  }

  // Practice quiz from a deck (local, no AI): each card's back plus 3 other backs as choices.
  practice(deckId, n = 8) {
    const cards = this.cards(deckId);
    if (cards.length < 4) throw new Error('A practice quiz needs at least 4 cards in the deck.');
    const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
    return shuffle(cards).slice(0, n).map(c => {
      const wrong = shuffle(cards.filter(x => x.id !== c.id && x.back !== c.back)).slice(0, 3).map(x => x.back);
      const choices = shuffle([c.back, ...wrong]);
      return { cardId: c.id, q: c.front, choices, answer: choices.indexOf(c.back) };
    });
  }

  // Text for the Morning Brief / Evening Wrap-up.
  summaryLine() { const n = this.dueCount(), t = this.dueTomorrow(); return n ? `${n} flashcard${n === 1 ? '' : 's'} due now` : t ? `${t} flashcard${t === 1 ? '' : 's'} due by tomorrow` : ''; }
}

// Turn a model reply into cards: a ```nexus-flashcards block, or "Q: … A: …" / "front — back" lines.
function cardsFromText(text) {
  const t = String(text || '');
  const block = t.match(/```nexus-flashcards\s*([\s\S]*?)```/);
  const src = block ? block[1] : (t.match(/\{[\s\S]*"cards"[\s\S]*\}/) || [''])[0];
  if (src) {
    for (const s of [src, src.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')]) {
      try { const j = JSON.parse(s); const cards = (j.cards || j).filter?.(c => c && c.front && c.back); if (cards?.length) return { title: j.title || '', cards }; } catch {}
    }
  }
  const cards = [];
  const lines = t.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let m = lines[i].match(/^\s*(?:\d+[.)]\s*)?(?:\*\*)?Q(?:uestion)?:?(?:\*\*)?\s*(.+)$/i);
    if (m && lines[i + 1]) { const a = lines[i + 1].match(/^\s*(?:\*\*)?A(?:nswer)?:?(?:\*\*)?\s*(.+)$/i); if (a) { cards.push({ front: m[1], back: a[1] }); i++; continue; } }
    m = lines[i].match(/^\s*(?:[-*•]|\d+[.)])\s*(?:\*\*)?(.{2,120}?)(?:\*\*)?\s*(?:—|–|:|\s-)\s+(.{2,})$/);
    if (m) cards.push({ front: m[1], back: m[2] });
  }
  return { title: '', cards };
}

module.exports = { Study, schedule, cardsFromText, label, DAY };
