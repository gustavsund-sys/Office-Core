import { Vector3 } from "@babylonjs/core";
import { CONFIG } from "../config/game";
/** Original elevated orthographic framing, rotated around the player's heading. */
export function rotatingCameraPose(player: Vector3, yaw: number) {
  const c = CONFIG.camera,
    forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const target = player.add(forward.scale(c.lookAhead));
  const height = c.height * c.distance;
  const position = target.subtract(
    forward.scale(height / Math.tan((c.angle * Math.PI) / 180)),
  );
  position.y += height;
  return { position, target };
}
