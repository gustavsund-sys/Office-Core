import test from "node:test";
import assert from "node:assert/strict";
import { preloadResources } from "../network/preload";

test("startup waits for complete response bodies, deduplicates requests and bounds concurrent downloads", async () => {
  let active = 0,
    peak = 0,
    completed = 0,
    calls = 0;
  const assets = Array.from({ length: 12 }, (_, i) => ({
    url: `/vfx/${i}.png`,
    bytes: 4,
  }));
  const report = await preloadResources([...assets, assets[0]], {
    concurrency: 3,
    fetcher: (async () => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      return new Response(
        new ReadableStream({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(new TextEncoder().encode("data"));
              controller.close();
              active--;
              completed++;
            }, 5);
          },
        }),
        { headers: { "Content-Type": "image/png" } },
      );
    }) as typeof fetch,
  });
  assert.equal(completed, 12);
  assert.equal(calls, 12);
  assert.equal(peak, 3);
  assert.deepEqual(report, { count: 12, bytes: 48 });
});
test("startup retries failed assets and rejects HTML fallback pages instead of treating them as loaded textures", async () => {
  const attempts = new Map<string, number>();
  await assert.rejects(
    preloadResources([{ url: "/vfx/missing.webp", bytes: 10 }], {
      fetcher: (async (url) => {
        attempts.set(String(url), (attempts.get(String(url)) ?? 0) + 1);
        return new Response("<html>App shell</html>", {
          headers: { "Content-Type": "text/html" },
        });
      }) as typeof fetch,
    }),
    /missing.webp/,
  );
  assert.equal(attempts.get("/vfx/missing.webp"), 2);
  let tries = 0;
  await preloadResources([{ url: "/audio/rc-static.mp3", bytes: 10 }], {
    fetcher: (async () =>
      ++tries === 1
        ? new Response("unavailable", { status: 503 })
        : new Response("audio")) as typeof fetch,
  });
  assert.equal(tries, 2);
});
