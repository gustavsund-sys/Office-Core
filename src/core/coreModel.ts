import { MeshBuilder, TransformNode, Mesh } from "@babylonjs/core";
import type { World } from "../map/builder";
import type { Team } from "../config/game";

/** The film's octagonal reactor: metal housings around a vertical plasma conduit. */
export function coreModel(world: World, team: Team, x: number, z: number) {
  const root = new TransformNode(`${team} reactor assembly`, world.scene);

  const color = team === "BLUE" ? "#28dbff" : "#ff465c";
  const energy: Mesh[] = [];
  const cylinder = (
    name: string,
    y: number,
    height: number,
    bottom: number,
    top: number,
    metallic = true,
  ) => {
    const m = MeshBuilder.CreateCylinder(
      name,
      { height, diameterBottom: bottom, diameterTop: top, tessellation: 8 },
      world.scene,
    );
    m.parent = root;
    m.position.y = y;
    m.material = metallic
      ? world.finish("#c2ccd0", "metal")
      : world.mat(color, true);
    m.isPickable = false;
    m.receiveShadows = metallic;
    if (metallic) world.shadows.addShadowCaster(m);
    else energy.push(m);
    return m;
  };
  cylinder("reactor foundation", 0.18, 0.36, 2.5, 2.25);
  cylinder("reactor bevelled pedestal", 0.43, 0.2, 2.25, 1.85);
  cylinder("reactor lower plasma socket", 0.58, 0.13, 0.95, 0.85, false);
  const column = cylinder("core plasma conduit", 1.65, 2.15, 0.48, 0.48, false);
  const jacket = cylinder(
    "core plasma outer field",
    1.65,
    2.12,
    0.72,
    0.72,
    false,
  );
  jacket.material = world.mat(color, true).clone(`${team} translucent plasma`);
  (jacket.material as import("@babylonjs/core").StandardMaterial).alpha = 0.22;
  const spine = world.box(
    "reactor hot plasma spine",
    0,
    1.65,
    0,
    0.12,
    2.16,
    0.12,
    "#e6fcff",
    false,
    true,
  );
  spine.parent = root;
  cylinder("reactor upper energy bowl", 2.78, 0.32, 1.4, 2.35, false);
  cylinder("reactor upper metal lip", 2.96, 0.18, 2.5, 2.45);
  cylinder("reactor crown bevel", 3.1, 0.12, 2.45, 2.12);
  const cap = cylinder(
    "reactor faceted energy crown",
    3.28,
    0.28,
    2.05,
    1.35,
    false,
  );
  const dome = MeshBuilder.CreateSphere(
    "reactor plasma nucleus",
    { diameter: 0.72, segments: 8 },
    world.scene,
  );
  dome.parent = root;
  dome.position.y = 3.4;
  dome.scaling.y = 0.65;
  dome.material = world.mat(color, true);
  dome.isPickable = false;
  energy.push(dome);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const panel = world.box(
      "reactor crown vent",
      Math.sin(a) * 1.15,
      2.97,
      Math.cos(a) * 1.15,
      0.34,
      0.065,
      0.035,
      "#3a4f5a",
    );
    panel.rotation.y = a;
    panel.parent = root;
    const lamp = world.box(
      "reactor status strip",
      Math.sin(a) * 1.16,
      3.02,
      Math.cos(a) * 1.16,
      0.22,
      0.025,
      0.04,
      color,
      false,
      true,
    );
    lamp.rotation.y = a;
    lamp.parent = root;
    const bolt = cylinder("reactor pedestal bolt", 0.4, 0.08, 0.09, 0.09);
    bolt.position.x = Math.sin(a) * 0.99;
    bolt.position.z = Math.cos(a) * 0.99;
  }
  // Machined collars, insulated seams and recessed service panels anchor the energy field.
  const ring = (
    name: string,
    y: number,
    diameter: number,
    thickness: number,
    color: string,
  ) => {
    const m = MeshBuilder.CreateTorus(
      name,
      { diameter, thickness, tessellation: 32 },
      world.scene,
    );
    m.parent = root;
    m.position.y = y;
    m.material = world.finish(color, "metal");
    m.isPickable = false;
    return m;
  };
  ring("reactor base isolation gasket", 0.34, 2.26, 0.045, "#273d48");
  ring("reactor crown isolation gasket", 2.86, 2.35, 0.04, "#273d48");
  ring("reactor crown polished rim", 3.095, 2.3, 0.035, "#dce6e8");
  for (const y of [0.67, 2.59]) {
    ring("reactor conduit compression collar", y, 0.79, 0.085, "#778e98");
    ring(
      "reactor copper induction winding",
      y + (y < 1 ? 0.08 : -0.08),
      0.62,
      0.035,
      "#b18a62",
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * Math.PI) / 4;
    const panel = world.box(
      "reactor access panel",
      Math.sin(a) * 1.18,
      0.2,
      Math.cos(a) * 1.18,
      0.48,
      0.17,
      0.03,
      "#718590",
    );
    panel.parent = root;
    panel.rotation.y = a;
    panel.material = world.finish("#718590", "metal");
    for (const offset of [-0.15, 0.15]) {
      const fastener = world.box(
        "reactor panel screw",
        0,
        0,
        0,
        0.035,
        0.035,
        0.012,
        "#dce6e8",
      );
      fastener.parent = panel;
      fastener.position.set(offset, 0, 0.022);
    }
    // A dark inset with separate radiator fins reads as depth from the game camera.
    const vent = world.box(
      "reactor radiator recess",
      Math.sin(a) * 1.245,
      2.97,
      Math.cos(a) * 1.245,
      0.42,
      0.12,
      0.025,
      "#243640",
    );
    vent.parent = root;
    vent.rotation.y = a;
    for (let f = 0; f < 5; f++) {
      const fin = world.box(
        "reactor radiator fin",
        0,
        0,
        0,
        0.024,
        0.095,
        0.032,
        "#8b9fa8",
      );
      fin.parent = vent;
      fin.position.set(-0.16 + f * 0.08, 0, 0.02);
      fin.material = world.finish("#8b9fa8", "metal");
    }
    const screw = cylinder(
      "reactor crown countersunk fastener",
      3.155,
      0.026,
      0.045,
      0.045,
    );
    screw.position.x = Math.sin(a) * 1.05;
    screw.position.z = Math.cos(a) * 1.05;
  }
  // Pale structural ribs segment the glowing crown without changing its silhouette.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rib = world.box(
      "reactor crown containment rib",
      Math.sin(a) * 0.83,
      3.27,
      Math.cos(a) * 0.83,
      0.027,
      0.026,
      0.4,
      "#8bafba",
    );
    rib.parent = root;
    rib.rotation.set(0.675, a, 0);
    rib.material = world.finish("#8bafba", "metal");
  }
  // Merge stationary decoration by material; keep the three pulsing energy meshes independent.
  const animated = new Set([column, cap, dome]);
  for (const mesh of root.getChildMeshes())
    if (mesh.parent !== root) mesh.setParent(root);
  const groups = new Map<import("@babylonjs/core").Material, Mesh[]>();
  for (const mesh of root.getChildMeshes() as Mesh[]) {
    if (!mesh.material || animated.has(mesh) || mesh === jacket) continue;
    const group = groups.get(mesh.material) ?? [];
    group.push(mesh);
    groups.set(mesh.material, group);
  }
  for (const parts of groups.values())
    if (parts.length > 1) {
      const merged = Mesh.MergeMeshes(parts, true, true);
      if (merged) {
        merged.name = "reactor static assembly";
        merged.parent = root;
        merged.isPickable = false;
        merged.receiveShadows = true;
        world.shadows.addShadowCaster(merged);
      }
    }
  root.position.set(x, 0, z);
  return { root, energy: [column, cap, dome] };
}
