import test from "node:test";
import assert from "node:assert/strict";
import { renderSize, readResolution, saveResolution } from "./graphicsSettings";
import { readControlScheme, saveControlScheme } from "./controlSettings";
import { audioOutput, setVolume } from "../audio/mixer";

test("manual resolution is independent of detail level and retains screen proportions", () => {
  for (const tier of ["low", "medium", "standard"] as const) {
    for (const height of [720, 1080, 1440] as const) {
      const size = renderSize(1920, 1080, tier, height);
      assert.equal(size.width, (height * 16) / 9);
      assert.equal(size.height, height);
    }
    const portrait = renderSize(900, 1600, tier, 1080);
    assert.equal(portrait.height, 1080);
    assert.ok(Math.abs(portrait.width / portrait.height - 900 / 1600) < 0.001);
  }
});

test("control defaults are classic and mobile preferences stay separate", () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const doc = Object.getOwnPropertyDescriptor(globalThis, "document");
  const values = new Map<string, string>();
  const fakeDocument = { documentElement: { dataset: { client: "desktop" } } };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: fakeDocument,
  });
  try {
    assert.equal(readControlScheme(), "classic");
    assert.equal(readResolution(), 1080);
    saveControlScheme("aim");
    saveResolution(1440);
    fakeDocument.documentElement.dataset.client = "mobile";
    assert.equal(readControlScheme(), "classic");
    assert.equal(readResolution(), 1080);
    saveResolution(720);
    fakeDocument.documentElement.dataset.client = "desktop";
    assert.equal(readControlScheme(), "aim");
    assert.equal(readResolution(), 1440);
  } finally {
    if (storage) Object.defineProperty(globalThis, "localStorage", storage);
    else Reflect.deleteProperty(globalThis, "localStorage");
    if (doc) Object.defineProperty(globalThis, "document", doc);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("music and effects master gains change independently without touching spatial gains", () => {
  const context = {
    currentTime: 0,
    destination: {},
    createGain: () => ({
      gain: {
        value: 1,
        setTargetAtTime(value: number) {
          this.value = value;
        },
      },
      connect() {},
    }),
  } as any;
  const music = audioOutput(context, "music"),
    effects = audioOutput(context, "effects");
  assert.equal(
    audioOutput(context, "effects"),
    effects,
    "each context reuses its channel master",
  );
  setVolume("music", 0.25);
  setVolume("effects", 0.6);
  assert.equal(music.gain.value, 0.25);
  assert.equal(effects.gain.value, 0.6);
  setVolume("music", 0);
  assert.equal(effects.gain.value, 0.6);
  setVolume("effects", 0);
  assert.equal(effects.gain.value, 0);
  setVolume("music", 1);
  setVolume("effects", 1);
});
