// Service worker del menú Club Campestre.
// Sube el número de versión cada vez que cambies index.html.
const VERSION = 'cc-v2';
const SHELL = ['./', 'index.html', 'manifest.json', 'auth.js', 'firebase-config.js', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo maneja archivos del propio menú; los juegos y Firebase van directo a la red.
  if (url.origin !== location.origin) return;
  const scope = new URL('./', self.location).pathname;
  if (!url.pathname.startsWith(scope)) return;
  const sub = url.pathname.slice(scope.length);
  if (/^(bingo|wolvesville|monopoly|worms)\//.test(sub)) return;

  // Red primero (siempre la versión nueva); si no hay internet, usa la copia guardada.
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
