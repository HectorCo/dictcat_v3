const CACHE_NAME = 'dictcat-v3';
const urlsToCache = [
  '/index.html',
  '/manifest.json',
  '/image.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // NO interceptar peticiones a APIs externas (LanguageTool, etc.)
  const url = new URL(event.request.url);
  
  if (url.hostname !== self.location.hostname) {
    // Dejar pasar peticiones a dominios externos sin cachear
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(networkResponse => {
            // No cachear respuestas de API externa por si acaso
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            return networkResponse;
          });
      })
      .catch(() => {
        // Si falla la red y no está en cache, mostrar offline
        return caches.match('/index.html');
      })
  );
});
