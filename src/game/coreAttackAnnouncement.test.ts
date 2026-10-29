import { test } from "node:test";
import assert from "node:assert/strict";
import { CoreAttackAnnouncement } from "../audio/coreAttackAnnouncement";
test("each Core announces damage only once per round", () => {
  const plays = { RED: 0, BLUE: 0 };
  const clip = (team: "RED" | "BLUE") => ({ currentTime: 0, play() { plays[team]++; return Promise.resolve(); } }) as unknown as HTMLAudioElement;
  const sounds = new CoreAttackAnnouncement({ RED: clip("RED"), BLUE: clip("BLUE") });
  const cores = [{ team: "RED" as const, hp: 1000, active: true }, { team: "BLUE" as const, hp: 1000, active: true }];
  sounds.update(true, 1, cores, true, "RED");
  cores[0].hp = 990; sounds.update(true, 1, cores, true, "RED"); sounds.update(true, 1, cores, true, "RED");
  cores[1].hp = 900; sounds.update(true, 1, cores, true, "RED");
  assert.deepEqual(plays, { RED: 1, BLUE: 0 });
  const blueListener = new CoreAttackAnnouncement({ RED: clip("RED"), BLUE: clip("BLUE") });
  blueListener.update(true, 1, cores, true, "BLUE");
  assert.deepEqual(plays, { RED: 1, BLUE: 1 });
  cores[0].hp = 1000; cores[1].hp = 1000; sounds.update(true, 2, cores, true, "RED");
  cores[0].hp = 999; sounds.update(true, 2, cores, true, "RED");
  assert.deepEqual(plays, { RED: 2, BLUE: 1 });
});
