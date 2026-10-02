// Minimal service worker: makes the app installable and keeps the shell
// available on flaky mobile data. Never caches API calls or other origins.
const CACHE = "ai-agent-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const cacheable = req.mode === "navigate" || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

  // Network first, cache as fallback (so you always get the latest version when online).
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (cacheable && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || Response.error()))
  );
});
