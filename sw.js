// Service worker: guarda la app y los problemas para jugar sin conexión.
// Si cambias algún fichero (o regeneras puzzles.json), sube el número de versión.
const CACHE = 'ajedrez-problemas-v5';
const FICHEROS = [
  './', 'index.html', 'app.js', 'chess.js', 'pieces.css',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'puzzles.json',
  'stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHEROS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
