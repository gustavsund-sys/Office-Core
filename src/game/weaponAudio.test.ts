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
test("player hit audio counts separately, varies grunts and resets on respawn", () => {
  const { context } = mockContext();
  const audio = new WeaponAudio(context as unknown as AudioContext);
  const played: {
    name: string;
    distance: number;
    pan: number;
    volume?: number;
  }[] = [];
  audio.playSpatialSample = (name, distance, pan, volume) => {
    played.push({ name, distance, pan, volume });
    return true;
  };
  for (let hit = 1; hit <= 12; hit++) {
    const before = played.length;
    audio.playPlayerHit("red", 8, 0.5);
    assert.equal(
      played.length - before,
      Number(hit % 3 === 0) + Number(hit % 4 === 0),
    );
  }
  assert.equal(played.filter((p) => p.name === "bulletImpact").length, 3);
  const grunts = played.filter((p) => p.name.startsWith("grunt"));
  assert.equal(grunts.length, 4);
  assert.ok(grunts.every((p) => /^grunt[1-5]$/.test(p.name)));
  assert.ok(grunts.slice(1).every((p, i) => p.name !== grunts[i].name));
  assert.ok(played.every((p) => p.distance === 8 && p.pan === 0.5));
  const count = played.length;
  audio.playPlayerHit("blue");
  audio.resetPlayerHits("red");
  audio.playPlayerHit("red");
  assert.equal(played.length, count);
  audio.playPlayerHit("blue", 0, 0, false);
  audio.playPlayerHit("blue");
  assert.equal(played.length, count + 1);
  audio.playDeath(12, -0.5);
  assert.equal(played.at(-1)?.name, "deathScream");
  assert.equal(played.at(-1)?.distance, 12);
});
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

test("exhaustion picks among three breath recordings without consecutive repeats", () => {
  const { context } = mockContext();
  const audio = new WeaponAudio(context as unknown as AudioContext);
  const names: string[] = [];
  audio.playSpatialSample = (name, distance, pan) => {
    assert.equal(distance, 8);
    assert.equal(pan, 0.25);
    names.push(name);
    return true;
  };
  for (let i = 0; i < 20; i++) audio.playExhaustedBreath(8, 0.25);
  assert.ok(names.every((name) => /^breath[123]$/.test(name)));
  assert.ok(names.slice(1).every((name, i) => name !== names[i]));
});

test("turret taps retain the isolated final report; held fire uses one series voice and a release tail", () => {
  const { context, sources } = mockContext();
  const audio = new WeaponAudio(context as unknown as AudioContext);
  const recording = context.createBuffer(1, 5600, 1000);
  const samples = recording.getChannelData(0);
  for (const onset of [
    40, 160, 280, 400, 520, 640, 760, 880, 1000, 1120, 1240, 1360, 1480, 1600,
    1720,
  ]) {
    for (let i = 0; i < 16; i++) samples[onset + i] = 1 - i / 20;
  }
  audio.prepareTurret(recording as unknown as AudioBuffer);
  const single = audio.buffers.get("turretSingle")!;
  assert.ok(single.length > 3700 && single.length < 4000);
  audio.playTurret();
  assert.equal(sources[0].buffer, single);
  audio.updateTurret(false);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].stopped, false);
  audio.playTurret();
  context.currentTime = 0.1;
  audio.playTurret();
  assert.equal(sources.at(-1).loop, true);
  assert.equal(sources.at(-1).buffer, audio.buffers.get("turret"));
  const count = sources.length;
  audio.playTurret();
  assert.equal(sources.length, count);
  audio.updateTurret(false);
  assert.equal(sources.at(-1).buffer, single);
  assert.equal(sources.at(-1).loop, false);
  audio.updateTurret(false);
  assert.equal(sources.length, count + 1);
});
