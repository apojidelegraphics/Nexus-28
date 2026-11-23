// Cosmetics (4.0): the Cirkts shop and how everything looks: profile frames, profile themes, app themes, name fonts, name
// colors, banners and orb skins, plus the profile card that shows them. One file for the app (main + windows), N28C and
// Test Run (npm run sync:companion copies it). Prices here mirror the cosmetics table in Supabase, which is what counts.
//   NexusCosmetics.CATALOG · .item(id) · .card(profile, { size }) → HTML · .nameHtml(name, style) · .avatarHtml(url, initial, frame, size) · .CSS
(function (root) {
  const C = [
    ['frame:neon', 'Neon ring', 150], ['frame:halo', 'Halo', 300], ['frame:circuit', 'Circuit', 500], ['frame:flame', 'Flame', 700], ['frame:crown', 'Gold crown', 900],
    ['frame:orbit', 'Orbit', 1200], ['frame:glitch', 'Glitch', 1500], ['frame:prism', 'Prism', 2000],
    ['frame:gold', 'Gold ring', 600], ['frame:frost', 'Frost', 800], ['frame:sakura', 'Petals', 950], ['frame:pulse', 'Heartbeat', 1100], ['frame:shadow', 'Shadow', 1300], ['frame:galaxy', 'Galaxy', 1600], ['frame:rgb', 'Chroma', 2500],   // 4.0.2
    ['ptheme:midnight', 'Midnight', 200], ['ptheme:sunset', 'Sunset', 300], ['ptheme:aurora', 'Aurora', 450], ['ptheme:sakura', 'Sakura', 450], ['ptheme:void', 'Void', 600], ['ptheme:circuit', 'Circuit board', 750], ['ptheme:ocean', 'Deep sea', 300], ['ptheme:ember', 'Embers', 400], ['ptheme:custom', 'Your own colors', 900],
    ['theme:sakura', 'Sakura', 600], ['theme:ocean', 'Midnight Ocean', 600], ['theme:ember', 'Ember', 700], ['theme:obsidian', 'Obsidian Gold', 800], ['theme:aurora', 'Aurora Borealis', 1000], ['theme:holo', 'Holo', 1500],
    ['theme:cyber', 'Cyberpunk', 650], ['theme:vapor', 'Vaporwave', 700], ['theme:bloodmoon', 'Blood Moon', 800], ['theme:emerald', 'Emerald City', 850], ['theme:royal', 'Royal', 1100], ['theme:toxic', 'Toxic', 1250],
    ['font:mono', 'Terminal', 100], ['font:serif', 'Classic serif', 150], ['font:rounded', 'Rounded', 150], ['font:display', 'Display', 250], ['font:hand', 'Handwritten', 300], ['font:pixel', 'Pixel', 400],
    ['color:mint', 'Mint', 50], ['color:sky', 'Sky', 50], ['color:rose', 'Rose', 50], ['color:amber', 'Amber', 50], ['color:violet', 'Violet', 50],
    ['color:gold', 'Gold', 300], ['color:sunset', 'Sunset fade', 400], ['color:aurora', 'Aurora fade', 500], ['color:rainbow', 'Rainbow', 800],
    ['banner:grid', 'Grid', 200], ['banner:waves', 'Waves', 250], ['banner:stars', 'Starfield', 350], ['banner:topo', 'Topography', 350], ['banner:nebula', 'Nebula', 500], ['banner:sunset', 'Sunset', 300], ['banner:aurora', 'Aurora', 400], ['banner:matrix', 'Matrix', 600], ['banner:custom', 'Your own image', 1200],
    ['effect:sparkle', 'Sparkles', 700], ['effect:snow', 'Snowfall', 600], ['effect:rain', 'Rain', 650], ['effect:embers', 'Embers', 800], ['effect:stars', 'Shooting stars', 900],
    ['skin:reactor', 'Reactor', 100], ['skin:nebula', 'Nebula', 250], ['skin:pulse', 'Pulse', 500], ['skin:tide', 'Tide', 600], ['skin:prism', 'Prism', 750], ['skin:ember', 'Ember', 900], ['skin:pixel', 'Pixel', 1000],
    ['skin:vortex', 'Vortex', 1250], ['skin:crystal', 'Crystal', 1400], ['skin:eclipse', 'Eclipse', 1500], ['skin:circuit', 'Circuit', 1750], ['skin:overlord', 'Overlord', 2000], ['skin:quasar', 'Quasar', 2250],
    ['skin:solar', 'Solar', 2500], ['skin:glyph', 'Glyph', 2750], ['skin:hologram', 'Hologram', 3000]
  ];
  const OWNER_ONLY = new Set(['frame:crown']);   // 4.0.2: the crown is the Owner's alone (never sold)
  const CATALOG = C.map(([id, name, price], i) => ({ id, kind: id.split(':')[0], key: id.split(':')[1], name, price: OWNER_ONLY.has(id) ? 0 : price, sort: i, ...(OWNER_ONLY.has(id) ? { owner: true } : {}) }));
  const KINDS = [['frame', 'Frames'], ['ptheme', 'Profile themes'], ['banner', 'Banners'], ['effect', 'Profile effects'], ['font', 'Name fonts'], ['color', 'Name colors'], ['theme', 'App themes'], ['skin', 'Orb skins']];
  const item = id => CATALOG.find(x => x.id === id) || null;
  // app themes you can buy: CSS variables (the same shape as themes.css)
  const APP_THEMES = {
    sakura: { label: 'Sakura', accent: '#ff9ec7', accent2: '#ffd1e3', bg: '#1c0d16', text: '#fff0f6' },
    ocean: { label: 'Midnight Ocean', accent: '#4fb3ff', accent2: '#2ee6d6', bg: '#04101f', text: '#e2f2ff' },
    ember: { label: 'Ember', accent: '#ff7a3d', accent2: '#ffc65c', bg: '#170905', text: '#ffeee4' },
    obsidian: { label: 'Obsidian Gold', accent: '#e6c46a', accent2: '#fff1c2', bg: '#0b0a08', text: '#f6efdd' },
    aurora: { label: 'Aurora Borealis', accent: '#5dffb4', accent2: '#8a7dff', bg: '#050b14', text: '#e6fff5' },
    holo: { label: 'Holo', accent: '#9ff5ff', accent2: '#ff9cf0', bg: '#0a0c16', text: '#f4f8ff' },
    cyber: { label: 'Cyberpunk', accent: '#f9f002', accent2: '#ff2a6d', bg: '#0d0a14', text: '#fffde0' },
    vapor: { label: 'Vaporwave', accent: '#ff71ce', accent2: '#01cdfe', bg: '#140b24', text: '#fbe8ff' },
    bloodmoon: { label: 'Blood Moon', accent: '#ff3b3b', accent2: '#ff9a3c', bg: '#120404', text: '#ffe4e0' },
    emerald: { label: 'Emerald City', accent: '#2ee88a', accent2: '#d4ff5c', bg: '#03120a', text: '#e2ffef' },
    royal: { label: 'Royal', accent: '#b98cff', accent2: '#ffd36b', bg: '#0e0818', text: '#f3ebff' },
    toxic: { label: 'Toxic', accent: '#a6ff00', accent2: '#00ffd5', bg: '#071004', text: '#f0ffe0' }
  };
  const FONTS = { mono: "'SF Mono', ui-monospace, Menlo, Consolas, monospace", serif: "Georgia, 'Times New Roman', serif", rounded: "'SF Pro Rounded', 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif",
    display: "'Avenir Next Condensed', 'Bahnschrift', 'Arial Narrow', system-ui, sans-serif", hand: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive", pixel: "'Silkscreen', 'Press Start 2P', ui-monospace, monospace" };   // single quotes inside: these go in a style="" attribute
  const COLORS = { mint: '#3dffa0', sky: '#5cc8ff', rose: '#ff8fb8', amber: '#ffc35c', violet: '#b18cff', gold: 'linear-gradient(90deg,#c9a227,#fff1a8,#c9a227)',
    sunset: 'linear-gradient(90deg,#ff7a59,#ffb36b,#ff5ea8)', aurora: 'linear-gradient(90deg,#5dffb4,#5cc8ff,#b18cff)', rainbow: 'linear-gradient(90deg,#ff5e5e,#ffb35c,#fff05c,#5dff9a,#5cc8ff,#b18cff,#ff5e5e)' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = id => String(id || '').split(':')[1] || '';
  const HEX = /^#[0-9a-f]{6}$/i, SAFE_IMG = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/banner\.(webp|png|jpe?g|gif)(\?v=\d+)?$/i;
  function nameHtml(name, style = {}) {
    const f = FONTS[key(style.font)], c = COLORS[key(style.color)];
    const css = [f ? `font-family:${f}` : '', c ? (c.startsWith('linear') ? `background:${c};background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent` : `color:${c}`) : ''].filter(Boolean).join(';');
    return `<span class="nxp-name ${key(style.color) === 'rainbow' ? 'nxp-shimmer' : ''} ${key(style.font) === 'pixel' ? 'nxp-pixel' : ''}" style="${css}">${esc(name)}</span>`;
  }
  function avatarHtml(url, initial, frame, size = 64) {
    const fk = key(frame);
    return `<span class="nxp-av ${fk ? 'nxp-f-' + fk : ''}" style="--s:${size}px">${url ? `<img src="${esc(url)}" alt="">` : `<b>${esc(String(initial || '?').slice(0, 1).toUpperCase())}</b>`}${fk === 'crown' ? '<i class="nxp-crown"></i>' : ''}${fk === 'orbit' ? '<i class="nxp-orb"></i>' : ''}${fk === 'sakura' ? '<i class="nxp-petal"></i><i class="nxp-petal p2"></i>' : ''}</span>`;
  }
  // profile: { username, nickname, avatar_url, owner, online, style: { frame, ptheme, font, color, banner, bio, status_text, stats } }
  function card(p = {}, { size = 'full', extra = '' } = {}) {
    const s = p.style || {}, name = p.nickname || p.username || 'Someone', st = s.stats || {};
    const stats = [[st.streak, 'day streak'], [st.achievements, 'achievements'], [st.chats, 'chats'], [st.cirkts, 'Cirkts']].filter(x => x[0] != null && x[0] !== '');
    // 4.0.2: your own banner image and profile colors (like Discord), a profile effect, pronouns
    const bannerUrl = key(s.banner) === 'custom' && SAFE_IMG.test(s.banner_url || '') ? s.banner_url : '';
    const custom = key(s.ptheme) === 'custom' && HEX.test(s.theme_a || '') && HEX.test(s.theme_b || '') ? `background:linear-gradient(165deg,${s.theme_a},${s.theme_b});border-color:${s.theme_a}` : '';
    const fx = key(s.effect);
    return `<div class="nxp-card nxp-${size} ${s.ptheme && !custom ? 'nxp-t-' + key(s.ptheme) : ''}" ${custom ? `style="${custom}"` : ''}>${fx && size !== 'mini' ? `<i class="nxp-fx nxp-fx-${esc(fx)}"></i>` : ''}
      <div class="nxp-banner ${s.banner && !bannerUrl ? 'nxp-b-' + key(s.banner) : ''}" ${bannerUrl ? `style="background:url('${esc(bannerUrl).replace(/[()]/g, '')}') center/cover"` : ''}></div>
      <div class="nxp-body">${avatarHtml(p.avatar_url, name, s.frame, size === 'mini' ? 40 : 72)}
        <div class="nxp-who">${nameHtml(name, s)}${p.owner ? '<span class="nxp-tag">OWNER</span>' : ''}<small>${p.username ? '@' + esc(p.username) : ''}${s.pronouns ? ' · ' + esc(s.pronouns) : ''}${p.online ? ' · <i class="nxp-on"></i> online' : ''}</small>${s.status_text ? `<em>${esc(s.status_text)}</em>` : ''}</div></div>
      ${size !== 'mini' && s.bio ? `<p class="nxp-bio">${esc(s.bio)}</p>` : ''}
      ${size !== 'mini' && stats.length ? `<div class="nxp-stats">${stats.map(([v, l]) => `<div><b>${esc(Number(v).toLocaleString())}</b><span>${l}</span></div>`).join('')}</div>` : ''}${extra}</div>`;
  }
  // a little preview for a shop tile
  function swatch(it) {
    const k = it.key;
    if (it.kind === 'frame') return avatarHtml('', 'A', it.id, 46);
    if (it.kind === 'font') return nameHtml('Aa Nexus', { font: it.id });
    if (it.kind === 'color') return nameHtml('Nexus', { color: it.id, font: 'font:display' });
    if (it.kind === 'banner') return k === 'custom' ? `<div class="nxp-sw nxp-sw-custom"><span>Your image</span></div>` : `<div class="nxp-sw nxp-banner nxp-b-${k}"></div>`;
    if (it.kind === 'effect') return `<div class="nxp-sw nxp-card" style="background:#0b1218"><i class="nxp-fx nxp-fx-${k}"></i></div>`;
    if (it.kind === 'ptheme' && k === 'custom') return `<div class="nxp-sw" style="background:linear-gradient(135deg,#ff5ea8,#5cc8ff 60%,#3dffa0)"></div>`;
    if (it.kind === 'ptheme') return `<div class="nxp-sw nxp-card nxp-t-${k}"></div>`;
    if (it.kind === 'theme') { const t = APP_THEMES[k] || {}; return `<div class="nxp-sw" style="background:linear-gradient(135deg,${t.bg} 40%,${t.accent} 140%);border:1px solid ${t.accent}"><i style="background:${t.accent}"></i><i style="background:${t.accent2}"></i></div>`; }
    if (it.kind === 'skin') return `<canvas class="nxp-skin" data-skin="${esc(k)}" width="92" height="92"></canvas>`;
    return '';
  }
  const CSS = `
.nxp-card { position: relative; border-radius: 18px; overflow: hidden; background: linear-gradient(160deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.1); color: #eef4f8; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; }
.nxp-banner { height: 78px; background: linear-gradient(120deg, rgba(var(--accent-rgb, 61,255,160), .35), rgba(120, 90, 255, .25)); }
.nxp-mini .nxp-banner { height: 34px; }
.nxp-body { display: flex; gap: 12px; align-items: flex-end; padding: 0 16px; margin-top: -32px; position: relative; }
.nxp-mini .nxp-body { margin-top: -18px; padding: 0 10px 10px; align-items: center; }
.nxp-who { display: grid; gap: 1px; padding-bottom: 4px; min-width: 0; } .nxp-who small { color: #9fb0bf; font-size: 12px; } .nxp-who em { font-style: normal; font-size: 12px; color: #c9d6e1; }
.nxp-name { font: 700 19px/1.2 -apple-system, "Segoe UI", system-ui, sans-serif; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nxp-mini .nxp-name { font-size: 14.5px; } .nxp-pixel { font-size: 15px !important; letter-spacing: .02em; }
.nxp-shimmer { animation: nxpShim 3s linear infinite; } @keyframes nxpShim { to { background-position: 200% 0; } }
.nxp-tag { justify-self: start; font: 700 9px ui-monospace, monospace; letter-spacing: .14em; color: #ffd36b; border: 1px solid rgba(255,211,107,.5); border-radius: 6px; padding: 0 5px; }
.nxp-on { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #3dff9a; box-shadow: 0 0 6px #3dff9a; }
.nxp-bio { margin: 10px 16px 0; font-size: 13.5px; line-height: 1.5; color: #d6e1ea; }
.nxp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 8px; margin: 12px 16px 16px; }
.nxp-stats div { text-align: center; padding: 8px 4px; border-radius: 10px; background: rgba(0,0,0,.25); } .nxp-stats b { display: block; font-size: 16px; } .nxp-stats span { font-size: 10.5px; color: #9fb0bf; }
.nxp-full .nxp-body + :not(.nxp-bio):not(.nxp-stats) { margin-top: 12px; } .nxp-full { padding-bottom: 6px; }
.nxp-av { position: relative; flex: none; width: var(--s); height: var(--s); border-radius: 50%; display: grid; place-items: center; background: #1b2a33; border: 3px solid #0c141a; }
.nxp-av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; } .nxp-av b { font: 700 calc(var(--s) * .42) system-ui, sans-serif; color: #dfe9f0; }
.nxp-av::after { content: ''; position: absolute; inset: -6px; border-radius: 50%; pointer-events: none; }
.nxp-f-neon::after { box-shadow: 0 0 0 2px #3dffa0, 0 0 14px #3dffa0, inset 0 0 8px #3dffa0; }
.nxp-f-halo::after { inset: -5px; background: conic-gradient(from 0deg, transparent, rgba(255,255,255,.95), transparent 40%); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px)); animation: nxpSpin 4s linear infinite; }
.nxp-f-circuit::after { border: 2px dashed #5cc8ff; box-shadow: 0 0 10px rgba(92,200,255,.6); animation: nxpSpin 14s linear infinite; }
.nxp-f-flame::after { inset: -7px; background: conic-gradient(#ff3d00, #ffb300, #ff6d00, #ffd54f, #ff3d00); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); filter: blur(.6px) drop-shadow(0 0 6px #ff6d00); animation: nxpSpin 2.5s linear infinite; }
.nxp-f-crown::after { box-shadow: 0 0 0 3px #e6c46a, 0 0 12px rgba(230,196,106,.6); }
.nxp-crown { position: absolute; top: calc(var(--s) * -.28); left: 50%; transform: translateX(-50%) rotate(-8deg); width: calc(var(--s) * .5); height: calc(var(--s) * .32); background: linear-gradient(#fff1a8, #c9a227); clip-path: polygon(0 100%, 0 30%, 25% 60%, 50% 0, 75% 60%, 100% 30%, 100% 100%); filter: drop-shadow(0 2px 3px rgba(0,0,0,.4)); }
.nxp-f-orbit::after { inset: -9px; border: 1px solid rgba(177,140,255,.6); }
.nxp-orb { position: absolute; inset: -9px; border-radius: 50%; animation: nxpSpin 3.2s linear infinite; } .nxp-orb::before { content: ''; position: absolute; top: -3px; left: 50%; width: 7px; height: 7px; border-radius: 50%; background: #e0d2ff; box-shadow: 0 0 10px #b18cff; }
.nxp-f-glitch::after { box-shadow: -2px 0 0 2px #ff2bd6, 2px 0 0 2px #2be8ff; animation: nxpGlitch 2.2s steps(2) infinite; }
.nxp-f-prism::after { inset: -6px; background: conic-gradient(#ff5e5e, #ffb35c, #fff05c, #5dff9a, #5cc8ff, #b18cff, #ff5e5e); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); animation: nxpSpin 5s linear infinite; }
@keyframes nxpSpin { to { transform: rotate(360deg); } }
@keyframes nxpGlitch { 0%, 92% { box-shadow: -2px 0 0 2px #ff2bd6, 2px 0 0 2px #2be8ff; } 94% { box-shadow: 3px 1px 0 2px #ff2bd6, -3px -1px 0 2px #2be8ff; } }
.nxp-t-midnight { background: linear-gradient(165deg, #0f1a3a, #060912); } .nxp-t-sunset { background: linear-gradient(165deg, #3a1530, #1a0b12 60%, #2a1306); }
.nxp-t-aurora { background: radial-gradient(120% 80% at 10% 0%, rgba(93,255,180,.28), transparent 60%), radial-gradient(100% 70% at 100% 100%, rgba(138,125,255,.3), transparent 60%), #070d16; }
.nxp-t-sakura { background: radial-gradient(90% 70% at 90% 0%, rgba(255,158,199,.35), transparent 60%), #1a0d14; } .nxp-t-void { background: radial-gradient(60% 60% at 50% 120%, rgba(120,80,255,.25), transparent 70%), #020204; }
.nxp-t-circuit { background: repeating-linear-gradient(90deg, rgba(92,200,255,.08) 0 1px, transparent 1px 22px), repeating-linear-gradient(0deg, rgba(92,200,255,.08) 0 1px, transparent 1px 22px), #06111a; }
.nxp-b-grid { background: repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0 1px, transparent 1px 18px), repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 1px, transparent 1px 18px), linear-gradient(120deg, rgba(var(--accent-rgb,61,255,160),.35), rgba(0,0,0,.2)); }
.nxp-b-waves { background: radial-gradient(120% 60% at 50% 120%, rgba(92,200,255,.5), transparent 60%), repeating-radial-gradient(circle at 50% 160%, rgba(255,255,255,.12) 0 2px, transparent 2px 14px), #0a2238; }
.nxp-b-stars { background: radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 80%, #cfe, transparent), radial-gradient(1px 1px at 85% 20%, #fff, transparent), radial-gradient(1px 1px at 55% 15%, #fff, transparent), linear-gradient(#050816, #101a3a); }
.nxp-b-topo { background: repeating-radial-gradient(circle at 30% 70%, rgba(255,255,255,.14) 0 1px, transparent 1px 10px), repeating-radial-gradient(circle at 80% 20%, rgba(255,255,255,.1) 0 1px, transparent 1px 12px), #1d2a22; }
.nxp-b-nebula { background: radial-gradient(60% 120% at 20% 50%, rgba(255,94,168,.55), transparent 60%), radial-gradient(60% 120% at 80% 40%, rgba(92,140,255,.55), transparent 60%), #0b0716; }
.nxp-sw { width: 100%; height: 46px; border-radius: 10px; position: relative; } .nxp-sw.nxp-card { border-radius: 10px; } .nxp-sw i { position: absolute; bottom: 7px; width: 12px; height: 12px; border-radius: 50%; } .nxp-sw i:first-child { left: 8px; } .nxp-sw i + i { left: 24px; }
.nxp-skin { width: 64px; height: 64px; }
/* 4.0.2 more frames */
.nxp-f-gold::after { box-shadow: 0 0 0 3px #d4af37, 0 0 10px rgba(212,175,55,.5); }
.nxp-f-frost::after { box-shadow: 0 0 0 2px #bfefff, 0 0 16px rgba(160,230,255,.8), inset 0 0 10px rgba(200,245,255,.6); border: 1px dashed rgba(255,255,255,.7); }
.nxp-f-sakura::after { box-shadow: 0 0 0 3px #ffb7d5, 0 0 12px rgba(255,140,190,.55); }
.nxp-petal { position: absolute; width: calc(var(--s) * .22); height: calc(var(--s) * .14); top: -4%; right: -4%; background: #ffc1dc; border-radius: 80% 0 80% 0; transform: rotate(-20deg); box-shadow: 0 0 6px rgba(255,150,200,.6); }
.nxp-petal.p2 { top: auto; right: auto; bottom: -2%; left: -6%; transform: rotate(140deg); background: #ff9ec7; }
.nxp-f-pulse::after { box-shadow: 0 0 0 2px #ff4d6d; animation: nxpBeat 1.4s ease-in-out infinite; }
@keyframes nxpBeat { 0%, 100% { box-shadow: 0 0 0 2px #ff4d6d, 0 0 6px rgba(255,77,109,.4); } 15% { box-shadow: 0 0 0 3px #ff4d6d, 0 0 18px rgba(255,77,109,.9); } 30% { box-shadow: 0 0 0 2px #ff4d6d, 0 0 8px rgba(255,77,109,.5); } 45% { box-shadow: 0 0 0 3px #ff4d6d, 0 0 16px rgba(255,77,109,.8); } }
.nxp-f-shadow::after { inset: -8px; background: radial-gradient(circle, transparent 58%, rgba(0,0,0,.85) 62%, rgba(60,30,90,.6) 70%, transparent 74%); filter: blur(1px); animation: nxpSpin 9s linear infinite; }
.nxp-f-galaxy::after { inset: -7px; background: conic-gradient(#2b1055, #7597de, #c56cd6, #2b1055, #3a86ff, #2b1055); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); animation: nxpSpin 7s linear infinite; box-shadow: 0 0 14px rgba(197,108,214,.5); }
.nxp-f-rgb::after { inset: -6px; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px)); animation: nxpSpin 3s linear infinite; filter: saturate(1.3) drop-shadow(0 0 4px rgba(255,255,255,.4)); }
/* more profile themes + banners */
.nxp-t-ocean { background: linear-gradient(165deg, #062a4a, #031322); border-color: rgba(79,179,255,.35); }
.nxp-t-ember { background: linear-gradient(165deg, #3a1206, #140603); border-color: rgba(255,122,61,.4); }
.nxp-b-sunset { background: linear-gradient(180deg, #ff9a5a, #ff5e8a 60%, #6a3093); }
.nxp-b-aurora { background: radial-gradient(80% 140% at 30% 120%, rgba(93,255,180,.7), transparent 60%), radial-gradient(70% 140% at 80% 110%, rgba(138,125,255,.7), transparent 60%), #050b14; }
.nxp-b-matrix { background: repeating-linear-gradient(90deg, rgba(61,255,160,.0) 0 6px, rgba(61,255,160,.35) 6px 7px), linear-gradient(180deg, #021a0e, #000); background-size: 7px 100%, 100% 100%; animation: nxpRain 4s linear infinite; }
@keyframes nxpRain { to { background-position: 0 40px, 0 0; } }
.nxp-sw-custom { display: grid; place-items: center; background: repeating-linear-gradient(45deg, rgba(255,255,255,.06) 0 8px, transparent 8px 16px); border: 1px dashed rgba(255,255,255,.3); } .nxp-sw-custom span { font-size: 10px; color: #c9d6e1; }
/* profile effects: drawn over the whole card, never block clicks */
.nxp-fx { position: absolute; inset: 0; pointer-events: none; z-index: 2; border-radius: inherit; }
.nxp-fx-sparkle { background-image: radial-gradient(2px 2px at 20% 30%, #fff, transparent), radial-gradient(1.5px 1.5px at 70% 20%, #fff8c4, transparent), radial-gradient(2px 2px at 85% 70%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 80%, #cdf, transparent), radial-gradient(2px 2px at 55% 50%, #fff, transparent); animation: nxpTwinkle 2.4s ease-in-out infinite alternate; }
@keyframes nxpTwinkle { from { opacity: .25; } to { opacity: 1; } }
.nxp-fx-snow { background-image: radial-gradient(2px 2px at 10% 10%, #fff, transparent), radial-gradient(2.5px 2.5px at 40% 30%, #eef, transparent), radial-gradient(1.5px 1.5px at 70% 15%, #fff, transparent), radial-gradient(2px 2px at 85% 45%, #fff, transparent), radial-gradient(1.5px 1.5px at 25% 60%, #fff, transparent); background-size: 100% 120px; animation: nxpFall 6s linear infinite; }
.nxp-fx-rain { background-image: linear-gradient(170deg, transparent 0 46%, rgba(160,200,255,.55) 48%, transparent 50%); background-size: 22px 40px; animation: nxpFall 0.9s linear infinite; opacity: .6; }
.nxp-fx-embers { background-image: radial-gradient(2px 2px at 15% 90%, #ffb347, transparent), radial-gradient(2px 2px at 45% 80%, #ff7a3d, transparent), radial-gradient(1.5px 1.5px at 75% 95%, #ffd27a, transparent), radial-gradient(2px 2px at 90% 85%, #ff5e3a, transparent); background-size: 100% 140px; animation: nxpRise 5s linear infinite; }
.nxp-fx-stars::before, .nxp-fx-stars::after { content: ''; position: absolute; top: 12%; left: -30%; width: 60px; height: 2px; background: linear-gradient(90deg, transparent, #fff); border-radius: 2px; animation: nxpShoot 4.5s ease-in infinite; transform: rotate(18deg); }
.nxp-fx-stars::after { top: 40%; animation-delay: 2.2s; }
@keyframes nxpFall { to { background-position: 0 120px; } } @keyframes nxpRise { to { background-position: 0 -140px; } }
@keyframes nxpShoot { 0% { left: -30%; opacity: 0; } 10% { opacity: 1; } 40% { left: 120%; opacity: 0; } 100% { left: 120%; opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .nxp-fx, .nxp-f-rgb::after, .nxp-f-galaxy::after, .nxp-f-pulse::after, .nxp-b-matrix { animation: none !important; } }`;
  const api = { CATALOG, KINDS, APP_THEMES, FONTS, COLORS, item, card, nameHtml, avatarHtml, swatch, CSS, key, HEX, SAFE_IMG, OWNER_ONLY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.NexusCosmetics = api;
    if (typeof document !== 'undefined' && !document.getElementById('nxp-css')) { const st = document.createElement('style'); st.id = 'nxp-css'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
