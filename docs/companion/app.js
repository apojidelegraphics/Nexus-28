// N28C — Nexus '28 on your phone. See index.html for how the data flows.
'use strict';
const SUPABASE_URL = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn'; // publishable key: safe in a web page; row-level security protects the data
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('nx.' + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('nx.' + k, JSON.stringify(v)); } catch {} } };
const HEX = /^#[0-9a-f]{6}$/i;

const S = {
  user: null, tab: 'chat', status: null, chats: null, study: null, chatData: {}, rows: [], lastSeen: 0,
  agent: store.get('agent', 'flash'), feats: [], openChat: store.get('openChat', null), search: '', chatFilter: 'all',
  review: null, quiz: null, deckView: null, pendingReq: new Map(), photo: null, wmsg: {}, space: null, spaces: null, posts: [], members: [],
  clip: null, sendDraft: { text: '', url: '', photo: null }
};
const DEFAULT_AGENTS = [{ id: 'flash', name: "Nexus '28 Flash", color: '#ffd36b', handle: 'flash' }, { id: 'lyte', name: "Nexus '28 Lyte", color: '#3dffa0', handle: 'lyte' }, { id: 'neodela', name: "Nexus '28 Neodela", color: '#b18cff', handle: 'neodela' }];
const agents = () => S.status?.agents?.length ? S.status.agents : DEFAULT_AGENTS;
const agentOf = id => agents().find(a => a.id === id) || { id, name: id || 'Nexus', color: '#7aa894', handle: id };
const short = n => String(n || '').replace("Nexus '28 ", '');
const online = () => Date.now() - S.lastSeen < 180e3;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2600); }
function ago(ts) { const d = Date.now() - ts; if (d < 60e3) return 'now'; if (d < 3600e3) return Math.round(d / 60e3) + 'm'; if (d < 86400e3) return Math.round(d / 3600e3) + 'h'; return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function sheet(html, onClick, onClose) { $('sheetBox').innerHTML = html; $('sheet').classList.add('on'); sheet.cb = onClick; sheet.close = onClose; }
function closeSheet() { $('sheet').classList.remove('on'); const c = sheet.close; sheet.cb = null; sheet.close = null; c?.(); }
$('sheet').addEventListener('click', e => { if (e.target === $('sheet')) return closeSheet(); sheet.cb?.(e); });
// A small text-entry sheet. Resolves with the text, or null if cancelled.
function ask(title, { value = '', placeholder = '', ok = 'Save', multiline = false } = {}) {
  return new Promise(res => {
    sheet(`<h3>${esc(title)}</h3>${multiline ? `<textarea class="field" id="askIn" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="field" id="askIn" value="${esc(value)}" placeholder="${esc(placeholder)}">`}
      <div class="row2" style="margin-top:12px"><button class="big ghost" data-x="no">Cancel</button><button class="big" data-x="ok">${esc(ok)}</button></div>`, e => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const v = $('askIn').value.trim(); sheet.close = null; closeSheet(); res(b.dataset.x === 'ok' && v ? v : null);
    }, () => res(null));
    setTimeout(() => $('askIn')?.focus(), 50);
  });
}

// ---------- theme + orb: both follow the desktop app (Settings → Theme / Orb skin on your Mac); not changeable here
function applyTheme(t) {
  if (!t || !HEX.test(t.accent || '') || !HEX.test(t.bg || '')) return;
  const r = document.documentElement.style;
  r.setProperty('--accent', t.accent); r.setProperty('--rgb', /^\d{1,3},\d{1,3},\d{1,3}$/.test(t.rgb) ? t.rgb : '61,255,160'); r.setProperty('--bg', t.bg);
  for (const [k, v] of [['--panel', t.panel], ['--panel2', t.panel2], ['--text', t.text], ['--muted', t.muted], ['--on-accent', t.onAccent]]) if (HEX.test(v || '')) r.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]').content = t.bg;
  orbs.forEach(o => { o.setColor(t.accent); o.setSkin(t.skin || 'aurora'); });
  if (JSON.stringify(t) !== JSON.stringify(store.get('theme', null))) store.set('theme', t);
}
const orbs = [];
function makeOrb(canvas) { const t = store.get('theme', null); const o = window.NexusOrb.create(canvas, { minimal: true, color: t?.accent || '#3dffa0', skin: t?.skin || 'aurora' }); orbs.push(o); return o; }
const hOrb = makeOrb($('hOrb'));
applyTheme(store.get('theme', null));

