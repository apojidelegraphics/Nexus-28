// Narrow bridge between the Nexus windows (HUD, Quick Ask, Quick Chat) and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const on = channel => cb => ipcRenderer.on(channel, (_e, d) => cb(d));
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('nexus', {
  init: () => call('app:init'),
  setSettings: patch => call('settings:set', patch),
  setKey: (provider, key) => call('keys:set', { provider, key }),
  listModels: provider => call('models:list', { provider }),

  conv: {
    state: () => call('conv:state'),
    append: msg => call('conv:append', msg),
    create: () => call('conv:new'),
    select: id => call('conv:select', id),
    remove: id => call('conv:delete', id),
    rename: (id, title) => call('conv:rename', { id, title }),
    clearAll: () => call('conv:clearAll'),
    onChange: on('conv:changed')
  },

  send: (requestId, personaId, messages, voice, features) => call('chat:send', { requestId, personaId, messages, voice, features }),
  onPersonas: on('personas:changed'),
  access: { state: () => call('access:state'), onChange: on('access:changed') },
  freeModels: () => call('freekey:models'),
  update: { state: () => call('update:state'), check: () => call('update:check'), open: () => call('update:open'), skip: v => call('update:skip', v), onChange: on('update:state') },
  wake: { status: () => call('wake:status'), onChange: on('wake:status') },
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
    speak: (text, purpose) => call('voice:speak', { text, purpose }),
    openSpokenContent: () => call('open:spokenContent'),
    stopSpeaking: () => call('voice:stopSpeaking'),
    systemVoices: () => call('voice:systemVoices'),
    onEvent: on('voice:event')
  },

  hide: () => call('hud:hide'),
  quickHide: () => call('quick:hide'),
  quickActive: v => call('quick:active', v),
  openChat: () => call('quick:openChat'),
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
  onQuickChatShown: on('quickchat:shown')
});
