// User guide: highlight where you are in the list, search the guide, and click a picture to see it bigger.
(function () {
  const $ = id => document.getElementById(id);
  const links = [...document.querySelectorAll('#tocList a')], secs = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const mark = () => { let cur = secs[0]; for (const s of secs) if (s.getBoundingClientRect().top < 120) cur = s; links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur.id)); };
  addEventListener('scroll', mark, { passive: true }); mark();
  // search: hide sections (and their list entries) that don't mention every word
  const q = $('q'); let none = null;
  q.addEventListener('input', () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    let shown = 0;
    secs.forEach((s, i) => { const hit = !words.length || words.every(w => s.textContent.toLowerCase().includes(w)); s.classList.toggle('miss', !hit); links[i].parentElement.classList.toggle('miss', !hit); if (hit) shown++; });
    document.querySelector('.hero').hidden = !!words.length;
    if (!shown && !none) { none = document.createElement('p'); none.className = 'noresults'; $('main').prepend(none); }
    if (none) { none.hidden = !!shown; none.textContent = `Nothing in the guide mentions “${q.value}”. Try fewer words, or ask any agent in Nexus.`; }
  });
  addEventListener('keydown', e => { if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); } if (e.key === 'Escape') { $('lb').hidden = true; if (document.activeElement === q && q.value) { q.value = ''; q.dispatchEvent(new Event('input')); } } });
  // pictures open bigger
  const lb = $('lb');
  document.querySelectorAll('figure img').forEach(img => img.addEventListener('click', () => { lb.querySelector('img').src = img.src; lb.querySelector('img').alt = img.alt; lb.hidden = false; }));
  lb.addEventListener('click', () => { lb.hidden = true; });
})();
