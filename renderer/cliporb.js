// v2.7.1 highlight orb (see cliporb.html). Uses the same orb skin and agent color as the Nexus HUD.
const api = window.nexus, bar = document.getElementById('bar'), wrap = document.getElementById('wrap'), copyBtn = document.getElementById('copyBtn');
const COPY_HTML = copyBtn.innerHTML;
let orb = null;
// Measured right away (offsetWidth forces layout). Not in requestAnimationFrame: that never runs while the window is hidden.
const fit = () => api.clipOrb.size(Math.ceil(wrap.offsetWidth), Math.ceil(wrap.offsetHeight));

api.clipOrb.onShow(d => {
  const color = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#3dffa0';
  bar.style.setProperty('--c', color);
  if (!orb) orb = window.NexusOrb.create(document.getElementById('orb'), { minimal: true, color, skin: d.skin || 'aurora' });
  else { orb.setColor(color, true); orb.setSkin(d.skin || 'aurora'); }
  orb.pulse?.(.4);
  copyBtn.classList.remove('done'); copyBtn.innerHTML = COPY_HTML; copyBtn.title = 'Copy';
  document.getElementById('xBtn').title = d.app ? `Hide · Right-click to turn the orb off in ${d.app}` : 'Hide';
  bar.title = `${d.chars} character${d.chars === 1 ? '' : 's'} highlighted${d.app ? ' in ' + d.app : ''}`;
  bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop');
  fit();
});

bar.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  if (b.dataset.a === 'copy') {
    await api.clipOrb.act('copy');
    copyBtn.classList.add('done'); copyBtn.innerHTML = '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg>Copied'; copyBtn.title = 'Copied';
    fit(); return;
  }
  api.clipOrb.act(b.dataset.a);
});
document.getElementById('xBtn').addEventListener('contextmenu', e => { e.preventDefault(); api.clipOrb.act('mute'); });
bar.addEventListener('mouseenter', () => api.clipOrb.hover(true));
bar.addEventListener('mouseleave', () => api.clipOrb.hover(false));
