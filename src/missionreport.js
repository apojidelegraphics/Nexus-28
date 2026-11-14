// Mission sharing (v1.6): turn a mission chat into a formatted report — PDF, Word or Markdown — with a cover,
// the final report, every source, and how Paragon got there.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = ts => new Date(ts || Date.now()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function build(conv) {
  const msgs = (conv.messages || []).filter(m => !m.hidden);
  const first = msgs.find(m => m.role === 'user');
  const goal = String(first?.content || conv.title || '').replace(/\n*\(Mission · \d+ min\)\s*$/, '').trim();
  const minutes = +(String(first?.content || '').match(/\(Mission · (\d+) min\)/) || [])[1] || null;
  const report = [...msgs].reverse().find(m => m.report && !m.error);
  const rounds = msgs.filter(m => m.role === 'assistant' && !m.report && m.via === 'mission');
  const sources = [], seen = new Set();
  for (const m of msgs) for (const s of [...(m.sources || []), ...(m.activity || []).flatMap(a => a.sources || [])]) if (s?.url && !seen.has(s.url)) { seen.add(s.url); sources.push({ title: s.title || s.url, url: s.url }); }
  const actions = rounds.flatMap(m => (m.activity || []).filter(a => a.tool !== 'system'));
  return {
    title: String(conv.title || 'Mission').replace(/^Mission:\s*/, ''), goal, minutes,
    started: first?.ts || conv.created, ended: (report || msgs.at(-1))?.ts || conv.updated,
    report: report?.content || rounds.at(-1)?.content || '(No report yet — the mission may still be running.)', complete: !!report,
    rounds: rounds.map((m, i) => ({ n: i + 1, text: m.content, error: !!m.error, actions: (m.activity || []).filter(a => a.tool !== 'system').map(a => `${a.label}${a.detail ? ' · ' + a.detail : ''}${a.status && a.status !== 'ok' ? ` (${a.status})` : ''}`) })),
    sources: sources.slice(0, 60), stats: { rounds: rounds.length, actions: actions.length, sources: sources.length }
  };
}
const duration = r => { const m = Math.max(1, Math.round(((r.ended || 0) - (r.started || 0)) / 60e3)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const brief = t => { const s = String(t || '').replace(/```[\s\S]*?```/g, '').replace(/MISSION COMPLETE/g, '').trim(); return s.length > 700 ? s.slice(0, 680).replace(/\s+\S*$/, '') + '…' : s; };

function toMarkdown(r) {
  return [`# ${r.title}`, '', `> **Mission report** · Nexus '28 Paragon · ${fmt(r.ended)}`, '', `**Goal:** ${r.goal}`, '',
    `**Ran for:** ${duration(r)}${r.minutes ? ` (of ${r.minutes} min)` : ''} · **Rounds:** ${r.stats.rounds} · **Actions:** ${r.stats.actions} · **Sources:** ${r.stats.sources}${r.complete ? '' : ' · _not finished_'}`, '',
    '---', '', r.report, '',
    ...(r.sources.length ? ['## Sources', '', ...r.sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`), ''] : []),
    ...(r.rounds.length ? ['## How Paragon got there', '', ...r.rounds.flatMap(x => [`### Round ${x.n}`, '', ...(x.actions.length ? [x.actions.map(a => `- ${a}`).join('\n'), ''] : []), brief(x.text), ''])] : [])
  ].join('\n');
}

function toHTML(r, renderMarkdown) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
  @page{margin:14mm 0}@page :first{margin-top:0}body{margin:0;font:12.5px/1.6 -apple-system,Helvetica,Arial,sans-serif;color:#14211c}
  .cover{background:linear-gradient(135deg,#04140d 0%,#0a3324 60%,#0f4d38 100%);color:#e9fff5;padding:46px 54px 34px}
  .tag{font:600 10px Menlo,monospace;letter-spacing:.32em;color:#3dffa0}
  h1{font-size:28px;line-height:1.2;margin:10px 0 14px;font-weight:700}
  .goal{font-size:13.5px;color:#bfeedd;max-width:620px}
  .meta{display:flex;gap:26px;margin-top:22px;font-size:11px;color:#8fd3b6}.meta b{display:block;font-size:17px;color:#fff}
  main{padding:30px 54px 40px}
  h2{font-size:15px;color:#0a7a52;border-bottom:2px solid #d8f1e7;padding-bottom:4px;margin:26px 0 10px}
  h3{font-size:13px;margin:16px 0 4px}
  .report h3{font-size:14px;color:#0b4f37}
  table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #d8e2de;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f1f8f5}
  pre{background:#f5f7f6;padding:8px 10px;border-radius:6px;white-space:pre-wrap;font:11px Menlo,monospace}code{font:11px Menlo,monospace;background:#f1f4f3;padding:0 3px;border-radius:3px}
  ol.src{padding-left:22px;font-size:11px;color:#344}ol.src a{color:#0a7a52;text-decoration:none;word-break:break-all}
  .round{border-left:3px solid #c9eadc;padding:2px 0 2px 12px;margin:10px 0;break-inside:avoid-page;font-size:11.5px;color:#334}
  .round ul{margin:4px 0;padding-left:18px}.round ul.acts{color:#0a6a48}
  .warn{background:#fff6e3;border:1px solid #f1d9a0;color:#7a5600;padding:6px 10px;border-radius:6px;font-size:11px}
  footer{padding:0 54px 30px;color:#99a;font-size:10px}
  </style></head><body>
  <div class="cover"><div class="tag">NEXUS '28 · MISSION REPORT</div><h1>${esc(r.title)}</h1><div class="goal"><b>Goal:</b> ${esc(r.goal)}</div>
    <div class="meta"><div><b>${esc(duration(r))}</b>ran for</div><div><b>${r.stats.rounds}</b>rounds</div><div><b>${r.stats.actions}</b>actions</div><div><b>${r.stats.sources}</b>sources</div><div><b>${esc(new Date(r.ended || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}</b>completed</div></div></div>
  <main>${r.complete ? '' : '<p class="warn">This mission didn\'t write a final report, so this shows its latest update.</p>'}
  <div class="report">${renderMarkdown(r.report)}</div>
  ${r.sources.length ? `<h2>Sources</h2><ol class="src">${r.sources.map(s => `<li>${esc(s.title)} — <a href="${esc(s.url)}">${esc(s.url)}</a></li>`).join('')}</ol>` : ''}
  ${r.rounds.length ? `<h2>How Paragon got there</h2>${r.rounds.map(x => `<div class="round"><b>Round ${x.n}</b>${x.actions.length ? `<ul class="acts">${x.actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}${renderMarkdown(brief(x.text))}</div>`).join('')}` : ''}
  </main><footer>Made with Nexus '28 · Missions run Paragon in the background and ask before any action that changes something.</footer></body></html>`;
}

async function toDocx(r) {
  const docx = require('docx');
  const P = o => new docx.Paragraph(o), T = (text, o = {}) => new docx.TextRun({ text, ...o });
  const kids = [
    P({ children: [T("NEXUS '28 · MISSION REPORT", { bold: true, color: '0A7A52', size: 18 })] }),
    P({ heading: docx.HeadingLevel.TITLE, children: [T(r.title)] }),
    P({ children: [T('Goal: ', { bold: true }), T(r.goal)] }),
    P({ spacing: { after: 240 }, children: [T(`Ran for ${duration(r)} · ${r.stats.rounds} rounds · ${r.stats.actions} actions · ${r.stats.sources} sources · ${fmt(r.ended)}`, { color: '666666', size: 18 })] })
  ];
  const md = (text) => {
    let code = false;
    for (const line of String(text || '').split('\n')) {
      if (/^```/.test(line)) { code = !code; continue; }
      if (code) { kids.push(P({ children: [T(line || ' ', { font: 'Menlo', size: 18 })] })); continue; }
      const h = line.match(/^(#{1,3})\s+(.*)/);
      if (h) { kids.push(P({ heading: docx.HeadingLevel.HEADING_2, children: [T(h[2].replace(/\*\*/g, ''))] })); continue; }
      const b = line.match(/^\s*[-*•]\s+(.*)/);
      if (b) { kids.push(P({ bullet: { level: 0 }, children: inline(b[1]) })); continue; }
      if (/^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line)) continue;
      kids.push(P({ children: inline(line.replace(/^\s*\|(.*)\|\s*$/, (_, x) => x.split('|').map(c => c.trim()).join('   ·   '))) }));
    }
  };
  const inline = s => String(s).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(p => p.startsWith('**') ? T(p.slice(2, -2), { bold: true }) : T(p));
  md(r.report);
  if (r.sources.length) { kids.push(P({ heading: docx.HeadingLevel.HEADING_1, children: [T('Sources')] })); r.sources.forEach((s, i) => kids.push(P({ children: [T(`${i + 1}. ${s.title} — `), T(s.url, { color: '0A7A52' })] }))); }
  if (r.rounds.length) {
    kids.push(P({ heading: docx.HeadingLevel.HEADING_1, children: [T('How Paragon got there')] }));
    for (const x of r.rounds) { kids.push(P({ heading: docx.HeadingLevel.HEADING_3, children: [T(`Round ${x.n}`)] })); x.actions.forEach(a => kids.push(P({ bullet: { level: 0 }, children: [T(a, { color: '0A6A48' })] }))); md(brief(x.text)); }
  }
  return docx.Packer.toBuffer(new docx.Document({ creator: "Nexus '28", title: r.title, sections: [{ children: kids }] }));
}

module.exports = { build, toMarkdown, toHTML, toDocx, duration };
