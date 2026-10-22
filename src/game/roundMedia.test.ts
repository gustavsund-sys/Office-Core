import { test } from "node:test";
import assert from "node:assert/strict";
import { RoundMedia, coreEndingVideo } from "./roundMedia";

test("round media starts at a breach, respects mute, stops at round end, and plays the correct ending once", async () => {
  const previousDocument = globalThis.document,
    previousAudio = globalThis.Audio;
  const audios: FakeElement[] = [],
    elements: FakeElement[] = [];
  class FakeElement {
    src = "";
    preload = "";
    loop = false;
    volume = 1;
    currentTime = 0;
    paused = true;
    muted = false;
    style = {};
    children: FakeElement[] = [];
    parent?: FakeElement;
    onended?: (() => void) | null;
    onerror?: (() => void) | null;
    plays = 0;
    removes = 0;
    constructor(src = "") {
      this.src = src;
    }
    play() {
      this.paused = false;
      this.plays++;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    load() {}
    focus() {}
    setAttribute() {}
    removeAttribute(name: string) {
      if (name === "src") this.src = "";
    }
    append(...items: FakeElement[]) {
      for (const item of items) {
        item.parent = this;
        this.children.push(item);
      }
    }
    remove() {
      this.removes++;
      if (this.parent)
        this.parent.children = this.parent.children.filter((c) => c !== this);
    }
  }
  const body = new FakeElement();
  globalThis.Audio = class extends FakeElement {
    constructor(src: string) {
      super(src);
      audios.push(this);
    }
  } as unknown as typeof Audio;
  globalThis.document = {
    body,
    addEventListener() {},
    createElement(name: string) {
      const el = new FakeElement();
      elements.push(el);
      return el;
    },
  } as unknown as Document;
  try {
    const media = new RoundMedia(),
      music = audios[0];
    assert.equal(music.src, "/audio/music/core-under-attack-v3.mp3");
    assert.equal(music.volume, 0.5);
    assert.equal(music.loop, true);
    assert.equal(music.preload, "none");
    media.sync(1, true, false, false, true);
    assert.equal(music.plays, 0);
    media.sync(1, true, false, true, true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(music.plays, 1);
    media.sync(1, true, false, true, true);
    assert.equal(music.plays, 1);
    media.sync(1, true, false, true, false);
    assert.equal(music.paused, true);
    media.sync(1, true, true, true, true);
    media.playCore("BLUE");
    const blue = elements.find((el) =>
      el.src.endsWith("blue-core-explosion-v1.mp4"),
    )!;
    assert.ok(blue);
    assert.equal(blue.plays, 1);
    assert.equal(music.paused, true);
    media.playCore("BLUE");
    assert.equal(blue.plays, 1);
    blue.onended?.();
    assert.equal(body.children.length, 0);
    media.sync(2, true, false, false, true);
    media.playCore("RED");
    assert.ok(
      elements.some((el) => el.src.endsWith("red-core-explosion-v1.mp4")),
    );
    media.sync(2, false, false, false, true);
    assert.equal(body.children.length, 0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.Audio = previousAudio;
  }
});

test("Core movies use GitHub Pages in production and local files in preview", () => {
  assert.equal(
    coreEndingVideo("BLUE", false),
    "https://gustavsund-sys.github.io/Office-Core/media/blue-core-explosion-v1.mp4",
  );
  assert.equal(
    coreEndingVideo("RED", false),
    "https://gustavsund-sys.github.io/Office-Core/media/red-core-explosion-v1.mp4",
  );
  assert.equal(coreEndingVideo("BLUE", true), "/video/blue-core-explosion.mp4");
  assert.equal(coreEndingVideo("RED", true), "/video/red-core-explosion.mp4");
});

test("simultaneous Core breaches and input events share one pending audio playback without restarting it", async () => {
  const previousDocument = globalThis.document,
    previousAudio = globalThis.Audio;
  const listeners = new Map<string, () => void>();
  let instances = 0,
    resolvePlay!: () => void;
  class PendingAudio {
    preload = "";
    loop = false;
    volume = 1;
    currentTime = 0;
    paused = true;
    plays = 0;
    constructor(public src: string) {
      instances++;
    }
    play() {
      this.plays++;
      return new Promise<void>((resolve) => {
        resolvePlay = () => {
          this.paused = false;
          resolve();
        };
      });
    }
    pause() {
      this.paused = true;
    }
  }
  globalThis.Audio = PendingAudio as unknown as typeof Audio;
  globalThis.document = {
    addEventListener(type: string, handler: () => void) {
      listeners.set(type, handler);
    },
  } as unknown as Document;
  try {
    const media = new RoundMedia();
    const music = (media as unknown as { music: PendingAudio }).music;
    media.sync(1, true, false, true, true);
    media.sync(1, true, false, true, true);
    listeners.get("pointerdown")!();
    listeners.get("keydown")!();
    assert.equal(instances, 1);
    assert.equal(music.plays, 1);
    assert.equal(music.volume, 0.5);
    resolvePlay();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    music.currentTime = 17;
    media.sync(1, true, false, true, true);
    listeners.get("pointerdown")!();
    assert.equal(music.plays, 1);
    assert.equal(music.currentTime, 17);
    media.sync(1, true, true, true, true);
    assert.equal(music.paused, true);
    assert.equal(music.currentTime, 0);
  } finally {
    globalThis.Audio = previousAudio;
    globalThis.document = previousDocument;
  }
});
