// 4.3.0 the chat inside an "Ask Nexus" box (docs/embed/chat.html?bot=…&site=…). No sign-in; embed-chat answers.
(function () {
  var SB = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co', KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';
  var qs = new URLSearchParams(location.search), bot = qs.get('bot') || '', site = qs.get('site') || document.referrer || '';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var md = function (t) { return window.NexusMarkdown ? window.NexusMarkdown.render(t) : esc(t); };
  var KEYS = 'ask-nexus:' + bot, msgs = [], busy = false, cfg = {};
  try { msgs = JSON.parse(sessionStorage.getItem(KEYS) || '[]'); } catch (e) {}
  function save() { try { sessionStorage.setItem(KEYS, JSON.stringify(msgs.slice(-30))); } catch (e) {} }
  function paint() {
    $('m').innerHTML = (cfg.greeting && !msgs.length ? '<div class="b a">' + md(cfg.greeting) + '</div>' : '') + msgs.map(function (m) { return '<div class="b ' + (m.role === 'user' ? 'u' : 'a') + (m.error ? ' e' : '') + '">' + (m.role === 'user' ? esc(m.content) : m.content ? md(m.content) : '<span class="dots"><i></i><i></i><i></i></span>') + '</div>'; }).join('');
    $('m').scrollTop = $('m').scrollHeight;
  }
  if (!/^[a-z0-9]{10,16}$/.test(bot)) { $('m').innerHTML = '<div class="b a e">This chat isn’t set up right (the bot id is missing).</div>'; return; }
  fetch(SB + '/rest/v1/rpc/embed_bot_public', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: bot }) }).then(function (r) { return r.json(); }).then(function (c) {
    if (!c || !c.ok) { $('m').innerHTML = '<div class="b a e">This chat is switched off.</div>'; $('go').disabled = true; return; }
    cfg = c; $('nm').textContent = c.name; document.title = c.name; document.documentElement.style.setProperty('--c', c.color || '#3dffa0'); paint();
  }).catch(function () { paint(); });
  async function send(text) {
    if (busy || !text.trim()) return; busy = true; $('go').disabled = true;
    msgs.push({ role: 'user', content: text.trim() }); var a = { role: 'assistant', content: '' }; msgs.push(a); paint();
    try {
      var res = await fetch(SB + '/functions/v1/embed-chat', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ bot: bot, site: site, messages: msgs.filter(function (m) { return m !== a && !m.error; }).map(function (m) { return { role: m.role, content: m.content }; }) }) });
      if (!res.ok || (res.headers.get('content-type') || '').indexOf('event-stream') < 0) { var j = await res.json().catch(function () { return {}; }); throw new Error(j.message || 'Couldn’t answer (' + res.status + ').'); }
      var rd = res.body.getReader(), dec = new TextDecoder(), buf = '';
      for (;;) { var r = await rd.read(); if (r.done) break; buf += dec.decode(r.value, { stream: true }); var lines = buf.split('\n'); buf = lines.pop();
        for (var i = 0; i < lines.length; i++) { var l = lines[i].trim(); if (!l.startsWith('data:')) continue; var d = l.slice(5).trim(); if (d === '[DONE]') continue; try { var x = JSON.parse(d).choices[0].delta.content; if (x) { a.content += x; paint(); } } catch (e) {} } }
      if (!a.content) a.content = '(no answer)';
    } catch (e) { a.content = e.message; a.error = true; }
    busy = false; $('go').disabled = false; save(); paint(); $('q').focus();
  }
  $('f').onsubmit = function (e) { e.preventDefault(); var t = $('q').value; $('q').value = ''; send(t); };
  $('q').onkeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('f').requestSubmit(); } };
  $('clr').onclick = function () { msgs = []; save(); paint(); };
  paint();
})();
