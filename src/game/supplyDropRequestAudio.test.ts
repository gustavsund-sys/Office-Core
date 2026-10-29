import { test } from "node:test";
import assert from "node:assert/strict";
import { SupplyDropRequestAudio } from "../audio/supplyDropRequest";
import type { SupplyState } from "./supplyDrop";

test("request sound plays once for the requesting team and never for the opponent", () => {
  let plays = 0;
  const audio = { currentTime: 0, play() { plays++; return Promise.resolve(); } };
  const sound = new SupplyDropRequestAudio(audio as unknown as HTMLAudioElement);
  const drop: SupplyState = { team: "RED", x: 0, z: 0, remaining: 30, items: [] };
  sound.update(drop, "BLUE", true);
  sound.update(drop, "BLUE", true);
  assert.equal(plays, 0);
  sound.update(undefined, "RED", true);
  sound.update(drop, "RED", true);
  sound.update(drop, "RED", true);
  assert.equal(plays, 1);
  sound.update(undefined, "RED", true);
  sound.update(drop, "RED", false);
  assert.equal(plays, 1);
});
