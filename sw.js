// Service Worker desactivado temporalmente para evitar conflictos con API externa
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// NO interceptar NINGUNA petición - dejar todo pasar
self.addEventListener('fetch', event => {
  // Passthrough completo - no cachear nada
  return;
});
