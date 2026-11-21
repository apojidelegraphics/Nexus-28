// Watch & guide me window (3.12): shows (and reads aloud) the next step. The window is hidden from screenshots, so
// Nexus never sees itself.
(function () {
  const api = window.nexus, $ = id => document.getElementById(id);
  let settings = {}, muted = false, last = '';
  const speaker = window.NexusVoice?.createSpeaker ? window.NexusVoice.createSpeaker(api, { getSettings: () => settings, onLevel: () => {} }) : null;
  api.init().then(s => { settings = s.settings || {}; window.NexusTheme?.apply(settings); muted = settings.guideMuted === true; $('mute').textContent = muted ? '🔇' : '🔊'; }).catch(() => {});
  api.onSettings?.(s => { settings = s; window.NexusTheme?.apply(s); });
  api.guide.onStep(st => {
    $('top').classList.toggle('busy', !!st.busy);
    $('g').classList.toggle('done', !!st.done);
    if (st.goal) $('goal').textContent = 'Goal: ' + st.goal;
    $('n').textContent = st.count ? `step ${st.count}` : '';
    if (st.say) { $('say').textContent = st.say; $('where').textContent = st.where ? '→ ' + st.where : ''; if (!muted && st.say !== last && speaker) { speaker.stop?.(); speaker.speak(st.say, 'read').catch(() => {}); } last = st.say; }
    if (st.done) { $('next').textContent = 'Close'; $('stuck').hidden = true; }
  });
  $('next').onclick = () => $('g').classList.contains('done') ? api.guide.stop() : api.guide.next();
  $('stuck').onclick = () => api.guide.next("I'm stuck. I can't find it or it didn't work.");
  $('stop').onclick = () => { speaker?.stop?.(); api.guide.stop(); };
  $('mute').onclick = () => { muted = !muted; $('mute').textContent = muted ? '🔇' : '🔊'; if (muted) speaker?.stop?.(); api.setSettings?.({ guideMuted: muted }); };
  const ro = new ResizeObserver(() => api.guide.resize(Math.ceil(document.body.scrollHeight))); ro.observe(document.body);
})();
