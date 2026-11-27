/* Banana Gym: rest-end push, imported into the Workbox service worker (vite.config.ts importScripts). */
/* global self, clients, caches */

const PUSH_ID_CACHE = 'banana-push';
const PUSH_ID_KEY = 'push-id';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // iPhone rule: every push must show a notification, so fall through to the default text
  }
  const title = data.title || 'Koniec przerwy';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Czas na kolejną serię',
      icon: 'pwa-192x192.png',
      badge: 'pwa-64x64.png',
      tag: 'rest',
      renotify: true,
      data: { url: data.url || '#/trening' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '#/trening', self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(target).catch(() => w) : w));
        }
      }
      return clients.openWindow(target);
    }),
  );
});

// The browser rotated the subscription: re-subscribe and tell the server under the same device id.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PUSH_ID_CACHE);
      const hit = await cache.match(PUSH_ID_KEY);
      if (!hit) return;
      const meta = await (await cache.match('meta'))?.json().catch(() => null);
      if (!meta) return;
      const id = await hit.text();
      const options = event.oldSubscription?.options ?? { userVisibleOnly: true, applicationServerKey: meta.vapid };
      const sub = event.newSubscription ?? (await self.registration.pushManager.subscribe(options));
      await fetch(meta.url + '/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id, subscription: sub.toJSON() }),
      });
    })(),
  );
});
