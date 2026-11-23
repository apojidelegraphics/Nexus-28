// Nexus '28 3.12 — the built-in Nexus guide. Every agent can answer questions about Nexus itself ("where do I turn on
// Hey Nexus?", "what's new?", "why can't I use Paragon?") from what's actually in this app, and can open the right
// Settings page or change a setting for you (that one always asks first, with an approval card).
//   wantsGuide(text)             → is this message about Nexus itself?
//   search(query, { settings, state }) → text for the model: matching settings, features, recent changes, your setup
//   SETTABLE                     → the settings the guide may change, with how to describe and check each one
//   apply(key, value, settings)  → { patch, label } or { error }
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };

// The Settings search list (renderer/settings.js FIND), so the guide always matches what's in the app
let findCache = null;
function settingsIndex() {
  if (findCache) return findCache;
  const src = read('renderer/settings.js');
  const block = src.slice(src.indexOf('const FIND = ['), src.indexOf('const TAB_NAME'));
  const names = { account: 'Account', subscription: 'Subscription', personal: 'Personal', stats: 'Stats', providers: 'Models & keys', personas: 'Agents', axiom: 'Axiom', features: 'Features', voice: 'Voice', training: 'Training', mac: process.platform === 'win32' ? 'PC' : 'Mac', permissions: 'Permissions', connectors: 'Connectors', phone: 'Phone', general: 'General', beta: 'Beta', activity: 'Activity log', terms: 'Terms' };
  findCache = [...block.matchAll(/\['(\w+)',\s*'((?:[^'\\]|\\.)+)',\s*'([^']+)'\]/g)].map(m => ({ tab: m[1], tabName: names[m[1]] || m[1], title: m[2].replace(/\\'/g, "'"), words: m[3] }));
  return findCache;
}

// What each part of Nexus does, in a line or two (kept short so it fits in a prompt)
const FEATURES = [
  ['Agents', 'Flash (fastest, unlimited on the free key), Lyte, Neodela (deep thinker) and Paragon (the agent: uses tools, opens apps, searches the web, reads your calendar). Axiom is the Apex tier for people the Apoji Team allows. Pick one with @name or the agent menu. Old Nexus generations are under Legacy models.', 'flash lyte neodela paragon axiom agent model legacy'],
  ['The free Nexus key', 'Flash, Lyte and Neodela work without any API key on the free Nexus key (free models only), with a daily allowance per agent. Redeeming an aArgon3 / Mexel order removes the limits.', 'free key limit allowance usage'],
  ['Paragon & Axiom key', 'Pro plans get 10 Paragon tasks a day on the Nexus key and Max plans get 25 (one message = one task, whatever steps it takes). Axiom runs on it for people the Apoji Team allowed. Your own API key always wins. See Settings → Subscription.', 'paragon axiom premium pro max key tasks'],
  ['Subscription', 'Settings → Subscription shows each plan you own or were added to: order, status, when it renews, system config, seats, and the people in it. The owner invites people by username or email and can remove them; invitees accept in the same tab.', 'subscription plan renew seats invite people family team'],
  ['@Features', 'Add @seek (web), @cite, @studymode, @cognition, @magyk, @swiftstream, @echo and more to a message to change how the agent answers. Settings → Features lists them and lets you make your own.', 'feature seek cite study'],
  ['Hey Nexus', 'Say "Hey Nexus" to start talking without touching anything. Turn it on in Settings → Voice. On Windows it uses Windows speech recognition on this PC only; if it never hears you, Settings → Voice shows what it last heard and has Copy diagnostics.', 'hey nexus wake word listen'],
  ['Highlight orb', 'Highlight text in any app and a small orb appears: click it to explain, summarize, translate or ask about the text. Settings → Personal → Highlight orb.', 'highlight orb selection selected'],
  ['Quick Ask and Quick Chat', 'Quick Ask (Alt+Space) asks one thing from anywhere; Quick Chat (Alt+Shift+Space) is a small chat window that stays on top. Change the keys in Settings → General.', 'quick ask chat hotkey shortcut'],
  ['Mind map', 'The mind map (map button next to chat search) shows your chats as a Notion-style tree or an Obsidian-style graph. Click a branch to open the chat, right-click to make a study deck.', 'mind map graph tree'],
  ['Study', 'Study mode makes flashcard decks, quizzes and study plans from chats or files, with spaced review and phone reminders.', 'study flashcards deck quiz'],
  ['Spaces and Projects', 'Spaces group chats (auto-sorted if you want); a Project space shares its files and notes with every chat in it.', 'spaces projects folders'],
  ['Routines, Missions and the Morning Brief', 'Routines run a prompt on a schedule, Missions are multi-step jobs, and the Morning Brief summarizes your day. They run while Nexus is open.', 'routine mission morning brief schedule'],
  ['N28C phone app', 'N28C is Nexus on your phone: scan the QR in Settings → Phone. Test Run is the web version for people without the app.', 'phone n28c companion test run'],
  ['Training', 'Settings → Training: share your chats to help train Nexus (personal details removed), see what Nexus learned, and write your own rules every agent follows.', 'training rules learn'],
  ['Connectors', 'Connect MCP servers (Slack, Stripe, Google Maps…) in Settings → Connectors so Paragon can use them.', 'mcp connectors'],
  ['Cirkts', 'Points are now Cirkts, a currency you spend: earn them by chatting, streaks, daily challenges, focus and studying; spend them in Settings → Profile & Cirkts on profile frames, profile themes, app themes, name fonts and colors, banners and orb skins. Your old points became your balance and skins you had stay yours.', 'cirkts points shop buy frame theme font color banner skin balance'],
  ['Profile', 'Settings → Profile & Cirkts: your profile card (picture, frame, name style, banner, bio, status, streak), what you show on it, and the shop. Friends, Spaces and aARgon3 see it.', 'profile card bio status frame banner'],
  ['People and friends', '☰ → People: add friends by username, accept requests, see profiles, invite friends to a Shared Space, block or report.', 'friends people add friend request block invite'],
  ['Spaces chat', 'Study → Shared Spaces → open a Space → Chat: a chat with replies for the Space (only members see it). People shows everyone\'s profile cards. N28C has it too (Chat in a Space).', 'spaces chat space messages group chat'],
  ['Videos', 'Attach a video (drag it in or 📎) and the agent sees stills from it and hears what is said. Paste a YouTube, Instagram, TikTok, Vimeo or X video link and it reads the transcript or caption and the thumbnail. Instagram often needs you to attach the file instead.', 'video youtube instagram tiktok reel watch transcript'],
  ['Clean up chats', 'History → CLEAN UP finds empty, failed, duplicate and old chats so you can delete them in one go (pinned chats are never touched).', 'clean up delete empty chats duplicates tidy'],
  ['Spotify', 'Settings → Connectors → Spotify: make a free Spotify developer app (developer.spotify.com/dashboard, Redirect URI http://127.0.0.1:8765/callback, tick Web API), paste its Client ID and click Connect. Then Paragon (and other agents when you mention music) can say what is playing, search, play, queue, skip, set the volume and make playlists (asks first). Playback control needs Spotify Premium.', 'spotify music song songs playlist play skip queue'],
  ['More connectors', 'Settings → Connectors → Add connector… also has Linear, Asana, Jira & Confluence (they open a sign-in in your browser), Git repo, SQLite, Time zones and Step-by-step thinking.', 'linear asana jira confluence atlassian git sqlite time zones thinking'],
  ['Themes and orb skins', 'Settings → General → Theme (or make your own); orb skins unlock with points in Settings → Stats.', 'theme orb skin color'],
  ['Feedback', 'Send a bug or idea from Settings → General → Feedback; replies from the Apoji Team show up as notifications.', 'feedback bug report'],
  // 3.12
  ['Chat tools', 'Pin a message (pin button under it) to the top of the chat; ⋯ → Summarize this chat puts a summary card at the top; ⌘F finds words in the chat; the Compare button under the last answer asks another agent and shows both side by side.', 'pin summary summarize find search compare'],
  ['Reminders', 'Say "remind me about this tomorrow at 9" (or "remind me to … in 2 hours") in any chat; the chat comes back to the top with a notification. ⋯ → Remind me about this chat, and ☰ → Reminders lists and cancels them.', 'remind reminder later'],
  ['Weekly goals', '☰ → Weekly goals, or say "my goal this week is …". Every agent knows them; unfinished ones can carry into next week.', 'goals weekly plan week'],
  ['Voice notes', 'The sound-wave button next to the microphone records a voice note (up to 5 minutes); the agent gets what you said and you can play it back.', 'voice note record audio'],
  ['Memory per Space', 'In a Space, "remember that …" saves to that Space only; "remember everywhere that …" saves for every chat. Settings → Personal → Memory can move a fact.', 'memory space remember'],
  ['Watch & guide me', 'The ? button → Watch & guide me: say what you want to do, and Nexus looks at your screen every few seconds and tells you the next click, out loud.', 'help guide screen steps click how do i'],
  ['Share to Nexus and the widget', 'N28C → You: a share key for an iPhone Shortcut (share sheet → Share to Nexus; items wait in ☰ → Inbox) and a widget key for the Scriptable home-screen widget.', 'share sheet shortcut inbox widget scriptable'],
  ['Accessibility', 'Settings → General → Accessibility: text size, less motion, more contrast, easier-to-read font, bigger focus rings, underlined links, and the answer confidence meter.', 'accessibility text size contrast motion font'],
  ['Offline queue', 'Offline with no local model, your message waits and sends itself when you are back online (Settings → Models & keys → When you are offline).', 'offline queue internet'],
  ['User guide', 'The full illustrated guide: https://apojidelegraphics.github.io/Nexus-28/guide/ (also the ? button → The user guide).', 'guide manual docs help tutorial'],
  ['Pricing', 'Plans and prices are on the aArgon3 site: https://apojidelegraphics.github.io/aArgon3/', 'price pricing cost buy plan']
];

// Settings the guide may change. Each one: what it is, the type, and (optionally) how to read the current value.
const SETTABLE = {
  wakeWord: { label: '"Hey Nexus"', type: 'bool', tab: 'voice' },
  clipOrb: { label: 'Highlight orb', type: 'bool', tab: 'personal', get: s => s.clipOrb !== false },
  omnibrief: { label: 'OmniBrief short answers', type: 'bool', tab: 'general' },
  hideOnBlur: { label: 'Hide Nexus when you click away', type: 'bool', tab: 'general' },
  openAtLogin: { label: 'Open Nexus when you log in', type: 'bool', tab: 'general' },
  theme: { label: 'Theme', type: 'enum', values: s => ['green', 'arc', 'critical', 'amber', ...(s.customThemes || []).map(t => t.id)], tab: 'general' },
  nickname: { label: 'What Nexus calls you', type: 'text', max: 40, tab: 'personal' },
  activePersona: { label: 'Current agent', type: 'enum', values: (_s, ctx) => ctx.personas || [], tab: 'personas' },
  'web.enabled': { label: 'Web search', type: 'bool', tab: 'connectors' },
  'web.chatAgents': { label: 'Web search for chat agents (not just Paragon)', type: 'bool', tab: 'connectors' },
  'weather.units': { label: 'Weather units', type: 'enum', values: () => ['imperial', 'metric'], tab: 'connectors' },
  'weather.location': { label: 'Weather location', type: 'text', max: 80, tab: 'connectors' },
  'chatSearch.enabled': { label: 'Agents may look through past chats', type: 'bool', tab: 'personal' },
  'clipboard.history': { label: 'Clipboard history', type: 'bool', tab: 'mac' },
  'macActions.enabled': { label: 'App actions (open apps, timers, volume…)', type: 'bool', tab: 'mac' },
  'files.enabled': { label: 'File finder', type: 'bool', tab: 'mac' },
  'screen.enabled': { label: 'Screen awareness (only when you ask)', type: 'bool', tab: 'mac' },
  'handoff.enabled': { label: 'Agent handoff', type: 'bool', tab: 'features' },
  'freeKey.enabled': { label: 'Free Nexus key', type: 'bool', tab: 'providers' },
  'updates.auto': { label: 'Automatic updates', type: 'bool', tab: 'general' },
  'voice.speakChatReplies': { label: 'Speak replies to dictated messages', type: 'bool', tab: 'voice' },
  'voice.conversation': { label: 'Keep talking after "Hey Nexus" (conversation mode)', type: 'bool', tab: 'voice' }
};
const getPath = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);

function apply(key, value, settings, ctx = {}) {
  const def = SETTABLE[key];
  if (!def) return { error: `That setting can't be changed from chat. Settable: ${Object.keys(SETTABLE).join(', ')}. For anything else, open its Settings page.` };
  let v = value;
  if (def.type === 'bool') { v = typeof value === 'string' ? /^(true|on|yes|1|enable)/i.test(value) : !!value; }
  else if (def.type === 'enum') { const ok = def.values(settings, ctx).map(String); v = String(value || '').toLowerCase(); const hit = ok.find(x => x.toLowerCase() === v); if (!hit) return { error: `${def.label} can be: ${ok.join(', ')}.` }; v = hit; }
  else v = String(value ?? '').trim().slice(0, def.max || 80);
  let patch;
  if (key.includes('.')) { const [a, b] = key.split('.'); patch = { [a]: { ...(settings[a] || {}), [b]: v } }; }
  else patch = { [key]: v };
  const shown = def.type === 'bool' ? (v ? 'On' : 'Off') : (v === '' ? '(empty)' : v);
  return { patch, label: `${def.label} → ${shown}`, key, value: v, tab: def.tab };
}

const words = t => String(t || '').toLowerCase().replace(/[^a-z0-9@\s'-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'how', 'can', 'what', 'where', 'why', 'does', 'for', 'you', 'nexus', 'with', 'this', 'that', 'turn', 'use', 'get', 'make', 'want', 'from', 'are', 'there', 'way', 'don\'t', 'not', 'into']);
function score(q, ...fields) { const t = ' ' + fields.join(' ').toLowerCase().replace(/[^a-z0-9@'-]+/g, ' ') + ' '; return q.reduce((n, w) => n + (t.includes(' ' + w) ? (w.length > 4 ? 2 : 1) : 0), 0); }

function recentChanges(n = 4) {
  try { return JSON.parse(read('docs/whats-new/changes.json')).slice(0, n); } catch { return []; }
}

// Is a message about Nexus itself? (then every agent gets the guide tools and a short note)
function wantsGuide(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  if (/\b(nexus|n28c|test run|settings?|preferences)\b/.test(t) && /\b(how|where|what|why|can|turn|switch|enable|disable|change|set|open|find|does|is|new|update)\b/.test(t)) return true;
  if (/\b(paragon|axiom)\b.{0,40}\b(tasks?|key|limit|plan|pro|max|left)\b/.test(t)) return true;
  if (/\b(hey nexus|highlight orb|free (nexus )?key|api key|subscription|my plan|seats?|invite|renew|redeem|@\w+ feature|what'?s new|changelog|release notes|shortcut|hotkey|orb skin|mind ?map|routines?|morning brief|quick (ask|chat))\b/.test(t)) return true;
  return /\b(turn (on|off)|switch (on|off)|enable|disable)\b.{0,30}\b(web search|clipboard|dark|theme|handoff|omnibrief|read aloud|wake|orb|updates?)\b/.test(t);
}

// The answer the model gets from the nexus_guide tool
function search(query, { settings = {}, state = {} } = {}) {
  const q = words(query);
  const idx = settingsIndex().map(x => ({ ...x, s: score(q, x.title, x.words, x.tabName) })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 6);
  const feats = FEATURES.map(([name, text, kw]) => ({ name, text, s: score(q, name, kw, text) })).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 4);
  const wantNew = /new|changed|update|release|version|latest/.test(String(query).toLowerCase());
  const ch = recentChanges(wantNew ? 3 : 1);
  const out = [];
  if (idx.length) out.push('Settings that match (tab → item):\n' + idx.map(x => `- Settings → ${x.tabName} → ${x.title}  [open_settings tab="${x.tab}"]`).join('\n'));
  if (feats.length) out.push('About these parts of Nexus:\n' + feats.map(f => `- ${f.name}: ${f.text}`).join('\n'));
  if (wantNew || !out.length) out.push('Recent versions:\n' + ch.map(c => `- ${c.version} (${c.date}) ${c.title}: ${(c.highlights || []).slice(0, wantNew ? 9 : 4).map(h => h.replace(/^[^\w"“(]+/u, '')).join(' | ')}`).join('\n'));
  // this person's setup, so "why isn't X working" gets a real answer
  const on = k => { const d = SETTABLE[k]; const v = d?.get ? d.get(settings) : getPath(settings, k); return v ? 'on' : 'off'; };
  const setup = [`Nexus ${state.version || ''} on ${process.platform === 'win32' ? 'Windows' : 'macOS'}`,
    `signed in: ${state.signedIn ? 'yes' : 'no'}`, state.plan ? `plan: ${state.plan}` : '', state.paragon ? `Paragon on the Nexus key: ${state.paragon}` : '',
    `Hey Nexus: ${on('wakeWord')}${state.wake ? ' (' + state.wake + ')' : ''}`, `Highlight orb: ${on('clipOrb')}${state.orb ? ' (' + state.orb + ')' : ''}`,
    `web search: ${on('web.enabled')}`, `free Nexus key: ${on('freeKey.enabled')}`, `theme: ${settings.theme || 'green'}`,
    `keys set for: ${(state.keys || []).join(', ') || 'none'}`].filter(Boolean).join('; ');
  out.push('This person\'s setup: ' + setup);
  out.push('You can open a Settings page with open_settings, or change one of these with change_setting (the user approves it first): ' + Object.entries(SETTABLE).map(([k, d]) => `${k} (${d.label})`).join(', ') + '.');
  return out.join('\n\n');
}

const NOTE = `\n\n[NEXUS GUIDE] This message is about Nexus itself. Call nexus_guide first and answer from what it returns: name the exact place (Settings → Tab → item). Never invent menus or features. If the user wants something changed, offer to do it and use change_setting (they approve it), or open_settings to show them. Keep it short.`;

const TOOL_DEFS = {
  nexus_guide: { description: 'Look up how Nexus (this app) works: where a setting is, what a feature does, what changed in recent versions, and this user\'s current setup. Use for any question about Nexus itself.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'What the user wants to know, in a few words' } }, required: ['query'] } },
  open_settings: { description: 'Open a page of Nexus Settings for the user (e.g. tab "voice").', parameters: { type: 'object', properties: { tab: { type: 'string', enum: ['account', 'subscription', 'personal', 'stats', 'providers', 'personas', 'features', 'voice', 'training', 'mac', 'permissions', 'connectors', 'phone', 'general', 'beta', 'activity', 'terms'] } }, required: ['tab'] } },
  change_setting: { description: 'Change one Nexus setting for the user. The user sees an approval card first. Only the keys nexus_guide lists.', parameters: { type: 'object', properties: { key: { type: 'string', enum: Object.keys(SETTABLE) }, value: { type: 'string', description: 'New value: true/false, or the text / option' } }, required: ['key', 'value'] }, confirm: true }
};

module.exports = { wantsGuide, search, apply, SETTABLE, FEATURES, TOOL_DEFS, NOTE, settingsIndex };
