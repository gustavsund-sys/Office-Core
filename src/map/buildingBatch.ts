import { Mesh } from "@babylonjs/core";
import type { World } from "./builder";
import { mergeStaticParts } from "../weapons/staticModel";

/** Small spatial batches preserve frustum culling and leave solid walls untouched. */
export function batchBuildingTrim(world: World) {
  const groups = new Map<string, Mesh[]>();
  for (const mesh of world.scene.meshes) {
    if (
      mesh.parent ||
      mesh.isPickable ||
      !(mesh.name === "wall cap" || mesh.name === "skirting")
    )
      continue;
    const key = `${mesh.material?.uniqueId}:${Math.floor(mesh.position.x / 24)}:${Math.floor(mesh.position.z / 24)}`;
    const group = groups.get(key) ?? [];
    group.push(mesh as Mesh);
    groups.set(key, group);
  }
  for (const group of groups.values()) mergeStaticParts(world, group);
}

/** Keep original ray/collision surfaces; batch only their static rendered copies. */
export function batchWallVisuals(world: World) {
  const groups = new Map<string, Mesh[]>();
  for (const wall of world.solids) {
    if (wall.name !== "wall" || wall.parent || wall.visibility !== 1) continue;
    const key = `${wall.material?.uniqueId}:${Math.floor(wall.position.x / 24)}:${Math.floor(wall.position.z / 24)}`;
    const group = groups.get(key) ?? [];
    group.push(wall);
    groups.set(key, group);
  }
  for (const walls of groups.values()) {
    if (walls.length < 2) continue;
    const visual = Mesh.MergeMeshes(walls, false, true);
    if (!visual) continue;
    visual.name = "wall visual batch";
    visual.isPickable = false;
    visual.receiveShadows = true;
    visual.metadata = { visualOnly: true };
    world.shadows.addShadowCaster(visual);
    for (const wall of walls) {
      wall.visibility = 0;
      world.shadows.removeShadowCaster(wall);
    }
  }
}
