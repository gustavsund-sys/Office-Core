import { test } from "node:test";
import assert from "node:assert/strict";
import { RoundSpawnAudio } from "../audio/roundSpawn";

test("plays the player's team announcement once per round, not on respawn", () => {
  const plays = { RED: 0, BLUE: 0 };
  const sound = (team: "RED" | "BLUE") => ({ currentTime: 0, play() { plays[team]++; return Promise.resolve(); } }) as unknown as HTMLAudioElement;
  const audio = new RoundSpawnAudio({ RED: sound("RED"), BLUE: sound("BLUE") });
  audio.update(true, 1, "RED", false, true);
  audio.update(true, 1, "RED", true, true);
  audio.update(true, 1, "RED", false, true);
  audio.update(true, 1, "RED", true, true);
  assert.deepEqual(plays, { RED: 1, BLUE: 0 });
  audio.update(true, 2, "BLUE", true, true);
  assert.deepEqual(plays, { RED: 1, BLUE: 1 });
  audio.update(false, 1, "RED", true, true);
  audio.update(true, 1, "RED", true, false);
  audio.update(true, 1, "RED", true, true);
  assert.deepEqual(plays, { RED: 1, BLUE: 1 });
});
