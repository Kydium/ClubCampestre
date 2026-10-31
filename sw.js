// Service worker de Club Campestre.
// Guarda el menú y los juegos en el dispositivo para que abran al instante.
// Cuando cambies un archivo, sube el número de VERSION: así todos los dispositivos descargan lo nuevo.
const VERSION = 'cc-v6';
const EXT = 'cc-ext-v1';   // Firebase SDK y tipografías (no cambian)

// Menú
const SHELL = ['./', 'index.html', 'manifest.json', 'auth.js', 'firebase-config.js', 'club-xp.js', 'club-avatar.js',
  'icons/icon-192.png', 'icons/icon-512.png'];
// Juegos (cada uno es <carpeta>/index.html). Si alguno no existe, se ignora.
const GAMES = ['bingo/', 'wolvesville/', 'monopoly/', 'worms/', 'Puno/'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // El menú es obligatorio y se descarga primero.
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    // Los juegos se descargan sin bloquear la instalación; un fallo no la rompe.
    await Promise.allSettled(GAMES.map(async g => {
      const res = await fetch(new Request(g, { cache: 'reload' }));
      if (!res.ok || res.redirected) return;
      await c.put(g, res.clone());
      await c.put(g + 'index.html', res);
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== EXT).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Responde con lo guardado al instante y actualiza la copia en segundo plano.
// `key` es la dirección sin ?parámetros, para no llenar la memoria con una copia por cada sala.
function cacheThenUpdate(req, key, cacheName) {
  return caches.open(cacheName).then(cache =>
    cache.match(key).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque') && !res.redirected) cache.put(key, res.clone());
        return res;
      }).catch(() => null);
      if (hit) { net.catch(() => {}); return hit; }
      return net.then(res => res || (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
    })
  );
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase SDK (gstatic) y tipografías: se guardan la primera vez.
  if (url.origin !== location.origin) {
    if ((url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))
      || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
      e.respondWith(cacheThenUpdate(req, req, EXT));
    }
    return;   // la base de datos en tiempo real nunca pasa por aquí
  }

  const scope = new URL('./', self.location).pathname;
  if (!url.pathname.startsWith(scope)) return;
  if (url.pathname.endsWith('/sw.js')) return;

  // Menú y juegos: copia guardada primero y se actualiza por detrás.
  e.respondWith(cacheThenUpdate(req, new Request(url.origin + url.pathname), VERSION));
});
