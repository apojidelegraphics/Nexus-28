/* Generated from the Nexus '28 Mac app by scripts/sync-companion.js — edit the original, not this copy. */
// Cosmetics (4.0): the Cirkts shop and how everything looks: profile frames, profile themes, app themes, name fonts, name
// colors, banners and orb skins, plus the profile card that shows them. One file for the app (main + windows), N28C and
// Test Run (npm run sync:companion copies it). Prices here mirror the cosmetics table in Supabase, which is what counts.
//   NexusCosmetics.CATALOG · .item(id) · .card(profile, { size }) → HTML · .nameHtml(name, style) · .avatarHtml(url, initial, frame, size) · .CSS
(function (root) {
  const C = [
    ['frame:neon', 'Neon ring', 150], ['frame:halo', 'Halo', 300], ['frame:circuit', 'Circuit', 500], ['frame:flame', 'Flame', 700], ['frame:crown', 'Gold crown', 900],
    ['frame:orbit', 'Orbit', 1200], ['frame:glitch', 'Glitch', 1500], ['frame:prism', 'Prism', 2000],
    ['ptheme:midnight', 'Midnight', 200], ['ptheme:sunset', 'Sunset', 300], ['ptheme:aurora', 'Aurora', 450], ['ptheme:sakura', 'Sakura', 450], ['ptheme:void', 'Void', 600], ['ptheme:circuit', 'Circuit board', 750],
    ['theme:sakura', 'Sakura', 600], ['theme:ocean', 'Midnight Ocean', 600], ['theme:ember', 'Ember', 700], ['theme:obsidian', 'Obsidian Gold', 800], ['theme:aurora', 'Aurora Borealis', 1000], ['theme:holo', 'Holo', 1500],
    ['font:mono', 'Terminal', 100], ['font:serif', 'Classic serif', 150], ['font:rounded', 'Rounded', 150], ['font:display', 'Display', 250], ['font:hand', 'Handwritten', 300], ['font:pixel', 'Pixel', 400],
    ['color:mint', 'Mint', 50], ['color:sky', 'Sky', 50], ['color:rose', 'Rose', 50], ['color:amber', 'Amber', 50], ['color:violet', 'Violet', 50],
    ['color:gold', 'Gold', 300], ['color:sunset', 'Sunset fade', 400], ['color:aurora', 'Aurora fade', 500], ['color:rainbow', 'Rainbow', 800],
    ['banner:grid', 'Grid', 200], ['banner:waves', 'Waves', 250], ['banner:stars', 'Starfield', 350], ['banner:topo', 'Topography', 350], ['banner:nebula', 'Nebula', 500],
    ['skin:reactor', 'Reactor', 100], ['skin:nebula', 'Nebula', 250], ['skin:pulse', 'Pulse', 500], ['skin:tide', 'Tide', 600], ['skin:prism', 'Prism', 750], ['skin:ember', 'Ember', 900], ['skin:pixel', 'Pixel', 1000],
    ['skin:vortex', 'Vortex', 1250], ['skin:crystal', 'Crystal', 1400], ['skin:eclipse', 'Eclipse', 1500], ['skin:circuit', 'Circuit', 1750], ['skin:overlord', 'Overlord', 2000], ['skin:quasar', 'Quasar', 2250],
    ['skin:solar', 'Solar', 2500], ['skin:glyph', 'Glyph', 2750], ['skin:hologram', 'Hologram', 3000]
  ];
  const CATALOG = C.map(([id, name, price], i) => ({ id, kind: id.split(':')[0], key: id.split(':')[1], name, price, sort: i }));
  const KINDS = [['frame', 'Frames'], ['ptheme', 'Profile themes'], ['theme', 'App themes'], ['font', 'Name fonts'], ['color', 'Name colors'], ['banner', 'Banners'], ['skin', 'Orb skins']];
  const item = id => CATALOG.find(x => x.id === id) || null;
  // app themes you can buy: CSS variables (the same shape as themes.css)
  const APP_THEMES = {
    sakura: { label: 'Sakura', accent: '#ff9ec7', accent2: '#ffd1e3', bg: '#1c0d16', text: '#fff0f6' },
    ocean: { label: 'Midnight Ocean', accent: '#4fb3ff', accent2: '#2ee6d6', bg: '#04101f', text: '#e2f2ff' },
    ember: { label: 'Ember', accent: '#ff7a3d', accent2: '#ffc65c', bg: '#170905', text: '#ffeee4' },
    obsidian: { label: 'Obsidian Gold', accent: '#e6c46a', accent2: '#fff1c2', bg: '#0b0a08', text: '#f6efdd' },
    aurora: { label: 'Aurora Borealis', accent: '#5dffb4', accent2: '#8a7dff', bg: '#050b14', text: '#e6fff5' },
    holo: { label: 'Holo', accent: '#9ff5ff', accent2: '#ff9cf0', bg: '#0a0c16', text: '#f4f8ff' }
  };
  const FONTS = { mono: "'SF Mono', ui-monospace, Menlo, Consolas, monospace", serif: "Georgia, 'Times New Roman', serif", rounded: "'SF Pro Rounded', 'Arial Rounded MT Bold', 'Nunito', system-ui, sans-serif",
    display: "'Avenir Next Condensed', 'Bahnschrift', 'Arial Narrow', system-ui, sans-serif", hand: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive", pixel: "'Silkscreen', 'Press Start 2P', ui-monospace, monospace" };   // single quotes inside: these go in a style="" attribute
  const COLORS = { mint: '#3dffa0', sky: '#5cc8ff', rose: '#ff8fb8', amber: '#ffc35c', violet: '#b18cff', gold: 'linear-gradient(90deg,#c9a227,#fff1a8,#c9a227)',
    sunset: 'linear-gradient(90deg,#ff7a59,#ffb36b,#ff5ea8)', aurora: 'linear-gradient(90deg,#5dffb4,#5cc8ff,#b18cff)', rainbow: 'linear-gradient(90deg,#ff5e5e,#ffb35c,#fff05c,#5dff9a,#5cc8ff,#b18cff,#ff5e5e)' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = id => String(id || '').split(':')[1] || '';
  function nameHtml(name, style = {}) {
    const f = FONTS[key(style.font)], c = COLORS[key(style.color)];
    const css = [f ? `font-family:${f}` : '', c ? (c.startsWith('linear') ? `background:${c};background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent` : `color:${c}`) : ''].filter(Boolean).join(';');
    return `<span class="nxp-name ${key(style.color) === 'rainbow' ? 'nxp-shimmer' : ''} ${key(style.font) === 'pixel' ? 'nxp-pixel' : ''}" style="${css}">${esc(name)}</span>`;
  }
  function avatarHtml(url, initial, frame, size = 64) {
    const fk = key(frame);
    return `<span class="nxp-av ${fk ? 'nxp-f-' + fk : ''}" style="--s:${size}px">${url ? `<img src="${esc(url)}" alt="">` : `<b>${esc(String(initial || '?').slice(0, 1).toUpperCase())}</b>`}${fk === 'crown' ? '<i class="nxp-crown"></i>' : ''}${fk === 'orbit' ? '<i class="nxp-orb"></i>' : ''}</span>`;
  }
  // profile: { username, nickname, avatar_url, owner, online, style: { frame, ptheme, font, color, banner, bio, status_text, stats } }
  function card(p = {}, { size = 'full', extra = '' } = {}) {
    const s = p.style || {}, name = p.nickname || p.username || 'Someone', st = s.stats || {};
    const stats = [[st.streak, 'day streak'], [st.achievements, 'achievements'], [st.chats, 'chats'], [st.cirkts, 'Cirkts']].filter(x => x[0] != null && x[0] !== '');
    return `<div class="nxp-card nxp-${size} ${s.ptheme ? 'nxp-t-' + key(s.ptheme) : ''}">
      <div class="nxp-banner ${s.banner ? 'nxp-b-' + key(s.banner) : ''}"></div>
      <div class="nxp-body">${avatarHtml(p.avatar_url, name, s.frame, size === 'mini' ? 40 : 72)}
        <div class="nxp-who">${nameHtml(name, s)}${p.owner ? '<span class="nxp-tag">OWNER</span>' : ''}<small>${p.username ? '@' + esc(p.username) : ''}${p.online ? ' · <i class="nxp-on"></i> online' : ''}</small>${s.status_text ? `<em>${esc(s.status_text)}</em>` : ''}</div></div>
      ${size !== 'mini' && s.bio ? `<p class="nxp-bio">${esc(s.bio)}</p>` : ''}
      ${size !== 'mini' && stats.length ? `<div class="nxp-stats">${stats.map(([v, l]) => `<div><b>${esc(Number(v).toLocaleString())}</b><span>${l}</span></div>`).join('')}</div>` : ''}${extra}</div>`;
  }
  // a little preview for a shop tile
  function swatch(it) {
    const k = it.key;
    if (it.kind === 'frame') return avatarHtml('', 'A', it.id, 46);
    if (it.kind === 'font') return nameHtml('Aa Nexus', { font: it.id });
    if (it.kind === 'color') return nameHtml('Nexus', { color: it.id, font: 'font:display' });
    if (it.kind === 'banner') return `<div class="nxp-sw nxp-banner nxp-b-${k}"></div>`;
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
.nxp-skin { width: 64px; height: 64px; }`;
  const api = { CATALOG, KINDS, APP_THEMES, FONTS, COLORS, item, card, nameHtml, avatarHtml, swatch, CSS, key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.NexusCosmetics = api;
    if (typeof document !== 'undefined' && !document.getElementById('nxp-css')) { const st = document.createElement('style'); st.id = 'nxp-css'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st); }
  }
})(typeof window !== 'undefined' ? window : globalThis);
