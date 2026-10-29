import { test } from "node:test";
import assert from "node:assert/strict";
import { CombatAnnouncements } from "../audio/combatAnnouncements";

test("announces every third low-health entry, first kill per round and five consecutive kills", () => {
  const plays = { hurt: 0, first: 0, spree: 0 };
  const clip = (key: keyof typeof plays) => ({ currentTime: 0, play() { plays[key]++; return Promise.resolve(); } }) as unknown as HTMLAudioElement;
  const audio = new CombatAnnouncements({ hurt: clip("hurt"), first: clip("first"), spree: clip("spree") });
  audio.update(true, 1, 100, true);
  for (let i = 0; i < 3; i++) { audio.update(true, 1, 19, true); audio.update(true, 1, 19, true); audio.update(true, 1, 30, true); }
  assert.equal(plays.hurt, 1);
  for (let i = 0; i < 4; i++) audio.kill(true);
  audio.death();
  for (let i = 0; i < 5; i++) audio.kill(true);
  assert.deepEqual(plays, { hurt: 1, first: 1, spree: 1 });
  audio.kill(true);
  assert.equal(plays.spree, 1);
  audio.update(true, 2, 100, true);
  audio.kill(true);
  assert.equal(plays.first, 2);
});
