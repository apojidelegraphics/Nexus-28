// Tiny, safe Markdown renderer: escapes everything first, then adds a small set of formatting.
// Supports images (![alt](https://…) and bare image links on their own line) and links.
(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const IMG_EXT = /\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i;

  function inline(s) {
    const codes = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s
      .replace(/!\[([^\]]*)\]\((https:\/\/[^\s)]+|data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)\)/g, '<img class="md-img" src="$2" alt="$1" loading="lazy">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" data-ext>$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, (m, pre, url) => `${pre}<a href="${url}" data-ext>${url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1<em>$2</em>')
      .replace(/(^|\s)@([A-Za-z][\w.]*[\w])/g, '$1<span class="mention">@$2</span>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  }

  function render(src) {
    const parts = String(src || '').split(/```/);
    let html = '';
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const lang = (part.match(/^([\w+.-]*)\n/) || [])[1] || '';
        const code = part.replace(/^[\w+.-]*\n/, '');
        html += `<pre${lang ? ` data-lang="${esc(lang.toLowerCase())}"` : ''}><code>${esc(code.replace(/\n$/, ''))}</code></pre>`;
        return;
      }
      const lines = esc(part).split('\n');
      let list = null, para = [];
      const flushPara = () => { if (para.length) { html += `<p>${inline(para.join('<br>'))}</p>`; para = []; } };
      const flushList = () => { if (list) { html += `<${list.tag}>${list.items.map(t => `<li>${inline(t)}</li>`).join('')}</${list.tag}>`; list = null; } };
      const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
      const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        let m;
        const bare = line.trim();
        // GitHub-style table: header row, separator row, body rows
        if (bare.includes('|') && li + 1 < lines.length && SEP.test(lines[li + 1]) && cells(line).length > 1) {
          flushPara(); flushList();
          const head = cells(line);
          const aligns = cells(lines[li + 1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '');
          const al = i => aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
          let body = '';
          li += 2;
          while (li < lines.length && lines[li].includes('|') && lines[li].trim()) {
            const row = cells(lines[li]);
            body += `<tr>${head.map((_, i) => `<td${al(i)}>${inline(row[i] || '')}</td>`).join('')}</tr>`;
            li++;
          }
          li--;
          html += `<div class="md-table"><table><thead><tr>${head.map((h, i) => `<th${al(i)}>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
        }
        else if (/^https:\/\/\S+$/.test(bare) && IMG_EXT.test(bare)) { flushPara(); flushList(); html += `<p><img class="md-img" src="${bare}" alt="" loading="lazy"></p>`; }
        else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); }
        else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); }
        else if ((m = line.match(/^(#{1,3})\s+(.*)/))) { flushPara(); flushList(); html += `<h3>${inline(m[2])}</h3>`; }
        else if (/^\s*&gt;\s?/.test(line)) { flushPara(); flushList(); html += `<blockquote>${inline(line.replace(/^\s*&gt;\s?/, ''))}</blockquote>`; }
        else if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { flushPara(); flushList(); html += '<hr>'; }
        else if (!bare) { flushPara(); flushList(); }
        else { flushList(); para.push(line); }
      }
      flushPara(); flushList();
    });
    return html;
  }

  window.NexusMarkdown = { render, esc };
})();
