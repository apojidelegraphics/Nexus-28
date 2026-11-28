// 4.4.0 StoryLattice: Solis's living notes for a creative project, kept on the chat itself (conv.lattice). Solis adds to
// them with a hidden ```nexus-lattice block at the end of an answer (only what changed); pictures made with LuminaRender
// are added as frames. The notes go back into Solis's instructions every turn, and the chat window shows them in a panel
// you can open and edit.
//   clean(l) · merge(old, patch) · extract(text) → { text, patches } · prompt(l) · empty(l)
'use strict';
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, n);
const HEX = /^#[0-9a-f]{6}$/i;
const ATT = /^a[a-z0-9]{4,40}$/;

function clean(l = {}) {
  const chars = (Array.isArray(l.characters) ? l.characters : []).map(c => typeof c === 'string' ? { name: clip(c, 40), note: '' } : { name: clip(c?.name, 40), note: clip(c?.note, 200) }).filter(c => c.name);
  const seen = new Set();
  return {
    title: clip(l.title, 80),
    style: clip(l.style, 240),
    characters: chars.filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 24),
    palette: [...new Set((Array.isArray(l.palette) ? l.palette : []).map(x => String(x || '').trim()).filter(x => HEX.test(x)).map(x => x.toUpperCase()))].slice(0, 10),
    rules: (Array.isArray(l.rules) ? l.rules : []).map(r => clip(r, 200)).filter(Boolean).slice(0, 20),
    frames: (Array.isArray(l.frames) ? l.frames : []).filter(f => f && ATT.test(f.att || '')).map(f => ({ att: f.att, prompt: clip(f.prompt, 400), model: clip(f.model, 80), thumb: /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f.thumb || '') && f.thumb.length < 40000 ? f.thumb : '', at: +f.at || 0 })).slice(-24),
    updated: +l.updated || 0
  };
}
const empty = l => { const c = clean(l || {}); return !c.title && !c.style && !c.characters.length && !c.palette.length && !c.rules.length && !c.frames.length; };

// A patch only changes what it names. Characters merge by name (a new note replaces the old one); "remove": ["Name"]
// takes characters out; palette and rules replace the whole list when given.
function merge(old = {}, patch = {}) {
  const o = clean(old), p = patch || {};
  const out = { ...o };
  if ('title' in p) out.title = p.title;
  if ('style' in p) out.style = p.style;
  if (Array.isArray(p.palette)) out.palette = p.palette;
  if (Array.isArray(p.rules)) out.rules = p.rules;
  if (Array.isArray(p.characters)) {
    const list = [...o.characters];
    for (const c of p.characters) {
      const n = typeof c === 'string' ? { name: c, note: '' } : c; if (!n?.name) continue;
      const i = list.findIndex(x => x.name.toLowerCase() === String(n.name).trim().toLowerCase());
      if (i >= 0) list[i] = { name: list[i].name, note: n.note != null && String(n.note).trim() ? n.note : list[i].note }; else list.push(n);
    }
    out.characters = list;
  }
  if (Array.isArray(p.remove)) { const r = new Set(p.remove.map(x => String(x).trim().toLowerCase())); out.characters = out.characters.filter(c => !r.has(c.name.toLowerCase())); }
  if (p.frame) out.frames = [...o.frames, p.frame];
  return clean({ ...out, updated: Date.now() });
}

// ```nexus-lattice {...}``` blocks in an answer → patches, and the answer without them
const BLOCK = /```nexus-lattice\s*([\s\S]*?)```/g;
function extract(text = '') {
  const patches = [];
  const out = String(text).replace(BLOCK, (m, body) => {
    const j = String(body).match(/\{[\s\S]*\}/); if (!j) return '';
    for (const s of [j[0], j[0].replace(/,\s*([}\]])/g, '$1')]) { try { patches.push(JSON.parse(s)); break; } catch { /* try the next */ } }
    return '';
  }).replace(/\n{3,}/g, '\n\n').trim();
  return { text: out, patches };
}

function prompt(l) {
  const c = clean(l || {});
  const have = !empty(c);
  const notes = have ? [
    c.title && `Title: ${c.title}`, c.style && `Look and style: ${c.style}`,
    c.palette.length && `Palette: ${c.palette.join(', ')}`,
    c.characters.length && `Characters:\n${c.characters.map(x => `- ${x.name}${x.note ? ': ' + x.note : ''}`).join('\n')}`,
    c.rules.length && `World rules:\n${c.rules.map(r => '- ' + r).join('\n')}`,
    c.frames.length && `Pictures made so far (${c.frames.length}): ${c.frames.slice(-5).map(f => `"${f.prompt.slice(0, 90)}"`).join('; ')}`
  ].filter(Boolean).join('\n') : '(nothing yet)';
  return `\n\n[STORYLATTICE — this chat's creative notes]\n${notes}\nStay consistent with these notes. When the user sets or changes something lasting (the project's title, a character, the look or palette, a world rule), add at the very end of your answer a fenced block with the language tag nexus-lattice holding JSON with only what changed, for example:\n\`\`\`nexus-lattice\n{"title":"…","style":"…","palette":["#F59E0B"],"characters":[{"name":"…","note":"…"}],"rules":["…"]}\n\`\`\`\nThe app hides that block and saves it; never mention it.`;
}

module.exports = { clean, merge, extract, prompt, empty };
