import { Mesh, MeshBuilder, VertexData } from "@babylonjs/core";
import type { World } from "../map/builder";
import { cachedStaticModel, finishStaticModel } from "../weapons/staticModel";

/** A wearable plate carrier; blue identification stays readable at gameplay scale. */
export function tacticalShieldModel(world: World): Mesh {
  const cached = cachedStaticModel(world, "tactical plate carrier");
  if (cached) return cached;
  const root = new Mesh("tactical plate carrier", world.scene);
  root.isPickable = false;
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const m = world.box(name, x, y, z, w, h, d, color, false);
    m.parent = root;
    m.isPickable = false;
    return m;
  };
  const plate = (
    name: string,
    z: number,
    width: number,
    height: number,
    color: string,
  ) => {
    // Rounded panel with enough horizontal segments to wrap around the ribs.
    const columns = 16, rows = 10;
    const positions: number[] = [], indices: number[] = [], normals: number[] = [];
    const stride = columns + 1, layer = stride * (rows + 1);
    const radius = Math.min(width, height) * 0.18;
    for (const depth of [-0.022, 0.022]) {
      for (let row = 0; row <= rows; row++) {
        const y = (row / rows - 0.5) * height;
        const corner = Math.max(0, Math.abs(y) - (height / 2 - radius));
        const halfWidth = width / 2 - radius + Math.sqrt(radius ** 2 - corner ** 2);
        for (let col = 0; col <= columns; col++)
          positions.push((col / columns * 2 - 1) * halfWidth, y + 0.05, z + depth);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const a = row * stride + col, b = a + 1, c = a + stride, d = c + 1;
        indices.push(a, b, c, b, d, c);
        indices.push(a + layer, c + layer, b + layer, b + layer, c + layer, d + layer);
      }
    }
    const edge = (a: number, b: number) => indices.push(a, a + layer, b, b, a + layer, b + layer);
    for (let col = 0; col < columns; col++) {
      edge(col + 1, col);
      edge(rows * stride + col, rows * stride + col + 1);
    }
    for (let row = 0; row < rows; row++) {
      edge(row * stride, (row + 1) * stride);
      edge((row + 1) * stride + columns, row * stride + columns);
    }
    VertexData.ComputeNormals(positions, indices, normals);
    const mesh = new Mesh(name, world.scene),
      data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.material = world.mat(color);
    mesh.parent = root;
    mesh.isPickable = false;
  };
  plate("ballistic fabric border", 0.285, 0.76, 0.74, "#28343b");
  plate("chamfered ceramic front plate", 0.345, 0.64, 0.62, "#414e56");
  plate("rear ballistic plate", -0.285, 0.67, 0.65, "#28343b");
  for (const side of [-1, 1]) {
    box(
      "woven shoulder strap",
      side * 0.235,
      0.32,
      0,
      0.11,
      0.045,
      0.68,
      "#343e40",
    );
    box("side cummerbund", side * 0.34, -0.1, 0, 0.06, 0.20, 0.56, "#343e40");
    box(
      "steel shoulder buckle",
      side * 0.235,
      0.28,
      0.365,
      0.135,
      0.085,
      0.035,
      "#657176",
    );
    box(
      "buckle inset",
      side * 0.235,
      0.28,
      0.39,
      0.075,
      0.035,
      0.015,
      "#202a30",
    );
    const pouch = MeshBuilder.CreateSphere("rounded utility pouch", {
      diameterX: 0.23, diameterY: 0.22, diameterZ: 0.075, segments: 8,
    }, world.scene);
    pouch.parent = root;
    pouch.position.set(side * 0.17, -0.15, 0.407);
    pouch.material = world.mat("#303d43");
    pouch.isPickable = false;
    box(
      "pouch flap",
      side * 0.17,
      -0.055,
      0.444,
      0.215,
      0.035,
      0.015,
      "#59656a",
    );
    for (const y of [0.02, 0.09])
      box(
        "MOLLE webbing",
        side * 0.17,
        y,
        0.405,
        0.24,
        0.025,
        0.025,
        "#4c595e",
      );
    for (const y of [-0.23, 0.23]) {
      const rivet = MeshBuilder.CreateSphere(
        "plate fastener",
        { diameter: 0.025, segments: 4 },
        world.scene,
      );
      rivet.parent = root;
      rivet.position.set(side * 0.25, y, 0.397);
      rivet.material = world.mat("#657176");
      rivet.isPickable = false;
    }
  }
  box(
    "blue shield identification patch",
    0,
    0.18,
    0.403,
    0.22,
    0.105,
    0.025,
    "#4294c0",
  );
  box("shield patch stripe", 0, 0.18, 0.419, 0.035, 0.065, 0.008, "#cae3e9");
  box("rear blue identification", 0, 0.16, -0.34, 0.26, 0.07, 0.02, "#4294c0");
  // Bend panels AND their fittings together, keeping patches and pouches seated.
  for (const mesh of root.getChildMeshes()) {
    if (!(mesh instanceof Mesh)) continue;
    mesh.bakeCurrentTransformIntoVertices();
    const positions = mesh.getVerticesData("position");
    const indices = mesh.getIndices();
    if (!positions || !indices) continue;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      positions[i + 2] *= Math.sqrt(Math.max(0.12, 1 - (x / 0.43) ** 2));
      // Narrow both panels and their fittings; blend through the side straps.
      const panel = Math.min(1, Math.abs(z) / 0.26);
      const front = Math.max(0, Math.min(1, z / 0.26));
      positions[i] *= 1 - 0.14 * panel;
      positions[i + 2] -= 0.035 * front;
    }
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    mesh.setVerticesData("position", positions);
    mesh.setVerticesData("normal", normals);
    mesh.refreshBoundingInfo();
  }
  return finishStaticModel(world, "tactical plate carrier", root);
}
