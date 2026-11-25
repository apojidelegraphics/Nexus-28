// Themes (v1.5): built-in themes live in themes.css; custom ones (Settings → General → Theme editor) are applied here
// as CSS variables. NexusTheme.apply(settings) · NexusTheme.list(settings) · NexusTheme.vars(theme)
(function () {
  const BUILTIN = [
    ['green', 'Nexus Green'], ['arc', 'Arc Reactor (cyan)'], ['critical', 'Critical (red)'], ['amber', 'LentOS Classic (amber)'],
    ['nebula', 'Nebula (violet)'], ['rose', 'Rose Quartz (pink)'], ['glacier', 'Glacier (ice)'], ['graphite', 'Graphite (mono)'], ['synthwave', 'Synthwave (neon)'], ['forest', 'Deep Forest (moss)'],
    ['lagoon', 'Lagoon (teal)'], ['sunflower', 'Sunflower (yellow)'], ['lavender', 'Lavender (lilac)'], ['coffee', 'Coffee (warm brown)'], ['midnight', 'Midnight (deep blue)'], ['cherry', 'Cherry (red-pink)']   // 4.0.1
  ];
  // 4.0: app themes bought with Cirkts (ids shop-<name>; the same colors as cosmetics.js)
  const SHOP = { sakura: { accent: '#ff9ec7', accent2: '#ffd1e3', bg: '#1c0d16', text: '#fff0f6' }, ocean: { accent: '#4fb3ff', accent2: '#2ee6d6', bg: '#04101f', text: '#e2f2ff' },
    ember: { accent: '#ff7a3d', accent2: '#ffc65c', bg: '#170905', text: '#ffeee4' }, obsidian: { accent: '#e6c46a', accent2: '#fff1c2', bg: '#0b0a08', text: '#f6efdd' },
    aurora: { accent: '#5dffb4', accent2: '#8a7dff', bg: '#050b14', text: '#e6fff5' }, holo: { accent: '#9ff5ff', accent2: '#ff9cf0', bg: '#0a0c16', text: '#f4f8ff' },
    cyber: { accent: '#f9f002', accent2: '#ff2a6d', bg: '#0d0a14', text: '#fffde0' }, vapor: { accent: '#ff71ce', accent2: '#01cdfe', bg: '#140b24', text: '#fbe8ff' }, bloodmoon: { accent: '#ff3b3b', accent2: '#ff9a3c', bg: '#120404', text: '#ffe4e0' }, emerald: { accent: '#2ee88a', accent2: '#d4ff5c', bg: '#03120a', text: '#e2ffef' }, royal: { accent: '#b98cff', accent2: '#ffd36b', bg: '#0e0818', text: '#f3ebff' }, toxic: { accent: '#a6ff00', accent2: '#00ffd5', bg: '#071004', text: '#f0ffe0' } };
  const hexRgb = h => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  function vars(t) {
    const [r, g, b] = hexRgb(t.accent), bg = hexRgb(t.bg), glass = t.glass || .88;
    return {
      '--accent': t.accent, '--accent-rgb': `${r}, ${g}, ${b}`, '--accent-2': t.accent2 || t.accent,
      '--bg': `rgba(${bg[0]}, ${bg[1]}, ${bg[2]}, ${glass})`, '--panel': `rgba(${hexRgb(mix(t.bg, t.accent, .12)).join(', ')}, .55)`,
      '--text': t.text || '#e8f0ff', '--muted': mix(t.text || '#e8f0ff', t.bg, .45), '--danger': '#ff5a6e'
    };
  }
  const KEYS = ['--accent', '--accent-rgb', '--accent-2', '--bg', '--panel', '--text', '--muted', '--danger'];
  function apply(settings, root = document.documentElement) {
    const id = settings?.theme || 'green';
    const custom = (settings?.customThemes || []).find(t => t.id === id) || (/^shop-/.test(id) && SHOP[id.slice(5)] ? { ...SHOP[id.slice(5)], glass: .9 } : null);
    KEYS.forEach(k => root.style.removeProperty(k));
    if (custom) { root.dataset.theme = 'custom'; Object.entries(vars(custom)).forEach(([k, v]) => root.style.setProperty(k, v)); }
    else root.dataset.theme = BUILTIN.some(([b]) => b === id) ? id : 'green';
    a11y(settings?.a11y || {}, root);
    // 4.0.4: how see-through the window is (Settings → General → See-through): 0 = solid, up to 75%
    // 4.0.6: an on/off switch (glassOn), up to 85%, and Frosted (the system blurs what's behind; see main.js applyGlass)
    const on = settings?.glassOn === undefined ? (+settings?.glass || 0) > 0 : !!settings.glassOn;
    const see = on ? Math.max(0, Math.min(85, +(settings?.glass ?? 0) || 0)) : 0;
    root.style.setProperty('--glass', String(1 - see / 100));
    root.classList?.toggle('see-through', see > 0);
    root.classList?.toggle('frosted', see > 0 && !!settings?.frost);
  }
  // 3.12 accessibility (Settings → General → Accessibility): text size, less motion, more contrast, easier-to-read font,
  // bigger focus rings and tap targets. Every window that applies the theme picks these up too.
  const A11Y_CSS = `
html.a11y-motion *, html.a11y-motion *::before, html.a11y-motion *::after { animation-duration: .001s !important; animation-iteration-count: 1 !important; transition-duration: .001s !important; scroll-behavior: auto !important; }
html.a11y-contrast { --muted: var(--text) !important; } html.a11y-contrast body { text-shadow: none !important; }
html.a11y-contrast .msg, html.a11y-contrast .card, html.a11y-contrast .modal-box, html.a11y-contrast button, html.a11y-contrast input, html.a11y-contrast select, html.a11y-contrast textarea { border-color: rgba(var(--accent-rgb), .9) !important; }
html.a11y-contrast .dim, html.a11y-contrast .note, html.a11y-contrast small { opacity: 1 !important; color: var(--text) !important; }
html.a11y-font body, html.a11y-font input, html.a11y-font textarea, html.a11y-font button, html.a11y-font select { font-family: "Atkinson Hyperlegible", Verdana, "Segoe UI", system-ui, sans-serif !important; letter-spacing: .01em; word-spacing: .06em; }
html.a11y-font .msg .body { line-height: 1.7 !important; }
html.a11y-focus :focus-visible { outline: 3px solid var(--accent) !important; outline-offset: 2px !important; }
html.a11y-focus button, html.a11y-focus .icon-btn, html.a11y-focus .mt-btn { min-height: 32px; min-width: 32px; }
html.a11y-under a { text-decoration: underline !important; }`;
  function a11y(o, root) {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function' || !root.classList) return;
    if (!document.getElementById('nx-a11y')) { const st = document.createElement('style'); st.id = 'nx-a11y'; st.textContent = A11Y_CSS; (document.head || document.documentElement).appendChild(st); }
    const sysMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const c = root.classList;
    c.toggle('a11y-motion', o.motion === true || (o.motion !== false && sysMotion));
    c.toggle('a11y-contrast', !!o.contrast); c.toggle('a11y-font', !!o.font); c.toggle('a11y-focus', !!o.focus); c.toggle('a11y-under', !!o.underline);
    const z = +o.scale || 1; root.style.zoom = z !== 1 ? String(z) : '';
  }
  const list = settings => [...BUILTIN.map(([id, name]) => ({ id, name })), ...(settings?.customThemes || []).map(t => ({ id: t.id, name: t.name, custom: true }))];
  window.NexusTheme = { apply, a11y, list, vars, BUILTIN, mix };
})();
