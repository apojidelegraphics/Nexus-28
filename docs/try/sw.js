// Nexus '28 Test Run as an app (4.2.0): keeps the page itself on this device so it opens fast and shows something when
// you're offline. Answers, chats and sign-in always go to the network (nothing private is cached here).
const CACHE = 'nexus-try-4.2.0';
const SHELL = ['./', './index.html', './try.css', './try.js', './more.js', './markdown.js', './nexuskit.js', './manifest.webmanifest',
  '../companion/widgets.css', '../companion/widgets.js', '../companion/orb.js', '../companion/icons.js', '../companion/cosmetics.js', '../companion/replay.js',
  '../companion/mindtree.js', '../companion/mindmap-lib.js', '../companion/mapview.js', '../companion/icon-192.png', '../companion/favicon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('nexus-try-') && k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // Supabase, the AI and search: never cached
  // the page's own files: the newest from the network, the saved copy when offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./'))));
});
