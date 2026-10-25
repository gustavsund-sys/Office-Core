import { detailedOfficeModel, officeModelTools } from "./officeLifeModels";
import { Mesh, MeshBuilder, Vector3 } from "@babylonjs/core";
import type { World } from "./builder";
import { blocked } from "../game/collision";
import { office01 } from "../maps/office01";
import { mergeStaticParts } from "../weapons/staticModel";

/** Small desktop dressing joins the existing per-prop batches and damage lifecycle. */
export function dressOfficeProp(
  world: World,
  kind: string,
  x: number,
  z: number,
  w: number,
  d: number,
) {
  if (world.authoritative) return;
  const box = (
    name: string,
    dx: number,
    y: number,
    dz: number,
    bw: number,
    h: number,
    bd: number,
    color: string,
  ) => {
    const m = world.box(
      name,
      x + dx,
      y +
        (kind === "desk" || kind === "counter"
          ? 0.065
          : kind === "coffee"
            ? 0.45
            : 0),
      z + dz,
      bw,
      h,
      bd,
      color,
    );
    m.isPickable = false;
    m.metadata = { visualOnly: true, distanceDetail: true };
    world.shadows.removeShadowCaster(m);
    return m;
  };
  const mug = (dx: number, y: number, dz: number) => {
    const m = MeshBuilder.CreateCylinder(
      "office coffee mug",
      { diameter: 0.14, height: 0.18, tessellation: 8 },
      world.scene,
    );
    m.position.set(
      x + dx,
      y +
        (kind === "desk" || kind === "counter"
          ? 0.065
          : kind === "coffee"
            ? 0.45
            : 0),
      z + dz,
    );
    m.material = world.mat("#d8d5c2");
    m.isPickable = false;
    m.metadata = { visualOnly: true, distanceDetail: true };
    const coffee = MeshBuilder.CreateCylinder("coffee surface", {diameter:.105,height:.006,tessellation:12},world.scene);
    coffee.position.copyFrom(m.position);coffee.position.y+=.09;coffee.material=world.mat("#503d31");coffee.isPickable=false;coffee.metadata=m.metadata;
    const handle=MeshBuilder.CreateTorus("ceramic mug handle",{diameter:.095,thickness:.023,tessellation:12},world.scene);
    handle.position.copyFrom(m.position);handle.position.x+=.075;handle.rotation.x=Math.PI/2;handle.material=m.material;handle.isPickable=false;handle.metadata=m.metadata;

  };
  if (kind === "desk") {
    const side = Math.sin(x * 13 + z * 7) > 0 ? 1 : -1;
    mug(side * w * 0.33, 1.065, -d * 0.2);
    box(
      "personal photo frame",
      -side * w * 0.34,
      1.14,
      d * 0.25,
      0.22,
      0.26,
      0.035,
      "#3c5057",
    );
    box(
      "photo sky",
      -side * w * 0.34,
      1.15,
      d * 0.25 - 0.023,
      0.17,
      0.19,
      0.012,
      "#83a6ad",
    );
    box(
      "photo portrait",
      -side * w * 0.34,
      1.12,
      d * 0.25 - 0.032,
      0.065,
      0.095,
      0.012,
      "#c9ae89",
    );
    box(
      "lunch box",
      side * w * 0.3,
      1.035,
      d * 0.24,
      0.3,
      0.1,
      0.19,
      "#8eac95",
    );
    for (let i = 0; i < 2; i++) {
      const paper = box(
        "desk papers",
        -0.1 + i * 0.04,
        0.993 + i * 0.009,
        -d * 0.22,
        0.25,
        0.008,
        0.18,
        "#dedbc6",
      );
      paper.rotation.y = 0.12 + i * 0.15;
    }
    const headphones = MeshBuilder.CreateTorus(
      "desk headphones",
      { diameter: 0.22, thickness: 0.026, tessellation: 12 },
      world.scene,
    );
    headphones.position.set(x - side * w * 0.3, 1.08, z - d * 0.2);
    headphones.material = world.mat("#34474c");
    headphones.isPickable = false;
    headphones.metadata = { visualOnly: true, distanceDetail: true };
    for (const offset of [-0.1, 0.1])
      box(
        "headphone ear cup",
        -side * w * 0.3 + offset,
        1.02,
        -d * 0.2,
        0.065,
        0.055,
        0.09,
        "#34474c",
      );
    const lamp=officeModelTools(world,x,z);
    lamp.cylinder("desk lamp weighted base",0,1.065,d*.28,.2,.045,"#667e83");
    lamp.tube("desk lamp articulated arm",[[0,1.08,d*.28],[0,1.36,d*.3],[.12,1.48,d*.22]],.017,"#667e83");
    lamp.cylinder("desk lamp pivot",0,1.36,d*.3,.065,.06,"#667e83").rotation.z=Math.PI/2;
    const shade=lamp.cylinder("desk lamp conical shade",.14,1.43,d*.2,.22,.13,"#667e83",.08);shade.rotation.z=-.25;
    lamp.cylinder("desk lamp diffuser",.155,1.365,d*.2,.17,.008,"#dedbc6");
    if (Math.sin(x * 3 + z) > 0.4) {
      box(
        "desk power strip",
        w * 0.25,
        -0.02,
        d * 0.3,
        0.4,
        0.06,
        0.11,
        "#c8cbbe",
      );
      const path = Array.from(
        { length: 13 },
        (_, i) =>
          new Vector3(
            x + w * 0.25 + Math.cos((i * Math.PI) / 4) * 0.16,
            0.025,
            z + d * 0.3 + 0.23 + Math.sin((i * Math.PI) / 4) * 0.16,
          ),
      );
      const cable = MeshBuilder.CreateTube(
        "desk cable coil",
        { path, radius: 0.012, tessellation: 6 },
        world.scene,
      );
      cable.material = world.mat("#34474c");
      cable.isPickable = false;
      cable.metadata = { visualOnly: true, distanceDetail: true };
    }
  } else if (kind === "whiteboard") {
    for (let i = 0; i < 5; i++)
      box(
        "whiteboard meeting notes",
        -0.7 + i * 0.25,
        1.35 + (i % 2) * 0.16,
        -d * 0.13 - 0.018,
        0.16,
        0.13,
        0.012,
        ["#c6ac64", "#a4b992", "#b28e85"][i % 3],
      );
    for (let i = 0; i < 3; i++)
      box(
        "whiteboard marker lines",
        -0.2,
        1.05 + i * 0.09,
        -d * 0.13 - 0.023,
        0.8 - i * 0.14,
        0.017,
        0.012,
        "#506b76",
      );
    for (const dx of [-w * 0.4, w * 0.4])
      for (const dz of [-d * 0.35, d * 0.35]) {
        const wheel = MeshBuilder.CreateCylinder(
          "whiteboard caster",
          { diameter: 0.14, height: 0.055, tessellation: 8 },
          world.scene,
        );
        wheel.position.set(x + dx, 0.075, z + dz);
        wheel.rotation.z = Math.PI / 2;
        wheel.material = world.mat("#34474c");
        wheel.isPickable = false;
        wheel.metadata = { visualOnly: true, distanceDetail: true };
      }
  } else if (kind === "coffee" || kind === "counter") {
    for (let i = 0; i < 3; i++)
      mug(-w * 0.3 + i * 0.22, kind === "coffee" ? 1.15 : 1.065, -d * 0.22);
    box(
      "thermos flask",
      w * 0.28,
      kind === "coffee" ? 1.235 : 1.16,
      0,
      0.15,
      0.37,
      0.15,
      "#7f969b",
    );
    box(
      "thermos lid",
      w * 0.28,
      kind === "coffee" ? 1.44 : 1.365,
      0,
      0.16,
      0.055,
      0.16,
      "#34474c",
    );
    const ring = MeshBuilder.CreateTorus(
      "coffee stain",
      { diameter: 0.19, thickness: 0.015, tessellation: 12 },
      world.scene,
    );
    ring.position.set(
      x + w * 0.1,
      kind === "coffee" ? 1.505 : 1.052,
      z - d * 0.22,
    );
    ring.material = world.mat("#89785f");
    ring.isPickable = false;
    ring.metadata = { visualOnly: true, distanceDetail: true };
  } else if (kind === "bin") {
    for (let i = 0; i < 4; i++)
      box(
        "overflowing crumpled paper",
        Math.sin(i * 7) * 0.15,
        0.73 + i * 0.025,
        Math.cos(i * 7) * 0.15,
        0.14,
        0.11,
        0.12,
        "#dedbc6",
      );
  } else if (kind === "server") {
    box(
      "server power strip",
      w * 0.3,
      0.045,
      -d * 0.6,
      0.42,
      0.06,
      0.1,
      "#c8cbbe",
    );
    for (let i = 0; i < 3; i++)
      box(
        "server trailing cable",
        w * 0.25 - i * 0.06,
        0.018,
        -d * 0.6 - 0.17,
        0.024,
        0.025,
        0.4,
        "#34474c",
      );
  }
}

