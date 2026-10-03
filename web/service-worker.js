// Cache-first service worker: the whole build is precached so the meter opens
// instantly and works with no network. update-check.js asks for version.txt
// (never cached) and activates a new version when one is published.
//
// The cache name and the precache list below are filled in by build.sh.

const CACHE = '__CACHE__'
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  // One by one instead of addAll: addAll is all-or-nothing, and a single 404
  // would leave the app with no cache at all.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))))
    )
  )
  // No skipWaiting here: the new version waits until update-check.js asks,
  // so a running measurement is never cut by a reload.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE })
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // version.txt always goes to the network and is never stored: it is how a
  // new version announces itself.
  if (url.pathname === '/version.txt') return

  // Every route is the same single-page app.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((hit) => hit || fetch(req))
    )
    return
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
    })
  )
})
