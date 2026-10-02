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

import { ShotPrediction } from "../network/shotPrediction";
test("predicted pistol responds on the first frame and respects semi-auto cooldown", () => {
  const p = new ShotPrediction();
  assert.deepEqual(p.update("pistol", 0, true, true, true), { audio: true });
  assert.equal(p.update("pistol", 0.1, true, true, true), undefined);
  assert.equal(p.update("pistol", 0.2, true, false, true), undefined);
  assert.ok(p.update("pistol", 0, true, true, true));
});
test("predicted bursts have five traces, one audio salvo and the one-second pause", () => {
  const p = new ShotPrediction();
  const shots = [p.update("burstGun", 0, true, true, true)];
  for (let i = 0; i < 4; i++)
    shots.push(p.update("burstGun", 0.081, true, false, true));
  assert.equal(shots.filter(Boolean).length, 5);
  assert.equal(shots.filter((s) => s?.audio).length, 1);
  assert.equal(p.update("burstGun", 0.5, true, true, true), undefined);
  assert.ok(p.update("burstGun", 0.51, true, true, true));
});
test("prediction never fires with empty ammo, reload, pause or Core buster", () => {
  const p = new ShotPrediction();
  assert.equal(p.update("machineGun", 1, true, true, false), undefined);
  assert.equal(p.update("coreBuster", 1, true, true, true), undefined);
  assert.ok(p.update("machineGun", 0, true, true, true));
  assert.equal(p.update("machineGun", 0.05, true, false, true), undefined);
  assert.ok(p.update("machineGun", 0.051, true, false, true));
});
