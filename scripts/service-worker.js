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
const pending = new Map();
async function resource(request, path) {
  if (pending.has(path)) return (await pending.get(path)).clone();
  const download = cachedResource(request, path);
  pending.set(path, download);
  try {
    return (await download).clone();
  } finally {
    pending.delete(path);
  }
}
async function cachedResource(request, path) {
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
      if (!(await cache.match(key(path))))
        await cache.put(key(path), cached.clone());
    } catch {
      /* A full cache must not interrupt gameplay. */
    }
    return cached;
  }
  // Store complete audio files even when HTMLAudioElement requests a byte range.
  const headers = new Headers(request.headers);
  headers.delete("range");
  const response = await fetch(new Request(request, { headers }), {
    cache: "no-cache",
  });
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
async function rangedResponse(request, response) {
  const range = request.headers.get("range");
  if (!range || response.status !== 200) return response;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return response;
  const data = await response.arrayBuffer();
  const size = data.byteLength;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (start > end || start >= size)
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  const headers = new Headers(response.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  headers.set("Accept-Ranges", "bytes");
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // Cache the complete code/map bundle so old sessions retain their chunks.
      await Promise.all(
        Object.keys(FILES)
          .filter((path) => BOOT_FILES.includes(path))
          .map(async (path) => {
            const response = await resource(
              new Request(new URL(path, self.location.origin)),
              path,
            );
            if (!response.ok)
              throw new Error(`Game update download failed: ${path}`);
          }),
      );
      if (!self.registration.active) await self.skipWaiting();
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
      if (FILES[url.pathname]) {
        const response = await resource(event.request, url.pathname);
        return rangedResponse(event.request, response);
      }
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
const updateChecks = new Map();
async function activateWhenSafe(source) {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const results = await Promise.all(
    clients.map(
      (client) =>
        new Promise((resolve) => {
          const token = client.id + ":" + Date.now();
          const timeout = setTimeout(() => {
            updateChecks.delete(token);
            resolve(false);
          }, 2000);
          updateChecks.set(token, (safe) => {
            clearTimeout(timeout);
            updateChecks.delete(token);
            resolve(safe);
          });
          client.postMessage({ type: "office-core-update-state", token });
        }),
    ),
  );
  if (results.every(Boolean)) await self.skipWaiting();
  else source?.postMessage({ type: "office-core-update-blocked" });
}
self.addEventListener("message", (event) => {
  if (event.data?.type === "office-core-update-state") {
    updateChecks.get(event.data.token)?.(event.data.safe === true);
    return;
  }
  if (event.data?.type === "office-core-activate") {
    event.waitUntil(activateWhenSafe(event.source));
    return;
  }
  if (event.data?.type === "office-core-version")
    event.source?.postMessage({
      type: "office-core-version",
      version: VERSION,
    });
});
