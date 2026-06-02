// Service worker disabled — was causing stale page loads after deploy.
// This file unregisters itself and clears all caches to fix existing users.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.registration.unregister())
  );
  self.clients.claim();
});

// Do not intercept any requests
