// Service worker: membuat aplikasi bisa dipasang (PWA) dan membuka tampilan saat sinyal lemah.
// Data API (/api/*) selalu diambil langsung dari server agar absen tidak pernah memakai data lama.
const CACHE = 'taichan-v3';
const SHELL = ['/', '/manifest.webmanifest', '/img/logo.png', '/img/favicon.png', '/img/icon-192.png', '/img/icon-512.png'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

    // Jaringan dulu, cache sebagai cadangan saat offline
    e.respondWith(
        fetch(req)
            .then((res) => {
                if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
                return res;
            })
            .catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
    );
});
