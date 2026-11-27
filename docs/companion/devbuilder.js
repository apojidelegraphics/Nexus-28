/* Generated from the Nexus '28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */
// 4.3.0 Developers: make an "Ask Nexus" box or a floating chat button for your own website (shared by the Mac/Windows
// app and Test Run; copied by `npm run sync:companion`). Pick the agent, what it can do (search the web), your rules
// (like "don't give the answer directly") and what it's helping with; Nexus writes the code to paste into your page.
//   NexusDev.render(el, { list(), save(bot), remove(id), toast })   (list/save/remove talk to public.embed_bots)
(function (root) {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BASE = 'https://apojidelegraphics.github.io/Nexus-28/embed/';
  const AGENTS = [['flash', 'Flash · fast and clear'], ['lyte', 'Lyte · balanced, good at explaining'], ['neodela', 'Neodela · deep thinking']];
  const PRESETS = [
    ['hints', 'Don’t give answers directly', 'Never give the final answer to homework or test questions directly. Give hints and guiding questions, and check the student’s work.'],
    ['topic', 'Only talk about my topic', 'Only answer questions about the topic in the information you were given. Politely say you can only help with that for anything else.'],
    ['short', 'Keep answers short', 'Keep every answer under 120 words unless asked for more.'],
    ['kids', 'Kid friendly', 'Use simple words and a friendly tone suitable for kids aged 8 to 13. Avoid mature topics.'],
    ['cite', 'Say where things come from', 'When you use the information or a web result, say which part it came from.']
  ];
  const newId = () => Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  // the code to paste: a floating button, or a box where you put a <div>
  function snippet(bot, mode = 'button') {
    return mode === 'box'
      ? `<div id="ask-nexus"></div>\n<script src="${BASE}embed.js" data-bot="${bot.id}" data-mode="box" data-target="#ask-nexus" async></script>`
      : `<script src="${BASE}embed.js" data-bot="${bot.id}" data-mode="button" async></script>`;
  }
  const rulesOf = bot => PRESETS.filter(([k]) => (bot.presets || []).includes(k)).map(p => '- ' + p[2]).concat((bot.custom || '').trim() ? ['- ' + bot.custom.trim()] : []).join('\n');
  // presets come back from the saved rules text
  const fromRules = rules => { const lines = String(rules || '').split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean); return { presets: PRESETS.filter(p => lines.includes(p[2])).map(p => p[0]), custom: lines.filter(l => !PRESETS.some(p => p[2] === l)).join('\n') }; };

  function render(el, o) {
    const toast = o.toast || (() => {});
    let bots = [], cur = null, mode = 'button';
    const paint = () => {
      if (!cur) {
        el.innerHTML = `<div class="ndv"><p class="ndv-muted">Put Nexus on your own website: a chat box, or a button in the corner that opens one. Visitors don’t need an account. It answers with the free Nexus key, up to your daily limit.</p>
          ${bots.map(b => `<div class="ndv-bot"><i style="background:${esc(b.color)}"></i><div style="flex:1"><b>${esc(b.name)}</b><small>${esc(b.agent)}${b.web ? ' · web search' : ''}${b.origins?.length ? ' · ' + esc(b.origins.join(', ')) : ' · any site'}${b.active ? '' : ' · off'}</small></div><button data-edit="${esc(b.id)}">Edit</button></div>`).join('') || '<p class="ndv-muted">You haven’t made one yet.</p>'}
          <button class="ndv-pri" data-new>＋ New chat for my site</button></div>`;
        return;
      }
      const b = cur, r = fromRules(b.rules);
      el.innerHTML = `<div class="ndv">
        <div class="ndv-grid">
          <label>Name</label><input data-f="name" maxlength="40" value="${esc(b.name)}" placeholder="Ask Nexus">
          <label>Agent</label><select data-f="agent">${AGENTS.map(([k, l]) => `<option value="${k}" ${b.agent === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <label>It can</label><label class="ndv-chk"><input type="checkbox" data-f="web" ${b.web ? 'checked' : ''}> Search the web</label>
          <label>Rules</label><div>${PRESETS.map(([k, l]) => `<label class="ndv-chk"><input type="checkbox" data-preset="${k}" ${r.presets.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}<textarea data-f="custom" rows="2" maxlength="800" placeholder="Your own rules, like: Always answer in Spanish.">${esc(r.custom)}</textarea></div>
          <label>What it’s helping with</label><textarea data-f="knowledge" rows="6" maxlength="20000" placeholder="Paste anything it should know: your class syllabus, a product FAQ, your club's schedule…">${esc(b.knowledge || '')}</textarea>
          <label>Greeting</label><input data-f="greeting" maxlength="200" value="${esc(b.greeting || '')}">
          <label>Color</label><div class="ndv-row"><input type="color" data-f="color" value="${esc(b.color)}"><span class="ndv-muted">${esc(b.color)}</span></div>
          <label>Only on these sites</label><input data-f="origins" value="${esc((b.origins || []).join(', '))}" placeholder="myclub.com, mysite.github.io (empty = any site)">
          <label>Answers a day</label><input type="number" data-f="daily_limit" min="1" max="2000" value="${b.daily_limit || 200}">
          <label>On</label><label class="ndv-chk"><input type="checkbox" data-f="active" ${b.active !== false ? 'checked' : ''}> Answering</label>
        </div>
        <div class="ndv-row"><button class="ndv-pri" data-save>${b.saved ? 'Save' : 'Make it'}</button><button data-back>Back</button><span style="flex:1"></span>${b.saved ? '<button class="ndv-dan" data-del>Delete</button>' : ''}</div>
        ${b.saved ? `<h4>Paste this into your page</h4><div class="ndv-seg"><button class="${mode === 'button' ? 'on' : ''}" data-mode="button">Floating button</button><button class="${mode === 'box' ? 'on' : ''}" data-mode="box">Chat box</button></div>
          <textarea class="ndv-code" readonly rows="${mode === 'box' ? 3 : 2}">${esc(snippet(b, mode))}</textarea><div class="ndv-row"><button data-copy>Copy the code</button><a href="${BASE}chat.html?bot=${esc(b.id)}" target="_blank" rel="noopener">Open it on its own</a></div>
          <h4>Try it</h4><iframe class="ndv-prev" src="${BASE}chat.html?bot=${esc(b.id)}&preview=1" title="Preview"></iframe>` : '<p class="ndv-muted">Make it to get the code and a preview.</p>'}</div>`;
    };
    const read = () => {
      const g = k => el.querySelector(`[data-f="${k}"]`);
      const presets = [...el.querySelectorAll('[data-preset]:checked')].map(x => x.dataset.preset);
      const bot = { ...cur, name: g('name').value.trim() || 'Ask Nexus', agent: g('agent').value, web: g('web').checked, greeting: g('greeting').value.trim() || 'Hi! What can I help with?', color: /^#[0-9a-f]{6}$/i.test(g('color').value) ? g('color').value : '#3dffa0',
        knowledge: g('knowledge').value.slice(0, 20000), origins: g('origins').value.split(/[\s,]+/).map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean).slice(0, 20),
        daily_limit: Math.max(1, Math.min(2000, Math.round(+g('daily_limit').value || 200))), active: g('active').checked };
      bot.rules = rulesOf({ presets, custom: g('custom').value }).slice(0, 2000);
      return bot;
    };
    el.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t || !el.contains(t)) return;
      if (t.dataset.new !== undefined) { cur = { id: newId(), name: 'Ask Nexus', agent: 'flash', web: false, rules: '', knowledge: '', greeting: 'Hi! What can I help with?', color: '#3dffa0', origins: [], daily_limit: 200, active: true }; return paint(); }
      if (t.dataset.edit) { cur = { ...bots.find(b => b.id === t.dataset.edit), saved: true }; return paint(); }
      if (t.dataset.back !== undefined) { cur = null; return paint(); }
      if (t.dataset.mode) { mode = t.dataset.mode; return paint(); }
      if (t.dataset.copy !== undefined) { try { await navigator.clipboard.writeText(el.querySelector('.ndv-code').value); toast('Code copied'); } catch { el.querySelector('.ndv-code').select(); } return; }
      if (t.dataset.save !== undefined) {
        const bot = read(); const { saved, presets, custom, ...row } = bot;
        try { await o.save(row); cur = { ...row, saved: true }; bots = await o.list(); toast('Saved'); paint(); }
        catch (er) { toast(/embed_bots|42P01|PGRST20/.test(er.message) ? 'Developers isn’t switched on yet (the Apoji Team has to finish setting it up).' : er.message); }
        return;
      }
      if (t.dataset.del !== undefined) { if (!confirm('Delete this chat? It stops working on your site.')) return; await o.remove(cur.id).catch(er => toast(er.message)); cur = null; bots = await o.list().catch(() => []); paint(); }
    });
    el.addEventListener('input', e => { if (e.target.dataset.f === 'color') e.target.nextElementSibling.textContent = e.target.value; });
    o.list().then(l => { bots = l || []; paint(); }, er => { el.innerHTML = `<p class="ndv-muted">${esc(/embed_bots|42P01|PGRST20/.test(er.message) ? 'Developers isn’t switched on yet (the Apoji Team has to finish setting it up).' : er.message)}</p>`; });
    el.innerHTML = '<p class="ndv-muted">Loading…</p>';
  }
  const CSS = `.ndv{display:grid;gap:10px}.ndv-muted{color:var(--muted,#7aa894);font-size:13px;margin:0}.ndv h4{margin:8px 0 0;font-size:13px}
.ndv-grid{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 12px;align-items:start}.ndv-grid>label{color:var(--muted,#7aa894);font-size:13px;padding-top:6px}
.ndv input:not([type=checkbox]):not([type=color]),.ndv select,.ndv textarea{width:100%;box-sizing:border-box;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:inherit;padding:7px 9px;font:inherit;font-size:13px}
.ndv-chk{display:flex!important;gap:6px;align-items:center;font-size:13px;color:inherit!important;padding:2px 0!important}.ndv-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ndv button{border:1px solid rgba(var(--accent-rgb,61,255,160),.35);background:rgba(var(--accent-rgb,61,255,160),.07);color:inherit;border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.ndv .ndv-pri{background:var(--accent,#3dffa0);color:#032313;border-color:transparent;font-weight:600}.ndv .ndv-dan{border-color:rgba(255,90,110,.5);color:#ff6b7d;background:none}
.ndv-bot{display:flex;gap:10px;align-items:center;padding:8px 10px;border:1px solid rgba(255,255,255,.1);border-radius:10px}.ndv-bot i{width:12px;height:12px;border-radius:50%}.ndv-bot small{display:block;color:var(--muted,#7aa894)}
.ndv-code{font:12px ui-monospace,Menlo,monospace!important}.ndv-seg{display:flex;gap:4px}.ndv-seg button.on{background:var(--accent,#3dffa0);color:#032313}
.ndv-prev{width:100%;height:420px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#04100b}
@media (max-width:640px){.ndv-grid{grid-template-columns:1fr}.ndv-grid>label{padding-top:0}}`;
  function ensureCss() { if (typeof document === 'undefined' || document.getElementById('ndv-css')) return; const s = document.createElement('style'); s.id = 'ndv-css'; s.textContent = CSS; document.head.appendChild(s); }
  const api = { render: (el, o) => { ensureCss(); render(el, o); }, snippet, rulesOf, fromRules, PRESETS, BASE };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.NexusDev = api;
})(typeof window !== 'undefined' ? window : globalThis);
