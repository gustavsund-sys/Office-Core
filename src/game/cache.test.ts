import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
test("versioned cache reuses unchanged content, fetches revisions and retains two versions", async () => {
  const stores = new Map<string, Map<string, Response>>();
  let downloads = 0;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return {
        put: async (request: Request, response: Response) => {
          stores.get(name)!.set(request.url, response.clone());
        },
      };
    },
    match: async (request: Request) => {
      for (const store of stores.values()) {
        const response = store.get(request.url);
        if (response) return response.clone();
      }
      return undefined;
    },
  };
  const install = async (version: string, hash: string) => {
    const handlers: Record<
      string,
      (event: { waitUntil: (p: Promise<unknown>) => void }) => void
    > = {};
    const self = {
      location: { origin: "https://game.test" },
      addEventListener: (name: string, fn: (typeof handlers)[string]) => {
        handlers[name] = fn;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [] },
    };
    runInNewContext(
      `const VERSION=${JSON.stringify(version)};const FILES={"/assets/map.js":${JSON.stringify(hash)}};\n` +
        readFileSync("scripts/service-worker.js", "utf8"),
      {
        self,
        caches,
        Request,
        Response,
        URL,
        fetch: async () => {
          downloads++;
          return new Response("map", {
            headers: { "content-type": "text/javascript" },
          });
        },
      },
    );
    await new Promise<void>((resolve, reject) =>
      handlers.install({ waitUntil: (p) => p.then(() => resolve(), reject) }),
    );
    await new Promise<void>((resolve, reject) =>
      handlers.activate({ waitUntil: (p) => p.then(() => resolve(), reject) }),
    );
  };
  await install("one", "same");
  assert.equal(downloads, 1);
  await install("two", "same");
  assert.equal(downloads, 1);
  await install("three", "changed");
  assert.equal(downloads, 2);
  assert.deepEqual(
    [...stores.keys()],
    ["office-core-two", "office-core-three"],
  );
});
