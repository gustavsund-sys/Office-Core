import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core";
import { updateCamera } from "./cameraController";
import { RANGE_X } from "./shootingRange";

test("camera follows the remote shooting range instead of clamping to the office map", () => {
  const camera = { position: Vector3.Zero(), orthoRight: 18, setTarget() {} };
  const game = { rangeMode: true, rc: { camera: () => false }, camera, cameraTarget: Vector3.Zero(),
    input: { mode: "classic" }, player: { root: { position: new Vector3(RANGE_X, 0, -10) }, setViewVisibility() {} },
    shake: 0, time: 0 };
  updateCamera.call(game as never, 10);
  assert.ok(Math.abs(game.cameraTarget.x - RANGE_X) < 0.01);
  game.rangeMode = false;
  updateCamera.call(game as never, 10);
  assert.ok(game.cameraTarget.x < 110);
});
