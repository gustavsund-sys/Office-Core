// Generated build supplies VERSION and content hashes in FILES.
const PREFIX = "office-core-";
const CACHE = PREFIX + VERSION;
const key = (path) =>
  new Request(
    new URL(
      path + "?__officecore_content=" + FILES[path],
      self.location.origin,
    ),
  );
async function resource(request, path) {
  let cache;
  let cached;
  try {
    cache = await caches.open(CACHE);
    cached = await caches.match(key(path));
  } catch {
    return fetch(request);
  }
  if (cached) {
    try {
      await cache.put(key(path), cached.clone());
    } catch {
      /* A full cache must not interrupt gameplay. */
    }
    return cached;
  }
  const response = await fetch(request, { cache: "no-cache" });
  if (
    response.ok &&
    response.type !== "opaque" &&
    !response.headers.get("content-type")?.includes("text/html")
  )
    try {
      await cache.put(key(path), response.clone());
    } catch {
      /* Use the downloaded response even if storage is full. */
    }
  return response;
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Cache the complete code/map bundle so old sessions retain their chunks.
      await Promise.all(
        Object.keys(FILES)
          .filter((path) => path.startsWith("/assets/"))
          .map((path) =>
            resource(new Request(new URL(path, self.location.origin)), path),
          ),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const versions = (await caches.keys()).filter((name) =>
        name.startsWith(PREFIX),
      );
      const previous = versions.filter((name) => name !== CACHE);
      await Promise.all(
        previous.slice(0, -1).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
      for (const client of await self.clients.matchAll()) {
        client.postMessage({ type: "office-core-version", version: VERSION });
        // Installation has finished caching the new bundle before activation.
        if (previous.length && client.navigate)
          void client.navigate(client.url).catch(() => {});
      }
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    (!FILES[url.pathname] && !url.pathname.startsWith("/assets/"))
  )
    return;
  event.respondWith(
    (async () => {
      if (FILES[url.pathname]) return resource(event.request, url.pathname);
      for (const name of (await caches.keys()).filter((name) =>
        name.startsWith(PREFIX),
      )) {
        const cache = await caches.open(name);
        const request = (await cache.keys()).find(
          (request) => new URL(request.url).pathname === url.pathname,
        );
        if (request) {
          const response = await cache.match(request);
          if (response) return response;
        }
      }
      return fetch(event.request);
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "office-core-version")
    event.source?.postMessage({
      type: "office-core-version",
      version: VERSION,
    });
});
