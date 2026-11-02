import { test } from "node:test";
import assert from "node:assert/strict";
import { spectatorTarget } from "./spectator";
test("following survives death and switches only when the player leaves", () => {
  const players = [{ id: "a", hp: 100 }, { id: "b", hp: 0 }];
  assert.equal(spectatorTarget(players, "b")?.id, "b");
  assert.equal(spectatorTarget(players, "missing")?.id, "a");
  assert.equal(spectatorTarget([], "b"), undefined);
});
