const CACHE_NAME = 'kwen-v4';
const SHELL_URLS = ['/', '/feed/', '/auth/login/'];

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

  // SPA routing: network-first for navigations
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Always return the real server response — redirects (3xx) must be
          // followed so auth flows work; errors (4xx/5xx) show proper error UI.
          // Only fall back to shell on complete network failure (offline).
          return response;
        })
        .catch(() => caches.match('/'))
    );
  } else {
    // Network-first for _next/static chunks to prevent stale JS/CSS after deploy
    const isStatic = url.pathname.startsWith('/_next/static/');
    if (isStatic) {
      event.respondWith(
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => caches.match(request))
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
  }
});
