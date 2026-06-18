// sw.js - Service Worker for Hindiba Blog

const CACHE_NAME = 'hindiba-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/pp.jpg',
  '/og-image.jpg',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Install Event - Cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('🗄️ Cache opened');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event - Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event - Serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then(response => {
            // Don't cache non-GET requests or 404 responses
            if (event.request.method !== 'GET' || !response.ok) {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // Offline fallback
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/offline.html');
            }
            return new Response('Offline - Sayfa yüklenemedi', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// Background Sync for comments
self.addEventListener('sync', event => {
  if (event.tag === 'sync-comments') {
    event.waitUntil(syncComments());
  }
});

async function syncComments() {
  try {
    const cache = await caches.open('pending-comments');
    const requests = await cache.keys();
    
    for (const request of requests) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
          console.log('✅ Yorum senkronize edildi');
        }
      } catch (error) {
        console.log('⏳ Yorum senkronizasyonu bekliyor...');
      }
    }
  } catch (error) {
    console.error('Sync hatası:', error);
  }
}
