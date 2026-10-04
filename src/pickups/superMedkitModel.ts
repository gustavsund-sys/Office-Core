import { TransformNode, Mesh } from "@babylonjs/core";
import type { World } from "../map/builder";
export function superMedkitModel(world: World) {
  const root = new TransformNode("deployable super med-kit", world.scene);
  const part = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    glow = false,
  ) => {
    const m = world.box(name, x, y, z, w, h, d, color, false, glow);
    m.parent = root;
    m.isPickable = false;
    return m;
  };
  part("medical case", 0, 0.25, 0, 0.95, 0.5, 0.64, "#eaf2ed");
  if (!world.authoritative) {
    part("medical case seam", 0, 0.28, 0, 0.97, 0.04, 0.66, "#bd9455");
    for (const z of [-0.325, 0.325]) {
      part("medical cross", 0, 0.25, z, 0.12, 0.3, 0.025, "#ffc85a", true);
      part("medical cross", 0, 0.25, z, 0.3, 0.12, 0.025, "#ffc85a", true);
    }
    part("medical cross lid", 0, 0.505, 0, 0.12, 0.02, 0.36, "#ffc85a", true);
    part("medical cross lid", 0, 0.505, 0, 0.36, 0.02, 0.12, "#ffc85a", true);
    for (const x of [-0.2, 0.2])
      part("medical handle", x, 0.58, 0, 0.06, 0.17, 0.08, "#344953");
    part("medical handle grip", 0, 0.66, 0, 0.45, 0.06, 0.08, "#344953");
    const meshes = root.getChildMeshes() as Mesh[];
    const groups = new Map<any, Mesh[]>();
    for (const m of meshes) {
      const g = groups.get(m.material) ?? [];
      g.push(m);
      groups.set(m.material, g);
    }
    for (const g of groups.values())
      if (g.length > 1) {
        const m = Mesh.MergeMeshes(g, true, true);
        if (m) {
          m.parent = root;
          m.isPickable = false;
        }
      }
  }
  return root;
}