// ---------- data
async function loadSync(keys) {
  const { data, error } = await sb.from('companion_sync').select('key,data,updated_at').in('key', keys);
  if (error) { if (/companion_sync/.test(error.message)) S.syncMissing = true; return; }
  for (const r of data) {
    if (r.key === 'status') { S.status = r.data; applyTheme(r.data?.theme); }
    else if (r.key === 'chats') S.chats = r.data; else if (r.key === 'study') S.study = r.data;
    else if (r.key.startsWith('chat:')) S.chatData[r.key.slice(5)] = r.data;
  }
}
async function loadRelay() {
  const { data, error } = await sb.from('relay_messages').select('id,direction,kind,agent,content,reply_to,meta,created_at').in('kind', ['ask', 'reply', 'error', 'status']).order('created_at', { ascending: false }).limit(120);
  if (error) return toast(error.message);
  const st = data.find(r => r.kind === 'status');
  if (st) { S.lastSeen = new Date(st.created_at).getTime(); if (!S.status && st.meta?.agents) S.status = { agents: st.meta.agents, version: st.meta.version }; }
  S.rows = data.filter(r => r.kind !== 'error' || !r.meta?.op).reverse();
  if (S.pendingReq.size) {
    const { data: res } = await sb.from('relay_messages').select('id,kind,content,reply_to').in('reply_to', [...S.pendingReq.keys()]);
    for (const r of res || []) {
      const cb = S.pendingReq.get(r.reply_to); if (!cb) continue;
      S.pendingReq.delete(r.reply_to);
      let v; try { v = JSON.parse(r.content); } catch { v = { ok: false, error: r.content }; }
      cb(v);
      sb.from('relay_messages').delete().in('id', [r.id, r.reply_to]).then(() => {});   // done with it
    }
  }
}
// Ask your Mac to do something (relay kind 'request'). Resolves with its answer, or { ok:false, error:'timeout' }.
async function request(op, meta = {}, ms = 60000) {
  const { data, error } = await sb.from('relay_messages').insert({ direction: 'to_desktop', kind: 'request', content: op, meta: { op, ...meta } }).select('id').single();
  if (error) { toast(error.message); return { ok: false, error: error.message }; }
  if (!online()) toast('Your Mac will do this when Nexus is open there.');
  setTimeout(refresh, 1500);
  return new Promise(res => { S.pendingReq.set(data.id, res); setTimeout(() => { if (S.pendingReq.has(data.id)) { S.pendingReq.delete(data.id); res({ ok: false, error: 'timeout' }); } }, ms); });
}
const reqErr = r => r.error === 'timeout' ? "Your Mac didn't answer. Is Nexus open?" : r.error;
let tick = 0, busy = false;
async function refresh() {
  if (!S.user || busy) return;
  busy = true;
  try {
    await loadRelay();
    const keys = ['status'];
    if (S.tab === 'chats' || tick % 3 === 0) keys.push('chats');
    if (S.tab === 'study' || tick % 3 === 0) keys.push('study');
    if (S.openChat) keys.push('chat:' + S.openChat.id);
    tick++;
    await loadSync(keys);
    if (S.space) { await loadSpace(); updateMyStats(); }
    talkTick();
    paintHeader(); render();
  } finally { busy = false; }
}
// Let your Mac know you're looking (so it doesn't buzz your phone for answers you're watching arrive).
async function seen() { if (S.user && !document.hidden) await sb.from('companion_sync').upsert({ key: 'seen', data: { at: Date.now() }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' }); }

// ---------- header + tabs
function paintHeader() {
  $('mac').classList.toggle('on', online());
  $('macTxt').textContent = online() ? 'Mac online' : S.lastSeen ? `Mac seen ${ago(S.lastSeen)}` : 'Mac offline';
  $('sub').textContent = S.tab === 'chat' ? (S.openChat ? S.openChat.title : 'Phone chat') : S.space ? S.space.name : { chats: 'Your chats', study: 'Flashcards', mac: 'Your Mac', you: 'You' }[S.tab] || '';
  const due = S.study ? S.study.cards.filter(c => c.due <= Date.now()).length : S.status?.study?.due || 0;
  $('dueBadge').hidden = !due; $('dueBadge').textContent = due;
  const a = agentOf(S.agent); $('agentDot').style.background = a.color; $('agentName').textContent = short(a.name).toUpperCase().slice(0, 12);
  hOrb.setMode(threadItems().pending.length || talk.phase === 'thinking' ? 'thinking' : talk.phase === 'speaking' ? 'speaking' : talk.phase === 'listening' ? 'listening' : 'idle');
}
function setTab(t) {
  S.tab = t;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + t));
  $('composer').classList.toggle('on', t === 'chat');
  S.chatSig = null;
  paintHeader(); render();
  if (t !== 'chat') $('main').scrollTop = 0;
}
$('tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { if (b.dataset.t === 'study' && S.tab === 'study') { S.space = null; S.deckView = null; S.review = null; S.quiz = null; } setTab(b.dataset.t); } };
// Re-render the open tab (every few seconds). Skipped while you're typing in it, so the keyboard doesn't jump.
function render(force) {
  const ae = document.activeElement, view = $('v-' + S.tab);
  if (!force && ae && view?.contains(ae) && ae.matches('textarea, input:not([type=checkbox]):not([type=radio])') && !(S.tab === 'study' && S.space && ae.id === 'spText')) return;
  ({ chat: renderChat, chats: renderChats, study: renderStudy, mac: renderMac, you: renderYou })[S.tab]?.();
}

// ---------- light, safe markdown (fenced blocks become <pre data-lang> for the interactive widgets)
function md(src) {
  let t = String(src || '');
  const blocks = [];
  t = t.replace(/```([\w-]*)[^\n]*\n?([\s\S]*?)```/g, (m, lang, code) => { blocks.push(`<pre data-lang="${esc(lang)}"><code>${esc(code.replace(/\n$/, ''))}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  const out = []; let list = null;
  for (const raw of t.split('\n')) {
    const line = raw.trimEnd();
    const b = line.match(/^\u0000(\d+)\u0000$/);
    const ul = line.match(/^\s*[-*•]\s+(.*)/), ol = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^#{1,4}\s+(.*)/);
    if ((ul || ol) && !b) { const tag = ul ? 'ul' : 'ol'; if (!list || list.tag !== tag) { if (list) out.push(`</${list.tag}>`); list = { tag }; out.push(`<${tag}>`); } out.push(`<li>${inline((ul || ol)[1])}</li>`); continue; }
    if (list) { out.push(`</${list.tag}>`); list = null; }
    if (b) out.push(blocks[+b[1]]); else if (h) out.push(`<h4>${inline(h[1])}</h4>`); else if (/^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line)) continue;
    else if (line.trim()) out.push(`<p>${inline(line.replace(/^\s*\|(.*)\|\s*$/, (m, r) => r.split('|').map(c => c.trim()).join(' · ')))}</p>`);
  }
  if (list) out.push(`</${list.tag}>`);
  return out.join('').replace(/\u0000(\d+)\u0000/g, (m, i) => blocks[+i]);
}
// Interactive answers (quiz, flashcards, checklist, chart, ideas, risks, logic, insights, palette, hints, next):
// the same widgets as the Mac app. What you do in them is kept here and, for synced chats, saved on your Mac.
const widgetApi = {
  study: { addCards: async (deck, cards) => { const r = await request('add_cards', { deck: deck?.name || 'From a chat', cards }); if (r.ok) toast(`Added ${r.added} card${r.added === 1 ? '' : 's'} to “${r.deck}”`); return r.ok ? { ok: true, deck: { name: r.deck } } : { ok: false, error: reqErr(r) }; } },
  conv: { patchWidget: (convId, ts, key, value) => { if (convId !== 'local') request('patch_widget', { convId, ts, key, value }, 20000); } }
};
function enhance(root, key, m, extra = {}) {
  if (!window.NexusWidgets) return;
  const wm = S.wmsg[key] ||= { ts: m.ts || 1, widget: m.widget || {} };
  window.NexusWidgets.enhance(root, wm, { api: widgetApi, convId: m.convId || 'local', onAsk: extra.onAsk || (t => sendText(t)) });
}

// ---------- chat
function threadItems() {
  const convId = S.openChat?.id || null;
  const askOf = id => S.rows.find(x => x.id === id);
  const relay = S.rows.filter(r => (r.kind === 'ask' || r.kind === 'reply' || r.kind === 'error') && !(r.kind === 'ask' ? r.meta?.spaceId : askOf(r.reply_to)?.meta?.spaceId)
    && ((r.kind === 'ask' ? r.meta?.convId : askOf(r.reply_to)?.meta?.convId) || null) === convId);
  const items = [];
  if (convId) {
    const c = S.chatData[convId];
    for (const m of c?.messages || []) items.push({ key: convId + ':' + m.ts, convId, ...m });
    const since = c ? Math.max(...(c.messages || []).map(m => m.ts || 0), 0) : 0;   // relay rows newer than the synced copy
    for (const r of relay) { const ts = new Date(r.created_at).getTime(); if (ts > since + 2000) items.push(rowItem(r)); }
  } else for (const r of relay) items.push(rowItem(r));
  const pending = S.rows.filter(r => r.kind === 'ask' && !r.meta?.spaceId && (r.meta?.convId || null) === convId && !S.rows.some(x => x.reply_to === r.id));
  return { items, pending };
}
const rowItem = r => r.kind === 'ask' ? { key: r.id, role: 'user', content: r.content, persona: r.agent, features: r.meta?.features || [], photo: !!r.meta?.fileId, ts: new Date(r.created_at).getTime() }
  : { key: r.id, role: 'assistant', persona: r.agent, content: r.content, error: r.kind === 'error', ts: new Date(r.created_at).getTime() };
function renderChat(force) {
  const v = $('v-chat');
  const { items, pending } = threadItems();
  const loading = S.openChat && !S.chatData[S.openChat.id];
  const sig = JSON.stringify([S.openChat?.id, items.map(m => m.key + (m.content || '').length), pending.length, loading, online(), speech.at, talk.on]);
  if (!force && sig === S.chatSig) return;
  S.chatSig = sig;
  const bar = `<div class="thread-bar">${S.openChat ? `<button class="hbtn" id="leave">‹</button><b>${esc(S.openChat.title)}</b>` : '<b>Phone chat</b>'}
    ${(window.SpeechRecognition || window.webkitSpeechRecognition) ? `<button class="hbtn ${talk.on ? 'on' : ''}" id="talkBtn">🎙 Talk</button>` : ''}<button class="hbtn" id="newchat">New</button>${S.openChat ? '' : '<button class="hbtn" id="clear">Clear</button>'}</div>`;
  if (!items.length && !pending.length && !loading) {
    v.innerHTML = bar + `<div class="empty"><b>${S.openChat ? 'No messages yet' : 'Ask your Mac anything'}</b>${online() ? 'Your Mac answers with Nexus right now.' : 'Open Nexus on your Mac and turn on the phone companion (Settings → Beta).'}
      ${S.openChat ? '' : `<div class="suggest">${['What should I study tonight?', 'Quiz me on what I studied this week', 'Give me 3 ideas for a weekend project', 'Explain black holes simply'].map(q => `<button data-sugg="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}</div>`;
  } else {
    v.innerHTML = bar + (loading ? '<div class="center">Loading the chat from your Mac…</div>' : '') + `<div class="msgs">${items.map((m, i) => {
      if (m.role === 'user') return `<div class="msg you">${m.features?.length ? `<div class="feats">${m.features.map(f => `<span>@${esc(f)}</span>`).join('')}</div>` : ''}${m.photo || m.attachments?.some(a => a.kind === 'image' || a.kind === 'screen') ? '<span class="att">📷 Photo</span>\n' : ''}${esc(m.content)}</div>`;
      const a = agentOf(m.persona);
      return `<div class="msg ai ${m.error ? 'err' : ''}" data-i="${i}"><div class="who"><i style="background:${esc(a.color)}"></i>${esc(short(a.name).toUpperCase())}</div><div class="body">${m.error ? esc(m.content) : md(m.content)}</div>
        ${m.error ? '' : `<div class="tools"><button data-copy="${i}">Copy</button><button data-speak="${i}" class="${speech.at === i ? 'on' : ''}">${speech.at === i ? '■ Stop' : 'Read aloud'}</button></div>`}</div>`;
    }).join('')}${pending.length ? (() => { const who = short(agentOf(pending.at(-1).agent).name); return `<div class="wait"><span class="dots"><i></i><i></i><i></i></span>${esc(online() ? `${who} is thinking…` : `${who} will answer when your Mac is online`)}</div>`; })() : ''}</div>`;
    v.querySelectorAll('.msg.ai:not(.err)').forEach(el => { const m = items[+el.dataset.i]; enhance(el.querySelector('.body'), m.key, m); });
  }
  S.lastItems = items;
  const nearBottom = $('main').scrollHeight - $('main').scrollTop - $('main').clientHeight < 160;
  if (nearBottom || S.scrollDown) { $('main').scrollTop = $('main').scrollHeight; S.scrollDown = false; }
  renderFeats();
}
// Clicks inside interactive answers belong to the widget (it may have redrawn itself already, detaching the button).
const ownClick = (e, t) => t && e.currentTarget.contains(t) && !t.closest('.widget, .code-bar, .nx-wrap');
$('v-chat').onclick = async e => {
  const t = e.target.closest('button'); if (!ownClick(e, t)) return;
  if (t.dataset.sugg) return sendText(t.dataset.sugg);
  if (t.dataset.copy) { navigator.clipboard?.writeText(S.lastItems[+t.dataset.copy].content); toast('Copied'); }
  if (t.dataset.speak) speak(+t.dataset.speak);
  if (t.id === 'talkBtn') return talk.on ? stopTalk() : startTalk();
  if (t.id === 'leave') { S.openChat = null; store.set('openChat', null); S.scrollDown = true; paintHeader(); renderChat(true); }
  if (t.id === 'newchat') { S.openChat = null; store.set('openChat', null); await clearPhoneRows(); request('new_chat'); toast('New chat'); renderChat(true); }
  if (t.id === 'clear') { if (!confirm('Clear this phone chat? (Your chats on the Mac stay.)')) return; await clearPhoneRows(); request('new_chat'); toast('Cleared'); renderChat(true); }
};
async function clearPhoneRows() {
  const ids = S.rows.filter(r => ['ask', 'reply', 'error'].includes(r.kind) && !r.meta?.spaceId).map(r => r.id);
  for (let i = 0; i < ids.length; i += 100) await sb.from('relay_messages').delete().in('id', ids.slice(i, i + 100));
  S.rows = S.rows.filter(r => !ids.includes(r.id));
}
// @features for the current agent: a few quick toggles
function renderFeats() {
  const a = agentOf(S.agent);
  const pref = ['Homework', 'OmniBrief', 'Seek', 'Cognition', 'StudyMode', 'Magyk', 'Synergy', 'ClarityLens', 'Knowledge', 'Cite', 'QuantumThread', 'NexusForge', 'FortressLens', 'SwiftStream'];
  const list = (a.features || []).filter(f => pref.includes(f)).sort((x, y) => pref.indexOf(x) - pref.indexOf(y)).slice(0, 9);
  S.feats = S.feats.filter(f => list.includes(f));
  $('featrow').innerHTML = list.map(f => `<button data-f="${esc(f)}" class="${S.feats.includes(f) ? 'on' : ''}">@${esc(f)}</button>`).join('');
  $('featrow').style.display = list.length ? 'flex' : 'none';
}
$('featrow').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; const f = b.dataset.f; S.feats = S.feats.includes(f) ? S.feats.filter(x => x !== f) : [...S.feats, f]; renderFeats(); };

// Photos: shrunk on the phone, uploaded to your account, picked up (and deleted) by your Mac.
async function shrink(file, max = 1600, q = .82) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't open that photo.")); i.src = URL.createObjectURL(file); });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  const url = c.toDataURL('image/jpeg', q);
  return { url, b64: url.split(',')[1], name: (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg' };
}
async function upload(photo) {
  const { data, error } = await sb.from('companion_files').insert({ name: photo.name.slice(0, 120), mime: 'image/jpeg', data: photo.b64 }).select('id').single();
  if (error) throw new Error(/companion_files/.test(error.message) ? 'Run the v1.8 Supabase SQL to send photos.' : error.message);
  return data.id;
}
let fileFor = 'chat';
$('attach').onclick = () => { fileFor = 'chat'; $('file').click(); };
$('file').onchange = async () => {
  const f = $('file').files[0]; $('file').value = ''; if (!f) return;
  try {
    const p = await shrink(f);
    if (fileFor === 'send') { S.sendDraft.photo = p; return renderMac(); }
    S.photo = p;
    if ((agentOf(S.agent).features || []).includes('Homework') && !S.feats.includes('Homework')) { S.feats.push('Homework'); renderFeats(); toast('Homework helper on: you get hints first'); }
    paintPhoto();
  } catch (e) { toast(e.message); }
};
function paintPhoto() {
  $('photo').hidden = !S.photo;
  $('photo').innerHTML = S.photo ? `<img src="${S.photo.url}" alt=""><span>Photo attached${S.feats.includes('Homework') ? ' · Homework helper' : ''}</span><button id="unphoto">✕</button>` : '';
}
$('photo').onclick = e => { if (e.target.id === 'unphoto') { S.photo = null; paintPhoto(); } };

async function sendText(q, extra = {}) {
  q = String(q || '').trim();
  if (!q && !S.photo) return null;
  $('send').disabled = true;
  try {
    let fileId = null;
    if (S.photo) { toast('Sending photo…'); fileId = await upload(S.photo); }
    const meta = { features: S.feats, ...(S.openChat ? { convId: S.openChat.id } : {}), ...(fileId ? { fileId } : {}), ...extra };
    const { data, error } = await sb.from('relay_messages').insert({ direction: 'to_desktop', kind: 'ask', agent: S.agent, content: (q || (fileId ? 'Help me with this.' : '')).slice(0, 8000), meta }).select('id').single();
    if (error) { toast(error.message); return null; }
    S.photo = null; paintPhoto(); S.feats = []; S.scrollDown = true;
    refresh();
    return data.id;
  } catch (e) { toast(e.message); return null; } finally { $('send').disabled = false; }
}
async function send() { const q = $('q').value; const id = await sendText(q); if (id) { $('q').value = ''; autosize(); } }
$('send').onclick = send;
const autosize = () => { $('q').style.height = 'auto'; $('q').style.height = Math.min(140, $('q').scrollHeight) + 'px'; };
$('q').addEventListener('input', autosize);
$('q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !/Mobi|iPhone|Android/.test(navigator.userAgent)) { e.preventDefault(); send(); } });
// Agent picker (all agents, including classic models)
function pickAgent(onPick) {
  const core = agents().filter(a => !a.legacy), legacy = agents().filter(a => a.legacy);
  const row = a => `<button class="opt ${a.id === S.agent ? 'on' : ''}" data-a="${esc(a.id)}"><i style="background:${esc(a.color)}"></i><b>${esc(short(a.name))}</b><small>${a.agentic ? 'AGENT' : esc(a.tag || '')}</small></button>`;
  sheet(`<h3>AGENTS</h3>${core.map(row).join('')}${legacy.length ? `<h3 style="margin-top:14px">CLASSIC MODELS</h3>${legacy.map(row).join('')}` : ''}`, e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    S.agent = b.dataset.a; store.set('agent', S.agent); closeSheet(); paintHeader(); renderFeats(); onPick?.();
  });
}
$('agentBtn').onclick = () => pickAgent();
// Dictation (where the browser supports it)
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Rec) {
  $('mic').hidden = false;
  let rec = null;
  $('mic').onclick = () => {
    if (rec) { rec.stop(); return; }
    rec = new Rec(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true;
    const base = $('q').value ? $('q').value + ' ' : '';
    rec.onresult = e => { $('q').value = base + [...e.results].map(r => r[0].transcript).join(''); autosize(); };
    rec.onend = () => { rec = null; $('mic').classList.remove('live'); };
    rec.onerror = () => { rec = null; $('mic').classList.remove('live'); };
    rec.start(); $('mic').classList.add('live');
  };
}

// ---------- read aloud. Safari drops speech when cancel() and speak() run back to back, and Chrome stops long
// utterances after ~15 s, so text is spoken in sentence-sized chunks, all queued at once.
const speech = { at: -1, keep: null };
function speakable(src) {
  return String(src || '').replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, 'link')
    .replace(/^\s*[-*•]\s+/gm, '').replace(/^#+\s*/gm, '').replace(/[*_`>|#]/g, '').replace(/\s+/g, ' ').trim();
}
function stopSpeech(quiet) { speech.at = -1; clearInterval(speech.keep); try { speechSynthesis.cancel(); } catch {} if (!quiet) renderChat(true); }
function sayText(text, onDone) {
  if (!('speechSynthesis' in window)) { toast("This browser can't read aloud."); return false; }
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();
  const chunks = text.match(/[^.!?]+[.!?]*\s*/g)?.reduce((a, s) => { if (a.length && (a.at(-1) + s).length < 220) a[a.length - 1] += s; else a.push(s); return a; }, []) || [text];
  const voices = synth.getVoices(), lang = (navigator.language || 'en-US').slice(0, 2);
  const voice = voices.find(v => v.lang?.startsWith(lang) && /enhanced|premium|natural|siri|samantha|google/i.test(v.name)) || voices.find(v => v.lang?.startsWith(lang)) || null;
  chunks.forEach((c, n) => {
    const u = new SpeechSynthesisUtterance(c.trim());
    if (voice) u.voice = voice;
    u.lang = voice?.lang || navigator.language || 'en-US'; u.rate = 1.02;
    u.onstart = () => hOrb.pulse(.4);
    u.onboundary = () => hOrb.setLevel(.6);
    if (n === chunks.length - 1) u.onend = () => onDone?.();
    u.onerror = e => { if (e.error !== 'interrupted' && e.error !== 'canceled') { toast(isIOS ? 'Read aloud stopped. Check the silent switch.' : 'Read aloud stopped.'); onDone?.(); } };
    synth.speak(u);
  });
  synth.resume();
  clearInterval(speech.keep); speech.keep = setInterval(() => { if (!synth.speaking) return; synth.pause(); synth.resume(); }, 10000);
  return true;
}
function speak(i) {
  if (speech.at === i) return stopSpeech();
  const text = speakable(S.lastItems[i]?.content);
  if (!text) return;
  speech.at = i;
  if (!sayText(text, () => { if (speech.at === i) stopSpeech(); })) speech.at = -1;
  renderChat(true);
}
if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); }

// ---------- Talk mode: you talk → it's sent → the answer is read aloud → it listens again. Say "stop" or "bye" to end.
const talk = { on: false, phase: 'off', askId: null, heard: '', rec: null };
function paintTalk() {
  $('talkbar').hidden = !talk.on; $('typebar').hidden = talk.on;
  if (!talk.on) return;
  const a = short(agentOf(S.agent).name);
  const label = { listening: 'Listening…', thinking: `${a} is thinking…`, speaking: `${a} is talking`, idle: 'Tap the orb to talk' }[talk.phase] || '';
  if (!$('tOrb')) { $('talkbar').innerHTML = `<div class="talk"><canvas id="tOrb" width="112" height="112"></canvas><div><b id="tLabel"></b><small id="tHeard"></small></div><button class="hbtn" id="tEnd">End</button></div>`; talk.orb = makeOrb($('tOrb')); }
  $('tLabel').textContent = label; $('tHeard').textContent = talk.heard || (talk.phase === 'listening' ? 'Say "bye" to stop' : '');
  talk.orb.setMode(talk.phase === 'idle' ? 'idle' : talk.phase);
}
$('talkbar').onclick = e => { if (e.target.id === 'tEnd') return stopTalk(); if (e.target.id === 'tOrb' && ['idle', 'speaking'].includes(talk.phase)) { stopSpeech(true); listen(); } };
function startTalk() {
  if (!Rec) return toast("This browser can't listen. Try Safari or Chrome.");
  // Unlock speech inside the tap (iOS only lets a page speak after the user touched it).
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
  talk.on = true; S.chatSig = null; paintTalk(); renderChat(true); listen();
}
function stopTalk() { talk.on = false; talk.phase = 'off'; talk.askId = null; try { talk.rec?.abort(); } catch {} stopSpeech(true); paintTalk(); renderChat(true); paintHeader(); }
function listen() {
  if (!talk.on) return;
  try { talk.rec?.abort(); } catch {}
  const rec = talk.rec = new Rec(); rec.lang = navigator.language || 'en-US'; rec.interimResults = true; rec.continuous = false;
  talk.heard = ''; talk.phase = 'listening'; paintTalk(); paintHeader();
  rec.onresult = e => { talk.heard = [...e.results].map(r => r[0].transcript).join(''); talk.orb?.setLevel(.7); paintTalk(); };
  rec.onerror = () => {};
  rec.onend = async () => {
    if (!talk.on || talk.rec !== rec) return;
    const said = talk.heard.trim();
    if (!said) { talk.phase = 'idle'; return paintTalk(); }
    if (/^(stop|bye|goodbye|that's all|end)\W*$/i.test(said)) return stopTalk();
    talk.phase = 'thinking'; paintTalk(); paintHeader();
    talk.askId = await sendText(said);
    if (!talk.askId) { talk.phase = 'idle'; paintTalk(); }
  };
  try { rec.start(); } catch { talk.phase = 'idle'; paintTalk(); }   // no tap → the user taps the orb
}
function talkTick() {
  if (!talk.on || talk.phase !== 'thinking' || !talk.askId) return;
  const r = S.rows.find(x => x.reply_to === talk.askId);
  if (!r) return;
  talk.askId = null; talk.phase = 'speaking'; talk.heard = ''; paintTalk();
  const ok = sayText(speakable(r.content), () => { if (talk.on && talk.phase === 'speaking') listen(); });
  if (!ok) { talk.phase = 'idle'; paintTalk(); }
}

// ---------- past chats: search, pinned, filter by Space, pin / rename / move
function renderChats() {
  const v = $('v-chats');
  if (!S.chats) { v.innerHTML = noSync('your chats'); return; }
  const q = S.search.toLowerCase(), f = S.chatFilter;
  const spaces = S.status?.spaces || [];
  if (f !== 'all' && f !== 'pinned' && !spaces.some(x => x.id === f)) S.chatFilter = 'all';
  const list = S.chats.list.filter(c => (!q || (c.title + ' ' + c.preview).toLowerCase().includes(q)) && (S.chatFilter === 'all' || (S.chatFilter === 'pinned' ? c.pinned : c.spaceId === S.chatFilter)));
  const today = new Date(); today.setHours(0, 0, 0, 0); const T = today.getTime();
  const groups = [['📌 PINNED', c => c.pinned], ['TODAY', c => !c.pinned && c.updated >= T], ['YESTERDAY', c => !c.pinned && c.updated >= T - 864e5 && c.updated < T], ['THIS WEEK', c => !c.pinned && c.updated >= T - 7 * 864e5 && c.updated < T - 864e5], ['EARLIER', c => !c.pinned && c.updated < T - 7 * 864e5]];
  const kindTag = k => ({ mission: '⚑ Mission', routine: '⟳ Routine', brief: '☀ Brief', wrap: '☾ Wrap-up', phone: '📱 Phone' })[k] || '';
  const searchVal = $('chatSearch')?.value ?? S.search;
  v.innerHTML = `<input class="search" id="chatSearch" placeholder="Search ${S.chats.list.length} chats" value="${esc(searchVal)}">
    <div class="chips" id="chatChips"><button data-cf="all" class="${S.chatFilter === 'all' ? 'on' : ''}">All</button><button data-cf="pinned" class="${S.chatFilter === 'pinned' ? 'on' : ''}">📌 Pinned</button>${spaces.map(x => `<button data-cf="${esc(x.id)}" class="${S.chatFilter === x.id ? 'on' : ''}"><i style="background:${esc(x.color)}"></i>${esc(x.name)}</button>`).join('')}</div>` +
    (list.length ? groups.map(([g, fn]) => { const items = list.filter(fn).sort((a, b) => g.includes('PINNED') ? b.pinned - a.pinned : 0); return items.length ? `<div class="group">${g}</div>` + items.map(c => `<div class="item" data-c="${esc(c.id)}">
      <span class="dots2">${(c.personas || []).slice(0, 3).map(p => `<i style="background:${esc(agentOf(p).color)}"></i>`).join('')}</span>
      <span class="main"><b>${esc(c.title)}</b><small>${esc(c.preview || '')}</small>${c.space ? `<span class="tag" style="color:${esc(c.space.color)}">${esc(c.space.name)}</span> ` : ''}${kindTag(c.kind) ? `<span class="tag" style="color:var(--muted)">${kindTag(c.kind)}</span>` : ''}</span>
      <span class="r">${ago(c.updated)}<br>${c.count}</span><button class="more" data-more="${esc(c.id)}" aria-label="More">⋯</button></div>`).join('') : ''; }).join('') : `<div class="empty"><b>Nothing here</b>${q ? 'Try other words.' : 'No chats match this filter.'}</div>`);
  const inp = $('chatSearch');
  inp.oninput = () => { S.search = inp.value; const pos = inp.selectionStart; renderChats(); const n = $('chatSearch'); n.focus(); n.setSelectionRange(pos, pos); };
}
$('v-chats').onclick = async e => {
  const cf = e.target.closest('[data-cf]'); if (cf) { S.chatFilter = cf.dataset.cf; return renderChats(); }
  const more = e.target.closest('[data-more]'); if (more) return chatMenu(S.chats.list.find(x => x.id === more.dataset.more));
  const b = e.target.closest('[data-c]'); if (!b) return;
  openChat(S.chats.list.find(x => x.id === b.dataset.c));
};
async function openChat(c) {
  if (!c) return;
  S.openChat = { id: c.id, title: c.title }; store.set('openChat', S.openChat); S.scrollDown = true;
  setTab('chat');
  const r = await request('open_chat', { id: c.id });
  if (r.ok) { await loadSync(['chat:' + c.id]); S.scrollDown = true; renderChat(true); } else if (r.error !== 'timeout') toast(r.error);
}
function chatMenu(c) {
  if (!c) return;
  const spaces = S.status?.spaces || [];
  sheet(`<h3>${esc(c.title.toUpperCase())}</h3>
    <button class="opt" data-m="pin">📌 <b>${c.pinned ? 'Unpin' : 'Pin to top'}</b></button>
    <button class="opt" data-m="rename">✎ <b>Rename</b></button>
    <h3 style="margin-top:12px">MOVE TO SPACE</h3>
    <button class="opt ${!c.spaceId ? 'on' : ''}" data-sp=""><i style="background:var(--muted)"></i><b>No space</b></button>
    ${spaces.map(x => `<button class="opt ${c.spaceId === x.id ? 'on' : ''}" data-sp="${esc(x.id)}"><i style="background:${esc(x.color)}"></i><b>${esc(x.name)}</b></button>`).join('')}`, async e => {
    const m = e.target.closest('[data-m]'), sp = e.target.closest('[data-sp]');
    if (m?.dataset.m === 'pin') { closeSheet(); c.pinned = c.pinned ? 0 : Date.now(); renderChats(); const r = await request('pin_chat', { id: c.id, on: !!c.pinned }); if (!r.ok) toast(reqErr(r)); }
    if (m?.dataset.m === 'rename') { closeSheet(); const t = await ask('Rename chat', { value: c.title }); if (t) { c.title = t; renderChats(); const r = await request('rename_chat', { id: c.id, title: t }); if (!r.ok) toast(reqErr(r)); } }
    if (sp) { closeSheet(); const x = spaces.find(s => s.id === sp.dataset.sp); c.spaceId = x?.id || null; c.space = x ? { name: x.name, color: x.color } : null; renderChats(); const r = await request('move_chat', { id: c.id, spaceId: c.spaceId }); if (!r.ok) toast(reqErr(r)); }
  });
}
function noSync(what) {
  if (S.syncMissing) return `<div class="empty"><b>Almost there</b>Run the v1.7.1 Supabase SQL so your Mac can share ${what}.</div>`;
  return `<div class="empty"><b>Nothing from your Mac yet</b>Open Nexus on your Mac with the phone companion on. It shares ${what} within a minute.<br><br><button class="big ghost" data-sync>Ask my Mac to sync now</button></div>`;
}
document.addEventListener('click', async e => { const b = e.target.closest('[data-sync]'); if (!b) return; b.textContent = 'Syncing…'; const r = await request('sync'); await refresh(); if (!r.ok) toast(reqErr(r)); else b.textContent = 'Synced'; });

// ---------- study: due reviews (graded on your Mac's schedule), cram mode, practice quiz, decks you make or edit here
function renderStudy() {
  const v = $('v-study');
  if (S.space) return renderSpace();
  if (!S.study) { v.innerHTML = spacesBlock() + noSync('your flashcards'); return; }
  if (S.review) return renderReview();
  if (S.quiz) return renderQuiz();
  if (S.deckView) return renderDeck();
  const st = S.study.stats || {}, now = Date.now();
  const due = S.study.cards.filter(c => c.due <= now);
  v.innerHTML = `<div class="stats"><div><b>${due.length}</b><span>due now</span></div><div><b>${st.reviewedToday || 0}</b><span>today</span></div><div><b>${st.streak || 0}</b><span>day streak</span></div></div>
    <button class="big" id="revAll" ${due.length ? '' : 'disabled'}>${due.length ? `Review ${due.length} due card${due.length === 1 ? '' : 's'}` : 'All caught up 🎉'}</button>
    <div class="row2"><button class="big ghost" id="makeDeck">✨ Make a deck</button><button class="big ghost" id="newDeck">＋ Empty deck</button></div>
    ${spacesBlock()}
    ${S.study.decks.length ? `<div class="group">DECKS</div>` + S.study.decks.map(d => { const dd = S.study.cards.filter(c => c.deckId === d.id && c.due <= now).length; return `<button class="item deck" data-deck="${esc(d.id)}">
      <span class="dots2"><i style="background:${esc(d.color)};width:10px;height:10px;border-radius:3px"></i></span>
      <span class="main"><b>${esc(d.name)}</b><small>${d.total} cards · ${d.mastered} mastered</small><div class="bar"><span style="width:${d.total ? Math.round(d.mastered / d.total * 100) : 0}%"></span></div></span>
      <span class="r ${dd ? 'due' : ''}">${dd ? dd + ' due' : '✓'}</span></button>`; }).join('') : '<div class="empty"><b>No decks yet</b>Tap ✨ Make a deck and say what to study.</div>'}`;
}
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
$('v-study').onclick = async e => {
  const t = e.target.closest('button'); if (!ownClick(e, t)) return;
  const now = Date.now();
  if (S.space) return spaceClick(t);
  if (t.id === 'revAll' || t.dataset.rev) {
    const q = S.study.cards.filter(c => c.due <= now && (!t.dataset.rev || c.deckId === t.dataset.rev)).sort((a, b) => (a.reps ? 0 : 1) - (b.reps ? 0 : 1) || a.due - b.due).slice(0, 40);
    S.review = { q, i: 0, shown: false, done: 0, right: 0 }; return renderStudy();
  }
  if (t.dataset.cram) { const q = shuffle(S.study.cards.filter(c => c.deckId === t.dataset.cram)); S.review = { q, i: 0, shown: false, done: 0, right: 0, cram: true }; return renderStudy(); }
  if (t.dataset.deck) { S.deckView = t.dataset.deck; return renderStudy(); }
  if (t.id === 'back') { if (S.review || S.quiz) { S.review = null; S.quiz = null; } else S.deckView = null; return renderStudy(); }
  if (t.dataset.quiz) return startQuiz(t.dataset.quiz);
  if (t.id === 'show') { S.review.shown = true; return renderReview(); }
  if (t.dataset.g !== undefined) return grade(+t.dataset.g);
  if (t.dataset.qa !== undefined && S.quiz) { const q = S.quiz.qs[S.quiz.i]; if (q.picked !== undefined) return; q.picked = +t.dataset.qa; if (q.picked !== q.answer) request('review', { cardId: q.cardId, grade: 0 }); return renderQuiz(); }
  if (t.id === 'qnext') { S.quiz.i++; return renderQuiz(); }
  if (t.id === 'makeDeck') return makeDeckSheet();
  if (t.id === 'newDeck') { const n = await ask('New deck', { placeholder: 'Deck name', ok: 'Create' }); if (n) { const r = await request('deck_create', { name: n }); if (r.ok) { await loadSync(['study']); S.deckView = r.deckId; renderStudy(); } else toast(reqErr(r)); } return; }
  if (t.id === 'addCard') return cardSheet(null, S.deckView);
  if (t.dataset.card) return cardSheet(S.study.cards.find(c => c.id === t.dataset.card), S.deckView);
  if (t.dataset.space) return openSpace(t.dataset.space);
  if (t.id === 'spNew') return createSpace();
  if (t.id === 'spJoin') return joinSpace();
};
function makeDeckSheet() {
  sheet(`<h3>MAKE A DECK</h3><label>What should it be about?</label><input class="field" id="mdTopic" placeholder="The French Revolution">
    <label>How many cards?</label><div class="chips" id="mdN">${[8, 10, 15, 20, 30].map(n => `<button data-n="${n}" class="${n === 10 ? 'on' : ''}">${n}</button>`).join('')}</div>
    <button class="big" id="mdGo" style="margin-top:12px">✨ Make it</button><div class="note">Your Mac writes the cards with Nexus and adds the deck. It takes about half a minute.</div>`, async e => {
    const n = e.target.closest('[data-n]'); if (n) { $('mdN').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === n)); return; }
    if (e.target.id !== 'mdGo') return;
    const topic = $('mdTopic').value.trim(); if (topic.length < 3) return toast('What should the deck be about?');
    const count = +$('mdN').querySelector('.on').dataset.n;
    closeSheet(); toast(`Making ${count} cards about ${topic}…`);
    const r = await request('make_deck', { topic, count }, 240000);
    if (!r.ok) return toast(reqErr(r));
    await loadSync(['study']); toast(`✨ “${r.deck}” is ready: ${r.added} cards`); S.deckView = r.deckId; if (S.tab === 'study') renderStudy();
  });
  setTimeout(() => $('mdTopic')?.focus(), 50);
}
function cardSheet(card, deckId) {
  sheet(`<h3>${card ? 'EDIT CARD' : 'NEW CARD'}</h3><label>Front</label><textarea class="field" id="cfF" rows="2" placeholder="Question or term">${esc(card?.front || '')}</textarea>
    <label>Back</label><textarea class="field" id="cfB" rows="3" placeholder="Answer">${esc(card?.back || '')}</textarea>
    <button class="big" id="cfSave" style="margin-top:12px">${card ? 'Save' : 'Add card'}</button>${card ? '<button class="opt danger" id="cfDel">🗑 <b>Delete card</b></button>' : '<div class="note">Tip: add several, the sheet stays open.</div>'}`, async e => {
    if (e.target.closest('#cfDel')) { if (!confirm('Delete this card?')) return; closeSheet(); S.study.cards = S.study.cards.filter(c => c.id !== card.id); renderStudy(); const r = await request('card_delete', { id: card.id }); if (!r.ok) toast(reqErr(r)); return; }
    if (e.target.id !== 'cfSave') return;
    const front = $('cfF').value.trim(), back = $('cfB').value.trim(); if (!front || !back) return toast('Fill in both sides.');
    if (card) { closeSheet(); Object.assign(card, { front, back }); renderStudy(); const r = await request('card_edit', { id: card.id, front, back }); if (!r.ok) toast(reqErr(r)); return; }
    $('cfF').value = ''; $('cfB').value = ''; $('cfF').focus();
    const r = await request('add_cards', { deckId, cards: [{ front, back }] });
    if (r.ok) { toast(r.added ? 'Card added' : 'That card is already in the deck'); await loadSync(['study']); renderStudy(); } else toast(reqErr(r));
  });
}
function renderDeck() {
  const d = S.study.decks.find(x => x.id === S.deckView); const now = Date.now();
  if (!d) { S.deckView = null; return renderStudy(); }
  const cards = S.study.cards.filter(c => c.deckId === S.deckView);
  const due = cards.filter(c => c.due <= now).length;
  const when = c => { const t = c.due - now; if (t <= 0) return 'due'; const dd = t / 864e5; return dd < 1 ? 'today' : dd < 2 ? 'tomorrow' : `in ${Math.round(dd)} d`; };
  $('v-study').innerHTML = `<div class="thread-bar"><button class="hbtn" id="back">‹ Decks</button><b>${esc(d.name)}</b><button class="hbtn" id="addCard">＋ Card</button></div>
    <button class="big" data-rev="${esc(S.deckView)}" ${due ? '' : 'disabled'}>${due ? `Review ${due} due` : 'All caught up'}</button>
    <div class="row2"><button class="big ghost" data-cram="${esc(S.deckView)}" ${cards.length ? '' : 'disabled'}>⚡ Cram all ${cards.length}</button><button class="big ghost" data-quiz="${esc(S.deckView)}" ${cards.length >= 4 ? '' : 'disabled'}>Practice quiz</button></div>
    <div class="note" style="margin:-2px 2px 10px">Cram mode goes through every card now, without changing when they're due.</div>
    ${cards.map(c => `<button class="cardrow" data-card="${esc(c.id)}"><small class="${when(c) === 'due' ? 'due' : ''}">${when(c)}</small><b>${esc(c.front)}</b><span>${esc(c.back)}</span></button>`).join('') || '<div class="empty">No cards yet. Tap ＋ Card.</div>'}`;
}
function renderReview() {
  const r = S.review, v = $('v-study');
  if (r.i >= r.q.length) {
    v.innerHTML = `<div class="empty"><b>🎉 ${r.cram ? 'Cram done' : 'Session done'}</b>${r.done} cards · ${r.right} remembered.${r.cram ? ' Your schedule stays the same.' : ' Your Mac schedules each card for later.'}<br><br><button class="big" id="back">Back</button></div>`; return;
  }
  const c = r.q[r.i];
  v.innerHTML = `<div class="thread-bar"><button class="hbtn" id="back">‹ Done</button><b>${r.cram ? '⚡ Cram' : ''}</b><span>${r.i + 1} / ${r.q.length}</span></div><div class="prog"><span style="width:${Math.round(r.i / r.q.length * 100)}%"></span></div>
    <div class="card" id="flip"><div class="f">${esc(c.front)}</div>${r.shown ? `<div class="bk">${esc(c.back)}</div>` : '<small>Tap to show the answer</small>'}</div>
    ${r.shown ? (r.cram ? `<div class="grades two"><button class="g0" data-g="0">Missed it</button><button class="g2" data-g="2">Got it</button></div>`
      : `<div class="grades">${['Again', 'Hard', 'Good', 'Easy'].map((l, g) => `<button class="g${g}" data-g="${g}">${l}<small>${esc(c.preview?.[g] || '')}</small></button>`).join('')}</div>`) : '<button class="big" id="show">Show answer</button>'}`;
  $('flip').onclick = () => { if (!r.shown) { r.shown = true; renderReview(); } };
}
function grade(g) {
  const r = S.review, c = r.q[r.i];
  r.done++; if (g >= 2) r.right++;
  if (!r.cram) {
    request('review', { cardId: c.id, grade: g });
    c.due = g === 0 ? Date.now() + 10 * 60e3 : Date.now() + 864e5; // until your Mac sends the real schedule
  }
  if (g === 0 && r.q.filter(x => x.id === c.id).length < 3) r.q.push({ ...c });
  r.i++; r.shown = false; renderReview();
}
function startQuiz(deckId) {
  const cards = S.study.cards.filter(c => c.deckId === deckId);
  S.quiz = { i: 0, qs: shuffle(cards).slice(0, 8).map(c => { const ch = shuffle([c.back, ...shuffle(cards.filter(x => x.id !== c.id && x.back !== c.back)).slice(0, 3).map(x => x.back)]); return { cardId: c.id, q: c.front, choices: ch, answer: ch.indexOf(c.back) }; }) };
  renderQuiz();
}
function renderQuiz() {
  const z = S.quiz, v = $('v-study');
  if (z.i >= z.qs.length) { const right = z.qs.filter(q => q.picked === q.answer).length; v.innerHTML = `<div class="empty"><b>${right} / ${z.qs.length}</b>${right === z.qs.length ? 'Perfect!' : 'Missed ones come back for review soon.'}<br><br><button class="big" id="back">Back</button></div>`; return; }
  const q = z.qs[z.i];
  v.innerHTML = `<div class="thread-bar"><button class="hbtn" id="back">‹ Quit</button><b></b><span>${z.i + 1} / ${z.qs.length}</span></div><div class="card" style="min-height:140px"><div class="f">${esc(q.q)}</div></div>
    <div class="qz">${q.choices.map((c, j) => `<button data-qa="${j}" class="${q.picked === undefined ? '' : j === q.answer ? 'right' : j === q.picked ? 'wrong' : ''}">${esc(c)}</button>`).join('')}</div>
    ${q.picked !== undefined ? '<button class="big" id="qnext">Next</button>' : ''}`;
}

// ---------- Shared Spaces: study with friends (invite code, feed, shared decks, ask Nexus for the group)
const nick = () => store.get('nick', '') || (S.user?.email || 'Friend').split('@')[0].slice(0, 24);
async function loadSpaces() {
  const { data, error } = await sb.from('shared_spaces').select('id,name,code,color,owner,created_at').order('created_at');
  if (error) { S.spacesMissing = /shared_spaces/.test(error.message); S.spaces = []; return; }
  S.spaces = data;
}
function spacesBlock() {
  if (S.spaces === null) { loadSpaces().then(() => { if (S.tab === 'study' && !S.space && !S.review && !S.quiz && !S.deckView) renderStudy(); }); return ''; }
  if (S.spacesMissing) return `<div class="group">SHARED SPACES</div><div class="note" style="margin:0 4px 8px">Run the v1.8 Supabase SQL to study with friends.</div>`;
  return `<div class="group">SHARED SPACES<button class="hbtn" id="spJoin">Join</button><button class="hbtn" id="spNew" style="margin-left:0">＋ New</button></div>` +
    (S.spaces.length ? S.spaces.map(x => `<button class="item" data-space="${esc(x.id)}"><span class="dots2"><i style="background:${esc(x.color)};width:10px;height:10px"></i></span><span class="main"><b>👥 ${esc(x.name)}</b><small>Code ${esc(x.code)}</small></span></button>`).join('')
      : `<div class="note" style="margin:0 4px 8px">Make a space, share its code with a friend, and study together: chat, share decks, see each other's streaks, and ask Nexus for the group.</div>`);
}
async function createSpace() {
  const name = await ask('New Shared Space', { placeholder: 'Bio study crew', ok: 'Next' }); if (!name) return;
  const n = await ask('Your name in the space', { value: nick(), ok: 'Create' }); if (!n) return;
  store.set('nick', n);
  const { data, error } = await sb.rpc('create_shared_space', { p_name: name, p_nickname: n, p_color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() });
  if (error) return toast(error.message);
  await loadSpaces(); openSpace(data.id);
  toast(`Share code ${data.code} with a friend`);
}
async function joinSpace() {
  const code = await ask('Join a Shared Space', { placeholder: 'Invite code (6 letters)', ok: 'Next' }); if (!code) return;
  const n = await ask('Your name in the space', { value: nick(), ok: 'Join' }); if (!n) return;
  store.set('nick', n);
  const { data, error } = await sb.rpc('join_shared_space', { p_code: code.replace(/\s/g, ''), p_nickname: n });
  if (error) return toast(error.message);
  await loadSpaces(); openSpace(data.id);
}
async function openSpace(id) {
  const sp = (S.spaces || []).find(x => x.id === id); if (!sp) { await loadSpaces(); if (!(S.spaces || []).some(x => x.id === id)) return toast('That space is gone.'); return openSpace(id); }
  S.space = sp; S.posts = []; S.members = []; S.spaceSig = null;
  setTab('study');
  await loadSpace(); updateMyStats(); renderSpace(); $('main').scrollTop = $('main').scrollHeight;
}
async function loadSpace() {
  const id = S.space.id;
  const [p, m] = await Promise.all([
    sb.from('shared_space_posts').select('id,user_id,nickname,kind,content,data,created_at').eq('space_id', id).order('created_at', { ascending: false }).limit(80),
    sb.from('shared_space_members').select('user_id,nickname,streak,reviewed_today,stats_day,updated_at').eq('space_id', id)]);
  if (S.space?.id !== id) return;
  if (!p.error) S.posts = p.data.reverse();
  if (!m.error) S.members = m.data;
}
let statsAt = 0;
async function updateMyStats() {
  if (!S.study || Date.now() - statsAt < 60e3) return;
  statsAt = Date.now();
  const st = S.study.stats || {};
  await sb.from('shared_space_members').update({ streak: st.streak || 0, reviewed_today: st.reviewedToday || 0, stats_day: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('user_id', S.user.id);
}
function renderSpace() {
  const sp = S.space, v = $('v-study'), me = S.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const pending = S.rows.filter(r => r.kind === 'ask' && r.meta?.spaceId === sp.id && !S.rows.some(x => x.reply_to === r.id));
  const sig = JSON.stringify([sp.id, S.posts.map(p => p.id), S.members.map(m => m.nickname + m.streak + m.reviewed_today), pending.length]);
  if (sig === S.spaceSig && v.querySelector('.sp-feed')) return;
  S.spaceSig = sig;
  const draft = $('spText')?.value || '', typing = document.activeElement?.id === 'spText', caret = $('spText')?.selectionStart;
  const nearBottom = $('main').scrollHeight - $('main').scrollTop - $('main').clientHeight < 160;
  v.innerHTML = `<div class="thread-bar"><button class="hbtn" id="spBack">‹</button><b>👥 ${esc(sp.name)}</b><button class="hbtn" id="spInvite">Invite</button><button class="hbtn" id="spMore">⋯</button></div>
    <div class="members">${S.members.sort((a, b) => b.streak - a.streak).map(m => `<div>${m.user_id === me ? '⭐ ' : ''}${esc(m.nickname)}<small>🔥 ${m.streak} · ${m.stats_day === today ? m.reviewed_today : 0} today</small></div>`).join('')}</div>
    <div class="sp-feed">${S.posts.map(p => {
      if (p.kind === 'join') return `<div class="post join">${esc(p.content)}</div>`;
      const mine = p.user_id === me;
      const head = `<div class="by">${p.kind === 'ai' ? `<i style="width:7px;height:7px;border-radius:50%;background:${esc(HEX.test(p.data?.color || '') ? p.data.color : 'var(--accent)')}"></i>` : ''}${esc(p.nickname)}<span>${ago(new Date(p.created_at).getTime())}</span></div>`;
      if (p.kind === 'deck') return `<div class="post ${mine ? 'me' : ''}">${head}<div class="deckshare"><div>🃏 <b>${esc(p.content)}</b><br><small class="note">${(p.data?.cards || []).length} card${(p.data?.cards || []).length === 1 ? "" : "s"}</small></div>${mine ? '' : `<button data-take="${esc(p.id)}">Add to my decks</button>`}</div></div>`;
      if (p.kind === 'ai') return `<div class="post msg ai" style="max-width:100%;width:100%" data-post="${esc(p.id)}">${head}${p.data?.q ? `<div class="note">↳ ${esc(p.data.q)}</div>` : ''}<div class="body">${md(p.content)}</div></div>`;
      return `<div class="post ${mine ? 'me' : ''}">${head}<div style="white-space:pre-wrap">${esc(p.content)}</div></div>`;
    }).join('') || '<div class="empty"><b>Say hi 👋</b>Share the invite code so friends can join.</div>'}
    ${pending.length ? `<div class="wait"><span class="dots"><i></i><i></i><i></i></span>${esc(short(agentOf(pending.at(-1).agent).name))} is thinking…</div>` : ''}</div>
    <textarea class="field" id="spText" rows="2" placeholder="Message the space…">${esc(draft)}</textarea>
    <div class="acts"><button id="spSend">Send</button><button id="spAsk">✨ Ask ${esc(short(agentOf(S.agent).name))}</button><button id="spDeck">🃏 Share a deck</button><button id="spAgent">Switch agent</button></div>`;
  v.querySelectorAll('[data-post]').forEach(el => { const p = S.posts.find(x => x.id === el.dataset.post); enhance(el.querySelector('.body'), 'post:' + p.id, { ts: 1 }, { onAsk: t => spaceAsk(t) }); });
  if (typing) { $('spText').focus(); try { $('spText').setSelectionRange(caret, caret); } catch {} }
  if (nearBottom) $('main').scrollTop = $('main').scrollHeight;
}
async function spacePost(row) {
  const { error } = await sb.from('shared_space_posts').insert({ space_id: S.space.id, nickname: nick(), ...row });
  if (error) toast(error.message); else { await loadSpace(); renderSpace(); $('main').scrollTop = $('main').scrollHeight; }
  return !error;
}
async function spaceAsk(text) {
  const sp = S.space;
  if (!await spacePost({ kind: 'msg', content: text.slice(0, 4000) })) return;
  const context = S.posts.filter(p => p.kind === 'msg' || p.kind === 'ai').slice(-8).map(p => `${p.nickname}: ${String(p.content).slice(0, 300)}`).join('\n');
  const { error } = await sb.from('relay_messages').insert({ direction: 'to_desktop', kind: 'ask', agent: S.agent, content: text.slice(0, 8000), meta: { spaceId: sp.id, spaceName: sp.name, nick: nick(), context } });
  if (error) return toast(error.message);
  if (!online()) toast('Your Mac answers when Nexus is open there.');
  refresh();
}
async function spaceClick(t) {
  const sp = S.space;
  if (t.id === 'spBack') { S.space = null; return renderStudy(); }
  if (t.id === 'spInvite') {
    const text = `Join my Nexus Shared Space "${sp.name}" in N28C: code ${sp.code}\n${location.origin + location.pathname}`;
    if (navigator.share) navigator.share({ title: 'N28C', text }).catch(() => {}); else { navigator.clipboard?.writeText(text); toast(`Copied. Code: ${sp.code}`); }
    return;
  }
  if (t.id === 'spMore') {
    return sheet(`<h3>${esc(sp.name.toUpperCase())}</h3><div class="center">Invite code</div><div class="center code">${esc(sp.code)}</div>
      <button class="opt" data-x="nick">✎ <b>Change my name</b><small>${esc(nick())}</small></button><button class="opt danger" data-x="leave">🚪 <b>Leave space</b></button>${sp.owner === S.user.id ? '<button class="opt danger" data-x="del">🗑 <b>Delete space for everyone</b></button>' : ''}`, async e => {
      const b = e.target.closest('[data-x]'); if (!b) return; closeSheet();
      if (b.dataset.x === 'nick') { const n = await ask('Your name', { value: nick() }); if (n) { store.set('nick', n); await sb.from('shared_space_members').update({ nickname: n.slice(0, 24) }).eq('user_id', S.user.id); await loadSpace(); renderSpace(); } }
      if (b.dataset.x === 'leave' && confirm(`Leave ${sp.name}?`)) { await sb.from('shared_space_members').delete().eq('space_id', sp.id).eq('user_id', S.user.id); S.space = null; await loadSpaces(); renderStudy(); }
      if (b.dataset.x === 'del' && confirm(`Delete ${sp.name} and its messages for everyone?`)) { await sb.from('shared_spaces').delete().eq('id', sp.id); S.space = null; await loadSpaces(); renderStudy(); }
    });
  }
  if (t.id === 'spSend') { const v = $('spText').value.trim(); if (!v) return; if (await spacePost({ kind: 'msg', content: v.slice(0, 4000) })) $('spText').value = ''; }
  if (t.id === 'spAsk') { const v = $('spText').value.trim(); if (!v) return toast('Type a question first'); $('spText').value = ''; spaceAsk(v); }
  if (t.id === 'spAgent') pickAgent(() => { S.spaceSig = null; renderSpace(); });
  if (t.id === 'spDeck') {
    if (!S.study?.decks.length) return toast('You have no decks to share yet.');
    sheet(`<h3>SHARE A DECK</h3>${S.study.decks.map(d => `<button class="opt" data-d="${esc(d.id)}"><i style="background:${esc(d.color)}"></i><b>${esc(d.name)}</b><small>${d.total} cards</small></button>`).join('')}`, async e => {
      const b = e.target.closest('[data-d]'); if (!b) return; closeSheet();
      const d = S.study.decks.find(x => x.id === b.dataset.d);
      const cards = S.study.cards.filter(c => c.deckId === d.id).slice(0, 150).map(c => ({ front: c.front.slice(0, 400), back: c.back.slice(0, 600) }));
      spacePost({ kind: 'deck', content: d.name.slice(0, 60), data: { cards } });
    });
  }
  if (t.dataset.take) {
    const p = S.posts.find(x => x.id === t.dataset.take); t.disabled = true; t.textContent = 'Adding…';
    const r = await request('add_cards', { deck: p.content, cards: p.data?.cards || [] });
    t.textContent = r.ok ? '✓ Added' : 'Try again'; if (!r.ok) { t.disabled = false; toast(reqErr(r)); } else loadSync(['study']);
  }
}

// ---------- Mac: Send to Mac, clipboard bridge, missions, notifications
function renderMac() {
  const v = $('v-mac'), st = S.status || {}, d = S.sendDraft;
  const keep = { st: $('sendText')?.value, su: $('sendUrl')?.value, mg: $('mGoal')?.value, ct: $('clipOut')?.value };
  if (keep.st !== undefined) d.text = keep.st; if (keep.su !== undefined) d.url = keep.su;
  const m = st.mission, running = m && !['done', 'error'].includes(m.status);
  const pr = st.push?.prefs;
  v.innerHTML = `
    <div class="panel"><h4>SEND TO MAC</h4>
      <textarea class="field" id="sendText" rows="3" placeholder="Text, a note, a question…">${esc(d.text)}</textarea>
      <input class="field" id="sendUrl" style="margin-top:6px" placeholder="Link (optional)" value="${esc(d.url)}" inputmode="url">
      ${d.photo ? `<div class="photo" style="margin-top:8px"><img src="${d.photo.url}" alt=""><span>Photo</span><button id="sendUnphoto">✕</button></div>` : ''}
      <div class="acts"><button data-send="summarize">✨ Summarize</button><button data-send="save">📥 Save to a chat</button><button data-send="open" ${d.url ? '' : 'disabled'}>🌐 Open link on Mac</button><button data-send="clipboard">📋 Copy on Mac</button></div>
      <button class="link" id="sendPhoto">${d.photo ? 'Change photo' : '＋ Add a photo'}</button></div>

    <div class="panel"><h4>CLIPBOARD</h4>
      <div class="row2"><button class="big ghost" id="clipGet" style="margin:0">⬇ Get Mac's clipboard</button><button class="big ghost" id="clipPut" style="margin:0">⬆ Send my clipboard</button></div>
      ${S.clip ? `<div class="cliptext">${esc(S.clip.text || '(the Mac clipboard has no text)')}</div>${S.clip.text ? '<button class="link" id="clipCopy">Copy to this phone</button>' : ''}
        ${S.clip.recent?.length ? `<div class="note" style="margin-top:6px">Recent on your Mac (tap to copy here)</div>${S.clip.recent.map((t, i) => `<button class="clipitem" data-ci="${i}">${esc(t.replace(/\s+/g, ' ').slice(0, 90))}</button>`).join('')}` : ''}` : '<div class="note" style="margin-top:8px">Copy something on your Mac, then get it here, or send what you copied on your phone to your Mac.</div>'}
    </div>

    <div class="panel mstatus"><h4>MISSIONS${running ? '<span>● running</span>' : ''}</h4>
      ${m ? `<b>⚑ ${esc(m.title)}</b><div class="prog"><span style="width:${Math.round(Math.min(1, m.elapsed / m.budget) * 100)}%"></span></div>
        <div class="note">${esc(m.status === 'done' ? 'Done: the report is ready' : m.status === 'error' ? 'Stopped: ' + m.error : `Round ${m.round} · ${m.activity || 'working'} · ${Math.max(0, Math.round((m.budget - m.elapsed) / 60e3))} min left`)}</div>
        <div class="row2" style="margin-top:8px"><button class="big ghost" data-open="${esc(m.convId)}" style="margin:0">Watch it</button>${running ? '<button class="big ghost" id="mEnd" style="margin:0">End now</button>' : ''}</div>` : ''}
      ${running ? '' : `<div class="tpl">${(st.templates || []).map((t, i) => `<button data-tpl="${i}">${esc(t.icon)} ${esc(t.name)}</button>`).join('')}</div>
        <textarea class="field" id="mGoal" rows="3" placeholder="Give Paragon a goal: research, plan, compare…">${esc(keep.mg ?? '')}</textarea>
        <div class="chips" id="mMin" style="margin-top:8px">${[10, 20, 30, 60].map(n => `<button data-min="${n}" class="${n === (S.mMin || 20) ? 'on' : ''}">${n} min</button>`).join('')}</div>
        <button class="big" id="mStart">⚑ Start mission</button><div class="note">Paragon works on your Mac in the background. You'll get a notification when the report is ready.</div>`}
    </div>

    <div class="panel"><h4>NOTIFICATIONS${pushOn() ? '<span>on</span>' : ''}</h4>${notifyBlock(pr)}</div>

    <div class="panel"><h4>YOUR MAC</h4><span class="note">Nexus '28 ${esc(st.version || '')} · ${online() ? 'online now' : S.lastSeen ? 'last seen ' + ago(S.lastSeen) + ' ago' : 'offline'} · synced ${st.at ? ago(st.at) + ' ago' : '—'}</span>
      ${st.theme ? `<div class="note" style="margin-top:6px"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--accent);margin-right:6px"></i>Theme: ${esc(st.theme.name)} · orb: ${esc(st.theme.skin || 'aurora')} — matches your Mac (change them there in Settings)</div>` : ''}
      <button class="big ghost" data-sync>Sync now</button></div>`;
}
let pushState = store.get('push', null);
const pushOn = () => !!pushState?.on && typeof Notification !== 'undefined' && Notification.permission === 'granted';
function notifyBlock(pr) {
  const can = 'serviceWorker' in navigator && 'PushManager' in window;
  if (!can && isIOS && !standalone()) return `<div class="note">To get notifications on iPhone, add N28C to your Home Screen: tap <b>Share</b> → <b>Add to Home Screen</b>, then open N28C from there and come back here.</div>`;
  if (!can) return `<div class="note">This browser doesn't support notifications.</div>`;
  if (!S.status?.push?.key) return `<div class="note">Update Nexus on your Mac to v1.8 to get notifications.</div>`;
  if (!pushOn()) return `<div class="note">Get a buzz when an answer, mission or routine is ready, when friends post in your Shared Spaces, plus a study reminder and an evening streak-saver.</div><button class="big" id="pushOn">🔔 Turn on notifications</button>`;
  const p = pr || {};
  const row = (k, label, sub) => `<label class="tgl"><span>${label}<small>${sub}</small></span><input type="checkbox" data-pk="${k}" ${p[k] ? 'checked' : ''}></label>`;
  const time = (k, label, sub) => `<label class="tgl"><span>${label}<small>${sub}</small></span><input type="checkbox" data-pt="${k}" ${p[k] ? 'checked' : ''}><input type="time" data-ptime="${k}" value="${esc(p[k] || (k === 'study' ? '19:00' : '20:30'))}" ${p[k] ? '' : 'disabled'}></label>`;
  return row('replies', 'Answers', 'When an answer is ready and N28C is closed') + row('missions', 'Missions', 'When a mission finishes') + row('routines', 'Routines', 'Morning Brief, Wrap-up and your routines') + row('spaces', 'Shared Spaces', 'When friends post') +
    time('study', '📚 Study reminder', 'If cards are due') + time('streak', "🔥 Streak-saver", "If today's challenge isn't done") +
    `<div class="row2" style="margin-top:8px"><button class="big ghost" id="pushTest" style="margin:0">Send a test</button><button class="big ghost" id="pushOff" style="margin:0">Turn off</button></div><div class="note">Your Mac sends these, so it needs to be on (asleep is OK for a while).</div>`;
}
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications are blocked. Allow them in Settings for this app.');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && pushState?.key !== S.status.push.key) { await sub.unsubscribe(); sub = null; }
    sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(S.status.push.key) });
    const device = store.get('device', null) || ('d' + Math.random().toString(36).slice(2, 10)); store.set('device', device);
    const { error } = await sb.from('companion_sync').upsert({ key: 'push:' + device, data: { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 160), at: Date.now() }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (error) throw error;
    pushState = { on: true, key: S.status.push.key, device }; store.set('push', pushState);
    renderMac(); toast('Notifications on 🔔');
  } catch (e) { toast('Could not turn on notifications: ' + e.message); }
}
async function disablePush() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); await sub?.unsubscribe(); } catch {}
  if (pushState?.device) await sb.from('companion_sync').delete().eq('key', 'push:' + pushState.device);
  pushState = null; store.set('push', null); renderMac();
}
async function setPrefs(patch) { const r = await request('set_prefs', { prefs: patch }); if (r.ok && S.status?.push) { S.status.push.prefs = r.prefs; } else if (!r.ok) toast(reqErr(r)); }
$('v-mac').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.pk) setPrefs({ [t.dataset.pk]: t.checked });
  if (t.dataset.pt) { const tm = $('v-mac').querySelector(`[data-ptime="${t.dataset.pt}"]`); tm.disabled = !t.checked; setPrefs({ [t.dataset.pt]: t.checked ? tm.value : '' }); }
  if (t.dataset.ptime) setPrefs({ [t.dataset.ptime]: t.value });
});
$('v-mac').onclick = async e => {
  const t = e.target.closest('button'); if (!t) return;
  const d = S.sendDraft;
  if (t.id === 'sendPhoto') { d.text = $('sendText').value; d.url = $('sendUrl').value; fileFor = 'send'; return $('file').click(); }
  if (t.id === 'sendUnphoto') { d.photo = null; return renderMac(); }
  if (t.dataset.send) {
    d.text = $('sendText').value.trim(); d.url = $('sendUrl').value.trim();
    if (!d.text && !d.url && !d.photo) return toast('Add some text, a link or a photo.');
    if (d.url && !/^https?:\/\//i.test(d.url)) d.url = 'https://' + d.url;
    t.disabled = true; const label = t.textContent; t.textContent = 'Sending…';
    try {
      const fileId = d.photo ? await upload(d.photo) : null;
      const r = await request('inbox', { action: t.dataset.send, text: d.text, url: d.url, ...(fileId ? { fileId } : {}), agent: S.agent });
      if (!r.ok) throw new Error(reqErr(r));
      toast(r.done || 'Sent'); S.sendDraft = { text: '', url: '', photo: null }; renderMac();
    } catch (err) { toast(err.message); t.disabled = false; t.textContent = label; }
    return;
  }
  if (t.id === 'clipGet') { t.textContent = 'Getting…'; const r = await request('clip_get', {}, 20000); if (r.ok) { S.clip = r; renderMac(); } else { toast(reqErr(r)); t.textContent = "⬇ Get Mac's clipboard"; } }
  if (t.id === 'clipCopy') { try { await navigator.clipboard.writeText(S.clip.text); toast('Copied to this phone'); } catch { toast("Couldn't copy here"); } }
  if (t.dataset.ci !== undefined) { try { await navigator.clipboard.writeText(S.clip.recent[+t.dataset.ci]); toast('Copied to this phone'); } catch { toast("Couldn't copy here"); } }
  if (t.id === 'clipPut') {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch {}
    if (!text) text = await ask('Send to your Mac clipboard', { multiline: true, placeholder: 'Paste or type here', ok: 'Send' }) || '';
    if (!text) return;
    const r = await request('clip_set', { text }); toast(r.ok ? '📋 On your Mac clipboard' : reqErr(r));
  }
  if (t.dataset.tpl !== undefined) { const tp = S.status.templates[+t.dataset.tpl]; $('mGoal').value = tp.goal.replace(/\{(\w+)\}/g, (m, k) => `[${(tp.fields || []).find(f => f.key === k)?.label || k}]`); S.mMin = tp.minutes; $('mGoal').focus(); return; }
  if (t.dataset.min) { S.mMin = +t.dataset.min; $('mMin').querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t)); return; }
  if (t.id === 'mStart') {
    const goal = $('mGoal').value.trim(); if (goal.length < 6) return toast('Describe the mission in a sentence or two.');
    if (/\[[^\]]+\]/.test(goal)) return toast('Fill in the [blanks] first.');
    t.disabled = true; t.textContent = 'Starting…';
    const r = await request('mission_start', { goal, minutes: S.mMin || 20 });
    if (!r.ok) { toast(reqErr(r)); t.disabled = false; t.textContent = '⚑ Start mission'; return; }
    await loadSync(['status', 'chats']); toast('⚑ Mission started'); openChat({ id: r.convId, title: r.title ? 'Mission: ' + r.title : 'Mission' });
  }
  if (t.id === 'mEnd') { if (confirm('End the mission now? Paragon writes the report with what it has.')) { const r = await request('mission_end'); if (!r.ok) toast(reqErr(r)); } }
  if (t.dataset.open) openChat({ id: t.dataset.open, title: S.status.mission?.title ? 'Mission: ' + S.status.mission.title : 'Mission' });
  if (t.id === 'pushOn') enablePush();
  if (t.id === 'pushOff') disablePush();
  if (t.id === 'pushTest') { const r = await request('push_test'); toast(r.ok ? (r.sent ? 'Sent. It should arrive in a few seconds.' : "Your Mac couldn't reach this phone. Turn notifications off and on again.") : reqErr(r)); }
};

