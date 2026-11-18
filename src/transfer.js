// Move to another computer (v3.6): everything Nexus keeps on this computer, packed into one file, so a new Mac or PC
// (or the same person on Windows and a Mac) picks up where you left off: chats and Spaces, study decks, memory, Write
// docs, routines, citations, stats and achievements, Axiom's dossier, your settings and picture attachments.
// Not included: API keys (they're locked to this computer's Keychain / Windows' encrypted storage; add them again).
//   pack({ dir, settings, platform }) → Buffer (gzip JSON)       unpack(buf) → bundle
//   apply({ dir, bundle, currentSettings, platform }) → { settings, counts } — merges, never deletes what's already here
// Through your Nexus account the file goes to a private storage folder only you can read (nexus-transfers/<you>/).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FILES = ['conversations.json', 'study.json', 'memory.json', 'docs.json', 'metrics.json', 'routines.json', 'citations.json', 'axiom.json', 'operations.json'];
const ATTACH_LIMIT = 40 * 1024 * 1024;            // pictures and files that chats point to, up to 40 MB
// Settings that belong to one computer or one OS, and never travel
const LOCAL_SETTINGS = ['hotkeyToggle', 'hotkeyQuick', 'hotkeyQuickChat', 'hotkeyScreen', 'hotkeyExplain', 'updates', 'openAtLogin', 'baseUrls', 'awake', 'orbMutedApps', 'phone'];

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };

function pack({ dir, settings = {}, platform = process.platform, version = '' } = {}) {
  const files = {};
  for (const f of FILES) { const v = readJson(path.join(dir, f)); if (v !== undefined) files[f] = v; }
  const attachments = {};
  let total = 0;
  const adir = path.join(dir, 'attachments');
  try {
    const list = fs.readdirSync(adir).map(n => ({ n, st: fs.statSync(path.join(adir, n)) })).filter(x => x.st.isFile()).sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    for (const { n, st } of list) { if (total + st.size > ATTACH_LIMIT) continue; attachments[n] = fs.readFileSync(path.join(adir, n)).toString('base64'); total += st.size; }
  } catch {}
  const set = { ...settings }; for (const k of LOCAL_SETTINGS) delete set[k];
  const bundle = { format: 'nexus-transfer', v: 1, from: platform, version, at: Date.now(), files, settings: set, attachments };
  return zlib.gzipSync(Buffer.from(JSON.stringify(bundle)));
}
function unpack(buf) {
  let txt; try { txt = zlib.gunzipSync(buf).toString('utf8'); } catch { txt = Buffer.from(buf).toString('utf8'); }
  const b = JSON.parse(txt);
  if (b?.format !== 'nexus-transfer') throw new Error("That isn't a Nexus transfer file.");
  return b;
}
const stamp = o => +(o?.updated || o?.updatedAt || o?.updated_at || o?.ts || o?.created || 0) || 0;
// Merge two values from the same file: lists of things with ids are joined (the newer copy of each wins); anything
// else keeps what's already on this computer unless it's empty here.
function merge(local, incoming) {
  if (local === undefined || local === null) return incoming;
  if (Array.isArray(local) && Array.isArray(incoming)) {
    const keyed = local.concat(incoming).every(x => x && typeof x === 'object' && (x.id !== undefined));
    if (!keyed) return local.length ? local : incoming;
    const by = new Map();
    for (const x of local) by.set(String(x.id), x);
    for (const x of incoming) { const k = String(x.id), have = by.get(k); if (!have || stamp(x) > stamp(have)) by.set(k, have && typeof have === 'object' ? { ...have, ...x } : x); }
    return [...by.values()];
  }
  if (local && incoming && typeof local === 'object' && typeof incoming === 'object' && !Array.isArray(local)) {
    const out = { ...local };
    for (const [k, v] of Object.entries(incoming)) out[k] = k in local ? merge(local[k], v) : v;
    return out;
  }
  return local;
}
function countOf(files) {
  const c = files['conversations.json'], s = files['study.json'];
  return { chats: c?.list?.length || 0, spaces: c?.spaces?.length || 0, decks: s?.decks?.length || 0, docs: files['docs.json']?.docs?.length ?? (Array.isArray(files['docs.json']) ? files['docs.json'].length : 0) };
}
function apply({ dir, bundle, currentSettings = {}, platform = process.platform } = {}) {
  const before = {};
  for (const f of FILES) before[f] = readJson(path.join(dir, f));
  for (const [f, v] of Object.entries(bundle.files || {})) {
    if (!FILES.includes(f)) continue;
    const merged = merge(before[f], v);
    fs.writeFileSync(path.join(dir, f), JSON.stringify(merged));
  }
  const adir = path.join(dir, 'attachments'); fs.mkdirSync(adir, { recursive: true });
  let pics = 0;
  for (const [n, b64] of Object.entries(bundle.attachments || {})) {
    if (/[\\/]|^\.\.?$/.test(n)) continue;   // a plain file name only
    const p = path.join(adir, n); if (!fs.existsSync(p)) { fs.writeFileSync(p, Buffer.from(b64, 'base64')); pics++; }
  }
  // settings: theirs fill in, yours stay (and nothing that belongs to one computer comes across)
  const inc = { ...(bundle.settings || {}) }; for (const k of LOCAL_SETTINGS) delete inc[k];
  if (bundle.from !== platform && inc.voice) { inc.voice = { ...inc.voice }; delete inc.voice.systemVoice; delete inc.voice.agentVoices; }   // Mac voice names don't exist on Windows (and back)
  const settings = merge(currentSettings, inc);
  for (const [k, v] of Object.entries(inc)) if (['theme', 'customThemes', 'nickname', 'customFeatures', 'customAgents', 'missionTemplates', 'orbSkin', 'activePersona', 'onboarded'].includes(k)) settings[k] = v;
  const after = {}; for (const f of FILES) after[f] = readJson(path.join(dir, f));
  const a = countOf(after), b = countOf(Object.fromEntries(FILES.map(f => [f, before[f]])));
  return { settings, counts: { chats: a.chats - b.chats, spaces: a.spaces - b.spaces, decks: a.decks - b.decks, files: pics }, from: bundle.from, at: bundle.at };
}

module.exports = { pack, unpack, apply, merge, FILES, LOCAL_SETTINGS };
