const CACHE_NAME = 'dictcat-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
  console.log('Service Worker instal·lat (v2)');
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
  console.log('Service Worker activat (v2)');
});

// NO cachear nada - passthrough completo
self.addEventListener('fetch', event => {
  return;
});
