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
  continue: 'Continue writing from where the document ends, in the same style. About one or two paragraphs.',
  // 4.0
  longer: 'Make it fuller: add detail, examples and explanation where it feels thin, without padding or repeating itself.',
  simpler: 'Make it easier to read: shorter sentences and everyday words, for about a 7th-grade reader. Keep every fact.',
  persuasive: 'Make it more persuasive: a stronger opening, clearer claims, and evidence or reasons where they are missing.',
  flow: 'Improve the flow: better transitions between sentences and paragraphs, and vary sentence length. Keep the meaning.',
  summary: 'Write a short summary of the document (3 to 5 sentences).',
  outline: 'Write an outline of the document as a nested bulleted list (headings and their main points).',
  titles: 'Suggest 6 good titles for the document, one per line, different styles (plain, catchy, question, etc.).',
  feedback: 'Give honest feedback like a good teacher or editor: what works, the 3 biggest things to fix, and one thing to try. Use short bullet points.'
};
const ASIDE = new Set(['summary', 'outline', 'titles', 'feedback']);   // 4.0: answers that sit beside the document instead of editing it
// 4.0 templates for a new document
const TEMPLATES = {
  essay: { title: 'Essay', text: '# Title\n\n## Introduction\nHook. Background. Thesis.\n\n## Body paragraph 1\nPoint. Evidence. Explanation.\n\n## Body paragraph 2\nPoint. Evidence. Explanation.\n\n## Body paragraph 3\nPoint. Evidence. Explanation.\n\n## Conclusion\nRestate the thesis. Tie it together.\n' },
  email: { title: 'Email', text: 'Subject: \n\nHi ,\n\n\n\nThanks,\n' },
  cover: { title: 'Cover letter', text: 'Dear Hiring Manager,\n\nI\'m applying for the  role at .\n\nWhy I fit: \n\nWhat I\'d bring: \n\nThank you for your time. I\'d love to talk more.\n\nSincerely,\n' },
  notes: { title: 'Meeting notes', text: '# Meeting notes\nDate: \nPeople: \n\n## Agenda\n- \n\n## Notes\n- \n\n## Decisions\n- \n\n## Action items\n- [ ] \n' },
  story: { title: 'Story outline', text: '# Story\n\n## Characters\n- \n\n## Setting\n\n## Beginning\n\n## Middle\n\n## Climax\n\n## Ending\n' },
  lab: { title: 'Lab report', text: '# Lab report\n\n## Question\n\n## Hypothesis\n\n## Materials\n- \n\n## Procedure\n1. \n\n## Results\n\n## Conclusion\n' }
};
const PROMPT = mode => mode === 'continue'
  ? `\n\n[WRITE MODE] Reply with ONLY a JSON object, no code fence: {"append":"text to add after the document"}`
  : ASIDE.has(mode) ? `\n\n[WRITE MODE] Reply with ONLY a JSON object, no code fence: {"aside":"your answer, in markdown"}. Don't rewrite the document.`
  : `\n\n[WRITE MODE] You suggest edits to the user's document. Reply with ONLY a JSON object, no code fence:
{"edits":[{"find":"exact text copied from the document (a phrase or sentence, unique enough to find)","replace":"the new text","why":"short reason"}],"note":"one line overall comment"}
Rules: "find" must match the document EXACTLY (same characters and punctuation). Keep each edit small (one sentence or phrase). At most 12 edits. If nothing needs changing, return {"edits":[],"note":"…"}.`;

