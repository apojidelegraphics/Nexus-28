// Themes (v1.5): built-in themes live in themes.css; custom ones (Settings → General → Theme editor) are applied here
// as CSS variables. NexusTheme.apply(settings) · NexusTheme.list(settings) · NexusTheme.vars(theme)
(function () {
  const BUILTIN = [
    ['green', 'Nexus Green'], ['arc', 'Arc Reactor (cyan)'], ['critical', 'Critical (red)'], ['amber', 'LentOS Classic (amber)'],
    ['nebula', 'Nebula (violet)'], ['rose', 'Rose Quartz (pink)'], ['glacier', 'Glacier (ice)'], ['graphite', 'Graphite (mono)'], ['synthwave', 'Synthwave (neon)'], ['forest', 'Deep Forest (moss)']
  ];
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
    const custom = (settings?.customThemes || []).find(t => t.id === id);
    KEYS.forEach(k => root.style.removeProperty(k));
    if (custom) { root.dataset.theme = 'custom'; Object.entries(vars(custom)).forEach(([k, v]) => root.style.setProperty(k, v)); }
    else root.dataset.theme = BUILTIN.some(([b]) => b === id) ? id : 'green';
  }
  const list = settings => [...BUILTIN.map(([id, name]) => ({ id, name })), ...(settings?.customThemes || []).map(t => ({ id: t.id, name: t.name, custom: true }))];
  window.NexusTheme = { apply, list, vars, BUILTIN, mix };
})();
