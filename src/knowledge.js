// Knowledge: encyclopedia lookups (Wikipedia) + word definitions (Free Dictionary API). No keys needed.
const UA = { 'User-Agent': "Nexus28-desktop/1.5 (https://github.com/apojidelegraphics/Nexus-28)", Accept: 'application/json' };
const base = () => process.env.NEXUS_WIKI_BASE || 'https://en.wikipedia.org';
const dictBase = () => process.env.NEXUS_DICT_BASE || 'https://api.dictionaryapi.dev';

async function getJSON(url, signal) {
  const r = await fetch(url, { headers: UA, signal });
  if (!r.ok) throw new Error(`Lookup failed (${r.status})`);
  return r.json();
}

async function lookup(query, { signal } = {}) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) throw new Error('What should I look up?');
  const found = await getJSON(`${base()}/w/rest.php/v1/search/title?q=${encodeURIComponent(q)}&limit=3`, signal);
  const pages = found.pages || [];
  const out = { query: q, articles: [], definition: null };
  for (const p of pages.slice(0, 2)) {
    try {
      const s = await getJSON(`${base()}/api/rest_v1/page/summary/${encodeURIComponent(p.key)}`, signal);
      if (s.type === 'disambiguation') continue;
      out.articles.push({ title: s.title, description: s.description || '', extract: s.extract || '', url: s.content_urls?.desktop?.page || `${base()}/wiki/${encodeURIComponent(p.key)}`, thumb: s.thumbnail?.source || '' });
    } catch {}
  }
  if (/^[a-z][a-z-]{1,30}$/i.test(q)) {
    try {
      const d = await getJSON(`${dictBase()}/api/v2/entries/en/${encodeURIComponent(q.toLowerCase())}`, signal);
      const e = Array.isArray(d) ? d[0] : null;
      if (e) out.definition = { word: e.word, phonetic: e.phonetic || '', meanings: (e.meanings || []).slice(0, 3).map(m => ({ pos: m.partOfSpeech, def: m.definitions?.[0]?.definition || '', example: m.definitions?.[0]?.example || '' })) };
    } catch {}
  }
  return out;
}

function format(r) {
  const parts = [];
  if (r.definition) parts.push(`Definition of "${r.definition.word}"${r.definition.phonetic ? ' ' + r.definition.phonetic : ''}:\n` + r.definition.meanings.map(m => `- (${m.pos}) ${m.def}${m.example ? ` e.g. "${m.example}"` : ''}`).join('\n'));
  for (const a of r.articles) parts.push(`${a.title}${a.description ? ' — ' + a.description : ''}\n${a.url}\n${a.extract}`);
  return parts.join('\n\n') || `Nothing found for "${r.query}".`;
}

module.exports = { lookup, format };
