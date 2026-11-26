// Narrow bridge between the Nexus windows (HUD, Quick Ask, Quick Chat) and the main process.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = channel => cb => ipcRenderer.on(channel, (_e, d) => cb(d));
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('nexus', {
  init: () => call('app:init'),
  setSettings: patch => call('settings:set', patch),
  setKey: (provider, key) => call('keys:set', { provider, key }),
  refreshCloud: () => call('cloud:refreshAll'),
  // 4.0
  cirkts: { state: () => call('cirkts:state'), sync: () => call('cirkts:sync'), buy: id => call('cirkts:buy', id), equip: p => call('cirkts:equip', p), banner: b => call('cirkts:banner', b), presence: st => call('cirkts:presence', st), buyPack: id => call('cirkts:buyPack', id), usePack: id => call('cirkts:usePack', id), custom: c => call('cirkts:custom', c), mineUpload: b => call('cirkts:mineUpload', b), mineUploads: () => call('cirkts:mineUploads'), mineRemove: k => call('cirkts:mineRemove', k), onChange: on('cirkts:changed') },
  social: { friends: () => call('social:friends'), request: u => call('social:request', u), respond: (id, yes) => call('social:respond', { id, yes }), remove: id => call('social:remove', id), block: (id, on = true) => call('social:block', { id, on }),
    card: u => call('social:card', u), invites: () => call('social:invites'), inviteRespond: (space, yes) => call('social:inviteRespond', { space, yes }), invite: (space, user) => call('social:invite', { space, user }), people: space => call('social:people', space),
    report: r => call('social:report', r), linkCode: () => call('social:linkCode'), search: q => call('apoji:search', q), visit: id => call('social:visit', id), visitors: d => call('social:visitors', d) },
  spaceChat: { list: (id, o = {}) => call('spacechat:list', { id, ...o }), send: (id, body, replyTo) => call('spacechat:send', { id, body, replyTo }), edit: (msgId, body) => call('spacechat:edit', { msgId, body }), remove: msgId => call('spacechat:remove', msgId) },
  spotify: { status: () => call('spotify:status'), connect: id => call('spotify:connect', id), disconnect: () => call('spotify:disconnect'), enable: on => call('spotify:enable', on), test: () => call('spotify:test') },
  listModels: provider => call('models:list', { provider }),

  conv: {
    backlinks: id => call('conv:backlinks', id),   // 3.10
    busy: () => call('convos:busy'), onBusy: on('convos:busy'),
    state: () => call('conv:state'),
    branch: (id, ts) => call('conv:branch', { id, ts }),   // 3.7 beta
    append: (msg, convId) => call('conv:append', msg, convId),
    get: id => call('conv:get', id),
    addVersion: (convId, msg) => call('conv:addVersion', { convId, msg }),
    setVersion: (convId, index) => call('conv:setVersion', { convId, index }),
    create: spaceId => call('conv:new', { spaceId }),
    newChat: opts => call('conv:new', opts || {}),   // 3.7: { incognito: true }
    move: (convId, spaceId) => call('conv:move', { convId, spaceId }),
    setLinks: (convId, links) => call('conv:links', { convId, links }),
    open: id => call('open:conv', id),
    select: id => call('conv:select', id),
    remove: id => call('conv:delete', id),
    editMessage: (convId, ts, content, truncate) => call('conv:editMessage', { convId, ts, content, truncate }),
    deleteMessage: (convId, ts) => call('conv:deleteMessage', { convId, ts }),
    rename: (id, title) => call('conv:rename', { id, title }),
    pin: (id, on) => call('conv:pin', { id, on }),
    pinMessage: (convId, ts, on) => call('conv:pinMessage', { convId, ts, on }),   // 3.12
    summarize: convId => call('conv:summarize', { convId }), clearSummary: convId => call('conv:clearSummary', { convId }),
    clearAll: () => call('conv:clearAll'),
    cleanup: () => call('conv:cleanup'), deleteMany: ids => call('conv:deleteMany', ids),
    patchWidget: (convId, ts, key, value) => call('conv:patchWidget', { convId, ts, key, value }),
    onChange: on('conv:changed')
  },

  send: (requestId, personaId, messages, voice, features, convId) => call('chat:send', { requestId, personaId, messages, voice, features, convId }),
  onPersonas: on('personas:changed'),
  onNewModels: on('releases:new'),   // 3.11
  access: { state: () => call('access:state'), onChange: on('access:changed') },
  freeModels: () => call('freekey:models'),
  spend: { summary: () => call('spend:summary'), reset: () => call('spend:reset') },   // 3.7 beta
  onSecondLook: on('chat:secondlook'),
  chatSync: { state: () => call('chatsync:state'), set: on => call('chatsync:set', on) },   // 3.7
  transfer: { info: () => call('transfer:info'), upload: o => call('transfer:upload', o), download: o => call('transfer:download', o), exportFile: o => call('transfer:export', o), importFile: o => call('transfer:import', o) },   // v3.6 (3.7: o.passcode brings keys)
  update: { state: () => call('update:state'), check: () => call('update:check'), open: () => call('update:open'), skip: v => call('update:skip', v), onChange: on('update:state') },
  wake: { status: () => call('wake:status'), set: on => call('wake:set', on), onChange: on('wake:status'), check: (audio, seconds) => call('wake:check', { audio, seconds }) },   // 3.13: check (Windows Hey Nexus)
  files: {
    pick: () => call('files:pick'),
    add: files => call('files:add', [...files].map(f => webUtils.getPathForFile(f)).filter(Boolean)),
    addData: (name, mime, bytes) => call('files:addData', { name, mime, bytes })
  },
  screen: { capture: opts => call('screen:capture', opts), permission: () => call('screen:permission'), openPermission: () => call('screen:openPermission') },
  quickCalc: text => call('quick:calc', text),
  mac: {
    axStatus: () => call('mac:axStatus'), axOpen: () => call('mac:axOpen'), selection: opts => call('mac:selection', opts),
    timers: () => call('mac:timers'), cancelTimer: id => call('mac:cancelTimer', id)
  },
  clip: {
    list: () => call('clip:list'), copy: id => call('clip:copy', id), remove: id => call('clip:remove', id), clear: () => call('clip:clear'),
    attach: id => call('clip:attach', id), onChange: on('clip:changed'), suggest: () => call('clip:suggest')
  },
  finder: {
    find: q => call('files:find', q), open: p => call('files:open', p), reveal: p => call('files:reveal', p), attach: p => call('files:attachPath', p)
  },
  watch: {
    windows: () => call('watch:windows'), start: opts => call('watch:start', opts), front: condition => call('watch:front', condition),
    stop: id => call('watch:stop', id), dismiss: id => call('watch:dismiss', id), state: () => call('watch:state'),
    onState: on('watch:state'), onHit: on('watch:hit')
  },
  project: { get: id => call('project:get', id), addFiles: id => call('project:addFiles', id) },
  spaces: { add: sp => call('spaces:add', sp), update: (id, patch) => call('spaces:update', { id, patch }), remove: id => call('spaces:remove', id), ask: (q, agent) => call('spaces:ask', { q, agent }) },
  routines: {
    list: () => call('routines:list'), save: r => call('routines:save', r), remove: id => call('routines:remove', id),
    runNow: id => call('routines:runNow', id), parse: text => call('routines:parse', text), onChange: on('routines:changed')
  },
  brief: { run: opts => call('brief:run', opts), onReady: on('brief:ready') },
  wrap: { run: () => call('wrap:run') },
  triggers: { status: () => call('triggers:status') },
  study: { onOpen: on('study:open'),
    state: () => call('study:state'), createDeck: name => call('study:createDeck', name), renameDeck: (id, name) => call('study:renameDeck', { id, name }), removeDeck: id => call('study:removeDeck', id),
    cards: deckId => call('study:cards', deckId), addCards: (deck, cards, source) => call('study:addCards', { deck, cards, source }), editCard: (id, front, back) => call('study:editCard', { id, front, back }),
    removeCard: id => call('study:removeCard', id), queue: deckId => call('study:queue', deckId), review: (cardId, grade) => call('study:review', { cardId, grade }),
    practice: deckId => call('study:practice', deckId), makeDeck: opts => call('study:makeDeck', opts), onChange: on('study:changed')
  },
  missions: {
    state: () => call('missions:state'), start: (goal, minutes, then) => call('missions:start', { goal, minutes, then }),
    pause: () => call('missions:pause'), resume: () => call('missions:resume'), end: () => call('missions:end'), dismiss: () => call('missions:dismiss'),
    onState: on('mission:state'),
    templates: () => call('missions:templates'), saveTemplate: t => call('missions:saveTemplate', t), removeTemplate: id => call('missions:removeTemplate', id),
    exportReport: (convId, format) => call('missions:export', { convId, format }), reportText: convId => call('missions:reportText', convId)
  },
  profile: { setNickname: name => call('profile:setNickname', name) },
  metrics: { summary: () => call('metrics:summary'), onAchievement: on('metrics:achievement'), onChange: on('metrics:changed') },
  onBgConfirm: on('bg:confirm'),
  onBgConfirmDone: on('bg:confirmDone'),
  exportChat: (convId, format) => call('export:chat', { convId, format }),
  exportReply: (convId, ts, format) => call('export:chat', { convId, ts, format }),
  group: {
    huddle: opts => call('group:huddle', opts), debate: opts => call('group:debate', opts), stop: id => call('group:stop', id),
    onProgress: on('group:progress')
  },
  code: { run: code => call('code:run', code), save: (code, lang) => call('code:save', { code, lang }) },
  addReminder: title => call('reminder:add', title),
  onFeatures: on('features:changed'),
  reveal: p => call('export:reveal', p),
  feedback: f => call('feedback:send', f),
  feedbackShot: () => call('feedback:shot'),   // 3.8
  onOpenSettings: on('settings:openTab'),
  windowCtl: a => ipcRenderer.send('win:ctl', a),   // 4.0.4: Nexus-style windows (no system title bar) close/minimize themselves
  mindmap: { open: () => call('mindmap:open'), data: () => call('mindmap:data'), openChat: id => call('mindmap:openChat', id), setMode: m => call('mindmap:setMode', m), ask: a => call('mindmap:ask', a), makeDeck: a => call('mindmap:makeDeck', a), onChanged: on('mindmap:changed') },   // 3.9 / 3.10
  handoff: { send: id => call('handoff:send', id) },   // 3.10
  tests: { list: () => call('tests:list'), report: r => call('tests:report', r) },   // 3.8
  terms: { accept: () => call('terms:accept') },   // 3.10
  reminders: { list: () => call('reminders:list'), add: r => call('reminders:add', r), remove: id => call('reminders:remove', id), onChange: on('reminders:changed') },   // 3.12
  whatsNew: () => call('whatsnew:get'),
  deskWidgets: { get: () => call('deskw:get'), set: p => call('deskw:set', p), size: h => ipcRenderer.send('deskw:size', h), open: what => ipcRenderer.send('deskw:open', what), onData: on('deskw:data'), extra: () => call('deskw:extra'), action: a => call('deskw:action', a), arrange: () => call('deskw:arrange') },
  onHudAsk: on('hud:ask'),   // 3.13
  onHudOpen: on('hud:open'),
  guide: { start: goal => call('guide:start', goal), next: note => call('guide:next', note), stop: () => call('guide:stop'), onStep: on('guide:step'), resize: h => ipcRenderer.send('guide:resize', h) },   // 3.12
  inbox: { list: () => call('inbox:list'), done: id => call('inbox:done', id), ask: id => call('inbox:ask', id), onChange: on('inbox:changed'), onOpen: on('inbox:open') },   // 3.12
  tryChats: { list: () => call('trychats:list'), import: ids => call('trychats:import', ids) },   // 3.12
  goals: { get: () => call('goals:get'), add: t => call('goals:add', t), toggle: id => call('goals:toggle', id), remove: id => call('goals:remove', id), carry: () => call('goals:carry'), onChange: on('goals:changed') },   // 3.12
  issues: { match: text => call('issues:match', text), follow: id => call('issues:follow', id), list: () => call('issues:list') },   // 3.12 known issues
  subscription: { get: () => call('sub:get'), invite: (order, who) => call('sub:invite', { order, who }), respond: (id, accept) => call('sub:respond', { id, accept }), remove: id => call('sub:remove', id) },   // 3.11
  diag: { copy: () => call('diag:copy') },   // 3.11
  training: { news: () => call('training:news'), onAsk: on('training:ask'), state: () => call('training:state'), consent: on => call('training:consent', !!on), remove: () => call('training:delete'), rate: (ref, v) => call('training:rate', { ref, v }), correct: (ref, text) => call('training:correct', { ref, text }) },   // 3.8      // 3.8: main asks the chat window to open a settings tab
  feedbackInbox: { mine: () => call('feedback:mine'), reply: (id, body) => call('feedback:reply', { id, body }), seen: id => call('feedback:seen', id), onOpen: on('feedback:open'), onUnread: on('feedback:unread') },
  account: { setAvatar: (bytes, mime) => call('account:setAvatar', { bytes, mime }), removeAvatar: () => call('account:removeAvatar') },
  reportContent: a => call('content:report', a),
  flags: { state: () => call('flags:state'), onChange: on('flags:changed'), thumb: (feature, up, note) => call('beta:thumb', { feature, up, note }), report: (text, feature) => call('beta:report', { text, feature }) },
  requests: { send: req => call('access:request', req), cancel: id => call('access:cancel', id) },
  studyPlan: { get: force => call('study:plan', force), setTestDate: (id, date) => call('study:setTestDate', { id, date }), slots: on => call('study:slots', on) },
  write: { list: () => call('write:list'), get: id => call('write:get', id), save: d => call('write:save', d), remove: id => call('write:remove', id), suggest: o => call('write:suggest', o), export: o => call('write:export', o), templates: () => call('write:templates'), fromTemplate: id => call('write:fromTemplate', id), versions: id => call('write:versions', id), restore: (id, i) => call('write:restore', { id, i }) },
  meeting: { chunk: (id, index, wav) => call('meeting:chunk', { id, index, wav }), finish: o => call('meeting:finish', o), cancel: id => call('meeting:cancel', id), remind: items => call('meeting:remind', items), recording: on => call('meeting:recording', !!on) },
  focus: { start: o => call('focus:start', o), stop: () => call('focus:stop'), pause: () => call('focus:pause'), resume: () => call('focus:resume'), skip: () => call('focus:skip'), state: () => call('focus:state'), onState: on('focus:state') },
  agents: { knows: id => call('agents:knows', id), saveCustom: a => call('agents:saveCustom', a), removeCustom: id => call('agents:removeCustom', id), share: id => call('agents:share', id), import: code => call('agents:import', code) },
  beta: { signup: opts => call('beta:signup', opts), myRequest: () => call('beta:myRequest') },
  cite: {
    fromUrl: url => call('cite:fromUrl', url), fromBrowser: () => call('cite:fromBrowser'), list: () => call('cite:list'), save: c => call('cite:save', c),
    update: (id, patch) => call('cite:update', { id, patch }), remove: id => call('cite:remove', id), format: (source, style) => call('cite:format', { source, style }),
    bibliography: (project, style) => call('cite:bibliography', { project, style })
  },
  homeworkUsed: () => call('homework:metric'),
  wrapped: { data: year => call('wrapped:data', year), save: () => call('wrapped:save') },
  // v2.7: memory you control, weekly recap, auto-sorted Spaces, clipboard orb, share sheet, group challenges, changelog email
  memory: { state: () => call('memory:state'), add: (t, space) => call('memory:add', t, space), setSpace: (id, space) => call('memory:space', { id, space }), edit: (id, text) => call('memory:edit', { id, text }), remove: id => call('memory:remove', id), clear: () => call('memory:clear'), setEnabled: on => call('memory:enabled', on), onChange: on('memory:changed') },
  recap: { now: () => call('recap:now') },
  autosort: { all: () => call('autosort:all'), onMoved: on('autosort:moved') },
  perms: { state: () => call('perms:state'), open: id => call('perms:open', id), ask: id => call('perms:ask', id) },
  clipOrb: { act: a => call('cliporb:act', a), hover: v => ipcRenderer.send('cliporb:hover', !!v), size: (w, h) => ipcRenderer.send('cliporb:size', { w, h }), onShow: on('cliporb:show'),
    status: () => call('cliporb:status'), test: () => call('cliporb:test'), unmute: key => call('cliporb:unmute', key), onStatus: on('cliporb:status') },
  share: { text: (text, title) => call('share:text', { text, title }) },
  challenges: { list: spaceId => call('challenges:list', spaceId), create: p => call('challenges:create', p), remove: id => call('challenges:remove', id) },
  changelog: { state: () => call('changelog:state'), set: on => call('changelog:set', on) },
  onQuickChatPrefill: on('quickchat:prefill'),
  // v2.6 Axiom: Operations + Sentinel; Rollback (any agent's changes on this Mac)
  ops: { state: () => call('ops:state'), addOperation: p => call('ops:addOperation', p), addSentinel: p => call('ops:addSentinel', p), set: (id, patch) => call('ops:set', { id, patch }),
    remove: id => call('ops:remove', id), runNow: id => call('ops:runNow', id), onChange: on('ops:changed') },
  rollback: { list: () => call('rollback:list'), undo: id => call('rollback:undo', id), undoSince: minutes => call('rollback:undoSince', minutes), onChange: on('rollback:changed') },
  // v2.5 Axiom: Dossier, Threat Board, Briefing Room
  axiom: { state: () => call('axiom:state'), addEntry: e => call('axiom:addEntry', e), editEntry: (id, patch) => call('axiom:editEntry', { id, patch }), removeEntry: id => call('axiom:removeEntry', id),
    track: t => call('axiom:track', t), setThreat: (id, patch) => call('axiom:setThreat', { id, patch }), removeThreat: id => call('axiom:removeThreat', id),
    setBriefing: p => call('axiom:setBriefing', p), briefNow: () => call('axiom:briefNow'), onChange: on('axiom:changed') },
  net: { state: probe => call('net:state', !!probe), onChange: on('net:changed') },
  awake: { state: () => call('awake:state'), set: patch => call('awake:set', patch), lid: on => call('awake:lid', !!on), revoke: () => call('awake:revoke'), reset: () => call('awake:reset'), testDim: () => call('awake:testDim'), checkBrightness: () => call('awake:checkBrightness'), onChange: on('awake:changed') },
  phone: { state: () => call('phone:state'), sent: () => call('phone:sent'), set: patch => call('phone:set', patch), onRelay: on('phone:relay'), onDirect: on('phone:direct'),
    send: args => call('phone:send', args), sendClipboard: () => call('phone:sendClipboard'), test: () => call('phone:test'), openInbox: () => call('phone:openInbox') },
  shared: {
    list: () => call('shared:list'), create: a => call('shared:create', a), join: a => call('shared:join', a), feed: id => call('shared:feed', id),
    post: (id, content) => call('shared:post', { id, content }), ask: (id, text, agent) => call('shared:ask', { id, text, agent }),
    shareDeck: (id, deckId) => call('shared:shareDeck', { id, deckId }), takeDeck: (id, postId) => call('shared:takeDeck', { id, postId }),
    sessionStart: (id, deckId, minutes) => call('shared:sessionStart', { id, deckId, minutes }), sessions: id => call('shared:sessions', id), session: sid => call('shared:session', sid), sessionScore: (sid, score) => call('shared:sessionScore', { sid, score }), sessionEnd: sid => call('shared:sessionEnd', sid),
    leave: id => call('shared:leave', id), remove: id => call('shared:remove', id), rename: nick => call('shared:rename', nick),
    onChange: on('shared:changed'), onOpen: on('shared:open')
  },
  abort: requestId => call('chat:abort', { requestId }),
  confirmReply: (callId, approve) => call('agent:confirmReply', { callId, approve }),
  preview: url => call('preview:get', url),

  connectors: {
    state: () => call('connectors:state'),
    save: (connector, secrets) => call('connectors:save', { connector, secrets }),
    remove: id => call('connectors:remove', id),
    reconnect: id => call('connectors:reconnect', id),
    onChange: on('connectors:changed')
  },
  actions: { list: () => call('actions:list'), clear: () => call('actions:clear') },
  cloud: {
    state: () => call('cloud:state'),
    sync: () => call('cloud:sync'),
    signIn: (email, password) => call('cloud:signIn', { email, password }),
    signOut: () => call('cloud:signOut'),
    dismiss: id => call('cloud:dismiss', id),
    signUp: (email, password, username) => call('cloud:signUp', { email, password, username }),
    resetPassword: email => call('cloud:resetPassword', { email }),
    changeEmail: email => call('cloud:changeEmail', { email }),
    changePassword: password => call('cloud:changePassword', { password }),
    changeUsername: username => call('cloud:changeUsername', { username }),
    refreshAccount: () => call('cloud:refreshAccount'),
    redeem: orderId => call('cloud:redeem', { orderId }),
    unredeem: orderId => call('cloud:unredeem', { orderId }),
    onChange: on('cloud:changed')
  },

  voice: {
    helperInfo: () => call('voice:helperInfo'),
    micAccess: () => call('voice:micAccess'),
    listen: (id, locale) => call('voice:listen', { id, locale }),
    stop: id => call('voice:stop', { id }),
    cancel: id => call('voice:cancel', { id }),
    note: (audio, mime, seconds) => call('voice:note', { audio, mime, seconds }), noteAudio: id => call('voice:noteAudio', id),   // 3.12
    transcribe: (audio, mime, engine, seconds) => call('voice:transcribe', { audio, mime, engine, seconds }), speechInfo: () => call('voice:speechInfo'), speechUsage: () => call('voice:speechUsage'),
    speak: (text, purpose, persona, render = false) => call('voice:speak', { text, purpose, persona, render }),
    openSpokenContent: () => call('open:spokenContent'),
    stopSpeaking: () => call('voice:stopSpeaking'),
    systemVoices: () => call('voice:systemVoices'),
    onEvent: on('voice:event')
  },

  hide: () => call('hud:hide'),
  quickHide: () => call('quick:hide'),
  quickActive: v => call('quick:active', v),
  openChat: convId => call('quick:openChat', convId),
  quickChatResize: h => call('quickchat:resize', h),
  quickChatMove: (dx, dy) => ipcRenderer.send('quickchat:move', { dx, dy }),   // 3.12
  quickChatHide: () => call('quickchat:hide'),
  openExternal: url => call('open:external', url),
  copyText: t => call('clip:write', t),   // 3.13

  onChunk: on('chat:chunk'),
  onChatEvent: on('chat:event'),
  onConfirm: on('agent:confirm'),
  onShown: on('hud:shown'),
  onSettings: on('settings:changed'),
  onKeys: on('keys:changed'),
  onQuickTrigger: on('quick:trigger'),
  onQuickEscape: on('quick:escape'),
  onQuickEnter: on('quick:enter'),
  onQuickChatAttach: on('quickchat:attach'),
  onHudAttach: on('hud:attach'),
  onQuickChatShown: on('quickchat:shown')
});