function parseSuggestions(text, doc) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  let j = null;
  if (m) for (const x of [m[0], m[0].replace(/,\s*([}\]])/g, '$1')]) { try { j = JSON.parse(x); break; } catch {} }
  if (!j) return { edits: [], note: String(text || '').slice(0, 300), append: '', aside: String(text || '').length > 300 ? String(text).slice(0, 8000) : '' };
  if (typeof j.append === 'string') return { edits: [], note: '', append: j.append.slice(0, 8000) };
  if (typeof j.aside === 'string') return { edits: [], note: '', append: '', aside: j.aside.slice(0, 8000) };
  const seen = new Set();
  const edits = (Array.isArray(j.edits) ? j.edits : []).map(e => ({ find: String(e?.find ?? ''), replace: String(e?.replace ?? ''), why: String(e?.why ?? '').slice(0, 200) }))
    .filter(e => e.find && e.find !== e.replace && doc.includes(e.find) && !seen.has(e.find) && seen.add(e.find)).slice(0, 12);
  return { edits, note: String(j.note || '').slice(0, 300), append: '' };
}

class Docs {
  constructor(dir) { this.file = path.join(dir, 'docs.json'); this.d = null; }
  load() { if (!this.d) { try { this.d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.d = { list: [] }; } } return this.d; }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.d)); fs.renameSync(this.file + '.tmp', this.file); }
  list() { return this.load().list.slice().sort((a, b) => b.updated - a.updated).map(d => ({ id: d.id, title: d.title, updated: d.updated, words: (d.text.match(/\S+/g) || []).length, kind: d.kind || 'doc', ...(d.kind === 'jot' ? { text: d.text.slice(0, 300) } : {}) })); }
  // 4.2.0: jots (quick notes from the Jot widget, ⌘K or N28C) live here too, next to your documents ("Jots & Docs")
  addJot(text, at = Date.now()) {
    const t = String(text || '').trim().slice(0, 4000); if (!t) return null;
    const d = this.load(), doc = { id: newId(), created: at, kind: 'jot', text: t, title: t.split('\n')[0].slice(0, 60), updated: at };
    d.list.push(doc); if (d.list.length > MAX_DOCS + 300) d.list = d.list.sort((a, b) => b.updated - a.updated).slice(0, MAX_DOCS + 300);
    this.save(); return doc;
  }
  jots(n = 50) { return this.load().list.filter(d => d.kind === 'jot').sort((a, b) => b.updated - a.updated).slice(0, n); }
  get(id) { return this.load().list.find(d => d.id === id) || null; }
  put({ id, title, text, kind }) {
    const d = this.load();
    let doc = id && this.get(id);
    if (!doc) { doc = { id: newId(), created: Date.now() }; d.list.push(doc); if (d.list.length > MAX_DOCS) d.list = d.list.sort((a, b) => b.updated - a.updated).slice(0, MAX_DOCS); }
    const next = String(text ?? doc.text ?? '').slice(0, MAX_CHARS);
    // 4.0 version history: a snapshot when the text changed a fair bit, at most every 3 minutes, last 25 kept
    if (doc.text && next !== doc.text) { const v = doc.versions = doc.versions || [], last = v[v.length - 1];
      if (!last || Date.now() - last.at > 180e3 || Math.abs(next.length - doc.text.length) > 400) { v.push({ at: Date.now(), text: doc.text }); if (v.length > 25) v.splice(0, v.length - 25); } }
    doc.text = next;
    doc.title = String(title || '').trim().slice(0, 80) || (doc.text.split('\n').find(l => l.trim()) || 'Untitled').replace(/^#+\s*/, '').slice(0, 60);
    if (kind === 'doc' || kind === 'jot') doc.kind = kind;   // 4.2.0: turn a jot into a document (or back)
    doc.updated = Date.now();
    this.save(); return doc;
  }
  versions(id) { const d = this.get(id); return (d?.versions || []).map((v, i) => ({ i, at: v.at, words: (v.text.match(/\S+/g) || []).length, preview: v.text.slice(0, 160) })).reverse(); }
  restore(id, i) { const d = this.get(id), v = d?.versions?.[i]; if (!v) return null; return this.put({ id, title: d.title, text: v.text }); }
  remove(id) { const d = this.load(); d.list = d.list.filter(x => x.id !== id); this.save(); }
}
module.exports = { Docs, MODES, PROMPT, parseSuggestions, MAX_CHARS, ASIDE, TEMPLATES };
