// Nexus '28 Test Run (v3.4): Nexus in a browser, for people without a Mac.
// Flash (default), Lyte and Neodela with their @features (the same ones as the Mac app: docs/try/nexuskit.js is built
// from its source), web search, interactive answers, saved chats and an in-depth tutorial. It is deliberately smaller
// than the Mac app: no Paragon, no Mac actions, missions, routines, N28C, study decks or Spaces.
//   Free Nexus key → the try-chat Edge Function (the key never reaches the browser; limits are checked there).
//   Your own key (ChatGPT, Claude, Gemini, OpenRouter, DeepSeek) → straight from this browser; kept only here.
(function () {
  const SUPABASE_URL = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';   // publishable: safe in a web page; row-level security protects the data
  const FN = SUPABASE_URL + '/functions/v1/try-chat';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nexus-try-auth' } });
  const K = window.NexusKit, MD = window.NexusMarkdown;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get: (k, d) => { try { const v = localStorage.getItem('nexus-try:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('nexus-try:' + k, JSON.stringify(v)); } catch {} } };
  const toast = (t, ms = 2600) => { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, ms); };

  // ---------- agents (prompts + @features come from Supabase, like the apps; these are the fallbacks)
  const AGENTS = {
    flash: { id: 'flash', name: 'Flash', full: "Nexus '28 Flash", color: '#ffd36b', tag: 'Fast and clear', db: 'Nexus 28 Flash', features: ['SwiftStream'], limit: 'Unlimited',
      prompt: "Act as Nexus '28 Flash, the fast, streamlined model from Apoji Delegraphics. Give quick, clear, accurate answers. Lead with the answer, keep it short, use simple formatting." },
    lyte: { id: 'lyte', name: 'Lyte', full: "Nexus '28 Lyte", color: '#7dffb2', tag: 'Balanced everyday help', db: 'Nexus 28 Lyte', features: ['Seek', 'Cognition', 'Integrate', 'Knowledge', 'Envision', 'Synergy', 'Echo', 'QuantumThread', 'AuraSync', 'NexusForge', 'FortressLens', 'Proactix2.0', 'MultiVerseImmersive', 'OmniBrief'], limit: '95 free chats',
      prompt: "Act as Nexus '28 Lyte, the fast, balanced model from Apoji Delegraphics. Explain clearly, help with studying and writing, and keep answers well organized." },
    neodela: { id: 'neodela', name: 'Neodela', full: "Nexus '28 Neodela", color: '#b18cff', tag: 'Deep thinking', db: 'Nexus 28 Neodela', features: ['OmniBrief', 'Seek', 'Cognition', 'Integrate', 'Knowledge', 'Envision', 'Synergy', 'Echo', 'QuantumThread', 'AuraSync', 'NexusForge', 'Magyk', 'LogicLattice', 'InsightPulse', 'FortressLens', 'Proactix', 'MultiVerseImmersive', 'Monolog', 'StudyMode', 'CodeComplex'], limit: '28 free chats',
      prompt: "Act as Nexus '28 Neodela, the deep-thinking model from Apoji Delegraphics. Reason carefully, go deep, and still make the answer easy to read." }
  };
  const UNIVERSAL = ['Homework', 'Cite'];          // every agent gets these here, like the Mac app's school helpers
  const WEB_NOTE = `\n\n[WHERE YOU ARE] You are running in Nexus '28 Test Run, the web version of Nexus for people without a Mac. You can't use the user's computer, files, calendar, email or apps, and you can't take actions. When the app gives you web results, use them and cite them by number like [1]. If something needs the full Nexus app for Mac (Paragon, Mac actions, missions, routines, study decks), say so briefly.`;
  const SCHOOL_NOTE = `\n[HONESTY] If the user seems to be doing homework, help them learn: explain, give hints and check their work. Don't just hand over answers to graded work without explaining them.`;

  const S = { user: null, me: {}, att: [], maint: [], owner: false, agent: store.get('agent', 'flash'), chats: [], chat: null, busy: null, web: !!store.get('web', false), feats: [], search: '', prompts: {}, usage: null, sel: 0 };
  const agent = (id = S.agent) => AGENTS[id] || AGENTS.flash;
  const featuresFor = id => [...new Set([...agent(id).features, ...UNIVERSAL])].filter(f => K.features.lookup(f) && !K.features.APEX.has(f));

  // ---------- models: the free Nexus key, or your own
  const PROVIDERS = {
    free: { label: 'Free Nexus key', note: 'Built in. Free models only, with daily limits.' },
    openai: { label: 'ChatGPT (OpenAI)', model: 'gpt-5-mini', url: 'https://platform.openai.com/api-keys', hint: 'sk-…' },
    anthropic: { label: 'Claude (Anthropic)', model: 'claude-sonnet-4-5', url: 'https://console.anthropic.com/settings/keys', hint: 'sk-ant-…' },
    gemini: { label: 'Gemini (Google)', model: 'gemini-2.5-flash', url: 'https://aistudio.google.com/apikey', hint: 'AIza…' },
    openrouter: { label: 'OpenRouter', model: 'openrouter/auto', url: 'https://openrouter.ai/keys', hint: 'sk-or-…' },
    deepseek: { label: 'DeepSeek', model: 'deepseek-chat', url: 'https://platform.deepseek.com/api_keys', hint: 'sk-…' }
  };
  const keys = () => store.get('keys', {});
  const route = () => { const r = store.get('route', { provider: 'free' }); const k = keys()[r.provider]; return r.provider !== 'free' && k?.key ? { provider: r.provider, key: k.key, model: k.model || PROVIDERS[r.provider].model } : { provider: 'free' }; };

  async function token() { const { data } = await sb.auth.getSession(); return data.session?.access_token || ''; }
  async function fnPost(body, signal) {
    return fetch(FN, { method: 'POST', signal, headers: { Authorization: 'Bearer ' + await token(), apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
  // Read an OpenAI-style (or Anthropic / Gemini) stream; onText gets each new piece of text
  async function readStream(res, onText, kind = 'openai') {
    const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '', all = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim(); if (!d || d === '[DONE]') continue;
        let j; try { j = JSON.parse(d); } catch { continue; }
        if (j.error) throw new Error(j.error.message || 'The model returned an error.');
        const t = kind === 'anthropic' ? (j.type === 'content_block_delta' ? j.delta?.text || '' : '') : kind === 'gemini' ? (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('') : (j.choices?.[0]?.delta?.content || '');
        if (t) { all += t; onText(t, all); }
      }
    }
    return all;
  }
  // One model call. kind: 'main' (an answer, counts toward limits) or 'extra' (a thinking pass for a feature)
  // 3.4.1: a message can carry pictures (data URLs); each provider wants them in its own shape
  const b64 = u => { const m = String(u).match(/^data:(image\/[\w+.-]+);base64,(.*)$/); return m ? { mime: m[1], data: m[2] } : null; };
  function shape(m, provider) {
    const pics = m.role === 'user' ? (m.images || []) : [];
    if (!pics.length) return { role: m.role, content: m.content };
    const text = m.content || 'What’s in this picture?';
    if (provider === 'anthropic') return { role: 'user', content: [...pics.map(u => { const x = b64(u); return { type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } }; }), { type: 'text', text }] };
    if (provider === 'gemini') return { role: 'user', parts: [...pics.map(u => { const x = b64(u); return { inline_data: { mime_type: x.mime, data: x.data } }; }), { text }] };
    return { role: 'user', content: [{ type: 'text', text }, ...pics.map(url => ({ type: 'image_url', image_url: { url } }))] };
  }
  async function callModel({ system, messages, kind = 'main', onText = () => {}, signal, features = [] }) {
    const r = route();
    if (r.provider === 'deepseek' && messages.some(m => m.images?.length)) throw new Error('DeepSeek can’t see pictures. Switch to the free Nexus key or another key in Settings.');
    const msgs = messages.map(m => shape(m, r.provider));
    let res, fmt = 'openai';
    if (r.provider === 'free') {
      res = await fnPost({ action: 'chat', agent: S.agent, kind, features, messages: [{ role: 'system', content: system }, ...msgs], model: store.get('freeModel', '') }, signal);
      if (!res.ok || !(res.headers.get('content-type') || '').includes('event-stream')) {
        const j = await res.json().catch(() => ({}));
        const e = new Error(j.message || (res.status === 401 ? 'Sign in again.' : 'Nexus couldn’t answer (' + res.status + ').')); e.code = j.error; throw e;
      }
      if (kind === 'main') { const left = res.headers.get('X-Nexus-Left'); if (left !== null && left !== '') S.leftToday = +left; }
    } else if (r.provider === 'anthropic') {
      fmt = 'anthropic';
      res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers: { 'x-api-key': r.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
        body: JSON.stringify({ model: r.model, max_tokens: kind === 'extra' ? 1200 : 4096, system, messages: msgs.filter(m => m.role !== 'system'), stream: true }) });
    } else if (r.provider === 'gemini') {
      fmt = 'gemini';
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(r.key)}`, { method: 'POST', signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: msgs.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: m.parts || [{ text: m.content }] })) }) });
    } else if (r.provider === 'deepseek') {
      res = await fnPost({ action: 'byok', provider: 'deepseek', key: r.key, body: { model: r.model, messages: [{ role: 'system', content: system }, ...msgs] } }, signal);
    } else {
      const base = r.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1';
      res = await fetch(base + '/chat/completions', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + r.key, 'Content-Type': 'application/json', ...(r.provider === 'openrouter' ? { 'HTTP-Referer': location.origin + location.pathname, 'X-Title': "Nexus '28 Test Run" } : {}) },
        body: JSON.stringify({ model: r.model, messages: [{ role: 'system', content: system }, ...msgs], stream: true }) });
    }
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error((j.error?.message || j.message || `${PROVIDERS[r.provider]?.label || 'The model'} said ${res.status}`) + (res.status === 401 ? ' (check your key in Settings)' : '')); }
    return readStream(res, onText, fmt);
  }
  const complete = ({ system, messages }) => callModel({ system, messages, kind: 'extra' });

  // ---------- context for @features: web, encyclopedia, past chats
  async function webContext(q, signal) {
    const r = await fnPost({ action: 'search', q: q.slice(0, 200) }, signal).then(x => x.json()).catch(() => null);
    if (!r?.ok) throw new Error(r?.message || 'Web search isn’t working right now.');
    const top = r.results.slice(0, 5);
    const pages = await Promise.all(top.slice(0, 2).map(x => fnPost({ action: 'read', url: x.url }, signal).then(y => y.json()).catch(() => null)));
    const sources = top.map((x, i) => ({ n: i + 1, title: x.title, url: x.url, snippet: x.snippet, text: pages[i]?.ok ? pages[i].text.slice(0, 3500) : '' }));
    return { sources, note: `\n\n[WEB RESULTS — searched just now for "${q.slice(0, 120)}". Cite them like [1].]\n` + sources.map(s => `[${s.n}] ${s.title} — ${s.url}\n${s.text || s.snippet}`).join('\n\n') };
  }
  async function wikiContext(q) {
    try {
      const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q.slice(0, 120))}&srlimit=2&format=json&origin=*`).then(r => r.json());
      const hits = s?.query?.search || []; if (!hits.length) return null;
      const sums = await Promise.all(hits.map(h => fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(h.title.replace(/ /g, '_'))}`).then(r => r.json()).catch(() => null)));
      const ok = sums.filter(x => x?.extract);
      return ok.length ? { sources: ok.map((x, i) => ({ n: 'W' + (i + 1), title: x.title + ' (Wikipedia)', url: x.content_urls?.desktop?.page || '' })), note: '\n\n[ENCYCLOPEDIA — Wikipedia summaries]\n' + ok.map(x => `${x.title}: ${x.extract}`).join('\n\n') } : null;
    } catch { return null; }
  }
  async function chatsContext(q) {
    const { data } = await sb.from('try_chats').select('id,title,messages,updated_at').order('updated_at', { ascending: false }).limit(25);
    const words = q.toLowerCase().match(/[a-z]{4,}/g) || [];
    const hits = (data || []).filter(c => c.id !== S.chat?.id).map(c => ({ c, score: words.filter(w => JSON.stringify(c.messages).toLowerCase().includes(w)).length })).filter(x => x.score).sort((a, b) => b.score - a.score).slice(0, 3);
    const recent = (data || []).filter(c => c.id !== S.chat?.id).slice(0, 5).map(c => `• ${c.title}`).join('\n');
    return '\n\n[YOUR PAST CHATS]\nRecent: \n' + (recent || '(none)') + (hits.length ? '\nRelated:\n' + hits.map(({ c }) => `## ${c.title}\n` + (c.messages || []).slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Nexus'}: ${String(m.content).slice(0, 500)}`).join('\n')).join('\n\n') : '');
  }

  // ---------- maintenance from Apoji Admin (3.4.1): everything / Test Run, one agent, or one @feature
  const EVERY = ['global', 'all', 'app', 'everything', 'web', 'try', 'test run', 'testrun'];
  const fnorm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  async function loadMaint() {
    const { data } = await sb.from('maintenance_config').select('scope,enabled,message,ends_at');
    S.maint = (data || []).filter(m => m.enabled === true || m.enabled === 'true' || m.enabled?.enabled === true).map(m => ({ scope: String(m.scope).trim().toLowerCase(), message: m.message || '', endsAt: m.ends_at }));
    const all = S.maint.find(m => EVERY.includes(m.scope));
    notice(all ? '🛠 ' + esc(all.message || 'Nexus is down for maintenance. Back soon.') : '');
    if ($('agentPick').innerHTML) setAgent(S.agent, false);
  }
  const agentDown = id => S.maint.find(m => EVERY.includes(m.scope) || m.scope === id || m.scope === `nexus 28 ${id}` || m.scope === `nexus '28 ${id}`);
  const featDown = f => S.maint.find(m => fnorm(m.scope) === fnorm(f) && !EVERY.includes(m.scope) && !AGENTS[m.scope]);

  // ---------- sending
  // @agent picks who answers; @Feature turns a feature on. If you ask for a feature your agent doesn't have, the
  // agent that has all of them answers instead (Lyte first, then Neodela), and you're told.
  function parseMentions(text) {
    const feats = new Set(S.feats);
    let to = null;
    const clean = text.replace(/(^|\s)@([A-Za-z][\w.]*[\w])/g, (m, sp, name) => {
      const n = name.toLowerCase();
      if (AGENTS[n]) { to = n; return sp; }
      const f = K.features.lookup(name); if (f && !K.features.APEX.has(f.id)) { feats.add(f.id); return sp + '@' + f.id; }
      return m;
    }).trim();
    const want = [...feats], cur = to || S.agent, up = want.filter(f => !featDown(f));   // features down for maintenance don't pull in another agent
    if (up.some(f => !featuresFor(cur).includes(f))) {
      const better = ['lyte', 'neodela'].filter(id => !agentDown(id)).find(id => up.every(f => featuresFor(id).includes(f))) || ['neodela', 'lyte'].filter(id => !agentDown(id)).find(id => up.some(f => featuresFor(id).includes(f)));
      if (better && better !== cur && !to) { to = better; { const miss = up.filter(f => !featuresFor(cur).includes(f)); toast(`${miss.map(f => '@' + f).join(', ')} ${miss.length > 1 ? `are ${agent(better).name} features` : `is a ${agent(better).name} feature`}, so ${agent(better).name} is answering.`, 4200); } }
    }
    return { text: clean || text, feats: want, to };
  }
  async function send(textIn, { regenerate = false, images = null } = {}) {
    if (S.busy) return;
    const pics = images || (regenerate ? [] : S.att.map(a => a.url));
    const raw = (textIn ?? $('input').value).trim(); if (!raw && !pics.length) return;
    if (!S.chat) await newChat(false);
    const p = parseMentions(raw);
    if (p.to && p.to !== S.agent) setAgent(p.to);
    // maintenance: the agent (or all of Test Run) down → say so; a feature down → leave it out
    const down = agentDown(S.agent);
    if (down) return toast('🛠 ' + (down.message || `${agent().name} is down for maintenance.`) + (EVERY.includes(down.scope) ? '' : ' Pick another agent.'), 5000);
    const offF = p.feats.filter(f => featDown(f));
    if (offF.length) toast(`🛠 ${offF.map(f => '@' + f).join(', ')} ${offF.length > 1 ? 'are' : 'is'} down for maintenance, so ${offF.length > 1 ? 'they were' : 'it was'} left out.${featDown(offF[0]).message ? ' ' + featDown(offF[0]).message : ''}`, 5000);
    const ag = agent(), feats = p.feats.filter(f => featuresFor(ag.id).includes(f) && !featDown(f));
    if (!regenerate) { S.chat.messages.push({ role: 'user', content: raw, ts: Date.now(), features: feats, ...(pics.length ? { images: pics } : {}) }); if (S.chat.title === 'New chat') S.chat.title = raw.replace(/@\w+/g, '').trim().slice(0, 60) || (pics.length ? 'Picture' : 'New chat'); }
    $('input').value = ''; autosize(); S.feats = []; S.att = []; paintFeats(); paintAtt(); hideMentions();
    const msg = { role: 'assistant', agent: ag.id, content: '', ts: Date.now(), features: feats, sources: [] };
    S.chat.messages.push(msg);
    const ctl = new AbortController(); S.busy = { ctl, msg };
    paintFeed(); setBusy(true);
    const status = t => { msg.status = t; paintLast(); };
    try {
      const plan = K.kit.plan(feats, {});
      let system = (S.prompts[ag.id]?.prompt || ag.prompt) + WEB_NOTE + SCHOOL_NOTE + (S.me.name ? `\nThe user's name is ${S.me.name}.` : '');
      system += K.features.featurePrompt(feats) + K.kit.blockPrompt(plan.blocks);
      // pictures go along with the latest message that has them (older ones are just mentioned, to keep it light)
      const hist = S.chat.messages.filter(m => m !== msg && !m.error && (m.content || m.images?.length)).slice(plan.swift ? -6 : -24);
      const lastPic = hist.map(m => !!m.images?.length).lastIndexOf(true);
      const history = hist.map((m, i) => ({ role: m.role, content: m.content + (m.images?.length && i !== lastPic ? `\n[${m.images.length} picture${m.images.length > 1 ? 's' : ''} shared earlier]` : ''), ...(i === lastPic ? { images: m.images } : {}) }));
      // web (🌐 or @Seek / @Integrate / @Cite), encyclopedia (@Knowledge), past chats (@Echo / @Integrate)
      if ((S.web || plan.web) && !featDown('Seek')) { status('Searching the web'); const w = await webContext(p.text.replace(/@\w+/g, ''), ctl.signal); msg.sources.push(...w.sources.map(({ text, ...s }) => s)); system += w.note; }
      if (plan.knowledge) { status('Looking it up'); const w = await wikiContext(p.text.replace(/@\w+/g, '')); if (w) { msg.sources.push(...w.sources); system += w.note; } }
      if (plan.chats || plan.history) { status('Reading your past chats'); system += await chatsContext(p.text).catch(() => ''); }
      if (plan.aura) { const a = K.kit.aura(p.text); system += a.note || ''; }
      if (plan.brief) system += '\n[OMNIBRIEF] Start with a 1–3 sentence answer in bold, then a short "More detail" section.';
      // thinking passes (@Cognition, @QuantumThread, @MultiVerse…)
      for (const pre of plan.pre) {
        if (pre === 'plan' || pre === 'blueprint') continue;
        const r = await K.kit.runPre(pre, { complete, messages: history.map(({ images, ...m }) => m), onStatus: status });
        if (r.reasoning) msg.thinking = r.reasoning;
        if (r.threads) msg.thinking = r.threads.map(t => `${t.label}: ${t.text}`).join('\n\n');
        system += r.note || '';
      }
      status(`${ag.name} is writing`);
      const t0 = Date.now();
      await callModel({ system, messages: history, signal: ctl.signal, features: feats, onText: (_t, all) => { msg.content = all; msg.status = ''; paintLast(true); } });
      msg.content = K.kit.retagBlocks(msg.content, plan.blocks) || '(no answer)';
      msg.model = route().provider === 'free' ? 'Free Nexus key' : PROVIDERS[route().provider].label;
      if (plan.swift) msg.speed = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
      if (plan.speak) speak(msg.content);
    } catch (e) {
      if (e.name === 'AbortError') { msg.content = (msg.content || '') + '\n\n_(stopped)_'; }
      else { msg.error = true; msg.content = e.message; if (e.code === 'signin') signOut(); }
    } finally {
      delete msg.status; S.busy = null; setBusy(false); paintFeed(); save(); loadUsage();
    }
  }
  function regenerate() {
    if (S.busy || !S.chat) return;
    const last = S.chat.messages.at(-1); if (last?.role !== 'assistant') return;
    S.chat.messages.pop();
    const q = [...S.chat.messages].reverse().find(m => m.role === 'user'); if (!q) return;
    send(q.content, { regenerate: true, images: q.images || [] });
  }

  // ---------- chats (saved to your account)
  async function loadChats() {
    const { data, error } = await sb.from('try_chats').select('id,title,agent,pinned,updated_at').order('updated_at', { ascending: false }).limit(300);
    if (error) { if (/try_chats/.test(error.message)) notice('Saving chats isn’t switched on yet (the team still has to finish setting up Test Run). Your chats will stay on this device for now.'); S.chats = store.get('localChats', []); }
    else S.chats = data || [];
    paintChats();
  }
  async function openChat(id) {
    const local = S.chats.find(c => c.id === id && c.messages);
    if (local) { S.chat = local; } else {
      const { data } = await sb.from('try_chats').select('*').eq('id', id).maybeSingle();
      if (!data) return toast('That chat is gone.');
      S.chat = { ...data, messages: data.messages || [] };
    }
    store.set('open', id); setAgent(S.chat.agent || S.agent, false);
    paintChats(); paintFeed(true); closeSide();
  }
  async function newChat(paint = true) {
    S.chat = { id: null, title: 'New chat', agent: S.agent, messages: [] };
    store.set('open', null);
    if (paint) { paintChats(); paintFeed(true); closeSide(); $('input').focus(); }
  }
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const c = S.chat; if (!c || !c.messages.length) return;
      const row = { title: c.title.slice(0, 120), agent: c.agent || S.agent, messages: c.messages.slice(-120).map(({ status, ...m }) => m), updated_at: new Date().toISOString() };
      if (JSON.stringify(row.messages).length > 4e6) row.messages = row.messages.map((m, i, a) => i < a.length - 6 && m.images ? { ...m, images: undefined, content: m.content + ' [picture]' } : m);   // keep saved chats small
      if (c.id && !String(c.id).startsWith('local-')) { const { error } = await sb.from('try_chats').update(row).eq('id', c.id); if (error) return toast('Couldn’t save: ' + error.message); }
      else {
        const { data, error } = await sb.from('try_chats').insert(row).select('id').single();
        if (error) { c.id = c.id || 'local-' + Date.now(); const loc = store.get('localChats', []).filter(x => x.id !== c.id); store.set('localChats', [{ ...c, ...row }, ...loc].slice(0, 30)); }
        else c.id = data.id;
      }
      store.set('open', c.id);
      const i = S.chats.findIndex(x => x.id === c.id); const meta = { id: c.id, title: c.title, agent: c.agent, pinned: c.pinned, updated_at: row.updated_at };
      if (i >= 0) S.chats.splice(i, 1); S.chats.unshift(meta); paintChats();
    }, 400);
  }
  function chatMenu(id, anchor) {
    const c = S.chats.find(x => x.id === id); if (!c) return;
    document.querySelectorAll('.pop').forEach(x => x.remove());
    const m = document.createElement('div'); m.className = 'pop';
    m.innerHTML = `<button data-a="ren">✎ Rename</button><button data-a="pin">📌 ${c.pinned ? 'Unpin' : 'Pin to top'}</button><button data-a="exp">⬇ Export (Markdown)</button><button data-a="del" class="danger">🗑 Delete</button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4) + 'px'; m.style.left = Math.min(innerWidth - m.offsetWidth - 8, r.left) + 'px';
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
    m.onclick = async e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; m.remove();
      if (a === 'ren') { const t = prompt('New name', c.title); if (!t) return; c.title = t.slice(0, 120); if (S.chat?.id === id) S.chat.title = c.title; await sb.from('try_chats').update({ title: c.title }).eq('id', id); }
      if (a === 'pin') { c.pinned = !c.pinned; await sb.from('try_chats').update({ pinned: c.pinned }).eq('id', id); }
      if (a === 'exp') { if (S.chat?.id !== id) await openChat(id); exportChat(); }
      if (a === 'del') { if (!confirm(`Delete “${c.title}”?`)) return; await sb.from('try_chats').delete().eq('id', id); S.chats = S.chats.filter(x => x.id !== id); if (S.chat?.id === id) newChat(); }
      paintChats();
    };
  }
  function exportChat() {
    const c = S.chat; if (!c?.messages.length) return toast('Nothing to export yet.');
    const md = `# ${c.title}\n\n` + c.messages.map(m => `**${m.role === 'user' ? (S.me.name || 'You') : agent(m.agent).full}:**\n\n${m.content}\n`).join('\n---\n\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = (c.title || 'chat').replace(/[^\w -]+/g, '').slice(0, 50) + '.md'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- drawing
  function paintChats() {
    const q = S.search.toLowerCase(), list = S.chats.filter(c => !q || String(c.title).toLowerCase().includes(q));
    const today = new Date(); today.setHours(0, 0, 0, 0); const T = today.getTime();
    const groups = [['PINNED', c => c.pinned], ['TODAY', c => !c.pinned && new Date(c.updated_at) >= T], ['THIS WEEK', c => !c.pinned && new Date(c.updated_at) < T && new Date(c.updated_at) >= T - 6 * 864e5], ['OLDER', c => !c.pinned && new Date(c.updated_at) < T - 6 * 864e5]];
    $('chatList').innerHTML = list.length ? groups.map(([h, f]) => { const g = list.filter(f); return g.length ? `<h6>${h}</h6>` + g.map(c => `<div class="ci ${S.chat?.id === c.id ? 'on' : ''}" data-open="${esc(c.id)}" role="button" tabindex="0"><i style="background:${agent(c.agent).color}"></i><span>${esc(c.title)}</span><button class="more" data-more="${esc(c.id)}" aria-label="More">⋯</button></div>`).join('') : ''; }).join('')
      : `<p class="fine" style="padding:8px">${q ? 'No chats match.' : 'Your chats show up here and are saved to your account.'}</p>`;
  }
  function setAgent(id, remember = true) {
    if (!AGENTS[id]) id = 'flash';
    S.agent = id; if (remember) store.set('agent', id);
    if (S.chat && !S.chat.messages.length) S.chat.agent = id;
    $('agentPick').innerHTML = Object.values(AGENTS).map(a => `<button data-agent="${a.id}" class="${a.id === id ? 'on' : ''} ${agentDown(a.id) ? 'down' : ''}" title="${agentDown(a.id) ? 'Down for maintenance' : `${esc(a.tag)} · ${esc(a.limit)} on the free key`}"><i style="background:${a.color};color:${a.color}"></i>${a.name}</button>`).join('');
    $('input').placeholder = innerWidth < 600 ? `Message ${agent().name}…` : `Message ${agent().name}…  (type @ for features)`;
    S.feats = S.feats.filter(f => featuresFor(id).includes(f)); paintFeats();
    document.documentElement.style.setProperty('--agent', agent().color);
    S.orbs.forEach(o => o.setColor(agent().color));
    if (!S.chat?.messages.length) paintEmpty();
  }
  const SUGG = [
    ['📚', 'Quiz me', 'on the causes of World War I', '@StudyMode quiz me on the causes of World War I', 'neodela'],
    ['📐', 'Help with homework', 'hints first, then the answer', '@Homework help me solve 3x + 7 = 22', 'flash'],
    ['🌐', 'What’s new in', 'search the web with sources', '@Seek what are the latest discoveries about Mars?', 'lyte'],
    ['🃏', 'Make flashcards', 'for Spanish greetings', '@Magyk teach me 8 Spanish greetings with flashcards', 'neodela'],
    ['✍️', 'Improve my writing', 'clearer, same voice', 'Make this paragraph clearer without changing my voice: ', 'lyte'],
    ['💡', 'Brainstorm', 'ideas for a science fair project', '@Synergy give me ideas for a science fair project about plants', 'lyte']
  ];
  function paintEmpty() {
    const h = new Date().getHours(), n = S.me.name ? ', ' + S.me.name : '';
    $('greet').textContent = (h < 5 ? `Up late${n}?` : h < 12 ? `Good morning${n}.` : h < 17 ? `Good afternoon${n}.` : `Good evening${n}.`) + ' What are we working on?';
    $('greetSub').textContent = `${agent().full} · ${agent().tag}`;
    $('sugg').innerHTML = SUGG.map(([i, t, d, q, a]) => `<button data-sugg="${esc(q)}" data-sa="${a}"><b>${i} ${esc(t)}</b><span>${esc(d)}</span></button>`).join('');
  }
  function msgHtml(m, i, last) {
    if (m.role === 'user') return `<div class="msg user" data-i="${i}">${m.images?.length ? `<div class="pics">${m.images.map(u => /^data:image\//.test(u) ? `<img src="${esc(u)}" alt="Your picture" data-view>` : '').join('')}</div>` : ''}${m.content ? `<div class="body">${esc(m.content)}</div>` : ''}${!S.busy ? `<div class="tools"><button data-edit="${i}">✎ Edit</button><button data-copy="${i}">⧉ Copy</button></div>` : ''}</div>`;
    const a = agent(m.agent);
    return `<div class="msg ai ${m.error ? 'err' : ''}" data-i="${i}"><div class="who"><i style="background:${a.color}"></i>${esc(a.name.toUpperCase())}<small>${esc([m.model, m.speed].filter(Boolean).join(' · '))}</small></div>
      ${m.features?.length ? `<div class="chips">${m.features.map(f => `<span>@${esc(f)}</span>`).join('')}</div>` : ''}
      ${m.thinking ? `<details class="think"><summary>REASONING</summary><div>${esc(m.thinking)}</div></details>` : ''}
      <div class="body">${m.error ? esc(m.content) : m.content ? MD.render(m.content) : ''}</div>
      ${m.status || (S.busy?.msg === m && !m.content) ? `<div class="status"><span class="dots"><i></i><i></i><i></i></span>${esc(m.status || 'Thinking')}</div>` : ''}
      ${m.sources?.length && !m.status ? `<div class="srcs">${m.sources.filter(s => s.url).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.url)}"><b>${esc(s.n)}</b>${esc(s.title)}</a>`).join('')}</div>` : ''}
      ${!S.busy && m.content ? `<div class="tools"><button data-copy="${i}">⧉ Copy</button><button data-speak="${i}">🔊 Read</button>${last ? '<button data-regen="1">↻ Redo</button>' : ''}</div>` : ''}</div>`;
  }
  function paintFeed(top) {
    const msgs = S.chat?.messages || [];
    $('empty').hidden = msgs.length > 0;
    if (!msgs.length) paintEmpty();
    $('msgs').innerHTML = msgs.map((m, i) => msgHtml(m, i, i === msgs.length - 1)).join('');
    enhanceAll();
    const f = $('feed'); if (top && !msgs.length) f.scrollTop = 0; else f.scrollTop = f.scrollHeight;
  }
  let lastPaint = 0;
  function paintLast(streaming) {
    const msgs = S.chat?.messages || [], i = msgs.length - 1, el = $('msgs').querySelector(`[data-i="${i}"]`);
    if (!el) return paintFeed();
    if (streaming && Date.now() - lastPaint < 60) return; lastPaint = Date.now();
    const f = $('feed'), near = f.scrollHeight - f.scrollTop - f.clientHeight < 140;
    el.outerHTML = msgHtml(msgs[i], i, true);
    const now = $('msgs').querySelector(`[data-i="${i}"] .body`); if (now) window.NexusWidgets?.enhance(now, msgs[i], { live: true });
    if (near) f.scrollTop = f.scrollHeight;
  }
  function enhanceAll() {
    (S.chat?.messages || []).forEach((m, i) => {
      if (m.role !== 'assistant' || m.error) return;
      const body = $('msgs').querySelector(`[data-i="${i}"] .body`); if (!body) return;
      window.NexusWidgets?.enhance(body, m, { live: S.busy?.msg === m, convId: S.chat.id || 'new', onAsk: q => send(q),
        api: { conv: { patchWidget: (_c, _ts, key, value) => { m.widget = { ...(m.widget || {}), [key]: value }; save(); } } } });
    });
  }
  function setBusy(on) {
    const b = $('sendBtn'); b.classList.toggle('stop', on); b.textContent = on ? '■' : '➤'; b.title = on ? 'Stop' : 'Send (Enter)';
  }
  function notice(t) { const n = $('notice'); n.innerHTML = t; n.hidden = !t; }

  // ---------- @ menu + feature chips
  function paintFeats() { $('featRow').innerHTML = S.feats.map(f => `<button data-unfeat="${esc(f)}" title="Remove">@${esc(f)} ✕</button>`).join(''); $('webBtn').setAttribute('aria-pressed', S.web ? 'true' : 'false'); }
  function mentionList(q) {
    const cat = K.features.publicCatalog();
    const fs = featuresFor(S.agent).map(id => cat.find(c => c.id === id) || { id, desc: '' }).filter(f => !q || f.id.toLowerCase().startsWith(q.toLowerCase()) || (f.desc || '').toLowerCase().includes(q.toLowerCase()));
    const ags = Object.values(AGENTS).filter(a => !q || a.id.startsWith(q.toLowerCase()));
    return [...ags.map(a => ({ kind: 'agent', id: a.id, title: '@' + a.id, desc: `Ask ${a.name} instead (${a.tag.toLowerCase()})` })), ...fs.map(f => ({ kind: 'feat', id: f.id, title: '@' + f.id, desc: featDown(f.id) ? '🛠 Down for maintenance' : (f.does || f.desc || '') }))];
  }
  function mentionState() { const t = $('input'), before = t.value.slice(0, t.selectionStart), m = before.match(/(^|\s)@([\w.]{0,30})$/); return m ? { q: m[2], start: t.selectionStart - m[2].length - 1 } : null; }
  function paintMentions() {
    const st = mentionState(), box = $('mentions');
    if (!st) return hideMentions();
    const list = mentionList(st.q); if (!list.length) return hideMentions();
    S.sel = Math.min(S.sel, list.length - 1);
    box.innerHTML = list.slice(0, 30).map((x, i) => (i === 0 && x.kind === 'agent' ? '<h6>AGENTS</h6>' : '') + (x.kind === 'feat' && (i === 0 || list[i - 1].kind === 'agent') ? `<h6>${esc(agent().name.toUpperCase())}'S @FEATURES</h6>` : '') + `<button data-pick="${i}" class="${i === S.sel ? 'sel' : ''}"><b>${esc(x.title)}</b><span>${esc(x.desc)}</span></button>`).join('');
    box.hidden = false; box._list = list;
  }
  function hideMentions() { $('mentions').hidden = true; S.sel = 0; }
  function pickMention(i) {
    const x = $('mentions')._list?.[i], st = mentionState(); if (!x || !st) return;
    const t = $('input');
    if (x.kind === 'agent') { setAgent(x.id); t.value = t.value.slice(0, st.start) + t.value.slice(t.selectionStart); }
    else { if (!S.feats.includes(x.id)) S.feats.push(x.id); t.value = t.value.slice(0, st.start) + t.value.slice(t.selectionStart); paintFeats(); }
    hideMentions(); t.focus(); autosize();
  }
  function autosize() { const t = $('input'); t.style.height = 'auto'; t.style.height = Math.min(220, t.scrollHeight) + 'px'; }

  // ---------- read aloud + dictation (built into the browser)
  function speak(text) {
    if (!window.speechSynthesis) return toast('This browser can’t read aloud.');
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
    const plain = text.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>\[\]]/g, '').replace(/\(https?:[^)]+\)/g, '');
    const u = new SpeechSynthesisUtterance(plain.slice(0, 6000)); u.rate = 1.04; speechSynthesis.speak(u);
  }
  function dictate() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) return;
    if (dictate.r) { dictate.r.stop(); return; }
    const r = new R(); r.interimResults = true; r.lang = navigator.language || 'en-US'; const base = $('input').value;
    r.onresult = e => { $('input').value = (base ? base + ' ' : '') + [...e.results].map(x => x[0].transcript).join(' '); autosize(); };
    r.onend = () => { dictate.r = null; $('micBtn').setAttribute('aria-pressed', 'false'); };
    r.start(); dictate.r = r; $('micBtn').setAttribute('aria-pressed', 'true');
  }

  // ---------- usage
  async function loadUsage() {
    const { data } = await sb.rpc('try_my_usage'); S.usage = data || null;
    const u = S.usage, r = route();
    $('usageBox').innerHTML = r.provider !== 'free' ? `<span>🔑 Using your ${esc(PROVIDERS[r.provider].label)} key: no limits.</span>`
      : u ? `<span>Free answers today: <b>${u.today}</b> / ${u.daily}</span><div class="bar"><i style="width:${Math.min(100, u.today / u.daily * 100)}%"></i></div><span>Lyte ${u.lyte}/${u.lyte_limit} · Neodela ${u.neodela}/${u.neodela_limit} · Flash unlimited</span>` : '';
  }

  // ---------- settings
  const ACCENTS = [['#3dffa0', '61, 255, 160'], ['#5cc8ff', '92, 200, 255'], ['#b18cff', '177, 140, 255'], ['#ff6bb5', '255, 107, 181'], ['#ffb547', '255, 181, 71'], ['#ff5a6e', '255, 90, 110']];
  function applyLook() { const a = store.get('accent', ACCENTS[0]); document.documentElement.style.setProperty('--accent', a[0]); document.documentElement.style.setProperty('--accent-rgb', a[1]); }
  let setTab = 'account';
  function openSettings(tab = setTab) { setTab = tab; $('settings').hidden = false; paintSettings(); }
  function paintSettings() {
    document.querySelectorAll('#setTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === setTab));
    const r = store.get('route', { provider: 'free' }), ks = keys(), u = S.usage;
    const body = {
      account: () => `<div class="card"><h3>👤 Your profile</h3>
          <div class="prof">${pfp('lg')}<div class="row"><button class="btn sm" id="sPic">📷 Change picture</button>${picUrl() ? '<button class="btn sm danger" id="sPicRm">Remove</button>' : ''}<input type="file" id="sPicF" accept="image/*" hidden></div></div>
          <div class="acct-grid">
            <label for="sName">Name</label><div class="row"><input id="sName" value="${esc(S.me.name || '')}" maxlength="40" placeholder="What Nexus calls you" style="flex:1"><button class="btn sm" id="sNameSave">Save</button></div>
            <label for="sUser">Username</label><div class="row"><input id="sUser" value="${esc(S.me.username || '')}" maxlength="24" placeholder="username" style="flex:1"><button class="btn sm" id="sUserSave">Save</button></div>
            <label for="sEmail">Email</label><div class="row"><input id="sEmail" type="email" value="${esc(S.user?.email || '')}" style="flex:1"><button class="btn sm" id="sEmailSave">Change</button></div>
            <label for="sPw">Password</label><div class="row"><input id="sPw" type="password" placeholder="New password (8+)" autocomplete="new-password" style="flex:1"><button class="btn sm" id="sPwSave">Set</button></div>
          </div><p class="fine">Same account as Nexus '28 on a Mac and N28C, so changes show up there too.</p></div>
        <div class="card"><h3>💬 Your chats</h3><p class="muted">Saved to your account, so they follow you to any browser. Only you can see them.</p><div class="row"><button class="btn sm" id="sExport">Export this chat</button><button class="btn sm danger" id="sWipe">Delete all my Test Run chats</button></div></div>
        <div class="card"><h3>Sign out</h3><div class="row"><button class="btn sm" id="sOut">Sign out</button><span class="fine">Your own keys stay in this browser until you remove them.</span></div></div>`,
      models: () => `<div class="card"><h3>🔑 Answer with</h3><p class="muted">The free Nexus key works right away. Add your own key for unlimited answers and stronger models. <b>Your key stays in this browser</b> (it's never saved to your account${''}; DeepSeek keys pass through Nexus's server because DeepSeek blocks browsers, and are never stored).</p>
          ${Object.entries(PROVIDERS).map(([id, p]) => `<div class="prov ${r.provider === id ? 'on' : ''}"><label class="choice"><input type="radio" name="prov" value="${id}" ${r.provider === id ? 'checked' : ''}> ${esc(p.label)}${id === 'free' ? ' <span class="pill">DEFAULT</span>' : ks[id]?.key ? ' <span class="pill">KEY SAVED</span>' : ''}</label>
            ${id === 'free' ? `<span class="fine">${esc(p.note)} Flash unlimited (200 answers a day), Lyte 95 and Neodela 28 free chats.</span>` : `<div class="row"><input type="password" data-key="${id}" placeholder="${esc(p.hint)} paste your key" value="${esc(ks[id]?.key || '')}" style="flex:2;min-width:180px"><input data-model="${id}" placeholder="${esc(p.model)}" value="${esc(ks[id]?.model || '')}" style="flex:1;min-width:120px" title="Model"></div><span class="fine"><a href="${p.url}" target="_blank" rel="noopener">Get a ${esc(p.label)} key</a> · leave the model empty for ${esc(p.model)}</span>`}</div>`).join('')}
          <div class="row"><button class="btn primary sm" id="sKeys">Save</button><button class="btn sm" id="sTest">Test it</button><span class="fine" id="sKeyNote"></span></div></div>`,
      look: () => `<div class="card"><h3>🎨 Accent color</h3><div class="swatches">${ACCENTS.map(a => `<button data-accent="${a[0]}" style="background:${a[0]}" class="${store.get('accent', ACCENTS[0])[0] === a[0] ? 'on' : ''}" aria-label="${a[0]}"></button>`).join('')}</div></div>
        <div class="card"><h3>🌐 Web search</h3><label class="toggle"><input type="checkbox" id="sWeb" ${S.web ? 'checked' : ''}> Search the web for every message (you can also turn it on per message with 🌐)</label></div>
        <div class="card"><h3>🎓 Tutorial</h3><div class="row"><button class="btn sm" id="sTour">Show the tutorial again</button></div></div>`,
      usage: () => `<div class="card"><h3>📊 Free key usage</h3>${u ? `<p>Today: <b>${u.today}</b> of ${u.daily} free answers (resets at midnight UTC).</p><p>Lyte: <b>${u.lyte}</b> of ${u.lyte_limit} free chats · Neodela: <b>${u.neodela}</b> of ${u.neodela_limit} · Flash: unlimited</p><p class="fine">Lyte and Neodela allowances are shared with the Mac app if you also use it. With your own key, nothing is counted.</p>` : '<p class="muted">Loading…</p>'}</div>`,
      about: () => `<div class="card"><h3>What Test Run has, and what the Mac app adds</h3><table class="cmp"><tr><th></th><th>Test Run</th><th>Mac app</th></tr>
          ${[['Flash, Lyte, Neodela', 1, 1], ['@features (Seek, Cognition, Magyk, StudyMode…)', 1, 1], ['Web search with sources', 1, 1], ['Quizzes, flashcards, checklists, charts', 1, 1], ['Saved chats', 1, 1], ['Your own keys', 1, 1], ['Paragon (the agent that acts)', 0, 1], ['Uses your Mac: apps, files, calendar, reminders', 0, 1], ['Missions, Routines, Morning Brief', 0, 1], ['Study decks, spaced repetition, Shared Spaces', 0, 1], ['Voice orb, "Hey Nexus", screen help', 0, 1], ['N28C phone app', 0, 1], ['Huddles, debates, Write mode', 0, 1], ['Points, orb skins, Wrapped', 0, 1]].map(([t, a, b]) => `<tr><td>${t}</td><td>${a ? '✓' : '—'}</td><td>${b ? '✓' : ''}</td></tr>`).join('')}</table>
          <p class="fine">Have a Mac? <a href="https://github.com/apojidelegraphics/Nexus-28/releases/latest" target="_blank" rel="noopener">Download Nexus '28</a> and sign in with this same account.</p></div>
        <div class="card"><h3>Help</h3><p class="fine">Something wrong? <a href="https://github.com/apojidelegraphics/Nexus-28/issues" target="_blank" rel="noopener">Report a bug</a> · <a href="../status/" target="_blank">Status page</a></p></div>`
    };
    $('setBody').innerHTML = body[setTab]();
  }
  $('setTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { setTab = b.dataset.t; paintSettings(); } };
  $('settings').onclick = async e => {
    if (e.target.closest('[data-close]') || e.target === $('settings')) { $('settings').hidden = true; return; }
    const b = e.target.closest('button'); const id = b?.id;
    if (b?.dataset.accent) { store.set('accent', ACCENTS.find(a => a[0] === b.dataset.accent)); applyLook(); return paintSettings(); }
    if (id === 'sNameSave') { S.me.name = $('sName').value.trim().slice(0, 40); store.set('name:' + S.user.id, S.me.name); await sb.from('profiles').update({ nickname: S.me.name || null }).eq('id', S.user.id).then(() => {}, () => {}); paintEmpty(); paintMe(); paintSettings(); return toast('✓ Saved'); }
    if (id === 'sPic') return $('sPicF').click();
    if (id === 'sPicRm') { const { error } = await sb.from('profiles').update({ avatar_url: null }).eq('id', S.user.id); if (error) return toast(error.message); S.me.avatar = ''; paintMe(); paintSettings(); return toast('✓ Picture removed'); }
    if (id === 'sUserSave') {
      const u = $('sUser').value.trim(); if (!/^[A-Za-z0-9_.-]{3,24}$/.test(u)) return toast('Usernames are 3–24 characters: letters, numbers, _ . -', 4000);
      const { error } = await sb.from('profiles').update({ username: u }).eq('id', S.user.id);
      if (error) return toast(/duplicate|unique/i.test(error.message) ? 'That username is taken.' : error.message, 4000);
      S.me.username = u; paintMe(); return toast('✓ Saved');
    }
    if (id === 'sEmailSave') {
      const em = $('sEmail').value.trim(); if (!em || em === S.user.email) return;
      const { error } = await sb.auth.updateUser({ email: em }, { emailRedirectTo: location.origin + location.pathname });
      return toast(error ? error.message : 'Check both inboxes: confirm the change from the link we sent.', 6000);
    }
    if (id === 'sPwSave') {
      const pw = $('sPw').value; if (pw.length < 8) return toast('Use at least 8 characters.');
      const { error } = await sb.auth.updateUser({ password: pw }); if (!error) $('sPw').value = '';
      return toast(error ? error.message : '✓ Password changed', 4000);
    }
    if (id === 'sExport') return exportChat();
    if (id === 'sWipe') { if (!confirm('Delete every Test Run chat in your account? This can’t be undone.')) return; await sb.from('try_chats').delete().eq('user_id', S.user.id); store.set('localChats', []); S.chats = []; newChat(); return toast('Deleted'); }
    if (id === 'sOut') return signOut();
    if (id === 'sTour') { $('settings').hidden = true; return tour(0); }
    if (id === 'sKeys' || id === 'sTest') {
      const ks = keys();
      document.querySelectorAll('[data-key]').forEach(i => { const p = i.dataset.key, k = i.value.trim(), m = document.querySelector(`[data-model="${p}"]`).value.trim(); if (k) ks[p] = { key: k, model: m }; else delete ks[p]; });
      store.set('keys', ks);
      const pick = document.querySelector('input[name=prov]:checked')?.value || 'free';
      if (pick !== 'free' && !ks[pick]?.key) { $('sKeyNote').textContent = 'Paste a key for ' + PROVIDERS[pick].label + ' first.'; return; }
      store.set('route', { provider: pick }); loadUsage(); paintSettings();
      if (id === 'sTest') {
        $('sKeyNote').textContent = 'Testing…';
        try { const t = await callModel({ system: 'Reply with exactly: Nexus is connected.', messages: [{ role: 'user', content: 'Test' }], kind: 'extra' }); $('sKeyNote').textContent = '✓ ' + t.slice(0, 60); }
        catch (er) { $('sKeyNote').textContent = '✕ ' + er.message.slice(0, 140); }
      } else toast('✓ Saved');
    }
  };
  $('settings').onchange = async e => {
    if (e.target.id === 'sPicF' && e.target.files[0]) { try { toast('Uploading…'); await uploadPic(e.target.files[0]); paintMe(); paintSettings(); toast('✓ Picture updated'); } catch (er) { toast(er.message || 'That picture couldn’t be uploaded.', 4000); } return; } if (e.target.id === 'sWeb') { S.web = e.target.checked; store.set('web', S.web); paintFeats(); } if (e.target.name === 'prov') document.querySelectorAll('.prov').forEach(p => p.classList.toggle('on', p.contains(e.target))); };

  // ---------- the tutorial: a guided tour of everything, with a spotlight on each part
  const TOUR = [
    { t: '👋 Welcome to Nexus Test Run', html: `<p>This is Nexus '28 in your browser, made for people who don't have a Mac. It's a smaller version of the Mac app, but it's still a great study and work partner.</p><p>This quick tour shows you everything. It takes about a minute, and you can see it again any time from <b>?</b>.</p>` },
    { el: '#agentPick', t: '🤖 Meet the crew', html: `<ul><li><b>Flash</b> (default): fast, clear answers. Unlimited on the free key.</li><li><b>Lyte</b>: balanced everyday help, explanations and writing. 95 free chats.</li><li><b>Neodela</b>: deep thinking, studying and code. 28 free chats.</li></ul><p>Click one to switch. You can also type <kbd>@lyte</kbd> in a message to ask someone else just once.</p>` },
    { el: '.box', t: '💬 Ask anything', html: `<p>Type here and press <kbd>Enter</kbd> to send (<kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line). While it's answering, the button turns into <b>■ Stop</b>.</p><p>Not sure where to start? The cards on the start screen are good first questions.</p>` },
    { el: '.box', t: '✨ @features: superpowers', html: `<p>Type <kbd>@</kbd> to see what your agent can do. Some favorites:</p><ul><li><b>@Seek</b>: researches the web and cites sources</li><li><b>@StudyMode</b>: teaches, then quizzes you</li><li><b>@Magyk</b>: makes flip flashcards</li><li><b>@Cognition</b>: thinks step by step first</li><li><b>@Homework</b>: hints first, then the answer</li><li><b>@Cite</b>: MLA, APA or Chicago citations</li></ul><p>Each agent has its own set. Neodela has the most.</p>` },
    { el: '#webBtn', t: '🌐 Web search', html: `<p>Turn this on to have Nexus search the web for your next message and show its sources as links under the answer. Great for news, facts and anything recent.</p><p>Or use <b>@Seek</b>, which does it too. You get 60 searches a day.</p>` },
    { el: '#feed', t: '🃏 Interactive answers', html: `<p>Some answers come alive: quizzes you can take, flashcards you flip, checklists you tick, charts and idea boards. Your progress is saved with the chat.</p><p>Under every answer: <b>Copy</b>, <b>🔊 Read</b> (reads it aloud) and <b>↻ Redo</b> for a new answer. Click <b>✎ Edit</b> on your own message to change it and ask again.</p>` },
    { el: '#side', t: '🗂 Your chats are saved', html: `<p>Every chat is saved to your account, so you can pick it up on any computer. Search them, and use <b>⋯</b> to rename, pin, export or delete one.</p><p><b>@Echo</b> lets an agent read your past chats to remember what you talked about.</p>`, side: true },
    { el: '#usageBox', t: '📊 Free limits', html: `<p>The free Nexus key gives you <b>200 answers a day</b>. Flash is unlimited within that; Lyte and Neodela have a set number of free chats. Your count shows here.</p>`, side: true },
    { el: '#setBtn', t: '🔑 Your own key (optional)', html: `<p>Have a ChatGPT, Claude, Gemini, OpenRouter or DeepSeek key? Add it in <b>Settings → Models & keys</b> for unlimited answers and stronger models.</p><p>Your key is kept only in this browser, never in your account.</p>` },
    { t: '🎓 Use it to learn', html: `<p>Nexus is best as a tutor: ask it to explain, quiz you, or check your work. For graded work, use <b>@Homework</b> so you learn the steps, not just the answer.</p><p>AI can make mistakes. Double-check important facts (that's what @Seek's sources are for).</p>` },
    { el: '#helpBtn', t: '✅ You’re ready', html: `<p>That's it! Press <b>?</b> any time for this tour, and <b>⚙︎</b> for settings. Want the full experience with Paragon, Mac actions, missions and the phone app? It's in the Mac app.</p><p>Try your first question now. 🚀</p>`, last: true }
  ];
  let tourI = 0;
  function tour(i = 0) {
    tourI = i; $('tour').hidden = false;
    const st = TOUR[i];
    if (st.side && innerWidth <= 820) $('main').classList.add('side-open'); else $('main').classList.remove('side-open');
    const el = st.el && document.querySelector(st.el), hole = $('tourHole'), card = $('tourCard');
    card.innerHTML = `<span class="step">STEP ${i + 1} OF ${TOUR.length}</span><h3>${st.t}</h3>${st.html}<div class="row"><button class="link" id="tSkip">${st.last ? '' : 'Skip the tour'}</button><span class="row" style="gap:6px">${i ? '<button class="btn sm" id="tBack">Back</button>' : ''}<button class="btn primary sm" id="tNext">${st.last ? 'Start chatting' : 'Next'}</button></span></div>`;
    requestAnimationFrame(() => {
      if (el) {
        const r = el.getBoundingClientRect(), pad = 6;
        hole.classList.remove('none'); Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
        const cw = card.offsetWidth, ch = card.offsetHeight;
        let top = r.bottom + 14; if (top + ch > innerHeight - 10) top = Math.max(10, r.top - ch - 14);
        let left = Math.min(innerWidth - cw - 12, Math.max(12, r.left + r.width / 2 - cw / 2));
        if (r.width > innerWidth * .6 && r.height > innerHeight * .5) { top = Math.max(10, innerHeight / 2 - ch / 2); left = Math.max(12, innerWidth / 2 - cw / 2); }
        Object.assign(card.style, { top: top + 'px', left: left + 'px' });
      } else {
        hole.classList.add('none'); Object.assign(card.style, { top: Math.max(10, innerHeight / 2 - card.offsetHeight / 2) + 'px', left: Math.max(12, innerWidth / 2 - card.offsetWidth / 2) + 'px' });
      }
    });
  }
  function endTour() { $('tour').hidden = true; $('main').classList.remove('side-open'); store.set('toured:' + (S.user?.id || ''), true); $('input').focus(); }
  $('tour').onclick = e => {
    const id = e.target.closest('button')?.id;
    if (id === 'tNext') return TOUR[tourI].last ? endTour() : tour(tourI + 1);
    if (id === 'tBack') return tour(tourI - 1);
    if (id === 'tSkip') return endTour();
  };
  addEventListener('resize', () => { if (!$('tour').hidden) tour(tourI); });
  document.addEventListener('keydown', e => { if ($('tour').hidden) return; if (e.key === 'Escape') endTour(); if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); $('tNext')?.click(); } if (e.key === 'ArrowLeft') $('tBack')?.click(); });

  // ---------- events
  const closeSide = () => $('main').classList.remove('side-open');
  $('sideBtn').onclick = () => $('main').classList.toggle('side-open');
  $('scrim').onclick = closeSide;
  $('newChat').onclick = () => newChat();
  $('chatSearch').oninput = e => { S.search = e.target.value; paintChats(); };
  $('chatList').onclick = e => { const m = e.target.closest('[data-more]'); if (m) { e.stopPropagation(); return chatMenu(m.dataset.more, m); } const o = e.target.closest('[data-open]'); if (o) openChat(o.dataset.open); };
  $('chatList').onkeydown = e => { if (e.key === 'Enter') { const o = e.target.closest('[data-open]'); if (o) openChat(o.dataset.open); } };
  $('agentPick').onclick = e => { const b = e.target.closest('[data-agent]'); if (b) { setAgent(b.dataset.agent); if (S.chat && !S.chat.messages.length) S.chat.agent = b.dataset.agent; } };
  $('setBtn').onclick = () => openSettings();
  $('helpBtn').onclick = () => tour(0);
  $('webBtn').onclick = () => { S.web = !S.web; store.set('web', S.web); paintFeats(); toast(S.web ? '🌐 Web search on' : 'Web search off', 1400); };
  $('micBtn').hidden = !(window.SpeechRecognition || window.webkitSpeechRecognition);
  $('micBtn').onclick = dictate;
  $('sendBtn').onclick = () => S.busy ? S.busy.ctl.abort() : send();
  $('featRow').onclick = e => { const b = e.target.closest('[data-unfeat]'); if (b) { S.feats = S.feats.filter(f => f !== b.dataset.unfeat); paintFeats(); } };
  $('mentions').onmousedown = e => { const b = e.target.closest('[data-pick]'); if (b) { e.preventDefault(); pickMention(+b.dataset.pick); } };
  const inp = $('input');
  inp.addEventListener('input', () => { autosize(); paintMentions(); });
  inp.addEventListener('keydown', e => {
    if (!$('mentions').hidden) {
      const n = $('mentions')._list?.length || 0;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); S.sel = (S.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; return paintMentions(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pickMention(S.sel); }
      if (e.key === 'Escape') return hideMentions();
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $('sugg').onclick = e => { const b = e.target.closest('[data-sugg]'); if (!b) return; setAgent(b.dataset.sa); inp.value = b.dataset.sugg; autosize(); inp.focus(); if (!/:\s*$/.test(b.dataset.sugg)) send(); };
  $('msgs').onclick = e => {
    const v = e.target.closest('[data-view]'); if (v) { const d = document.createElement('div'); d.className = 'viewer'; d.innerHTML = `<img src="${esc(v.src)}" alt="">`; d.onclick = () => d.remove(); document.body.appendChild(d); return; }
    const b = e.target.closest('button'); if (!b) return;
    const m = S.chat?.messages[+(b.dataset.copy ?? b.dataset.speak ?? b.dataset.edit ?? b.dataset.esend)];
    if (b.dataset.copy != null) { navigator.clipboard?.writeText(m.content); return toast('Copied', 1200); }
    if (b.dataset.speak != null) return speak(m.content);
    if (b.dataset.regen) return regenerate();
    if (b.dataset.edit != null) {
      const i = +b.dataset.edit, row = b.closest('.msg');
      row.innerHTML = `<div class="edit-box"><textarea rows="3">${esc(m.content)}</textarea><div class="row"><button class="btn sm" data-ecancel>Cancel</button><button class="btn primary sm" data-esend="${i}">Ask again</button></div></div>`;
      row.querySelector('textarea').focus(); return;
    }
    if (b.dataset.ecancel != null) return paintFeed();
    if (b.dataset.esend != null) { const i = +b.dataset.esend, t = b.closest('.edit-box').querySelector('textarea').value.trim(); if ((!t && !m.images?.length) || S.busy) return; S.chat.messages = S.chat.messages.slice(0, i); return send(t, { images: m.images || [] }); }
  };

  // ---------- pictures (3.4.1): 📎, paste or drop. Shrunk in the browser (max 1280 px) before they're sent.
  async function shrink(file, max = 1280, q = .85) {
    const img = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  async function addFiles(files) {
    const list = [...files].filter(f => /^image\//.test(f.type));
    if (!list.length) return;
    for (const f of list) {
      if (S.att.length >= 4) { toast('Up to 4 pictures per message.'); break; }
      try { S.att.push({ url: await shrink(f), name: f.name }); } catch { toast('That picture couldn’t be opened.'); }
    }
    paintAtt(); $('input').focus();
  }
  function paintAtt() {
    $('attRow').hidden = !S.att.length;
    $('attRow').innerHTML = S.att.map((a, i) => `<div class="att" style="background-image:url('${a.url}')" title="${esc(a.name || '')}"><button data-unatt="${i}" aria-label="Remove">✕</button></div>`).join('');
  }
  $('attBtn').onclick = () => $('attFile').click();
  $('attFile').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('attRow').onclick = e => { const b = e.target.closest('[data-unatt]'); if (b) { S.att.splice(+b.dataset.unatt, 1); paintAtt(); } };
  $('input').addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])]; if (f.some(x => /^image\//.test(x.type))) { e.preventDefault(); addFiles(f); } });
  const comp = document.querySelector('.composer');
  comp.addEventListener('dragover', e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')) { e.preventDefault(); comp.classList.add('drop'); } });
  comp.addEventListener('dragleave', () => comp.classList.remove('drop'));
  comp.addEventListener('drop', e => { e.preventDefault(); comp.classList.remove('drop'); addFiles(e.dataTransfer.files); });

  // ---------- your profile (3.4.1): picture, name, username, email, password. Shown bottom right of the sidebar.
  const picUrl = () => /^https:\/\//.test(S.me.avatar || '') ? S.me.avatar.replace(/["'()\\]/g, '') : '';
  const pfp = (cls = '') => { const u = picUrl(); return `<span class="pfp ${cls} ${u ? 'img' : ''}" style="${u ? `background-image:url('${u}')` : ''}"><span class="ini">${esc(((S.me.name || S.me.username || S.user?.email || '?')[0] || '?').toUpperCase())}</span>${S.owner ? '<i class="crown" title="Owner">👑</i>' : ''}</span>`; };
  function paintMe() { $('meChip').innerHTML = `<span class="who"><b>${esc(S.me.name || S.me.username || 'You')}</b><small>${esc(S.me.username ? '@' + S.me.username : S.user?.email || '')}</small></span>${pfp()}`; }
  $('meChip').onclick = () => openSettings('account');
  async function uploadPic(file) {
    const blob = await (await fetch(await shrink(file, 256, .9))).blob();
    const path = `${S.user.id}/avatar.jpg`;
    const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
    const { error: e2 } = await sb.from('profiles').update({ avatar_url: url }).eq('id', S.user.id); if (e2) throw e2;
    S.me.avatar = url;
  }

  // ---------- sign in / account
  let authMode = 'up';
  $('authTabs').onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; authMode = b.dataset.mode; document.querySelectorAll('#authTabs button').forEach(x => x.classList.toggle('on', x === b)); $('aName').hidden = authMode === 'in'; $('aForgot').hidden = authMode === 'up'; $('aGo').textContent = authMode === 'up' ? 'Create my account' : 'Sign in'; $('aPass').autocomplete = authMode === 'up' ? 'new-password' : 'current-password'; $('aErr').hidden = true; };
  $('authForm').onsubmit = async e => {
    e.preventDefault(); const err = t => { $('aErr').textContent = t; $('aErr').hidden = !t; };
    const email = $('aEmail').value.trim(), password = $('aPass').value, name = $('aName').value.trim();
    $('aGo').disabled = true; err('');
    try {
      if (authMode === 'up') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nickname: name }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (name) store.set('pendingName', name);
        if (!data.session) { err(''); toast('Check your email to confirm your account, then sign in.', 6000); document.querySelector('#authTabs [data-mode="in"]').click(); }
      } else { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; }
    } catch (x) { err(/invalid login/i.test(x.message) ? 'That email and password don’t match.' : x.message); }
    finally { $('aGo').disabled = false; }
  };
  $('aForgot').onclick = async () => { const email = $('aEmail').value.trim(); if (!email) return toast('Type your email first.'); const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); toast(error ? error.message : 'We sent you a link to reset your password.', 5000); };
  async function signOut() { await sb.auth.signOut(); location.reload(); }

  S.orbs = [];
  function orbs() {
    for (const id of ['heroOrb', 'authOrb']) { const c = $(id); if (c && window.NexusOrb && !c._orb) { c._orb = window.NexusOrb.create(c, { color: agent().color, skin: 'aurora' }); S.orbs.push(c._orb); } }
  }
  async function enter(session) {
    S.user = session.user;
    $('auth').hidden = true; $('main').hidden = false;
    const pend = store.get('pendingName', '');
    const { data: prof } = await sb.from('profiles').select('nickname,username,avatar_url').eq('id', S.user.id).maybeSingle();
    S.me.username = prof?.username || ''; S.me.avatar = prof?.avatar_url || '';
    sb.rpc('app_owner_ids').then(({ data }) => { S.owner = Array.isArray(data) && data.includes(S.user.id); paintMe(); }, () => {});
    S.me.name = store.get('name:' + S.user.id, '') || prof?.nickname || pend || S.user.user_metadata?.nickname || prof?.username || '';
    if (pend) { store.set('pendingName', ''); store.set('name:' + S.user.id, pend); sb.from('profiles').update({ nickname: pend }).eq('id', S.user.id).then(() => {}, () => {}); }
    sb.rpc('log_activity', { p_source: 'web', p_version: 'try-3.4.1' }).then(() => {}, () => {});
    // agent prompts + @features from Supabase (same as the apps)
    sb.from('assistant_prompts').select('name,prompt,features').in('name', Object.values(AGENTS).map(a => a.db)).then(({ data }) => {
      for (const r of data || []) { const a = Object.values(AGENTS).find(x => x.db === r.name); if (!a) continue; S.prompts[a.id] = { prompt: r.prompt }; const f = K.features.canonical(r.features || []); if (f.length) a.features = f; }
      setAgent(S.agent, false);
    });
    setAgent(S.agent, false); orbs(); paintFeats(); paintMe();
    loadMaint(); setInterval(loadMaint, 60e3);
    await loadChats(); loadUsage();
    const open = store.get('open', null);
    if (open && S.chats.some(c => c.id === open)) await openChat(open); else newChat();
    if (!store.get('toured:' + S.user.id, false)) setTimeout(() => tour(0), 500);
  }
  function showAuth() { $('auth').hidden = false; $('main').hidden = true; orbs(); }

  applyLook();
  sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' && session && !S.user) enter(session); if (ev === 'SIGNED_OUT') { S.user = null; showAuth(); } });
  sb.auth.getSession().then(({ data }) => data.session ? enter(data.session) : showAuth());
})();
