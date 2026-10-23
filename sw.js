const CACHE = "lemango-v4";
const ASSETS = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const isDoc = e.request.mode === "navigate" || /\.html?$/i.test(new URL(e.request.url).pathname) || new URL(e.request.url).pathname === "/";
  if (isDoc) {
    // Network-first for pages so new content (and new sections) always appears.
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
    );
    return;
  }
  // Cache-first for static assets, with background refresh.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