export function buildOfficeLife(world: World) {
  const floor = (x: number, z: number, r: number) =>
    office01.footprint.some(
      (b) => Math.abs(x - b.x) < b.w / 2 - r && Math.abs(z - b.z) < b.d / 2 - r,
    );
  const clear = (x: number, z: number, r: number) =>
    floor(x, z, r) && !blocked(x, z, r, world.obstacles);
  const place = (
    kind: string,
    px: number,
    pz: number,
    w: number,
    d: number,
    room?: { x: number; z: number; w: number; d: number },
  ) => {
    for (const [dx, dz] of [
      [0, 0],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
      [3, 2],
      [-3, -2],
      ...(room ? Array.from({length: 35}, (_, i) => [room.x - px + (i % 7 - 3) * 2, room.z - pz + (Math.floor(i / 7) - 2) * 2]) : []),
    ]) {
      const x = px + dx,
        z = pz + dz;
      if (room && (Math.abs(x-room.x) + w/2 + .5 > room.w/2 || Math.abs(z-room.z) + d/2 + .5 > room.d/2)) continue;
      if (!clear(x, z, Math.max(w, d) / 2 + 0.25)) continue;
      const collider = world.box(
        `office life ${kind} collider`,
        x,
        0.6,
        z,
        w,
        1.2,
        d,
        "#526b71",
        true,
      );
      collider.visibility = 0;
      world.shadows.removeShadowCaster(collider);
      if (world.authoritative) return;
      const obstacleCount = world.obstacles.length;
      const start = new Set(world.scene.meshes);
      if (!detailedOfficeModel(world, kind, x, z, w, d)) {
        world.officeObject(kind, x, z, w, d);
        world.propDetails(kind, x, z, w, d);
      }
      const parts = world.scene.meshes.filter((m) => !start.has(m)) as Mesh[];
      for (const m of parts) {
        m.isPickable = false;
        m.metadata = { visualOnly: true };
        world.shadows.removeShadowCaster(m);
      }
      // Existing office models create their own solid bases. The explicit collider is sufficient.
      world.solids = world.solids.filter((m) => !parts.includes(m));
      world.obstacles.splice(obstacleCount);
      mergeStaticParts(world, parts, new Vector3(x, 0, z));
      return;
    }
  };
  for (const side of [-1, 1]) {
    const room = office01.rooms.find(r => r.name === (side < 0 ? "OPEN OFFICE" : "MEETING ROOM"))!;
    place("coat rack", room.x + side * 7, room.z + 4, 0.95, 0.75, room);
    place("whiteboard", side * 43, 12, 2.4, 0.5);
    place("boxes", side * 7, 40, 2, 1.5);
    place("coffee", side * 39, 8, 1.2, 0.8);
    place("bin", side * 40, 6.5, 0.7, 0.7);
    place("fallen chair", room.x - side * 3, room.z - 2, 0.9, 0.8, room);
    for (const [x, z] of [
      [side * 11, -9],
      [side * 13, -5],
      [side * 9, -5],
    ])
      if (clear(x, z, 1)) {
        world.carts.add(x, z);
        break;
      }
  }
  // Door readers and simple exit pictograms use geometry/materials, not new textures or lights.
  if (!world.authoritative)
    for (const side of [-1, 1]) {
      // Mount on a real horizontal wall, with enough space for sign and reader.
      const wall = office01.walls
        .filter(b => b.w >= 3.5 && b.d < 1 && floor(b.x, b.z - b.d / 2 - .3, .05))
        .sort((a,b) => Math.hypot(a.x-side*72,a.z-4.6)-Math.hypot(b.x-side*72,b.z-4.6))[0];
      if (!wall) continue;
      const mountX = Math.max(wall.x-wall.w/2+.8, Math.min(side*72,wall.x+wall.w/2-1.4));
      const faceZ = wall.z-wall.d/2;
      const parts: Mesh[] = [];
      for (const [name, dx, y, w, h, color] of [
        ["exit sign", 0, 1.65, 1.25, 0.32, "#467864"],
        ["exit pictogram", 0, 1.65, 0.55, 0.065, "#d6dfc4"],
        ["card reader", 1.1, 1.1, 0.16, 0.26, "#34474c"],
        ["reader status", 1.1, 1.16, 0.06, 0.03, "#7fb89b"],
      ] as const) {
        const overlay = name === "exit pictogram" || name === "reader status";
        const depth = overlay ? .012 : .045;
        const m = world.box(name, mountX + dx, y, faceZ - (overlay ? .051 : .0225), w, h, depth, color);
        m.isPickable = false;
        m.metadata = { visualOnly: true };
        world.shadows.removeShadowCaster(m);
        parts.push(m);
      }
      mergeStaticParts(world, parts);
    }
}
