import { Mesh, MeshBuilder, Vector3 } from "@babylonjs/core";
import type { World } from "../map/builder";
import { cachedStaticModel, finishStaticModel } from "../weapons/staticModel";

export const TURRET_MUZZLE = new Vector3(0, 0.025, 1.34);
/** Slim M60-inspired silhouette. The receiver rests on the trunnion; +Z is forward. */
export function bossTurretModel(world: World): Mesh {
  const cached = cachedStaticModel(world, "Boss M60 turret");
  if (cached) return cached;
  const root = new Mesh("Boss M60 turret", world.scene);
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
    const m = world.box(name, x, y, z, w, h, d, color);
    m.parent = root;
    m.isPickable = false;
    m.material = world.finish(
      color,
      /stock|grip/.test(name) ? "polymer" : "metal",
    );
    return m;
  };
  const tube = (
    name: string,
    z: number,
    length: number,
    diameter: number,
    color: string,
    y = 0.025,
  ) => {
    const m = MeshBuilder.CreateCylinder(
      name,
      { diameter, height: length, tessellation: 12 },
      world.scene,
    );
    m.rotation.x = Math.PI / 2;
    m.position.set(0, y, z);
    m.parent = root;
    m.material = world.finish(color, "metal");
    m.isPickable = false;
    return m;
  };
  box("slim steel receiver", 0, 0.025, -0.02, 0.145, 0.135, 0.46, "#47534f");
  box("hinged feed cover", 0, 0.105, 0.01, 0.16, 0.025, 0.33, "#69716a");
  box("cover hinge", 0, 0.11, -0.17, 0.18, 0.025, 0.045, "#88918a");
  box("rear stock neck", 0, 0.015, -0.31, 0.09, 0.105, 0.18, "#3c4641");
  const stock = box(
    "tapered polymer shoulder stock",
    0,
    -0.005,
    -0.49,
    0.11,
    0.16,
    0.3,
    "#303a35",
  );
  stock.rotation.x = -0.08;
  box("stock butt pad", 0, -0.02, -0.66, 0.125, 0.205, 0.045, "#1a2427");
  box("stock cheek ridge", 0, 0.08, -0.48, 0.08, 0.025, 0.25, "#4c554b");
  const grip = box(
    "angled pistol grip",
    0,
    -0.14,
    -0.11,
    0.075,
    0.22,
    0.095,
    "#242e2c",
  );
  grip.rotation.x = -0.22;
  for (let i = 0; i < 5; i++)
    box("grip rib", 0, -0.07 - i * 0.032, -0.16, 0.08, 0.009, 0.012, "#53605a");
  box("trigger guard bottom", 0, -0.135, 0.035, 0.025, 0.025, 0.14, "#657069");
  box("trigger guard front", 0, -0.08, 0.105, 0.025, 0.13, 0.02, "#657069");
  box("trigger", 0, -0.07, 0.005, 0.016, 0.06, 0.018, "#202a2a");
  tube("gas cylinder", 0.41, 0.65, 0.045, "#2a3636", -0.055);
  tube("barrel", 0.76, 1.1, 0.045, "#465251");
  tube("ribbed handguard", 0.35, 0.4, 0.105, "#2c3733");
  for (let i = 0; i < 15; i++)
    tube("handguard cooling rib", 0.17 + i * 0.025, 0.009, 0.115, "#59645c");
  // Open longitudinal heat-shield rails preserve a thin barrel silhouette.
  for (const x of [-0.05, 0.05]) {
    box(
      "vented heat shield side",
      x,
      0.06,
      0.72,
      0.015,
      0.065,
      0.36,
      "#637069",
    );
    for (let i = 0; i < 9; i++)
      box(
        "dark ventilation slot",
        x * 1.17,
        0.065,
        0.56 + i * 0.037,
        0.008,
        0.033,
        0.018,
        "#142023",
      );
  }
  box("heat shield top rail", 0, 0.102, 0.72, 0.1, 0.014, 0.36, "#727c71");
  tube("gas block", 0.91, 0.07, 0.075, "#6b756c");
  tube("flash suppressor", 1.27, 0.14, 0.066, "#2b3737");
  for (const x of [-0.025, 0.025])
    box("flash hider flute", x, 0.026, 1.3, 0.012, 0.03, 0.1, "#101b20");
  box("front sight post", 0, 0.105, 1.03, 0.018, 0.16, 0.035, "#a0a99a");
  for (const x of [-0.038, 0.038])
    box(
      "front sight protective ear",
      x,
      0.11,
      1.03,
      0.012,
      0.135,
      0.035,
      "#758273",
    );
  box("rear sight base", 0, 0.13, -0.13, 0.07, 0.035, 0.06, "#677568");
  box("rear aperture sight", 0, 0.165, -0.13, 0.055, 0.065, 0.015, "#a7ae98");
  box("rear sight notch", 0, 0.182, -0.14, 0.018, 0.028, 0.006, "#101c20");
  const handle = MeshBuilder.CreateTube(
    "folding carry handle",
    {
      path: [
        new Vector3(0.09, 0.05, -0.03),
        new Vector3(0.12, 0.2, 0.02),
        new Vector3(0.12, 0.2, 0.2),
        new Vector3(0.08, 0.07, 0.24),
      ],
      radius: 0.012,
      tessellation: 8,
    },
    world.scene,
  );
  handle.parent = root;
  handle.material = world.finish("#343f3b", "metal");
  handle.isPickable = false;
  box("feed port", -0.09, 0.025, 0.02, 0.045, 0.07, 0.14, "#1d2a2b");
  for (let i = 0; i < 7; i++) {
    const x = -0.12 - i * 0.025,
      y = 0.04 - Math.max(0, i - 2) * 0.018;
    box("belt link", x, y, 0.005, 0.021, 0.024, 0.022, "#3a4643");
  }
  box("charging handle", 0.1, 0.025, -0.06, 0.085, 0.025, 0.035, "#8d9889");
  for (const x of [-0.077, 0.077])
    for (const z of [-0.15, 0.05, 0.17])
      box("receiver rivet", x, 0.04, z, 0.009, 0.018, 0.018, "#a4aa99");
  // Small rigid details share the existing material palette and merge into the
  // cached model: no per-frame animation or additional texture downloads.
  const steel = "#47534f",
    edge = "#88918a",
    dark = "#1d2a2b";
  for (const side of [-1, 1]) {
    box(
      "receiver inset side plate",
      side * 0.076,
      0.015,
      -0.025,
      0.008,
      0.075,
      0.33,
      steel,
    );
    box(
      "receiver machined upper seam",
      side * 0.081,
      0.065,
      0.01,
      0.006,
      0.008,
      0.32,
      edge,
    );
    box(
      "receiver lower reinforcing rail",
      side * 0.081,
      -0.042,
      0.015,
      0.012,
      0.013,
      0.36,
      dark,
    );
    for (const z of [-0.15, 0.05, 0.17]) {
      const screw = tube(
        "recessed receiver screw",
        z,
        0.012,
        0.018,
        edge,
        -0.015,
      );
      screw.rotation.set(0, 0, Math.PI / 2);
      screw.position.x = side * 0.084;
      box(
        "screw head slot",
        side * 0.091,
        -0.015,
        z,
        0.002,
        0.003,
        0.011,
        dark,
      );
    }
    for (let i = 0; i < 4; i++)
      box(
        "stock molded inset grooves",
        side * 0.056,
        -0.005,
        -0.55 + i * 0.04,
        0.003,
        0.08,
        0.009,
        dark,
      );
  }
  box("ejection port recess", 0.084, 0.018, 0.075, 0.008, 0.045, 0.11, dark);
  const door = box(
    "ejection port hinged lip",
    0.099,
    -0.008,
    0.075,
    0.035,
    0.007,
    0.115,
    steel,
  );
  door.rotation.z = -0.3;
  box(
    "charging handle slide channel",
    0.086,
    0.041,
    -0.09,
    0.008,
    0.018,
    0.18,
    dark,
  );
  box("feed cover latch", 0, 0.125, -0.135, 0.045, 0.018, 0.038, edge);
  for (let i = 0; i < 6; i++)
    box(
      "feed cover stiffening ribs",
      0,
      0.121,
      -0.075 + i * 0.037,
      0.13,
      0.008,
      0.009,
      steel,
    );
  for (const z of [0.21, 0.55, 0.94, 1.17])
    tube("barrel machined collar", z, 0.022, 0.057, edge);
  // A dark recessed bore and crown make the muzzle read as an open barrel.
  tube("muzzle recessed bore", 1.341, 0.002, 0.043, "#101b20");
  const crown = MeshBuilder.CreateTorus(
    "muzzle crown",
    {
      diameter: 0.053,
      thickness: 0.009,
      tessellation: 12,
    },
    world.scene,
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 0.025, 1.343);
  crown.parent = root;
  crown.material = world.finish(steel, "metal");
  crown.isPickable = false;
  // Compact ammunition can, with stamped panels, straps and latch hardware.
  box("ammunition can", -0.255, -0.175, 0.015, 0.18, 0.23, 0.27, steel);
  box("ammunition can lid", -0.255, -0.055, 0.015, 0.195, 0.018, 0.285, edge);
  box("ammunition can inset", -0.347, -0.17, 0.015, 0.006, 0.16, 0.21, dark);
  for (const z of [-0.075, 0.105]) {
    box("ammunition can strap", -0.352, -0.17, z, 0.01, 0.22, 0.018, edge);
    box("ammunition lid clasp", -0.358, -0.07, z, 0.014, 0.04, 0.026, steel);
  }
  for (let i = 0; i < 7; i++) {
    const x = -0.12 - i * 0.025;
    const y = 0.04 - Math.max(0, i - 2) * 0.018;
    const cartridge = tube(
      "rounded brass cartridge",
      0.025,
      0.105,
      0.017,
      "#b49c61",
      y,
    );
    cartridge.position.x = x;
    const tip = MeshBuilder.CreateCylinder(
      "copper cartridge tip",
      {
        diameterTop: 0.003,
        diameterBottom: 0.017,
        height: 0.025,
        tessellation: 6,
      },
      world.scene,
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.set(x, y, 0.09);
    tip.parent = root;
    tip.material = world.finish("#b49c61", "metal");
    tip.isPickable = false;
  }
  return finishStaticModel(world, "Boss M60 turret", root);
}
