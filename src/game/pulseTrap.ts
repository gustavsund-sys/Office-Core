import {
  MeshBuilder,
  Mesh,
  Ray,
  TransformNode,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import { pulseTrapPulse } from "../audio/pulseTrapRhythm";
import { rcCarModel } from "./rcCarModel";
import { superMedkitModel } from "../pickups/superMedkitModel";
import type { World } from "../map/builder";
import { office01 } from "../maps/office01";
import { TEAMS, type Team } from "../config/game";
import type { Hittable } from "../core/hittable";
import type { BeaconActor } from "./beacon";
import type { Weapons } from "../weapons/system";

export const PULSE_TRAP = {
  radius: 5,
  detectionRadius: 10,
  damage: 50,
  contact: 1,
  arm: 1,
  respawn: 180,
  maxPlaced: 16,
} as const;
export interface PulseTrapState {
  alert?: number;
  id: number;
  owner: string;
  team: Team;
  x: number;
  z: number;
  yaw: number;
  arm: number;
}
export interface PlacedMedkit {
  id: number;
  x: number;
  z: number;
  yaw: number;
  arm: number;
}
export interface PulseTrapDrop {
  team: Team;
  x: number;
  z: number;
  cooldown: number;
}
export interface TrapActor extends BeaconActor {
  weapons: Pick<
    Weapons,
    | "carryingPulseTrap"
    | "pulseTrapSelected"
    | "carryingBeacon"
    | "switchSlot"
    | "utilityKind"
    | "utilityCount"
  >;
}

/** Ribbed ivory casing, pink plasma cap and four dark cooling slots from the reference. */
export function pulseTrapModel(world: World) {
  const root = new TransformNode("pulse trap", world.scene);
  const seekingParts: {
    mesh: Mesh;
    axis: "x" | "z";
    rest: number;
    direction: number;
  }[] = [];
  root.metadata = { seekingParts };
  const part = (
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
    const m = world.box(name, x, y, z, w, h, d, color, false, glow);
    m.parent = root;
    if (!glow) m.material = world.finish(color, "metal");
    m.isPickable = false;
    return m;
  };
  const casing = part(
    "pulse trap ivory casing",
    0,
    0.2,
    0,
    1.05,
    0.4,
    0.58,
    "#dce8e7",
  );
  if (!world.authoritative) {
    // Bevelled alloy enclosure: chamfered corners and softened top/bottom edges.
    const positions: number[] = [],
      indices: number[] = [],
      normals: number[] = [];
    const outline = [
      [-0.485, -0.29],
      [0.485, -0.29],
      [0.525, -0.25],
      [0.525, 0.25],
      [0.485, 0.29],
      [-0.485, 0.29],
      [-0.525, 0.25],
      [-0.525, -0.25],
    ];
    for (const [y, inset] of [
      [-0.2, 0.018],
      [-0.175, 0],
      [0.175, 0],
      [0.2, 0.018],
    ])
      for (const [x, z] of outline)
        positions.push(x - Math.sign(x) * inset, y, z - Math.sign(z) * inset);
    for (let ring = 0; ring < 3; ring++)
      for (let i = 0; i < 8; i++) {
        const a = ring * 8 + i,
          b = ring * 8 + ((i + 1) % 8);
        indices.push(a, b, a + 8, b, b + 8, a + 8);
      }
    for (let i = 1; i < 7; i++) {
      indices.push(0, i + 1, i);
      indices.push(24, 24 + i, 25 + i);
    }
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.uvs = positions.flatMap((_, i) =>
      i % 3 === 0 ? [positions[i] + 0.525, positions[i + 2] + 0.29] : [],
    );
    data.applyToMesh(casing);
    casing.convertToFlatShadedMesh();
  }
  if (!world.authoritative) {
    for (let i = 0; i < 15; i++)
      for (const side of [-1, 1])
        part(
          "pulse trap rib",
          -0.49 + i * 0.07,
          0.2,
          side * 0.3,
          0.025,
          0.39,
          0.035,
          "#f4faf5",
        );
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++)
        part(
          "pulse trap cooling slot",
          -0.24 + i * 0.16,
          0.18,
          side * 0.322,
          0.07,
          0.2,
          0.012,
          "#304956",
        );
      const rail = part(
        "pulse trap luminous rail",
        0,
        0.34,
        side * 0.33,
        0.8,
        0.07,
        0.055,
        "#ff55c3",
        true,
      );
      rail.metadata = { seeking: true };
      seekingParts.push({
        mesh: rail,
        axis: "z",
        rest: side * 0.33,
        direction: side,
      });
    }
    const emitter = part(
      "pulse trap pink emitter",
      -0.62,
      0.22,
      0,
      0.23,
      0.3,
      0.48,
      "#ff55c3",
      true,
    );
    emitter.metadata = { seeking: true };
    seekingParts.push({ mesh: emitter, axis: "x", rest: -0.62, direction: -1 });
    part("pulse trap end protector", 0.55, 0.2, 0, 0.07, 0.42, 0.62, "#c3d3d6");
    part("pulse trap upper cell", 0, 0.416, 0, 0.7, 0.035, 0.3, "#ed8bd3");
    // Gaskets, rubber feet and fasteners make the casing read as assembled hardware.
    part("pulse trap lid seam", 0, 0.375, 0, 1.045, 0.014, 0.575, "#566e79");
    part("pulse trap lower bumper", 0, 0.027, 0, 1.01, 0.055, 0.55, "#30444f");
    for (const x of [-0.4, 0.4])
      for (const z of [-0.2, 0.2]) {
        part(
          "pulse trap rubber foot",
          x,
          -0.01,
          z,
          0.15,
          0.07,
          0.14,
          "#243640",
        );
        const screw = MeshBuilder.CreateCylinder(
          "pulse trap hex fastener",
          { height: 0.014, diameter: 0.045, tessellation: 6 },
          world.scene,
        );
        screw.parent = root;
        screw.position.set(x, 0.407, z);
        screw.material = world.finish("#7e939e", "metal");
        screw.isPickable = false;
        part(
          "pulse trap screw slot",
          x,
          0.416,
          z,
          0.024,
          0.006,
          0.006,
          "#243640",
        );
      }
    for (const side of [-1, 1]) {
      part(
        "pulse trap rail socket",
        0,
        0.34,
        side * 0.323,
        0.84,
        0.105,
        0.023,
        "#566e79",
      );
      for (const x of [-0.28, 0.28])
        part(
          "pulse trap actuator shaft",
          x,
          0.34,
          side * 0.36,
          0.035,
          0.035,
          0.14,
          "#9dafb8",
        );
      for (let i = 0; i < 4; i++)
        for (let fin = 0; fin < 3; fin++)
          part(
            "pulse trap vent louvre",
            -0.24 + i * 0.16,
            0.11 + fin * 0.055,
            side * 0.332,
            0.06,
            0.009,
            0.022,
            "#6c838d",
          );
    }
    part(
      "pulse trap emitter socket",
      -0.51,
      0.22,
      0,
      0.04,
      0.34,
      0.5,
      "#566e79",
    );
    part(
      "pulse trap service plate",
      0.2,
      0.424,
      0,
      0.18,
      0.018,
      0.18,
      "#718590",
    );
    for (let i = 0; i < 3; i++)
      part(
        "pulse trap service marking",
        0.16 + i * 0.038,
        0.435,
        0,
        0.015,
        0.008,
        0.09,
        "#dce8e7",
      );
    for (const x of [-0.39, 0.39])
      part(
        "pulse trap recessed latch",
        x,
        0.437,
        0,
        0.06,
        0.02,
        0.13,
        "#45606a",
      );
  }
  // Static parts share materials and are merged, keeping each deployed mine inexpensive.
  if (!world.authoritative) {
    const groups = new Map<import("@babylonjs/core").Material, Mesh[]>();
    for (const m of root.getChildMeshes() as Mesh[])
      if (m.material && !m.metadata?.seeking) {
        const list = groups.get(m.material) ?? [];
        list.push(m);
        groups.set(m.material, list);
      }
    for (const parts of groups.values())
      if (parts.length > 1) {
        const merged = Mesh.MergeMeshes(parts, true, true);
        if (merged) {
          merged.name = parts.some((p) => p.name.includes("luminous"))
            ? "pulse trap luminous rails"
            : "pulse trap casing assembly";
          merged.parent = root;
          merged.isPickable = false;
          world.shadows.addShadowCaster(merged);
        }
      }
  }
  return root;
}
export class PulseTraps {
  traps = new Map<number, PulseTrapState>();
  medkits = new Map<number, PlacedMedkit>();
  private medkitModels = new Map<number, TransformNode>();
  drops: PulseTrapDrop[];
  private models = new Map<number, TransformNode>();
  private dropModels: TransformNode[] = [];
  private carryModels = new Map<string, TransformNode>();
  private nextId = 1;
  onHit: (owner: string, target: Hittable, damage: number) => void = () => {};
  onDetonate: (trap: PulseTrapState) => void = () => {};
  onAvailable: (team: Team) => void = () => {};
  constructor(public world: World) {
    this.drops = office01.weaponEnds.map((p) => ({
      team: p.x < 0 ? "RED" : "BLUE",
      x: p.x,
      z: p.z + 2,
      cooldown: 0,
    }));
    if (!world.authoritative)
      this.dropModels = this.drops.map((d) => {
        const m = pulseTrapModel(world);
        m.position.set(d.x, 0.15, d.z);
        m.scaling.setAll(1.2);
        const sign = world.label(
          "PULSE TRAP · [3]",
          d.x,
          d.z + 1,
          "#ff83d5",
          3,
        );
        sign.parent = m;
        sign.position.x -= d.x;
        sign.position.z -= d.z;
        sign.position.y -= 0.15;
        return m;
      });
  }
  acquire(a: TrapActor) {
    if (a.connected === false || a.player.hp <= 0 || a.weapons.utilityCount > 0)
      return false;
    const d = this.drops.find(
      (d) =>
        d.cooldown <= 0 &&
        Math.hypot(
          a.player.root.position.x - d.x,
          a.player.root.position.z - d.z,
        ) < 2.2,
    );
    if (!d) return false;
    d.cooldown = PULSE_TRAP.respawn;
    a.weapons.carryingPulseTrap = true;
    a.weapons.switchSlot(3);
    return true;
  }
  private blocked(from: Vector3, to: Vector3, ignore: Mesh[] = []) {
    const delta = to.subtract(from),
      length = delta.length();
    if (length < 0.12) return false;
    return !!this.world.scene.pickWithRay(
      new Ray(from, delta.scale(1 / length), length - 0.08),
      (m) =>
        m.isEnabled() && !ignore.includes(m as Mesh) && !!m.metadata?.solid,
    )?.hit;
  }
  place(a: TrapActor) {
    if (
      a.weapons.utilityCount <= 0 ||
      !a.weapons.pulseTrapSelected ||
      a.player.hp <= 0 ||
      !a.player.grounded ||
      this.traps.size >= PULSE_TRAP.maxPlaced
    )
      return false;
    const p = a.player.root.position,
      yaw = a.player.root.rotation.y;
    const x = p.x + Math.sin(yaw) * 1.1,
      z = p.z + Math.cos(yaw) * 1.1;
    if (
      !office01.footprint.some(
        (r) =>
          Math.abs(x - r.x) < r.w / 2 - 0.4 &&
          Math.abs(z - r.z) < r.d / 2 - 0.4,
      )
    )
      return false;
    if (this.blocked(p.add(new Vector3(0, 0.45, 0)), new Vector3(x, 0.45, z)))
      return false;
    if (
      this.world.solids.some((m) => {
        if (!m.isEnabled()) return false;
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        return (
          x > b.minimumWorld.x - 0.35 &&
          x < b.maximumWorld.x + 0.35 &&
          z > b.minimumWorld.z - 0.35 &&
          z < b.maximumWorld.z + 0.35
        );
      })
    )
      return false;
    if (
      [...this.traps.values()].some((t) => Math.hypot(x - t.x, z - t.z) < 0.7)
    )
      return false;
    if (a.weapons.utilityKind === "superMedkit") {
      if (
        this.medkits.size >= 16 ||
        [...this.medkits.values()].some(
          (k) => Math.hypot(k.x - x, k.z - z) < 0.7,
        )
      )
        return false;
      const kit = { id: this.nextId++, x, z, yaw, arm: 0.5 };
      this.medkits.set(kit.id, kit);
      this.createMedkit(kit);
      a.weapons.utilityCount--;
      if (!a.weapons.utilityCount) a.weapons.pulseTrapSelected = false;
      return true;
    }
    const state = {
      id: this.nextId++,
      owner: a.id,
      team: a.team,
      x,
      z,
      yaw,
      arm: PULSE_TRAP.arm,
    };
    this.traps.set(state.id, state);
    this.createModel(state);
    a.weapons.utilityCount--;
    if (!a.weapons.utilityCount) a.weapons.pulseTrapSelected = false;
    return true;
  }
  private createMedkit(k: PlacedMedkit) {
    if (this.world.authoritative) return;
    const root = superMedkitModel(this.world);
    root.position.set(k.x, 0.06, k.z);
    root.rotation.y = k.yaw;
    this.medkitModels.set(k.id, root);
  }
  spawnTestTrap(team: Team) {
    const existing = [...this.traps.values()].find(
      (t) => t.owner === "test-corner",
    );
    if (existing) return existing;
    const x = team === "BLUE" ? 67 : -67;
    const trap: PulseTrapState = {
      id: this.nextId++,
      owner: "test-corner",
      team,
      x,
      z: -47,
      yaw: 0,
      arm: 0,
    };
    this.traps.set(trap.id, trap);
    this.createModel(trap);
    return trap;
  }
  private createModel(t: PulseTrapState) {
    if (this.world.authoritative) return;
    const root = pulseTrapModel(this.world);
    root.position.set(t.x, 0.06, t.z);
    root.rotation.y = t.yaw;
    const ring = MeshBuilder.CreateTorus(
      "pulse trap team indicator",
      { diameter: 1.35, thickness: 0.035, tessellation: 24 },
      this.world.scene,
    );
    ring.parent = root;
    ring.position.y = 0.015;
    ring.material = this.world.mat(TEAMS[t.team], true);
    ring.isPickable = false;
    this.models.set(t.id, root);
  }
  update(dt: number, actors: TrapActor[]) {
    for (const d of this.drops) {
      const before = d.cooldown;
      d.cooldown = Math.max(0, d.cooldown - dt);
      if (before > 0 && d.cooldown === 0) this.onAvailable(d.team);
    }
    for (const a of actors)
      if (a.player.hp <= 0 || a.connected === false) {
        a.weapons.utilityCount = 0;
        a.weapons.pulseTrapSelected = false;
      }
    for (const k of [...this.medkits.values()]) {
      k.arm = Math.max(0, k.arm - dt);
      if (k.arm > 0) continue;
      const actor = actors.find(
        (a) =>
          a.connected !== false &&
          a.player.hp > 0 &&
          a.player.hp < 100 &&
          Math.hypot(
            a.player.root.position.x - k.x,
            a.player.root.position.z - k.z,
          ) < 1.1 &&
          !this.blocked(
            new Vector3(k.x, 0.5, k.z),
            a.player.root.position.add(new Vector3(0, 0.7, 0)),
          ),
      );
      if (actor) {
        actor.player.hp = 100;
        this.medkits.delete(k.id);
        this.medkitModels.get(k.id)?.dispose();
        this.medkitModels.delete(k.id);
      }
    }
    for (const t of [...this.traps.values()]) {
      t.arm = Math.max(0, t.arm - dt);
      if (t.arm > 0) continue;
      const origin = new Vector3(t.x, 0.45, t.z);
      const detected = actors.filter(
        (a) =>
          a.team !== t.team &&
          a.connected !== false &&
          a.player.hp > 0 &&
          Math.hypot(
            a.player.root.position.x - t.x,
            a.player.root.position.z - t.z,
          ) < PULSE_TRAP.detectionRadius &&
          !this.blocked(
            origin,
            a.player.root.position.add(new Vector3(0, 0.7, 0)),
          ),
      );
      const nearest = Math.min(
        PULSE_TRAP.detectionRadius,
        ...detected.map((a) =>
          Math.hypot(
            a.player.root.position.x - t.x,
            a.player.root.position.z - t.z,
          ),
        ),
      );
      t.alert = detected.length
        ? 0.25 +
          0.75 *
            Math.min(
              1,
              (PULSE_TRAP.detectionRadius - nearest) /
                (PULSE_TRAP.detectionRadius - PULSE_TRAP.radius),
            )
        : 0;
      const seen = (a: TrapActor) =>
        detected.includes(a) &&
        Math.hypot(
          a.player.root.position.x - t.x,
          a.player.root.position.z - t.z,
        ) < PULSE_TRAP.radius;
      if (!detected.some(seen)) continue;
      // Resolve cover before dealing any damage. Only opposing players are affected.
      const victims = actors
        .filter((a) => a.team !== t.team && seen(a))
        .map((a) => ({
          a,
          distance: Math.hypot(
            a.player.root.position.x - t.x,
            a.player.root.position.z - t.z,
          ),
        }));
      this.traps.delete(t.id);
      this.models.get(t.id)?.dispose();
      this.models.delete(t.id);
      for (const { a, distance } of victims) {
        const damage =
          distance <= PULSE_TRAP.contact
            ? 50
            : Math.max(
                1,
                Math.round(
                  (50 * (PULSE_TRAP.radius - distance)) /
                    (PULSE_TRAP.radius - PULSE_TRAP.contact),
                ),
              );
        const victim = a.player.bodyMeshes.find((m) => m.metadata?.damageable)
          ?.metadata?.damageable as Hittable | undefined;
        const before = a.player.hp;
        if (victim) victim.damage(damage);
        else if (a.player.invulnerable <= 0)
          a.player.hp = Math.max(0, a.player.hp - damage);
        if (a.player.hp < before)
          this.onHit(
            t.owner,
            victim ?? {
              hp: a.player.hp,
              canDamageFrom: () => true,
              damage: () => {},
            },
            before - a.player.hp,
          );
      }
      this.onDetonate({ ...t });
    }
    this.render(actors);
  }
  render(actors: TrapActor[]) {
    if (this.world.authoritative) return;
    this.drops.forEach((d, i) =>
      this.dropModels[i]?.setEnabled(d.cooldown <= 0),
    );
    for (const [id, m] of this.carryModels)
      if (
        !actors.some(
          (a) =>
            a.id === id &&
            a.weapons.pulseTrapSelected &&
            a.weapons.utilityCount > 0 &&
            a.weapons.utilityKind === m.metadata?.carriedSkill &&
            a.player.hp > 0,
        )
      ) {
        m.dispose();
        this.carryModels.delete(id);
      }
    for (const a of actors) {
      const selected =
        a.weapons.pulseTrapSelected &&
        a.weapons.utilityCount > 0 &&
        a.player.hp > 0;
      if (selected) {
        a.player.gun.setEnabled(false);
        if (!this.carryModels.has(a.id)) {
          const m =
            a.weapons.utilityKind === "superMedkit"
              ? superMedkitModel(this.world)
              : a.weapons.utilityKind === "rcCar"
                ? rcCarModel(this.world).root
                : pulseTrapModel(this.world);
          m.metadata = { ...m.metadata, carriedSkill: a.weapons.utilityKind };
          m.parent = a.player.root;
          m.position.set(
            0,
            a.weapons.utilityKind === "rcCar" ? 0.98 : 1.25,
            0.55,
          );
          this.carryModels.set(a.id, m);
        }
      } else if (!a.weapons.carryingBeacon) a.player.gun.setEnabled(true);
    }
  }
  animate(phases: Map<number, number>) {
    for (const [id, root] of this.models) {
      const state = this.traps.get(id);
      animatePulseTrap(root, phases.get(id) ?? 0, (state?.arm ?? 1) <= 0);
    }
  }
  private syncedStates?: PulseTrapState[];
  private syncedDrops?: PulseTrapDrop[];
  private syncedKits?: PlacedMedkit[];
  sync(states: PulseTrapState[], drops: PulseTrapDrop[], actors: TrapActor[]) {
    if (states === this.syncedStates && drops === this.syncedDrops) {
      this.render(actors);
      return;
    }
    this.syncedStates = states;
    this.syncedDrops = drops;
    for (const [id, m] of this.models)
      if (!states.some((t) => t.id === id)) {
        m.dispose();
        this.models.delete(id);
      }
    this.traps = new Map(states.map((t) => [t.id, { ...t }]));
    for (const t of states) if (!this.models.has(t.id)) this.createModel(t);
    drops.forEach((d, i) => {
      if (this.drops[i]) this.drops[i].cooldown = d.cooldown;
    });
    this.render(actors);
  }
  syncMedkits(kits: PlacedMedkit[]) {
    if (kits === this.syncedKits) return;
    this.syncedKits = kits;
    for (const [id, m] of this.medkitModels)
      if (!kits.some((k) => k.id === id)) {
        m.dispose();
        this.medkitModels.delete(id);
      }
    this.medkits = new Map(kits.map((k) => [k.id, { ...k }]));
    for (const k of kits)
      if (!this.medkitModels.has(k.id)) this.createMedkit(k);
  }
  snapshot() {
    return [...this.traps.values()].map((t) => ({ ...t }));
  }
  reset() {
    this.syncedStates = undefined;
    this.syncedDrops = undefined;
    this.syncedKits = undefined;
    for (const m of [...this.models.values(), ...this.carryModels.values()])
      m.dispose();
    for (const m of this.medkitModels.values()) m.dispose();
    this.medkitModels.clear();
    this.medkits.clear();
    this.models.clear();
    this.carryModels.clear();
    this.traps.clear();
    this.drops.forEach((d) => (d.cooldown = 0));
    this.render([]);
  }
}

export function animatePulseTrap(
  root: TransformNode,
  phase: number,
  armed = true,
) {
  const pulse = armed ? pulseTrapPulse(phase) : 0;
  const parts = root.metadata?.seekingParts as
    | { mesh: Mesh; axis: "x" | "z"; rest: number; direction: number }[]
    | undefined;
  for (const part of parts ?? []) {
    part.mesh.position[part.axis] = part.rest + part.direction * pulse * 0.11;
    part.mesh.visibility = armed ? 0.25 + pulse * 0.75 : 0.18;
  }
}
