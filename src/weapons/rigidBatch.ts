import { Mesh, type Material, type TransformNode } from "@babylonjs/core";
import type { World } from "../map/builder";

/** Merge a rigid assembly in world space, then preserve its pose under its animated parent. */
export function batchRigidAssembly(world: World, parent: TransformNode, parts: Mesh[]) {
  parent.computeWorldMatrix(true);
  const groups = new Map<Material | null, Mesh[]>();
  for (const mesh of parts) {
    if (mesh.isPickable || !mesh.getTotalVertices()) continue;
    // Keep render-state differences separate even if material is shared.
    const group = groups.get(mesh.material) ?? [];
    group.push(mesh); groups.set(mesh.material, group);
  }
  for (const materialGroup of groups.values()) {
    const groupsByState = new Map<string, Mesh[]>();
    for (const m of materialGroup) {
      const key = `${m.visibility}:${m.receiveShadows}:${m.renderingGroupId}`;
      const group = groupsByState.get(key) ?? []; group.push(m); groupsByState.set(key, group);
    }
    for (const group of groupsByState.values()) {
      if (group.length < 2) continue;
      const first = group[0];
      const shadowList = world.shadows?.getShadowMap()?.renderList ?? [];
      const casts = group.some(m => shadowList.includes(m));
      for (const m of group) m.computeWorldMatrix(true);
      const merged = Mesh.MergeMeshes(group, false, true);
      if (!merged) continue;
      merged.name = `${parent.name} rigid details`;
      merged.isPickable = false;
      merged.layerMask = first.layerMask;
      merged.metadata = first.metadata;
      merged.visibility = first.visibility;
      merged.receiveShadows = first.receiveShadows;
      merged.renderingGroupId = first.renderingGroupId;
      // Bake into parent-local space directly: decomposing a world transform
      // under non-uniform parent scaling can otherwise introduce shear errors.
      merged.computeWorldMatrix(true);
      merged.bakeTransformIntoVertices(merged.getWorldMatrix().multiply(parent.getWorldMatrix().clone().invert()));
      merged.position.setAll(0);
      merged.rotationQuaternion = null;
      merged.rotation.setAll(0);
      merged.scaling.setAll(1);
      merged.parent = parent;
      for (const m of group) { world.shadows?.removeShadowCaster(m); m.dispose(); }
      if (casts) world.shadows?.addShadowCaster(merged);
    }
  }
}
