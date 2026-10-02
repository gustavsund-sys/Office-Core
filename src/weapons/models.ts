import { Mesh, MeshBuilder, Vector3 } from "@babylonjs/core";
import type { WeaponId } from "../config/weapons";
import type { World } from "../map/builder";

/** Small procedural models, with +Z as the barrel direction. */
export function heldWeapon(world: World, id: WeaponId): Mesh {
  const root = new Mesh(`held ${id}`, world.scene);
  const box = (
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
    const mesh = world.box(name, x, y, z, w, h, d, color, false, glow);
    mesh.parent = root;
    mesh.isPickable = false;
    return mesh;
  };
  const tube = (
    name: string,
    z: number,
    diameter: number,
    length: number,
    color: string,
  ) => {
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameter, height: length, tessellation: 16 },
      world.scene,
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = z;
    mesh.material = world.mat(color);
    mesh.parent = root;
    mesh.isPickable = false;
    return mesh;
  };
  if (id === "coreBuster") {
    const body = MeshBuilder.CreateSphere(
      "classic bomb body",
      { diameter: 0.95, segments: 20 },
      world.scene,
    );
    body.parent = root;
    body.material = world.mat("#222b32");
    body.isPickable = false;
    box("bomb top cap", 0, 0.48, 0, 0.28, 0.12, 0.28, "#85939b");
    box("bomb timer housing", 0, 0.3, 0.35, 0.42, 0.22, 0.17, "#151b21");
    box("bomb timer display", 0, 0.34, 0.45, 0.3, 0.09, 0.025, "#ff453a", true);
    for (const [index, color] of ["#ff3333", "#ffdb32"].entries()) {
      const side = index === 0 ? -1 : 1;
      const cable = MeshBuilder.CreateTube(
        "bomb colored cable",
        {
          path: [
            new Vector3(side * 0.09, 0.54, 0),
            new Vector3(side * 0.23, 0.59, 0.1),
            new Vector3(side * 0.44, 0.35, 0.14),
            new Vector3(side * 0.39, 0.08, 0.27),
            new Vector3(side * 0.15, 0.23, 0.43),
          ],
          radius: 0.035,
          tessellation: 8,
        },
        world.scene,
      );
      cable.material = world.mat(color, true);
      cable.parent = root;
      cable.isPickable = false;
    }
  } else if (id === "bazooka") {
    tube("launcher tube", 0, 0.34, 1.55, "#536946");
    tube("launcher muzzle rim", 0.79, 0.42, 0.12, "#29353a");
    tube("launcher dark bore", 0.855, 0.29, 0.015, "#11191c");
    tube("launcher rear rim", -0.79, 0.42, 0.12, "#29353a");
    box("launcher grip", 0, -0.23, 0.35, 0.12, 0.3, 0.17, "#253338");
    box("launcher shoulder rest", 0, -0.21, -0.2, 0.28, 0.15, 0.38, "#29353a");
    box("launcher sight", 0, 0.25, 0.25, 0.08, 0.2, 0.16, "#e1bc58");
  } else if (id === "pistol") {
    box("pistol slide", 0, 0, 0.1, 0.15, 0.16, 0.46, "#73838b");
    box("pistol grip", 0, -0.14, -0.04, 0.13, 0.24, 0.16, "#25343b");
    tube("pistol muzzle", 0.35, 0.1, 0.07, "#151f26");
  } else if (id === "pulseGun") {
    box("pulse housing", 0, 0, 0.08, 0.26, 0.22, 0.5, "#dadde1");
    box("pulse grip", 0, -0.16, -0.04, 0.14, 0.25, 0.18, "#343d52");
    box("pulse emitter", 0, 0, 0.39, 0.18, 0.12, 0.18, "#ff2649", true);
    for (const x of [-0.14, 0.14])
      box(
        "pulse energy rail",
        x,
        0.06,
        0.12,
        0.025,
        0.035,
        0.32,
        "#ff2649",
        true,
      );
  } else {
    const burst = id === "burstGun";
    box(
      "rifle receiver",
      0,
      0,
      0,
      0.2,
      0.22,
      0.62,
      burst ? "#625280" : "#394d53",
    );
    box("rifle stock", 0, -0.02, -0.46, 0.17, 0.24, 0.32, "#25343b");
    box("rifle grip", 0, -0.19, -0.08, 0.12, 0.26, 0.16, "#25343b");
    box(
      "rifle magazine",
      0,
      -0.22,
      0.14,
      burst ? 0.14 : 0.28,
      0.28,
      0.22,
      burst ? "#ad9bff" : "#738a75",
    );
    tube("rifle barrel", 0.55, 0.1, burst ? 0.5 : 0.7, "#1d2b33");
    box("rifle top rail", 0, 0.14, 0.08, 0.1, 0.08, 0.38, "#8b9da1");
    if (burst) box("burst sight", 0, 0.22, 0, 0.12, 0.12, 0.2, "#ad9bff");
  }
  return root;
}

export function rocketModel(world: World): Mesh {
  const scene = world.scene;
  const mesh = new Mesh("bazooka rocket", scene);
  const body = MeshBuilder.CreateCylinder(
    "missile body",
    { height: 0.6, diameter: 0.18, tessellation: 12 },
    scene,
  );
  body.rotation.x = Math.PI / 2;
  body.material = world.mat("#aeb8bd");
  body.parent = mesh;
  const nose = MeshBuilder.CreateCylinder(
    "missile nose",
    { height: 0.25, diameterTop: 0, diameterBottom: 0.18, tessellation: 12 },
    scene,
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.425;
  nose.material = world.mat("#e54b36");
  nose.parent = mesh;
  for (let i = 0; i < 4; i++) {
    const fin = MeshBuilder.CreateBox(
      "missile fin",
      { width: 0.32, height: 0.025, depth: 0.2 },
      scene,
    );
    fin.position.z = -0.23;
    fin.rotation.z = (i * Math.PI) / 2;
    fin.material = world.mat("#526572");
    fin.parent = mesh;
  }
  const flame = MeshBuilder.CreateCylinder(
    "rocket flare",
    { height: 0.5, diameterTop: 0.12, diameterBottom: 0, tessellation: 8 },
    scene,
  );
  flame.rotation.x = Math.PI / 2;
  flame.position.z = -0.55;
  flame.material = world.mat("#ff7025", true);
  flame.parent = mesh;
  const core = MeshBuilder.CreateSphere(
    "flare core",
    { diameter: 0.12, segments: 6 },
    scene,
  );
  core.position.z = -0.32;
  core.material = world.mat("#fff2a6", true);
  core.parent = mesh;
  mesh.getChildMeshes().forEach((part) => (part.isPickable = false));
  return mesh;
}
