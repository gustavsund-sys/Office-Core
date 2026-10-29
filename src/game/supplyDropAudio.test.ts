import { test } from "node:test";
import assert from "node:assert/strict";
import { SupplyDropAudio } from "../audio/supplyDrop";

test("supply audio loops at half volume only during audible descent", async () => {
  const audio = { paused: true, currentTime: 0, loop: false, volume: 1,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  };
  const sound = new SupplyDropAudio(audio as unknown as HTMLAudioElement);
  assert.equal(audio.volume, 0.5);
  assert.equal(audio.loop, true);
  sound.update(true, true);
  await Promise.resolve();
  assert.equal(audio.paused, false);
  sound.update(true, true, 60);
  assert.equal(audio.volume, 0.25);
  sound.update(true, true, 110);
  assert.equal(audio.volume, 0);
  audio.currentTime = 4;
  sound.update(true, false);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 4);
  sound.update(false, true);
  assert.equal(audio.currentTime, 0);
});
