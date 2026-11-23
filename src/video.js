// Videos (4.0): what's in a video, for every agent.
//   • A link in your message (YouTube, Instagram, TikTok, Vimeo, X, Reddit, Facebook, a direct .mp4…) → its title, who
//     posted it, the caption/description, the transcript (YouTube captions), and a still (the thumbnail) the agent can see.
//     If the page points at a playable video file, Nexus downloads it (up to 150 MB) and watches it like an attached video.
//   • An attached video file → a few stills spread across it plus what's said in it (speech-to-text), done in
//     renderer/videoproc (Chromium decodes the video; nothing leaves your computer except the audio for transcription).
//   info(url, { fetchText, fetchBytes, signal }) → { kind, url, title, author, description, duration, transcript, thumb, videoUrl, note }
//   describe(v) → the text block the agent reads
'use strict';
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp)$/i;
const SITES = [
  ['youtube', /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i],
  ['instagram', /(?:^|\.)instagram\.com$/i], ['tiktok', /(?:^|\.)tiktok\.com$/i], ['vimeo', /(?:^|\.)vimeo\.com$/i],
  ['x', /(?:^|\.)(?:x\.com|twitter\.com)$/i], ['reddit', /(?:^|\.)(?:reddit\.com|redd\.it)$/i], ['facebook', /(?:^|\.)(?:facebook\.com|fb\.watch)$/i],
  ['twitch', /(?:^|\.)twitch\.tv$/i], ['dailymotion', /(?:^|\.)dailymotion\.com$/i], ['streamable', /(?:^|\.)streamable\.com$/i], ['loom', /(?:^|\.)loom\.com$/i]
];
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

