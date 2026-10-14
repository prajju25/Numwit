/* Numwit service worker — makes the site installable as an app.
 *
 * Strategy: network-first for everything, cache as an offline fallback.
 * The bundle filename isn't content-hashed and the client must always match
 * the live server's socket protocol, so we never serve a stale build when the
 * network is available. API and Socket.IO traffic is never touched.
 */
const CACHE = "numwit-v1";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.ico", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (/^\/(api|socket\.io|admin)(\/|$)/.test(url.pathname)) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") return (await caches.match("/")) || Response.error();
        return Response.error();
      })
  );
});
