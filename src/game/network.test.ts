import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolateYaw } from "../network/interpolation";
import { validInput } from "../../shared/protocol";
test("network sequence validation rejects malformed and infinite identifiers", () => {
  const input = {
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimZ: 0,
    fire: false,
    pressed: false,
    jump: false,
    interact: false,
    slot: 0,
    seq: 12,
  };
  assert.ok(validInput(input));
  for (const seq of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(validInput({ ...input, seq }), false);
});
test("remote rotation crosses PI without spinning through the map", () => {
  const yaw = interpolateYaw(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
  assert.ok(Math.abs(yaw - Math.PI) < 1e-8);
});
