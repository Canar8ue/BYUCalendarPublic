// Deliberately inert service worker. Its only job is to make the site
// installable as an app: browsers require a fetch handler, and this one lets
// every request through untouched. Nothing is cached, so the calendar's own
// no-store API responses and ?v= asset tokens stay in charge of freshness —
// installability must never win a fight with correctness.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', () => { /* Fall through to the network as usual. */ });
