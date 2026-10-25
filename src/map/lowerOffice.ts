import {
  createOfficePortal,
  LOWER_OFFICE_LAYER,
  PORTAL_SURFACE_Y,
} from "./officePortal";
import { deskAssembly } from "./deskAssembly";
import { OBJECTS } from "../maps/layout";
import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
} from "@babylonjs/core";
import type { World } from "./builder";
import { mergeStaticParts } from "../weapons/staticModel";

/** Empty pockets between the central atrium and the mirrored southern lanes. */
export const OFFICE_WINDOWS = [
  ...[-1, 1].map((side) => ({
    x: side * 23.8,
    z: -21.5,
    w: 8,
    d: 9.5,
    theme: "office" as const,
  })),
  { x: 0, z: -29, w: 8, d: 7, theme: "meeting" as const },
];
export const LOWER_OFFICE_Y = -5.6;

export function buildLowerOffices(world: World) {
  if (world.authoritative) return;
  const scene = world.scene;
  const glass = new StandardMaterial("laminated viewing glass", scene);
  glass.diffuseColor = Color3.FromHexString("#78a7b2");
  glass.emissiveColor = Color3.FromHexString("#081a20");
  glass.specularColor = new Color3(0.65, 0.78, 0.82);
  glass.specularPower = 96;
  glass.alpha = 0.14;
  glass.backFaceCulling = false;
  glass.disableDepthWrite = true;
  for (const opening of OFFICE_WINDOWS) {
    const { x, z, w, d } = opening;
    const root = new TransformNode("lower office · visual only", scene);
    const parts: Mesh[] = [];
    const finishes = new Map<StandardMaterial, StandardMaterial>();
    const adopt = (m: Mesh, glow = false) => {
      m.parent = root;
      m.isPickable = false;
      m.layerMask = LOWER_OFFICE_LAYER;
      m.metadata = { visualOnly: true, lowerOffice: true };
      world.shadows.removeShadowCaster(m);
      if (!glow) {
        const base = m.material as StandardMaterial;
        let mat = finishes.get(base);
        if (!mat) {
          mat = base.clone(`lower office ${base.name}`);
          mat.emissiveColor = base.diffuseColor.scale(0.19);
          finishes.set(base, mat);
        }
        m.material = mat;
      }
      parts.push(m);
      return m;
    };
    const box = (
      name: string,
      dx: number,
      y: number,
      dz: number,
      bw: number,
      bh: number,
      bd: number,
      color: string,
      glow = false,
    ) =>
      adopt(
        world.box(name, x + dx, y, z + dz, bw, bh, bd, color, false, glow),
        glow,
      );
    const y = LOWER_OFFICE_Y;
    box("room carpet", 0, y - 0.06, 2, 12, 0.12, 22, "#626d66");
    // Real vertical walls and furniture one storey below the playing surface.
    box("lower office wall", -6, y + 1.7, 2, 0.18, 3.4, 22, "#bcbaa8");
    box("lower office wall", 6, y + 1.7, 2, 0.18, 3.4, 22, "#bcbaa8");
    box("lower office wall", 0, y + 1.7, 13, 12, 3.4, 0.18, "#9daaa4");
    if (opening.theme === "office") {
      for (const dx of [-1.85, 1.85])
        for (const dz of [-3, 1.2, 5.4]) {
          const start = scene.meshes.length;
          deskAssembly(
            world,
            x + dx,
            z + dz,
            OBJECTS.desk[1],
            OBJECTS.desk[2],
            false,
          );
          world.propDetails(
            "desk",
            x + dx,
            z + dz,
            OBJECTS.desk[1],
            OBJECTS.desk[2],
          );
          for (const mesh of scene.meshes.slice(start) as Mesh[]) {
            mesh.position.y += y;
            adopt(mesh, mesh.name === "display");
          }
        }
    } else {
      box(
        "meetingTable",
        0,
        y + 0.95,
        2.2,
        OBJECTS.meetingTable[1],
        0.18,
        OBJECTS.meetingTable[2],
        "#b5a58b",
      );
      box(
        "meeting table pedestal",
        0,
        y + 0.44,
        2.2,
        4.2,
        0.85,
        1.4,
        "#405561",
      );
      for (const dx of [-2, 0, 2])
        for (const side of [-1, 1]) {
          box(
            "chair seat",
            dx,
            y + 0.5,
            2.2 + side * 2,
            0.75,
            0.15,
            0.7,
            "#517b7d",
          );
          box(
            "chair back",
            dx,
            y + 0.85,
            2.2 + side * 2.28,
            0.75,
            0.7,
            0.14,
            "#517b7d",
          );
          box(
            "lower chair base",
            dx,
            y + 0.22,
            2.2 + side * 2,
            0.12,
            0.44,
            0.12,
            "#30464f",
          );
          box(
            "meeting notepad",
            dx,
            y + 1.055,
            2.2 + side * 0.7,
            0.35,
            0.025,
            0.42,
            "#e8dfc8",
          );
        }
      box(
        "meeting presentation display",
        0,
        y + 1.5,
        6,
        3.8,
        1.7,
        0.12,
        "#243d48",
      );
      box(
        "meeting presentation screen",
        0,
        y + 1.5,
        5.93,
        3.5,
        1.45,
        0.015,
        "#83c5c6",
        true,
      );
      for (let i = 0; i < 4; i++)
        box(
          "presentation chart",
          -0.95 + i * 0.6,
          y + 1.1 + i * 0.17,
          5.91,
          0.35,
          0.22 + i * 0.2,
          0.012,
          "#ecdfaa",
        );
    }
    for (const dx of [-4.65, 4.65]) {
      box("lower filing cabinet", dx, y + 0.7, 8.8, 1.1, 1.4, 0.65, "#6b8187");
      for (const height of [0.35, 0.75, 1.15])
        box("lower drawer", dx, y + height, 8.46, 0.8, 0.025, 0.025, "#ced0bc");
      box("planter", dx, y + 0.25, -3.8, 0.75, 0.5, 0.75, "#b3a88f");
      for (let i = 0; i < 3; i++) {
        const leaf = box(
          "lower foliage",
          dx + Math.sin(i * 2) * 0.18,
          y + 0.8 + i * 0.12,
          -3.8,
          0.55,
          0.55,
          0.14,
          "#4e8066",
        );
        leaf.rotation.set(0.3 * i, i * 1.1, 0.3);
      }
    }
    for (const dz of [-4.5, 3.8, 10]) {
      box("lower suspended luminaire", 0, y + 3, dz, 4, 0.1, 0.3, "#46595d");
      box(
        "lower warm luminaire",
        0,
        y + 2.94,
        dz,
        3.6,
        0.025,
        0.22,
        "#ffe2a3",
        true,
      );
    }
    mergeStaticParts(world, parts);
    const officeMeshes = root.getChildMeshes() as Mesh[];
    for (const mesh of officeMeshes) mesh.layerMask = LOWER_OFFICE_LAYER;
    createOfficePortal(scene, opening, officeMeshes);

    const pane = MeshBuilder.CreateBox(
      "office viewing glass",
      { width: w, height: 0.065, depth: d },
      scene,
    );
    pane.position.set(x, PORTAL_SURFACE_Y + 0.04, z);
    pane.material = glass;
    pane.isPickable = false;
    pane.metadata = { visualOnly: true };
    // The frame and transparent glass cover the perspective surface at wall-top height.
    const frame = (dx: number, dz: number, bw: number, bd: number) => {
      const m = world.box(
        "viewing glass frame",
        x + dx,
        PORTAL_SURFACE_Y + 0.02,
        z + dz,
        bw,
        0.1,
        bd,
        "#586d73",
      );
      m.material = world.finish("#586d73", "metal");
      m.isPickable = false;
    };
    frame(-w / 2, 0, 0.16, d + 0.16);
    frame(w / 2, 0, 0.16, d + 0.16);
    frame(0, -d / 2, w, 0.16);
    frame(0, d / 2, w, 0.16);
    frame(0, 0, 0.075, d);
    for (const dz of [-d / 6, d / 6]) frame(0, dz, w, 0.075);
  }
}
