// 4.3.0 the tiny jot box (⌥⇧J / Alt+Shift+J)
  const t = document.getElementById('t'), s = document.getElementById('s');
  document.getElementById('f').onsubmit = async e => { e.preventDefault(); const v = t.value.trim(); if (!v) return window.nexus.jotWindow.close(); await window.nexus.write.jot(v); t.value = ''; s.textContent = 'Saved ✓'; setTimeout(() => window.nexus.jotWindow.close(), 450); };
  addEventListener('keydown', e => { if (e.key === 'Escape') window.nexus.jotWindow.close(); });
  addEventListener('focus', () => { t.focus(); s.textContent = 'Jots & Docs'; });
