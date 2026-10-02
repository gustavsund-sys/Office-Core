import { test } from "node:test";
import { strict as assert } from "node:assert";
import { blocked, move } from "./collision.ts";
const wall = { x: 0, z: 0, w: 1, d: 10 };
test("circle stops at walls and slides along them", () => {
  const p = { x: -1, z: 0 };
  move(p, 2, 2, 0.36, [wall]);
  assert.ok(p.x <= -0.85);
  assert.ok(p.z > 1.9);
});
test("large steps cannot tunnel through a thin wall", () => {
  const p = { x: -5, z: 0 };
  move(p, 10, 0, 0.36, [{ ...wall, w: 0.1 }]);
  assert.ok(p.x < 0);
});
test("rounded collision permits movement past a corner", () => {
  assert.equal(blocked(0.8, 5.3, 0.36, [wall]), false);
  assert.equal(blocked(0.6, 5.1, 0.36, [wall]), true);
});
