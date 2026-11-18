// Web connector: search (DuckDuckGo / Tavily / Brave), page reading, and link previews.
// All fetches run in the main process and refuse private/local network addresses.
const dns = require('dns').promises;
const net = require('net');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 NexusDesktop/0.3';
const MAX_BYTES = 1_500_000;

// ---------------- Safety: only public http(s)
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return true;
}
async function assertPublicUrl(raw, { allowPrivate = false } = {}) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('That is not a valid URL.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links can be opened.');
  if (allowPrivate || process.env.NEXUS_TEST_ALLOW_PRIVATE === '1') return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('Local network addresses are blocked.');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new Error(`Could not resolve ${host}.`); });
  if (addrs.some(a => isPrivateIp(a.address))) throw new Error('Local network addresses are blocked.');
  return u;
}

async function fetchText(url, { timeout = 10000, accept = 'text/html,application/xhtml+xml,*/*;q=0.8', allowPrivate = false, signal } = {}) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(current, { allowPrivate });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const init = { headers: { 'User-Agent': UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.8' }, redirect: 'manual', signal: ctrl.signal };
      // 3.7: Node's fetch can fail on some networks ("fetch failed": proxies, VPNs, IPv6) where Chromium's works, so
      // the desktop app retries through Chromium. Redirects are still checked one hop at a time.
      let res;
      try { res = await fetch(current, init); }
      catch (e) { if (fetchImpl === fetch || e.name === 'AbortError') throw e; res = await fetchImpl(current, init); }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), current).toString(); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(current).hostname}`);
      const type = res.headers.get('content-type') || '';
      const reader = res.body.getReader();
      const chunks = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length; chunks.push(value);
        if (size > MAX_BYTES) { reader.cancel().catch(() => {}); break; }
      }
      return { url: current, type, text: Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8') };
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(signal?.aborted ? 'Cancelled.' : `Timed out loading ${new URL(current).hostname}.`);
      throw e;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }
  throw new Error('Too many redirects.');
}

// ---------------- HTML helpers
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#x2F': '/', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
function decode(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENT[n] ?? ENT[n.toLowerCase()] ?? m);
}
const stripTags = s => decode(String(s || '').replace(/<\/?(?:b|strong|em|i|u|span|mark|a|code|small|sup|sub)\b[^>]*>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function meta(html, names) {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    if (m && m[1].trim()) return decode(m[1].trim());
  }
  return '';
}
function absolutize(u, base) { try { return u ? new URL(u, base).toString() : ''; } catch { return ''; } }

function readable(html) {
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<(article|main)[\s\S]*?<\/\1>/i);
  if (main && main[0].length > 800) body = main[0];
  return decode(body
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

// ---------------- Page reading (tool) + link previews (UI)
async function fetchPage(url, { maxChars = 9000, signal } = {}) {
  const r = await fetchText(url, { signal });
  if (!/html|text\/plain|xml|json/.test(r.type)) throw new Error(`That link is ${r.type || 'a binary file'}, not a page.`);
  const isHtml = /html|xml/.test(r.type);
  const title = isHtml ? stripTags((r.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') : '';
  const text = isHtml ? readable(r.text) : r.text;
  return {
    url: r.url, title,
    image: isHtml ? absolutize(meta(r.text, ['og:image', 'twitter:image', 'twitter:image:src']), r.url) : '',
    text: text.length > maxChars ? text.slice(0, maxChars) + '\n…[truncated]' : text
  };
}

const previewCache = new Map();
async function linkPreview(url) {
  if (previewCache.has(url)) return previewCache.get(url);
  const job = (async () => {
    const u = await assertPublicUrl(url);
    if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u.pathname)) return { url, kind: 'image', image: url };
    const r = await fetchText(url, { timeout: 6000 });
    if (/^image\//.test(r.type)) return { url, kind: 'image', image: url };
    if (!/html/.test(r.type)) return { url, kind: 'file', title: u.hostname, siteName: u.hostname };
    const html = r.text.slice(0, 400000);
    const host = new URL(r.url).hostname.replace(/^www\./, '');
    return {
      url, kind: 'page',
      title: meta(html, ['og:title', 'twitter:title']) || stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '') || host,
      description: (meta(html, ['og:description', 'twitter:description', 'description']) || '').slice(0, 220),
      image: absolutize(meta(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']), r.url),
      siteName: meta(html, ['og:site_name']) || host,
      favicon: `https://${new URL(r.url).hostname}/favicon.ico`
    };
  })().catch(e => ({ url, kind: 'error', error: e.message }));
  previewCache.set(url, job);
  if (previewCache.size > 300) previewCache.delete(previewCache.keys().next().value);
  return job;
}

