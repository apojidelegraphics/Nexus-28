// Memory you control (v2.7): short facts every agent knows about you, like "I'm in 11th grade" or "call me Luke".
// Nothing is remembered unless you say so: "remember that …" in any chat, a Remember card an agent offers, the
// clipboard orb, or Settings → Personal. You can see, edit, switch off or wipe all of it there. Kept on this Mac.
const fs = require('fs');
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const REMEMBER = /^\s*(?:hey\s+\w+[,\s]+)?(?:please\s+)?remember(?:\s+that)?[\s:,]+(.{3,400})$/i;

class Memory {
  constructor({ file, now = () => Date.now() }) { Object.assign(this, { file, now }); this.d = null; }
  load() { if (this.d) return this.d; let d = {}; try { d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {} this.d = { enabled: d.enabled !== false, items: Array.isArray(d.items) ? d.items : [] }; return this.d; }
  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.d, null, 1)); } catch {} }
  state() { const d = this.load(); return { enabled: d.enabled, items: d.items.slice() }; }
  setEnabled(on) { this.load().enabled = !!on; this.save(); return this.state(); }
  add(text, source = 'you') {
    const t = clip(text, 300).replace(/[.!]+$/, ''); if (t.length < 3) return null;
    const d = this.load();
    if (d.items.some(x => x.text.toLowerCase() === t.toLowerCase())) return null;
    const item = { id: 'm' + this.now().toString(36) + Math.random().toString(36).slice(2, 5), text: t, source: clip(source, 20), at: this.now() };
    d.items.unshift(item); d.items = d.items.slice(0, 150); this.save(); return item;
  }
  edit(id, text) { const it = this.load().items.find(x => x.id === id); if (!it) return null; const t = clip(text, 300); if (t) { it.text = t; it.at = this.now(); this.save(); } return it; }
  remove(id) { const d = this.load(); d.items = d.items.filter(x => x.id !== id); this.save(); return true; }
  clear() { this.load().items = []; this.save(); return true; }
  // "remember that I'm allergic to peanuts" → saved right away (returns the item, or null)
  fromMessage(text) { const m = String(text || '').match(REMEMBER); return m ? this.add(m[1], 'chat') : null; }
  prompt() {
    const d = this.load(); if (!d.enabled) return '';
    const items = d.items.slice(0, 40);
    return `\n\n[MEMORY — things the user asked every Nexus agent to remember. Use them naturally; never list them back unless asked]\n${items.map(i => '- ' + i.text).join('\n') || '(nothing yet)'}\nIf the user shares a lasting fact about themselves (not a one-off), you may offer to remember it with a fenced code block with the language tag nexus-memory containing JSON {"remember":["short fact in their words"]}. Never save it yourself.`;
  }
}
module.exports = { Memory, REMEMBER };
