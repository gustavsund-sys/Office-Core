import { test } from "node:test";
import assert from "node:assert/strict";
import { SupplyDropLandingAudio } from "../audio/supplyDropLanding";
import type { SupplyState } from "./supplyDrop";
test("landing plays once with distance attenuation, never for a reset or a late snapshot", () => {
  let plays = 0;
  const clip = { volume: 1, currentTime: 0, play() { plays++; return Promise.resolve(); } };
  const sound = new SupplyDropLandingAudio(clip as unknown as HTMLAudioElement);
  const state: SupplyState = { team: "RED", x: 0, z: 0, remaining: 0, items: [] };
  sound.update(state, true, 0);
  assert.equal(plays, 0);
  state.remaining = 1; sound.update(state, true, 30);
  state.remaining = 0; sound.update(state, true, 30); sound.update(state, true, 30);
  assert.equal(plays, 1); assert.equal(clip.volume, 0.5);
  state.remaining = 1; sound.update(state, true, 0); sound.update(undefined, true, 0);
  assert.equal(plays, 1);
});
