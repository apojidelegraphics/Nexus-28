// N28C service worker: shows notifications your Mac sends (Web Push) and keeps the app shell for quick starts.
// Your Mac sends the pushes itself, encrypted for this phone only; nothing is read here except the message to show.
const SHELL = 'n28c-shell-v1.8.0';
const FILES = ['./', './index.html', './orb.js', './widgets.js', './widgets.css', './app.js', './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('n28c-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show up right away), cache when offline. Only this app's own files.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./'))));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'N28C', body: e.data ? e.data.text() : '' }; }
  const url = typeof d.url === 'string' && d.url.startsWith('./') ? d.url : './';
  e.waitUntil((async () => {
    // Tell an open app to refresh right away.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach(w => w.postMessage({ type: 'push', kind: d.kind || '', url }));
    await self.registration.showNotification(String(d.title || 'N28C').slice(0, 80), {
      body: String(d.body || '').slice(0, 200), tag: String(d.tag || 'n28c'), renotify: true,
      icon: './icon-192.png', badge: './icon-192.png', data: { url }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { w.postMessage({ type: 'open', url }); return w.focus(); } }
    return self.clients.openWindow(url);
  })());
});
