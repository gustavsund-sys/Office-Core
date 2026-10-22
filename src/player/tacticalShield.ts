import { Mesh, MeshBuilder, VertexData, TransformNode } from "@babylonjs/core";
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
    const outline = [
      [-0.5, -0.34],
      [-0.38, -0.5],
      [0.38, -0.5],
      [0.5, -0.34],
      [0.5, 0.28],
      [0.29, 0.5],
      [-0.29, 0.5],
      [-0.5, 0.28],
    ];
    const positions: number[] = [],
      indices: number[] = [],
      normals: number[] = [];
    for (const depth of [-0.045, 0.045])
      for (const [x, y] of outline)
        positions.push(x * width, y * height + 0.05, z + depth);
    for (let i = 1; i < 7; i++) {
      indices.push(0, i + 1, i, 8, 8 + i, 9 + i);
    }
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      indices.push(i, j, 8 + j, i, 8 + j, 8 + i);
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
      0.13,
      0.065,
      0.68,
      "#343e40",
    );
    box("side cummerbund", side * 0.34, -0.1, 0, 0.085, 0.22, 0.56, "#343e40");
    box(
      "steel shoulder buckle",
      side * 0.235,
      0.28,
      0.365,
      0.135,
      0.085,
      0.035,
      "#8c9696",
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
    box("utility pouch", side * 0.17, -0.15, 0.42, 0.23, 0.22, 0.11, "#303d43");
    box(
      "pouch flap",
      side * 0.17,
      -0.045,
      0.48,
      0.235,
      0.045,
      0.025,
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
        "#626d6c",
      );
    for (const y of [-0.23, 0.23]) {
      const rivet = MeshBuilder.CreateSphere(
        "plate fastener",
        { diameter: 0.035, segments: 4 },
        world.scene,
      );
      rivet.parent = root;
      rivet.position.set(side * 0.25, y, 0.397);
      rivet.material = world.mat("#929fa2");
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
  return finishStaticModel(world, "tactical plate carrier", root);
}
