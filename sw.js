/* Service Worker - NDF Scan PWA v0.3
   Stratégie : cache-first pour les assets statiques, network-first pour l'API Google.
   Le shell de l'app (HTML, CSS, JS, template .xlsm) est mis en cache au premier chargement,
   ce qui permet d'utiliser l'app totalement hors ligne (capture + stockage local). */

const CACHE_NAME = 'ndf-scan-v0.3';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './NDF_VIERGE.xlsm',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll échoue si UN seul asset rate ; on fait du add individuel pour être tolérant
      Promise.all(ASSETS.map(url => cache.add(url).catch(err => console.warn('Cache fail:', url, err))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jamais cacher les appels API Google Vision (auth + données sensibles)
  if (url.hostname.includes('googleapis.com')) {
    return; // laisse passer en direct
  }

  // Pour les assets de l'app : cache-first, fallback réseau
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Met en cache les nouvelles ressources statiques (mêmes origine, GET, OK)
        if (response.ok && event.request.method === 'GET' &&
            (url.origin === self.location.origin || url.hostname.includes('cdnjs.cloudflare.com'))) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Hors ligne et pas en cache : pour les requêtes HTML, retourne l'index
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
