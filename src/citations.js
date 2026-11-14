// Citation helper (v1.7): read a page's details (title, authors, date, site) and format MLA 9, APA 7 and Chicago
// (notes-bibliography) citations. Your saved sources live in citations.json as a works-cited list.
const fs = require('fs');
const path = require('path');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MON = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();

// ---------- reading a page
function jsonLd(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); const arr = Array.isArray(j) ? j : j['@graph'] || [j]; out.push(...arr); } catch {}
  }
  return out;
}
const names = v => (Array.isArray(v) ? v : v ? [v] : []).map(a => clean(typeof a === 'string' ? a : a?.name)).filter(Boolean);
function parseDate(s) {
  const t = clean(s); if (!t) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? t + 'T12:00:00' : t);
  return isNaN(d) ? (/^\d{4}$/.test(t) ? { y: +t } : null) : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

function extract(html, url, { meta, decode }) {
  const allMeta = n => [...String(html).matchAll(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'gi'))].map(m => decode(m[1]).trim()).filter(Boolean);
  const ld = jsonLd(html).find(x => /Article|NewsArticle|BlogPosting|Report|ScholarlyArticle|WebPage/i.test(String(x['@type']))) || {};
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  let authors = allMeta('citation_author');
  if (!authors.length) authors = names(ld.author);
  if (!authors.length) authors = [meta(html, ['author', 'article:author', 'parsely-author', 'sailthru.author'])].filter(a => a && !/^https?:/.test(a));
  authors = authors.flatMap(a => a.split(/\s*(?:,\s*and\s+|\s+and\s+|;\s*)\s*/)).map(clean).filter(a => a && a.length < 80 && !/staff|editor(s)?$/i.test(a)).slice(0, 8);
  const title = clean(meta(html, ['citation_title', 'og:title', 'twitter:title']) || ld.headline || decode((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+[|\-–—]\s+[^|\-–—]{2,40}$/, ''));
  const site = clean(meta(html, ['og:site_name', 'application-name']) || names(ld.publisher)[0] || host);
  const date = parseDate(meta(html, ['citation_publication_date', 'citation_date', 'article:published_time', 'date', 'pubdate', 'dc.date', 'DC.date.issued']) || ld.datePublished || (String(html).match(/<time[^>]+datetime=["']([^"']+)["']/i) || [])[1]);
  const publisher = clean(names(ld.publisher)[0] || meta(html, ['citation_publisher', 'dc.publisher']) || '');
  const journal = clean(meta(html, ['citation_journal_title']));
  const doi = clean(meta(html, ['citation_doi', 'dc.identifier']).replace(/^doi:\s*/i, ''));
  return { type: journal ? 'journal' : 'web', title, authors, site, publisher: publisher && publisher !== site ? publisher : '', date, url, journal,
    volume: clean(meta(html, ['citation_volume'])), issue: clean(meta(html, ['citation_issue'])), pages: [meta(html, ['citation_firstpage']), meta(html, ['citation_lastpage'])].filter(Boolean).join('–'), doi: /^10\./.test(doi) ? doi : '' };
}

