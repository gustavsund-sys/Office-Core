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
  options = {},
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
    SOURCE_URLS: options.sources ?? {},
    AbortSignal: options.abortSignal ?? AbortSignal,
    setTimeout,
    clearTimeout,
    Request,
    Response,
    Headers,
    URL,
    Map,
    caches: options.noStorage ? {open: async () => {throw new Error("Storage disabled");}} : caches,
    self: {
      location: { origin: "https://office.test" },
      addEventListener(name, fn) {
        handlers[name] = fn;
      },
    },
    async fetch(r) {
      downloads++;
      if (options.fetch) return options.fetch(r);
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
test("live gameplay APIs and the startup version manifest are never cached", async () => {
  const s = setup();
  assert.equal(await s.get("/map"), undefined);
  assert.equal(await s.get("/game-version.json"), undefined);
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

test("new VFX textures are persistent and refresh only when their content changes", async () => {
  const s = setup({ "/vfx/fire/gas-bomb-005c.webp": "effect1" });
  await s.get("/vfx/fire/gas-bomb-005c.webp");
  await s.get("/vfx/fire/gas-bomb-005c.webp");
  assert.equal(s.downloads, 1);
  const next = setup({ "/vfx/fire/gas-bomb-005c.webp": "effect1" }, s.stores);
  await next.get("/vfx/fire/gas-bomb-005c.webp");
  assert.equal(next.downloads, 0);
  const changed = setup(
    { "/vfx/fire/gas-bomb-005c.webp": "effect2" },
    s.stores,
  );
  await changed.get("/vfx/fire/gas-bomb-005c.webp");
  assert.equal(changed.downloads, 1);
});

test("runtime manifest includes licensed local effects and UI, excluding videos and source archives", async () => {
  const { runtimeAssets } = await import("./runtime-assets.mjs");
  const assets = runtimeAssets();
  assert.ok(assets.some((a) => a.url === "/vfx/muzzle/numbered-4.png"));
  assert.ok(assets.some((a) => a.url === "/ui/equipment/bossKey.svg"));
  assert.equal(
    assets.some((a) => a.url.endsWith(".mp4") || a.url.endsWith(".zip")),
    false,
  );
  assert.ok(assets.every((a) => a.bytes > 0 && a.hash.length === 16));
});

test("preload excludes unused source artwork and superseded recordings without excluding live counterparts", async () => {
  const { runtimeAssets } = await import("./runtime-assets.mjs");
  const urls = new Set(runtimeAssets().map((a) => a.url));
  assert.equal(urls.has("/branding/office-core-primary.png"), false);
  assert.equal(urls.has("/audio/music/office-groove.mp3"), false);
  assert.ok(urls.has("/branding/office-core-primary.webp"));
  assert.ok(urls.has("/audio/music/tactical-pulse.mp3"));
  assert.ok(urls.has("/audio/beacon-movement/00.m4a"));
});

for (const failure of ["http", "html", "empty", "network"]) {
  test(`Pages ${failure} falls back once and caches Firebase response`, async () => {
    const urls = [];
    const s = setup({"/audio/music/test.mp3": "one"}, undefined, {
      sources: {"/audio/music/test.mp3": "https://media.test/one/test.mp3"},
      fetch: async r => {
        urls.push(r.url);
        if (r.url.startsWith("https://media.test")) {
          if (failure === "network") throw new Error("offline");
          return new Response(failure === "empty" ? "" : "bad", {
            status: failure === "http" ? 503 : 200,
            headers: {"content-type": failure === "html" ? "text/html" : "audio/mpeg"}
          });
        }
        return new Response("0123456789", {headers: {"content-type": "audio/mpeg"}});
      }
    });
    assert.equal(await (await s.get("/audio/music/test.mp3", "bytes=2-5")).text(), "2345");
    await s.get("/audio/music/test.mp3");
    assert.deepEqual(urls, ["https://media.test/one/test.mp3", "https://office.test/audio/music/test.mp3"]);
  });
}
test("healthy Pages media downloads once, without Firebase, and survives releases", async () => {
  const sources = {"/loadout/pulseGun.webp": "https://media.test/image1/art.webp"};
  const s = setup(undefined, undefined, {sources, fetch: async r => {
    assert.equal(r.url, sources["/loadout/pulseGun.webp"]);
    return new Response("image", {headers: {"content-type": "image/webp"}});
  }});
  assert.equal(await (await s.get("/loadout/pulseGun.webp")).text(), "image");
  await s.get("/loadout/pulseGun.webp");
  assert.equal(s.downloads, 1);
  const next = setup({"/loadout/pulseGun.webp": "image1", "/audio/reload.mp3": "audio2"}, s.stores, {sources});
  assert.equal(await (await next.get("/loadout/pulseGun.webp")).text(), "image");
  assert.equal(next.downloads, 0);
});
test("published media allowlist excludes stock effects and contains hashed source URLs", async () => {
  const {hostedAssets} = await import("./runtime-assets.mjs");
  const assets = hostedAssets();
  assert.equal(assets.length, 14);
  assert.ok(assets.every(a => a.source.includes(`/static/${a.hash}${a.url}`)));
  assert.ok(assets.every(a => !a.url.includes("/vfx/")));
});

test("Pages body timeout falls back to Firebase", async () => {
  const s = setup({"/audio/test.mp3": "one"}, undefined, {
    sources: {"/audio/test.mp3": "https://media.test/test.mp3"},
    abortSignal: {timeout: () => AbortSignal.timeout(5)},
    fetch: async r => {
      if (r.url.startsWith("https://media.test")) return {
        ok: true, type: "cors", headers: new Headers({"content-type": "audio/mpeg"}),
        arrayBuffer: () => new Promise((resolve, reject) => {
          r.signal.addEventListener("abort", () => reject(new Error("Timeout")), {once: true});
        })
      };
      return new Response("fallback");
    }
  });
  // Keep Node alive while AbortSignal's unreferenced timeout fires.
  const keepAlive = setTimeout(() => {}, 1000);
  try {assert.equal(await (await s.get("/audio/test.mp3")).text(), "fallback");}
  finally {clearTimeout(keepAlive);}
  assert.equal(s.downloads, 2);
});
test("disabled persistent storage still uses Pages", async () => {
  const s = setup({"/audio/test.mp3": "one"}, undefined, {
    sources: {"/audio/test.mp3": "https://media.test/test.mp3"}, noStorage: true,
    fetch: async r => {
      assert.equal(r.url, "https://media.test/test.mp3");
      return new Response("sound", {headers: {"content-type": "audio/mpeg"}});
    }
  });
  assert.equal(await (await s.get("/audio/test.mp3")).text(), "sound");
});
