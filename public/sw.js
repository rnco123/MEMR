/*
 * MyclinicMD service worker — intentionally minimal for a PHI-handling EMR.
 *
 * Caching policy:
 *  - Precache only the offline fallback + static icons (no patient data).
 *  - Static build assets (/_next/static, /icons, fonts): stale-while-revalidate.
 *  - Navigations: network-first, fall back to /offline when offline.
 *  - NEVER cache API responses, authenticated HTML, or cross-origin requests.
 */

const VERSION = 'v2'
const STATIC_CACHE = `mcm-static-${VERSION}`
const PRECACHE_URLS = ['/offline.html', '/manifest.webmanifest', '/icons/icon.svg', '/icons/maskable-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/lottie/') ||
    /\.(?:css|js|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|avif|ico|json|webmanifest)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never handle cross-origin
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/monitoring')) return // never cache API/telemetry

  // App navigations: network-first with offline fallback (no PHI caching).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html').then((res) => res || Response.error()))
    )
    return
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) cache.put(request, response.clone())
            return response
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})
