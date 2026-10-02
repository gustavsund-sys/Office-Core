import { test } from "node:test";
import { strict as assert } from "node:assert";
import { WeaponAudio } from "../audio/weapons";
function mockContext() {
  const sources: any[] = [];
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    cancelAndHoldAtTime() {},
    setTargetAtTime() {},
  });
  const node = () => ({
    connect(other: any) {
      return other;
    },
    disconnect() {},
  });
  const context = {
    currentTime: 0,
    sampleRate: 1000,
    destination: node(),
    createGain: () => ({ ...node(), gain: parameter() }),
    createDynamicsCompressor: () => ({
      ...node(),
      threshold: parameter(),
      ratio: parameter(),
    }),
    createBuffer: (channels: number, length: number, rate: number) => {
      const data = Array.from(
        { length: channels },
        () => new Float32Array(length),
      );
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        getChannelData: (i: number) => data[i],
      };
    },
    createBufferSource: () => {
      const source = {
        ...node(),
        buffer: null,
        loop: false,
        started: false,
        stopped: false,
        playbackRate: parameter(),
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
  };
  return { context, sources };
}
test("sustained fire renews sound for every shot through the entire magazine", () => {
  const { context, sources } = mockContext();
  const audio = new WeaponAudio(context as unknown as AudioContext);
  audio.buffers.set(
    "machineGun",
    context.createBuffer(1, 800, 1000) as AudioBuffer,
  );
  for (let i = 0; i < 100; i++) {
    context.currentTime = i * 0.1;
    audio.play("machineGun");
  }
  assert.equal(sources.length, 100);
  assert.ok(sources.every((s) => s.started && !s.loop));
  assert.ok(sources.slice(0, -1).every((s) => s.stopped));
  assert.equal(sources.at(-1).stopped, false);
  audio.releaseMachineGun();
  assert.equal(sources.at(-1).stopped, false, "release preserves natural tail");
  audio.play("machineGun");
  assert.equal(sources.length, 101);
  audio.releaseMachineGun(false);
  assert.equal(
    sources.at(-1).stopped,
    true,
    "pause or mute stops active sound",
  );
});
test("single click plays once and is not cut on trigger release", () => {
  const { context, sources } = mockContext();
  const audio = new WeaponAudio(context as unknown as AudioContext);
  audio.buffers.set(
    "machineGun",
    context.createBuffer(1, 800, 1000) as AudioBuffer,
  );
  audio.play("machineGun");
  audio.releaseMachineGun();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].stopped, false);
});
