// Nexus '28 Test Run (v3.7): Nexus in a browser, for when you can't install the Mac or Windows app.
// Flash (default), Lyte and Neodela with their @features (the same ones as the desktop app: docs/try/nexuskit.js is built
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
  const WEB_NOTE = `\n\n[WHERE YOU ARE] You are running in Nexus '28 Test Run, the web version of Nexus, for people using a browser instead of the Mac or Windows app. You can't use the user's computer, files, calendar, email or apps, and you can't take actions. When the app gives you web results, use them and cite them by number like [1]. If something needs the full Nexus app for Mac (Paragon, Mac actions, missions, routines, study decks), say so briefly.`;
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
  // 3.7: every search and page read shows as a chip on the answer (like the desktop app), and a failed search no
  // longer stops the answer: it says so on the chip and the agent answers from what it knows.
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  async function webContext(q, signal, step = () => {}) {
    const query = q.trim().slice(0, 200);
    const once = () => fnPost({ action: 'search', q: query }, signal).then(x => x.json()).catch(e => ({ ok: false, message: e?.message }));
    const s0 = step({ kind: 'search', text: query, state: 'run' });
    let r = await once();
    if (!r?.ok && !signal?.aborted) { await new Promise(res => setTimeout(res, 700)); r = await once(); }   // 3.6: a first search right after a quiet spell can drop; try once more
    if (!r?.ok) { step({ ...s0, state: 'fail', note: r?.message || 'No search engine answered' }); throw new Error(r?.message || 'Web search isn’t working right now.'); }
    step({ ...s0, state: 'ok', note: r.results.length + ' results' });
    const top = r.results.slice(0, 5);
    const pages = await Promise.all(top.slice(0, 2).map(async x => {
      const st = step({ kind: 'read', text: x.title || host(x.url), url: x.url, state: 'run' });
      const y = await fnPost({ action: 'read', url: x.url }, signal).then(y => y.json()).catch(() => null);
      step({ ...st, state: y?.ok ? 'ok' : 'fail', note: y?.ok ? '' : 'couldn’t open it, used the summary' }); return y;
    }));
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
    paintWebBtn();
  }
  const agentDown = id => S.maint.find(m => EVERY.includes(m.scope) || m.scope === id || m.scope === `nexus 28 ${id}` || m.scope === `nexus '28 ${id}`);
  const featDown = f => S.maint.find(m => fnorm(m.scope) === fnorm(f) && !EVERY.includes(m.scope) && !AGENTS[m.scope]) || (/^(seek|cite)$/i.test(f) && webDown());
  // 3.7: one switch for web search everywhere (Apoji Admin → Maintenance → "🌐 Web search", scope websearch)
  const webDown = () => S.maint.find(m => ['websearch', 'search'].includes(fnorm(m.scope)));
  function paintWebBtn() { const d = webDown(), b = $('webBtn'); if (!b) return; b.disabled = !!d; b.classList.toggle('down', !!d); b.title = d ? '🛠 ' + (d.message || 'Web search is down for maintenance.') : 'Search the web for this message'; }

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
      if ((S.web || plan.web) && webDown()) { system += '\n[Web search is switched off right now. Answer from what you know and say that briefly if the question needs current info.]'; }
      else if (S.web || plan.web) {
        status('Searching the web'); msg.trail = [];
        const step = x => { const i = x.id ?? msg.trail.length; msg.trail[i] = { ...x, id: i }; paintLast(); return msg.trail[i]; };
        try { const w = await webContext(p.text.replace(/@\w+/g, ''), ctl.signal, step); msg.sources.push(...w.sources.map(({ text, ...s }) => s)); system += w.note; }
        catch (e) { if (e.name === 'AbortError') throw e; system += '\n[Web search failed just now. Answer from what you know, and say in one short line that you couldn’t search the web.]'; }
      }
      if (plan.knowledge) { status('Looking it up'); const w = await wikiContext(p.text.replace(/@\w+/g, '')); if (w) { msg.sources.push(...w.sources); system += w.note; } }
      if ((plan.chats || plan.history) && !S.chat.incognito) { status('Reading your past chats'); system += await chatsContext(p.text).catch(() => ''); }
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
      // 3.9: every agent looks at the reviewed lessons (training examples the Apoji Team approved) before answering
      system += await lessonsNote(p.text.replace(/@\w+/g, ''), ag.id);
      status(`${ag.name} is writing`);
      const t0 = Date.now();
      await callModel({ system, messages: history, signal: ctl.signal, features: feats, onText: (_t, all) => { msg.content = all; msg.status = ''; paintLast(true); } });
      msg.content = K.kit.retagBlocks(msg.content, plan.blocks) || '(no answer)';
      msg.model = route().provider === 'free' ? 'Free Nexus key' : PROVIDERS[route().provider].label;
      if (S.training?.on && !S.chat.incognito && msg.content.length > 1) trainRecord(msg, p.text, ag.id, feats);
      if (plan.swift) msg.speed = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
      if (plan.speak) speak(msg.content);
      if (route().provider !== 'free') spendRecord(route(), system.length + history.reduce((n, m) => n + String(m.content || '').length, 0), msg.content.length);
      if (betaOn('second_look') && ['flash', 'lyte'].includes(ag.id) && !msg.error && msg.content.length > 40) secondLook(msg, history).catch(() => {});
    } catch (e) {
      if (e.name === 'AbortError') { msg.content = (msg.content || '') + '\n\n_(stopped)_'; }
      else { msg.error = true; msg.content = e.message; if (e.code === 'signin') signOut(); }
    } finally {
      delete msg.status; S.busy = null; setBusy(false); paintFeed(); if (!S.chat.incognito) save(); loadUsage();
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
  async function newChat(paint = true, { incognito = false } = {}) {
    S.chat = { id: incognito ? 'inc-' + Date.now() : null, title: incognito ? 'Incognito chat' : 'New chat', agent: S.agent, messages: [], ...(incognito ? { incognito: true } : {}) };
    store.set('open', null);
    if (paint) { paintChats(); paintFeed(true); closeSide(); $('input').focus(); }
  }
  // 3.7 beta: Branch a chat — a new chat with everything up to that answer, to try another direction
  function branchAt(i) {
    const c = S.chat; if (!c || S.busy) return;
    S.chat = { id: null, title: '↳ ' + String(c.title).replace(/^↳ /, '').slice(0, 100), agent: c.agent || S.agent, messages: c.messages.slice(0, i + 1).map(m => ({ ...m })), branchOf: { id: c.id, title: c.title } };
    betaEvent('branch_chat'); store.set('open', null); save(); paintChats(); paintFeed(); $('input').focus(); toast('↳ Branched. The original chat is still there.');
  }
  let saveT = null;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const c = S.chat; if (!c || !c.messages.length || c.incognito) return;
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
    m.innerHTML = `<button data-a="ren">✎ Rename</button><button data-a="pin">📌 ${c.pinned ? 'Unpin' : 'Pin to top'}</button><button data-a="exp">⬇ Export (Markdown)</button>${S.channel !== 'stable' ? '<button data-a="beta">💬 Beta feedback</button>' : ''}<button data-a="del" class="danger">🗑 Delete</button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); m.style.top = Math.min(innerHeight - m.offsetHeight - 8, r.bottom + 4) + 'px'; m.style.left = Math.min(innerWidth - m.offsetWidth - 8, r.left) + 'px';
    setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
    m.onclick = async e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; m.remove();
      if (a === 'ren') { const t = prompt('New name', c.title); if (!t) return; c.title = t.slice(0, 120); if (S.chat?.id === id) S.chat.title = c.title; await sb.from('try_chats').update({ title: c.title }).eq('id', id); }
      if (a === 'pin') { c.pinned = !c.pinned; await sb.from('try_chats').update({ pinned: c.pinned }).eq('id', id); }
      if (a === 'beta') return betaFeedback();
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
      ${m.trail?.length ? `<div class="trail">${m.trail.map(t => `<${t.url ? `a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer"` : 'span'} class="tc ${t.state}" title="${esc(t.note || t.url || '')}">${t.kind === 'search' ? '🔍 Searched' : '📄 Read'} <b>${esc(t.kind === 'search' ? '“' + t.text.slice(0, 60) + '”' : t.text.slice(0, 48))}</b>${t.state === 'run' ? ' <span class="dots"><i></i><i></i><i></i></span>' : t.state === 'fail' ? ` <em>✕ ${esc((t.note || 'failed').slice(0, 70))}</em>` : t.note ? ` <small>${esc(t.note)}</small>` : ''}</${t.url ? 'a' : 'span'}>`).join('')}</div>` : ''}
      ${m.thinking ? `<details class="think"><summary>REASONING</summary><div>${esc(m.thinking)}</div></details>` : ''}
      <div class="body">${m.error ? esc(m.content) : m.content ? MD.render(m.content) : ''}</div>
      ${m.status || (S.busy?.msg === m && !m.content) ? `<div class="status"><span class="dots"><i></i><i></i><i></i></span>${esc(m.status || 'Thinking')}</div>` : ''}
      ${m.sources?.length && !m.status ? `<div class="srcs">${m.sources.filter(s => s.url).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.url)}"><b>${esc(s.n)}</b>${esc(s.title)}</a>`).join('')}</div>` : ''}
      ${m.secondLook ? `<details class="second-look"><summary>👀 Second Look: ${esc(m.secondLook.head)}</summary><div>${MD.render(m.secondLook.note)}</div></details>` : m.secondLook === null ? '' : ''}
      ${!S.busy && m.content ? `<div class="tools"><button data-copy="${i}">⧉ Copy</button><button data-speak="${i}">🔊 Read</button>${m.trainRef && S.training?.on ? `<button data-rate="${i}" data-v="1" class="${m.rated === 1 ? 'on' : ''}" title="Good answer (helps train Nexus)">👍</button><button data-rate="${i}" data-v="-1" class="${m.rated === -1 ? 'on' : ''}" title="Not a good answer">👎</button><button data-better="${i}" title="Write a better answer">✏️</button>` : ''}${betaOn('branch_chat') && !S.chat?.incognito && !m.error ? `<button data-branch="${i}" title="Start a new chat from here">↳ Branch</button>` : ''}${last ? '<button data-regen="1">↻ Redo</button>' : ''}</div>` : ''}</div>`;
  }
  function paintFeed(top) {
    const msgs = S.chat?.messages || [];
    $('empty').hidden = msgs.length > 0;
    if (!msgs.length) paintEmpty();
    const c = S.chat, banner = c?.incognito ? '<div class="conv-note">🕶 Incognito: this chat isn’t saved and doesn’t look at your past chats. It’s gone when you leave it.</div>' : c?.branchOf ? `<div class="conv-note">↳ Branched from “${esc(c.branchOf.title || 'a chat')}”</div>` : '';
    $('msgs').innerHTML = banner + msgs.map((m, i) => msgHtml(m, i, i === msgs.length - 1)).join('');
    $('main').classList.toggle('incog', !!c?.incognito);
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

  // ---------- 3.7 beta features (same flags as the desktop app: Apoji Admin → Feature flags)
  S.flags = {}; S.channel = 'stable';
  const BETA_DEFAULTS = { second_look: 'all', branch_chat: 'all', incognito: 'all', spend_tracker: 'all' };   // 3.10: out of beta
  const NEED = { all: 0, beta: 1, admin: 2, off: 99 }, RANKC = { stable: 0, beta: 1, admin: 2 };
  const betaOn = k => { const st = S.flags[k] ?? BETA_DEFAULTS[k]; return !!st && RANKC[S.channel] >= NEED[st] && !store.get('optOut', []).includes(k); };
  async function loadFlags() {
    const [{ data: rows }, { data: prof }, { data: roles }] = await Promise.all([
      sb.from('feature_flags').select('key,stage').then(x => x, () => ({})),
      sb.from('profiles').select('is_beta_tester').eq('id', S.user.id).maybeSingle().then(x => x, () => ({})),
      sb.from('admin_roles').select('level').eq('user_id', S.user.id).then(x => x, () => ({}))]);
    for (const r of rows || []) S.flags[r.key] = r.stage;
    S.channel = (roles || []).length || S.owner ? 'admin' : prof?.is_beta_tester ? 'beta' : 'stable';
    // 3.8: beta testers share chats for training; until they agree, beta features pause
    S.tester = !!prof?.is_beta_tester;
    const { data: tr } = await sb.rpc('training_my_status').then(x => x, () => ({}));
    S.training = tr || null;
    S.trainingNeeded = S.channel === 'beta' && !!tr && !tr.on;
    if (S.trainingNeeded) { S.channel = 'stable'; setTimeout(() => toast('🧠 Beta features are paused until you agree to share chats for training: Settings → Account.', 7000), 1500); }
    $('incBtn').hidden = !betaOn('incognito');
    if (S.chat) paintFeed();
  }
  const seenBeta = new Set();
  function betaEvent(feature, kind = 'use', note = null) {
    if (kind === 'use') { const k = feature + new Date().toDateString(); if (seenBeta.has(k)) return; seenBeta.add(k); }
    return sb.from('beta_events').insert({ feature, kind, platform: /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'phone' : 'web', note: note ? String(note).slice(0, 500) : null }).then(r => r, () => ({ error: { message: 'offline' } }));
  }
  function betaFeedback() {
    const on = Object.keys(BETA_DEFAULTS).filter(betaOn);
    const d = document.createElement('div'); d.className = 'modal'; d.innerHTML = `<div class="sheet" style="max-width:440px"><header><b>💬 Beta feedback</b><span class="sp"></span><button class="ib" data-close>✕</button></header><div class="set-body">
      <p class="muted">Pick the feature and tap. It goes straight to the Apoji Team.</p>
      <select id="bfFeat" style="width:100%">${on.map(k => `<option value="${k}">${esc({ second_look: 'Second Look', branch_chat: 'Branch a chat', incognito: 'Incognito chat', spend_tracker: 'Key spend tracker' }[k])}</option>`).join('')}<option value="beta_lab">Something else</option></select>
      <div class="row" style="margin:10px 0"><button class="btn" data-bf="up" style="flex:1">👍 Works well</button><button class="btn" data-bf="down" style="flex:1">👎 Not great</button></div>
      <textarea id="bfNote" rows="3" style="width:100%" placeholder="Anything to add? (optional)"></textarea></div></div>`;
    document.body.appendChild(d);
    d.onclick = async e => {
      if (e.target === d || e.target.closest('[data-close]')) return d.remove();
      const b = e.target.closest('[data-bf]'); if (!b) return; b.disabled = true;
      const f = d.querySelector('#bfFeat').value, note = d.querySelector('#bfNote').value.trim();
      const r = await betaEvent(f, b.dataset.bf, note);
      if (note && b.dataset.bf === 'down') sb.from('feedback_reports').insert({ user_id: S.user.id, kind: 'Beta bug', title: 'Test Run beta: ' + f, body: note, feature: f, source: 'web', app_version: 'try-3.7.0', channel: 'web' }).then(() => {}, () => {});
      d.remove(); toast(r?.error ? 'Couldn’t send it (the beta dashboard isn’t set up yet).' : 'Thank you! 💬', 2500);
    };
  }
  let rulesCache = { at: 0, list: [] };
  async function lessonsNote(q, agentId) {
    if (String(q).trim().length < 4) return '';
    const race = pr => Promise.race([pr, new Promise(r => setTimeout(() => r({}), 1500))]);
    const [{ data: hits }, rules] = await Promise.all([race(sb.rpc('training_lessons', { p_query: String(q).slice(0, 500), p_agent: agentId, p_limit: 3 }).then(x => x, () => ({}))),
      Date.now() - rulesCache.at < 600e3 ? rulesCache.list : race(sb.rpc('training_rules', { p_agent: agentId }).then(x => x, () => ({}))).then(({ data }) => { if (Array.isArray(data)) rulesCache = { at: Date.now(), list: data }; return data || []; })]);
    const h = (hits || []).filter(x => x?.q && x?.a), r = (rules || []).filter(Boolean).slice(0, 12);
    if (!h.length && !r.length) return '';
    return '\n\n[LESSONS FROM REVIEWED EXAMPLES — the Apoji Team checked these. You must follow them when they apply to this question; they are not from this user.]' + (r.length ? '\nRules:\n' + r.map(x => '• ' + String(x).slice(0, 300)).join('\n') : '') + (h.length ? '\nSimilar questions and the answer that was approved:\n' + h.map((x, i) => `${i + 1}. Q: ${String(x.q).slice(0, 400)}\n   Good answer: ${String(x.a).slice(0, 800)}${x.rule ? `\n   Why: ${String(x.rule).slice(0, 200)}` : ''}`).join('\n') : '');
  }
  // 3.8: one training example per answer (personal details stripped first); 👍 / 👎 / ✏️ find it again by ref
  const SCRUB = [[/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'], [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g, '[key]'], [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[key]'], [/\bAIza[0-9A-Za-z_-]{30,}\b/g, '[key]'], [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[token]'], [/\b(?:\d[ -]?){13,19}\b/g, '[number]'], [/(\+?\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g, '[phone]'], [/(https?:\/\/[^\s?#]+)\?[^\s#)]+/g, '$1'], [/\b(password|passcode|pin)\s*(is|:)\s*\S+/gi, '$1 [hidden]']];
  const scrub = t => SCRUB.reduce((x, [re, to]) => x.replace(re, to), String(t || ''));
  async function trainRecord(msg, q, agentId, feats) {
    const prompt = scrub(q).trim(), answer = scrub(msg.content).trim(); if (prompt.length < 4) return;
    const ref = `try:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await sb.from('training_examples').insert({ ref, source: 'test_run', agent: agentId, model: msg.model || '', features: feats || [], prompt: prompt.slice(0, 6000), answer: answer.slice(0, 12000) });
    if (!error) { msg.trainRef = ref; paintFeed(); save(); }
  }
  async function trainRate(i, v) { const m = S.chat?.messages[i]; if (!m?.trainRef) return; m.rated = v; await sb.from('training_examples').update({ rating: v }).eq('ref', m.trainRef); paintFeed(); save(); toast(v > 0 ? 'Thanks: that helps train Nexus 🧠' : 'Thanks, noted', 1800); }
  async function trainCorrect(i) {
    const m = S.chat?.messages[i]; if (!m?.trainRef) return;
    const d = document.createElement('div'); d.className = 'modal'; d.innerHTML = `<div class="sheet"><header><b>✏️ A better answer</b><span class="sp"></span><button class="ib" data-close>✕</button></header><div class="set-body"><p class="muted">Write what Nexus should have said. It's added to this example (personal details removed) to help train Nexus models.</p><textarea id="caT" rows="8" style="width:100%"></textarea><div class="row" style="margin-top:8px"><span class="sp"></span><button class="btn primary" id="caGo">Send</button></div></div></div>`;
    document.body.appendChild(d); d.querySelector('#caT').value = m.content;
    d.onclick = async e => { if (e.target === d || e.target.closest('[data-close]')) return d.remove(); if (e.target.id === 'caGo') { await sb.from('training_examples').update({ correction: scrub(d.querySelector('#caT').value).slice(0, 12000), rating: -1 }).eq('ref', m.trainRef); m.rated = -1; d.remove(); paintFeed(); save(); toast('Thanks: that helps train Nexus 🧠'); } };
  }
  // Second Look: after Flash or Lyte answers, a careful second pass checks it and speaks up only if it disagrees
  async function secondLook(msg, history) {
    const q = [...history].reverse().find(m => m.role === 'user')?.content || '';
    const out = await callModel({ kind: 'extra', system: 'You double-check another assistant’s answer. If it is correct and complete enough, reply exactly OK. If something is wrong, missing or misleading, reply "DISAGREE: <one-line headline>" then a short explanation with the correction. Be strict about facts, math and code, lenient about style.', messages: [{ role: 'user', content: `<question>\n${q.slice(0, 4000)}\n</question>\n<answer>\n${msg.content.slice(0, 8000)}\n</answer>` }] });
    const m = String(out || '').trim().match(/^DISAGREE:\s*(.+?)(?:\n+([\s\S]*))?$/i);
    betaEvent('second_look'); if (!m) return;
    msg.secondLook = { head: m[1].slice(0, 120), note: (m[2] || m[1]).trim().slice(0, 2000) };
    paintFeed(); if (!S.chat?.incognito) save();
  }
  // Key spend tracker: about how much your own keys cost (an estimate, ~4 characters a token × list prices). This browser only.
  const PRICES = [[/claude.*opus/i, 15, 75], [/claude.*haiku/i, 1, 5], [/claude/i, 3, 15], [/gpt-5.*nano/i, .05, .4], [/gpt-5.*mini/i, .25, 2], [/gpt-5/i, 1.25, 10], [/gpt-4o-mini/i, .15, .6], [/gpt-4o|gpt-4\.1/i, 2.5, 10], [/gemini.*pro/i, 1.25, 10], [/gemini.*flash-lite/i, .1, .4], [/gemini/i, .3, 2.5], [/deepseek.*(reason|r1)/i, .55, 2.19], [/deepseek/i, .27, 1.1], [/:free$/i, 0, 0], [/llama|qwen|gemma|mistral/i, .2, .6]];
  const priceOf = m => (PRICES.find(([re]) => re.test(m || '')) || [0, 1, 4]).slice(1);
  const dayK = (t = new Date()) => t.toISOString().slice(0, 10);
  function spendRecord(r, inChars, outChars) {
    const [a, b] = priceOf(r.model), cost = inChars / 4e6 * a + outChars / 4e6 * b;
    const d = store.get('spend', {}), k = dayK(), row = ((d[k] ||= {})[r.provider + '|' + (r.model || '')] ||= { calls: 0, cost: 0 });
    row.calls++; row.cost += cost; const ks = Object.keys(d).sort(); while (ks.length > 120) delete d[ks.shift()]; store.set('spend', d);
  }
  function spendCard() {
    if (!betaOn('spend_tracker')) return ''; betaEvent('spend_tracker');
    const d = store.get('spend', {}), now = Date.now(), wk = dayK(new Date(now - 6 * 864e5)), mo = dayK().slice(0, 7);
    let today = 0, week = 0, month = 0; const byP = {};
    for (const [day, rows] of Object.entries(d)) for (const [k, r] of Object.entries(rows)) { if (day === dayK()) today += r.cost; if (day >= wk) week += r.cost; if (day.startsWith(mo)) { month += r.cost; const p = PROVIDERS[k.split('|')[0]]?.label || k.split('|')[0]; byP[p] = (byP[p] || 0) + r.cost; } }
    const $$ = v => v < 0.01 && v > 0 ? '< $0.01' : '$' + v.toFixed(2);
    return `<div class="card"><h3>💸 Key spend <span class="pill">BETA</span></h3><p class="muted">About how much your own keys cost in Test Run. An estimate from words in and out × each model's list price; your provider's bill is the real number.</p>
      <div class="spend"><div><b>${$$(today)}</b><span>Today</span></div><div><b>${$$(week)}</b><span>7 days</span></div><div><b>${$$(month)}</b><span>This month</span></div></div>
      ${Object.keys(byP).length ? `<p class="fine">${Object.entries(byP).sort((a, b) => b[1] - a[1]).map(([p, v]) => `${esc(p)} ${$$(v)}`).join(' · ')}</p>` : '<p class="fine">Nothing yet. The free Nexus key never costs you anything.</p>'}
      <div class="row"><button class="btn sm" id="sSpendReset">Reset</button></div></div>`;
  }

  // 3.8: the "needs testing" checklist (Apoji Admin → Testing) for Test Run
  async function paintTests() {
    const box = $('sTests'); if (!box) return;
    const [{ data: items, error }, { data: mine }] = await Promise.all([sb.from('test_items').select('id,release,title,steps').eq('archived', false).in('platform', ['all', 'web']).order('release', { ascending: false }).order('sort').limit(100), sb.from('test_results').select('item_id,status,note').eq('user_id', S.user.id)]);
    if (error) { box.textContent = /test_items/.test(error.message) ? 'Not set up yet.' : error.message; return; }
    const rel = items?.[0]?.release, list = (items || []).filter(i => i.release === rel), my = Object.fromEntries((mine || []).map(r => [r.item_id, r]));
    box.className = ''; box.innerHTML = !list.length ? '<p class="muted">Nothing to test right now. Thanks!</p>' : `<p class="fine">For ${esc(rel)} in Test Run.</p>` + list.map(i => `<div class="test-row" data-test="${i.id}"><div><b>${esc(i.title)}</b>${i.steps ? `<div class="fine" style="white-space:pre-wrap">${esc(i.steps)}</div>` : ''}${my[i.id]?.note ? `<div class="fine">“${esc(my[i.id].note)}”</div>` : ''}</div><div class="row" style="gap:4px">${[['pass', '✅'], ['fail', '❌'], ['skip', '⏭']].map(([k, ic]) => `<button class="btn sm ${my[i.id]?.status === k ? 'primary' : ''}" data-tst="${k}">${ic}</button>`).join('')}</div></div>`).join('');
  }

  // ---------- usage
  async function loadUsage() {
    const { data } = await sb.rpc('try_my_usage'); S.usage = data || null;
    const u = S.usage, r = route();
    $('usageBox').hidden = !!u?.unlimited; document.querySelector('#setTabs [data-t="usage"]')?.toggleAttribute('hidden', !!u?.unlimited && !betaOn('spend_tracker'));
    if (u?.unlimited) { $('usageBox').innerHTML = ''; return; }
    $('usageBox').innerHTML = r.provider !== 'free' ? `<span>🔑 Using your ${esc(PROVIDERS[r.provider].label)} key: no limits.</span>`
      : u ? `<span>Free answers today: <b>${u.today}</b> / ${u.daily}</span><div class="bar"><i style="width:${Math.min(100, u.today / u.daily * 100)}%"></i></div><span>Lyte ${u.lyte}/${u.lyte_limit} · Neodela ${u.neodela}/${u.neodela_limit} · Flash unlimited</span>` : '';
  }

  // ---------- settings
  const ACCENTS = [['#3dffa0', '61, 255, 160'], ['#5cc8ff', '92, 200, 255'], ['#b18cff', '177, 140, 255'], ['#ff6bb5', '255, 107, 181'], ['#ffb547', '255, 181, 71'], ['#ff5a6e', '255, 90, 110']];
  // 3.5: any accent color (a picker or a #hex); dark colors are brightened a little so text on them stays readable
  function setAccent(hex) {
    const m = String(hex || '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i); if (!m) return false;
    let h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    let [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum < 0.35) { const k = 0.35 / Math.max(lum, 0.02); [r, g, b] = [r, g, b].map(v => Math.min(255, Math.round(v * k + 30))); }
    h = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    store.set('accent', [h, `${r}, ${g}, ${b}`]); applyLook(); return true;
  }
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
          </div><p class="fine">Same account as Nexus '28 on Mac and PC and in N28C, so changes show up there too.</p></div>
        <div class="card"><h3>💬 Your chats</h3><p class="muted">Saved to your account, so they follow you to any browser. Only you can see them.</p><div class="row"><button class="btn sm" id="sExport">Export this chat</button><button class="btn sm danger" id="sWipe">Delete all my Test Run chats</button></div></div>
        ${S.training ? `<div class="card ${S.trainingNeeded ? 'warn-card' : ''}"><h3>🧠 Help train Nexus models ${S.training.on ? '<span class="pill">SHARING</span>' : ''}</h3>
          <p class="muted">${S.trainingNeeded ? '<b>Your beta features are paused.</b> Beta testers share their chats to help train Nexus models. Turn this on to get them back.' : 'Your questions and Nexus’s answers help train future Nexus models. Beta testers share as part of getting features early; anyone can join.'}</p>
          <p class="fine">Shared: your question, the answer, the agent and model, and any 👍 / 👎 or better answer. Removed first: emails, phone numbers, keys, passwords, card-like numbers. Never: incognito chats, pictures. Only Apoji Team members given access can see it.</p>
          <div class="row">${S.training.on ? '<button class="btn sm" id="sTrOff">Stop sharing</button>' : '<button class="btn primary sm" id="sTrOn">I agree, share my chats</button>'}<button class="btn sm danger" id="sTrDel">Delete everything I shared${S.training.examples ? ` (${S.training.examples})` : ''}</button></div></div>` : ''}
        ${S.tester || S.channel === 'admin' ? '<div class="card"><h3>🧪 Needs testing</h3><div id="sTests" class="muted">Loading…</div></div>' : ''}
        <div class="card"><h3>Sign out</h3><div class="row"><button class="btn sm" id="sOut">Sign out</button><span class="fine">Your own keys stay in this browser until you remove them.</span></div></div>`,
      models: () => `<div class="card"><h3>🔑 Answer with</h3><p class="muted">The free Nexus key works right away. Add your own key for unlimited answers and stronger models. <b>Your key stays in this browser</b> (it's never saved to your account${''}; DeepSeek keys pass through Nexus's server because DeepSeek blocks browsers, and are never stored).</p>
          ${Object.entries(PROVIDERS).map(([id, p]) => `<div class="prov ${r.provider === id ? 'on' : ''}"><label class="choice"><input type="radio" name="prov" value="${id}" ${r.provider === id ? 'checked' : ''}> ${esc(p.label)}${id === 'free' ? ' <span class="pill">DEFAULT</span>' : ks[id]?.key ? ' <span class="pill">KEY SAVED</span>' : ''}</label>
            ${id === 'free' ? `<span class="fine">${esc(p.note)} Flash unlimited (200 answers a day), Lyte 95 and Neodela 28 free chats.</span>` : `<div class="row"><input type="password" data-key="${id}" placeholder="${esc(p.hint)} paste your key" value="${esc(ks[id]?.key || '')}" style="flex:2;min-width:180px"><input data-model="${id}" placeholder="${esc(p.model)}" value="${esc(ks[id]?.model || '')}" style="flex:1;min-width:120px" title="Model"></div><span class="fine"><a href="${p.url}" target="_blank" rel="noopener">Get a ${esc(p.label)} key</a> · leave the model empty for ${esc(p.model)}</span>`}</div>`).join('')}
          <div class="row"><button class="btn primary sm" id="sKeys">Save</button><button class="btn sm" id="sTest">Test it</button><span class="fine" id="sKeyNote"></span></div></div>`,
      look: () => { const cur = store.get('accent', ACCENTS[0])[0], custom = !ACCENTS.some(a => a[0] === cur);
        return `<div class="card"><h3>🎨 Accent color</h3><div class="swatches">${ACCENTS.map(a => `<button data-accent="${a[0]}" style="background:${a[0]}" class="${cur === a[0] ? 'on' : ''}" aria-label="${a[0]}"></button>`).join('')}
          <label class="swatch-custom ${custom ? 'on' : ''}" title="Pick any color" style="${custom ? `background:${cur}` : ''}">${custom ? '' : '＋'}<input type="color" id="sAccent" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#3dffa0'}"></label></div>
          <div class="row"><span class="fine">Custom:</span><input id="sAccentHex" value="${esc(cur)}" maxlength="7" style="width:110px;font-family:var(--mono)" spellcheck="false"><button class="btn sm" id="sAccentSet">Use</button></div></div>
        <div class="card"><h3>🌐 Web search</h3><label class="toggle"><input type="checkbox" id="sWeb" ${S.web ? 'checked' : ''}> Search the web for every message (you can also turn it on per message with 🌐)</label></div>
        <div class="card"><h3>🎓 Tutorial</h3><div class="row"><button class="btn sm" id="sTour">Show the tutorial again</button></div></div>`; },
      usage: () => (u?.unlimited ? '' : `<div class="card"><h3>📊 Free key usage</h3>${u ? `<p>Today: <b>${u.today}</b> of ${u.daily} free answers (resets at midnight UTC).</p><p>Lyte: <b>${u.lyte}</b> of ${u.lyte_limit} free chats · Neodela: <b>${u.neodela}</b> of ${u.neodela_limit} · Flash: unlimited</p><p class="fine">Lyte and Neodela allowances are shared with the desktop app (Mac or PC) if you also use it. With your own key, nothing is counted.</p>` : '<p class="muted">Loading…</p>'}</div>`) + spendCard(),
      about: () => `<div class="card"><h3>What Test Run has, and what the desktop app adds</h3><table class="cmp"><tr><th></th><th>Test Run</th><th>Mac &amp; PC app</th></tr>
          ${[['Flash, Lyte, Neodela', 1, 1], ['@features (Seek, Cognition, Magyk, StudyMode…)', 1, 1], ['Web search with sources', 1, 1], ['Quizzes, flashcards, checklists, charts', 1, 1], ['Saved chats', 1, 1], ['Your own keys', 1, 1], ['Paragon (the agent that acts)', 0, 1], ['Uses your computer: apps, files, calendar, reminders', 0, 1], ['Missions, Routines, Morning Brief', 0, 1], ['Study decks, spaced repetition, Shared Spaces', 0, 1], ['Voice orb, "Hey Nexus", screen help', 0, 1], ['N28C phone app', 0, 1], ['Huddles, debates, Write mode', 0, 1], ['Points, orb skins, Wrapped', 0, 1]].map(([t, a, b]) => `<tr><td>${t}</td><td>${a ? '✓' : '—'}</td><td>${b ? '✓' : ''}</td></tr>`).join('')}</table>
          <p class="fine">Have a Mac or a Windows PC? <a href="https://github.com/apojidelegraphics/Nexus-28/releases/latest" target="_blank" rel="noopener">Download Nexus '28</a> and sign in with this same account.</p></div>
        <div class="card"><h3>Help</h3><p class="fine">Something wrong? <a href="https://github.com/apojidelegraphics/Nexus-28/issues" target="_blank" rel="noopener">Report a bug</a> · <a href="../status/" target="_blank">Status page</a> · <a href="../terms/" target="_blank">Terms &amp; Conditions</a></p></div>`
    };
    $('setBody').innerHTML = body[setTab]();
    if (setTab === 'account') paintTests();
  }
  $('setTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { setTab = b.dataset.t; paintSettings(); } };
  $('settings').onclick = async e => {
    if (e.target.closest('[data-close]') || e.target === $('settings')) { $('settings').hidden = true; return; }
    const b = e.target.closest('button'); const id = b?.id;
    if (b?.dataset.accent) { store.set('accent', ACCENTS.find(a => a[0] === b.dataset.accent)); applyLook(); return paintSettings(); }
    if (id === 'sAccentSet') { const h = $('sAccentHex').value.trim(); if (!setAccent(h)) return toast('Use a color like #3dffa0'); return paintSettings(); }
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
    if (id === 'sSpendReset') { store.set('spend', {}); paintSettings(); return toast('Reset'); }
    if (id === 'sWipe') { if (!confirm('Delete every Test Run chat in your account? This can’t be undone.')) return; await sb.from('try_chats').delete().eq('user_id', S.user.id); store.set('localChats', []); S.chats = []; newChat(); return toast('Deleted'); }
    if (id === 'sOut') return signOut();
    if (id === 'sTrOn' || id === 'sTrOff') { const { error } = await sb.rpc('training_set_consent', { p_on: id === 'sTrOn' }); if (error) return toast(error.message, 5000); await loadFlags(); paintSettings(); return toast(id === 'sTrOn' ? '✓ Thanks! Beta features are on.' : 'Stopped sharing'); }
    if (id === 'sTrDel') { if (!confirm('Delete every chat example you shared for training? This can’t be undone.')) return; const { data, error } = await sb.rpc('training_delete_mine'); if (error) return toast(error.message); await loadFlags(); paintSettings(); return toast(`Deleted ${data?.deleted || 0}`); }
    if (b?.dataset.tst) { const tid = +b.closest('[data-test]').dataset.test, st = b.dataset.tst; let note = ''; if (st === 'fail') { note = prompt('What happened?') ?? ''; } const { error } = await sb.from('test_results').upsert({ item_id: tid, user_id: S.user.id, status: st, platform: 'web', note, updated_at: new Date().toISOString() }); if (error) return toast(error.message); return paintTests(); }
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
  $('settings').oninput = e => { if (e.target.id === 'sAccent') { setAccent(e.target.value); const sw = e.target.closest('.swatch-custom'); if (sw) { sw.style.background = e.target.value; sw.firstChild.nodeType === 3 && (sw.firstChild.textContent = ''); } document.querySelectorAll('[data-accent]').forEach(x => x.classList.remove('on')); sw?.classList.add('on'); if ($('sAccentHex')) $('sAccentHex').value = store.get('accent')[0]; } };
  $('settings').onchange = async e => {
    if (e.target.id === 'sPicF' && e.target.files[0]) { try { toast('Uploading…'); await uploadPic(e.target.files[0]); paintMe(); paintSettings(); toast('✓ Picture updated'); } catch (er) { toast(er.message || 'That picture couldn’t be uploaded.', 4000); } return; } if (e.target.id === 'sWeb') { S.web = e.target.checked; store.set('web', S.web); paintFeats(); } if (e.target.name === 'prov') document.querySelectorAll('.prov').forEach(p => p.classList.toggle('on', p.contains(e.target))); };

  // ---------- the tutorial: a guided tour of everything, with a spotlight on each part
  const TOUR = [
    { t: '👋 Welcome to Nexus Test Run', html: `<p>This is Nexus '28 in your browser, for when you can't install the app (or you're on a Chromebook or a school computer). It's a smaller version of the Mac and PC app, but it's still a great study and work partner.</p><p>This quick tour shows you everything. It takes about a minute, and you can see it again any time from <b>?</b>.</p>` },
    { el: '#agentPick', t: '🤖 Meet the crew', html: `<ul><li><b>Flash</b> (default): fast, clear answers. Unlimited on the free key.</li><li><b>Lyte</b>: balanced everyday help, explanations and writing. 95 free chats.</li><li><b>Neodela</b>: deep thinking, studying and code. 28 free chats.</li></ul><p>Click one to switch. You can also type <kbd>@lyte</kbd> in a message to ask someone else just once.</p>` },
    { el: '.box', t: '💬 Ask anything', html: `<p>Type here and press <kbd>Enter</kbd> to send (<kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line). While it's answering, the button turns into <b>■ Stop</b>.</p><p>Not sure where to start? The cards on the start screen are good first questions.</p>` },
    { el: '.box', t: '✨ @features: superpowers', html: `<p>Type <kbd>@</kbd> to see what your agent can do. Some favorites:</p><ul><li><b>@Seek</b>: researches the web and cites sources</li><li><b>@StudyMode</b>: teaches, then quizzes you</li><li><b>@Magyk</b>: makes flip flashcards</li><li><b>@Cognition</b>: thinks step by step first</li><li><b>@Homework</b>: hints first, then the answer</li><li><b>@Cite</b>: MLA, APA or Chicago citations</li></ul><p>Each agent has its own set. Neodela has the most.</p>` },
    { el: '#webBtn', t: '🌐 Web search', html: `<p>Turn this on to have Nexus search the web for your next message and show its sources as links under the answer. Great for news, facts and anything recent.</p><p>Or use <b>@Seek</b>, which does it too. You get 60 searches a day.</p>` },
    { el: '#feed', t: '🃏 Interactive answers', html: `<p>Some answers come alive: quizzes you can take, flashcards you flip, checklists you tick, charts and idea boards. Your progress is saved with the chat.</p><p>Under every answer: <b>Copy</b>, <b>🔊 Read</b> (reads it aloud) and <b>↻ Redo</b> for a new answer. Click <b>✎ Edit</b> on your own message to change it and ask again.</p>` },
    { el: '#side', t: '🗂 Your chats are saved', html: `<p>Every chat is saved to your account, so you can pick it up on any computer. Search them, and use <b>⋯</b> to rename, pin, export or delete one.</p><p><b>@Echo</b> lets an agent read your past chats to remember what you talked about.</p>`, side: true },
    { el: '#usageBox', t: '📊 Free limits', html: `<p>The free Nexus key gives you <b>200 answers a day</b>. Flash is unlimited within that; Lyte and Neodela have a set number of free chats. Your count shows here.</p>`, side: true },
    { el: '#setBtn', t: '🔑 Your own key (optional)', html: `<p>Have a ChatGPT, Claude, Gemini, OpenRouter or DeepSeek key? Add it in <b>Settings → Models & keys</b> for unlimited answers and stronger models.</p><p>Your key is kept only in this browser, never in your account.</p>` },
    { t: '🎓 Use it to learn', html: `<p>Nexus is best as a tutor: ask it to explain, quiz you, or check your work. For graded work, use <b>@Homework</b> so you learn the steps, not just the answer.</p><p>AI can make mistakes. Double-check important facts (that's what @Seek's sources are for).</p>` },
    { el: '#helpBtn', t: '✅ You’re ready', html: `<p>That's it! Press <b>?</b> any time for this tour, and <b>⚙︎</b> for settings. Want the full experience with Paragon, computer actions, missions and the phone app? It's in the app for Mac and Windows PC.</p><p>Try your first question now. 🚀</p>`, last: true }
  ];
  let tourI = 0;
  function tour(i = 0) {
    tourI = i; $('tour').hidden = false;
    let st = TOUR[i];
    if (st.el === '#usageBox' && S.usage?.unlimited) { st = { ...st, t: '♾ No limits', html: '<p>You’re on the Apoji Team, so Test Run has <b>no daily limits</b> for you.</p>', el: '#newChat' }; }
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
  $('incBtn').onclick = () => { betaEvent('incognito'); newChat(true, { incognito: true }); toast('🕶 Incognito chat: not saved, doesn’t use your past chats.', 3000); };
  $('chatSearch').oninput = e => { S.search = e.target.value; paintChats(); };
  $('chatList').onclick = e => { const m = e.target.closest('[data-more]'); if (m) { e.stopPropagation(); return chatMenu(m.dataset.more, m); } const o = e.target.closest('[data-open]'); if (o) openChat(o.dataset.open); };
  $('chatList').onkeydown = e => { if (e.key === 'Enter') { const o = e.target.closest('[data-open]'); if (o) openChat(o.dataset.open); } };
  $('agentPick').onclick = e => { const b = e.target.closest('[data-agent]'); if (b) { setAgent(b.dataset.agent); if (S.chat && !S.chat.messages.length) S.chat.agent = b.dataset.agent; } };
  $('setBtn').onclick = () => openSettings();
  $('helpBtn').onclick = () => tour(0);
  $('webBtn').onclick = () => { if (webDown()) return toast('🛠 ' + (webDown().message || 'Web search is down for maintenance. Back soon.'), 4000); S.web = !S.web; store.set('web', S.web); paintFeats(); toast(S.web ? '🌐 Web search on' : 'Web search off', 1400); };
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
    if (b.dataset.branch != null) return branchAt(+b.dataset.branch);
    if (b.dataset.rate != null) return trainRate(+b.dataset.rate, +b.dataset.v);
    if (b.dataset.better != null) return trainCorrect(+b.dataset.better);
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
    sb.rpc('app_owner_ids').then(({ data }) => { S.owner = Array.isArray(data) && data.includes(S.user.id); paintMe(); if (S.owner && S.channel !== 'admin') { S.channel = 'admin'; $('incBtn').hidden = !betaOn('incognito'); } }, () => {});
    S.me.name = store.get('name:' + S.user.id, '') || prof?.nickname || pend || S.user.user_metadata?.nickname || prof?.username || '';
    if (pend) { store.set('pendingName', ''); store.set('name:' + S.user.id, pend); sb.from('profiles').update({ nickname: pend }).eq('id', S.user.id).then(() => {}, () => {}); }
    sb.rpc('log_activity', { p_source: 'web', p_version: 'try-3.7.0' }).then(() => {}, () => {});
    // agent prompts + @features from Supabase (same as the apps)
    sb.from('assistant_prompts').select('name,prompt,features').in('name', Object.values(AGENTS).map(a => a.db)).then(({ data }) => {
      for (const r of data || []) { const a = Object.values(AGENTS).find(x => x.db === r.name); if (!a) continue; S.prompts[a.id] = { prompt: r.prompt }; const f = K.features.canonical(r.features || []); if (f.length) a.features = f; }
      setAgent(S.agent, false);
    });
    setAgent(S.agent, false); orbs(); paintFeats(); paintMe();
    loadMaint(); setInterval(loadMaint, 60e3); loadFlags();
    const ping = () => sb.rpc('presence_ping', { p_surface: 'test_run', p_version: 'try-3.10.0' }).then(() => {}, () => {}); ping(); setInterval(ping, 120e3);   // 3.8: "active on" in Apoji Admin
    if (S.user.user_metadata?.must_change_password) setTimeout(mustChangePassword, 800);
    await loadChats(); loadUsage();
    const open = store.get('open', null);
    if (open && S.chats.some(c => c.id === open)) await openChat(open); else newChat();
    if (!store.get('toured:' + S.user.id, false)) setTimeout(() => tour(0), 500);
  }
  // 3.8: signed in with a temporary password from the Apoji Team → pick your own before anything else
  function mustChangePassword() {
    const d = document.createElement('div'); d.className = 'modal'; d.innerHTML = `<div class="sheet"><header><b>🔑 Pick a new password</b></header><div class="set-body"><p class="muted">You signed in with a temporary password from the Apoji Team. Choose your own now.</p>
      <input id="mpw1" type="password" placeholder="New password (8+ characters)" autocomplete="new-password" style="width:100%"><input id="mpw2" type="password" placeholder="Repeat it" autocomplete="new-password" style="width:100%;margin-top:8px"><p class="fine" id="mpwN"></p><div class="row"><span class="sp"></span><button class="btn primary" id="mpwGo">Save</button></div></div></div>`;
    document.body.appendChild(d);
    d.querySelector('#mpwGo').onclick = async () => {
      const a = d.querySelector('#mpw1').value, b = d.querySelector('#mpw2').value, n = d.querySelector('#mpwN');
      if (a.length < 8) return n.textContent = 'Use at least 8 characters.'; if (a !== b) return n.textContent = "Those don't match.";
      const { error } = await sb.auth.updateUser({ password: a, data: { must_change_password: false } });
      if (error) return n.textContent = error.message; d.remove(); toast('✓ New password saved');
    };
  }
  function showAuth() { $('auth').hidden = false; $('main').hidden = true; orbs(); }

  applyLook();
  sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' && session && !S.user) enter(session); if (ev === 'SIGNED_OUT') { S.user = null; showAuth(); } });
  sb.auth.getSession().then(({ data }) => data.session ? enter(data.session) : showAuth());
})();
