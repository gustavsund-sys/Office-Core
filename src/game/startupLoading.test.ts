import test from "node:test";
import assert from "node:assert/strict";
import { loadingPercent } from "../ui/startupLoading";
import { warmAudioSilently } from "../audio/warmup";
test("loading progress never moves backward between stages, and invalid updates cannot corrupt it", () => {
  assert.equal(loadingPercent(62, 58), 62);
  assert.equal(loadingPercent(8, 36.5), 36.5);
  assert.equal(loadingPercent(99, 120), 100);
  assert.equal(loadingPercent(62, NaN), 62);
});
test("audio rehearsal runs offline through a zero gain and never starts a realtime audio context", async () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "OfflineAudioContext",
  );
  const gainValues: number[] = [];
  let sources = 0,
    starts = 0,
    renders = 0;
  class Offline {
    destination = {};
    createGain() {
      const node = {
        gain: { value: 1 },
        connect: () => {
          gainValues.push(node.gain.value);
        },
      };
      return node;
    }
    createBufferSource() {
      sources++;
      return {
        buffer: null,
        connect: (next: unknown) => next,
        start: () => starts++,
      };
    }
    createBiquadFilter() {
      return {
        type: "",
        frequency: { value: 0 },
        connect: (next: unknown) => next,
      };
    }
    createStereoPanner() {
      return { connect: (next: unknown) => next };
    }
    async startRendering() {
      renders++;
      return {
        numberOfChannels: 2,
        getChannelData: () => new Float32Array(4096).fill(gainValues[0]),
      };
    }
  }
  Object.defineProperty(globalThis, "OfflineAudioContext", {
    configurable: true,
    value: Offline,
  });
  try {
    await warmAudioSilently([
      { duration: 0.5 },
      { duration: 1 },
    ] as AudioBuffer[]);
    assert.deepEqual(gainValues, [0]);
    assert.equal(sources, 2);
    assert.equal(starts, 2);
    assert.equal(renders, 1);
  } finally {
    if (original)
      Object.defineProperty(globalThis, "OfflineAudioContext", original);
    else Reflect.deleteProperty(globalThis, "OfflineAudioContext");
  }
});
