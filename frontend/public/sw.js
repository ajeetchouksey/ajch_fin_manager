/* Aarya Finance service worker
 * - Makes the app installable and lets the shell open instantly / offline.
 * - Pages: network first, fall back to the cached shell when offline.
 * - Hashed build assets (/assets/*): cache first (filenames change on every deploy).
 * - Never caches API calls or third-party requests (auth, Google, AI).
 */
const CACHE = 'aarya-finance-v1'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // SPA: every route serves the same index.html, so keep one copy of the shell
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(request, copy))
            }
            return res
          }),
      ),
    )
  }
})
