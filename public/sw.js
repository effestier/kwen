const CACHE_NAME = 'kwen-v2';
const SHELL_URLS = ['/', '/feed', '/auth/login'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // NEVER intercept auth, API, or Supabase requests
  const url = new URL(request.url);
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/api') || url.hostname.includes('supabase')) {
    return;
  }

  // SPA routing: network-first for navigations, fallback to cached shell
  // This handles Capacitor static export where /profile/karan/index.html doesn't exist
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) return response;
        // Non-200 (404 etc) — serve the shell for client-side routing
        return caches.match('/');
      }).catch(() => caches.match('/'))
    );
  } else {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