// ---------- you: stats, challenge, routines
function renderYou() {
  const v = $('v-you'), st = S.status;
  if (!st?.stats) { v.innerHTML = noSync('your stats'); return; }
  const ch = st.challenge;
  v.innerHTML = `
    ${ch ? `<div class="panel challenge"><h4>TODAY'S CHALLENGE</h4><b>${esc(ch.icon)} ${esc(ch.text)}</b><div class="prog"><span style="width:${Math.round(ch.progress / ch.n * 100)}%"></span></div><span class="note">${ch.done ? '✓ Done' : `${ch.progress}/${ch.n} · +${ch.bonus} points`}${ch.streak > 1 ? ` · 🔥 ${ch.streak}-day streak` : ''}</span></div>` : ''}
    <div class="stats"><div><b>${st.stats.points}</b><span>points</span></div><div><b>${st.stats.streak}</b><span>day streak</span></div><div><b>${st.stats.achievements}/${st.stats.achievementsTotal}</b><span>achievements</span></div></div>
    ${st.stats.recent?.length ? `<div class="panel"><h4>RECENT ACHIEVEMENTS</h4><div class="ach">${st.stats.recent.map(a => `<span>${esc(a.icon)} ${esc(a.name)}</span>`).join('')}</div></div>` : ''}
    <div class="panel"><h4>ROUTINES</h4>${(st.routines || []).map(r => `<div class="rt"><div><b>${esc(r.kind === 'brief' ? '☀ ' : r.kind === 'wrap' ? '☾ ' : '⟳ ')}${esc(r.name)}</b><small>${esc(r.enabled ? r.when : 'Off')}${r.lastRun ? ' · last ' + ago(r.lastRun) : ''}</small></div><button data-run="${esc(r.id)}">${r.running ? 'Running…' : 'Run'}</button></div>`).join('') || '<span class="note">No routines yet.</span>'}</div>
    <div style="text-align:center"><span class="note">${esc(S.user?.email || '')}</span><br><button class="link" id="out">Sign out</button></div>`;
}
$('v-you').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.run) { b.textContent = 'Starting…'; const r = await request('run_routine', { id: b.dataset.run }); toast(r.ok ? `Started ${r.started}. It'll show in Chats` : reqErr(r)); }
  if (b.id === 'out') { await disablePush().catch(() => {}); await sb.auth.signOut(); localStorage.clear(); location.reload(); }
};

