// v2.7 clipboard orb (see cliporb.html)
  const api = window.nexus, bar = document.getElementById('bar');
  api.clipOrb.onShow(d => { bar.style.setProperty('--c', /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#3dffa0'); bar.title = `Copied ${d.chars} characters: “${d.preview}…”`; bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; });
  bar.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) api.clipOrb.act(b.dataset.a); });
  bar.addEventListener('mouseenter', () => api.clipOrb.hover(true)); bar.addEventListener('mouseleave', () => api.clipOrb.hover(false));