// ---------- 3.5 Windows: the same windows, with Windows words and fonts
// Adds html.win (CSS picks Segoe UI / Cascadia and a few Windows-only tweaks) and, on Windows, rewrites Mac wording in
// the app's own text as it appears: "this Mac" → "this PC", ⌘ → Ctrl, menu bar → system tray, and so on. Chat messages,
// code and anything you type are never touched.
const IS_WIN = process.platform === 'win32' || process.env.NEXUS_FAKE_WIN === '1';
contextBridge.exposeInMainWorld('nexusPlatform', { os: IS_WIN ? 'win32' : process.platform, win: IS_WIN, mac: process.platform === 'darwin' && !IS_WIN });
if (IS_WIN) {
  const WORDS = [
    [/\bmacOS permissions\b/g, 'Windows permissions'], [/\bmacOS's prompt\b/g, "Windows' prompt"], [/\bOpen System Settings\b/g, 'Open Windows Settings'], [/\bSystem Settings\b/g, 'Windows Settings'],
    [/\bthe macOS Keychain\b/g, "Windows' encrypted storage"], [/\bmacOS Keychain\b/g, "Windows' encrypted storage"], [/\bKeychain\b/g, 'encrypted storage'],
    [/\bthis Mac's\b/g, "this PC's"], [/\bThis Mac's\b/g, "This PC's"], [/\byour Mac's\b/g, "your PC's"], [/\bYour Mac's\b/g, "Your PC's"],
    [/\bthis Mac\b/g, 'this PC'], [/\bThis Mac\b/g, 'This PC'], [/\byour Mac\b/g, 'your PC'], [/\bYour Mac\b/g, 'Your PC'], [/\bthe Mac\b/g, 'the PC'], [/\bThe Mac\b/g, 'The PC'],
    [/\bon a Mac\b/g, 'on a PC'], [/\bmy Mac\b/g, 'my PC'], [/\bMy Mac\b/g, 'My PC'], [/\bSPOTLIGHT\b/g, 'WINDOWS SEARCH'], [/\bMac only\b/g, 'Mac-only'], [/\bMac app\b/g, 'desktop app'], [/\bMac actions\b/g, 'PC actions'], [/\bMac tools\b/g, 'PC tools'], [/\bMac power tools\b/g, 'PC power tools'],
    [/\bMAC & PHONE\b/g, 'PC & PHONE'], [/\bthe menu bar\b/g, 'the system tray'], [/\bmenu-bar\b/g, 'tray'], [/\bmenu bar\b/g, 'system tray'], [/\bMenu bar\b/g, 'System tray'],
    [/\bFinder\b/g, 'File Explorer'], [/\bSpotlight\b/g, 'Windows Search'], [/\bApple on-device\b/g, 'Windows on-device'], [/\bApple Calendar &(amp;)? Reminders\b/g, 'Outlook Calendar & Tasks'],
    [/⌘⇧/g, 'Ctrl+Shift+'], [/⌥⇧/g, 'Alt+Shift+'], [/⌘/g, 'Ctrl+'], [/⌥/g, 'Alt+'], [/⌃/g, 'Ctrl+'], [/⇧/g, 'Shift+'], [/\bOption\+/g, 'Alt+'], [/\bCmd\+/g, 'Ctrl+']
  ];
  const SKIP = 'textarea, input, pre, code, [contenteditable], .msg, .bubble, .md, .ai-text, .msg-body, .no-win';
  const fix = t => { if (/^\s*Mac\s*$/.test(t)) return t.replace('Mac', 'PC'); let o = t; for (const [a, b] of WORDS) o = o.replace(a, b); return o; };   // the "Mac" settings tab → "PC"
  const walk = root => {
    if (!root) return;
    if (root.nodeType === 3) { const p = root.parentElement; if (p && !p.closest(SKIP)) { const n = fix(root.nodeValue); if (n !== root.nodeValue) root.nodeValue = n; } return; }
    if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
    for (const a of ['title', 'placeholder', 'aria-label']) { const v = root.getAttribute?.(a); if (v) { const n = fix(v); if (n !== v) root.setAttribute(a, n); } }
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === 1) { if (n.closest(SKIP)) continue; for (const a of ['title', 'placeholder', 'aria-label']) { const v = n.getAttribute(a); if (v) { const x = fix(v); if (x !== v) n.setAttribute(a, x); } } continue; }
      const p = n.parentElement; if (!p || p.closest(SKIP)) continue;
      const x = fix(n.nodeValue); if (x !== n.nodeValue) n.nodeValue = x;
    }
  };
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.classList.add('win');
    walk(document.body);
    new MutationObserver(list => { for (const m of list) { if (m.type === 'characterData') walk(m.target); else for (const n of m.addedNodes) walk(n); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}
