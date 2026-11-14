// Write mode (v2.1): documents on this Mac (<userData>/docs.json) with an agent beside them. The agent replies with
// edits as JSON ({ find, replace, why }); the editor shows each one so you can accept or reject it, or with text to
// add at the end ("continue"). Nothing changes until you accept.
const fs = require('fs');
const path = require('path');
const MAX_DOCS = 200, MAX_CHARS = 60000;
const newId = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

const MODES = {
  improve: 'Improve the writing: fix grammar and spelling, make unclear sentences clearer, and tighten wordy parts. Keep the author\'s voice.',
  shorter: 'Make it noticeably shorter without losing the important points.',
  formal: 'Make the tone more formal and polished.',
  casual: 'Make the tone friendlier and more casual.',
  grammar: 'Only fix grammar, spelling and punctuation. Change nothing else.',
  continue: 'Continue writing from where the document ends, in the same style. About one or two paragraphs.'
};
const PROMPT = mode => mode === 'continue'
  ? `\n\n[WRITE MODE] Reply with ONLY a JSON object, no code fence: {"append":"text to add after the document"}`
  : `\n\n[WRITE MODE] You suggest edits to the user's document. Reply with ONLY a JSON object, no code fence:
{"edits":[{"find":"exact text copied from the document (a phrase or sentence, unique enough to find)","replace":"the new text","why":"short reason"}],"note":"one line overall comment"}
Rules: "find" must match the document EXACTLY (same characters and punctuation). Keep each edit small (one sentence or phrase). At most 12 edits. If nothing needs changing, return {"edits":[],"note":"…"}.`;

function parseSuggestions(text, doc) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  let j = null;
  if (m) for (const x of [m[0], m[0].replace(/,\s*([}\]])/g, '$1')]) { try { j = JSON.parse(x); break; } catch {} }
  if (!j) return { edits: [], note: String(text || '').slice(0, 300), append: '' };
  if (typeof j.append === 'string') return { edits: [], note: '', append: j.append.slice(0, 8000) };
  const seen = new Set();
  const edits = (Array.isArray(j.edits) ? j.edits : []).map(e => ({ find: String(e?.find ?? ''), replace: String(e?.replace ?? ''), why: String(e?.why ?? '').slice(0, 200) }))
    .filter(e => e.find && e.find !== e.replace && doc.includes(e.find) && !seen.has(e.find) && seen.add(e.find)).slice(0, 12);
  return { edits, note: String(j.note || '').slice(0, 300), append: '' };
}

class Docs {
  constructor(dir) { this.file = path.join(dir, 'docs.json'); this.d = null; }
  load() { if (!this.d) { try { this.d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.d = { list: [] }; } } return this.d; }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.d)); fs.renameSync(this.file + '.tmp', this.file); }
  list() { return this.load().list.slice().sort((a, b) => b.updated - a.updated).map(d => ({ id: d.id, title: d.title, updated: d.updated, words: (d.text.match(/\S+/g) || []).length })); }
  get(id) { return this.load().list.find(d => d.id === id) || null; }
  put({ id, title, text }) {
    const d = this.load();
    let doc = id && this.get(id);
    if (!doc) { doc = { id: newId(), created: Date.now() }; d.list.push(doc); if (d.list.length > MAX_DOCS) d.list = d.list.sort((a, b) => b.updated - a.updated).slice(0, MAX_DOCS); }
    doc.text = String(text ?? doc.text ?? '').slice(0, MAX_CHARS);
    doc.title = String(title || '').trim().slice(0, 80) || (doc.text.split('\n').find(l => l.trim()) || 'Untitled').replace(/^#+\s*/, '').slice(0, 60);
    doc.updated = Date.now();
    this.save(); return doc;
  }
  remove(id) { const d = this.load(); d.list = d.list.filter(x => x.id !== id); this.save(); }
}
module.exports = { Docs, MODES, PROMPT, parseSuggestions, MAX_CHARS };
