// Export a chat as Markdown, plain text, JSON, Word (.docx) or HTML (main turns that into a PDF).
const nameOf = (id, personas) => (personas.find(p => p.id === id) || {}).name || 'Nexus';
const when = ts => new Date(ts || Date.now()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
const attLine = m => (m.attachments || []).map(a => `[${a.kind === 'screen' ? 'Screenshot' : 'Attachment'}: ${a.name}]`).join(' ');

function speaker(m, personas) { return m.role === 'user' ? 'You' : nameOf(m.persona, personas); }
const visible = conv => conv.messages.filter(m => !m.hidden);

function toMarkdown(conv, personas) {
  const out = [`# ${conv.title}`, '', `_Exported from Nexus '28 · ${when(Date.now())}_`, ''];
  for (const m of visible(conv)) {
    out.push(`### ${speaker(m, personas)}${m.model ? ` · ${m.model}` : ''} — ${when(m.ts)}`, '');
    if (attLine(m)) out.push(attLine(m), '');
    out.push(m.content || '', '');
    if (m.sources?.length) out.push('Sources: ' + m.sources.map((s, i) => `[${i + 1}](${s.url})`).join(' '), '');
  }
  return out.join('\n');
}

function plain(md) {
  return String(md || '').replace(/```\w*\n?/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)[*_](.+?)[*_](?=\s|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1').replace(/!\[[^\]]*\]\(([^)]*)\)/g, '$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)').replace(/^#{1,6}\s+/gm, '');
}
function toText(conv, personas) {
  const out = [conv.title, '='.repeat(Math.min(60, conv.title.length)), ''];
  for (const m of visible(conv)) {
    out.push(`${speaker(m, personas)} (${when(m.ts)}):`);
    if (attLine(m)) out.push(attLine(m));
    out.push(plain(m.content), '');
  }
  return out.join('\n');
}

function toJSON(conv, personas) {
  return JSON.stringify({
    title: conv.title, exported: new Date().toISOString(), app: "Nexus '28",
    messages: visible(conv).map(m => ({
      role: m.role, agent: m.role === 'assistant' ? nameOf(m.persona, personas) : undefined, model: m.model, time: new Date(m.ts || 0).toISOString(),
      content: m.content, attachments: (m.attachments || []).map(a => ({ name: a.name, kind: a.kind })), sources: m.sources?.length ? m.sources : undefined
    }))
  }, null, 2);
}

// Inline **bold**, *italic*, `code` → docx runs.
function runs(docx, text, base = {}) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(new docx.TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) parts.push(new docx.TextRun({ text: t.slice(2, -2), bold: true, ...base }));
    else if (t.startsWith('`')) parts.push(new docx.TextRun({ text: t.slice(1, -1), font: 'Menlo', ...base }));
    else parts.push(new docx.TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(new docx.TextRun({ text: text.slice(last), ...base }));
  return parts;
}
async function toDocx(conv, personas) {
  const docx = require('docx');
  const P = (opts) => new docx.Paragraph(opts);
  const children = [
    P({ heading: docx.HeadingLevel.TITLE, children: [new docx.TextRun(conv.title)] }),
    P({ children: [new docx.TextRun({ text: `Exported from Nexus '28 · ${when(Date.now())}`, italics: true, color: '666666' })] })
  ];
  for (const m of visible(conv)) {
    children.push(P({ heading: docx.HeadingLevel.HEADING_3, spacing: { before: 240 }, children: [new docx.TextRun(`${speaker(m, personas)}${m.model ? ' · ' + m.model : ''}`), new docx.TextRun({ text: `  ${when(m.ts)}`, color: '888888', size: 18 })] }));
    if (attLine(m)) children.push(P({ children: [new docx.TextRun({ text: attLine(m), italics: true, color: '666666' })] }));
    let code = false;
    for (const line of String(m.content || '').split('\n')) {
      if (/^```/.test(line)) { code = !code; continue; }
      if (code) { children.push(P({ children: [new docx.TextRun({ text: line || ' ', font: 'Menlo', size: 18 })] })); continue; }
      const h = line.match(/^(#{1,3})\s+(.*)/);
      if (h) { children.push(P({ heading: [docx.HeadingLevel.HEADING_1, docx.HeadingLevel.HEADING_2, docx.HeadingLevel.HEADING_3][h[1].length - 1], children: runs(docx, h[2]) })); continue; }
      const b = line.match(/^\s*[-*•]\s+(.*)/);
      if (b) { children.push(P({ bullet: { level: 0 }, children: runs(docx, b[1]) })); continue; }
      const n = line.match(/^\s*(\d+)[.)]\s+(.*)/);
      if (n) { children.push(P({ children: runs(docx, `${n[1]}. ${n[2]}`), indent: { left: 360 } })); continue; }
      if (/^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line)) continue; // table divider
      children.push(P({ children: runs(docx, line.replace(/^\s*\|(.*)\|\s*$/, (_, r) => r.split('|').map(c => c.trim()).join('   ·   '))) }));
    }
  }
  const doc = new docx.Document({ creator: "Nexus '28", title: conv.title, sections: [{ children }] });
  return docx.Packer.toBuffer(doc);
}

// Printable HTML (main renders it in a hidden window and prints to PDF).
function toHTML(conv, personas, renderMarkdown) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const items = visible(conv).map(m => `<section class="${m.role}"><h3>${esc(speaker(m, personas))}${m.model ? `<small> · ${esc(m.model)}</small>` : ''}<span>${esc(when(m.ts))}</span></h3>
    ${attLine(m) ? `<p class="att">${esc(attLine(m))}</p>` : ''}<div class="body">${m.role === 'user' ? `<p>${esc(m.content).replace(/\n/g, '<br>')}</p>` : renderMarkdown(m.content || '')}</div></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(conv.title)}</title><style>
    body{font:12.5px/1.55 -apple-system,Helvetica,Arial,sans-serif;color:#111;margin:36px 44px}
    h1{font-size:22px;margin:0 0 2px}.meta{color:#777;margin:0 0 22px;font-size:11px}
    section{margin:0 0 16px;padding:10px 14px;border-radius:8px;break-inside:avoid-page}
    section.user{background:#f2f5f4}section.assistant{border:1px solid #e3e6e5}
    h3{font-size:12px;margin:0 0 6px;color:#0a7a52}h3 small{color:#888;font-weight:400}h3 span{float:right;color:#999;font-weight:400}
    section.user h3{color:#333}.att{color:#666;font-style:italic}
    pre{background:#f6f6f6;padding:8px 10px;border-radius:6px;white-space:pre-wrap;font:11px Menlo,monospace}code{font:11px Menlo,monospace}
    table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}img{max-width:60%}a{color:#0a6}
  </style></head><body><h1>${esc(conv.title)}</h1><p class="meta">Exported from Nexus '28 · ${esc(when(Date.now()))}</p>${items}</body></html>`;
}

const FORMATS = {
  md: { label: 'Markdown', ext: 'md' }, txt: { label: 'Plain text', ext: 'txt' }, json: { label: 'JSON', ext: 'json' },
  docx: { label: 'Word', ext: 'docx' }, pdf: { label: 'PDF', ext: 'pdf' }
};
const safeName = t => String(t || 'Nexus chat').replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Nexus chat';

module.exports = { toMarkdown, toText, toJSON, toDocx, toHTML, FORMATS, safeName };
