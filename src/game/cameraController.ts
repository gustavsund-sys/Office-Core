import { Vector3 } from "@babylonjs/core";
import { rotatingCameraPose } from "./rotatingCamera";

import { CONFIG } from "../config/game";

import { office01 } from "../maps/office01";

import type { Game } from "./game";
type Context = Pick<
  Game,
  | "rc"
  | "camera"
  | "cameraTarget"
  | "engine"
  | "input"
  | "player"
  | "shake"
  | "time"
>;
export function resize(this: Context) {
  this.engine.resize();
  const aspect = this.engine.getRenderWidth() / this.engine.getRenderHeight();
  const half = CONFIG.camera.viewSize / 2;
  this.camera.orthoTop = half;
  this.camera.orthoBottom = -half;
  this.camera.orthoLeft = -half * aspect;
  this.camera.orthoRight = half * aspect;
}

export function updateCamera(this: Context, dt: number) {
  if (this.rc.camera(this.camera, dt)) return;
  const c = CONFIG.camera;
  if (this.input.mode === "thirdPerson") {
    const pose = rotatingCameraPose(this.player.root.position, this.input.yaw);
    this.camera.position.copyFrom(pose.position);
    this.camera.setTarget(pose.target);
    this.player.setViewVisibility(1);
    if (this.shake > 0) {
      this.camera.position.x += Math.sin(this.time * 91) * this.shake * 0.35;
      this.shake = Math.max(0, this.shake - dt * 0.9);
    }
    return;
  }
  this.player.setViewVisibility(1);
  const desired = this.player.root.position.add(new Vector3(0, 0, c.lookAhead));
  const edge = office01.size / 2;
  const limitX = Math.max(0, edge - (this.camera.orthoRight ?? 18));
  const limitZ = Math.max(
    0,
    edge - c.viewSize / 2 / Math.sin((c.angle * Math.PI) / 180),
  );
  desired.x = Math.max(-limitX, Math.min(limitX, desired.x));
  desired.z = Math.max(-limitZ, Math.min(limitZ, desired.z));
  Vector3.LerpToRef(
    this.cameraTarget,
    desired,
    1 - Math.exp(-c.smoothing * dt),
    this.cameraTarget,
  );
  const h = c.height * c.distance;
  this.camera.position.copyFrom(
    this.cameraTarget.add(
      new Vector3(0, h, -h / Math.tan((c.angle * Math.PI) / 180)),
    ),
  );
  this.camera.setTarget(this.cameraTarget);
  if (this.shake > 0) {
    this.camera.position.x += Math.sin(this.time * 91) * this.shake;
    this.camera.position.z += Math.cos(this.time * 73) * this.shake;
    this.shake = Math.max(0, this.shake - dt * 0.9);
  }
}
