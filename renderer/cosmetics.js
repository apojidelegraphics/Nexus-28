// Cosmetics (4.0): the Cirkts shop and how everything looks: profile frames, profile themes, app themes, name fonts, name
// colors, banners and orb skins, plus the profile card that shows them. One file for the app (main + windows), N28C and
// Test Run (npm run sync:companion copies it). Prices here mirror the cosmetics table in Supabase, which is what counts.
//   NexusCosmetics.CATALOG · .item(id) · .card(profile, { size }) → HTML · .nameHtml(name, style) · .avatarHtml(url, initial, frame, size) · .CSS
(function (root) {
  const C = [
    ['frame:neon', 'Neon ring', 150], ['frame:halo', 'Halo', 300], ['frame:circuit', 'Circuit', 500], ['frame:flame', 'Flame', 700], ['frame:crown', 'Gold crown', 900],
    ['frame:orbit', 'Orbit', 1200], ['frame:glitch', 'Glitch', 1500], ['frame:prism', 'Prism', 2000],
    ['frame:gold', 'Gold ring', 600], ['frame:frost', 'Frost', 800], ['frame:sakura', 'Petals', 950], ['frame:pulse', 'Heartbeat', 1100], ['frame:shadow', 'Shadow', 1300], ['frame:galaxy', 'Galaxy', 1600], ['frame:rgb', 'Chroma', 2500],   // 4.0.2
    ['frame:storm', 'Storm', 1400], ['frame:vines', 'Overgrowth', 1000], ['frame:void', 'Event horizon', 2200], ['frame:hex', 'Hex shield', 1300], ['frame:pixel', '8-bit', 850], ['frame:aurora', 'Aurora', 1700],   // 4.0.4
    ['pframe:neon', 'Neon glow', 400], ['pframe:hud', 'HUD brackets', 500], ['pframe:gold', 'Gilded', 700], ['pframe:pixel', '8-bit', 600], ['pframe:frost', 'Frostbite', 650], ['pframe:flame', 'Ember', 800], ['pframe:holo', 'Holographic', 1100], ['pframe:circuit', 'Live circuit', 900], ['pframe:royal', 'Royal', 1000], ['pframe:void', 'Void pulse', 1200],
    ['ptheme:midnight', 'Midnight', 200], ['ptheme:sunset', 'Sunset', 300], ['ptheme:aurora', 'Aurora', 450], ['ptheme:sakura', 'Sakura', 450], ['ptheme:void', 'Void', 600], ['ptheme:circuit', 'Circuit board', 750], ['ptheme:ocean', 'Deep sea', 300], ['ptheme:ember', 'Embers', 400], ['ptheme:custom', 'Your own colors', 900],
    ['theme:sakura', 'Sakura', 600], ['theme:ocean', 'Midnight Ocean', 600], ['theme:ember', 'Ember', 700], ['theme:obsidian', 'Obsidian Gold', 800], ['theme:aurora', 'Aurora Borealis', 1000], ['theme:holo', 'Holo', 1500],
    ['theme:cyber', 'Cyberpunk', 650], ['theme:vapor', 'Vaporwave', 700], ['theme:bloodmoon', 'Blood Moon', 800], ['theme:emerald', 'Emerald City', 850], ['theme:royal', 'Royal', 1100], ['theme:toxic', 'Toxic', 1250],
    ['font:mono', 'Terminal', 100], ['font:serif', 'Classic serif', 150], ['font:rounded', 'Rounded', 150], ['font:display', 'Display', 250], ['font:hand', 'Handwritten', 300], ['font:pixel', 'Pixel', 400],
    ['color:mint', 'Mint', 50], ['color:sky', 'Sky', 50], ['color:rose', 'Rose', 50], ['color:amber', 'Amber', 50], ['color:violet', 'Violet', 50],
    ['color:gold', 'Gold', 300], ['color:sunset', 'Sunset fade', 400], ['color:aurora', 'Aurora fade', 500], ['color:rainbow', 'Rainbow', 800], ['color:custom', 'Your own color', 600],
    ['banner:grid', 'Grid', 200], ['banner:waves', 'Waves', 250], ['banner:stars', 'Starfield', 350], ['banner:topo', 'Topography', 350], ['banner:nebula', 'Nebula', 500], ['banner:sunset', 'Sunset', 300], ['banner:aurora', 'Aurora', 400], ['banner:matrix', 'Matrix', 600], ['banner:custom', 'Your own image', 1200],
    ['effect:sparkle', 'Sparkles', 700], ['effect:snow', 'Snowfall', 600], ['effect:rain', 'Rain', 650], ['effect:embers', 'Embers', 800], ['effect:stars', 'Shooting stars', 900],
    ['skin:reactor', 'Reactor', 100], ['skin:nebula', 'Nebula', 250], ['skin:pulse', 'Pulse', 500], ['skin:tide', 'Tide', 600], ['skin:prism', 'Prism', 750], ['skin:ember', 'Ember', 900], ['skin:pixel', 'Pixel', 1000],
    ['skin:vortex', 'Vortex', 1250], ['skin:crystal', 'Crystal', 1400], ['skin:eclipse', 'Eclipse', 1500], ['skin:circuit', 'Circuit', 1750], ['skin:overlord', 'Overlord', 2000], ['skin:quasar', 'Quasar', 2250],
    ['skin:solar', 'Solar', 2500], ['skin:glyph', 'Glyph', 2750], ['skin:hologram', 'Hologram', 3000],
    ['pframe:sakura', 'Blossom', 750], ['pframe:aurora', 'Aurora veil', 1100], ['ptheme:frost', 'Frozen', 350], ['effect:petals', 'Falling petals', 650],   // 4.0.6: so every set matches
    ['frame:mine', 'Make your own', 0], ['pframe:mine', 'Make your own', 0], ['effect:mine', 'Make your own', 0]   // 4.0.6 beta: built in the shop
  ];
  const BETA_ITEMS = new Set(['frame:mine', 'pframe:mine', 'effect:mine']);
  const OWNER_ONLY = new Set(['frame:crown']);   // 4.0.2: the crown is the Owner's alone (never sold)
  // 4.0.4: every free app theme is in the shop too (free), next to the ones you buy. [id, name, accent, accent2, bg]
  const FREE_THEMES = [
    ["green", "Nexus Green", "#3dffa0", "#00c27a", "#04100b"],
    ["arc", "Arc Reactor", "#5ce1ff", "#2a7dff", "#060e18"],
    ["critical", "Critical", "#ff4d5e", "#ff8a3d", "#140608"],
    ["amber", "LentOS Classic", "#ffb547", "#ff7b2e", "#120c04"],
    ["nebula", "Nebula", "#b18cff", "#ff6bd6", "#0e081a"],
    ["rose", "Rose Quartz", "#ff8fb8", "#ffc1a8", "#1a0a10"],
    ["glacier", "Glacier", "#9fe7ff", "#ffffff", "#0e1822"],
    ["graphite", "Graphite", "#d6dde6", "#8f9aa8", "#101113"],
    ["synthwave", "Synthwave", "#ff4fd8", "#36e6ff", "#12061e"],
    ["forest", "Deep Forest", "#9bd65c", "#e2c46a", "#0a1208"],
    ["lagoon", "Lagoon", "#2ee6c8", "#5cc8ff", "#041412"],
    ["sunflower", "Sunflower", "#ffd84d", "#ff9f43", "#141004"],
    ["lavender", "Lavender", "#c9a7ff", "#8fd3ff", "#100c1a"],
    ["coffee", "Coffee", "#d9a066", "#f2d0a4", "#140e09"],
    ["midnight", "Midnight", "#6f8cff", "#a3b8ff", "#060a1c"],
    ["cherry", "Cherry", "#ff5c8a", "#ffb3c7", "#17060c"]
  ];
  const CATALOG = [...C.map(([id, name, price], i) => ({ id, kind: id.split(':')[0], key: id.split(':')[1], name, price: OWNER_ONLY.has(id) ? 0 : price, sort: i, ...(OWNER_ONLY.has(id) ? { owner: true } : {}), ...(BETA_ITEMS.has(id) ? { beta: true } : {}) })),
    ...FREE_THEMES.map(([k, name], i) => ({ id: 'theme:' + k, kind: 'theme', key: k, name, price: 0, free: true, sort: -100 + i }))];
  const KINDS = [['pack', 'Sets'], ['frame', 'Picture frames'], ['pframe', 'Profile frames'], ['ptheme', 'Profile themes'], ['banner', 'Banners'], ['effect', 'Profile effects'], ['font', 'Name fonts'], ['color', 'Name colors'], ['theme', 'App themes'], ['skin', 'Orb skins']];
  const item = id => CATALOG.find(x => x.id === id) || null;
  // 4.0.6: sets. Everything in a set matches; buying the set gets what you don't have yet for 25% less, and "Use set" puts
  // all of it on in one go (orb skin and app theme too). The prices are worked out the same way in Supabase (cirkts_buy_pack).
  const PACKS = [
    { id: 'pack:ember', name: 'Ember', blurb: 'Glowing coals and rising sparks.', items: ['frame:flame', 'pframe:flame', 'ptheme:ember', 'effect:embers', 'banner:sunset', 'color:sunset', 'theme:ember', 'skin:ember'] },
    { id: 'pack:frost', name: 'Frost', blurb: 'Ice-blue and quiet snowfall.', items: ['frame:frost', 'pframe:frost', 'ptheme:frost', 'effect:snow', 'banner:waves', 'color:sky', 'theme:glacier', 'skin:crystal'] },
    { id: 'pack:neon', name: 'Neon', blurb: 'Bright lines on a dark grid.', items: ['frame:neon', 'pframe:neon', 'ptheme:circuit', 'effect:sparkle', 'banner:grid', 'color:mint', 'theme:cyber', 'skin:reactor'] },
    { id: 'pack:royal', name: 'Royal', blurb: 'Gold, violet and a serif name.', items: ['frame:gold', 'pframe:royal', 'ptheme:midnight', 'effect:stars', 'banner:stars', 'color:gold', 'font:serif', 'theme:royal'] },
    { id: 'pack:void', name: 'Void', blurb: 'Deep space with a dark pull.', items: ['frame:void', 'pframe:void', 'ptheme:void', 'effect:stars', 'banner:nebula', 'color:violet', 'theme:obsidian', 'skin:eclipse'] },
    { id: 'pack:aurora', name: 'Aurora', blurb: 'Northern lights, top to bottom.', items: ['frame:aurora', 'pframe:aurora', 'ptheme:aurora', 'effect:sparkle', 'banner:aurora', 'color:aurora', 'theme:aurora', 'skin:nebula'] },
    { id: 'pack:sakura', name: 'Sakura', blurb: 'Pink petals and handwriting.', items: ['frame:sakura', 'pframe:sakura', 'ptheme:sakura', 'effect:petals', 'banner:sunset', 'color:rose', 'font:hand', 'theme:sakura'] },
    { id: 'pack:arcade', name: 'Arcade', blurb: 'Pixels, rainbows and green screens.', items: ['frame:pixel', 'pframe:pixel', 'ptheme:circuit', 'effect:sparkle', 'banner:matrix', 'color:rainbow', 'font:pixel', 'theme:toxic', 'skin:pixel'] },
    { id: 'pack:circuit', name: 'Circuit', blurb: 'A HUD for your profile.', items: ['frame:circuit', 'pframe:hud', 'ptheme:ocean', 'effect:rain', 'banner:topo', 'color:sky', 'font:mono', 'theme:arc', 'skin:circuit'] }
  ];
  const PACK_OFF = 0.25;
  const pack = id => PACKS.find(p => p.id === id) || null;
  // what's left to buy in a set and what it costs: owns(id) says if you have something
  function packPrice(p, owns = () => false) {
    const left = p.items.map(item).filter(it => it && !it.free && it.price > 0 && !owns(it.id));
    const full = left.reduce((a, it) => a + it.price, 0);
    return { left: left.map(it => it.id), full, price: Math.round(full * (1 - PACK_OFF) / 10) * 10 };
  }
  // the profile part of a set, as a style (for previews and for "Use set")
  function packStyle(p) { const st = {}; for (const id of p.items) { const it = item(id); if (it && ['frame', 'pframe', 'ptheme', 'effect', 'banner', 'color', 'font'].includes(it.kind)) st[it.kind] = id; } return st; }
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
  for (const [k, label, accent, accent2, bg] of FREE_THEMES) APP_THEMES[k] = { label, accent, accent2, bg, free: true };
  // 4.0.4: the fonts ship with the app (fonts/ next to this file), so they look the same on every computer and phone
  const FONTS = { mono: "'SF Mono', ui-monospace, Menlo, Consolas, monospace", serif: "Georgia, 'Times New Roman', serif", rounded: "'NXP Rounded', 'Nunito', 'Arial Rounded MT Bold', system-ui, sans-serif",
    display: "'NXP Display', 'Oswald', 'Bahnschrift', 'Arial Narrow', sans-serif", hand: "'NXP Hand', 'Caveat', 'Segoe Print', cursive", pixel: "'NXP Pixel', 'Silkscreen', ui-monospace, monospace" };   // single quotes inside: these go in a style="" attribute
  const COLORS = { mint: '#3dffa0', sky: '#5cc8ff', rose: '#ff8fb8', amber: '#ffc35c', violet: '#b18cff', gold: 'linear-gradient(90deg,#c9a227,#fff1a8,#c9a227)',
    sunset: 'linear-gradient(90deg,#ff7a59,#ffb36b,#ff5ea8)', aurora: 'linear-gradient(90deg,#5dffb4,#5cc8ff,#b18cff)', rainbow: 'linear-gradient(90deg,#ff5e5e,#ffb35c,#fff05c,#5dff9a,#5cc8ff,#b18cff,#ff5e5e)' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = id => String(id || '').split(':')[1] || '';
  const HEX = /^#[0-9a-f]{6}$/i, SAFE_IMG = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/banner\.(webp|png|jpe?g|gif)(\?v=\d+)?$/i;
  // 4.0.6 beta: things you make yourself. Everything is checked here before it's drawn, because other people's
  // computers draw your profile too: colors must be #rrggbb, everything else comes from short fixed lists.
  const pick = (v, list, d) => list.includes(v) ? v : d, num = (v, lo, hi, d) => { const n = Math.round(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; }, hex = (v, d) => HEX.test(v || '') ? v : d;
  const SAFE_MINE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/avatars\/[0-9a-f-]{36}\/(frame|overlay)\.(webp|png|gif)(\?v=\d+)?$/i;
  const MINE = { frame: ['ring', 'double', 'dashed', 'glow', 'image'], pframe: ['gradient', 'double', 'corners', 'glow', 'image'], effect: ['dots', 'stars', 'hearts', 'squares', 'lines'], anim: ['none', 'spin', 'pulse', 'flow'], dir: ['up', 'down', 'float'] };
  function cleanCustom(c) {
    c = c && typeof c === 'object' ? c : {};
    const f = c.frame || {}, p = c.pframe || {}, e = c.effect || {};
    return {
      frame: { style: pick(f.style, MINE.frame, 'ring'), a: hex(f.a, '#3dffa0'), b: hex(f.b, '#5cc8ff'), width: num(f.width, 1, 5, 3), glow: num(f.glow, 0, 3, 1), anim: pick(f.anim, MINE.anim, 'spin'), speed: num(f.speed, 1, 3, 2) },
      pframe: { style: pick(p.style, MINE.pframe, 'gradient'), a: hex(p.a, '#3dffa0'), b: hex(p.b, '#b18cff'), glow: num(p.glow, 0, 3, 1), anim: pick(p.anim, MINE.anim, 'flow'), speed: num(p.speed, 1, 3, 2) },
      effect: { shape: pick(e.shape, MINE.effect, 'stars'), a: hex(e.a, '#ffffff'), b: hex(e.b, '#3dffa0'), dir: pick(e.dir, MINE.dir, 'up'), amount: num(e.amount, 1, 3, 2), speed: num(e.speed, 1, 3, 2) }
    };
  }
  const mineVars = o => `--ca:${o.a};--cb:${o.b};--cw:${o.width || 2};--cg:${o.glow};--cd:${(7 - (o.speed || 2) * 2)}s`;
  function effectTile(e) {   // a 120px tile of shapes as an SVG picture (colors are checked, so it's safe in a style="")
    const P = [[12, 18], [64, 8], [100, 34], [30, 58], [82, 70], [8, 96], [52, 104], [108, 108], [44, 30], [92, 92], [20, 80], [70, 44]].slice(0, e.amount * 4);
    const shape = (x, y, i) => { const c = i % 2 ? e.b : e.a, r = 2 + (i % 3) * .8;
      if (e.shape === 'dots') return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`;
      if (e.shape === 'squares') return `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="${c}" transform="rotate(${i * 25} ${x} ${y})"/>`;
      if (e.shape === 'lines') return `<rect x="${x}" y="${y - 6}" width="1.4" height="${10 + r * 2}" rx=".7" fill="${c}"/>`;
      if (e.shape === 'hearts') return `<path d="M${x} ${y + r * 1.4}l-${r * 1.5}-${r * 1.5}a${r * .8} ${r * .8} 0 0 1 ${r * 1.5}-${r * 1.2}a${r * .8} ${r * .8} 0 0 1 ${r * 1.5} ${r * 1.2}z" fill="${c}"/>`;
      return `<path d="M${x} ${y - r * 1.8}L${x + r * .5} ${y - r * .5}L${x + r * 1.8} ${y}L${x + r * .5} ${y + r * .5}L${x} ${y + r * 1.8}L${x - r * .5} ${y + r * .5}L${x - r * 1.8} ${y}L${x - r * .5} ${y - r * .5}Z" fill="${c}"/>`; };
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">${P.map(([x, y], i) => shape(x, y, i)).join('')}</svg>`);
  }
  function fxHtml(fx, s) {
    if (fx !== 'mine') return `<i class="nxp-fx nxp-fx-${esc(fx)}"></i>`;
    const e = cleanCustom(s.custom).effect;
    return `<i class="nxp-fx nxp-fx-mine nxp-fd-${e.dir}" style="background-image:url('${effectTile(e)}');--cd:${(9 - e.speed * 2)}s"></i>`;
  }
  function pfxHtml(pf, s, self) {
    if (pf !== 'mine') return '<i class="nxp-pfx"></i>';
    const p = cleanCustom(s.custom).pframe;
    if (p.style === 'image') { const u = SAFE_MINE.test(s.overlay_img || '') ? s.overlay_img : self && SAFE_MINE.test(s.overlay_pending || '') ? s.overlay_pending : ''; return u ? `<img class="nxp-oimg" src="${esc(u)}" alt="">` : '<i class="nxp-pfx"></i>'; }
    return `<i class="nxp-pfx nxp-pm-${p.style} nxp-ma-${p.anim}" style="${mineVars(p)}"></i>`;
  }
  const PRES = { online: ['online', '#3dff9a'], idle: ['idle', '#ffc35c'], dnd: ['do not disturb', '#ff5a6e'], invisible: ['invisible', '#8a95a3'] };
  function nameColor(style) {
    if (key(style.color) === 'custom' && HEX.test(style.name_a || '')) { const b = HEX.test(style.name_b || '') && style.name_b.toLowerCase() !== style.name_a.toLowerCase() ? style.name_b : ''; return b ? `linear-gradient(90deg,${style.name_a},${b},${style.name_a})` : style.name_a; }
    return COLORS[key(style.color)];
  }
  function nameHtml(name, style = {}) {
    const f = FONTS[key(style.font)], c = nameColor(style);
    const css = [f ? `font-family:${f}` : '', c ? (c.startsWith('linear') ? `background:${c};background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent` : `color:${c}`) : ''].filter(Boolean).join(';');
    return `<span class="nxp-name ${key(style.color) === 'rainbow' || (c || '').startsWith('linear') && key(style.color) === 'custom' ? 'nxp-shimmer' : ''} ${key(style.font) ? 'nxp-font-' + key(style.font) : ''}" style="${css}">${esc(name)}</span>`;
  }
  const CROWN = '<svg viewBox="0 0 64 40" aria-hidden="true"><defs><linearGradient id="nxpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b8"/><stop offset=".55" stop-color="#e6b93a"/><stop offset="1" stop-color="#a87412"/></linearGradient></defs><path d="M4 36 L2 10 L18 22 L32 2 L46 22 L62 10 L60 36 Z" fill="url(#nxpg)" stroke="#7a5208" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="24" r="4" fill="#ff4d6d"/><circle cx="17" cy="28" r="3" fill="#5cc8ff"/><circle cx="47" cy="28" r="3" fill="#3dffa0"/><rect x="4" y="32" width="56" height="5" rx="2" fill="#c9971f"/></svg>';
  // 4.0.4: frames are drawn in layers around the picture (::before/::after + a couple of extra pieces)
  function avatarHtml(url, initial, frame, size = 64, { crown = false, pres = '', custom = null, frameImg = '' } = {}) {
    const fk = key(frame);
    let mine = '', mineCls = '';
    if (fk === 'mine') { const f = cleanCustom(custom).frame; if (f.style === 'image') { if (SAFE_MINE.test(frameImg || '')) mine = `<img class="nxp-fimg" src="${esc(frameImg)}" alt="">`; mineCls = ' nxp-fm-image'; } else mineCls = ` nxp-fm-${f.style} nxp-ma-${f.anim}`; }
    const mineStyle = fk === 'mine' ? ';' + mineVars(cleanCustom(custom).frame) : '';
    const extra = { orbit: '<i class="nxp-orb"></i><i class="nxp-orb o2"></i>', sakura: '<i class="nxp-petal"></i><i class="nxp-petal p2"></i><i class="nxp-petal p3"></i>', galaxy: '<i class="nxp-stars"></i>', storm: '<i class="nxp-bolt"></i>', vines: '<i class="nxp-leaf"></i><i class="nxp-leaf l2"></i><i class="nxp-leaf l3"></i>', flame: '<i class="nxp-tongues"></i>', pulse: '<i class="nxp-ripple"></i>' }[fk] || '';
    return `<span class="nxp-av ${fk ? 'nxp-f-' + fk : ''}${mineCls}" style="--s:${size}px${mineStyle}">${extra}${url ? `<img src="${esc(url)}" alt="">` : `<b>${esc(String(initial || '?').slice(0, 1).toUpperCase())}</b>`}${mine}${fk === 'crown' || crown ? `<i class="nxp-crown">${CROWN}</i>` : ''}${pres && PRES[pres] ? `<i class="nxp-pres nxp-p-${pres}" title="${PRES[pres][0]}"></i>` : ''}</span>`;
  }
  // profile: { username, nickname, avatar_url, owner, online, self, style: { display_name, frame, pframe, ptheme, font, color, name_a, name_b, banner, banner_url, theme_a, theme_b, effect, presence, pronouns, bio, status_text, stats } }
  function card(p = {}, { size = 'full', extra = '' } = {}) {
    const s = p.style || {}, name = s.display_name || p.display_name || p.nickname || p.username || 'Someone', st = s.stats || {};
    const stats = [[st.streak, 'day streak'], [st.achievements, 'achievements'], [st.chats, 'chats'], [st.cirkts, 'Cirkts']].filter(x => x[0] != null && x[0] !== '');
    const bannerUrl = key(s.banner) === 'custom' && SAFE_IMG.test(s.banner_url || '') ? s.banner_url : '';
    const custom = key(s.ptheme) === 'custom' && HEX.test(s.theme_a || '') && HEX.test(s.theme_b || '') ? `background:linear-gradient(165deg,${s.theme_a},${s.theme_b});border-color:${s.theme_a}` : '';
    const fx = key(s.effect), pf = key(s.pframe);
    // status: what you picked, shown only while you're actually around; invisible looks offline to others
    let pres = p.online ? (PRES[s.presence] ? s.presence : 'online') : '';
    if (pres === 'invisible' && !p.self) pres = '';
    return `<div class="nxp-card nxp-${size} ${s.ptheme && !custom ? 'nxp-t-' + key(s.ptheme) : ''} ${pf ? 'nxp-pf nxp-pf-' + esc(pf) : ''}" ${custom ? `style="${custom}"` : ''}>${fx && size !== 'mini' ? fxHtml(fx, s) : ''}${pf ? '<i class="nxp-pfg"></i>' + pfxHtml(pf, s, p.self) : ''}
      <div class="nxp-banner ${s.banner && !bannerUrl ? 'nxp-b-' + key(s.banner) : ''}" ${bannerUrl ? `style="background:url('${esc(bannerUrl).replace(/[()]/g, '')}') center/cover"` : ''}></div>
      <div class="nxp-body">${avatarHtml(p.avatar_url, name, s.frame, size === 'mini' ? 40 : 72, { crown: !!p.owner, pres, custom: s.custom, frameImg: s.frame_img || (p.self ? s.frame_pending : '') })}
        <div class="nxp-who">${nameHtml(name, s)}${p.owner ? '<span class="nxp-tag">OWNER</span>' : ''}<small>${p.username ? '@' + esc(p.username) : ''}${s.pronouns ? ' · ' + esc(s.pronouns) : ''}${pres ? ` · <i class="nxp-on nxp-p-${pres}"></i> ${PRES[pres][0]}` : ''}</small>${s.status_text ? `<em>${esc(s.status_text)}</em>` : ''}</div></div>
      ${size !== 'mini' && s.bio ? `<p class="nxp-bio">${esc(s.bio)}</p>` : ''}
      ${size !== 'mini' && stats.length ? `<div class="nxp-stats">${stats.map(([v, l]) => `<div><b>${esc(Number(v).toLocaleString())}</b><span>${l}</span></div>`).join('')}</div>` : ''}${extra}</div>`;
  }
  // a little preview for a shop tile
  function swatch(it, opts = {}) {
    const k = it.key;
    if (it.kind === 'frame') return avatarHtml('', 'A', it.id, 46, { custom: opts.custom, frameImg: opts.frameImg });
    if (it.kind === 'pframe') return `<div class="nxp-sw nxp-card nxp-pf nxp-pf-${k}" style="height:52px;background:#0d151c"><i class="nxp-pfg"></i>${pfxHtml(k, { custom: opts.custom, overlay_img: opts.overlayImg }, true)}</div>`;
    if (it.kind === 'effect' && k === 'mine') return `<div class="nxp-sw nxp-card" style="background:#0b1218">${fxHtml('mine', { custom: opts.custom })}</div>`;
    if (it.kind === 'font') return nameHtml('Aa Nexus', { font: it.id });
    if (it.kind === 'color') return k === 'custom' ? nameHtml('Nexus', { color: 'color:custom', name_a: '#ff5ea8', name_b: '#5cc8ff', font: 'font:display' }) : nameHtml('Nexus', { color: it.id, font: 'font:display' });
    if (it.kind === 'banner') return k === 'custom' ? `<div class="nxp-sw nxp-sw-custom"><span>Your image</span></div>` : `<div class="nxp-sw nxp-banner nxp-b-${k}"></div>`;
    if (it.kind === 'effect') return `<div class="nxp-sw nxp-card" style="background:#0b1218"><i class="nxp-fx nxp-fx-${k}"></i></div>`;
    if (it.kind === 'ptheme' && k === 'custom') return `<div class="nxp-sw" style="background:linear-gradient(135deg,#ff5ea8,#5cc8ff 60%,#3dffa0)"></div>`;
    if (it.kind === 'ptheme') return `<div class="nxp-sw nxp-card nxp-t-${k}"></div>`;
    if (it.kind === 'theme') { const t = APP_THEMES[k] || {}; return `<div class="nxp-sw" style="background:linear-gradient(135deg,${t.bg} 40%,${t.accent} 140%);border:1px solid ${t.accent}"><i style="background:${t.accent}"></i><i style="background:${t.accent2}"></i></div>`; }
    if (it.kind === 'skin') return `<canvas class="nxp-skin" data-skin="${esc(k)}" width="92" height="92"></canvas>`;
    return '';
  }
  // a set's tile: a little profile card wearing the whole set
  function packSwatch(p, who = {}) {
    const st = packStyle(p), th = APP_THEMES[key(p.items.find(i => i.startsWith('theme:')))] || {};
    return `<div class="nxp-pack" style="--pa:${th.accent || '#3dffa0'};--pb:${th.bg || '#05090a'}">${card({ username: who.username || '', nickname: who.name || 'You', avatar_url: who.avatar_url || '', style: { ...st, status_text: p.blurb } }, { size: 'mini' })}</div>`;
  }
  // 4.0.6: the extra things friends see on your profile (member since, where you use Nexus, favorite agent, badges,
  // friends you share, Spaces you're both in). more = profile_card's "more".
  const AGO = t => { const d = (Date.now() - new Date(t)) / 864e5; return d < 1 ? 'today' : d < 2 ? 'yesterday' : d < 30 ? Math.floor(d) + ' days ago' : new Date(t).toLocaleDateString([], { month: 'short', year: 'numeric' }); };
  const SURF = { mac: 'Mac', windows: 'Windows PC', linux: 'Linux', phone: 'N28C', test_run: 'Test Run', admin: 'Apoji Admin' };
  function detailsHtml(p = {}) {
    const m = p.more || {}, x = (p.style || {}).extra || {}, rows = [];
    if (m.since) rows.push(['Member since', new Date(m.since).toLocaleDateString([], { month: 'long', year: 'numeric' })]);
    if (!p.online && m.last_seen) rows.push(['Last seen', AGO(m.last_seen)]);
    if (Array.isArray(m.active_on) && m.active_on.length) rows.push(['Uses Nexus on', m.active_on.map(s => SURF[s] || s).join(', ')]);
    if (x.fav_agent) rows.push(['Favorite agent', String(x.fav_agent)]);
    if (x.chats) rows.push(['Chats', Number(x.chats).toLocaleString()]);
    if (x.best) rows.push(['Best streak', Number(x.best).toLocaleString() + ' days']);
    if (m.friends != null) rows.push(['Friends', Number(m.friends).toLocaleString() + (m.mutual ? ` · ${m.mutual} you both know` : '')]);
    if (Array.isArray(m.spaces) && m.spaces.length) rows.push(['Spaces you share', m.spaces.map(String).join(', ')]);
    const badges = Array.isArray(x.badges) ? x.badges.slice(0, 8) : [];
    if (!rows.length && !badges.length) return '';
    return `<div class="nxp-more">${rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}
      ${badges.length ? `<div class="nxp-badges">${badges.map(b => `<i>${esc(String(b).slice(0, 28))}</i>`).join('')}</div>` : ''}</div>`;
  }
  const OLD_CSS = `
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
@keyframes nxpSpin { to { transform: rotate(360deg); } }
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
  const FONT_CSS = base => ['Pixel:nxp-pixel', 'Hand:nxp-hand', 'Rounded:nxp-rounded', 'Display:nxp-display'].map(x => { const [n, f] = x.split(':'); return `@font-face { font-family: 'NXP ${n}'; src: url("${String(base).replace(/["'()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))}${f}.woff2") format('woff2'); font-display: swap; }`; }).join('\n');
  const NEW_CSS = `
/* ===== 4.0.4 picture frames, rebuilt. Layers: .nxp-av::before (behind, glow), ::after (the ring), plus a few extra
   pieces (orbiting moons, petals, leaves, sparks). The picture sits on top, so behind-layers only show around it. ===== */
.nxp-av { isolation: isolate; }
.nxp-av { background: transparent !important; border: 0 !important; }
.nxp-av > img, .nxp-av > b { position: relative; z-index: 1; width: 100%; height: 100%; border-radius: 50%; box-shadow: 0 0 0 3px #0c141a; background: #1b2a33; display: grid; place-items: center; box-sizing: border-box; }
.nxp-av > img { object-fit: cover; display: block; }
.nxp-av::before { content: ''; position: absolute; inset: -6px; border-radius: 50%; pointer-events: none; z-index: -1; }
.nxp-av::after { z-index: 2; }
.nxp-av > i:not(.nxp-crown):not(.nxp-pres) { position: absolute; pointer-events: none; }
.nxp-ring, [class*="nxp-f-"]::after { --rw: 3px; }
@keyframes nxpSpin { to { transform: rotate(360deg); } }
@keyframes nxpSpinR { to { transform: rotate(-360deg); } }
/* Neon: a flickering tube light */
.nxp-f-neon::after { inset: -5px; border: 2.5px solid #7dffc4; box-shadow: 0 0 6px #3dffa0, 0 0 14px #3dffa0, inset 0 0 8px rgba(61,255,160,.7); animation: nxpFlick 4s steps(1) infinite; }
.nxp-f-neon::before { inset: -12px; background: radial-gradient(circle, rgba(61,255,160,.45) 45%, transparent 70%); filter: blur(4px); }
@keyframes nxpFlick { 0%, 18%, 22%, 60%, 100% { opacity: 1; } 19%, 21% { opacity: .35; } 61% { opacity: .7; } }
/* Halo: a thin white ring with a sweeping light */
.nxp-f-halo::after { inset: -5px; border: 1.5px solid rgba(255,255,255,.55); background: conic-gradient(from 0deg, transparent 0 70%, rgba(255,255,255,.95) 88%, transparent 92%) border-box; -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); animation: nxpSpin 3.2s linear infinite; }
.nxp-f-halo::before { inset: -10px; background: radial-gradient(circle, rgba(255,255,255,.35) 50%, transparent 72%); filter: blur(3px); }
/* Circuit: segmented ring with traveling light + nodes */
.nxp-f-circuit::after { inset: -6px; background: repeating-conic-gradient(#5cc8ff 0 18deg, transparent 18deg 24deg, #2a7dff 24deg 34deg, transparent 34deg 45deg); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); filter: drop-shadow(0 0 4px #5cc8ff); animation: nxpSpin 12s linear infinite; }
.nxp-f-circuit::before { inset: -11px; background: radial-gradient(circle at 50% 3%, #9fe7ff 0 3px, transparent 4px), radial-gradient(circle at 97% 50%, #9fe7ff 0 3px, transparent 4px), radial-gradient(circle at 50% 97%, #9fe7ff 0 3px, transparent 4px), radial-gradient(circle at 3% 50%, #9fe7ff 0 3px, transparent 4px); animation: nxpSpinR 8s linear infinite; filter: drop-shadow(0 0 4px #5cc8ff); }
/* Flame: a hot ring with flickering tongues of fire around it */
.nxp-f-flame::after { inset: -5px; background: conic-gradient(#ff3d00, #ffb300, #ff6d00, #ffd54f, #ff3d00); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); animation: nxpSpin 3s linear infinite; }
.nxp-f-flame::before { inset: -10px; background: radial-gradient(circle, rgba(255,120,0,.7) 50%, transparent 70%); filter: blur(5px); animation: nxpHeat 1.6s ease-in-out infinite alternate; }
.nxp-tongues { inset: -14%; border-radius: 50%; z-index: 0; background: repeating-conic-gradient(from 0deg, rgba(255,214,0,.95) 0 5deg, rgba(255,90,0,.85) 5deg 9deg, transparent 9deg 20deg); -webkit-mask: radial-gradient(farthest-side, transparent 62%, #000 70%, transparent 100%); mask: radial-gradient(farthest-side, transparent 62%, #000 70%, transparent 100%); filter: blur(1.2px); animation: nxpSpin 7s linear infinite, nxpHeat .5s ease-in-out infinite alternate; }
@keyframes nxpHeat { from { opacity: .7; transform: scale(.97); } to { opacity: 1; transform: scale(1.04); } }
/* Gold crown (Owner only): polished double gold ring with gems */
.nxp-f-crown::after { inset: -6px; border: 3px solid transparent; background: conic-gradient(from 20deg, #a87412, #fff4b8, #e6b93a, #a87412, #ffe9a0, #c9971f, #a87412) border-box; -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); }
.nxp-f-crown::before { inset: -10px; background: radial-gradient(circle at 50% 100%, #ff4d6d 0 3px, transparent 4px), radial-gradient(circle at 0% 50%, #5cc8ff 0 3px, transparent 4px), radial-gradient(circle at 100% 50%, #3dffa0 0 3px, transparent 4px), radial-gradient(circle, rgba(230,185,58,.4) 52%, transparent 72%); }
.nxp-crown { position: absolute; z-index: 4; left: 14.6%; top: 14.6%; width: calc(var(--s) * .5); transform: translate(-62%, -80%) rotate(-28deg); filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); pointer-events: none; line-height: 0; }
.nxp-crown svg { width: 100%; height: auto; display: block; }
/* Orbit: two moons on tilted orbits */
.nxp-f-orbit::after { inset: -9px; border: 1px solid rgba(177,140,255,.55); box-shadow: 0 0 10px rgba(177,140,255,.35); }
.nxp-orb { inset: -9px; border-radius: 50%; z-index: 3; animation: nxpSpin 3.2s linear infinite; }
.nxp-orb::before { content: ''; position: absolute; top: -4px; left: calc(50% - 4px); width: 8px; height: 8px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff, #b18cff); box-shadow: 0 0 10px #b18cff; }
.nxp-orb.o2 { inset: -4px; animation: nxpSpinR 5s linear infinite; } .nxp-orb.o2::before { width: 5px; height: 5px; top: -3px; left: calc(50% - 2.5px); background: #8fe7ff; box-shadow: 0 0 8px #5cc8ff; }
/* Glitch: an RGB-split ring that tears */
.nxp-f-glitch::after { inset: -5px; border: 2.5px solid #fff; box-shadow: -3px 0 0 0 #ff2bd6, 3px 0 0 0 #2be8ff, 0 0 10px rgba(255,43,214,.5); animation: nxpTear 2.4s steps(1) infinite; }
.nxp-f-glitch::before { inset: -6px; background: repeating-linear-gradient(0deg, rgba(43,232,255,.35) 0 2px, transparent 2px 5px); animation: nxpScan 1.2s linear infinite; -webkit-mask: radial-gradient(farthest-side, transparent 80%, #000 86%); mask: radial-gradient(farthest-side, transparent 80%, #000 86%); }
@keyframes nxpTear { 0%, 88% { transform: none; clip-path: none; } 90% { transform: translate(3px, -1px); clip-path: inset(10% 0 55% 0); } 92% { transform: translate(-3px, 1px); clip-path: inset(50% 0 10% 0); } 94% { transform: none; clip-path: none; } }
@keyframes nxpScan { to { background-position: 0 10px; } }
/* Prism: a rainbow ring with a soft rainbow glow */
.nxp-f-prism::after { inset: -6px; background: conic-gradient(#ff5e5e, #ffb35c, #fff05c, #5dff9a, #5cc8ff, #b18cff, #ff5e5e); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); animation: nxpSpin 5s linear infinite; }
.nxp-f-prism::before { inset: -12px; background: conic-gradient(#ff5e5e, #ffb35c, #fff05c, #5dff9a, #5cc8ff, #b18cff, #ff5e5e); filter: blur(8px); opacity: .55; animation: nxpSpin 5s linear infinite; }
/* Gold ring: brushed metal with a moving shine */
.nxp-f-gold::after { inset: -5px; background: conic-gradient(from 0deg, #8a6a12, #f6e27a, #b8901f, #fff6c8, #9c7a18, #e8c860, #8a6a12); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px)); animation: nxpSpin 9s linear infinite; }
.nxp-f-gold::before { inset: -9px; background: radial-gradient(circle, rgba(246,226,122,.35) 55%, transparent 72%); }
/* Frost: ice crystals growing out of the ring */
.nxp-f-frost::after { inset: -5px; border: 2px solid #dff7ff; box-shadow: 0 0 10px rgba(160,230,255,.9), inset 0 0 6px rgba(200,245,255,.6); }
.nxp-f-frost::before { inset: -13px; background: repeating-conic-gradient(from 4deg, rgba(220,248,255,.95) 0 2deg, transparent 2deg 15deg); -webkit-mask: radial-gradient(farthest-side, transparent 64%, #000 66%, transparent 100%); mask: radial-gradient(farthest-side, transparent 64%, #000 66%, transparent 100%); animation: nxpSpin 40s linear infinite; filter: drop-shadow(0 0 3px #9fe7ff); }
/* Petals: a pink ring with petals drifting around it */
.nxp-f-sakura::after { inset: -5px; border: 2.5px solid #ffb7d5; box-shadow: 0 0 12px rgba(255,140,190,.55); }
.nxp-petal { z-index: 3; width: calc(var(--s) * .2); height: calc(var(--s) * .13); top: -6%; right: -2%; background: radial-gradient(circle at 30% 30%, #fff0f6, #ff9ec7); border-radius: 80% 0 80% 0; animation: nxpDrift 4s ease-in-out infinite; }
.nxp-petal.p2 { top: auto; right: auto; bottom: -4%; left: -4%; animation-delay: -1.3s; } .nxp-petal.p3 { top: 40%; right: auto; left: -12%; width: calc(var(--s) * .14); height: calc(var(--s) * .09); animation-delay: -2.6s; }
@keyframes nxpDrift { 0%, 100% { transform: rotate(-20deg) translate(0, 0); } 50% { transform: rotate(25deg) translate(3px, 4px); } }
/* Heartbeat: a red ring that beats, with a ripple */
.nxp-f-pulse::after { inset: -5px; border: 2.5px solid #ff4d6d; animation: nxpBeat 1.3s ease-in-out infinite; }
.nxp-ripple { inset: -5px; border-radius: 50%; border: 2px solid #ff4d6d; z-index: 0; animation: nxpRipple 1.3s ease-out infinite; }
@keyframes nxpBeat { 0%, 100% { transform: scale(1); box-shadow: 0 0 6px rgba(255,77,109,.4); } 14% { transform: scale(1.06); box-shadow: 0 0 18px rgba(255,77,109,.9); } 28% { transform: scale(1); } 42% { transform: scale(1.04); box-shadow: 0 0 14px rgba(255,77,109,.8); } }
@keyframes nxpRipple { from { transform: scale(1); opacity: .8; } to { transform: scale(1.35); opacity: 0; } }
/* Shadow: dark smoke curling around the picture */
.nxp-f-shadow::before { inset: -14px; background: conic-gradient(from 0deg, transparent, rgba(40,10,70,.95), transparent 35%, rgba(0,0,0,.95), transparent 70%, rgba(80,30,120,.8), transparent); filter: blur(5px); animation: nxpSpin 6s linear infinite; }
.nxp-f-shadow::after { inset: -6px; background: conic-gradient(from 180deg, #1a0b2e, #6b3fa0, #000, #3d1f66, #1a0b2e); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); animation: nxpSpinR 4s linear infinite; }
/* Galaxy: a nebula ring with twinkling stars */
.nxp-f-galaxy::after { inset: -6px; background: conic-gradient(#2b1055, #7597de, #c56cd6, #2b1055, #3a86ff, #2b1055); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px)); animation: nxpSpin 7s linear infinite; box-shadow: 0 0 14px rgba(197,108,214,.5); }
.nxp-f-galaxy::before { inset: -12px; background: radial-gradient(circle, rgba(117,151,222,.5) 50%, transparent 72%); filter: blur(4px); }
.nxp-stars { inset: -13px; border-radius: 50%; z-index: 3; background: radial-gradient(1.5px 1.5px at 10% 30%, #fff, transparent), radial-gradient(1px 1px at 85% 15%, #fff, transparent), radial-gradient(2px 2px at 92% 70%, #e8d8ff, transparent), radial-gradient(1.5px 1.5px at 20% 90%, #fff, transparent), radial-gradient(1px 1px at 50% 2%, #fff, transparent); animation: nxpTwinkle 1.8s ease-in-out infinite alternate, nxpSpin 30s linear infinite; }
/* Chroma: a fast RGB ring */
.nxp-f-rgb::after { inset: -6px; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px)); animation: nxpSpin 2.4s linear infinite; }
.nxp-f-rgb::before { inset: -11px; background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red); filter: blur(7px); opacity: .6; animation: nxpSpin 2.4s linear infinite; }
/* Storm: electric ring with lightning flashes */
.nxp-f-storm::after { inset: -5px; border: 2px solid #9fd8ff; box-shadow: 0 0 8px #5cc8ff, 0 0 18px rgba(92,140,255,.6); animation: nxpZap 2.2s steps(1) infinite; }
.nxp-f-storm::before { inset: -12px; background: conic-gradient(from 0deg, transparent 0 10%, rgba(180,230,255,.95) 11% 12%, transparent 13% 45%, rgba(180,230,255,.95) 46% 47%, transparent 48% 78%, rgba(180,230,255,.9) 79% 80%, transparent 81%); -webkit-mask: radial-gradient(farthest-side, transparent 66%, #000 70%, transparent 100%); mask: radial-gradient(farthest-side, transparent 66%, #000 70%, transparent 100%); animation: nxpSpin 1.1s steps(8) infinite; filter: drop-shadow(0 0 4px #9fd8ff); }
.nxp-bolt { inset: -12px; border-radius: 50%; z-index: 3; background: radial-gradient(circle at 85% 20%, rgba(255,255,255,.9) 0 2px, transparent 3px); animation: nxpZap 1.7s steps(1) infinite; }
@keyframes nxpZap { 0%, 40%, 44%, 100% { opacity: 1; } 42%, 70% { opacity: .35; } 72% { opacity: 1; } }
/* Overgrowth: a living ring with leaves */
.nxp-f-vines::after { inset: -5px; border: 3px solid #3f8f3a; box-shadow: inset 0 0 0 1px #6fcf5a, 0 0 8px rgba(111,207,90,.45); }
.nxp-leaf { z-index: 3; width: calc(var(--s) * .2); height: calc(var(--s) * .12); background: linear-gradient(135deg, #b6f08a, #3f8f3a); border-radius: 0 100% 0 100%; top: -4%; left: 10%; transform: rotate(-35deg); animation: nxpSway 3s ease-in-out infinite; }
.nxp-leaf.l2 { top: 60%; left: auto; right: -12%; transform: rotate(60deg); animation-delay: -1s; } .nxp-leaf.l3 { top: auto; bottom: -6%; left: 30%; transform: rotate(160deg); animation-delay: -2s; }
@keyframes nxpSway { 0%, 100% { rotate: 0deg; } 50% { rotate: 12deg; } }
/* Event horizon: a black hole with a glowing accretion disk */
.nxp-f-void::before { inset: -16px; background: conic-gradient(from 0deg, rgba(255,170,60,0), rgba(255,200,120,.95), rgba(255,120,40,.7), rgba(255,170,60,0) 40%, rgba(255,230,180,.9) 60%, rgba(255,120,40,.6), rgba(255,170,60,0)); -webkit-mask: radial-gradient(farthest-side, transparent 55%, #000 62%, transparent 100%); mask: radial-gradient(farthest-side, transparent 55%, #000 62%, transparent 100%); filter: blur(1.5px); animation: nxpSpin 2.8s linear infinite; }
.nxp-f-void::after { inset: -6px; border: 4px solid #000; box-shadow: 0 0 0 1px rgba(255,190,100,.6), 0 0 16px rgba(255,140,40,.6); }
/* Hex shield: a hexagon force field */
.nxp-f-hex::before { inset: -11px; border-radius: 0; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); background: linear-gradient(135deg, rgba(92,225,255,.95), rgba(42,125,255,.8)); filter: drop-shadow(0 0 6px #5ce1ff); animation: nxpShield 2.6s ease-in-out infinite; }
.nxp-f-hex::after { inset: -8px; border-radius: 0; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); background: repeating-linear-gradient(60deg, rgba(10,30,50,.92) 0 6px, rgba(20,60,90,.92) 6px 7px); z-index: -1; }
@keyframes nxpShield { 0%, 100% { opacity: .75; } 50% { opacity: 1; } }
/* 8-bit: a blocky pixel ring */
.nxp-f-pixel::before { inset: -8px; border-radius: 0; clip-path: polygon(30% 0, 70% 0, 70% 6%, 85% 6%, 85% 15%, 94% 15%, 94% 30%, 100% 30%, 100% 70%, 94% 70%, 94% 85%, 85% 85%, 85% 94%, 70% 94%, 70% 100%, 30% 100%, 30% 94%, 15% 94%, 15% 85%, 6% 85%, 6% 70%, 0 70%, 0 30%, 6% 30%, 6% 15%, 15% 15%, 15% 6%, 30% 6%); background: #ffd84d; animation: nxp8bit 1.2s steps(2) infinite; }
@keyframes nxp8bit { 0% { background: #ffd84d; } 50% { background: #ff5e8a; } }
/* Aurora: flowing northern lights */
.nxp-f-aurora::before { inset: -13px; background: conic-gradient(from 0deg, #5dffb4, transparent 25%, #8a7dff, transparent 55%, #5cc8ff, transparent 80%, #5dffb4); filter: blur(6px); animation: nxpSpin 6s linear infinite; }
.nxp-f-aurora::after { inset: -5px; background: conic-gradient(#5dffb4, #5cc8ff, #8a7dff, #5dffb4); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px)); animation: nxpSpinR 8s linear infinite; }
/* status dot on the picture */
.nxp-pres { position: absolute; z-index: 5; right: calc(14.6% - var(--s) * .11); bottom: calc(14.6% - var(--s) * .11); width: calc(var(--s) * .22); height: calc(var(--s) * .22); min-width: 9px; min-height: 9px; border-radius: 50%; border: max(2px, calc(var(--s) * .04)) solid #0c141a; box-sizing: border-box; background: #3dff9a; }
.nxp-p-idle { background: #ffc35c !important; } .nxp-p-dnd { background: #ff5a6e !important; } .nxp-p-invisible { background: #8a95a3 !important; }
.nxp-on.nxp-p-idle { box-shadow: 0 0 6px #ffc35c; } .nxp-on.nxp-p-dnd { box-shadow: 0 0 6px #ff5a6e; } .nxp-on.nxp-p-invisible { box-shadow: none; }
/* bundled fonts read a bit differently: even them out */
.nxp-font-pixel { font-size: 15px !important; letter-spacing: .02em; font-weight: 400 !important; } .nxp-mini .nxp-font-pixel { font-size: 12px !important; }
.nxp-font-hand { font-size: 23px !important; font-weight: 700; } .nxp-mini .nxp-font-hand { font-size: 18px !important; }
.nxp-font-display { letter-spacing: .02em; font-weight: 600 !important; text-transform: none; }
.nxp-font-rounded { font-weight: 800 !important; }
/* ===== 4.0.4 profile frames: decorations around your whole card ===== */
.nxp-pf { overflow: visible !important; }
.nxp-pf > .nxp-banner { border-radius: 18px 18px 0 0; }
.nxp-pfx { position: absolute; inset: -2px; border-radius: 20px; pointer-events: none; z-index: 3; }
.nxp-pfx::before, .nxp-pfx::after { content: ''; position: absolute; pointer-events: none; }
.nxp-pf-neon .nxp-pfx { border: 2px solid #7dffc4; box-shadow: 0 0 12px rgba(61,255,160,.7), inset 0 0 12px rgba(61,255,160,.35); animation: nxpFlick 5s steps(1) infinite; }
.nxp-pf-hud .nxp-pfx { inset: -4px; border-radius: 0; background: linear-gradient(#5ce1ff, #5ce1ff) top left / 22px 2px, linear-gradient(#5ce1ff, #5ce1ff) top left / 2px 22px, linear-gradient(#5ce1ff, #5ce1ff) top right / 22px 2px, linear-gradient(#5ce1ff, #5ce1ff) top right / 2px 22px, linear-gradient(#5ce1ff, #5ce1ff) bottom left / 22px 2px, linear-gradient(#5ce1ff, #5ce1ff) bottom left / 2px 22px, linear-gradient(#5ce1ff, #5ce1ff) bottom right / 22px 2px, linear-gradient(#5ce1ff, #5ce1ff) bottom right / 2px 22px; background-repeat: no-repeat; filter: drop-shadow(0 0 4px #5ce1ff); }
.nxp-pf-hud .nxp-pfx::after { left: 50%; top: -6px; width: 40px; height: 3px; margin-left: -20px; background: #5ce1ff; box-shadow: 0 0 8px #5ce1ff; animation: nxpScanX 3s ease-in-out infinite alternate; }
@keyframes nxpScanX { from { transform: translateX(-60px); } to { transform: translateX(60px); } }
.nxp-pf-gold .nxp-pfx { border: 2px solid transparent; background: linear-gradient(120deg, #8a6a12, #f6e27a, #b8901f, #fff6c8, #9c7a18) border-box; -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0); }
.nxp-pf-gold .nxp-pfx::before { inset: -5px; border-radius: 22px; background: radial-gradient(circle at 0 0, #f6e27a 0 5px, transparent 6px), radial-gradient(circle at 100% 0, #f6e27a 0 5px, transparent 6px), radial-gradient(circle at 0 100%, #f6e27a 0 5px, transparent 6px), radial-gradient(circle at 100% 100%, #f6e27a 0 5px, transparent 6px); filter: drop-shadow(0 0 3px #e6b93a); }
.nxp-pf-pixel .nxp-pfx { border-radius: 0; inset: -3px; border: 3px solid transparent; background: repeating-linear-gradient(90deg, #ffd84d 0 6px, #ff5e8a 6px 12px) border-box; -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0); animation: nxpMarch .6s steps(2) infinite; }
@keyframes nxpMarch { to { background-position: 12px 0; } }
.nxp-pf-frost .nxp-pfx { border: 2px solid #dff7ff; box-shadow: 0 0 12px rgba(160,230,255,.7), inset 0 0 18px rgba(200,245,255,.25); }
.nxp-pf-frost .nxp-pfx::before { inset: -8px; border-radius: 26px; background: radial-gradient(10px 10px at 0 0, #fff 0 2px, transparent 3px), radial-gradient(circle at 12% 0, #dff7ff 0 2px, transparent 3px), radial-gradient(circle at 100% 100%, #fff 0 3px, transparent 4px), radial-gradient(circle at 88% 100%, #dff7ff 0 2px, transparent 3px); filter: drop-shadow(0 0 4px #9fe7ff); }
.nxp-pf-holo .nxp-pfx { border: 2px solid transparent; background: linear-gradient(120deg, #ff9cf0, #9ff5ff, #fff6a8, #9cffc7, #ff9cf0) border-box; background-size: 300% 100%; -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0); animation: nxpHolo 4s linear infinite; filter: drop-shadow(0 0 6px rgba(159,245,255,.6)); }
@keyframes nxpHolo { to { background-position: 300% 0; } }
.nxp-pf-circuit .nxp-pfx { border: 1.5px solid rgba(92,200,255,.45); }
.nxp-pf-circuit .nxp-pfx::before { width: 10px; height: 10px; border-radius: 50%; background: #9fe7ff; box-shadow: 0 0 10px #5cc8ff, 0 0 20px #5cc8ff; top: -6px; left: -6px; offset-path: inset(0 round 20px); animation: nxpTrace 5s linear infinite; }
@keyframes nxpTrace { from { offset-distance: 0%; } to { offset-distance: 100%; } }
.nxp-pf-royal .nxp-pfx { border: 2px solid #b98cff; box-shadow: 0 0 0 3px rgba(14,8,24,.9), 0 0 0 5px #ffd36b, 0 0 18px rgba(185,140,255,.5); }
.nxp-pf-void .nxp-pfx { border: 2px solid #6b3fa0; box-shadow: 0 0 22px rgba(107,63,160,.8), inset 0 0 22px rgba(0,0,0,.8); animation: nxpVoid 3s ease-in-out infinite; }
@keyframes nxpVoid { 50% { box-shadow: 0 0 36px rgba(140,80,220,.95), inset 0 0 30px rgba(0,0,0,.9); } }
.nxp-sw.nxp-pf .nxp-pfx { border-radius: 12px; } .nxp-sw.nxp-pf.nxp-pf-hud .nxp-pfx, .nxp-sw.nxp-pf.nxp-pf-pixel .nxp-pfx { border-radius: 0; }
/* ===== 4.0.6 ===== */
.nxp-pfg { position: absolute; inset: -2px; border-radius: 20px; pointer-events: none; z-index: 2; }
.nxp-sw.nxp-pf .nxp-pfg { border-radius: 12px; }
.nxp-sw i.nxp-pfg, .nxp-sw i.nxp-pfx, .nxp-sw i.nxp-fx { width: auto; height: auto; bottom: auto; left: auto; inset: -2px; }
.nxp-sw i.nxp-fx { inset: 0; border-radius: inherit; }
.nxp-sw i.nxp-fx:not(.nxp-fx-mine) { background-size: 100% 60px; }   /* shop tiles are short: shrink the pattern so it shows */
/* Ember, remade: a ring that runs from hot yellow at the bottom to dark red at the top, a low warm glow, small flames
   licking along the bottom edge and sparks drifting up off it. Nothing grows or shrinks. */
.nxp-pf-flame .nxp-pfx { inset: -2px; border-radius: 20px; border: 2px solid transparent; background: linear-gradient(0deg, #ffe08a, #ff9a2e 20%, #e8461a 50%, #7a1606 80%, #2a0602) border-box; background-size: 100% 220%; -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0); animation: nxpEmberFlow 2.6s ease-in-out infinite alternate; box-shadow: none; }
@keyframes nxpEmberFlow { from { background-position: 0 100%; } to { background-position: 0 55%; } }
.nxp-pf-flame .nxp-pfg { box-shadow: 0 0 14px rgba(255,110,30,.4), 0 14px 26px -12px rgba(255,80,10,.8), inset 0 -28px 30px -26px rgba(255,120,30,.6); animation: nxpEmberGlow 3.2s ease-in-out infinite; }
@keyframes nxpEmberGlow { 0%, 100% { opacity: .72; } 35% { opacity: 1; } 60% { opacity: .86; } }
.nxp-pf-flame .nxp-pfg::before { content: ''; position: absolute; left: 5%; right: 5%; bottom: 0; height: 48px; background-image: radial-gradient(1.6px 1.6px at 8% 90%, #ffd27a, transparent), radial-gradient(1.3px 1.3px at 27% 60%, #ff9a3d, transparent), radial-gradient(2px 2px at 48% 85%, #ffe6a3, transparent), radial-gradient(1.3px 1.3px at 66% 40%, #ff7a2e, transparent), radial-gradient(1.6px 1.6px at 84% 75%, #ffc15c, transparent), radial-gradient(1.2px 1.2px at 95% 30%, #ffd27a, transparent); background-size: 100% 48px; animation: nxpSparks 2.8s linear infinite; -webkit-mask: linear-gradient(transparent, #000 45%, #000 85%, transparent); mask: linear-gradient(transparent, #000 45%, #000 85%, transparent); }
@keyframes nxpSparks { to { background-position: 0 -48px; } }
.nxp-pf-flame .nxp-pfg::after { content: ''; position: absolute; left: 3%; right: 3%; bottom: -4px; height: 22px; border-radius: 0 0 18px 18px; background: radial-gradient(10px 20px at 50% 100%, rgba(255,236,160,.95), rgba(255,140,40,.85) 40%, rgba(230,60,10,.45) 65%, transparent 78%) 0 100% / 17px 22px repeat-x, radial-gradient(8px 15px at 50% 100%, rgba(255,190,80,.9), rgba(255,90,20,.6) 50%, transparent 78%) 6px 100% / 11px 16px repeat-x, radial-gradient(14px 12px at 50% 100%, rgba(255,110,30,.7), transparent 75%) 3px 100% / 23px 12px repeat-x; -webkit-mask: linear-gradient(to top, #000 30%, transparent); mask: linear-gradient(to top, #000 30%, transparent); filter: blur(1.1px) saturate(1.2); transform-origin: 50% 100%; animation: nxpLick 1.3s ease-in-out infinite alternate, nxpFlick2 .9s steps(3) infinite; }
@keyframes nxpLick { from { transform: scaleY(.8); background-position: 0 100%, 6px 100%, 3px 100%; } to { transform: scaleY(1.12); background-position: 8px 100%, -2px 100%, 12px 100%; } }
@keyframes nxpFlick2 { 0% { opacity: .85; } 33% { opacity: 1; } 66% { opacity: .9; } }
.nxp-sw.nxp-pf-flame .nxp-pfg::before { height: 30px; background-size: 100% 30px; }
/* Blossom */
.nxp-pf-sakura .nxp-pfx { border: 2px solid #ffb7d5; box-shadow: 0 0 12px rgba(255,140,190,.5), inset 0 0 12px rgba(255,183,213,.18); }
.nxp-pf-sakura .nxp-pfg::before, .nxp-pf-sakura .nxp-pfg::after { content: ''; position: absolute; width: 26px; height: 26px; background: radial-gradient(ellipse 6px 3.5px at 30% 40%, #ffc6dc 60%, transparent 64%), radial-gradient(ellipse 5px 3px at 70% 62%, #ff9ec7 60%, transparent 64%), radial-gradient(ellipse 4px 2.5px at 48% 82%, #ffd9e8 60%, transparent 64%); animation: nxpSway 3.4s ease-in-out infinite alternate; }
.nxp-pf-sakura .nxp-pfg::before { top: -10px; left: -8px; } .nxp-pf-sakura .nxp-pfg::after { bottom: -10px; right: -8px; animation-delay: -1.7s; }
@keyframes nxpSway { to { transform: rotate(22deg) translate(2px, 3px); } }
/* Aurora veil */
.nxp-pf-aurora .nxp-pfx { border: 2px solid transparent; background: linear-gradient(120deg, #5dffb4, #5cc8ff, #8a7dff, #5dffb4) border-box; background-size: 300% 100%; -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0); animation: nxpHolo 6s linear infinite; }
.nxp-pf-aurora .nxp-pfg { box-shadow: 0 0 18px rgba(93,255,180,.3), 0 0 32px rgba(138,125,255,.22); animation: nxpHue 9s linear infinite; }
@keyframes nxpHue { to { filter: hue-rotate(360deg); } }
.nxp-t-frost { background: radial-gradient(100% 70% at 0% 0%, rgba(200,240,255,.22), transparent 60%), linear-gradient(165deg, #16324a, #071420); border-color: rgba(160,230,255,.45); }
.nxp-fx-petals { background-image: radial-gradient(ellipse 4px 2.5px at 15% 10%, #ffc6dc 60%, transparent 64%), radial-gradient(ellipse 3.5px 2px at 45% 40%, #ff9ec7 60%, transparent 64%), radial-gradient(ellipse 4px 2.5px at 75% 20%, #ffd6e6 60%, transparent 64%), radial-gradient(ellipse 3px 2px at 90% 60%, #ff9ec7 60%, transparent 64%), radial-gradient(ellipse 3.5px 2.2px at 30% 75%, #ffc6dc 60%, transparent 64%); background-size: 100% 130px; animation: nxpPetal 7s linear infinite; }
@keyframes nxpPetal { to { background-position: 30px 130px; } }
/* Make your own (beta): picture frame */
.nxp-f-mine::before { inset: -9px; background: radial-gradient(circle, var(--ca) 45%, transparent 70%); filter: blur(6px); opacity: calc(var(--cg) * .28); }
.nxp-f-mine::after { inset: calc(var(--cw) * -1px - 2px); border-radius: 50%; }
.nxp-fm-ring::after { border: calc(var(--cw) * 1px) solid transparent; background: conic-gradient(var(--ca), var(--cb), var(--ca)) border-box; -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0); }
.nxp-fm-double::after { border: calc(var(--cw) * 1px) solid var(--ca); box-shadow: 0 0 0 2px #0c141a, 0 0 0 calc(var(--cw) * 1px + 2px) var(--cb); }
.nxp-fm-dashed::after { border: calc(var(--cw) * 1px) dashed var(--ca); }
.nxp-fm-glow::after { border: calc(var(--cw) * 1px) solid var(--ca); box-shadow: 0 0 calc(var(--cg) * 5px + 3px) var(--ca), 0 0 calc(var(--cg) * 10px + 4px) var(--cb); }
.nxp-fm-image::before, .nxp-fm-image::after { display: none; }
.nxp-f-mine.nxp-ma-spin::after { animation: nxpSpin var(--cd) linear infinite; }
.nxp-f-mine.nxp-ma-pulse::after, .nxp-f-mine.nxp-ma-pulse::before { animation: nxpMinePulse var(--cd) ease-in-out infinite; }
.nxp-f-mine.nxp-ma-flow::after { animation: nxpHue var(--cd) linear infinite; }
@keyframes nxpMinePulse { 50% { opacity: .4; } }
.nxp-av > img.nxp-fimg { position: absolute; inset: -20%; width: 140%; height: 140%; border-radius: 0; box-shadow: none; background: none; object-fit: contain; z-index: 2; pointer-events: none; }
/* Make your own: profile frame */
.nxp-pfx.nxp-pm-gradient { border: 2px solid transparent; background: linear-gradient(120deg, var(--ca), var(--cb), var(--ca)) border-box; background-size: 300% 100%; -webkit-mask: linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) padding-box exclude, linear-gradient(#000 0 0); }
.nxp-pfx.nxp-pm-double { border: 2px solid var(--ca); outline: 2px solid var(--cb); outline-offset: 3px; box-shadow: 0 0 calc(var(--cg) * 8px) var(--ca); }
.nxp-pfx.nxp-pm-corners { inset: -4px; border-radius: 0; background: linear-gradient(var(--ca), var(--ca)) top left / 22px 2px, linear-gradient(var(--ca), var(--ca)) top left / 2px 22px, linear-gradient(var(--cb), var(--cb)) top right / 22px 2px, linear-gradient(var(--cb), var(--cb)) top right / 2px 22px, linear-gradient(var(--cb), var(--cb)) bottom left / 22px 2px, linear-gradient(var(--cb), var(--cb)) bottom left / 2px 22px, linear-gradient(var(--ca), var(--ca)) bottom right / 22px 2px, linear-gradient(var(--ca), var(--ca)) bottom right / 2px 22px; background-repeat: no-repeat; filter: drop-shadow(0 0 calc(var(--cg) * 3px) var(--ca)); }
.nxp-pfx.nxp-pm-glow { border: 2px solid var(--ca); box-shadow: 0 0 calc(var(--cg) * 8px + 4px) var(--ca), inset 0 0 calc(var(--cg) * 8px + 2px) var(--cb); }
.nxp-pfx.nxp-pm-gradient.nxp-ma-flow { animation: nxpHolo var(--cd) linear infinite; }
.nxp-pfx.nxp-ma-flow:not(.nxp-pm-gradient), .nxp-pfx.nxp-ma-spin { animation: nxpHue var(--cd) linear infinite; }
.nxp-pfx.nxp-ma-pulse { animation: nxpMinePulse var(--cd) ease-in-out infinite; }
.nxp-oimg { position: absolute; inset: -8px; width: calc(100% + 16px); height: calc(100% + 16px); z-index: 3; pointer-events: none; object-fit: fill; }
/* Make your own: profile effect */
.nxp-fx-mine { background-size: 120px 120px; animation: nxpMineUp var(--cd, 5s) linear infinite; }
.nxp-fx-mine.nxp-fd-down { animation-name: nxpMineDown; } .nxp-fx-mine.nxp-fd-float { animation-name: nxpMineFloat; }
@keyframes nxpMineUp { to { background-position: 0 -120px; } } @keyframes nxpMineDown { to { background-position: 0 120px; } } @keyframes nxpMineFloat { to { background-position: 60px -120px; } }
/* sets */
.nxp-pack { width: 100%; padding: 8px; border-radius: 14px; background: linear-gradient(135deg, var(--pb) 35%, color-mix(in srgb, var(--pa) 45%, var(--pb)) 160%); box-sizing: border-box; }
.nxp-pack .nxp-card { text-align: left; }
/* what friends see */
.nxp-more { display: grid; gap: 7px; margin: 12px 16px 14px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); font-size: 12.5px; color: #eef4f8; }
.nxp-more > div:not(.nxp-badges) { display: flex; justify-content: space-between; gap: 12px; }
.nxp-more span { color: #9fb0bf; } .nxp-more b { font-weight: 600; text-align: right; }
.nxp-badges { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
.nxp-badges i { font-style: normal; font-size: 11px; padding: 2px 8px; border-radius: 99px; border: 1px solid rgba(255,211,107,.4); color: #ffd36b; background: rgba(255,211,107,.08); }
@media (prefers-reduced-motion: reduce) { .nxp-av::before, .nxp-av::after, .nxp-av > i, .nxp-pfx, .nxp-pfx::before, .nxp-pfx::after, .nxp-pfg, .nxp-pfg::before, .nxp-pfg::after, .nxp-fx { animation: none !important; } }
`;
  const CSS = OLD_CSS + NEW_CSS;
  const api = { CATALOG, KINDS, APP_THEMES, FREE_THEMES, FONTS, COLORS, PRES, item, card, nameHtml, nameColor, avatarHtml, swatch, CSS, key, HEX, SAFE_IMG, OWNER_ONLY, BETA_ITEMS, PACKS, PACK_OFF, pack, packPrice, packStyle, packSwatch, cleanCustom, effectTile, SAFE_MINE, MINE, detailsHtml };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.NexusCosmetics = api;
    if (typeof document !== 'undefined' && !document.getElementById('nxp-css')) {
      let base = 'fonts/';
      try { const src = document.currentScript && document.currentScript.src; if (src) base = new URL('fonts/', src).href; } catch {}
      const st = document.createElement('style'); st.id = 'nxp-css'; st.textContent = FONT_CSS(base) + '\n' + CSS; (document.head || document.documentElement).appendChild(st);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
