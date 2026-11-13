// Narrow bridge between the Nexus windows (HUD, Quick Ask, Quick Chat) and the main process.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = channel => cb => ipcRenderer.on(channel, (_e, d) => cb(d));
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('nexus', {
  init: () => call('app:init'),
  setSettings: patch => call('settings:set', patch),
  setKey: (provider, key) => call('keys:set', { provider, key }),
  listModels: provider => call('models:list', { provider }),

  conv: {
    state: () => call('conv:state'),
    append: (msg, convId) => call('conv:append', msg, convId),
    get: id => call('conv:get', id),
    addVersion: (convId, msg) => call('conv:addVersion', { convId, msg }),
    setVersion: (convId, index) => call('conv:setVersion', { convId, index }),
    create: spaceId => call('conv:new', { spaceId }),
    move: (convId, spaceId) => call('conv:move', { convId, spaceId }),
    setLinks: (convId, links) => call('conv:links', { convId, links }),
    open: id => call('open:conv', id),
    select: id => call('conv:select', id),
    remove: id => call('conv:delete', id),
    rename: (id, title) => call('conv:rename', { id, title }),
    clearAll: () => call('conv:clearAll'),
    onChange: on('conv:changed')
  },

  send: (requestId, personaId, messages, voice, features, convId) => call('chat:send', { requestId, personaId, messages, voice, features, convId }),
  onPersonas: on('personas:changed'),
  access: { state: () => call('access:state'), onChange: on('access:changed') },
  freeModels: () => call('freekey:models'),
  update: { state: () => call('update:state'), check: () => call('update:check'), open: () => call('update:open'), skip: v => call('update:skip', v), onChange: on('update:state') },
  wake: { status: () => call('wake:status'), set: on => call('wake:set', on), onChange: on('wake:status') },
  files: {
    pick: () => call('files:pick'),
    add: files => call('files:add', [...files].map(f => webUtils.getPathForFile(f)).filter(Boolean)),
    addData: (name, mime, bytes) => call('files:addData', { name, mime, bytes })
  },
  screen: { capture: opts => call('screen:capture', opts), permission: () => call('screen:permission'), openPermission: () => call('screen:openPermission') },
  quickCalc: text => call('quick:calc', text),
  spaces: { add: sp => call('spaces:add', sp), update: (id, patch) => call('spaces:update', { id, patch }), remove: id => call('spaces:remove', id) },
  routines: {
    list: () => call('routines:list'), save: r => call('routines:save', r), remove: id => call('routines:remove', id),
    runNow: id => call('routines:runNow', id), parse: text => call('routines:parse', text), onChange: on('routines:changed')
  },
  brief: { run: opts => call('brief:run', opts), onReady: on('brief:ready') },
  missions: {
    state: () => call('missions:state'), start: (goal, minutes) => call('missions:start', { goal, minutes }),
    pause: () => call('missions:pause'), resume: () => call('missions:resume'), end: () => call('missions:end'), dismiss: () => call('missions:dismiss'),
    onState: on('mission:state')
  },
  profile: { setNickname: name => call('profile:setNickname', name) },
  metrics: { summary: () => call('metrics:summary'), onAchievement: on('metrics:achievement') },
  onBgConfirm: on('bg:confirm'),
  onBgConfirmDone: on('bg:confirmDone'),
  exportChat: (convId, format) => call('export:chat', { convId, format }),
  reveal: p => call('export:reveal', p),
  feedback: f => call('feedback:send', f),
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
    onChange: on('cloud:changed')
  },

  voice: {
    helperInfo: () => call('voice:helperInfo'),
    micAccess: () => call('voice:micAccess'),
    listen: (id, locale) => call('voice:listen', { id, locale }),
    stop: id => call('voice:stop', { id }),
    cancel: id => call('voice:cancel', { id }),
    transcribe: (audio, mime) => call('voice:transcribe', { audio, mime }),
    speak: (text, purpose, persona) => call('voice:speak', { text, purpose, persona }),
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
  quickChatHide: () => call('quickchat:hide'),
  openExternal: url => call('open:external', url),

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
