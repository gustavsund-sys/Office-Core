import { test } from "node:test";
import assert from "node:assert/strict";
import { ShootingRangeWelcome } from "../audio/shootingRangeWelcome";
test("shooting range welcome plays once and respects mute", () => {
  let plays = 0;
  const sound = new ShootingRangeWelcome({ currentTime: 0, play() { plays++; return Promise.resolve(); } } as unknown as HTMLAudioElement);
  sound.play(false); sound.play(true); sound.play(true);
  assert.equal(plays, 1);
});
