import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const template = readFileSync(
  new URL("./service-worker.js", import.meta.url),
  "utf8",
);
function setup(
  files = { "/loadout/pulseGun.webp": "image1", "/audio/reload.mp3": "audio1" },
  previous,
) {
  const stores = previous ?? new Map(),
    handlers = {};
  let downloads = 0;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return {
        async match(r) {
          return data.get(r.url)?.clone();
        },
        async put(r, v) {
          data.set(r.url, v.clone());
        },
        async keys() {
          return [...data.keys()].map((u) => new Request(u));
        },
      };
    },
    async match(r) {
      for (const data of stores.values())
        if (data.has(r.url)) return data.get(r.url).clone();
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  const ctx = vm.createContext({
    VERSION: "v" + Object.values(files).join("-"),
    FILES: files,
    BOOT_FILES: [],
    setTimeout,
    clearTimeout,
    Request,
    Response,
    Headers,
    URL,
    Map,
    caches,
    self: {
      location: { origin: "https://office.test" },
      addEventListener(name, fn) {
        handlers[name] = fn;
      },
    },
    async fetch(r) {
      downloads++;
      assert.equal(r.headers.get("range"), null);
      return new Response("0123456789", {
        headers: {
          "Content-Type": r.url.includes(".mp3") ? "audio/mpeg" : "image/webp",
        },
      });
    },
  });
  vm.runInContext(template, ctx);
  const get = async (path, range) => {
    let result;
    handlers.fetch({
      request: new Request("https://office.test" + path, {
        headers: range ? { range } : {},
      }),
      respondWith(p) {
        result = p;
      },
    });
    return result;
  };
  return {
    get,
    stores,
    handlers,
    self: ctx.self,
    get downloads() {
      return downloads;
    },
  };
}
test("rejoining fetches cached art and audio without downloading again", async () => {
  const s = setup();
  await (await s.get("/loadout/pulseGun.webp")).text();
  await (await s.get("/loadout/pulseGun.webp")).text();
  assert.equal(s.downloads, 1);
  const sound = await s.get("/audio/reload.mp3", "bytes=2-5");
  assert.equal(sound.status, 206);
  assert.equal(await sound.text(), "2345");
  const again = await s.get("/audio/reload.mp3", "bytes=7-");
  assert.equal(await again.text(), "789");
  assert.equal(s.downloads, 2);
});
test("same bytes survive release changes; changed art downloads once", async () => {
  const old = setup();
  await old.get("/loadout/pulseGun.webp");
  const next = setup(
    { "/loadout/pulseGun.webp": "image1", "/audio/reload.mp3": "audio2" },
    old.stores,
  );
  await next.get("/loadout/pulseGun.webp");
  assert.equal(next.downloads, 0);
  const changed = setup({ "/loadout/pulseGun.webp": "image2" }, old.stores);
  await changed.get("/loadout/pulseGun.webp");
  await changed.get("/loadout/pulseGun.webp");
  assert.equal(changed.downloads, 1);
});
test("simultaneous requests share a download; invalid byte range returns 416", async () => {
  const s = setup();
  const responses = await Promise.all([
    s.get("/audio/reload.mp3"),
    s.get("/audio/reload.mp3"),
  ]);
  assert.equal(s.downloads, 1);
  assert.deepEqual(await Promise.all(responses.map((r) => r.text())), [
    "0123456789",
    "0123456789",
  ]);
  assert.equal((await s.get("/audio/reload.mp3", "bytes=100-")).status, 416);
});
test("live gameplay APIs are never cached", async () => {
  const s = setup();
  assert.equal(await s.get("/map"), undefined);
  assert.equal(s.downloads, 0);
});

test("waiting update refuses activation while any game tab is busy", async () => {
  const s = setup();
  let activations = 0,
    blocked = 0;
  s.self.skipWaiting = async () => activations++;
  s.self.clients = {
    matchAll: async () => [
      {
        id: "active-game",
        postMessage(m) {
          s.handlers.message({ data: { ...m, safe: false } });
        },
      },
    ],
  };
  let done;
  s.handlers.message({
    data: { type: "office-core-activate" },
    source: {
      postMessage() {
        blocked++;
      },
    },
    waitUntil(p) {
      done = p;
    },
  });
  await done;
  assert.equal(activations, 0);
  assert.equal(blocked, 1);
  s.self.clients = {
    matchAll: async () => [
      {
        id: "lobby",
        postMessage(m) {
          s.handlers.message({ data: { ...m, safe: true } });
        },
      },
    ],
  };
  s.handlers.message({
    data: { type: "office-core-activate" },
    waitUntil(p) {
      done = p;
    },
  });
  await done;
  assert.equal(activations, 1);
});
