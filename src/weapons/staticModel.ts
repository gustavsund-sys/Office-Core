import { Mesh, Vector3, type Material } from "@babylonjs/core";
import type { World } from "../map/builder";

const templates = new WeakMap<World, Map<string, Mesh>>();

/** Reuse GPU geometry; each instance keeps its own transform and lifetime. */
export function cachedStaticModel(world: World, key: string): Mesh | undefined {
  const template = templates.get(world)?.get(key);
  if (!template || template.isDisposed()) return;
  const clone = template.clone(key, null)!;
  clone.setEnabled(true);
  return clone;
}

/** Merge rigid parts per material, leaving hit surfaces and animated parts independent. */
export function mergeStaticParts(
  world: World,
  parts: Mesh[],
  origin = Vector3.Zero(),
) {
  const groups = new Map<Material | null, Mesh[]>();
  for (const part of parts) {
    if (part.isPickable || !part.getTotalVertices()) continue;
    const group = groups.get(part.material) ?? [];
    group.push(part);
    groups.set(part.material, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const parent = group[0].parent;
    const metadata = group[0].metadata;
    const name = group[0].name;
    for (const part of group) {
      part.position.subtractInPlace(origin);
      part.computeWorldMatrix(true);
      world.shadows.removeShadowCaster(part);
    }
    const merged = Mesh.MergeMeshes(group, true, true);
    if (!merged) {
      for (const part of group) part.position.addInPlace(origin);
      continue;
    }
    merged.name = `${name} static parts`;
    merged.parent = parent;
    merged.position.copyFrom(origin);
    merged.metadata = metadata;
    merged.isPickable = false;
  }
}

export function finishStaticModel(world: World, key: string, root: Mesh): Mesh {
  mergeStaticParts(world, root.getChildMeshes(true) as Mesh[]);
  let cache = templates.get(world);
  if (!cache) templates.set(world, (cache = new Map()));
  const template = root.clone(`${key} template`, null)!;
  template.setEnabled(false);
  cache.set(key, template);
  return root;
}
