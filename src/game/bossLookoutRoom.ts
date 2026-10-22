import {
  Color3,
  Color4,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  Vector3,
} from "@babylonjs/core";
import type { World } from "../map/builder";
import { bossTurretModel } from "./bossTurretModel";
import { mergeStaticParts } from "../weapons/staticModel";

export interface LookoutRig {
  yaw: Mesh;
  pitch: Mesh;
  gun: Mesh;
}
/** Fixed room, lift shaft and a two-axis weapon mount, all in world space. */
export function buildLookoutRoom(
  world: World,
  side: number,
  height: number,
): LookoutRig {
  const x = side * 94,
    front = x - side * 7,
    fixed: Mesh[] = [];
  const box = (
    name: string,
    px: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    glow = false,
  ) => {
    const m = world.box(name, px, y, z, w, h, d, color, false, glow);
    m.isPickable = false;
    fixed.push(m);
    return m;
  };
  const rod = (
    name: string,
    a: Vector3,
    b: Vector3,
    diameter: number,
    color: string,
  ) => {
    const delta = b.subtract(a);
    const m = MeshBuilder.CreateCylinder(
      name,
      { diameter, height: delta.length(), tessellation: 10 },
      world.scene,
    );
    m.position.copyFrom(a.add(b).scale(0.5));
    m.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.Up(),
      delta.normalize(),
      new Quaternion(),
    );
    m.material = world.finish(color, "metal");
    m.isPickable = false;
    fixed.push(m);
    return m;
  };
  // Shaft is vertically aligned with the room. Its south-facing doors face the normal game camera.
  box(
    "Lookout lift shaft rear",
    x,
    height / 2,
    -7.6,
    5,
    height,
    0.45,
    "#2a3a45",
  );
  for (const s of [-1, 1]) {
    box(
      "Lookout shaft side",
      x + s * 2.45,
      height / 2,
      -10,
      0.45,
      height,
      5.2,
      "#344650",
    );
    box(
      "Lift vertical steel rail",
      x + s * 2.15,
      height / 2,
      -12.6,
      0.15,
      height,
      0.18,
      "#73838a",
    );
  }
  box(
    "Lift shaft front above doorway",
    x,
    (height + 3.4) / 2,
    -12.65,
    4.6,
    height - 3.4,
    0.35,
    "#344650",
  );
  box("Lift door left leaf", x - 0.64, 1.6, -12.85, 1.26, 3.2, 0.2, "#71828c");
  box("Lift door right leaf", x + 0.64, 1.6, -12.85, 1.26, 3.2, 0.2, "#60737e");
  box("Lift door center seam", x, 1.6, -13, 0.045, 3.2, 0.035, "#17242c");
  for (const s of [-1, 1])
    box("Lift door jamb", x + s * 1.5, 1.65, -13, 0.25, 3.5, 0.5, "#172b37");
  box("Elevator lintel", x, 3.4, -13, 3.3, 0.28, 0.5, "#d9b45f");
  box("Elevator threshold", x, 0.04, -13.15, 3.4, 0.08, 1.3, "#b09a5c");
  box("Lift key card reader", x + 1.8, 1.35, -13, 0.3, 0.6, 0.25, "#152b38");
  box(
    "Lift key card reader light",
    x + 1.8,
    1.5,
    -13.16,
    0.15,
    0.12,
    0.025,
    "#ffcf58",
    true,
  );
  // Large raised gold key, modelled on the door rather than painted on the floor.
  const bow = MeshBuilder.CreateTorus(
    "Elevator door gold key symbol",
    { diameter: 0.85, thickness: 0.16, tessellation: 20 },
    world.scene,
  );
  bow.rotation.x = Math.PI / 2;
  bow.position.set(x, 2.15, -13.08);
  bow.material = world.mat("#ffcf58", true);
  bow.isPickable = false;
  fixed.push(bow);
  box("Door key stem", x, 1.45, -13.08, 0.16, 0.75, 0.14, "#ffcf58", true);
  for (const y of [1.1, 1.35])
    box(
      "Door key tooth",
      x + 0.16,
      y,
      -13.08,
      0.35,
      0.14,
      0.14,
      "#ffcf58",
      true,
    );
  const sign = world.label("BOSS LOOKOUT · LIFT", x, -15.3, "#ffcf58", 5);
  sign.position.y = 0.09;
  // Enclosed observation room with a recessed gun window and a visible floor.
  box("Boss Lookout floor", x, height - 0.2, 0, 14, 0.4, 14, "#374952");
  box("Lookout ceiling", x, height + 3.4, 0, 14, 0.25, 14, "#263944");
  box(
    "Lookout rear wall",
    x + side * 6.85,
    height + 1.6,
    0,
    0.15,
    3.2,
    14,
    "#344956",
  );
  for (const z of [-6.85, 6.85])
    box(
      "Lookout interior side wall",
      x,
      height + 1.6,
      z,
      14,
      3.2,
      0.15,
      "#344956",
    );
  // The front has a broad opening; steel jambs and sill make the viewing position tangible.
  for (const s of [-1, 1])
    box(
      "Lookout window side wall",
      front,
      height + 1.6,
      s * 4.0,
      0.2,
      3.2,
      5.6,
      "#344956",
    );
  box(
    "Lookout window sill",
    front,
    height + 0.12,
    0,
    0.425,
    0.24,
    2.4,
    "#627b88",
  );
  box(
    "Lookout window header",
    front,
    height + 2.725,
    0,
    0.275,
    1.35,
    2.4,
    "#344956",
  );
  for (const z of [-1.2, 1.2])
    box(
      "Lookout window steel jamb",
      front,
      height + 1.6,
      z,
      0.3,
      3.2,
      0.08,
      "#8b9fa6",
    );
  box(
    "Window upper light",
    front + side * 0.3,
    height + 2.0,
    0,
    0.12,
    0.08,
    2.2,
    "#d6e4cc",
    true,
  );
  // Inner console and fixed tripod. Only the yaw ring and pitch trunnion move.
  const pivot = new Vector3(front + side * 0.75, height + 1.1, 0);
  const foot = new Vector3(pivot.x, height + 0.1, 0);
  box(
    "Turret mounting plinth",
    foot.x,
    height + 0.06,
    0,
    1.5,
    0.12,
    1.7,
    "#162b36",
  );
  for (const [dx, dz] of [
    [-0.65, -0.7],
    [0.65, -0.7],
    [0, 0.75],
  ]) {
    const bottom = new Vector3(foot.x + dx, height + 0.13, dz);
    rod(
      "Turret tripod leg",
      bottom,
      pivot.add(new Vector3(0, -0.15, 0)),
      0.065,
      "#6d818b",
    );
    box(
      "Turret bolted foot",
      bottom.x,
      height + 0.15,
      bottom.z,
      0.18,
      0.045,
      0.18,
      "#9aaab0",
    );
  }
  rod("Turret fixed vertical axle", foot, pivot, 0.1, "#536b79");
  const yaw = new Mesh("Lookout fixed yaw axle", world.scene);
  yaw.position.copyFrom(pivot);
  const pitch = new Mesh("Lookout pitch trunnion", world.scene);
  pitch.parent = yaw;
  const gun = bossTurretModel(world);
  gun.parent = pitch;
  gun.scaling.setAll(0.8);
  gun.position.z = 0.25;
  // Trunnion brackets rotate around the same fixed yaw bearing as the gun.
  for (const px of [-0.1, 0.1]) {
    const bracket = world.box(
      "Turret pivot bracket",
      px,
      -0.05,
      0,
      0.035,
      0.15,
      0.12,
      "#8396a0",
    );
    bracket.parent = yaw;
    bracket.isPickable = false;
  }
  const pin = MeshBuilder.CreateCylinder(
    "Turret horizontal pitch axle",
    { diameter: 0.045, height: 0.26, tessellation: 12 },
    world.scene,
  );
  pin.rotation.z = Math.PI / 2;
  pin.parent = yaw;
  pin.material = world.finish("#c4c8b6", "metal");
  pin.isPickable = false;
  yaw.rotation.y = (-side * Math.PI) / 2;
  pitch.rotation.x = 0.24;
  const shell = new Mesh("Boss Lookout room shell", world.scene);
  for (const part of fixed) part.parent = shell;
  mergeStaticParts(world, fixed);
  for (const part of shell.getChildMeshes()) {
    part.isPickable = true;
    part.metadata = { ...part.metadata, solid: true, material: "metal" };
  }
  return { yaw, pitch, gun };
}

/** Fog is applied only while using the observation room and restored exactly on exit. */
export class LookoutAtmosphere {
  private saved?: {
    mode: number;
    start: number;
    end: number;
    density: number;
    color: Color3;
    clear: Color4;
  };
  constructor(private scene: Scene) {}
  enter() {
    if (this.saved) return;
    const s = this.scene;
    this.saved = {
      mode: s.fogMode,
      start: s.fogStart,
      end: s.fogEnd,
      density: s.fogDensity,
      color: s.fogColor.clone(),
      clear: s.clearColor.clone(),
    };
    s.fogMode = Scene.FOGMODE_LINEAR;
    s.fogStart = 55;
    s.fogEnd = 170;
    s.fogColor = new Color3(0.025, 0.045, 0.06);
    s.clearColor = new Color4(0.025, 0.045, 0.06, 1);
  }
  exit() {
    if (!this.saved) return;
    const s = this.scene,
      p = this.saved;
    s.fogMode = p.mode;
    s.fogStart = p.start;
    s.fogEnd = p.end;
    s.fogDensity = p.density;
    s.fogColor.copyFrom(p.color);
    s.clearColor.copyFrom(p.clear);
    this.saved = undefined;
  }
}
