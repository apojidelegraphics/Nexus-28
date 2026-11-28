// N28C 4.3.0. Loaded after app.js and shares its globals (S, sb, request, sheet, toast, esc, store, md…).
// Phone-only answers · offline mode · camera modes · place reminders · haptics and sounds · daily brief card ·
// streak saver · friends feed · remote actions · screen peek · live mission view with Approve · Jots & Docs ·
// Live Spaces · weekly report card · classes · pinned achievements.
(() => {
  'use strict';
  const VERSION = '4.3.0';
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, args); if (error) return { ok: false, error: /function|PGRST202|does not exist/i.test(error.message) ? 'This needs the 4.3.0 database update.' : error.message }; return data; };
  const st = () => S.status || {};
  const ic = n => window.NexusIcons?.icon?.(n) || '';   // 4.3.1: the app's own line icons (no emojis in buttons)
  const since = ts => { const a = ago(ts); return a === 'now' ? 'just now' : /^\d+[smhdw]$/.test(a) ? a + ' ago' : a; };
  const CSS = `
  .n43-card{background:linear-gradient(160deg,rgba(var(--rgb),.12),transparent 70%);border:1px solid rgba(var(--rgb),.25);border-radius:16px;padding:12px 14px;margin:0 0 10px;text-align:left}
  .n43-card h4{margin:0 0 6px;font:600 11px var(--mono);letter-spacing:.2em;color:var(--muted);display:flex;gap:8px;align-items:center}.n43-card h4 span{margin-left:auto;letter-spacing:.05em}
  .n43-hello{font-size:17px;font-weight:700;margin-bottom:6px}
  .n43-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0}.n43-stats div{background:rgba(var(--rgb),.06);border-radius:10px;padding:7px 8px}.n43-stats b{display:block;font-size:17px}.n43-stats small{color:var(--muted);font-size:11px}
  .n43-li{display:flex;gap:8px;align-items:flex-start;padding:5px 0;border-top:1px solid rgba(var(--rgb),.08);font-size:13.5px}.n43-li:first-child{border-top:0}.n43-li small{margin-left:auto;color:var(--muted);flex:none}
  .n43-brief{font-size:13.5px;max-height:150px;overflow:hidden;position:relative;margin-top:6px}.n43-brief.open{max-height:none}.n43-brief:not(.open)::after{content:'';position:absolute;inset:auto 0 0;height:40px;background:linear-gradient(transparent,var(--panel,#071a12))}
  .n43-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.n43-btns button,.n43-chip{border:1px solid rgba(var(--rgb),.3);background:rgba(var(--rgb),.06);color:var(--fg,#e7fff3);border-radius:12px;padding:8px 12px;font:600 13px inherit;font-family:inherit}
  .n43-btns button.pri{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}.n43-btns button.dan{border-color:rgba(255,120,120,.5);color:#ff9a9a}
  .n43-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.n43-grid button{border:1px solid rgba(var(--rgb),.25);background:rgba(var(--rgb),.05);color:inherit;border-radius:12px;padding:10px 4px;font:600 12px inherit;font-family:inherit}.n43-grid button i{display:block;font-style:normal;font-size:20px;margin-bottom:3px}
  .n43-mode{display:flex;gap:6px;align-items:center;margin:0 0 8px;font-size:12px;color:var(--muted)}.n43-mode button{white-space:nowrap;border:1px solid rgba(var(--rgb),.25);background:none;color:var(--muted);border-radius:10px;padding:3px 9px;font-size:12px}.n43-mode button.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
  .n43-po{font:600 10px var(--mono);letter-spacing:.1em;color:var(--muted);margin-top:4px}
  .n43-step{display:flex;gap:8px;font-size:13px;padding:4px 0}.n43-step i{width:7px;height:7px;border-radius:50%;background:rgba(var(--rgb),.35);margin-top:6px;flex:none}.n43-step.now i{background:var(--accent);box-shadow:0 0 0 4px rgba(var(--rgb),.2)}
  .n43-appr{border:1px solid rgba(255,211,107,.5);background:rgba(255,211,107,.08);border-radius:12px;padding:10px;margin-bottom:8px}.n43-appr b{display:block}.n43-appr small{color:var(--muted)}
  .n43-feed{display:flex;gap:10px;padding:8px 0;border-top:1px solid rgba(var(--rgb),.08)}.n43-feed:first-of-type{border-top:0}.n43-feed img,.n43-feed .av{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none;background:rgba(var(--rgb),.15);display:grid;place-items:center;font-weight:700}
  .n43-feed .tx{flex:1;font-size:13.5px}.n43-feed .tx small{display:block;color:var(--muted);font-size:11.5px}.n43-rx{display:flex;gap:4px;margin-top:5px;flex-wrap:wrap}.n43-rx button{border:1px solid rgba(var(--rgb),.2);background:none;border-radius:10px;padding:2px 7px;font-size:12px;color:inherit}.n43-rx button.on{background:rgba(var(--rgb),.2);border-color:var(--accent)}
  .n43-doc{display:block;width:100%;text-align:left;border:1px solid rgba(var(--rgb),.15);background:rgba(var(--rgb),.04);border-radius:12px;padding:9px 11px;margin-bottom:6px;color:inherit;font:inherit}.n43-doc b{display:block;font-size:14px}.n43-doc small{color:var(--muted);font-size:12px}
  .n43-docbody{font-size:14.5px;line-height:1.55;max-height:60vh;overflow:auto}
  .n43-peek img{width:100%;border-radius:12px;border:1px solid rgba(var(--rgb),.2)}
  .n43-pins{display:flex;flex-wrap:wrap;gap:6px}.n43-pins button{border:1px solid rgba(var(--rgb),.2);background:none;border-radius:12px;padding:6px 9px;font-size:12.5px;color:inherit;opacity:.85}.n43-pins button.on{border-color:var(--accent);background:rgba(var(--rgb),.14);opacity:1}
  .n43-sp{border:1px solid rgba(var(--rgb),.15);border-left:4px solid var(--c,var(--accent));border-radius:12px;padding:9px 11px;margin-bottom:6px;display:block;width:100%;text-align:left;background:none;color:inherit;font:inherit}.n43-sp b{display:block}.n43-sp small{color:var(--muted);font-size:12px}
  .n43-card .nxr{width:100%;box-shadow:none}
  .n43-report{margin:0 0 10px}.n43-report .nxr{width:100%;box-shadow:none}
  .n43-today{border:1px solid rgba(var(--rgb),.2);background:rgba(var(--rgb),.05);border-radius:16px;padding:12px;margin:0 0 10px;text-align:left;display:grid;gap:9px}
  .n43-th{display:flex;align-items:baseline;gap:8px}.n43-th b{font-size:16px}.n43-th small{margin-left:auto;color:var(--muted);font-size:12px}
  .n43-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.n43-nums button{display:flex;align-items:center;gap:6px;border:1px solid rgba(var(--rgb),.14);background:rgba(var(--rgb),.06);border-radius:12px;padding:7px 9px;color:inherit;font:inherit;text-align:left}
  .n43-nums span{color:var(--accent);display:flex}.n43-nums svg{width:15px;height:15px}.n43-nums b{font-size:16px}.n43-nums small{color:var(--muted);font-size:11px;margin-left:auto}
  .n43-next{display:flex;align-items:center;gap:8px;font-size:13.5px;min-width:0}.n43-next svg{width:15px;height:15px;color:var(--accent);flex:none}.n43-next span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.n43-next small{color:var(--muted);flex:none}
  .n43-tacts{display:flex;gap:6px;flex-wrap:wrap}.n43-tacts button{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(var(--rgb),.22);background:none;color:var(--fg,#e7fff3);border-radius:10px;padding:6px 10px;font:600 12.5px inherit;font-family:inherit}.n43-tacts svg{width:14px;height:14px;color:var(--accent)}.n43-tacts .hot{border-color:rgba(255,160,80,.55)}.n43-tacts .hot svg{color:#ffa050}
  .n43-focus{display:flex;align-items:center;gap:10px;border:1px solid rgba(var(--rgb),.35);background:linear-gradient(90deg,rgba(var(--rgb),.14),rgba(var(--rgb),.03));border-radius:12px;padding:8px 10px}.n43-focus.brk{border-color:rgba(120,190,255,.45)}
  .n43-fi{color:var(--accent);display:flex}.n43-fi svg{width:18px;height:18px}.n43-focus b{font:700 18px var(--mono);display:block;line-height:1.1;color:var(--text,#e2fff1);opacity:1}.n43-focus small{color:var(--muted);font-size:11.5px}.n43-focus div{flex:1;min-width:0}.n43-focus.big b{font-size:26px}
  .n43-focus button{border:1px solid rgba(255,120,120,.5);background:none;color:#ff9a9a;border-radius:10px;padding:6px 12px;font:600 13px inherit;font-family:inherit}
  .n43-seg{display:inline-flex;border:1px solid rgba(var(--rgb),.22);border-radius:10px;padding:2px;gap:2px}.n43-seg button{border:0!important;border-radius:8px!important;padding:3px 10px!important}
  .n43-sps{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -2px 10px;padding:0 2px}.n43-sps::-webkit-scrollbar{display:none}
  .n43-spc{flex:0 0 min(70%,240px);text-align:left;border:1px solid rgba(var(--rgb),.16);border-top:3px solid var(--c,var(--accent));background:rgba(var(--rgb),.05);border-radius:12px;padding:9px 11px;color:inherit;font:inherit;display:grid;gap:3px}
  .n43-spc b{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.n43-spc small{color:var(--muted);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.n43-spc em{font-style:normal;font:600 10px var(--mono);letter-spacing:.08em;color:var(--c,var(--accent))}
  .n43-h{font:600 11px var(--mono);letter-spacing:.2em;color:var(--muted);margin:2px 2px 8px;display:flex;gap:8px}.n43-h span{margin-left:auto;letter-spacing:.04em}
  .n43-np{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:13px;min-width:0}.n43-np svg{width:15px;height:15px;color:var(--accent);flex:none}.n43-np span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.n43-np small{color:var(--muted)}
  .n43-grid button svg{width:20px;height:20px;display:block;margin:0 auto 4px;color:var(--accent)}.n43-grid .rev svg{transform:scaleX(-1)}`;
  { const el = document.createElement('style'); el.textContent = CSS; document.head.appendChild(el); }

  // ---------- haptics and sounds (You → Haptics & sounds). iPhone Safari has no vibration, so there you get the sounds.
  const fx = { haptics: () => store.get('haptics', true) !== false, sounds: () => store.get('sounds', false) === true };
  let actx = null;
  function beep(kind) {
    if (!fx.sounds()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { send: [660], reply: [520, 780], good: [660, 990], bad: [300], done: [523, 659, 784] }[kind] || [600];
      notes.forEach((f, i) => { const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * .09; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + .16); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .18); });
    } catch {}
  }
  function buzz(kind) { if (fx.haptics() && navigator.vibrate) { try { navigator.vibrate({ send: 12, reply: [10, 40, 18], good: 15, bad: [30, 30, 30], done: [20, 60, 20, 60, 40] }[kind] || 10); } catch {} } beep(kind); }
  window.n43fx = buzz;
  // a new answer arrived → a little buzz
  const _merge = mergeRows; let replyCount = -1;
  mergeRows = function () { _merge(); const n = S.rows.filter(r => r.kind === 'reply').length; if (replyCount >= 0 && n > replyCount) buzz('reply'); replyCount = n; };
  const _grade = grade; grade = function (g) { buzz(g >= 2 ? 'good' : 'bad'); return _grade(g); };

  // ---------- offline: chats, open chats, docs and status are kept on the phone; questions wait until you're back online
  const _loadSync = loadSync;
  loadSync = async function (keys) {
    await _loadSync(keys);
    try {
      if (S.status) store.set('statusCache', S.status);
      if (S.chats) store.set('chatsCache', S.chats);
      const open = Object.entries(S.chatData).slice(-4); if (open.length) store.set('chatDataCache', Object.fromEntries(open));
    } catch {}
  };
  if (!S.status) S.status = store.get('statusCache', null);
  if (!S.chats) S.chats = store.get('chatsCache', null);
  for (const [k, v] of Object.entries(store.get('chatDataCache', {}))) if (!S.chatData[k]) S.chatData[k] = v;
  S.docs = store.get('docsCache', null);
  const askQueue = () => store.get('askQueue', []);
  async function flushAsks() {
    const q = askQueue(); if (!q.length || !navigator.onLine) return;
    store.set('askQueue', []);
    for (const a of q) { S.local = S.local.filter(r => r.id !== a.id); store.set('directRows', S.local); mergeRows(); S.agent = a.agent || S.agent; await sendText(a.q, a.extra || {}); }
    toast(`Sent ${q.length} question${q.length === 1 ? '' : 's'} you asked offline.`);
  }
  addEventListener('online', () => setTimeout(() => { flushAsks(); flushJots(); }, 1500));
  const _paintOffline = paintOffline;
  paintOffline = function () {
    _paintOffline();
    const b = $('offlineBar'); if (!b || navigator.onLine) return;
    const n = askQueue().length, j = store.get('jotQueue', []).length;
    b.textContent = `📴 Offline · your chats, docs and flashcards still work${n ? ` · ${n} question${n === 1 ? '' : 's'} waiting` : ''}${j ? ` · ${j} jot${j === 1 ? '' : 's'} waiting` : ''}`;
  };

  // ---------- phone-only answers: when your computer is off (or you pick "Phone"), the phone answers on its own with
  // the free Nexus models (the same as Test Run). Auto = only when no computer is on.
  const poMode = () => store.get('phoneOnly', 'auto');   // 'auto' | 'on' | 'off'
  const FN = SUPABASE_URL + '/functions/v1/try-chat';
  const poNow = extra => !extra.spaceId && !S.openChat && (poMode() === 'on' || (poMode() === 'auto' && !online() && !directOk()));
  function poHistory() {
    const rows = S.local.filter(r => r.meta?.po && (r.kind === 'ask' || r.kind === 'reply')).slice(-12);
    return rows.map(r => ({ role: r.kind === 'ask' ? 'user' : 'assistant', content: String(r.content || '').slice(0, 4000) }));
  }
  async function phoneAnswer(q, extra = {}) {
    q = String(q || '').trim(); const photo = S.photo;
    if (!q && !photo) return null;
    if (!navigator.onLine) return queueAsk(q, extra);
    const a = agentOf(S.agent), base = ['flash', 'lyte', 'neodela'].includes(a.base || a.id) ? (a.base || a.id) : 'flash';
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), now = () => new Date().toISOString();
    const history = poHistory();
    addLocal({ id, direction: 'to_desktop', kind: 'ask', agent: S.agent, content: q || 'What is in this photo?', meta: { po: true, features: S.feats, ...(photo ? { photo: true } : {}) }, created_at: now() });
    S.photo = null; paintPhoto(); S.feats = []; S.scrollDown = true; render(); buzz('send');
    const sys = `You are ${a.name || "Nexus '28"}, answering on the user's phone (N28C) while their computer is off. ${a.about ? a.about.slice(0, 600) + ' ' : ''}Be clear and helpful; keep answers phone-sized.${extra.system ? ' ' + extra.system : ''}`;
    const content = photo ? [{ type: 'text', text: q || 'What is in this photo?' }, { type: 'image_url', image_url: { url: photo.url } }] : q;
    let text = '', last = 0;
    try {
      const res = await fetch(FN, { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', agent: base, kind: 'main', messages: [{ role: 'system', content: sys }, ...history, { role: 'user', content }] }) });
      if (!res.ok || !(res.headers.get('content-type') || '').includes('event-stream')) { const j = await res.json().catch(() => ({})); throw new Error(j.message || j.error || 'The phone could not answer right now.'); }
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
          let j; try { j = JSON.parse(d); } catch { continue; }
          if (j.error) throw new Error(j.error.message || 'The model returned an error.');
          text += j.choices?.[0]?.delta?.content || '';
          if (Date.now() - last > 350 && text) { last = Date.now(); addLocal({ id: id + 'r', direction: 'to_phone', kind: 'reply', agent: S.agent, content: text, reply_to: id, meta: { po: true }, created_at: now() }); render(); }
        }
      }
      addLocal({ id: id + 'r', direction: 'to_phone', kind: 'reply', agent: S.agent, content: text || '(no answer)', reply_to: id, meta: { po: true }, created_at: now() });
      // counts toward your quests and streak on your computer (it picks this up when it's on)
      sb.from('relay_messages').insert({ direction: 'to_desktop', kind: 'request', content: 'credit', meta: { op: 'credit', event: 'chat' } }).then(() => {}, () => {});
    } catch (e) {
      addLocal({ id: id + 'r', direction: 'to_phone', kind: 'error', agent: S.agent, content: e.message, reply_to: id, meta: { po: true }, created_at: now() });
    }
    render(); return id;
  }
  function queueAsk(q, extra) {
    const id = 'q' + Date.now().toString(36);
    store.set('askQueue', [...askQueue(), { id, q, extra, agent: S.agent }].slice(-20));
    addLocal({ id, direction: 'to_desktop', kind: 'ask', agent: S.agent, content: q, meta: { queued: true }, created_at: new Date().toISOString() });
    toast('Offline: it will send when you are back online.'); paintOffline(); render(); return id;
  }
  const _sendText = sendText;
  sendText = async function (q, extra = {}) {
    if (!navigator.onLine && String(q || '').trim() && !S.photo) return queueAsk(String(q).trim(), extra);
    if (poNow(extra)) return phoneAnswer(q, extra);
    const r = await _sendText(q, extra); if (r) buzz('send'); return r;
  };

  // ---------- camera modes: Solve this · Cite this book · What is this?
  const CAM = {
    solve: { icon: '🧮', name: 'Solve this', q: 'Solve this step by step. Show each step and check the answer at the end.' },
    cite: { icon: '📖', name: 'Cite this book', q: "This is a photo of a book's cover or title page. Read the title, author(s), publisher and year, then write the citation in MLA 9 and APA 7. Say which parts you could not read." },
    what: { icon: '🔎', name: 'What is this?', q: 'What is this? Tell me what it is, how sure you are, and 3 interesting or useful facts about it.' }
  };
  const camIn = document.createElement('input'); camIn.type = 'file'; camIn.accept = 'image/*'; camIn.setAttribute('capture', 'environment'); camIn.hidden = true; document.body.appendChild(camIn);
  let camMode = null;
  camIn.onchange = async () => {
    const f = camIn.files[0]; camIn.value = ''; if (!f || !camMode) return;
    try { S.photo = await shrink(f); paintPhoto(); if (S.tab !== 'chat') setTab('chat'); await sendText(CAM[camMode].q); } catch (e) { toast(e.message); }
  };
  function camSheet() {
    sheet(`<h3>Camera modes</h3><div class="note" style="margin-bottom:10px">Take a picture and Nexus gets straight to it.</div><div class="n43-grid">${Object.entries(CAM).map(([k, m]) => `<button data-cam="${k}"><i>${m.icon}</i>${esc(m.name)}</button>`).join('')}</div>`,
      e => { const b = e.target.closest('[data-cam]'); if (!b) return; camMode = b.dataset.cam; closeSheet(); camIn.click(); });
  }
  if ($('attach') && !$('camModes')) { $('attach').insertAdjacentHTML('beforebegin', `<button class="pbtn" id="camModes" title="Camera modes" aria-label="Camera modes">${ic('sparkles') || '✦'}</button>`); $('camModes').onclick = camSheet; }

  // ---------- chat tab: daily brief card + who answers (computer / phone)
  // 4.3.1: a compact Today strip: greeting, three small numbers, the Focus timer, what's next, and the brief as one tap.
  const mmss = ms => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const focusLeft = f => f ? (f.paused ? f.left : Math.max(0, (f.endsAt || 0) - Date.now())) : 0;
  function focusPill(f, big) {
    if (!f) return '';
    return `<div class="n43-focus ${big ? 'big' : ''} ${f.phase === 'focus' ? '' : 'brk'}" data-focus><span class="n43-fi">${ic('timer')}</span><div><b data-fleft>${mmss(focusLeft(f))}</b><small>${f.paused ? 'Paused · ' : ''}${f.phase === 'focus' ? 'Focus' : 'Break'}${f.blocks > 1 ? ` · block ${f.block} of ${f.blocks}` : ''}${f.task ? ' · ' + esc(f.task) : ''}</small></div>${big ? '<button data-n43="act:focus_stop">Stop</button>' : ''}</div>`;
  }
  setInterval(() => { const f = st().focus; if (!f) return; document.querySelectorAll('[data-fleft]').forEach(el => { el.textContent = mmss(focusLeft(f)); }); }, 1000);
  function briefCard() {
    const b = st().brief; if (!b) return '';
    const q = st().quests, due = S.study ? S.study.cards.filter(c => c.due <= Date.now()).length : b.due, f = st().focus;
    const next = [...(b.reminders || []).map(r => `<div class="n43-next">${ic('alarm')}<span>${esc(r.text)}</span><small>${esc(new Date(r.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</small></div>`),
      ...(b.goals?.left ? [`<div class="n43-next">${ic('target')}<span>${esc(b.goals.next)}</span><small>${b.goals.left} left</small></div>`] : [])].slice(0, 2).join('');
    return `<div class="n43-today" id="n43Brief">
      <div class="n43-th"><b>${esc(b.hello)}</b><small>${esc(new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))}</small></div>
      <div class="n43-nums"><button data-n43="saver"><span>${ic('flame')}</span><b>${b.streak || 0}</b><small>streak</small></button><button data-n43="review"><span>${ic('cards')}</span><b>${due}</b><small>due</small></button><button data-n43="you"><span>${ic('star')}</span><b>${q ? `${q.done}/3` : '–'}</b><small>quests</small></button></div>
      ${focusPill(f)}${next}
      <div class="n43-tacts">${b.brief ? `<button data-n43="brief">${ic('sun')}Morning brief</button>` : ''}<button data-n43="jot">${ic('pencil')}Jot</button>${(b.streak || 0) > 0 && !b.activeToday ? `<button data-n43="saver" class="hot">${ic('flame')}Save streak</button>` : ''}</div></div>`;
  }
  function briefSheet() { const b = st().brief; if (!b?.brief) return; sheet(`<h3>${ic('sun')} Morning brief</h3><div class="n43-docbody">${md(b.brief)}</div>`, null); }
  function modeBar() {
    const m = poMode(), comp = online() || directOk();
    return `<div class="n43-mode" id="n43Mode"><span>Answers from</span><div class="n43-seg">${[['auto', 'Auto'], ['off', comp ? 'Computer' : 'Computer (off)'], ['on', 'Phone']].map(([k, l]) => `<button data-po="${k}" class="${m === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
  }
  const _renderChat = renderChat;
  renderChat = function (force) {
    _renderChat(force);
    const v = $('v-chat'); if (!v) return;
    const empty = v.querySelector('.empty');
    if (empty && !S.openChat) {
      const n = empty.querySelector('b');
      if (poNow({}) && n && n.nextSibling && n.nextSibling.nodeType === 3) n.nextSibling.textContent = online() ? ' 📱 Phone-only: your phone answers with the free Nexus models.' : ' Your computer is off, so your phone answers with the free Nexus models.';
      if (!v.querySelector('#n43Brief')) empty.insertAdjacentHTML('beforebegin', briefCard());
    }
    if (!S.openChat && !v.querySelector('#n43Mode')) (v.querySelector('.thread-bar') || v.firstElementChild)?.insertAdjacentHTML('afterend', modeBar());
  };
  document.addEventListener('click', e => {
    const p = e.target.closest('[data-po]'); if (p) { store.set('phoneOnly', p.dataset.po); S.chatSig = null; renderChat(true); toast(p.dataset.po === 'on' ? 'Your phone answers on its own (free Nexus models).' : p.dataset.po === 'off' ? 'Your computer answers.' : 'Auto: your phone answers when your computer is off.'); return; }
    const b = e.target.closest('[data-n43]'); if (!b) return;
    const k = b.dataset.n43;
    if (k === 'review') { setTab('study'); }
    else if (k === 'saver') streakSaver();
    else if (k === 'brief') briefSheet();
    else if (k === 'you') setTab('you');
    else if (k === 'jot') jotSheet();
    else if (k === 'docs') docsSheet();
    else if (k === 'classes') openClasses();
    else if (k === 'feed') loadFeed(true);
    else if (k === 'report-share') shareReport();
    else if (k === 'geo-add') geoAdd();
    else if (k === 'geo-place') geoPlace();
    else if (k.startsWith('geo-del:')) { store.set('geoRem', geoList().filter(r => r.id !== k.slice(8))); renderYou(); }
    else if (k.startsWith('act:')) remote(k.slice(4), b);
    else if (k.startsWith('appr:')) approve(b.dataset.id, k === 'appr:yes');
    else if (k.startsWith('sp:')) spaceSheet(k.slice(3));
    else if (k.startsWith('pin:')) togglePin(k.slice(4));
    else if (k.startsWith('fx:')) { const key = k.slice(3); store.set(key, !(key === 'sounds' ? fx.sounds() : fx.haptics())); buzz('good'); renderYou(); }
  });

  // ---------- streak saver: 3 quick cards (any deck), right from the notification
  function streakSaver() {
    const cards = (S.study?.cards || []).slice().sort((a, b) => (a.due || 0) - (b.due || 0)).slice(0, 3);
    if (!cards.length) return sheet(`<h3>🔥 Streak saver</h3><div class="note">No flashcards yet. Send one quick message instead and your streak is safe.</div><button class="big" data-x="chat" style="margin-top:12px">Ask Nexus something</button>`, e => { if (e.target.closest('[data-x]')) { closeSheet(); setTab('chat'); $('q')?.focus(); } });
    let i = 0, flipped = false;
    const paint = () => {
      if (i >= cards.length) { buzz('done'); return sheet(`<h3>🔥 Streak saved!</h3><div class="note">Nice. Those count for today${online() ? '' : ' (they sync when your computer is on)'}.</div><button class="big" data-x="ok" style="margin-top:12px">Done</button>`, e => { if (e.target.closest('[data-x]')) closeSheet(); }); }
      const c = cards[i];
      sheet(`<h3>🔥 Streak saver · ${i + 1}/${cards.length}</h3><button class="n43-doc" data-x="flip" style="min-height:120px;font-size:17px;text-align:center">${esc(flipped ? c.back : c.front)}<small style="display:block;margin-top:8px">${flipped ? 'How did it go?' : 'Tap to flip'}</small></button>
        ${flipped ? `<div class="row2"><button class="big ghost" data-g="0" style="margin:0">Missed it</button><button class="big" data-g="2" style="margin:0">Got it</button></div>` : ''}`,
      e => { const b = e.target.closest('[data-x],[data-g]'); if (!b) return; if (b.dataset.x === 'flip') { flipped = !flipped; return paint(); } reviewCard(c.id, +b.dataset.g); buzz(+b.dataset.g >= 2 ? 'good' : 'bad'); i++; flipped = false; paint(); });
    };
    paint();
  }

  // ---------- Jots & Docs (read on the phone, even offline; jot from anywhere)
  async function loadDocs() {
    const { data } = await sb.from('companion_sync').select('data').eq('key', 'docs').maybeSingle();
    if (data?.data) { S.docs = data.data; try { store.set('docsCache', data.data); } catch {} }
    return S.docs;
  }
  function flushJots() { const q = store.get('jotQueue', []); if (!q.length || !navigator.onLine) return; store.set('jotQueue', []); for (const t of q) request('jot_add', { text: t }); }
  async function jotSheet() {
    const t = await ask('✎ Jot a note', { placeholder: 'A thought, a to-do, a link…', ok: 'Jot it', multiline: true }); if (!t) return;
    if (!navigator.onLine) { store.set('jotQueue', [...store.get('jotQueue', []), t].slice(-50)); paintOffline(); return toast('Saved on your phone; it goes to Jots & Docs when you are online.'); }
    const r = await request('jot_add', { text: t }); buzz('good');
    toast(r.ok ? 'Jotted ✓ (in Jots & Docs)' : r.error === 'timeout' ? 'It will be jotted when your computer is on.' : r.error);
  }
  // Only refresh the sheet while it is still the one on screen: never pop it back open after you close it.
  let docsTok = 0, docsNote = '';
  const docsShowing = tok => tok === docsTok && $('sheet').classList.contains('on') && !!$('sheetBox').querySelector('[data-docs]');
  async function docsSheet(openId, { fetched = false } = {}) {
    const tok = ++docsTok;
    if (!fetched) sheet('<h3 data-docs>📝 Jots &amp; Docs</h3><div class="note">Loading…</div>', null);
    if (navigator.onLine && !fetched) await loadDocs().catch(() => {});
    if (!docsShowing(tok)) return;
    if (!S.docs && navigator.onLine && !fetched) {   // ask the computer once for this open
      request('docs_sync', {}, 20000).then(async r => {
        docsNote = r.ok ? '' : /Unknown request/.test(r.error || '') ? 'Update Nexus on your computer to 4.3.0 to see your Jots & Docs here.' : r.error === 'timeout' ? 'Your computer didn\'t answer. Is Nexus open there?' : (r.error || '');
        if (r.ok) await new Promise(res => setTimeout(res, 1200)).then(() => loadDocs()).catch(() => {});
        if (docsShowing(tok)) docsSheet(openId, { fetched: true });
      });
    }
    const list = S.docs?.list || [];
    const paint = filter => {
      const rows = list.filter(d => filter === 'all' || d.kind === (filter === 'jots' ? 'jot' : 'doc'));
      sheet(`<h3 data-docs>📝 Jots &amp; Docs</h3><div class="chips">${[['all', 'All'], ['jots', 'Jots'], ['docs', 'Docs']].map(([k, l]) => `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}<button data-x="jot">＋ Jot</button></div>
        ${rows.length ? rows.slice(0, 50).map(d => `<button class="n43-doc" data-doc="${esc(d.id)}"><b>${d.kind === 'jot' ? '✎ ' : '📄 '}${esc(d.kind === 'jot' ? d.text.slice(0, 80) : d.title || 'Untitled')}</b><small>${esc(since(d.updated))}${d.kind === 'doc' ? ` · ${d.words} words` : ''}</small></button>`).join('')
          : `<div class="note">${S.docs ? 'Nothing here yet. Jot something, or write a doc in Nexus on your computer.' : docsNote ? esc(docsNote) : fetched ? 'Nothing came from your computer yet.' : 'Asking your computer for your Jots & Docs…'}</div>`}
        ${S.docs?.at ? `<div class="note" style="margin-top:6px">From your computer · ${esc(since(S.docs.at))}${navigator.onLine ? '' : ' · offline copy'}</div>` : ''}`,
      e => {
        const f = e.target.closest('[data-f]'); if (f) return paint(f.dataset.f);
        if (e.target.closest('[data-x="jot"]')) { closeSheet(); return jotSheet(); }
        const d = e.target.closest('[data-doc]'); if (d) return openDoc(list.find(x => x.id === d.dataset.doc), () => paint(filter));
      });
    };
    if (openId) return openDoc(list.find(x => x.id === openId), () => paint('all'));
    paint('all');
  }
  function openDoc(d, back) {
    if (!d) return;
    sheet(`<div class="row2" style="grid-template-columns:auto 1fr;align-items:center;margin-bottom:8px"><button class="hbtn" data-x="back">‹</button><b>${esc(d.kind === 'jot' ? 'Jot' : d.title || 'Untitled')}</b></div>
      <div class="n43-docbody">${md(d.text || '')}</div><div class="n43-btns"><button data-x="copy">⧉ Copy</button>${navigator.share ? '<button data-x="share">⤴ Share</button>' : ''}</div>`,
    e => { const x = e.target.closest('[data-x]')?.dataset.x; if (x === 'back') back(); if (x === 'copy') navigator.clipboard?.writeText(d.text || '').then(() => toast('Copied')); if (x === 'share') navigator.share({ title: d.title || 'Jot', text: d.text || '' }).catch(() => {}); });
  }

  // ---------- Chats tab: Jots & Docs button + Live Spaces
  const _renderChats = renderChats;
  renderChats = function () {
    _renderChats();
    const v = $('v-chats'); if (!v || v.querySelector('#n43Chats')) return;
    const sl = (st().spacesLive || []).filter(x => x && !x.builtin);
    const dueOf = x => (x.decks || []).reduce((n, k) => n + (k.due || 0), 0);
    const line = x => [x.daysLeft != null ? (x.daysLeft < 0 ? 'Past due' : x.daysLeft === 0 ? 'Due today' : `${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'} left`) : '', dueOf(x) ? `${dueOf(x)} cards to review` : '', x.reminders?.[0] ? x.reminders[0].text : ''].filter(Boolean)[0] || `${x.total} chat${x.total === 1 ? '' : 's'}`;
    v.insertAdjacentHTML('afterbegin', `<div id="n43Chats"><div class="n43-tacts" style="margin:0 0 10px"><button data-n43="docs">${ic('doc')}Jots &amp; Docs</button><button data-n43="jot">${ic('pencil')}Jot</button></div>
      ${sl.length ? `<div class="n43-h">YOUR SPACES<span>${sl.length}</span></div><div class="n43-sps">${sl.map(x => `<button class="n43-spc" style="--c:${esc(x.color || '')}" data-n43="sp:${esc(x.id)}"><em>${esc(x.goal ? 'PROJECT' : 'SPACE')}</em><b>${esc(x.name)}</b><small>${esc(line(x))}</small></button>`).join('')}</div>` : ''}</div>`);
  };
  function spaceSheet(id) {
    const x = (st().spacesLive || []).find(s => s.id === id); if (!x) return;
    sheet(`<h3 style="color:${esc(x.color || 'inherit')}">${esc(x.name)}</h3>${x.goal ? `<div class="note">${esc(x.goal)}</div>` : ''}
      ${x.due ? `<div class="n43-li">📅 Due ${esc(x.due)}<small>${x.daysLeft != null ? (x.daysLeft < 0 ? 'past due' : x.daysLeft + ' days left') : ''}</small></div>` : ''}
      ${(x.decks || []).map(k => `<div class="n43-li">🃏 ${esc(k.name)}<small>${k.due} due · ${k.mastered}/${k.total} mastered</small></div>`).join('')}
      ${(x.reminders || []).map(r => `<div class="n43-li">⏰ ${esc(r.text)}<small>${esc(new Date(r.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</small></div>`).join('')}
      <h4 style="margin:12px 0 4px;font:600 11px var(--mono);letter-spacing:.2em;color:var(--muted)">RECENT CHATS</h4>${(x.chats || []).map(c => `<button class="n43-doc" data-chat="${esc(c.id)}"><b>${esc(c.title)}</b><small>${esc(since(c.updated))}</small></button>`).join('') || '<div class="note">No chats yet.</div>'}`,
    e => { const c = e.target.closest('[data-chat]'); if (c) { closeSheet(); const ch = S.chats?.list.find(y => y.id === c.dataset.chat); openChat(ch || { id: c.dataset.chat, title: 'Chat' }); } });
  }

  // ---------- 4.3.1 weekly goals: a tap shows at once and stays that way (the old copy from the computer used to flip it
  // back for a few seconds until the new one arrived)
  const planPend = new Map();   // goal id → { done, at }
  const applyPend = () => {
    const items = S.status?.plan?.goals?.items; if (!items) return;
    for (const [id, p] of planPend) { const g = items.find(x => x.id === id); if (!g || Date.now() - p.at > 20000 || !!g.done === p.done) { planPend.delete(id); continue; } g.done = p.done; }
  };
  const _loadSync2 = loadSync;
  loadSync = async function (keys) { await _loadSync2(keys); applyPend(); };
  planOp = async function (op, meta) {
    if (op === 'goal_toggle' && S.status?.plan?.goals?.items) { const g = S.status.plan.goals.items.find(x => x.id === meta.id); if (g) { g.done = !g.done; planPend.set(g.id, { done: g.done, at: Date.now() }); } }
    if (op === 'goal_remove' && S.status?.plan?.goals?.items) S.status.plan.goals.items = S.status.plan.goals.items.filter(x => x.id !== meta.id);
    const r = await request(op, meta, 20000);
    if (r?.ok && r.plan && S.status) { S.status.plan = r.plan; applyPend(); }
    else if (!r?.ok && r?.error !== 'timeout') { planPend.delete(meta?.id); toast(r?.error || 'That didn\'t work.'); }
    else if (r?.error === 'timeout') toast(`Your ${whichComputer()} will do it when Nexus is open there.`);
    if (S.tab === 'you') renderYou();
  };

  // ---------- Mac tab: approvals, live mission, remote actions, screen peek
  const _renderMac = renderMac;
  renderMac = function () {
    _renderMac();
    const v = $('v-mac'); if (!v) return;
    const s = st(), rm = s.remote, ap = s.approvals || [], ml = s.missionLive, m = s.mission, running = m && !['done', 'error'].includes(m.status);
    const live = running && ml?.steps?.length ? `<div class="panel"><h4>⚑ LIVE MISSION<span>round ${m.round}</span></h4><b>${esc(m.title)}</b>${ml.steps.slice(-8).map((x, i, a) => `<div class="n43-step ${i === a.length - 1 ? 'now' : ''}"><i></i><span>${esc(x.text)}</span><small style="margin-left:auto;color:var(--muted)">${esc(since(x.at))}</small></div>`).join('')}</div>` : '';
    const appr = ap.length ? `<div class="panel"><h4>NEEDS YOUR OK<span>${ap.length}</span></h4>${ap.map(x => `<div class="n43-appr"><b>${esc(x.label)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}<small style="display:block">${esc(x.source)} · ${esc(since(x.at))}</small><div class="n43-btns"><button class="pri" data-n43="appr:yes" data-id="${esc(x.id)}">Approve</button><button class="dan" data-n43="appr:no" data-id="${esc(x.id)}">Deny</button></div></div>`).join('')}</div>` : '';
    const np = S.n43np && Date.now() - S.n43np.at < 5 * 60e3 ? S.n43np.now : null;
    const rmt = `<div class="panel"><h4>REMOTE CONTROL${rm?.on ? '<span>on</span>' : ''}</h4>${rm?.on ? `
      ${focusPill(s.focus, true)}${s.focus ? '<div style="height:8px"></div>' : ''}
      ${np && np.title ? `<div class="n43-np">${ic('speaker')}<span>${esc(np.title)}${np.artist ? ' · ' + esc(np.artist) : ''}</span><small>${esc(np.app || '')}</small></div>` : ''}
      <div class="n43-grid">${s.focus ? '' : `<button data-n43="act:focus_start">${ic('timer')}Focus 25</button>`}<button data-n43="act:music:previous" class="rev">${ic('skip')}Back</button><button data-n43="act:music:playpause">${np && np.state === 'playing' ? ic('pause') : ic('play')}${np && np.state === 'playing' ? 'Pause' : 'Play'}</button><button data-n43="act:music:next">${ic('skip')}Skip</button><button data-n43="act:lock">${ic('lock')}Lock</button>${rm.peek ? `<button data-n43="act:peek">${ic('eye')}Peek</button>` : ''}</div>
      ${(s.routines || []).length ? `<div class="note" style="margin:10px 0 4px">Run a routine</div><div class="chips">${s.routines.slice(0, 8).map(r => `<button data-n43="act:routine" data-id="${esc(r.id)}">${esc(r.name)}</button>`).join('')}</div>` : ''}`
      : `<div class="note">Start Focus, play/pause music, lock your ${esc(whichComputer())} and run routines from here. Turn on <b>Remote actions</b> in Nexus on your computer: Settings → Phone.</div>`}</div>`;
    v.querySelector('#n43Mac')?.remove();
    const box = document.createElement('div'); box.id = 'n43Mac'; box.innerHTML = appr + live + rmt;
    const sw = v.querySelector('.comp-switch'); sw ? sw.after(box) : v.prepend(box);
  };
  async function remote(what, btn) {
    const [op, arg] = what.split(':');
    btn && (btn.disabled = true);
    try {
      if (op === 'peek') return peek();
      if (op === 'np') { const r = await request('now_playing', {}, 20000); const n = r.now; S.n43np = { at: Date.now(), now: n || null }; renderMac(); return toast(n && (n.title || n.track) ? `${n.title || n.track}${n.artist ? ' · ' + n.artist : ''}` : 'Nothing is playing.'); }
      if (op === 'routine') { const r = await request('run_routine', { id: btn.dataset.id }); return toast(r.ok ? 'Running it on your computer.' : reqErr(r)); }
      const r = await request(op === 'music' ? 'music' : op, op === 'music' ? { action: arg } : op === 'focus_start' ? { minutes: 25 } : {}, 20000);
      buzz(r.ok ? 'good' : 'bad');
      toast(r.ok ? { focus_start: 'Focus started: 25 minutes', focus_stop: 'Focus stopped', lock: `Locked your ${whichComputer()}`, music: r.text || 'Done' }[op] || 'Done' : reqErr(r));
      if (r.ok && op === 'music') setTimeout(() => remote('np'), 300);
      if (r.ok && op.startsWith('focus')) setTimeout(refresh, 900);
    } finally { btn && (btn.disabled = false); }
  }
  async function peek() {
    sheet('<h3>👀 Screen peek</h3><div class="note">Asking your computer for one screenshot…</div>', null);
    const r = await request('screen_peek', {}, 30000);
    if (!$('sheet').classList.contains('on')) return;   // closed while waiting: don't pop it back up
    if (!r.ok) return sheet(`<h3>👀 Screen peek</h3><div class="note">${esc(reqErr(r))}</div>`, null);
    const { data } = await sb.from('companion_sync').select('data').eq('key', 'peek').maybeSingle();
    if (!$('sheet').classList.contains('on')) return;
    const p = data?.data; if (!p?.b64) return sheet('<h3>👀 Screen peek</h3><div class="note">The screenshot did not arrive. Try again.</div>', null);
    sheet(`<h3>👀 Screen peek</h3><div class="n43-peek"><img src="data:${esc(p.mime || 'image/jpeg')};base64,${p.b64}" alt="Your screen"></div><div class="note" style="margin-top:6px">Taken ${esc(since(p.at))} · your computer showed a notification</div><div class="n43-btns"><button data-x="again">↻ Again</button><button data-x="del" class="dan">Delete it</button></div>`,
      e => { const x = e.target.closest('[data-x]')?.dataset.x; if (x === 'again') peek(); if (x === 'del') { sb.from('companion_sync').delete().eq('key', 'peek').then(() => { closeSheet(); toast('Deleted'); }); } });
  }
  async function approve(id, yes) {
    const r = await request(yes ? 'approve' : 'deny', { id }, 20000);
    buzz(r.ok ? (yes ? 'good' : 'bad') : 'bad'); toast(r.ok ? (yes ? '✓ Approved' : 'Denied') : reqErr(r));
    if (r.ok && S.status) { S.status.approvals = (S.status.approvals || []).filter(x => x.id !== id); renderMac(); }
  }

  // ---------- You tab: report card, achievements (pins), friends feed, classes, place reminders, haptics
  const pinIds = () => (S.pf?.card?.style?.pins || []).map(p => p.id);
  async function togglePin(id) {
    const all = window.NexusAchievements || [], cur = pinIds(), next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id].slice(-3);
    const RARE = /^(streak_(30|60|100|365)|the_creator)/;
    const pins = next.map(x => all.find(a => a.id === x)).filter(Boolean).map(a => ({ id: a.id, name: a.name, icon: a.icon, rare: RARE.test(a.id) }));
    const r = await rpc('profile_pins_set', { p_pins: pins });
    if (r?.ok === false) return toast(r.error || 'Could not pin it.');
    if (S.pf?.card) { S.pf.card.style = { ...(S.pf.card.style || {}), pins: r.pins || pins }; }
    buzz('good'); S.pfAt = 0; renderYou();
  }
  let unlockedCache = { at: 0, ids: [] };
  async function unlocked() {
    if (Date.now() - unlockedCache.at < 120e3) return unlockedCache.ids;
    const { data } = await sb.from('user_stats').select('data').limit(12);
    const ids = new Set(); for (const r of data || []) for (const k of Object.keys(r.data?.unlocked || {})) ids.add(k);
    unlockedCache = { at: Date.now(), ids: [...ids] }; return unlockedCache.ids;
  }
  let pinsCache = '';   // 4.3.1: drawn from the last copy right away, so the page doesn't jump while it refreshes
  async function paintPins() {
    const el = $('n43Pins'); if (!el) return;
    const ids = await unlocked().catch(() => []), all = (window.NexusAchievements || []).filter(a => ids.includes(a.id)), on = pinIds();
    el.innerHTML = pinsCache = all.length ? `<div class="note" style="margin-bottom:6px">Pin up to 3 to your profile card.</div><div class="n43-pins">${all.map(a => `<button data-n43="pin:${esc(a.id)}" class="${on.includes(a.id) ? 'on' : ''}" title="${esc(a.desc)}">${on.includes(a.id) ? '📌 ' : ''}${esc(a.icon)} ${esc(a.name)}</button>`).join('')}</div>` : '<div class="note">Unlock achievements in Nexus to pin them here.</div>';
  }
  let feed = { at: 0, list: null, error: '' };
  async function loadFeed(force) {
    if (!force && Date.now() - feed.at < 60e3) return;
    feed.at = Date.now(); const r = await rpc('friends_feed', { p_limit: 30 });
    feed = Array.isArray(r) ? { at: Date.now(), list: r, error: '' } : { at: Date.now(), list: [], error: r?.error || '' };
    const el = $('n43Feed'); if (el) el.innerHTML = feedHtml();
  }
  const EMO = ['🔥', '👏', '❤️', '😂', '🎉'];
  const KIND_IC = { achievement: '🏆', quests: '★', streak: '🔥', look: '✨', event: '❄', gift: '🎁', deck: '🃏', class: '🎓' };
  function feedHtml() {
    if (!feed.list) return '<div class="note">Loading…</div>';
    if (feed.error) return `<div class="note">${esc(feed.error)}</div>`;
    if (!feed.list.length) return '<div class="note">Nothing yet. When your friends unlock achievements, finish quests or keep streaks, it shows up here.</div>';
    return feed.list.map(x => `<div class="n43-feed">${x.avatar_url ? `<img src="${esc(x.avatar_url)}" alt="">` : `<div class="av">${esc((x.name || '?')[0].toUpperCase())}</div>`}<div class="tx"><b>${esc(x.name)}</b> ${KIND_IC[x.kind] || ''} ${esc(x.text)}<small>${esc(since(new Date(x.at).getTime()))}</small>
      <div class="n43-rx">${EMO.map(em => `<button data-rx="${x.id}" data-em="${em}" class="${x.mine === em ? 'on' : ''}">${em}${x.reactions?.[em] ? ' ' + x.reactions[em] : ''}</button>`).join('')}</div></div></div>`).join('');
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-rx]'); if (!b) return;
    const it = feed.list?.find(x => String(x.id) === b.dataset.rx); if (!it) return;
    const em = it.mine === b.dataset.em ? '' : b.dataset.em;
    const r = await rpc('feed_react', { p_item: +b.dataset.rx, p_emoji: em }); if (r?.ok === false) return toast('Could not react.');
    it.reactions = { ...(it.reactions || {}) }; if (it.mine) it.reactions[it.mine] = Math.max(0, (it.reactions[it.mine] || 1) - 1); if (em) it.reactions[em] = (it.reactions[em] || 0) + 1; it.mine = em || null;
    buzz('good'); const el = $('n43Feed'); if (el) el.innerHTML = feedHtml();
  });
  function reportPanel() {
    const r = st().report; if (!r || !window.NexusReport) return '';
    return `<div class="n43-report">${window.NexusReport.card(r)}<div class="n43-tacts" style="margin-top:8px"><button data-n43="report-share">${ic('upload')}Share my grades</button></div></div>`;   // 4.3.1: the card on its own (no card inside a card)
  }
  function shareReport() {
    const r = st().report; if (!r) return;
    const text = `My Nexus week: ${r.overall} overall\n${r.items.map(i => `${i.label}: ${i.grade} (${i.note})`).join('\n')}`;
    if (navigator.share) navigator.share({ title: 'My Nexus report card', text }).catch(() => {}); else navigator.clipboard?.writeText(text).then(() => toast('Copied your grades'));
  }
  function openClasses() {
    if (!window.NexusClass) return toast('Update N28C (pull down to refresh).');
    const decks = (S.study?.decks || []).map(d => ({ name: d.name, cards: (S.study.cards || []).filter(c => c.deckId === d.id).map(c => ({ f: c.front, b: c.back })) })).filter(d => d.cards.length);
    window.NexusClass.open({ rpc: (fn, args) => rpc(fn, args), toast, myDecks: () => decks, onFeed: t => rpc('feed_post', { p_kind: 'class', p_text: t }).catch(() => {}) });
  }

  // place reminders: "when I get to school, remind me…". Phones only let web apps check your location while N28C is
  // open, so it checks then (and says so). Places stay on this phone.
  const geoList = () => store.get('geoRem', []), places = () => store.get('geoPlaces', []);
  const here = () => new Promise((res, rej) => { if (!navigator.geolocation) return rej(new Error('This phone has no location.')); navigator.geolocation.getCurrentPosition(p => res(p.coords), () => rej(new Error('Allow location for N28C to use place reminders.')), { enableHighAccuracy: true, timeout: 15000 }); });
  async function geoPlace() {
    const name = await ask('Save this spot as a place', { placeholder: 'Home, School, Gym…', ok: 'Save place' }); if (!name) return;
    try { const c = await here(); store.set('geoPlaces', [...places().filter(p => p.name.toLowerCase() !== name.toLowerCase()), { name: name.slice(0, 30), lat: c.latitude, lng: c.longitude }].slice(-12)); toast(`📍 Saved "${name}"`); renderYou(); } catch (e) { toast(e.message); }
  }
  function geoAdd() {
    const pl = places();
    if (!pl.length) return toast('Save a place first: go there and tap "Save this spot".');
    sheet(`<h3>📍 Remind me when I get to…</h3><div class="chips" id="geoPl">${pl.map((p, i) => `<button data-pl="${i}" class="${i === 0 ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
      <input class="field" id="geoTxt" placeholder="Remind me to…" maxlength="140"><label class="tgl" style="border:0;padding:8px 2px"><span>When I leave instead</span><input type="checkbox" id="geoLeave"></label>
      <button class="big" data-x="ok" style="margin-top:6px">Add reminder</button><div class="note">N28C checks your location while it's open (phones don't let web apps watch it in the background).</div>`,
    e => {
      const p = e.target.closest('[data-pl]'); if (p) { document.querySelectorAll('#geoPl button').forEach(b => b.classList.toggle('on', b === p)); return; }
      if (!e.target.closest('[data-x="ok"]')) return;
      const t = $('geoTxt').value.trim(); if (!t) return toast('Type what to remind you.');
      const i = +(document.querySelector('#geoPl button.on')?.dataset.pl || 0), place = pl[i];
      store.set('geoRem', [...geoList(), { id: Date.now().toString(36), text: t, place: place.name, lat: place.lat, lng: place.lng, r: 150, leave: $('geoLeave').checked, inside: null }].slice(-30));
      closeSheet(); toast(`📍 Got it. When you ${$('geoLeave')?.checked ? 'leave' : 'get to'} ${place.name}.`); renderYou(); geoWatch();
    });
  }
  const dist = (a, b, c, d) => { const R = 6371e3, r = x => x * Math.PI / 180, dl = r(c - a), dn = r(d - b), h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  let geoId = null;
  function geoWatch() {
    if (geoId != null || !geoList().length || !navigator.geolocation) return;
    geoId = navigator.geolocation.watchPosition(p => {
      const { latitude: la, longitude: lo } = p.coords; let changed = false; const keep = [];
      for (const g of geoList()) {
        const inside = dist(la, lo, g.lat, g.lng) <= g.r;
        const fire = g.inside !== null && (g.leave ? g.inside && !inside : !g.inside && inside);
        if (fire) { changed = true; fireGeo(g); continue; }
        if (g.inside !== inside) { g.inside = inside; changed = true; }
        keep.push(g);
      }
      if (changed) store.set('geoRem', keep);
      if (!keep.length) { navigator.geolocation.clearWatch(geoId); geoId = null; }
    }, () => {}, { enableHighAccuracy: false, maximumAge: 60e3 });
  }
  async function fireGeo(g) {
    buzz('done'); toast(`📍 ${g.text}`);
    try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg && Notification.permission === 'granted') reg.showNotification(`📍 ${g.leave ? 'Leaving' : 'At'} ${g.place}`, { body: g.text, tag: 'geo-' + g.id, icon: 'icon-192.png' }); } catch {}
  }
  setTimeout(geoWatch, 3000);

  const _renderYou = renderYou;
  renderYou = function () {
    _renderYou();
    const v = $('v-you'); if (!v) return;
    v.querySelector('#n43You')?.remove();
    const box = document.createElement('div'); box.id = 'n43You';
    const gl = geoList(), pl = places();
    box.innerHTML = reportPanel()
      + `<div class="panel"><h4>PINNED ACHIEVEMENTS<span>${pinIds().length}/3</span></h4><div id="n43Pins">${pinsCache || '<div class="note">Loading…</div>'}</div></div>`
      + `<div class="panel"><h4>FRIENDS FEED<span><button class="link" data-n43="feed" style="font-size:11px">↻</button></span></h4><div id="n43Feed">${feedHtml()}</div></div>`
      + `<div class="n43-btns" style="margin:0 0 10px"><button data-n43="classes">🎓 Classes</button><button data-n43="docs">📝 Jots &amp; Docs</button></div>`
      + `<div class="panel"><h4>📍 PLACE REMINDERS<span>${gl.length || ''}</span></h4>${gl.map(g => `<div class="n43-li">${esc(g.text)}<small>${g.leave ? 'leaving' : 'at'} ${esc(g.place)} <button class="link" data-n43="geo-del:${esc(g.id)}">✕</button></small></div>`).join('') || '<div class="note">“When I get to school, remind me to hand in my essay.”</div>'}
        <div class="n43-btns"><button data-n43="geo-add" ${pl.length ? '' : 'disabled'}>＋ Reminder</button><button data-n43="geo-place">📍 Save this spot${pl.length ? ` (${pl.length})` : ''}</button></div></div>`
      + `<div class="panel"><h4>HAPTICS &amp; SOUNDS</h4><label class="tgl"><span>Haptics<small>${navigator.vibrate ? 'A little buzz when you send, get an answer or grade a card' : "This phone's browser can't vibrate (iPhone)"}</small></span><input type="checkbox" data-n43="fx:haptics" ${fx.haptics() ? 'checked' : ''}></label>
        <label class="tgl"><span>Sounds<small>Soft clicks and chimes</small></span><input type="checkbox" data-n43="fx:sounds" ${fx.sounds() ? 'checked' : ''}></label></div>`;
    const anchor = v.querySelector('#frPanel'); anchor ? anchor.before(box) : v.append(box);
    paintPins(); loadFeed();
  };

  // ---------- routes from notifications: #saver, #docs, #jot, #feed, #classes, #report, #approve
  const _route = route;
  route = function (hash) {
    const h = String(hash || '').replace(/^.*#/, '').split('=')[0];
    if (S.user && ['saver', 'docs', 'jot', 'feed', 'classes', 'report', 'home'].includes(h)) {
      history.replaceState(null, '', location.pathname);
      if (h === 'saver') return streakSaver(); if (h === 'docs') return docsSheet(); if (h === 'jot') return jotSheet(); if (h === 'classes') return openClasses();
      if (h === 'home') return setTab('mac');
      setTab('you'); return;
    }
    return _route(hash);
  };
  setTimeout(() => { if (/#(saver|docs|jot|feed|classes|report|home)/.test(location.hash)) route(location.hash); }, 1200);
  window.N28C43 = { VERSION, phoneAnswer, poNow, streakSaver, docsSheet, camSheet, geoAdd, briefCard, feedHtml };
  render(true);
})();
