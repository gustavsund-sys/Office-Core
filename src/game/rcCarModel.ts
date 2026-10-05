import { MeshBuilder, TransformNode, Vector3, Mesh } from "@babylonjs/core";
import type { World } from "../map/builder";
/** Compact camera buggy, about 8% wider than the pulse-trap casing. Forward is +Z. */
export function rcCarModel(world: World) {
  const root = new TransformNode("RC Bomber", world.scene),
    body = new TransformNode("sprung chassis", world.scene);
  body.parent = root;
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    parent: TransformNode = body,
  ) => {
    const m = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      world.scene,
    );
    m.parent = parent;
    m.position.set(x, y, z);
    m.material = world.finish(
      color,
      color === "#202a2e" || color === "#343b3e" ? "polymer" : "metal",
    );
    m.isPickable = false;
    return m;
  };
  box("metal chassis", 0, 0.19, 0, 0.66, 0.09, 0.83, "#313d42");
  const casing = MeshBuilder.ExtrudeShape(
    "retro camera casing",
    {
      shape: [
        new Vector3(-0.17, -0.14, 0),
        new Vector3(0.17, -0.14, 0),
        new Vector3(0.195, -0.115, 0),
        new Vector3(0.195, 0.115, 0),
        new Vector3(0.17, 0.14, 0),
        new Vector3(-0.17, 0.14, 0),
        new Vector3(-0.195, 0.115, 0),
        new Vector3(-0.195, -0.115, 0),
      ],
      path: [new Vector3(0, 0, -0.275), new Vector3(0, 0, 0.275)],
      closeShape: true,
      cap: Mesh.CAP_ALL,
    },
    world.scene,
  );
  casing.parent = body;
  casing.position.set(0, 0.43, 0.03);
  casing.material = world.finish("#c6c7c1", "metal");
  casing.isPickable = false;
  box("camera shoulder", 0, 0.59, -0.02, 0.32, 0.09, 0.32, "#deded4");
  box("camera handle", 0, 0.68, -0.08, 0.24, 0.035, 0.28, "#343d43");
  // Open rectangular sunshade, with a recessed multi-element lens inside.
  box("lens hood top", 0, 0.559, 0.39, 0.34, 0.025, 0.16, "#202a2e");
  box("lens hood bottom", 0, 0.301, 0.39, 0.34, 0.025, 0.16, "#202a2e");
  for (const side of [-1, 1])
    box(
      "lens hood side",
      side * 0.158,
      0.43,
      0.39,
      0.025,
      0.25,
      0.16,
      "#202a2e",
    );
  const cylinder = (
    name: string,
    diameter: number,
    depth: number,
    position: Vector3,
    color: string,
    parent = body,
  ) => {
    const m = MeshBuilder.CreateCylinder(
      name,
      { diameter, height: depth, tessellation: 16 },
      world.scene,
    );
    m.parent = parent;
    m.position.copyFrom(position);
    m.rotation.x = Math.PI / 2;
    m.material = world.finish(color, "metal");
    m.isPickable = false;
    return m;
  };
  cylinder(
    "ribbed focus barrel",
    0.235,
    0.13,
    new Vector3(0, 0.43, 0.29),
    "#343b3e",
  );
  for (let i = 0; i < 4; i++)
    cylinder(
      "focus ring",
      0.246,
      0.009,
      new Vector3(0, 0.43, 0.25 + i * 0.023),
      "#202a2e",
    );
  cylinder(
    "lens inner rim",
    0.207,
    0.027,
    new Vector3(0, 0.43, 0.369),
    "#69767b",
  );
  cylinder(
    "lens dark recess",
    0.186,
    0.018,
    new Vector3(0, 0.43, 0.386),
    "#17262c",
  );
  const lens = MeshBuilder.CreateCylinder(
    "blue glass lens",
    { diameter: 0.155, height: 0.012, tessellation: 20 },
    world.scene,
  );
  lens.parent = body;
  lens.position.set(0, 0.43, 0.4);
  lens.rotation.x = Math.PI / 2;
  lens.material = world.finish("#286576", "metal");
  lens.isPickable = false;
  box("camera lower housing", 0, 0.275, 0.03, 0.31, 0.09, 0.4, "#596267");
  box("camera mounting plate", 0, 0.237, 0.03, 0.42, 0.025, 0.53, "#a78b65");
  for (const side of [-1, 1]) {
    box("casing seam", side * 0.197, 0.41, 0.01, 0.006, 0.009, 0.51, "#596267");
    box(
      "side inset panel",
      side * 0.199,
      0.47,
      0.06,
      0.007,
      0.12,
      0.23,
      "#aeb3ae",
    );
    box(
      "small camera badge",
      side * 0.204,
      0.47,
      0.075,
      0.009,
      0.022,
      0.075,
      "#596267",
    );
    for (const z of [-0.19, 0.24])
      box(
        "casing fastener",
        side * 0.203,
        0.34,
        z,
        0.01,
        0.019,
        0.019,
        "#69767b",
      );
  }
  for (let i = 0; i < 6; i++)
    box(
      "camera vent",
      0.202,
      0.47,
      -0.12 + i * 0.031,
      0.009,
      0.09,
      0.012,
      "#29363b",
    );
  box("explosive pack", 0, 0.35, -0.36, 0.44, 0.2, 0.17, "#68734b");
  for (const x of [-0.14, 0.14])
    box("charge strap", x, 0.355, -0.36, 0.025, 0.22, 0.19, "#b9bcb0");
  box("red arming light", 0.12, 0.475, -0.34, 0.035, 0.027, 0.035, "#e53739");
  const wire = MeshBuilder.CreateTube(
    "blue charge cable",
    {
      path: [
        new Vector3(-0.15, 0.43, -0.39),
        new Vector3(-0.19, 0.53, -0.41),
        new Vector3(0.08, 0.57, -0.42),
        new Vector3(0.16, 0.45, -0.36),
      ],
      radius: 0.009,
      tessellation: 5,
    },
    world.scene,
  );
  wire.parent = body;
  wire.material = world.mat("#3658a0");
  wire.isPickable = false;
  box("charge controller", 0, 0.46, -0.36, 0.15, 0.025, 0.1, "#343b3e");
  const antenna = MeshBuilder.CreateTube(
    "flex antenna",
    {
      path: [
        new Vector3(0.27, 0.2, -0.3),
        new Vector3(0.31, 0.65, -0.34),
        new Vector3(0.35, 1.01, -0.3),
      ],
      radius: 0.012,
      tessellation: 5,
    },
    world.scene,
  );
  antenna.parent = body;
  antenna.material = world.mat("#b7c0c2");
  antenna.isPickable = false;
  const tip = MeshBuilder.CreateSphere(
    "red antenna ball",
    { diameter: 0.075, segments: 6 },
    world.scene,
  );
  tip.parent = body;
  tip.position.set(0.35, 1.01, -0.3);
  tip.material = world.mat("#e24443");
  tip.isPickable = false;
  const wheels: {
    pivot: TransformNode;
    spin: TransformNode;
    baseY: number;
    front: boolean;
  }[] = [];
  for (const x of [-0.34, 0.34])
    for (const z of [-0.3, 0.3]) {
      const pivot = new TransformNode("suspension hub", world.scene);
      pivot.parent = root;
      pivot.position.set(x, 0.19, z);
      const tire = MeshBuilder.CreateCylinder(
        "rubber tire",
        { diameter: 0.36, height: 0.14, tessellation: 20 },
        world.scene,
      );
      const spin = new TransformNode("wheel rotation", world.scene);
      spin.parent = pivot;
      tire.parent = spin;
      tire.rotation.z = Math.PI / 2;
      tire.material = world.finish("#202529", "polymer");
      tire.isPickable = false;
      const hub = MeshBuilder.CreateCylinder(
        "gold wheel rim",
        { diameter: 0.22, height: 0.155, tessellation: 16 },
        world.scene,
      );
      hub.parent = tire;
      hub.material = world.finish("#bd9950", "metal");
      hub.isPickable = false;
      const recess = MeshBuilder.CreateCylinder(
        "wheel rim recess",
        { diameter: 0.16, height: 0.161, tessellation: 16 },
        world.scene,
      );
      recess.parent = tire;
      recess.material = world.finish("#786437", "metal");
      recess.isPickable = false;
      const axle = MeshBuilder.CreateCylinder(
        "wheel axle cap",
        { diameter: 0.065, height: 0.173, tessellation: 8 },
        world.scene,
      );
      axle.parent = tire;
      axle.material = world.finish("#b9bcb0", "metal");
      axle.isPickable = false;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        box(
          "rim spoke",
          Math.cos(a) * 0.052,
          0,
          Math.sin(a) * 0.052,
          0.025,
          0.166,
          0.075,
          "#bd9950",
          tire,
        ).rotation.y = Math.PI / 2 - a;
      }
      box("suspension arm", x * 0.78, 0.18, z, 0.16, 0.025, 0.035, "#596267");
      cylinder(
        "shock piston",
        0.018,
        0.13,
        new Vector3(x * 0.73, 0.255, z),
        "#b9bcb0",
      ).rotation.x = 0;
      for (let k = 0; k < 20; k++) {
        const a = (k * Math.PI) / 10;
        const tread = box(
          "tire tread",
          0,
          Math.sin(a) * 0.18,
          Math.cos(a) * 0.18,
          0.145,
          0.019,
          0.025,
          "#343b3e",
          spin,
        );
        tread.rotation.x = -a;
        tread.rotation.z = k % 2 ? 0.22 : -0.22;
      }
      const spring = MeshBuilder.CreateTube(
        "red coil spring",
        {
          path: Array.from(
            { length: 25 },
            (_, i) =>
              new Vector3(
                x * 0.73 + 0.026 * Math.cos((i * Math.PI) / 2),
                0.19 + i * 0.005,
                z + 0.026 * Math.sin((i * Math.PI) / 2),
              ),
          ),
          radius: 0.007,
          tessellation: 4,
        },
        world.scene,
      );
      spring.parent = body;
      spring.material = world.mat("#c74e47");
      spring.isPickable = false;
      wheels.push({ pivot, spin, baseY: 0.19, front: z > 0 });
    }
  for (const z of [-0.47, 0.47])
    box("bumper", 0, 0.23, z, 0.7, 0.045, 0.04, "#7d8689");
  // Tread geometry is static relative to each wheel: one draw call instead of twelve.
  for (const wheel of wheels) {
    const treads = wheel.spin
      .getChildMeshes()
      .filter((m) => m.name === "tire tread") as Mesh[];
    const merged = Mesh.MergeMeshes(treads, true, true);
    if (merged) {
      merged.name = "tire tread ring";
      merged.parent = wheel.spin;
      merged.position.copyFrom(wheel.pivot.position.negate());
      merged.isPickable = false;
    }
  }
  // Batch small static details by material, retaining major pieces for destruction.
  const details = body
    .getChildMeshes(true)
    .filter((m) =>
      /camera vent|casing seam|side inset|camera badge|casing fastener|focus ring|suspension arm|shock piston/.test(
        m.name,
      ),
    ) as Mesh[];
  for (const material of new Set(details.map((m) => m.material))) {
    const group = details.filter((m) => m.material === material);
    if (group.length < 2) continue;
    const merged = Mesh.MergeMeshes(group, true, true);
    if (merged) {
      merged.name = "RC mechanical details";
      merged.parent = body;
      merged.isPickable = false;
    }
  }
  root.scaling.set(1.35, 0.95, 1.05);
  if (!world.authoritative)
    root.getChildMeshes().forEach((m) => world.shadows?.addShadowCaster(m));
  return { root, body, wheels };
}
export function rcPilotGear(world: World, parent: TransformNode) {
  const gear = new TransformNode("FPV goggles and transmitter", world.scene);
  gear.parent = parent;
  const part = (name: string, p: Vector3, size: Vector3, color: string) => {
    const m = MeshBuilder.CreateBox(
      name,
      { width: size.x, height: size.y, depth: size.z },
      world.scene,
    );
    m.parent = gear;
    m.position.copyFrom(p);
    m.material = world.finish(
      color,
      color === "#202a2e" || color === "#343b3e" ? "polymer" : "metal",
    );
    m.isPickable = false;
    return m;
  };
  part(
    "FPV visor",
    new Vector3(0, 1.61, 0.24),
    new Vector3(0.53, 0.22, 0.19),
    "#28323a",
  );
  part(
    "visor glass",
    new Vector3(0, 1.61, 0.341),
    new Vector3(0.42, 0.14, 0.02),
    "#58c9df",
  );
  part(
    "head strap",
    new Vector3(0, 1.61, 0),
    new Vector3(0.56, 0.075, 0.46),
    "#303639",
  );
  part(
    "RC transmitter",
    new Vector3(0, 1.02, 0.45),
    new Vector3(0.4, 0.12, 0.23),
    "#444d55",
  );
  for (const x of [-0.11, 0.11])
    part(
      "control stick",
      new Vector3(x, 1.12, 0.45),
      new Vector3(0.035, 0.1, 0.035),
      "#c9cdd0",
    );
  part(
    "transmitter screen",
    new Vector3(0, 1.09, 0.53),
    new Vector3(0.14, 0.014, 0.06),
    "#62be9d",
  );
  return gear;
}
export function rcCarDebris(world: World, position: Vector3) {
  const camera = world.scene.activeCamera;
  const reduced = world.explosions.spriteMode;
  if (
    reduced &&
    (world.explosions.amount < 0.6 ||
      (camera && Vector3.Distance(position, camera.globalPosition) > 35))
  )
    return;
  const model = rcCarModel(world);
  model.root.position.copyFrom(position);
  model.root.computeWorldMatrix(true);
  // Large recognisable wheels and camera parts join the same bounded debris system.
  const meshes = model.root
    .getChildMeshes()
    .filter((m) =>
      /rubber tire|metal chassis|retro camera casing|explosive pack|lens hood/.test(
        m.name,
      ),
    );
  for (const mesh of reduced ? meshes.slice(0, 3) : meshes) {
    mesh.computeWorldMatrix(true);
    const p = mesh.getAbsolutePosition().clone();
    mesh.setParent(null);
    mesh.position.copyFrom(p);
    mesh.isPickable = false;
    // Debris fades independently; cached model materials and textures stay alive.
    for (const part of [mesh, ...mesh.getChildMeshes()])
      if (part.material)
        part.material = part.material.clone(`${part.name} debris material`);
    world.explosions.particles.push({
      sharedTextures: true,
      mesh: mesh as Mesh,
      velocity: new Vector3(
        (Math.random() - 0.5) * 7,
        3 + Math.random() * 4,
        (Math.random() - 0.5) * 7,
      ),
      spin: new Vector3(4, 6, 8),
      life: 2.7,
      maxLife: 2.7,
      kind: "debris",
    });
  }
  model.root.dispose();
}
