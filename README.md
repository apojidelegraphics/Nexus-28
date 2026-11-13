# Nexus '28

Menu-bar AI command center for the Nexus '28 agents, by Apoji_Delegraphics. **v1.0**

<p align="center"><img src="assets/icon.png" width="128" alt="Nexus '28"></p>

## Install (no paid signing)

Download the DMG for your Mac (Apple silicon = `arm64`, Intel = `x64`) from
[Releases](https://github.com/apojidelegraphics/Nexus-28/releases/latest), drag **Nexus '28** to Applications, then run once:

```bash
xattr -cr "/Applications/Nexus '28.app"
codesign --force --deep --sign - "/Applications/Nexus '28.app"
```

From source, one command builds, installs, signs ad-hoc and opens it:

```bash
npm install
npm run install-app
```

## Run it

```bash
xcode-select --install   # once — builds the on-device helper (speech, Apple Intelligence, Calendar, Reminders)
npm install              # installs deps + builds bin/nexuscore on macOS
npm start                # menu bar + chat
npm test                 # provider, access, voice, agent, cloud tests (no keys needed)
npm run smoke            # boots the real app against mocks (Linux: xvfb-run)
npm run build:helper     # rebuild the Swift helper by itself
npm run dist             # dist/Nexus-28-<version>-<arch>.dmg / .zip (ad-hoc, unsigned)
```

## Three ways in

| | Default key | What |
|---|---|---|
| **Chat** | Click the hexagon in the menu bar, or ⌘⇧N | Full window: chat history on the left, agent picker top right, settings. |
| **Quick Chat** | ⌥⇧Space | Small typing bar. Drag it anywhere; it remembers the spot. ⌘O opens the full chat. |
| **Quick Ask** | ⌥Space | Siri-style voice orb. Talk, pause, it answers out loud. Press again to interrupt. |

Say **"Hey Nexus"** to open Quick Ask hands-free (Settings → Voice; off by default, runs on-device).
All three share the same conversation. Every hotkey can be changed in Settings → General.

### Voice commands
Say **"goodbye"**, **"bye"**, **"sleep"** or **"thank you"** on its own to end a voice session.
Inside a longer sentence ("thank you, what's the weather?") they're treated as a normal request.
"Hey Flash…" / "Neodela, …" switches agents. When Paragon needs approval, answer "yes" or "no".

### Chat keys
Enter send · ⌘N new chat · ⌘1–⌘4 agent · ⌘B OmniBrief · ⌘D dictate · ⌘, settings · Esc stop/close

## Agents

| Agent | Color | Access |
|---|---|---|
| Paragon | cyan | **Agent**: web search, page reading, Apple Calendar/Reminders, MCP connectors |
| Neodela | violet | Chat only (optionally read-only web search) |
| Lyte | green | Chat only |
| Flash | gold | Chat only |

**OmniBrief** (chip above the input, ⌘B) makes every agent lead with a 1–3 sentence answer.

## What you see while it works
- A live status line: *Connecting to Claude* → *Searching the web · query* → *Reading page · site* → writing.
- Activity chips on each reply (what tools ran, results, declines, errors).
- **Approval cards** before anything that creates, sends, changes or deletes (Approve / Deny).
- Images (inline and from search), source chips, and link previews under replies.
- 🔊 **Read aloud** and copy buttons on every reply (chat and Quick Chat).
- Settings → **Activity** keeps a log of every tool Paragon used.

## Connectors (Settings → Connectors)
- **Web search**: DuckDuckGo (no key), Tavily (best, includes images), or Brave. Pages are read in the app;
  local-network addresses are blocked.
- **Apple Calendar & Reminders**: through the NexusCore helper. macOS asks for access on first use.
- **MCP connectors**: presets for Google Workspace (Gmail/Calendar/Drive/Docs/Sheets), Gmail, Notion, GitHub, Files,
  or any custom MCP server (local command or remote URL). Tokens/env vars are stored encrypted in the Keychain.
  Actions that change things ask first (toggle per connector).

## Free Nexus key & chat limits
No API key? Nexus uses the shared Nexus OpenRouter key (fetched from the Nexus cloud at runtime, never stored on disk)
with the same limits as the web Nexus:

| Tier | Models | Free-key chats |
|---|---|---|
| **Ultra** | Paragon | Not on the free key. Use your own key, or a local model (chat only, no agent tools) |
| **Best** | Neodela + legacy models | 28 per model |
| **Standard** | Lyte, Lyte -27, Lyte -2.6 | 95 per model |
| **Base** | Flash | Unlimited |

Your own API keys, local models (Ollama, LM Studio, Apple Foundation Models) and comped accounts have no limits.
Signed in, counts sync with the web; as a guest they're kept on this Mac. Toggle it in Settings → Providers.

## Redeem aARgon3 / Mexel orders
Settings → Account → **Redeem**: enter your order number (e.g. `MRH33QFL-RA6C`). Nexus checks the order in the
aARgon3 & Mexel store, records the redemption on your Nexus account, and every model in that order becomes
unlimited on the free key. Each order can be redeemed on one account. Requires sign-in.

## Updates
Nexus checks GitHub Releases at launch and every 6 hours (Settings → General → Updates, or the menu-bar menu).
When a newer version exists you get a notification and a banner with **Download**. It never installs anything by itself.

## Nexus account & cloud sync
- Agent prompts (Paragon, Neodela, Lyte, Flash) sync from your Supabase `assistant_prompts` table
  (rows named "Nexus 28 …"), cached for offline use, re-checked every 10 minutes or via Settings → Account → Sync now.
- Optional sign-in with your web Nexus account: shows your username and BETA/COMPED status. The session token is
  stored encrypted in the Keychain.
- Active announcements and maintenance notices from the web Nexus appear as banners in the chat.

## Legacy models & @features
- The agent menu (top right) has **Legacy models**: every older Nexus model in Supabase (Dahrk, Armerad, Denali,
  Sonoma, Myst, Hailos…). They're chat-only and share one backend (Settings → Agents → Legacy models). Mention them
  with @armerad, @hailos92o, etc.
- **@Features** from the classic Nexus — @Seek, @Cognition, @Integrate, @Knowledge, @Envision, @Synergy, @Echo,
  @QuantumThread, @AuraSync, @NexusForge, @Magyk, @LogicLattice, @InsightPulse, @ClarityLens, @FortressLens,
  @Proactix, @MultiVerseImmersive, @Monolog, @StudyMode, @CodeComplex, @OmniBrief, @SwiftStream, and Paragon's
  @CommandCore / @CommandGrid / @VoxLink. Each agent only gets the features listed for it in Supabase.
  @Seek searches the web for that message; @Echo pulls in your recent chats. Features taken offline with
  feature-level maintenance on the web are skipped.

## Account
Settings → Account: sign in, create an account, reset password, change username / email / password, see web usage,
redeemed orders and account status.

## More connectors
- **Weather** (Open-Meteo, free, no key): set a default location in Settings → Connectors. Replies include a weather card.
- **Supabase** (MCP preset): official server, read-only by default, pointed at your Nexus project. Needs a personal
  access token from supabase.com/dashboard/account/tokens.

## Read aloud
The 🔊 button uses your Mac's System Voice. Set it to a Siri voice in System Settings → Accessibility → Spoken Content
(Settings → Voice has a button that opens it). Replies also render markdown tables.

## Providers
Claude, ChatGPT, Gemini, DeepSeek, OpenRouter · Ollama, LM Studio (local) · Apple Foundation Models (on-device, no tools).
If a local model can't call tools, Nexus answers without them and says so.

## Layout
```
main.js               windows, hotkeys, IPC (chat/agent, conversations, connectors, voice)
src/providers.js      streaming + tool calling for every backend
src/agent.js          agent loop (tools, approvals, activity)
src/tools.js          built-in tools + routing to MCP
src/web.js            search, page reading, link previews, private-network guard
src/mcp.js            MCP client manager + presets
src/conversations.js  chat history
src/personas.js       Nexus '28 prompts, Paragon-only gating, OmniBrief
src/access.js         tiers, free-key limits, order entitlements
src/cloud.js          Nexus + aARgon3/Mexel Supabase (prompts, account, usage, redemptions)
src/updater.js        GitHub release checker
src/voice.js          helper process, macOS say, ElevenLabs/OpenAI speech
src/store.js          settings, Keychain keys/secrets, action log
native/               NexusCore.swift (speech, "Hey Nexus", Foundation Models, EventKit)
renderer/             index.html/hud.js/settings.js (chat), quickchat.*, quick.* (voice orb), chatview.* (shared)
test/                 unit tests, fake helper, fake say, test MCP server, Electron smoke test (npm run smoke)
```

## License
© 2026 Apoji_Delegraphics. All rights reserved.
