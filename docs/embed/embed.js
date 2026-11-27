// Nexus '28 "Ask Nexus" for your site (4.3.0). Make one in Nexus → Settings → Developers, then paste:
//   <script src="https://apojidelegraphics.github.io/Nexus-28/embed/embed.js" data-bot="YOUR_ID" data-mode="button" async></script>
//   or a box:  <div id="ask-nexus"></div> + the same script with data-mode="box" data-target="#ask-nexus"
// It only adds a frame (the chat runs on Nexus's page), so it can't read or change anything else on your site.
(function () {
  var s = document.currentScript || [].slice.call(document.querySelectorAll('script[data-bot]')).pop(); if (!s) return;
  var bot = s.getAttribute('data-bot'), mode = s.getAttribute('data-mode') || 'button', base = s.src.replace(/embed\.js(\?.*)?$/, '');
  if (!/^[a-z0-9]{10,16}$/.test(bot || '')) return console.warn('Ask Nexus: data-bot is missing or wrong');
  var src = base + 'chat.html?bot=' + bot + '&site=' + encodeURIComponent(location.href);
  function frame(style) { var f = document.createElement('iframe'); f.src = src; f.title = 'Ask Nexus'; f.allow = 'clipboard-write'; f.setAttribute('style', 'border:0;background:transparent;' + style); return f; }
  if (mode === 'box') {
    var t = document.querySelector(s.getAttribute('data-target') || '') || (function () { var d = document.createElement('div'); s.parentNode.insertBefore(d, s); return d; })();
    t.appendChild(frame('width:100%;height:' + (s.getAttribute('data-height') || '480') + 'px;border-radius:14px;'));
    return;
  }
  // the floating button (its color comes from your settings)
  var color = '#3dffa0';
  var btn = document.createElement('button'); btn.type = 'button'; btn.setAttribute('aria-label', 'Ask Nexus');
  btn.setAttribute('style', 'position:fixed;right:20px;bottom:20px;z-index:2147483000;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35);display:grid;place-items:center;transition:transform .15s;background:' + color);
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#04100b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var panel = null, open = false;
  btn.onclick = function () {
    open = !open;
    if (!panel) { panel = frame('position:fixed;right:20px;bottom:88px;z-index:2147483000;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 120px));border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.45);'); document.body.appendChild(panel); }
    panel.style.display = open ? 'block' : 'none'; btn.style.transform = open ? 'rotate(8deg) scale(.95)' : '';
  };
  document.body.appendChild(btn);
  fetch('https://yzbnxpkuhlxsuwzbjifx.supabase.co/rest/v1/rpc/embed_bot_public', { method: 'POST', headers: { apikey: 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: bot }) })
    .then(function (r) { return r.json(); }).then(function (c) { if (c && c.color) btn.style.background = c.color; if (c && c.name) btn.setAttribute('aria-label', c.name); if (!c) btn.remove(); }).catch(function () {});
})();
