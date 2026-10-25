import { type Mesh, type TransformNode } from "@babylonjs/core";
import type { World } from "../map/builder";
import { mergeStaticParts } from "../weapons/staticModel";

/** Call before adding animated signs/halos. Preserve every face, but batch by finish. */
export function batchPickupBody(world: World, root: TransformNode) {
  const position = root.position.clone();
  const scale = root.scaling.clone();
  root.position.setAll(0);
  root.scaling.setAll(1);
  root.computeWorldMatrix(true);
  try {
    mergeStaticParts(world, root.getChildMeshes(true) as Mesh[]);
  } finally {
    root.position.copyFrom(position);
    root.scaling.copyFrom(scale);
    root.computeWorldMatrix(true);
  }
}
