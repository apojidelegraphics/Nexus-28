// Clipboard history: the last 50 things you copied (text only), kept in memory on this Mac — never saved
// to disk, never sent anywhere unless you pick one. Password managers mark secrets as "concealed"; those are skipped.
const CONCEALED = ['org.nspasteboard.ConcealedType', 'org.nspasteboard.TransientType', 'com.agilebits.onepassword', 'de.petermaurer.TransientPasteboardType'];
const MAX_ITEMS = 50, MAX_CHARS = 20000;

function createClipHistory({ clipboard, interval = 1000, enabled = () => true, onChange = () => {}, now = () => Date.now(), setInterval: si = setInterval, clearInterval: ci = clearInterval }) {
  let items = [], last = null, timer = null, muteUntil = 0, busy = false;
  // Newer Electron returns Promises from the clipboard API; older returns values. Handle both.
  // Never let a stuck clipboard call freeze polling.
  const within = (p, ms = 700) => Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error('clipboard timeout')), ms))]);
  const read = async () => { try { const t = await within(clipboard.readText()); return typeof t === 'string' ? t : ''; } catch { return null; } };
  // (clipboard.has, not availableFormats: the latter can block on some systems.)
  const concealed = async () => {
    for (const t of CONCEALED) { try { if (await within(clipboard.has?.(t), 400)) return true; } catch {} }
    return false;
  };
  async function poll() {
    if (!enabled() || busy) return;
    busy = true;
    try { await check(); } finally { busy = false; }
  }
  async function check() {
    const text = await read();
    if (text === null || text === last) return;
    last = text;
    if (now() < muteUntil) return;            // Nexus's own copy (e.g. reading a selection)
    if (!text.trim() || await concealed()) return;
    const t = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
    items = [{ id: 'c' + now().toString(36) + Math.random().toString(36).slice(2, 5), text: t, at: now(), chars: text.length }, ...items.filter(i => i.text !== t)].slice(0, MAX_ITEMS);
    onChange(list());
  }
  const list = () => items.map(({ id, text, at, chars }) => ({ id, text, at, chars }));
  return {
    async start() { if (!timer) { last = await read(); timer = si(poll, interval); } },
    stop() { ci(timer); timer = null; },
    poll, list,
    get: id => items.find(i => i.id === id) || null,
    remove(id) { items = items.filter(i => i.id !== id); onChange(list()); },
    clear() { items = []; onChange(list()); },
    // Ignore clipboard changes for a moment (Nexus copying the selection for "Explain this").
    mute(ms = 1500) { muteUntil = now() + ms; },
    unmute() { muteUntil = 0; },
    // Re-read the clipboard after a mute so Nexus's own copy isn't recorded later either.
    async resync() { const t = await read(); if (t !== null) last = t; }
  };
}

// For the clipboard_history tool: newest first, numbered, clipped.
function formatHistory(list, { limit = 15, query = '' } = {}) {
  const q = String(query || '').toLowerCase();
  const rows = (q ? list.filter(i => i.text.toLowerCase().includes(q)) : list).slice(0, limit);
  if (!rows.length) return q ? `Nothing in the clipboard history matches "${query}".` : 'The clipboard history is empty.';
  const ago = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
  return rows.map((i, n) => `${n + 1}. (${ago(i.at)}) ${i.text.length > 1200 ? i.text.slice(0, 1200) + '…' : i.text}`).join('\n\n');
}

module.exports = { createClipHistory, formatHistory, CONCEALED, MAX_ITEMS };
