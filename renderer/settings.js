// Settings overlay for the chat HUD: Providers, Agents, Connectors, Voice, General, Activity.
// NexusSettings.mount(ctx) → { open(tab), close(), isOpen() }
(function () {
  function mount(ctx) {
    const $ = id => document.getElementById(id);
    const { api, boot, esc, providers } = ctx;
    const catalog = ctx.catalog || [];
    const P = () => ctx.personas;
    const core = () => P().filter(p => !p.legacy), legacyList = () => P().filter(p => p.legacy);
    const modelCache = {};
    const TABS = ['account', 'providers', 'personas', 'connectors', 'voice', 'routines', 'stats', 'general', 'activity'];
    let current = 'providers';

    function open(tab, anchor) {
      $('settings').hidden = false;
      switchTab(TABS.includes(tab) ? tab : current);
      if (anchor) setTimeout(() => { const el = $(anchor + 'Card'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); (el.querySelector('textarea') || el.querySelector('input'))?.focus(); } }, 60);
    }
    function close() { $('settings').hidden = true; ctx.onAgentChange(); }
    function switchTab(name) {
      current = name;
      document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
      TABS.forEach(t => $('tab-' + t).hidden = t !== name);
      ({ account: renderAccount, providers: renderProviders, personas: renderAgents, connectors: renderConnectors, voice: renderVoice, general: fillGeneral, activity: renderActivity, routines: renderRoutines, stats: renderStats })[name]();
    }
    $('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) switchTab(b.dataset.tab); });
    $('btnCloseSettings').addEventListener('click', close);

    // ---------- shared key row
    function keyRowHtml(id, placeholder) {
      const set = ctx.keys[id];
      return `<div class="row">
        <input type="password" placeholder="${set ? '•••••••• (stored in Keychain)' : esc(placeholder || 'Paste API key')}" data-key="${id}">
        <button class="ghost-btn" data-savekey="${id}">Save</button>
        ${set ? `<button class="ghost-btn" data-clearkey="${id}">Remove</button>` : ''}
      </div>`;
    }
    async function handleKeyButtons(t, rerender) {
      if (t.dataset.savekey) {
        const id = t.dataset.savekey, v = document.querySelector(`[data-key="${id}"]`).value;
        if (!v.trim()) return true;
        ctx.keys = await api.setKey(id, v); delete modelCache[id]; rerender();
        return true;
      }
      if (t.dataset.clearkey) { ctx.keys = await api.setKey(t.dataset.clearkey, ''); rerender(); return true; }
      return false;
    }
    async function save(patch) { const r = await api.setSettings(patch); ctx.settings = r.settings; ctx.hotkeys = r.hotkeys; return r; }

    // ---------- Account + Nexus cloud
    function ago(ts) {
      if (!ts) return 'never';
      const s = Math.round((Date.now() - ts) / 1000);
      return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(ts).toLocaleDateString();
    }
    const unlockedNames = () => Object.entries(ctx.access || {}).filter(([, a]) => a.unlocked).map(([id]) => (P().find(p => p.id === id) || {}).handle || id);
    let acctMode = 'signin';   // signin | signup | reset
    let acctEdit = '';         // '' | username | email | password
    function msg(id, text, kind) { const el = $(id); if (el) { el.className = 'note ' + (kind || ''); el.textContent = text; } }
    function renderAccount() {
      const c = ctx.cloud, a = c.account;
      const synced = core().map(p => {
        const sp = c.synced[p.id];
        return `<div class="sync-row"><i style="background:${p.color};color:${p.color}"></i><span>${esc(p.handle)}</span>
          <small>${sp ? `Up to date · ${(p.features || []).length} features · ${esc(new Date(sp.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}` : `Built-in version · ${(p.features || []).length} features`}</small></div>`;
      }).join('') + (legacyList().length ? `<div class="sync-row"><i style="background:var(--muted);color:var(--muted)"></i><span>classic</span><small>${legacyList().length} classic models</small></div>` : '');
      // Free chats left on the free Nexus key, one ring per agent
      const ringRow = p => {
        const x = (ctx.access || {})[p.id];
        if (!x) return '';
        const frac = x.mode === 'blocked' ? 0 : x.mode === 'free' && x.limit && !x.unlocked ? Math.max(0, x.limit - x.used) / x.limit : 1;
        const big = x.mode === 'free' && x.limit && !x.unlocked ? String(Math.max(0, x.limit - x.used)) : x.mode === 'blocked' ? (x.tier === 'ultra' ? '—' : '0') : '∞';
        const sub = x.mode === 'own' ? 'your key' : x.mode === 'local' ? 'local model' : x.mode === 'blocked' ? (x.tier === 'ultra' ? 'needs your key' : 'used up') : x.unlocked ? 'redeemed' : x.limit ? `of ${x.limit} left` : 'unlimited';
        return `<div class="ring-cell" title="${esc(p.name)}: ${esc(sub)}">${window.NexusView.ring(frac, { size: 54, stroke: 4.5, color: frac === 0 ? '#ff6b6b' : p.color })}
          <b>${esc(big)}</b><span style="color:${p.color}">${esc(p.handle)}</span><small>${esc(x.tierLabel)} · ${esc(sub)}</small></div>`;
      };
      const rings = `<div class="card">
          <div class="card-head"><b>Free chats left</b><span class="badge">${ctx.settings.freeKey?.enabled === false ? 'FREE KEY OFF' : 'FREE NEXUS KEY'}</span></div>
          <div class="ring-grid">${core().map(ringRow).join('')}</div>
          <div class="note">Counts only go down on the free Nexus key${a.signedIn ? ' and match the web Nexus' : ''}. Your own keys, local models and redeemed orders are unlimited.</div>
        </div>`;

      let accountCard;
      if (a.signedIn) {
        const field = (key, label, value, input) => `<div class="acct-field">
          <span class="af-label">${label}</span>
          ${acctEdit === key ? `<div class="row">${input}<button class="ghost-btn" data-save="${key}">Save</button><button class="ghost-btn" data-cancel>Cancel</button></div><span class="note" id="af-${key}"></span>`
            : `<span class="af-value">${value}</span><button class="link-btn" data-edit="${key}">Change</button>`}
        </div>`;
        const usage = (a.usage || []).map(u => `<span class="usage-pill">${esc(u.assistant)} · ${esc(String(u.count))} chats</span>`).join('');
        const reds = (a.redemptions || []).map(r => `<div class="sync-row"><span>Order ${esc(r.orderId)}</span><small>${esc(r.tier || 'redeemed')} · ${esc(new Date(r.at).toLocaleDateString())}</small></div>`).join('');
        accountCard = `
          <div class="card">
            <div class="card-head"><b>Nexus account</b><span class="row" style="flex:none">${a.beta ? '<span class="badge ok">BETA</span>' : ''}${a.comped ? '<span class="badge ok">COMPED</span>' : ''}<span class="badge ok">SIGNED IN</span></span></div>
            ${a.moderation ? `<div class="note err">Account ${esc(a.moderation.status)}${a.moderation.reason ? ': ' + esc(a.moderation.reason) : ''}${a.moderation.suspended_until ? ' until ' + esc(new Date(a.moderation.suspended_until).toLocaleString()) : ''}</div>` : ''}
            <div class="acct-row"><span class="avatar">${esc((a.username || a.email || '?')[0].toUpperCase())}</span>
              <div><b>${esc(a.username || 'No username yet')}</b><div class="note">${a.since ? 'Member since ' + esc(new Date(a.since).toLocaleDateString()) : esc(a.email || '')}</div></div></div>
            ${field('username', 'Username', esc(a.username || '—'), `<input id="afUsername" value="${esc(a.username || '')}" placeholder="3–24 letters, numbers, _ . -">`)}
            ${field('email', 'Email', esc(a.email || ''), `<input id="afEmail" type="email" value="${esc(a.email || '')}">`)}
            ${field('password', 'Password', '••••••••', `<input id="afPassword" type="password" placeholder="New password (6+ characters)"><input id="afPassword2" type="password" placeholder="Repeat new password">`)}
            <div class="row" style="justify-content:flex-end;gap:8px"><span class="note" id="acNote" style="flex:1"></span><button class="ghost-btn" id="acRefresh">Refresh</button><button class="ghost-btn" id="acSignOut">Sign out</button></div>
          </div>
          <div class="card">
            <div class="card-head"><b>Usage on web Nexus</b></div>
            ${usage ? `<div class="feat-list">${usage}</div>` : '<div class="note">No chats counted yet.</div>'}
            ${reds ? `<div class="card-head" style="margin-top:4px"><b>Redeemed orders</b></div><div class="sync-list">${reds}</div>` : ''}
          </div>
          <div class="card">
            <div class="card-head"><b>Redeem an aARgon3 / Mexel order</b><span class="badge ${unlockedNames().length ? 'ok' : ''}">${unlockedNames().length ? unlockedNames().length + ' UNLIMITED' : 'FREE TIERS'}</span></div>
            <div class="note">Enter the order number from your receipt. Every model on that order becomes unlimited on the free Nexus key.</div>
            <div class="row"><input id="redeemId" placeholder="MRH33QFL-RA6C" spellcheck="false" autocomplete="off" style="text-transform:uppercase"><button class="ghost-btn" id="redeemGo">Redeem</button></div>
            <span class="note" id="redeemNote"></span>
            ${unlockedNames().length ? `<div class="feat-list">${unlockedNames().map(n => `<span class="feat-pill">∞ ${esc(n)}</span>`).join('')}</div>` : ''}
          </div>`;
      } else {
        const title = { signin: 'Sign in to Nexus', signup: 'Create a Nexus account', reset: 'Reset your password' }[acctMode];
        accountCard = `<div class="card">
          <div class="card-head"><b>${title}</b><span class="badge">OPTIONAL</span></div>
          <div class="note">${acctMode === 'reset' ? "We'll email you a link to set a new password." : 'Same account as the web Nexus. Optional, but signing in syncs your free-key chat counts with the web and lets you redeem aARgon3 / Mexel orders.'}</div>
          ${acctMode === 'signup' ? '<input id="acUser" placeholder="Username" autocomplete="username">' : ''}
          <input id="acEmail" type="email" placeholder="Email" autocomplete="email">
          ${acctMode !== 'reset' ? `<input id="acPass" type="password" placeholder="Password" autocomplete="${acctMode === 'signup' ? 'new-password' : 'current-password'}">` : ''}
          <div class="row"><span class="note" id="acNote" style="flex:1"></span><button class="ghost-btn" id="acGo">${{ signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[acctMode]}</button></div>
          <div class="acct-links">
            ${acctMode !== 'signin' ? '<button class="link-btn" data-mode="signin">I have an account</button>' : ''}
            ${acctMode !== 'signup' ? '<button class="link-btn" data-mode="signup">Create an account</button>' : ''}
            ${acctMode !== 'reset' ? '<button class="link-btn" data-mode="reset">Forgot password?</button>' : ''}
          </div>
        </div>`;
      }
      const nickSynced = a.signedIn && a.nickname !== undefined;
      const profileCard = `<div class="card" id="nickCard">
          <div class="card-head"><b>What should Nexus call you?</b><span class="badge ${ctx.settings.nickname ? 'ok' : ''}">${ctx.settings.nickname ? 'SET' : 'OPTIONAL'}</span></div>
          <div class="row"><input id="nickIn" value="${esc(ctx.settings.nickname || '')}" placeholder="${esc(a.username || 'Your name or nickname')}" maxlength="40"><button class="ghost-btn" id="nickSave">Save</button></div>
          <span class="note" id="nickNote">Used in greetings and by every agent.${a.signedIn ? (nickSynced ? ' Synced to your Nexus account.' : ' Saved on this Mac.') : ''}</span>
        </div>`;
      $('tab-account').innerHTML = accountCard + profileCard + rings + `
        <div class="card">
          <div class="card-head"><b>Agents</b><span class="badge ${c.lastError ? '' : 'ok'}">${c.lastError ? 'OFFLINE' : 'UP TO DATE'}</span></div>
          <div class="sync-list">${synced}</div>
          <div class="row"><span class="note ${c.lastError ? 'err' : ''}" style="flex:1">${c.lastError ? "Couldn't check for agent updates. Nexus keeps using the last versions it has." : `Agents update automatically. Last checked ${ago(c.lastSync)}.`}</span><button class="ghost-btn" id="acSync">Check now</button></div>
        </div>
        ${c.announcements.length ? `<div class="card"><div class="card-head"><b>Announcements</b></div>${c.announcements.map(x => `<div class="note">• ${esc(x.message)}</div>`).join('')}</div>` : ''}`;
    }
    const accountResult = (r, ok, noteId = 'acNote') => {
      if (r.ok) { ctx.cloud = r.state; acctEdit = ''; renderAccount(); if (ok) msg('acNote', ok, 'ok'); }
      else msg(noteId, r.error, 'err');
    };
    $('tab-account').addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'acSync') { t.textContent = 'Checking…'; ctx.cloud = await api.cloud.sync(); return renderAccount(); }
      if (t.id === 'nickSave') {
        const r = await api.profile.setNickname($('nickIn').value);
        ctx.settings = { ...ctx.settings, nickname: r.nickname };
        msg('nickNote', r.nickname ? `✓ Nexus will call you ${r.nickname}.${r.synced ? ' Synced to your Nexus account.' : ''}` : 'Cleared.', 'ok');
        return;
      }
      if (t.id === 'acSignOut') { ctx.cloud = await api.cloud.signOut(); acctMode = 'signin'; return renderAccount(); }
      if (t.id === 'redeemGo') {
        const id = $('redeemId').value;
        msg('redeemNote', 'Checking the order…');
        const r = await api.cloud.redeem(id);
        if (!r.ok) return msg('redeemNote', r.error, 'err');
        ctx.cloud = r.state; renderAccount();
        return msg('redeemNote', `Redeemed ${r.result.orderId}${r.result.models.length ? ': ' + r.result.models.join(', ') + ' now unlimited.' : ': all models unlocked.'}`, 'ok');
      }
      if (t.id === 'acRefresh') { t.textContent = 'Refreshing…'; return accountResult(await api.cloud.refreshAccount(), 'Up to date.'); }
      if (t.dataset.mode) { acctMode = t.dataset.mode; return renderAccount(); }
      if (t.dataset.edit) { acctEdit = t.dataset.edit; renderAccount(); return $({ username: 'afUsername', email: 'afEmail', password: 'afPassword' }[acctEdit])?.focus(); }
      if (t.hasAttribute('data-cancel')) { acctEdit = ''; return renderAccount(); }
      if (t.dataset.save === 'username') return accountResult(await api.cloud.changeUsername($('afUsername').value), 'Username saved.', 'af-username');
      if (t.dataset.save === 'email') {
        const r = await api.cloud.changeEmail($('afEmail').value);
        return accountResult(r, 'Check both inboxes: confirm the change from the link we sent.', 'af-email');
      }
      if (t.dataset.save === 'password') {
        if ($('afPassword').value !== $('afPassword2').value) return msg('af-password', "Passwords don't match.", 'err');
        return accountResult(await api.cloud.changePassword($('afPassword').value), 'Password changed.', 'af-password');
      }
      if (t.id === 'acGo') {
        msg('acNote', { signin: 'Signing in…', signup: 'Creating account…', reset: 'Sending…' }[acctMode]);
        const email = $('acEmail').value;
        if (acctMode === 'signin') { const r = await api.cloud.signIn(email, $('acPass').value); return r.ok ? (ctx.cloud = r.state, renderAccount()) : msg('acNote', r.error, 'err'); }
        if (acctMode === 'signup') {
          const r = await api.cloud.signUp(email, $('acPass').value, $('acUser').value);
          if (!r.ok) return msg('acNote', r.error, 'err');
          ctx.cloud = r.state;
          if (r.confirmed) { if ($('acUser').value.trim()) await api.cloud.changeUsername($('acUser').value); return renderAccount(); }
          acctMode = 'signin'; renderAccount();
          return msg('acNote', 'Account created. Confirm it from the email we sent, then sign in.', 'ok');
        }
        const r = await api.cloud.resetPassword(email);
        return r.ok ? msg('acNote', 'Reset link sent — check your email.', 'ok') : msg('acNote', r.error, 'err');
      }
    });
    $('tab-account').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      const btn = $('acGo') || document.querySelector('#tab-account [data-save]');
      btn?.click();
    });

    // ---------- Providers
    function freeModelRow(fk) {
      const cur = fk.model || 'openrouter/free';
      const list = (fk.models && fk.models.length) ? fk.models : [{ id: 'openrouter/free', name: 'Free Models Router (auto-picks a free model)' }];
      const opts = (list.some(m => m.id === cur) ? list : [{ id: cur, name: cur }, ...list])
        .map(m => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.name)}${m.id !== m.name ? ' — ' + esc(m.id) : ''}</option>`).join('');
      return `<div class="row"><span class="note" style="flex:none">Model</span><select data-fkmodel>${opts}</select><button class="ghost-btn" data-fkfetch>Fetch free models</button></div>
        <div class="note" data-fknote>Only free OpenRouter models ("free" in the name, $0 input and output) can run on the free key${fk.models?.length ? ` · ${fk.models.length} available` : ''}.</div>`;
    }
    function freeKeyCard() {
      const fk = ctx.settings.freeKey || {};
      const tierRow = (label, who, lim) => `<div class="tier-row"><b>${label}</b><span>${who}</span><small>${lim}</small></div>`;
      return `<div class="card free-card">
        <div class="card-head"><b>Free Nexus key</b><span class="badge ${fk.enabled !== false ? 'ok' : ''}">${fk.enabled !== false ? 'ON' : 'OFF'}</span></div>
        <div class="note">No API key? Agents run on the shared Nexus OpenRouter key with the same chat limits as the web Nexus. Your own keys always take priority and have no limits.</div>
        <label class="check"><input type="checkbox" data-fk="enabled" ${fk.enabled !== false ? 'checked' : ''}> Use the free Nexus key when I don't have my own</label>
        <div class="tiers">
          ${tierRow('ULTRA', 'Paragon', 'needs your own key')}
          ${tierRow('BEST', 'Neodela + classic models', '28 chats each')}
          ${tierRow('STANDARD', 'Lyte models', '95 chats each')}
          ${tierRow('BASE', 'Flash', 'unlimited')}
        </div>
        ${freeModelRow(fk)}
        <div class="note">Redeemed aARgon3 / Mexel orders make their models unlimited (Settings → Account).</div>
      </div>`;
    }
    function renderProviders() {
      $('tab-providers').innerHTML = freeKeyCard() + Object.entries(providers).map(([id, p]) => {
        const isApple = p.kind === 'apple';
        const badge = p.needsKey ? `<span class="badge ${ctx.keys[id] ? 'ok' : ''}">${ctx.keys[id] ? 'KEY STORED' : 'NO KEY'}</span>`
          : `<span class="badge ok">${isApple ? 'ON-DEVICE' : 'LOCAL'}</span>`;
        const urlRow = p.local && !isApple ? `<div class="row">
            <input placeholder="${esc(p.base)}" value="${esc(ctx.settings.baseUrls[id] || '')}" data-url="${id}">
            <button class="ghost-btn" data-saveurl="${id}">Save URL</button></div>` : '';
        const note = isApple ? '<div class="note">Apple Intelligence on this Mac (macOS 26+), through the NexusCore helper. Small context and no tools, so it works best for Lyte or Flash.</div>' : '';
        return `<div class="card"><div class="card-head"><b>${esc(p.label)}</b>${badge}</div>
          ${p.needsKey ? keyRowHtml(id) : ''}${urlRow}${note}
          <div class="row"><button class="ghost-btn" data-test="${id}">Test connection</button><span class="note" data-testout="${id}"></span></div></div>`;
      }).join('');
    }
    $('tab-providers').addEventListener('change', async e => {
      if (e.target.dataset.fk) { await save({ freeKey: { [e.target.dataset.fk]: e.target.checked } }); renderProviders(); }
      if (e.target.dataset.fkmodel !== undefined) { await save({ freeKey: { model: e.target.value } }); }
    });
    $('tab-providers').addEventListener('click', async e => {
      const t = e.target;
      if (await handleKeyButtons(t, renderProviders)) return;
      if (t.dataset.fkfetch !== undefined) {
        t.disabled = true; t.textContent = 'Fetching…';
        const r = await api.freeModels();
        if (r.ok) { ctx.settings = { ...ctx.settings, freeKey: { ...ctx.settings.freeKey, models: r.models.map(m => ({ id: m.id, name: m.name })), model: r.model } }; renderProviders(); }
        else { t.disabled = false; t.textContent = 'Fetch free models'; document.querySelector('[data-fknote]').textContent = r.error; }
        return;
      }
      if (t.dataset.saveurl) {
        const id = t.dataset.saveurl, v = document.querySelector(`[data-url="${id}"]`).value.trim();
        await save({ baseUrls: { ...ctx.settings.baseUrls, [id]: v } });
        delete modelCache[id]; t.textContent = 'Saved'; setTimeout(() => t.textContent = 'Save URL', 1200);
      } else if (t.dataset.test) {
        const id = t.dataset.test, out = document.querySelector(`[data-testout="${id}"]`);
        out.className = 'note'; out.textContent = 'Pinging…';
        if (providers[id].kind === 'apple') {
          const info = await api.voice.helperInfo();
          const okFM = info.fm === 'available';
          out.className = 'note ' + (okFM ? 'ok' : 'err');
          out.textContent = !info.built ? 'NexusCore helper not built — run: npm run build:helper' : info.error || (okFM ? 'Online · on-device model ready' : `Unavailable: ${info.fm}`);
          return;
        }
        const r = await api.listModels(id);
        if (r.ok) { modelCache[id] = r.models; out.className = 'note ok'; out.textContent = `Online · ${r.models.length} models`; }
        else { out.className = 'note err'; out.textContent = r.error; }
      }
    });

    // ---------- Agents
    const bindingOf = pid => (pid === '__legacy' ? ctx.settings.legacyBinding : ctx.settings.bindings[pid]) || {};
    const featDesc = id => (catalog.find(f => f.id === id) || {}).desc || '';
    function featureChips(p) {
      if (!p.features?.length) return '<div class="note">No assistant features.</div>';
      return `<div class="feat-list">${p.features.map(f => `<span class="feat-pill" title="${esc(featDesc(f))}">@${esc(f)}</span>`).join('')}</div>`;
    }
    function bindingRow(pid) {
      const b = bindingOf(pid);
      const opts = Object.entries(providers).map(([id, p]) => `<option value="${id}" ${id === b.provider ? 'selected' : ''}>${esc(p.label)}</option>`).join('');
      return `<div class="row">
        <select data-prov="${pid}">${opts}</select>
        <input list="dl-${pid}" data-model="${pid}" value="${esc(b.model || '')}" placeholder="${esc(providers[b.provider]?.defaultModel || 'model id')}">
        <datalist id="dl-${pid}"></datalist>
        <button class="ghost-btn" data-fetch="${pid}">Load models</button>
      </div><span class="note" data-pnote="${pid}"></span>`;
    }
    function renderAgents() {
      const legacy = legacyList();
      $('tab-personas').innerHTML = core().map((p, i) => `<div class="card">
          <div class="card-head"><b style="color:${p.color}">${esc(p.name)}</b>
            <span class="row" style="flex:none">${p.agentic ? '<span class="badge ok">AGENT</span>' : '<span class="badge">CHAT ONLY</span>'}<span class="badge">⌘${i + 1}</span></span></div>
          ${bindingRow(p.id)}
          ${p.agentic && providers[bindingOf(p.id).provider]?.noTools ? '<div class="note err">This provider can\'t call tools, so Paragon\'s connectors won\'t work on it.</div>' : ''}
          ${featureChips(p)}
        </div>`).join('') +
        (legacy.length ? `<div class="card">
          <div class="card-head"><b>Classic models</b><span class="badge">${legacy.length} CLASSIC MODELS</span></div>
          <div class="note">Nexus models from earlier versions (${esc(legacy.slice(0, 4).map(p => p.name.replace(/^Nexus\s*-?[\d.]+o?\s*/i, '')).join(', '))}${legacy.length > 4 ? '…' : ''}). They're chat-only and all run on the model you choose here. Pick one from the agent menu → Classic models, or type @${esc(legacy[0].handle)}.</div>
          ${bindingRow('__legacy')}
          <div class="legacy-grid">${legacy.map(p => `<div class="lg-item"><i style="background:${p.color};color:${p.color}"></i><b>${esc(p.name)}</b><small>@${esc(p.handle)} · ${p.features.length} features</small>
            <div class="feat-list small">${p.features.map(f => `<span class="feat-pill" title="${esc(featDesc(f))}">@${esc(f)}</span>`).join('')}</div></div>`).join('')}</div>
        </div>` : '') +
        '<p class="fine">Type @ then a feature name (like @Seek) to use it for one message. Each agent has its own set of features. @Seek can search the web on any agent that has it.</p>';
      [...core().map(p => p.id), '__legacy'].forEach(fillDatalist);
    }
    function fillDatalist(pid) {
      const prov = bindingOf(pid).provider;
      const dl = $('dl-' + pid);
      if (dl) dl.innerHTML = (modelCache[prov] || []).map(m => `<option value="${esc(m)}">`).join('');
    }
    async function saveBinding(pid, patch) {
      if (pid === '__legacy') await save({ legacyBinding: { ...ctx.settings.legacyBinding, ...patch } });
      else await save({ bindings: { ...ctx.settings.bindings, [pid]: { ...ctx.settings.bindings[pid], ...patch } } });
      ctx.onAgentChange();
    }
    $('tab-personas').addEventListener('change', async e => {
      const t = e.target;
      if (t.dataset.prov) { await saveBinding(t.dataset.prov, { provider: t.value, model: '' }); renderAgents(); }
      else if (t.dataset.model) await saveBinding(t.dataset.model, { model: t.value.trim() });
    });
    $('tab-personas').addEventListener('click', async e => {
      const pid = e.target.dataset.fetch; if (!pid) return;
      const prov = bindingOf(pid).provider, note = document.querySelector(`[data-pnote="${pid}"]`);
      note.className = 'note'; note.textContent = 'Loading…';
      const r = await api.listModels(prov);
      if (r.ok) { modelCache[prov] = r.models; fillDatalist(pid); note.className = 'note ok'; note.textContent = `${r.models.length} models — click the model field to choose.`; }
      else { note.className = 'note err'; note.textContent = r.error; }
    });

    // ---------- Connectors
    let conn = null;        // { connectors, status, presets }
    let editing = null;     // connector draft being edited
    api.connectors.onChange(st => { conn = st; if (!$('settings').hidden && current === 'connectors' && !editing) renderConnectors(); });

    const kvToText = (o, sep) => Object.entries(o || {}).map(([k, v]) => `${k}${sep}${v}`).join('\n');
    const textToKv = (t, sep) => Object.fromEntries(String(t || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const i = l.indexOf(sep); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + sep.length).trim()];
    }));

    async function renderConnectors() {
      if (!conn) conn = await api.connectors.state();
      const s = ctx.settings;
      const sp = boot.searchProviders;
      const wp = s.web.provider;
      const helperOk = !!boot.helper.eventkit;
      const helperMsg = !boot.helper.built ? 'HELPER NOT BUILT' : helperOk ? 'ON THIS MAC' : 'HELPER OUT OF DATE';
      const statusBadge = c => {
        if (!c.enabled) return '<span class="badge">OFF</span>';
        const st = conn.status[c.id];
        if (!st || st.status === 'connecting') return '<span class="badge">CONNECTING…</span>';
        if (st.status === 'connected') return `<span class="badge ok">CONNECTED · ${st.tools.length} TOOLS</span>`;
        return '<span class="badge" style="color:var(--danger);border-color:var(--danger)">ERROR</span>';
      };
      $('tab-connectors').innerHTML = `
        <div class="card">
          <div class="card-head"><b>Web search</b><span class="badge ${s.web.enabled ? 'ok' : ''}">${s.web.enabled ? 'ON' : 'OFF'}</span></div>
          <label class="check"><input type="checkbox" data-web="enabled" ${s.web.enabled ? 'checked' : ''}> Paragon can search the web and read pages</label>
          <select data-web="provider">${Object.entries(sp).map(([id, p]) => `<option value="${id}" ${id === wp ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
          ${sp[wp]?.needsKey ? keyRowHtml(wp, `Paste ${sp[wp].label.split(' (')[0]} API key`) : '<div class="note">No key needed. For better results and image search, add a free Tavily key.</div>'}
          <label class="check"><input type="checkbox" data-web="chatAgents" ${s.web.chatAgents ? 'checked' : ''}> Also let Neodela, Lyte and Flash search (read-only)</label>
        </div>
        <div class="card">
          <div class="card-head"><b>Apple Calendar &amp; Reminders</b><span class="badge ${helperOk ? 'ok' : ''}" ${helperOk ? '' : 'style="color:var(--danger);border-color:var(--danger)"'}>${helperMsg}</span></div>
          <label class="check"><input type="checkbox" data-apple="calendar" ${s.apple.calendar ? 'checked' : ''} ${helperOk ? '' : 'disabled'}> Calendar: read events, add events (asks first)</label>
          <label class="check"><input type="checkbox" data-apple="reminders" ${s.apple.reminders ? 'checked' : ''} ${helperOk ? '' : 'disabled'}> Reminders: read and add reminders (asks first)</label>
          <div class="note ${helperOk ? '' : 'err'}">${helperOk ? 'macOS asks for Calendar/Reminders access the first time Paragon uses them.' : 'Run <b>npm run build:helper</b> in the nexus-desktop folder, then restart Nexus. If it prints “build FAILED”, send me the errors.'}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>Weather</b><span class="badge ${s.weather.enabled ? 'ok' : ''}">${s.weather.enabled ? 'ON · OPEN-METEO' : 'OFF'}</span></div>
          <label class="check"><input type="checkbox" data-wx="enabled" ${s.weather.enabled ? 'checked' : ''}> Paragon can check the weather (free, no key)</label>
          <div class="row"><input data-wxloc placeholder="Default location, e.g. Albemarle, NC" value="${esc(s.weather.location || '')}"><button class="ghost-btn" data-wxsave>Save</button>
            <select data-wx="units"><option value="imperial" ${s.weather.units !== 'metric' ? 'selected' : ''}>°F, mph</option><option value="metric" ${s.weather.units === 'metric' ? 'selected' : ''}>°C, km/h</option></select></div>
        </div>
        <div class="card-head" style="margin-top:4px"><b style="letter-spacing:.2em;font-size:11px;color:var(--muted)">MCP CONNECTORS</b>
          <span class="row" style="flex:none"><select id="presetPick"><option value="">Add connector…</option>${conn.presets.map(p => `<option value="${p.preset}">${esc(p.name)}</option>`).join('')}</select></span></div>
        <div id="connEditor"></div>
        ${conn.connectors.length ? '' : '<p class="fine">Connectors give Paragon access to your apps: Gmail, Google Calendar, Drive, Notion, GitHub, files, or any MCP server.</p>'}
        ${conn.connectors.map(c => {
          const st = conn.status[c.id] || {};
          return `<div class="card" data-cid="${c.id}">
            <div class="card-head"><b>${esc(c.name)}</b>${statusBadge(c)}</div>
            ${st.status === 'error' ? `<div class="note err">${esc(st.error)}</div>` : ''}
            ${st.tools?.length ? `<div class="conn-tools">${st.tools.map(esc).join(' · ')}</div>` : ''}
            <div class="row" style="flex-wrap:wrap">
              <label class="check"><input type="checkbox" data-cenable ${c.enabled ? 'checked' : ''}> Enabled</label>
              <label class="check"><input type="checkbox" data-cconfirm ${c.confirmWrites !== false ? 'checked' : ''}> Ask before actions</label>
              <span style="flex:1"></span>
              <button class="ghost-btn" data-cedit>Edit</button>
              <button class="ghost-btn" data-crecon>Reconnect</button>
              <button class="ghost-btn" data-cdel>Remove</button>
            </div></div>`;
        }).join('')}`;
      if (editing) renderEditor();
    }
    function renderEditor() {
      const d = editing;
      const preset = conn.presets.find(p => p.preset === d.preset);
      $('connEditor').innerHTML = `<div class="card" style="border-color:rgba(var(--accent-rgb),.5)">
        <div class="card-head"><b>${d.id ? 'Edit' : 'New'} connector</b><span class="badge">${d.type === 'http' ? 'REMOTE' : 'LOCAL'}</span></div>
        ${preset?.note ? `<div class="note">${esc(preset.note)}</div>` : ''}
        <div class="row"><input id="ceName" placeholder="Name" value="${esc(d.name)}">
          <select id="ceType"><option value="stdio" ${d.type !== 'http' ? 'selected' : ''}>Local command</option><option value="http" ${d.type === 'http' ? 'selected' : ''}>Remote URL (HTTP)</option></select></div>
        ${d.type === 'http' ? `
          <input id="ceUrl" placeholder="https://example.com/mcp" value="${esc(d.url || '')}">
          <label class="field"><span>Headers (one per line, Name: value)</span><textarea class="kv" id="ceHeaders" placeholder="Authorization: Bearer …">${esc(kvToText(d.secrets?.headers, ': '))}</textarea></label>`
        : `
          <input id="ceCmd" placeholder="Command, e.g. npx or uvx" value="${esc(d.command || '')}">
          <label class="field"><span>Arguments (one per line)</span><textarea class="kv" id="ceArgs">${esc((d.args || []).join('\n'))}</textarea></label>
          <label class="field"><span>Environment (one per line, KEY=value) — stored encrypted</span><textarea class="kv" id="ceEnv" placeholder="API_TOKEN=…">${esc(kvToText(d.secrets?.env, '='))}</textarea></label>`}
        <label class="check"><input type="checkbox" id="ceConfirm" ${d.confirmWrites !== false ? 'checked' : ''}> Ask me before Paragon uses actions that change things</label>
        <div class="row" style="justify-content:flex-end"><span class="note" id="ceNote" style="flex:1"></span><button class="ghost-btn" id="ceCancel">Cancel</button><button class="ghost-btn" id="ceSave">Save &amp; connect</button></div>
      </div>`;
      $('ceType').addEventListener('change', () => { collect(); editing.type = $('ceType').value; renderEditor(); });
      $('ceCancel').addEventListener('click', () => { editing = null; renderConnectors(); });
      $('ceSave').addEventListener('click', async () => {
        collect();
        $('ceNote').className = 'note'; $('ceNote').textContent = 'Connecting… (first run of npx/uvx can take a minute)';
        const d2 = editing;
        conn = await api.connectors.save(
          { id: d2.id, name: d2.name, type: d2.type, command: d2.command, args: d2.args, url: d2.url, enabled: true, confirmWrites: d2.confirmWrites, preset: d2.preset },
          { env: d2.secrets.env, headers: d2.secrets.headers });
        editing = null;
        renderConnectors();
      });
    }
    function collect() {
      const d = editing;
      d.name = $('ceName').value.trim() || 'Connector';
      d.confirmWrites = $('ceConfirm').checked;
      if (d.type === 'http') { d.url = $('ceUrl').value.trim(); d.secrets = { ...d.secrets, headers: textToKv($('ceHeaders').value, ':') }; }
      else {
        d.command = $('ceCmd').value.trim();
        d.args = $('ceArgs').value.split('\n').map(x => x.trim()).filter(Boolean);
        d.secrets = { ...d.secrets, env: textToKv($('ceEnv').value, '=') };
      }
    }
    $('tab-connectors').addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'presetPick' && t.value) {
        const p = conn.presets.find(x => x.preset === t.value);
        editing = { preset: p.preset, name: p.name, type: p.type, command: p.command, args: [...(p.args || [])], url: p.url || '', confirmWrites: true,
          secrets: { env: { ...(p.env || {}) }, headers: { ...(p.headers || {}) } } };
        return renderEditor();
      }
      if (t.dataset.web) {
        const v = t.type === 'checkbox' ? t.checked : t.value;
        await save({ web: { [t.dataset.web]: v } }); ctx.onAgentChange(); return renderConnectors();
      }
      if (t.dataset.apple) { await save({ apple: { [t.dataset.apple]: t.checked } }); return; }
      if (t.dataset.wx) { await save({ weather: { [t.dataset.wx]: t.type === 'checkbox' ? t.checked : t.value } }); return renderConnectors(); }
      const card = t.closest('[data-cid]'); if (!card) return;
      const c = conn.connectors.find(x => x.id === card.dataset.cid);
      if (t.hasAttribute('data-cenable')) conn = await api.connectors.save({ ...c, enabled: t.checked });
      if (t.hasAttribute('data-cconfirm')) conn = await api.connectors.save({ ...c, confirmWrites: t.checked });
      renderConnectors();
    });
    $('tab-connectors').addEventListener('click', async e => {
      const t = e.target;
      if (await handleKeyButtons(t, renderConnectors)) return;
      if (t.hasAttribute('data-wxsave')) { await save({ weather: { location: document.querySelector('[data-wxloc]').value.trim() } }); t.textContent = 'Saved'; setTimeout(() => { t.textContent = 'Save'; }, 1200); return; }
      const card = t.closest('[data-cid]'); if (!card) return;
      const c = conn.connectors.find(x => x.id === card.dataset.cid);
      if (t.hasAttribute('data-cedit')) { editing = { ...c, args: [...(c.args || [])], secrets: { env: { ...(c.secrets?.env || {}) }, headers: { ...(c.secrets?.headers || {}) } } }; renderEditor(); $('connEditor').scrollIntoView({ block: 'nearest' }); }
      if (t.hasAttribute('data-crecon')) { t.textContent = 'Connecting…'; conn = await api.connectors.reconnect(c.id); renderConnectors(); }
      if (t.hasAttribute('data-cdel')) { if (t.dataset.sure) { conn = await api.connectors.remove(c.id); renderConnectors(); } else { t.dataset.sure = '1'; t.textContent = 'Confirm remove'; } }
    });

    // ---------- Voice
    let systemVoices = null;
    async function renderVoice() {
      const v = ctx.settings.voice;
      const sel = (name, options, value) => `<select data-voice="${name}">${options.map(([val, label]) =>
        `<option value="${esc(String(val))}" ${String(val) === String(value) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
      const sysOpts = [['', "System Voice (uses Siri if it's your System Voice)"], ...(systemVoices || []).map(x => [x.name, `${x.name} · ${x.lang}`])];
      if (v.systemVoice && !sysOpts.some(o => o[0] === v.systemVoice)) sysOpts.push([v.systemVoice, v.systemVoice]);
      $('tab-voice').innerHTML = `
        <div class="card">
          <div class="card-head"><b>Speech-to-text</b><span class="badge ${boot.helper.built ? 'ok' : ''}">${boot.helper.built ? 'HELPER READY' : 'HELPER NOT BUILT'}</span></div>
          ${sel('stt', [['apple', 'Apple on-device (private, free)'], ['openai', 'OpenAI transcription'], ['elevenlabs', 'ElevenLabs Scribe']], v.stt)}
          ${boot.helper.built ? '' : '<div class="note">On-device speech needs the NexusCore helper: run <b>npm run build:helper</b>. Until then Nexus falls back to OpenAI or ElevenLabs if a key is stored.</div>'}
        </div>
        <div class="card">
          <div class="card-head"><b>Voice replies &amp; read aloud</b></div>
          ${sel('tts', [['system', 'macOS voice (Siri-capable, free)'], ['elevenlabs', 'ElevenLabs'], ['openai', 'OpenAI voice']], v.tts)}
          ${v.tts === 'system' ? `${sel('systemVoice', sysOpts, v.systemVoice)}
            <div class="note">To use Siri's voice: System Settings → Accessibility → Spoken Content → System Voice → pick a Siri voice, then leave this on "System Voice".</div>
            <div class="row"><span class="note" style="flex:none">Rate</span>${sel('rate', [[0, 'Default'], [160, 'Relaxed'], [190, 'Natural'], [220, 'Brisk'], [260, 'Fast']], v.rate)}</div>` : ''}
          ${v.tts === 'elevenlabs' ? `${sel('elevenVoice', [...boot.voices.eleven.map(x => [x.id, x.name]), ...(boot.voices.eleven.some(x => x.id === v.elevenVoice) ? [] : [[v.elevenVoice, 'Custom: ' + v.elevenVoice]])], v.elevenVoice)}
            <div class="row"><input data-voicecustom placeholder="…or paste a custom ElevenLabs voice ID"><button class="ghost-btn" data-setcustom>Use</button></div>` : ''}
          ${v.tts === 'openai' ? sel('openaiVoice', boot.voices.openai.map(x => [x, x]), v.openaiVoice) : ''}
          <div class="row"><button class="ghost-btn" data-testvoice>Test voice</button><span class="note" data-testvoiceout></span></div>
        </div>
        <div class="card">
          <div class="card-head"><b>Read aloud button</b><span class="badge ok">${v.readAloud === 'reply' ? 'SAME AS REPLIES' : 'SIRI / SYSTEM VOICE'}</span></div>
          ${sel('readAloud', [['system', 'Siri (macOS System Voice)'], ['reply', 'Same voice as voice replies']], v.readAloud)}
          <div class="note">Apps can't pick Siri's voice directly; Nexus uses your Mac's System Voice. Set it to a Siri voice once: Spoken Content → System Voice.</div>
          <div class="row"><button class="ghost-btn" data-spoken>Open Spoken Content settings</button><button class="ghost-btn" data-testread>Test read aloud</button><span class="note" data-testreadout></span></div>
        </div>
        <div class="card">
          <div class="card-head"><b>ElevenLabs key</b><span class="badge ${ctx.keys.elevenlabs ? 'ok' : ''}">${ctx.keys.elevenlabs ? 'KEY STORED' : 'NO KEY'}</span></div>
          ${keyRowHtml('elevenlabs', 'Paste ElevenLabs API key')}
          <div class="note">OpenAI speech uses the OpenAI key from Providers.</div>
        </div>
        <div class="card">
          <div class="card-head"><b>"Hey Nexus"</b><span class="badge ${ctx.wake?.listening ? 'ok' : ''}">${!ctx.wake?.supported ? 'NEEDS HELPER' : ctx.wake?.listening ? 'LISTENING' : ctx.settings.wakeWord ? 'PAUSED' : 'OFF'}</span></div>
          <label class="check"><input type="checkbox" data-wake ${ctx.settings.wakeWord ? 'checked' : ''} ${ctx.wake?.supported ? '' : 'disabled'}> Say "Hey Nexus" to open Quick Ask</label>
          <div class="note ${ctx.wake?.error ? 'err' : ''}">${ctx.wake?.error ? esc(ctx.wake.error) : ctx.wake?.supported ? 'Listens on this Mac only. Audio never leaves your computer. The orange microphone dot stays on while it listens.' : 'Run <b>npm run build:helper</b> to enable the wake word.'}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>Conversation</b></div>
          <label class="check"><input type="checkbox" data-vcheck="continueConversation" ${v.continueConversation ? 'checked' : ''}> Quick Ask keeps listening after each reply (hands-free)</label>
          <label class="check"><input type="checkbox" data-vcheck="speakChatReplies" ${v.speakChatReplies ? 'checked' : ''}> Speak replies in chat when I dictate (⌘D / mic)</label>
          <div class="note">Say "goodbye", "bye", "sleep" or "thank you" on its own to end a voice session. "Hey Flash…" or "Neodela, …" switches agents.</div>
        </div>`;
      if (v.tts === 'system' && systemVoices === null) {
        systemVoices = await api.voice.systemVoices();
        if (systemVoices.length && current === 'voice') renderVoice();
      }
    }
    $('tab-voice').addEventListener('change', async e => {
      const t = e.target;
      if (t.hasAttribute('data-wake')) { await save({ wakeWord: t.checked }); ctx.wake = await api.wake.status(); return renderVoice(); }
      if (t.dataset.voice) await save({ voice: { [t.dataset.voice]: t.dataset.voice === 'rate' ? +t.value : t.value } });
      else if (t.dataset.vcheck) await save({ voice: { [t.dataset.vcheck]: t.checked } });
      renderVoice();
    });
    $('tab-voice').addEventListener('click', async e => {
      const t = e.target;
      if (await handleKeyButtons(t, renderVoice)) return;
      if (t.dataset.setcustom !== undefined) {
        const id = document.querySelector('[data-voicecustom]').value.trim();
        if (id) { await save({ voice: { elevenVoice: id } }); renderVoice(); }
      } else if (t.dataset.spoken !== undefined) {
        api.voice.openSpokenContent();
      } else if (t.dataset.testread !== undefined) {
        const out = document.querySelector('[data-testreadout]');
        out.className = 'note'; out.textContent = 'Reading…';
        const r = await ctx.speaker.speak('This is how Nexus reads replies aloud.', 'read');
        out.className = 'note ' + (r.ok === false ? 'err' : 'ok'); out.textContent = r.ok === false ? r.error : 'Done.';
      } else if (t.dataset.testvoice !== undefined) {
        const out = document.querySelector('[data-testvoiceout]');
        out.className = 'note'; out.textContent = 'Speaking…';
        ctx.orb.setMode('speaking');
        const r = await ctx.speaker.speak(`Nexus online. ${ctx.active().handle} standing by.`);
        ctx.orb.setMode('idle');
        out.className = 'note ' + (r.ok === false ? 'err' : 'ok');
        out.textContent = r.ok === false ? r.error : 'Done.';
      }
    });

    // ---------- General
    const SLOT = { hotkeyToggle: 'toggle', hotkeyQuick: 'quick', hotkeyQuickChat: 'quickChat', hotkeyScreen: 'screen' };
    const NOTES = {
      hotkeyToggle: 'Shows or hides this chat window. Clicking the menu-bar icon does the same.',
      hotkeyQuick: 'Press once to talk; it stops when you pause. Press again to interrupt.',
      hotkeyQuickChat: 'A small typing bar. Drag it anywhere; it remembers where you left it.',
      hotkeyScreen: 'Looks at the window you are using and opens Quick Chat with it attached.'
    };
    function fillGeneral() {
      document.querySelectorAll('input.hotkey').forEach(inp => {
        inp.value = ctx.settings[inp.dataset.slot];
        document.querySelector(`[data-note="${inp.dataset.slot}"]`).textContent = ctx.hotkeys[SLOT[inp.dataset.slot]] ? NOTES[inp.dataset.slot] : '⚠ Could not register this hotkey (another app may be using it).';
      });
      $('themeSelect').value = ctx.settings.theme;
      $('hideOnBlur').checked = ctx.settings.hideOnBlur;
      $('scEnabled').checked = ctx.settings.screen?.enabled !== false;
      $('openAtLogin').checked = !!ctx.settings.openAtLogin;
      $('chatSearchOn').checked = ctx.settings.chatSearch?.enabled !== false;
      api.screen.permission().then(pm => {
        const ok = pm === 'granted';
        $('scBadge').textContent = ok ? 'ALLOWED' : pm === 'not-determined' ? 'ASKS FIRST TIME' : 'PERMISSION OFF';
        $('scBadge').className = 'badge ' + (ok ? 'ok' : '');
        $('scPerm').hidden = ok;
      });
      $('versionLine').textContent = `Nexus '28 v${boot.version} · keys encrypted with macOS Keychain · by Apoji_Delegraphics`;
      renderUpdate();
    }
    document.querySelectorAll('input.hotkey').forEach(inp => inp.addEventListener('keydown', async e => {
      e.preventDefault(); e.stopPropagation();
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      const note = document.querySelector(`[data-note="${inp.dataset.slot}"]`);
      const mods = [];
      if (e.metaKey) mods.push('CommandOrControl'); else if (e.ctrlKey) mods.push('Control');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (!mods.length) { note.textContent = 'Use at least one modifier (⌘, ⌥, ⌃).'; return; }
      const keyName = e.code === 'Space' ? 'Space' : e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const accel = [...mods, keyName].join('+');
      inp.value = accel;
      await save({ [inp.dataset.slot]: accel });
      note.textContent = ctx.hotkeys[SLOT[inp.dataset.slot]] ? `✓ ${accel} saved.` : `⚠ ${accel} is taken — try another.`;
      ctx.onHotkeys();
    }));
    $('themeSelect').addEventListener('change', async e => { await save({ theme: e.target.value }); ctx.applyTheme(); });
    $('hideOnBlur').addEventListener('change', async e => { await save({ hideOnBlur: e.target.checked }); });
    $('scEnabled').addEventListener('change', async e => { await save({ screen: { enabled: e.target.checked } }); });
    $('openAtLogin').addEventListener('change', async e => { await save({ openAtLogin: e.target.checked }); });
    $('chatSearchOn').addEventListener('change', async e => { await save({ chatSearch: { enabled: e.target.checked } }); });
    $('scPerm').addEventListener('click', () => api.screen.openPermission());
    $('scTest').addEventListener('click', async () => {
      $('scNote').className = 'note'; $('scNote').textContent = 'Looking…';
      const r = await api.screen.capture({ mode: 'window' });
      if (!r.ok) { $('scNote').className = 'note err'; $('scNote').textContent = r.error; return; }
      const a = r.attachment;
      $('scNote').className = 'note ok';
      $('scNote').textContent = `✓ Saw ${a.app || 'the screen'}${a.title ? ' — ' + a.title : ''} · read ${a.chars} characters of text.`;
    });
    $('fbSend').addEventListener('click', async () => {
      const r = await api.feedback({ type: $('fbType').value, text: $('fbText').value, includeInfo: $('fbInfo').checked });
      $('fbNote').className = 'note ok';
      $('fbNote').textContent = r.ok ? `Opened your mail app. It goes to ${r.to}.` : 'Could not open Mail.';
      if (r.ok) $('fbText').value = '';
    });

    // ---------- Updates
    function renderUpdate() {
      const u = ctx.update || {};
      $('upAuto').checked = ctx.settings.updates?.auto !== false;
      $('upBadge').textContent = u.newer ? `v${u.latest} AVAILABLE` : u.error ? 'OFFLINE' : u.checkedAt ? 'UP TO DATE' : `v${boot.version}`;
      $('upBadge').className = 'badge ' + (u.newer ? 'ok' : '');
      $('upNote').textContent = u.newer ? `You have v${u.current}. Version ${u.latest} is on GitHub.` : u.error ? `Couldn't reach GitHub (${u.error}).` : u.checkedAt ? `You're on the latest version (v${u.current}). Checked ${new Date(u.checkedAt).toLocaleTimeString()}.` : `You have v${boot.version}.`;
      $('upOpen').hidden = !u.newer;
    }
    $('upCheck').addEventListener('click', async e => { e.target.textContent = 'Checking…'; ctx.update = await api.update.check(); e.target.textContent = 'Check now'; renderUpdate(); });
    $('upOpen').addEventListener('click', () => api.update.open());
    $('upAuto').addEventListener('change', async e => { await save({ updates: { auto: e.target.checked } }); });
    api.update.onChange(u => { ctx.update = u; if (current === 'general' && !$('settings').hidden) renderUpdate(); });
    api.wake.onChange(w => { ctx.wake = w; if (current === 'voice' && !$('settings').hidden) renderVoice(); });

    // ---------- Activity
    // ---------- Routines + Morning Brief
    let routineList = boot.routines || [];
    let rtEditing = null;            // routine being edited (object) or null
    const coreAgents = () => P().filter(p => !p.legacy);
    const agentOpts = sel => coreAgents().map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.handle)}</option>`).join('');
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const lastRunText = r => r.running ? 'Running now…' : r.lastRun ? `Last run ${ago(r.lastRun)}${r.lastStatus === 'error' ? ' · failed: ' + r.lastError : ''}` : 'Not run yet';
    const nextText = r => r.enabled && r.nextRun ? `next ${new Date(r.nextRun).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'paused';
    function scheduleForm(sch = { type: 'daily', time: '08:00' }) {
      const onceVal = sch.at ? new Date(sch.at - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      return `<div class="row rt-sched">
          <select id="rtType">${[['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekly', 'Certain days'], ['hourly', 'Every hour'], ['once', 'Once']].map(([v, l]) => `<option value="${v}" ${sch.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input id="rtTime" type="time" value="${esc(sch.time || '08:00')}" ${sch.type === 'once' ? 'hidden' : ''}>
          <input id="rtAt" type="datetime-local" value="${esc(onceVal)}" ${sch.type === 'once' ? '' : 'hidden'}>
        </div>
        <div class="day-picks" id="rtDays" ${sch.type === 'weekly' ? '' : 'hidden'}>${DAYS.map((d, i) => `<label><input type="checkbox" value="${i}" ${(sch.days || [1]).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>`;
    }
    function readSchedule() {
      const type = $('rtType').value;
      const sch = { type, time: $('rtTime').value || '08:00' };
      if (type === 'hourly') sch.time = '00:' + (sch.time.split(':')[1] || '00');
      if (type === 'weekly') sch.days = [...document.querySelectorAll('#rtDays input:checked')].map(x => +x.value);
      if (type === 'once') sch.at = $('rtAt').value ? new Date($('rtAt').value).getTime() : 0;
      return sch;
    }
    function renderRoutines() {
      const b = routineList.find(r => r.kind === 'brief') || {};
      const items = routineList.filter(r => r.kind !== 'brief');
      const sec = b.sections || {};
      const secBox = (k, label) => `<label class="check small"><input type="checkbox" data-sec="${k}" ${sec[k] !== false ? 'checked' : ''}> ${label}</label>`;
      const form = rtEditing ? `<div class="card rt-form">
          <div class="card-head"><b>${rtEditing.id ? 'Edit routine' : 'New routine'}</b></div>
          <textarea id="rtPrompt" rows="3" placeholder="What should it do? e.g. Summarize today's top tech news in 5 bullets">${esc(rtEditing.prompt || '')}</textarea>
          <div class="row"><input id="rtName" value="${esc(rtEditing.name || '')}" placeholder="Name (optional)"><select id="rtAgent" style="flex:none;width:auto">${agentOpts(rtEditing.agent || 'flash')}</select></div>
          ${scheduleForm(rtEditing.schedule)}
          <label class="check"><input type="checkbox" id="rtSpeak" ${rtEditing.speak ? 'checked' : ''}> Read the result out loud</label>
          <div class="row" style="justify-content:flex-end"><span class="note" id="rtNote" style="flex:1"></span><button class="ghost-btn" id="rtCancel">Cancel</button><button class="ghost-btn" id="rtSave">Save routine</button></div>
        </div>` : '';
      $('tab-routines').innerHTML = `
        <div class="card brief-card">
          <div class="card-head"><b>☀ Morning Brief</b><span class="badge ${b.enabled ? 'ok' : ''}">${b.enabled ? esc(b.when || '').toUpperCase() : 'OFF'}</span></div>
          <div class="note">Nexus gathers your day itself (weather, calendar, reminders, email, headlines), then an agent writes a short brief. It arrives at the time you pick, or the first time you open your Mac after that. Say "Hey Nexus, good morning" anytime.</div>
          <label class="check"><input type="checkbox" id="bfOn" ${b.enabled ? 'checked' : ''}> Send me a Morning Brief every day</label>
          <div class="row"><span class="note" style="flex:none">At</span><input id="bfTime" type="time" value="${esc(b.schedule?.time || '07:30')}" style="flex:none;width:auto">
            <span class="note" style="flex:none">written by</span><select id="bfAgent" style="flex:none;width:auto">${agentOpts(b.agent || 'flash')}</select><span style="flex:1"></span></div>
          <div class="sec-grid">${secBox('weather', 'Weather')}${secBox('calendar', 'Calendar')}${secBox('reminders', 'Reminders')}${secBox('gmail', 'Gmail (Google connector)')}${secBox('headlines', 'Headlines')}${secBox('announcements', 'Nexus news')}${secBox('usage', 'Free chats left')}</div>
          <div class="row"><input id="bfTopics" value="${esc(b.topics || '')}" placeholder="Headline topics (optional), e.g. tech, NC State, Formula 1"><button class="ghost-btn" id="bfSaveTopics">Save</button></div>
          <label class="check"><input type="checkbox" id="bfSpeak" ${b.speak ? 'checked' : ''}> Read it out loud when it arrives</label>
          <div class="row" style="justify-content:flex-end"><span class="note" style="flex:1">${esc(lastRunText(b))}</span>${b.convId ? '<button class="ghost-btn" data-open="brief">Open</button>' : ''}<button class="ghost-btn" data-run="brief">${b.running ? 'Writing…' : 'Get it now'}</button></div>
        </div>
        <div class="card">
          <div class="card-head"><b>⟳ Routines</b><button class="ghost-btn" id="rtNew">New routine</button></div>
          <div class="note">Prompts that run on a schedule with any agent. Each run posts in the Routines space and sends a notification. Paragon still asks before changing anything. Tip: type "every weekday at 8, …" in any chat.</div>
          ${items.length ? `<div class="rt-list">${items.map(r => { const p = P().find(x => x.id === r.agent) || coreAgents()[0]; return `<div class="rt-row ${r.enabled ? '' : 'off'}">
            <label class="switch" title="${r.enabled ? 'Pause' : 'Resume'}"><input type="checkbox" data-toggle="${r.id}" ${r.enabled ? 'checked' : ''}><i></i></label>
            <div class="rt-main"><b>${esc(r.name)}</b><small><i style="background:${p.color}"></i>${esc(p.handle)} · ${esc(r.when)} · ${esc(nextText(r))}</small><small class="${r.lastStatus === 'error' ? 'err' : ''}">${esc(lastRunText(r))}</small></div>
            <div class="rt-btns">${r.convId ? `<button class="link-btn" data-open="${r.id}">Open</button>` : ''}<button class="link-btn" data-run="${r.id}">${r.running ? 'Running…' : 'Run now'}</button><button class="link-btn" data-edit="${r.id}">Edit</button><button class="link-btn danger" data-del="${r.id}">Delete</button></div>
          </div>`; }).join('')}</div>` : '<div class="note">No routines yet.</div>'}
        </div>${form}
        <p class="fine">Routines and the Morning Brief run while Nexus is open. Turn on "Open Nexus when I log in" in General so they never miss.${ctx.settings.openAtLogin ? ' (It\'s on.)' : ''}</p>`;
      if (rtEditing) setTimeout(() => $('rtPrompt')?.focus(), 30);
    }
    async function saveRoutine(patch) {
      const r = await api.routines.save(patch);
      if (r.ok) routineList = r.list;
      return r;
    }
    $('tab-routines').addEventListener('change', async e => {
      const t = e.target;
      const b = routineList.find(r => r.kind === 'brief');
      if (t.id === 'bfOn') { await saveRoutine({ id: b.id, enabled: t.checked }); return renderRoutines(); }
      if (t.id === 'bfTime') { await saveRoutine({ id: b.id, schedule: { type: 'daily', time: t.value || '07:30' } }); return renderRoutines(); }
      if (t.id === 'bfAgent') { await saveRoutine({ id: b.id, agent: t.value }); return; }
      if (t.id === 'bfSpeak') { await saveRoutine({ id: b.id, speak: t.checked }); return; }
      if (t.dataset.sec) { await saveRoutine({ id: b.id, sections: { ...b.sections, [t.dataset.sec]: t.checked } }); return; }
      if (t.dataset.toggle) { await saveRoutine({ id: t.dataset.toggle, enabled: t.checked }); return renderRoutines(); }
      if (t.id === 'rtType') { $('rtTime').hidden = t.value === 'once'; $('rtAt').hidden = t.value !== 'once'; $('rtDays').hidden = t.value !== 'weekly'; }
    });
    $('tab-routines').addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t) return;
      const b = routineList.find(r => r.kind === 'brief');
      if (t.id === 'bfSaveTopics') { await saveRoutine({ id: b.id, topics: $('bfTopics').value.trim().slice(0, 120) }); t.textContent = 'Saved'; setTimeout(() => { t.textContent = 'Save'; }, 1200); return; }
      if (t.id === 'rtNew') { rtEditing = { agent: 'flash', schedule: { type: 'daily', time: '08:00' } }; return renderRoutines(); }
      if (t.id === 'rtCancel') { rtEditing = null; return renderRoutines(); }
      if (t.id === 'rtSave') {
        const patch = { ...(rtEditing.id ? { id: rtEditing.id } : {}), prompt: $('rtPrompt').value, name: $('rtName').value, agent: $('rtAgent').value, schedule: readSchedule(), speak: $('rtSpeak').checked, enabled: true };
        if (patch.schedule.type === 'weekly' && !patch.schedule.days.length) return msg('rtNote', 'Pick at least one day.', 'err');
        if (patch.schedule.type === 'once' && !(patch.schedule.at > Date.now())) return msg('rtNote', 'Pick a time in the future.', 'err');
        const r = await saveRoutine(patch);
        if (!r.ok) return msg('rtNote', r.error, 'err');
        rtEditing = null; return renderRoutines();
      }
      if (t.dataset.edit) { rtEditing = { ...routineList.find(r => r.id === t.dataset.edit) }; return renderRoutines(); }
      if (t.dataset.del) {
        if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'Sure?'; return; }
        const r = await api.routines.remove(t.dataset.del); if (r.ok) routineList = r.list; return renderRoutines();
      }
      if (t.dataset.run) { t.textContent = 'Running…'; await api.routines.runNow(t.dataset.run); return; }
      if (t.dataset.open) { const r = routineList.find(x => x.id === t.dataset.open); if (r?.convId) { close(); api.conv.open(r.convId); } }
    });
    api.routines.onChange(list => { routineList = list; if (!$('settings').hidden && current === 'routines' && !rtEditing) renderRoutines(); });

    // ---------- Stats & achievements
    async function renderStats() {
      const m = await api.metrics.summary();
      const fav = m.favorite ? P().find(p => p.id === m.favorite.agent) : null;
      const got = m.achievements.filter(a => a.unlocked).length;
      const stat = (n, l) => `<div class="stat"><b>${esc(String(n))}</b><span>${esc(l)}</span></div>`;
      $('tab-stats').innerHTML = `
        <div class="card">
          <div class="card-head"><b>Your Nexus</b><span class="badge ok">${esc(String(m.points))} POINTS</span></div>
          <div class="stat-grid">
            ${stat(m.chats, 'messages')}${stat(m.streak + (m.streak === 1 ? ' day' : ' days'), 'streak (best ' + m.bestStreak + ')')}${stat(m.voice, 'by voice')}${stat(m.screen, 'screen looks')}
            ${stat(m.daysActive, 'days active')}${stat(m.missions, 'missions')}${stat(m.routines, 'routines made')}${stat(m.calc, 'calc / convert')}
          </div>
          <div class="note">${fav ? `Favorite agent: <b style="color:${fav.color}">${esc(fav.handle)}</b> (${m.favorite.n} chats)` : 'Chat a bit and your favorite agent shows up here.'}${m.topFeatures.length ? ` · Top features: ${m.topFeatures.map(f => '@' + esc(f.id)).join(' ')}` : ''}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>Achievements</b><span class="badge ${got ? 'ok' : ''}">${got} / ${m.achievements.length}</span></div>
          <div class="ach-grid">${m.achievements.map(a => `<div class="ach ${a.unlocked ? 'got' : ''}" title="${esc(a.desc)}${a.unlocked ? ' · ' + new Date(a.unlocked).toLocaleDateString() : ''}">
            <span class="ach-icon">${esc(a.icon)}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div>
        </div>
        <p class="fine">Stats and points stay on this Mac. Counting started ${esc(new Date(m.since).toLocaleDateString())}.</p>`;
    }

    async function renderActivity() {
      const list = await api.actions.list();
      const pname = id => (P().find(p => p.id === id) || {}).handle || id;
      $('tab-activity').innerHTML = `
        <div class="card-head"><b style="letter-spacing:.2em;font-size:11px;color:var(--muted)">ACTION LOG · LAST ${list.length}</b><button class="ghost-btn" id="alClear">Clear log</button></div>
        ${list.length ? `<div class="act-log">${list.map(a => `<div class="al-row">
          <time>${new Date(a.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
          <span>${esc(a.label)}${a.detail ? ` <small>· ${esc(a.detail)}</small>` : ''}${a.summary ? ` <small>→ ${esc(a.summary)}</small>` : ''} <small>(${esc(pname(a.persona))})</small></span>
          <span class="al-st ${a.status}">${esc(String(a.status).toUpperCase())}</span></div>`).join('')}</div>`
        : '<p class="fine">Every tool Paragon uses (searches, connector calls, approvals) is recorded here on this Mac.</p>'}`;
      $('alClear')?.addEventListener('click', async () => { await api.actions.clear(); renderActivity(); });
    }

    return { open, close, isOpen: () => !$('settings').hidden, refresh: () => !$('settings').hidden && switchTab(current), current: () => current, setPersonas: () => { if (!$('settings').hidden && (current === 'personas' || current === 'account')) switchTab(current); } };
  }

  window.NexusSettings = { mount };
})();