async function fromUrl(url, deps) {
  if (!/^https?:\/\//i.test(String(url))) url = 'https://' + String(url).trim();
  const r = await deps.fetchText(url, { timeout: 12000 });
  const src = /html|xml/.test(r.type) ? extract(r.text.slice(0, 600000), r.url, deps) : { type: 'web', title: decodeURIComponent(new URL(r.url).pathname.split('/').pop() || r.url), authors: [], site: new URL(r.url).hostname.replace(/^www\./, ''), url: r.url, date: null };
  return { ...src, accessed: Date.now() };
}

// ---------- names
function split(name) {
  const n = clean(name);
  if (/,/.test(n)) { const [last, first] = n.split(/\s*,\s*/); return { first: first || '', last }; }
  const parts = n.split(' ');
  if (parts.length === 1) return { first: '', last: n, org: true };
  const last = parts.pop();
  return { first: parts.join(' '), last };
}
const initials = first => first.split(/[\s-]+/).filter(Boolean).map(p => p[0].toUpperCase() + '.').join(' ');
const italic = (s, md) => s ? (md ? `*${s}*` : s) : '';
const end = s => /[.?!]$/.test(s) ? s : s + '.';
const sentence = s => clean(s);

// ---------- styles. opts.md → markdown italics
function mla(c, { md = true } = {}) {
  const a = c.authors.map(split);
  let who = '';
  if (a.length === 1) who = a[0].org || !a[0].first ? a[0].last : `${a[0].last}, ${a[0].first}`;
  else if (a.length === 2) who = `${a[0].last}, ${a[0].first}, and ${a[1].first} ${a[1].last}`;
  else if (a.length > 2) who = `${a[0].last}, ${a[0].first}, et al`;
  const d = c.date ? [c.date.d, c.date.m !== undefined ? MLA_MON[c.date.m] : '', c.date.y].filter(x => x !== '' && x !== undefined).join(' ') : '';
  const acc = c.accessed ? new Date(c.accessed) : null;
  const url = String(c.url || '').replace(/^https?:\/\//, '');
  if (c.type === 'journal') return [who && end(who), `"${end(sentence(c.title))}"`, italic(c.journal, md) + (c.volume ? `, vol. ${c.volume}` : '') + (c.issue ? `, no. ${c.issue}` : '') + (c.date?.y ? `, ${c.date.y}` : '') + (c.pages ? `, pp. ${c.pages}` : '') + ',', c.doi ? `https://doi.org/${c.doi}.` : end(url)].filter(Boolean).join(' ');
  return [who && end(who), `"${end(sentence(c.title))}"`, `${italic(c.site, md)}${c.publisher ? `, ${c.publisher}` : ''}${d ? `, ${d}` : ''},`, `${url}.`,
    !d && acc ? `Accessed ${acc.getDate()} ${MLA_MON[acc.getMonth()]} ${acc.getFullYear()}.` : ''].filter(Boolean).join(' ').replace(/,\s*,/g, ',');
}
function apa(c, { md = true } = {}) {
  const a = c.authors.map(split).map(x => x.org || !x.first ? x.last : `${x.last}, ${initials(x.first)}`);
  let who = a.length === 0 ? '' : a.length === 1 ? a[0] : a.length <= 20 ? a.slice(0, -1).join(', ') + ', & ' + a.at(-1) : a.slice(0, 19).join(', ') + ', . . . ' + a.at(-1);
  const d = c.date ? `(${c.date.y}${c.date.m !== undefined ? `, ${MONTHS[c.date.m]}${c.date.d ? ' ' + c.date.d : ''}` : ''})` : '(n.d.)';
  if (c.type === 'journal') return [who ? end(who) : '', `${d}.`, end(sentence(c.title)), `${italic(c.journal, md)}${c.volume ? `, ${italic(c.volume, md)}` : ''}${c.issue ? `(${c.issue})` : ''}${c.pages ? `, ${c.pages}` : ''}.`, c.doi ? `https://doi.org/${c.doi}` : c.url].filter(Boolean).join(' ');
  if (!who) return [`${italic(end(sentence(c.title)), md)}`, `${d}.`, c.site ? end(c.site) : '', c.url].filter(Boolean).join(' ');
  return [end(who), `${d}.`, italic(end(sentence(c.title)), md), c.site && !a.includes(c.site) ? end(c.site) : '', c.url].filter(Boolean).join(' ');
}
function chicago(c, { md = true } = {}) {
  const a = c.authors.map(split);
  let who = '';
  if (a.length === 1) who = a[0].org || !a[0].first ? a[0].last : `${a[0].last}, ${a[0].first}`;
  else if (a.length === 2) who = `${a[0].last}, ${a[0].first}, and ${a[1].first} ${a[1].last}`;
  else if (a.length === 3) who = `${a[0].last}, ${a[0].first}, ${a[1].first} ${a[1].last}, and ${a[2].first} ${a[2].last}`;
  else if (a.length > 3) who = `${a[0].last}, ${a[0].first}, et al`;
  const d = c.date ? `${c.date.m !== undefined ? MONTHS[c.date.m] + ' ' : ''}${c.date.d ? c.date.d + ', ' : ''}${c.date.y}` : '';
  const acc = c.accessed ? new Date(c.accessed) : null;
  return [who && end(who), `"${end(sentence(c.title))}"`, c.site ? end(italic(c.site, md)) : '', d ? end(d) : acc ? `Accessed ${MONTHS[acc.getMonth()]} ${acc.getDate()}, ${acc.getFullYear()}.` : '', end(c.url)].filter(Boolean).join(' ');
}
const STYLES = { mla, apa, chicago };
const LABELS = { mla: 'MLA 9', apa: 'APA 7', chicago: 'Chicago' };
function format(c, style = 'mla', opts) { return (STYLES[style] || mla)(c, opts); }
// Works cited / references: alphabetical, hanging indent left to the reader.
function bibliography(list, style = 'mla', opts) {
  const head = style === 'apa' ? 'References' : style === 'chicago' ? 'Bibliography' : 'Works Cited';
  const lines = list.map(c => format(c, style, opts)).sort((x, y) => x.replace(/^["*]/, '').localeCompare(y.replace(/^["*]/, ''), 'en', { sensitivity: 'base' }));
  return `${head}\n\n${lines.join('\n\n')}`;
}

class CitationStore {
  constructor({ dir }) { this.file = path.join(dir, 'citations.json'); this.list = null; }
  load() { if (this.list) return this.list; try { this.list = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.list = []; } if (!Array.isArray(this.list)) this.list = []; return this.list; }
  save() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.list, null, 1)); }
  all() { return this.load(); }
  add(c) {
    const list = this.load();
    const item = { id: 'ct' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), project: clean(c.project) || 'My sources', ...c, saved: Date.now() };
    const i = list.findIndex(x => x.url === item.url && x.project === item.project);
    if (i >= 0) list[i] = { ...item, id: list[i].id }; else list.unshift(item);
    this.list = list.slice(0, 500); this.save(); return item;
  }
  update(id, patch) { const c = this.load().find(x => x.id === id); if (c) { Object.assign(c, patch); this.save(); } return c; }
  remove(id) { this.list = this.load().filter(x => x.id !== id); this.save(); }
  projects() { return [...new Set(this.load().map(c => c.project))]; }
}

module.exports = { fromUrl, extract, format, bibliography, split, CitationStore, STYLES, LABELS, mla, apa, chicago };
