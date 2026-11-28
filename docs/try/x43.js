// Test Run 4.3.0: Classes, the Developers tab ("Ask Nexus" for your own site) and pinned achievements on your profile.
// Loaded after more.js; uses window.TR (try.js) and window.TRX (more.js).
(() => {
  'use strict';
  const TR = window.TR, TRX = window.TRX; if (!TR || !TRX) return;
  const { sb, $, esc, toast } = TR;
  const rpc = async (fn, args = {}) => { const { data, error } = await sb.rpc(fn, args); if (error) return { ok: false, error: /function|PGRST202|does not exist/i.test(error.message) ? 'This needs the 4.3.0 database update.' : error.message }; return data; };
  const signedIn = () => !!TR.S.user && !TR.S.guest;

  // ---------- Classes (sidebar 🎓 and ⌘K)
  function openClasses() {
    if (!signedIn()) return toast('Make a free account to join or teach a class.');
    if (!window.NexusClass) return toast('Reload the page to load Classes.');
    const X = TRX._?.X, decks = (X?.st?.decks || []).map(k => ({ name: k.name, cards: (k.cards || []).map(c => ({ f: c.f ?? c.front ?? c.q, b: c.b ?? c.back ?? c.a })) })).filter(k => k.cards.length);
    window.NexusClass.open({ rpc, toast, myDecks: () => decks, onFeed: t => rpc('feed_post', { p_kind: 'class', p_text: t }).catch(() => {}) });
  }
  if (!$('classBtn')) ($('studyBtn') || $('newChat'))?.insertAdjacentHTML('afterend', '<button class="btn" id="classBtn" title="Classes" aria-label="Classes">🎓</button>');
  $('classBtn') && ($('classBtn').onclick = openClasses);

  // ---------- settings: a Developers tab, and pins under Profile & shop
  const tabs = $('setTabs');
  if (tabs && !tabs.querySelector('[data-t="developers"]')) (tabs.querySelector('[data-t="install"]') || tabs.lastElementChild)?.insertAdjacentHTML('beforebegin', '<button data-t="developers">Developers</button>');
  const devApi = {
    list: async () => { const { data, error } = await sb.from('embed_bots').select('*').order('created_at', { ascending: false }); if (error) throw new Error(/embed_bots/.test(error.message) ? 'This needs the 4.3.0 database update.' : error.message); return data || []; },
    save: async bot => {
      const row = { id: String(bot.id), name: bot.name, agent: bot.agent, web: !!bot.web, rules: bot.rules || '', knowledge: bot.knowledge || '', greeting: bot.greeting || '', color: bot.color, origins: bot.origins || [], daily_limit: +bot.daily_limit || 200, active: bot.active !== false, owner: TR.S.user.id, updated_at: new Date().toISOString() };
      const { data, error } = await sb.from('embed_bots').upsert(row, { onConflict: 'id' }).select(); if (error) throw new Error(error.message); return data;
    },
    remove: async id => { const { error } = await sb.from('embed_bots').delete().eq('id', id); if (error) throw new Error(error.message); return true; },
    toast
  };
  const ACH = () => window.NexusAchievements || [];
  let unl = { at: 0, ids: [] };
  async function unlockedIds() {
    if (Date.now() - unl.at < 120e3) return unl.ids;
    const { data } = await sb.from('user_stats').select('data').limit(12);
    const ids = new Set(); for (const r of data || []) for (const k of Object.keys(r.data?.unlocked || {})) ids.add(k);
    unl = { at: Date.now(), ids: [...ids] }; return unl.ids;
  }
  async function paintPins() {
    const body = $('setBody'); if (!body || body.querySelector('#trPins')) return;
    const card = document.createElement('div'); card.className = 'card'; card.id = 'trPins';
    card.innerHTML = '<h3>📌 Pinned achievements</h3><p class="muted">Loading…</p>';
    body.querySelector('.card')?.after(card) || body.append(card);
    const ids = await unlockedIds().catch(() => []), mine = ACH().filter(a => ids.includes(a.id));
    const pinned = (TR.S.acct?.card?.style?.pins || []).map(p => p.id);
    card.innerHTML = `<h3>📌 Pinned achievements</h3>${mine.length ? `<p class="muted">Pick up to 3 to show on your profile card. Everyone who sees your card sees them.</p><div class="pin-list">${mine.map(a => `<button class="btn sm ${pinned.includes(a.id) ? 'on' : ''}" data-pin="${esc(a.id)}" title="${esc(a.desc)}">${pinned.includes(a.id) ? '📌 ' : ''}${esc(a.icon)} ${esc(a.name)}</button>`).join('')}</div>`
      : '<p class="muted">Achievements come from the Nexus app on your Mac or PC (they add up across your computers). Unlock some there and pin them here.</p>'}`;
    card.onclick = async e => {
      const b = e.target.closest('[data-pin]'); if (!b) return;
      const next = pinned.includes(b.dataset.pin) ? pinned.filter(x => x !== b.dataset.pin) : [...pinned, b.dataset.pin].slice(-3);
      const pins = next.map(x => ACH().find(a => a.id === x)).filter(Boolean).map(a => ({ id: a.id, name: a.name, icon: a.icon, rare: /^(streak_(30|60|100|365)|the_creator)/.test(a.id) }));
      const r = await rpc('profile_pins_set', { p_pins: pins }); if (r?.ok === false) return toast(r.error || 'Could not pin it.');
      if (TR.S.acct?.card) TR.S.acct.card.style = { ...(TR.S.acct.card.style || {}), pins: r.pins || pins };
      toast('📌 Updated your profile'); TR.paintSettings();
    };
  }
  const origTab = TRX.settingsTab;
  TRX.settingsTab = t => {
    if (t === 'developers') {
      setTimeout(() => { const el = $('trDev'); if (!el) return; if (!signedIn()) { el.innerHTML = '<p class="muted">Make a free account to build an “Ask Nexus” box for your website.</p>'; return; } if (window.NexusDev) window.NexusDev.render(el, devApi); else el.innerHTML = '<p class="muted">Reload the page to load the Developers tools.</p>'; }, 0);
      return '<div class="card"><h3>🧩 Ask Nexus on your website</h3><div id="trDev"><p class="muted">Loading…</p></div></div>';
    }
    const html = origTab(t);
    if (t === 'profile' && signedIn()) setTimeout(paintPins, 0);
    return html;
  };
  const css = document.createElement('style');
  css.textContent = '.pin-list{display:flex;flex-wrap:wrap;gap:6px}.pin-list .btn.on{border-color:var(--accent);background:rgba(var(--accent-rgb,61,255,160),.14)}';
  document.head.appendChild(css);
  window.TRX43 = { openClasses, devApi, paintPins };
})();
