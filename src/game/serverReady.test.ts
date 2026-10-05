import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchServer } from "../network/serverReady";
test("cold start keeps loading through timeout and transient HTTP errors until ready", async () => {
  let attempts = 0,
    waiting = 0;
  const fetcher = (async () => {
    attempts++;
    if (attempts === 1) throw new DOMException("Timed out", "TimeoutError");
    return new Response("{}", { status: attempts < 4 ? 503 : 200 });
  }) as typeof fetch;
  const response = await fetchServer("http://server/map", {
    fetcher,
    onWaiting: () => waiting++,
    pause: async () => {},
  });
  assert.equal(response.status, 200);
  assert.equal(attempts, 4);
  assert.equal(waiting, 3);
});
test("permanent errors are surfaced rather than retried", async () => {
  let attempts = 0;
  await assert.rejects(
    fetchServer("http://server/map", {
      fetcher: (async () => {
        attempts++;
        return new Response("", { status: 403 });
      }) as typeof fetch,
    }),
    /403/,
  );
  assert.equal(attempts, 1);
});
test("leaving or idle timeout cancels retries", async () => {
  const controller = new AbortController();
  let attempts = 0;
  await assert.rejects(
    fetchServer("http://server/map", {
      signal: controller.signal,
      fetcher: (async () => {
        attempts++;
        throw new TypeError("Network unavailable");
      }) as typeof fetch,
      pause: async () => controller.abort(),
    }),
    { name: "AbortError" },
  );
  assert.equal(attempts, 1);
});
