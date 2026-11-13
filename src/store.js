// Settings (plain JSON) + API keys (encrypted with Electron safeStorage → macOS Keychain) + shared history.
// Keys never leave the main process; renderers only learn whether a key is set.
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { PERSONAS } = require('./personas');

const SETTINGS_VERSION = 3;
const dir = () => app.getPath('userData');
const settingsFile = () => path.join(dir(), 'settings.json');
const keysFile = () => path.join(dir(), 'keys.json');

const VOICE_DEFAULTS = {
  stt: 'apple',                  // apple | openai | elevenlabs
  tts: 'system',                 // system | elevenlabs | openai
  systemVoice: '',               // '' = macOS System Voice (Siri if selected in System Settings)
  rate: 0,                       // say -r words/min; 0 = default
  elevenVoice: 'JBFqnCBsd6RMkjVDRZzb', // George
  openaiVoice: 'alloy',
  continueConversation: false,
  speakChatReplies: true,        // speak HUD replies when the message was dictated
  readAloud: 'system'            // read-aloud button: 'system' = macOS System Voice (Siri) | 'reply' = same as voice replies
};

const DEFAULTS = {
  settingsVersion: SETTINGS_VERSION,
  theme: 'green',                // green | arc | critical | amber
  hotkeyToggle: 'CommandOrControl+Shift+N',
  hotkeyQuick: 'Alt+Space',
  hotkeyQuickChat: 'Alt+Shift+Space',
  hotkeyScreen: 'Alt+Shift+S',     // look at the front window → Quick Chat
  quickChatPos: null,            // { x, y } — remembered when you drag Quick Chat
  quickChatConv: '',             // the chat Quick Chat types to ('' = new chat)
  omnibrief: false,              // OmniBrief short-answer mode for every agent
  hideOnBlur: true,
  activePersona: 'paragon',
  baseUrls: {},
  bindings: Object.fromEntries(PERSONAS.map(p => [p.id, { ...p.defaultBinding }])),
  voice: VOICE_DEFAULTS,
  web: { enabled: true, provider: 'duckduckgo', chatAgents: false },
  apple: { calendar: false, reminders: false },
  weather: { enabled: true, location: '', units: 'imperial' },
  dismissedAnnouncements: [],
  legacyBinding: { provider: 'openrouter', model: '' }, // backend for all legacy models
  freeKey: { enabled: true, model: 'openrouter/free', models: [] },  // free Nexus key: free OpenRouter models only
  wakeWord: false,               // "Hey Nexus"
  screen: { enabled: true },     // screen awareness (only ever on request)
  chatSearch: { enabled: true }, // agents may look through past chats when you refer to them
  nickname: '',                  // what agents and greetings call you
  openAtLogin: false,
  updates: { auto: true, skip: '' },
  connectors: []                 // MCP: [{ id, name, type, command, args, url, enabled, confirmWrites, preset }]
};

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function migrate(s) {
  const v = s.settingsVersion || 1;
  if (v < 2) s.theme = 'green';          // green became the default theme
  s.settingsVersion = SETTINGS_VERSION;
  return s;
}

function getSettings() {
  const raw = readJSON(settingsFile(), null);
  const s = raw ? migrate(raw) : {};
  return {
    ...DEFAULTS, ...s,
    baseUrls: { ...DEFAULTS.baseUrls, ...(s.baseUrls || {}) },
    bindings: { ...DEFAULTS.bindings, ...(s.bindings || {}) },
    voice: { ...VOICE_DEFAULTS, ...(s.voice || {}) },
    web: { ...DEFAULTS.web, ...(s.web || {}) },
    apple: { ...DEFAULTS.apple, ...(s.apple || {}) },
    weather: { ...DEFAULTS.weather, ...(s.weather || {}) },
    freeKey: { ...DEFAULTS.freeKey, ...(s.freeKey || {}) },
    updates: { ...DEFAULTS.updates, ...(s.updates || {}) },
    screen: { ...DEFAULTS.screen, ...(s.screen || {}) },
    chatSearch: { ...DEFAULTS.chatSearch, ...(s.chatSearch || {}) },
    connectors: Array.isArray(s.connectors) ? s.connectors : []
  };
}
function setSettings(patch) {
  const cur = getSettings();
  const next = { ...cur, ...patch };
  for (const k of ['voice', 'web', 'apple', 'weather', 'freeKey', 'updates', 'screen', 'chatSearch']) if (patch[k]) next[k] = { ...cur[k], ...patch[k] };
  writeJSON(settingsFile(), next);
  return next;
}

function loadKeys() { return readJSON(keysFile(), {}); }
function setKey(provider, plain) {
  const keys = loadKeys();
  if (!plain) delete keys[provider];
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage (Keychain) is unavailable.');
    keys[provider] = safeStorage.encryptString(plain).toString('base64');
  }
  writeJSON(keysFile(), keys);
}
function getKey(provider) {
  const enc = loadKeys()[provider];
  if (!enc) return '';
  try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch { return ''; }
}
function keyStatus() {
  return Object.fromEntries(Object.keys(loadKeys()).filter(k => !k.startsWith('secret:') && !k.startsWith('nexus:')).map(k => [k, true]));
}

// Secret JSON blobs (MCP env vars / headers) live encrypted alongside API keys.
function setSecretJSON(name, obj) { setKey('secret:' + name, obj && Object.keys(obj).length ? JSON.stringify(obj) : ''); }
function getSecretJSON(name) { try { return JSON.parse(getKey('secret:' + name) || '{}'); } catch { return {}; } }

// Action log (append-only, last 500 kept on read).
const actionsFile = () => path.join(dir(), 'actions.jsonl');
function logAction(entry) {
  try { fs.appendFileSync(actionsFile(), JSON.stringify({ ts: Date.now(), ...entry }) + '\n'); } catch {}
}
function listActions(limit = 200) {
  try { return fs.readFileSync(actionsFile(), 'utf8').trim().split('\n').slice(-limit).map(l => JSON.parse(l)).reverse(); } catch { return []; }
}
function clearActions() { try { fs.writeFileSync(actionsFile(), ''); } catch {} }

module.exports = { getSettings, setSettings, setKey, getKey, keyStatus, setSecretJSON, getSecretJSON, logAction, listActions, clearActions, VOICE_DEFAULTS, dir };