// ---------- sign in, notifications from the service worker, links (#chat=…, #space=…), share sheet (Android)
function signInView(msg = '') {
  $('tabs').hidden = true; $('composer').classList.remove('on');
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-login'));
  $('v-login').innerHTML = `<form class="login" id="f"><img src="icon-192.png" alt=""><h1>N28C</h1><p>Nexus '28 on your phone. Sign in with the same Nexus account as on your Mac, then turn on <b>Phone companion</b> in the Mac app (Settings → Beta).</p>
    <input id="em" type="email" autocomplete="username" placeholder="Email" required><input id="pw" type="password" autocomplete="current-password" placeholder="Password" required>
    <button class="big" style="margin:0">Sign in</button><div class="err" id="er">${esc(msg)}</div></form>`;
  $('f').onsubmit = async e => {
    e.preventDefault(); $('er').textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: $('em').value.trim(), password: $('pw').value });
    if (error) $('er').textContent = error.message; else start();
  };
}
function route(hash) {
  const h = String(hash || '').replace(/^.*#/, '');
  if (!h || !S.user) return;
  const [k, v] = h.split('=');
  if (k === 'chat' && v) { const c = S.chats?.list.find(x => x.id === v); openChat(c || { id: v, title: 'Chat' }); }
  else if (k === 'chat') setTab('chat');
  else if (k === 'space' && v) openSpace(v);
  else if (['study', 'you', 'mac', 'chats'].includes(k)) setTab(k);
  history.replaceState(null, '', location.pathname);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.type === 'push') refresh(); if (e.data?.type === 'open') route(e.data.url); });
}
function shareIn() {
  const p = new URLSearchParams(location.search);
  const text = [p.get('share_title'), p.get('share_text')].filter(Boolean).join('\n'), url = p.get('share_url') || (p.get('share_text') || '').match(/https?:\/\/\S+/)?.[0] || '';
  if (!text && !url) return false;
  S.sendDraft = { text: text.replace(url, '').trim(), url, photo: null };
  history.replaceState(null, '', location.pathname);
  return true;
}
let timer = null, seenTimer = null;
async function start() {
  const { data } = await sb.auth.getSession();
  S.user = data.session?.user || null;
  if (!S.user) return signInView();
  $('tabs').hidden = false;
  const shared = shareIn();
  setTab(shared ? 'mac' : S.tab);
  await refresh();
  route(location.hash);
  clearInterval(timer); timer = setInterval(refresh, 3000);
  clearInterval(seenTimer); seen(); seenTimer = setInterval(seen, 30000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) { refresh(); seen(); } });
start();