// ---------------- Search
const SEARCH_PROVIDERS = {
  duckduckgo: { label: 'DuckDuckGo (no key)', needsKey: false },
  tavily: { label: 'Tavily (best for AI, images)', needsKey: true },
  brave: { label: 'Brave Search', needsKey: true }
};

async function searchTavily({ query, max, key, base = 'https://api.tavily.com', signal }) {
  const res = await fetch(`${base}/search`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: max, include_images: true, search_depth: 'basic' })
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  return {
    results: (j.results || []).map(r => ({ title: r.title, url: r.url, snippet: (r.content || '').slice(0, 400) })),
    images: (j.images || []).map(i => typeof i === 'string' ? i : i.url).filter(Boolean)
  };
}
async function searchBrave({ query, max, key, base = 'https://api.search.brave.com/res/v1', signal }) {
  const res = await fetch(`${base}/web/search?q=${encodeURIComponent(query)}&count=${max}`, {
    signal, headers: { Accept: 'application/json', 'X-Subscription-Token': key }
  });
  if (!res.ok) throw new Error(`Brave ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const j = await res.json();
  const results = (j.web?.results || []).slice(0, max).map(r => ({ title: stripTags(r.title), url: r.url, snippet: stripTags(r.description).slice(0, 400), thumb: r.thumbnail?.src }));
  return { results, images: results.map(r => r.thumb).filter(Boolean).slice(0, 6) };
}
function parseDuckDuckGo(html, max) {
  const results = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const b of blocks) {
    const a = b.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    let href = decode(a[1]);
    const uddg = href.match(/[?&]uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (href.startsWith('//')) href = 'https:' + href;
    if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue; // skip ads
    const sn = b.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i);
    results.push({ title: stripTags(a[2]), url: href, snippet: sn ? stripTags(sn[1]).slice(0, 400) : '' });
    if (results.length >= max) break;
  }
  return results;
}
// 3.7: free search no longer depends on one engine. DuckDuckGo often refuses or resets automated requests, so the
// requests go through Chromium's own network stack in the app (setFetch(net.fetch)), and if DuckDuckGo still won't
// answer, Bing, DuckDuckGo Lite and Wikipedia are tried in turn. The first one with results wins.
let fetchImpl = (...a) => fetch(...a);
function setFetch(f) { if (typeof f === 'function') fetchImpl = f; }
const BUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
async function searchDuckDuckGo({ query, max, base = 'https://html.duckduckgo.com', signal }) {
  const res = base === 'https://html.duckduckgo.com'
    ? await fetchImpl(`${base}/html/`, { method: 'POST', signal, headers: { 'User-Agent': BUA, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'q=' + encodeURIComponent(query) })
    : await fetch(`${base}/html/?q=${encodeURIComponent(query)}`, { signal, headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`DuckDuckGo ${res.status}`);
  const results = parseDuckDuckGo(await res.text(), max);
  if (!results.length) throw new Error('DuckDuckGo returned no parseable results (it may be rate-limiting).');
  return { results, images: [] };
}
// Bing wraps every link as bing.com/ck/a?…&u=a1<base64url of the real address>
function bingUrl(href) {
  const h = decode(href);
  const u = h.match(/[?&]u=a1([A-Za-z0-9_-]+)/);
  if (u) { try { return Buffer.from(u[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch {} }
  return h;
}
function parseBing(html, max) {
  const out = [];
  for (const b of html.split(/<li class="b_algo"/i).slice(1)) {
    const a = b.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i); if (!a) continue;
    const url = bingUrl(a[1]); if (!/^https?:\/\//.test(url) || /bing\.com\//.test(url)) continue;
    const sn = b.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || b.match(/<div class="b_caption"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    out.push({ title: stripTags(a[2]), url, snippet: sn ? stripTags(sn[1]).replace(/^[^·]{0,40}·\s*/, '').slice(0, 400) : '' });
    if (out.length >= max) break;
  }
  return out;
}
async function searchBing({ query, max, signal }) {
  const res = await fetchImpl(`https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en&cc=us&count=${Math.max(10, max)}`, { signal, headers: { 'User-Agent': BUA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } });
  if (!res.ok) throw new Error(`Bing ${res.status}`);
  const results = parseBing(await res.text(), max);
  if (!results.length) throw new Error('Bing returned no results.');
  return { results, images: [] };
}
async function searchDdgLite({ query, max, signal }) {
  const res = await fetchImpl('https://lite.duckduckgo.com/lite/', { method: 'POST', signal, headers: { 'User-Agent': BUA, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'q=' + encodeURIComponent(query) });
  if (!res.ok) throw new Error(`DuckDuckGo Lite ${res.status}`);
  const html = await res.text(), results = [];
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = decode(m[1]); const ud = href.match(/[?&]uddg=([^&]+)/); if (ud) href = decodeURIComponent(ud[1]); if (href.startsWith('//')) href = 'https:' + href;
    if (/^https?:/.test(href) && !/duckduckgo\.com\/y\.js/.test(href)) results.push({ title: stripTags(m[2]), url: href, snippet: '' });
    if (results.length >= max) break;
  }
  if (!results.length) throw new Error('DuckDuckGo Lite returned no results.');
  return { results, images: [] };
}
async function searchWikipedia({ query, max, signal }) {
  const res = await fetchImpl(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${max}&format=json&origin=*`, { signal, headers: { 'User-Agent': "Nexus-28/3.7 (apojidelegraphics.github.io)" } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const j = await res.json();
  const results = (j.query?.search || []).map(r => ({ title: r.title + ' (Wikipedia)', url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(r.title.replace(/ /g, '_')), snippet: stripTags(r.snippet || '') }));
  if (!results.length) throw new Error('Wikipedia had nothing.');
  return { results, images: [] };
}
const FREE_CHAIN = [['DuckDuckGo', searchDuckDuckGo], ['Bing', searchBing], ['DuckDuckGo Lite', searchDdgLite], ['Wikipedia', searchWikipedia]];
async function searchFree({ query, max, signal, chain = FREE_CHAIN }) {
  const errs = [];
  for (const [name, fn] of chain) {
    try { const r = await fn({ query, max, signal }); if (r.results.length) return { ...r, engine: name }; }
    catch (e) { if (signal?.aborted) throw e; errs.push(`${name}: ${String(e.message || e).slice(0, 60)}`); }
  }
  throw new Error(`Web search couldn't reach a search engine right now (${errs.join('; ')}). Check your internet connection, or add a Tavily or Brave key in Settings → Connectors.`);
}

async function search({ provider = 'duckduckgo', query, max = 5, key, base, signal }) {
  max = Math.max(1, Math.min(10, +max || 5));
  if (!query || !String(query).trim()) throw new Error('Empty search query.');
  // a key you added: use it, and fall back to the free engines if it fails
  if (provider === 'tavily' && key) { try { return await searchTavily({ query, max, key, base, signal }); } catch (e) { if (signal?.aborted || base) throw e; } }
  if (provider === 'brave' && key) { try { return await searchBrave({ query, max, key, base, signal }); } catch (e) { if (signal?.aborted || base) throw e; } }
  if (base) return searchDuckDuckGo({ query, max, base, signal });   // tests point this at a stand-in server
  return searchFree({ query, max, signal });
}

module.exports = { search, searchFree, parseBing, bingUrl, setFetch, fetchPage, linkPreview, assertPublicUrl, isPrivateIp, parseDuckDuckGo, readable, SEARCH_PROVIDERS, fetchText, meta, decode };
