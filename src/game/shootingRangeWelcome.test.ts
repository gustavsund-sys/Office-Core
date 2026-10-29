import { test } from "node:test";
import assert from "node:assert/strict";
import { ShootingRangeWelcome } from "../audio/shootingRangeWelcome";
test("shooting range sound plays once for each spawn and respects mute", () => {
  let plays = 0;
  const sound = new ShootingRangeWelcome({ currentTime: 0, play() { plays++; return Promise.resolve(); } } as unknown as HTMLAudioElement);
  sound.spawn(false); sound.play(true); sound.play(true);
  assert.equal(plays, 1);
  sound.spawn(true); sound.play(true);
  assert.equal(plays, 2);
});
