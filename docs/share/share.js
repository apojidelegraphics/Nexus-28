// 4.2.0 A chat someone shared as a link (read-only). Reads it with share_chat_get (works without signing in).
(function () {
  const SB = 'https://yzbnxpkuhlxsuwzbjifx.supabase.co', KEY = 'sb_publishable_LY-EZORCvEQqW6AeQC5a8w_Z7wmeyjn';
  const $ = id => document.getElementById(id), MD = window.NexusMarkdown;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const AG = { flash: ['Flash', '#ffd36b'], lyte: ['Lyte', '#7dffb2'], neodela: ['Neodela', '#b18cff'], paragon: ['Paragon', '#5ce1ff'], axiom: ['Axiom', '#ff5a6e'] };
  const FROM = { mac: 'Nexus ’28 for Mac', windows: 'Nexus ’28 for Windows', phone: 'N28C', test_run: 'Nexus ’28 Test Run' };
  const id = new URLSearchParams(location.search).get('c') || '';
  const fail = t => { $('shBody').innerHTML = `<div class="sh-empty"><h1>This chat isn’t available</h1><p>${esc(t)}</p><p><a class="btn primary" href="../try/">Try Nexus ’28</a></p></div>`; document.title = "Nexus '28"; };
  if (!/^[A-Za-z0-9]{10,16}$/.test(id)) return fail('The link looks incomplete. Ask whoever sent it for the whole link.');
  fetch(`${SB}/rest/v1/rpc/share_chat_get`, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id }) })
    .then(r => r.json()).then(d => {
      if (!d || !d.ok) return fail(d?.error || 'This link was stopped or never existed.');
      document.title = (d.title || 'A chat') + " · Nexus '28";
      const who = k => { const a = AG[String(k || '').toLowerCase().replace(/^new:/, '')] || [String(k || 'Nexus').replace(/^new:/, '') || 'Nexus', '#3dffa0']; return a; };
      const msgs = d.messages || [];
      $('shBody').innerHTML = `<div class="sh-head"><h1>${esc(d.title || 'A chat')}</h1>
          <div class="sh-meta">Shared from <b>${esc(FROM[d.source] || "Nexus ’28")}</b>${d.by ? ` by <b>@${esc(d.by)}</b>` : ''} · ${new Date(d.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} · ${msgs.length} message${msgs.length === 1 ? '' : 's'}</div></div>
        <div class="sh-note">A read-only copy of a chat with Nexus. Answers can be wrong; check important facts.</div>
        <div id="shMsgs">${msgs.map((m, i) => m.role === 'user' ? `<div class="msg user" data-i="${i}"><div class="body">${esc(m.content)}</div></div>`
          : (() => { const [n, c] = who(m.agent || d.agent); return `<div class="msg ai" data-i="${i}"><div class="who"><i style="background:${esc(c)}"></i>${esc(n.toUpperCase())}</div><div class="body">${MD ? MD.render(m.content) : esc(m.content)}</div></div>`; })()).join('')}</div>`;
      msgs.forEach((m, i) => { if (m.role !== 'assistant') return; const b = document.querySelector(`[data-i="${i}"] .body`); if (b) try { window.NexusWidgets?.enhance(b, m, { live: false, convId: 'shared', readOnly: true, api: { conv: { patchWidget() {} } } }); } catch {} });
      $('shFork').href = '../try/?fork=' + encodeURIComponent(id);
      $('shCta').hidden = false;
    }).catch(() => fail('Couldn’t reach Nexus. Check your connection and try again.'));
})();
