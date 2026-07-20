// App-shell-only cache: HTML/CSS/JS/icons for the 11 in-scope pages.
// Network-first with cache fallback (see plan Task 7 for rationale — a
// cache-first strategy would make the update-check toast's Reload button
// never actually deliver the new version). No session/report data is
// cached — CSV/demo-data/BLE traffic is never intercepted below.
// Bump CACHE_NAME on each release alongside config.js's version, to
// garbage-collect the previous cache on activate.
const CACHE_NAME = 'wergonic-shell-v3.0.7';

const SHELL_FILES = [
    'index.html',
    'dashboard.html',
    'upload.html',
    'posture-viewer.html',
    'live-record.html',
    'clinician-dashboard.html',
    'compare-report.html',
    'session-comparison-landscape.html',
    'rehab-game.html',
    'demo.html',
    'demo-report.html',
    'app.js',
    'config.js',
    'app-shell.js',
    'styles.css',
    'gamification.css',
    'gamification.js',
    'mission-cards-data.js',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png'
];

function wergonicIsShellRequest(pathname) {
    if (pathname === '/') return true;
    return SHELL_FILES.some((f) => pathname === '/' + f);
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (!wergonicIsShellRequest(url.pathname)) {
        return; // not a shell file — network passthrough (data, /version.json, BLE-adjacent fetches, etc.)
    }
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            })
            .catch(() => caches.match(event.request === '/' ? new Request(new URL('/index.html', url).href) : event.request))
    );
});
