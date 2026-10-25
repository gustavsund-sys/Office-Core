import { Geometry, Mesh, Scene, VertexData } from "@babylonjs/core";

const geometries = new WeakMap<Scene, Map<string, Geometry>>();

/** Rounded edges with flat centres: 96 vertices, no extra meshes or draw calls. */
export function softBoxData(
  w: number,
  h: number,
  d: number,
  radius: number,
  tile = 0,
) {
  const half = [w / 2, h / 2, d / 2];
  const r = Math.min(radius, ...half.map((v) => v * 0.8));
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  // U cross V points outwards; reversed winding gives Babylon clockwise front faces.
  const faces = [
    [0, 1, 2, 1],
    [0, 2, 1, -1],
    [1, 2, 0, 1],
    [1, 0, 2, -1],
    [2, 0, 1, 1],
    [2, 1, 0, -1],
  ];
  for (const [axis, u, v, sign] of faces) {
    const start = positions.length / 3;
    const us = [-half[u], -half[u] + r, half[u] - r, half[u]];
    const vs = [-half[v], -half[v] + r, half[v] - r, half[v]];
    for (const y of vs)
      for (const x of us) {
        const p = [0, 0, 0];
        p[axis] = sign * half[axis];
        p[u] = x;
        p[v] = y;
        const inner = p.map((value, i) =>
          Math.max(-half[i] + r, Math.min(half[i] - r, value)),
        );
        const delta = p.map((value, i) => value - inner[i]);
        const length = Math.hypot(...delta);
        const normal = delta.map((value) => value / length);
        positions.push(...inner.map((value, i) => value + normal[i] * r));
        normals.push(...normal);
        uvs.push(
          (x + half[u]) / (tile || half[u] * 2),
          (y + half[v]) / (tile || half[v] * 2),
        );
      }
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 3; x++) {
        const a = start + y * 4 + x;
        indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
      }
  }
  const data = new VertexData();
  Object.assign(data, { positions, normals, uvs, indices });
  return data;
}

export function softenBox(
  mesh: Mesh,
  w: number,
  h: number,
  d: number,
  radius: number,
  tile = 0,
) {
  const scene = mesh.getScene();
  let cache = geometries.get(scene);
  if (!cache) geometries.set(scene, (cache = new Map()));
  const key = [w, h, d, radius, tile].join(":");
  let geometry = cache.get(key);
  if (!geometry || geometry.isDisposed()) {
    geometry = new Geometry(
      `soft box ${key}`,
      scene,
      softBoxData(w, h, d, radius, tile),
    );
    cache.set(key, geometry);
  }
  mesh.releaseSubMeshes();
  geometry.applyToMesh(mesh);
  mesh.refreshBoundingInfo();
}

/** Deliberately limited to readable silhouettes, never tiny trim or effects. */
export function edgeRadius(name: string) {
  if (
    /^(head|jacket|left arm|right arm|trouser thigh|trouser shin|glove|shoe)$/.test(
      name,
    )
  )
    return 0.045;
  if (
    /^(hair|hair quiff|hair back|vest|ear|shirt cuff|shoe sole|trouser cuff)$/.test(
      name,
    )
  )
    return 0.018;
  if (
    /^(sofa|sofa back|arm|sofa cushion|sofa pillow|chair|chair back|chair seat)$/.test(
      name,
    )
  )
    return 0.085;
  if (
    /^(desk|counter|meetingTable|planter|printer|coffee|waterCooler|vending|server|screen|wall cap|mouse)$/.test(
      name,
    )
  )
    return 0.035;
  return 0;
}