function siteOf(u) {
  let h, p; try { const x = new URL(u); h = x.hostname; p = x.pathname; } catch { return null; }
  if (VIDEO_EXT.test(p)) return 'file';
  for (const [k, re] of SITES) if (re.test(h)) {
    if (k === 'youtube') return youtubeId(u) ? k : null;
    if (k === 'instagram') return /\/(reel|reels|p|tv)\//.test(p) ? k : null;
    if (k === 'tiktok') return /\/video\/|\/v\/|^\/t\//.test(p) || /vm\.tiktok/.test(h) ? k : null;
    if (k === 'x') return /\/status\//.test(p) ? k : null;
    if (k === 'reddit') return /\/comments\//.test(p) || /redd\.it/.test(h) ? k : null;
    if (k === 'facebook') return /\/(videos|watch|reel|share\/v)\b/.test(p) || /fb\.watch/.test(h) ? k : null;
    return k;
  }
  return null;
}
function youtubeId(u) {
  try {
    const x = new URL(u);
    if (/youtu\.be$/i.test(x.hostname)) return x.pathname.slice(1).split('/')[0] || null;
    if (x.searchParams.get('v')) return x.searchParams.get('v');
    const m = x.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{6,})/); return m ? m[1] : null;
  } catch { return null; }
}
const videoLinks = text => [...new Set(String(text || '').match(URL_RE) || [])].map(u => u.replace(/[.,;:!?]+$/, '')).filter(u => siteOf(u)).slice(0, 3);
const decode = s => String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function meta(html, names) {
  for (const n of names) {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${n}["']`, 'i'));
    if (a && a[1].trim()) return decode(a[1].trim());
  }
  return '';
}
const fmtTime = s => { s = Math.max(0, Math.round(+s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function jsonAfter(html, marker) {   // the JSON object that follows "marker =" in a page
  const i = html.indexOf(marker); if (i < 0) return null;
  let j = html.indexOf('{', i); if (j < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = j; k < html.length && k < j + 3e6; k++) {
    const c = html[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) { try { return JSON.parse(html.slice(j, k + 1)); } catch { return null; } } }
  }
  return null;
}
function transcriptFromJson3(j) {
  const out = []; let last = -60;
  for (const e of j?.events || []) {
    const t = (e.segs || []).map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim(); if (!t) continue;
    const at = (e.tStartMs || 0) / 1000;
    out.push((at - last >= 30 ? `[${fmtTime(at)}] ` : '') + t); if (at - last >= 30) last = at;
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}
function transcriptFromXml(xml) {
  const out = []; let last = -60;
  for (const m of String(xml).matchAll(/<text[^>]*start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    const at = +m[1], t = decode(decode(m[2].replace(/<[^>]+>/g, ''))).replace(/\s+/g, ' ').trim(); if (!t) continue;
    out.push((at - last >= 30 ? `[${fmtTime(at)}] ` : '') + t); if (at - last >= 30) last = at;
  }
  return out.join(' ').trim();
}

async function youtube(url, { fetchText, signal }) {
  const id = youtubeId(url), watch = `https://www.youtube.com/watch?v=${id}&hl=en`;
  const v = { kind: 'youtube', url, title: '', author: '', description: '', duration: 0, transcript: '', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  try {
    const page = await fetchText(watch, { timeout: 15000, signal, maxBytes: 4_000_000, headers: { Cookie: 'CONSENT=YES+1' } });
    const pr = jsonAfter(page.text, 'ytInitialPlayerResponse');
    const d = pr?.videoDetails || {};
    Object.assign(v, { title: d.title || meta(page.text, ['og:title', 'title']), author: d.author || '', description: (d.shortDescription || meta(page.text, ['og:description', 'description'])).slice(0, 2500), duration: +d.lengthSeconds || 0 });
    if (d.isLiveContent && !d.lengthSeconds) v.note = 'It is a live stream.';
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    const pick = tracks.find(t => /^en/.test(t.languageCode) && t.kind !== 'asr') || tracks.find(t => /^en/.test(t.languageCode)) || tracks[0];
    if (pick?.baseUrl) {
      try { const r = await fetchText(pick.baseUrl + '&fmt=json3', { timeout: 15000, signal, accept: 'application/json,*/*', maxBytes: 3_000_000 }); v.transcript = transcriptFromJson3(JSON.parse(r.text)); } catch {}
      if (!v.transcript) try { const r = await fetchText(pick.baseUrl, { timeout: 15000, signal, accept: 'text/xml,*/*', maxBytes: 3_000_000 }); v.transcript = transcriptFromXml(r.text); } catch {}
      if (v.transcript && pick.kind === 'asr') v.note = (v.note ? v.note + ' ' : '') + 'The transcript is YouTube\'s automatic captions, so a few words may be wrong.';
    }
  } catch (e) {
    try {   // oEmbed still gives the title and channel when the page itself can't be read
      const r = await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { timeout: 10000, signal, accept: 'application/json' });
      const j = JSON.parse(r.text); v.title = j.title || ''; v.author = j.author_name || '';
    } catch {}
    v.note = 'YouTube didn\'t let Nexus read the page, so only the title is known.';
  }
  if (!v.transcript && !v.note) v.note = 'This video has no captions, so what is said in it isn\'t known; the title, description and thumbnail are.';
  return v;
}

const OEMBED = { tiktok: u => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`, vimeo: u => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`, x: u => `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(u)}`,
  reddit: u => `https://www.reddit.com/oembed?url=${encodeURIComponent(u)}`, dailymotion: u => `https://www.dailymotion.com/services/oembed?url=${encodeURIComponent(u)}`, streamable: u => `https://api.streamable.com/oembed.json?url=${encodeURIComponent(u)}`,
  loom: u => `https://www.loom.com/v1/oembed?url=${encodeURIComponent(u)}` };

async function page(url, kind, { fetchText, signal }) {
  const v = { kind, url, title: '', author: '', description: '', duration: 0, transcript: '', thumb: '', videoUrl: '' };
  if (OEMBED[kind]) try {
    const r = await fetchText(OEMBED[kind](url), { timeout: 10000, signal, accept: 'application/json' });
    const j = JSON.parse(r.text);
    v.title = j.title || ''; v.author = j.author_name || ''; v.thumb = j.thumbnail_url || ''; v.duration = +j.duration || 0;
    if (kind === 'x' && j.html) v.description = decode(String(j.html).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 1500);
  } catch {}
  try {
    const r = await fetchText(kind === 'instagram' ? url.replace(/\?.*$/, '') : url, { timeout: 15000, signal, maxBytes: 3_000_000 });
    const h = r.text;
    v.title = v.title || meta(h, ['og:title', 'twitter:title', 'title']);
    v.description = v.description || meta(h, ['og:description', 'twitter:description', 'description']).slice(0, 2500);
    v.thumb = v.thumb || meta(h, ['og:image', 'og:image:secure_url', 'twitter:image']);
    v.videoUrl = meta(h, ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream']);
    v.duration = v.duration || +meta(h, ['video:duration', 'og:video:duration']) || 0;
    if (!v.author) { const m = v.title.match(/^(.+?) (?:on Instagram|\(@)/); if (m) v.author = m[1]; }
  } catch (e) { if (!v.title) v.note = `${kind === 'instagram' ? 'Instagram' : 'The site'} didn't let Nexus read this page (${String(e.message).slice(0, 60)}).`; }
  if (v.videoUrl && !/^https:\/\//.test(v.videoUrl)) v.videoUrl = '';
  if (kind === 'instagram' && !v.title && !v.description) v.note = 'Instagram only shows this to signed-in people, so Nexus can\'t see it. Download the video and attach it instead, and Nexus can watch it.';
  return v;
}

async function info(url, deps) {
  const kind = siteOf(url); if (!kind) throw new Error('That isn\'t a video link Nexus knows.');
  if (kind === 'file') return { kind, url, title: decodeURIComponent(new URL(url).pathname.split('/').pop()), author: '', description: '', duration: 0, transcript: '', thumb: '', videoUrl: url };
  return kind === 'youtube' ? youtube(url, deps) : page(url, kind, deps);
}

const SITE_NAME = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', vimeo: 'Vimeo', x: 'X', reddit: 'Reddit', facebook: 'Facebook', twitch: 'Twitch', dailymotion: 'Dailymotion', streamable: 'Streamable', loom: 'Loom', file: 'Video file' };
function describe(v, { max = 14000 } = {}) {
  const lines = [`[VIDEO · ${SITE_NAME[v.kind] || 'Video'}] ${v.url}`];
  if (v.title) lines.push(`Title: ${v.title}`);
  if (v.author) lines.push(`Posted by: ${v.author}`);
  if (v.duration) lines.push(`Length: ${fmtTime(v.duration)}`);
  if (v.description) lines.push(`Caption / description: ${v.description}`);
  if (v.frames) lines.push(`${v.frames} still${v.frames === 1 ? '' : 's'} from the video ${v.frames === 1 ? 'is' : 'are'} attached as pictures, in order${v.times?.length ? ` (at ${v.times.map(fmtTime).join(', ')})` : ''}.`);
  else if (v.thumbAttached) lines.push('Its thumbnail is attached as a picture.');
  if (v.transcript) lines.push(`What's said in it${v.transcriptSource ? ` (${v.transcriptSource})` : ''}:\n${v.transcript.length > max ? v.transcript.slice(0, max) + ' …[the rest is cut]' : v.transcript}`);
  if (v.note) lines.push(`Note: ${v.note}`);
  lines.push('Use this to answer about the video. Say plainly what you could and couldn\'t tell from it; don\'t claim to have watched more than this.');
  return lines.join('\n');
}

module.exports = { siteOf, youtubeId, videoLinks, info, describe, fmtTime, transcriptFromJson3, transcriptFromXml, jsonAfter, VIDEO_EXT, SITE_NAME };
