import type { Ray, Scene, AbstractMesh } from "@babylonjs/core";
import type { Player } from "../player/player";

/** Predict only the visible trace. Damage remains authoritative on the server. */
export function shotTraceEnd(
  scene: Scene,
  ray: Ray,
  shooter: Player,
  players: Iterable<Player>,
) {
  const own = new Set<AbstractMesh>(shooter.bodyMeshes);
  const bodies = new Set<AbstractMesh>();
  for (const player of players) {
    if (player === shooter || player.hp <= 0 || !player.root.isEnabled())
      continue;
    for (const mesh of player.bodyMeshes) {
      mesh.computeWorldMatrix(true);
      bodies.add(mesh);
    }
  }
  const hit = scene.pickWithRay(
    ray,
    (mesh) =>
      mesh.isEnabled() &&
      !own.has(mesh) &&
      (bodies.has(mesh) ||
        !!mesh.metadata?.solid ||
        (!!mesh.metadata?.damageable && mesh.metadata.damageable.hp > 0)),
  );
  return hit?.hit && hit.pickedPoint
    ? hit.pickedPoint
    : ray.origin.add(ray.direction.scale(ray.length));
}
