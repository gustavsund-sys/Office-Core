import { FreeCamera, Ray, Vector3 } from "@babylonjs/core";
import { CONFIG } from "../config/game";
import { lookDirection } from "../player/look";
import type { World } from "../map/builder";
export class ChaseCamera {
  distance = CONFIG.thirdPerson.distance;
  update(
    camera: FreeCamera,
    world: World,
    position: Vector3,
    yaw: number,
    pitch: number,
    dt: number,
  ) {
    const c = CONFIG.thirdPerson;
    const direction = Vector3.FromArray(
      Object.values(lookDirection(yaw, pitch)),
    );
    const pivot = position.add(new Vector3(0, c.pivotHeight, 0));
    const desired = pivot
      .subtract(direction.scale(c.distance))
      .add(
        new Vector3(Math.cos(yaw) * c.shoulder, 0, -Math.sin(yaw) * c.shoulder),
      );
    desired.y = Math.max(0.35, desired.y);
    const offset = desired.subtract(pivot),
      length = offset.length(),
      normal = offset.normalize();
    let safe = length;
    // A small bundle of rays protects the near plane at wall corners.
    for (const shift of [
      Vector3.Zero(),
      new Vector3(0.22, 0, 0),
      new Vector3(-0.22, 0, 0),
      new Vector3(0, 0.22, 0),
      new Vector3(0, -0.22, 0),
    ]) {
      const hit = world.scene.pickWithRay(
        new Ray(pivot.add(shift), normal, length),
        (m) =>
          m.isEnabled() &&
          (!!m.metadata?.solid ||
            (!!m.metadata?.damageable && m.metadata.damageable.hp > 0)),
      );
      if (hit?.hit) safe = Math.min(safe, Math.max(0.12, hit.distance - 0.3));
    }
    this.distance =
      safe < this.distance
        ? safe
        : this.distance + (safe - this.distance) * (1 - Math.exp(-10 * dt));
    camera.position.copyFrom(pivot.add(normal.scale(this.distance)));
    camera.setTarget(camera.position.add(direction.scale(20)));
    return this.distance;
  }
}
