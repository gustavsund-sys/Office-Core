import { Destructible } from "../core/destructible";
import { BEACON_MOVEMENT_CLIPS } from "../audio/beaconClips";
import {
  MeshBuilder,
  Quaternion,
  Ray,
  TransformNode,
  Vector3,
  Mesh,
} from "@babylonjs/core";
import type { World } from "../map/builder";
import { office01 } from "../maps/office01";
import { TEAMS, type Team } from "../config/game";
import type { Player } from "../player/player";
import type { Hittable } from "../core/hittable";

export const BEACON = {
  range: 15,
  hp: 100,
  charge: 3,
  pursuitCharge: 1,
  memory: 4,
  damage: 25,
  respawn: 180,
};
export interface BeaconActor {
  pulseTrapSelected?: boolean;
  id: string;
  team: Team;
  player: Player;
  connected?: boolean;
}
export interface BeaconState {
  id: number;
  owner: string;
  team: Team;
  x: number;
  z: number;
  hp: number;
  yaw: number;
  charge: number;
  target?: string;
  moving?: boolean;
  motionId?: number;
  movementClip?: number;
  pitch?: number;
  motionElapsed?: number;
  firingInterval?: number;
}
export interface BeaconDrop {
  team: Team;
  x: number;
  z: number;
  cooldown: number;
}
export interface BeaconEvent {
  kind: "place" | "shot" | "available" | "damage" | "impact";
  material?: "player" | "metal" | "glass" | "wood";
  destroyed?: boolean;
  position: Vector3;
  team: Team;
  end?: Vector3;
  damage?: number;
  owner?: string;
}
interface Robot extends BeaconState {
  lastSeen?: number;
  lastKnown?: Vector3;
  pose?: {
    from: number;
    to: number;
    fromPitch: number;
    toPitch: number;
    elapsed: number;
    duration: number;
  };
  nextSearch?: number;
  visibleId?: string;
  scanHold: number;
  scanStep: number;
  root: TransformNode;
  head: TransformNode;
  bar: Mesh;
  chargeBar: Mesh;
  laser: Mesh;
  dot: Mesh;
  targetable: Hittable;
}

export function beaconModel(world: World, team: Team) {
  const root = new TransformNode("defensive beacon", world.scene);
  const head = new TransformNode("tracking turret", world.scene);
  head.parent = root;
  head.setPivotPoint(new Vector3(0, 1, 0));
  if (world.authoritative) {
    const base = MeshBuilder.CreateBox(
      "beacon base collider",
      { width: 1.2, height: 0.8, depth: 1.2 },
      world.scene,
    );
    base.parent = root;
    base.position.y = 0.4;
    const turret = MeshBuilder.CreateBox(
      "beacon turret collider",
      { width: 0.55, height: 0.45, depth: 1.3 },
      world.scene,
    );
    turret.parent = head;
    turret.position.set(0, 1, 0.3);
    return { root, head };
  }
  const steel = "#9caeb5",
    dark = "#26343e",
    armor = "#657b88";
  const finish = (
    mesh: Mesh,
    parent: TransformNode,
    color: string,
    glow = false,
  ) => {
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.material = glow
      ? world.mat(color, true)
      : world.finish(color, "metal");
    return mesh;
  };
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    parent = root,
    glow = false,
  ) => {
    const m = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      world.scene,
    );
    m.position.set(x, y, z);
    return finish(m, parent, color, glow);
  };
  const rod = (
    name: string,
    a: Vector3,
    b: Vector3,
    diameter: number,
    color: string,
    parent = root,
  ) => {
    const delta = b.subtract(a),
      m = MeshBuilder.CreateCylinder(
        name,
        { height: delta.length(), diameter, tessellation: 8 },
        world.scene,
      );
    m.position.copyFrom(a.add(b).scale(0.5));
    const dir = delta.normalize();
    m.rotationQuaternion = Quaternion.FromLookDirectionLH(
      dir,
      Math.abs(dir.y) > 0.99 ? Vector3.Forward() : Vector3.Up(),
    ).multiply(Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2));
    return finish(m, parent, color);
  };
  const point = (angle: number, r: number, y: number) =>
    new Vector3(Math.sin(angle) * r, y, Math.cos(angle) * r);
  // Three splayed articulated legs leave a recognisable robot silhouette from above.
  for (let leg = 0; leg < 3; leg++) {
    const angle = (leg * Math.PI * 2) / 3 + Math.PI;
    const hip = point(angle, 0.19, 0.57),
      knee = point(angle, 0.53, 0.32),
      foot = point(angle, 0.83, 0.1);
    rod(
      "hip axle",
      hip.add(new Vector3(-0.09, 0, 0)),
      hip.add(new Vector3(0.09, 0, 0)),
      0.18,
      steel,
    );
    rod("upper leg armor", hip, knee, 0.19, armor);
    rod("lower leg frame", knee, foot, 0.14, dark);
    const offset = new Vector3(
      Math.cos(angle) * 0.085,
      0,
      -Math.sin(angle) * 0.085,
    );
    rod(
      "hydraulic cylinder",
      hip.add(offset),
      Vector3.Lerp(hip, foot, 0.63).add(offset),
      0.085,
      dark,
    );
    rod(
      "polished piston",
      Vector3.Lerp(hip, foot, 0.5).add(offset),
      foot.add(offset),
      0.038,
      steel,
    );
    const pad = box(
      "gripping foot",
      foot.x,
      0.09,
      foot.z,
      0.32,
      0.16,
      0.35,
      dark,
    );
    pad.rotation.y = angle;
    const cap = box(
      "foot armor",
      foot.x,
      0.18,
      foot.z,
      0.27,
      0.055,
      0.27,
      steel,
    );
    cap.rotation.y = angle;
    for (const side of [-1, 1]) {
      const p = foot.add(offset.scale(side * 1.25));
      box("foot bolt", p.x, 0.217, p.z, 0.045, 0.026, 0.045, dark);
    }
    const brace = box(
      "knee plate",
      knee.x,
      knee.y,
      knee.z,
      0.23,
      0.11,
      0.22,
      steel,
    );
    brace.rotation.y = angle;
  }
  box("central power housing", 0, 0.54, 0, 0.43, 0.4, 0.4, dark);
  box("team power band", 0, 0.69, 0, 0.47, 0.08, 0.44, TEAMS[team]);
  rod(
    "turntable bearing",
    new Vector3(0, 0.73, 0),
    new Vector3(0, 0.87, 0),
    0.43,
    steel,
  );
  rod(
    "turntable inset",
    new Vector3(0, 0.77, 0),
    new Vector3(0, 0.82, 0),
    0.46,
    dark,
  );
  box("elevation yoke", 0, 0.94, -0.06, 0.28, 0.24, 0.27, armor);
  rod(
    "elevation axle",
    new Vector3(-0.28, 1, 0),
    new Vector3(0.28, 1, 0),
    0.2,
    steel,
    head,
  );
  box("turret receiver", 0, 1, -0.16, 0.43, 0.34, 0.7, armor, head);
  box("top armor", 0, 1.2, -0.21, 0.48, 0.1, 0.6, steel, head);
  box(
    "team identification",
    0,
    1.256,
    -0.23,
    0.3,
    0.017,
    0.35,
    TEAMS[team],
    head,
  );
  box("rear power cell", 0, 1, -0.58, 0.34, 0.26, 0.18, dark, head);
  for (const x of [-0.25, 0.25]) {
    box("side servo", x, 1, -0.2, 0.12, 0.23, 0.31, dark, head);
    rod(
      "servo hub",
      new Vector3(x - 0.035, 1, -0.2),
      new Vector3(x + 0.035, 1, -0.2),
      0.17,
      steel,
      head,
    );
    for (let i = 0; i < 4; i++)
      box(
        "receiver vent",
        x,
        1.1,
        -0.4 + i * 0.1,
        0.018,
        0.08,
        0.045,
        steel,
        head,
      );
  }
  // Long open rail cage, cooling ribs and an inset glowing muzzle.
  rod(
    "laser core",
    new Vector3(0, 1, 0.15),
    new Vector3(0, 1, 0.86),
    0.095,
    dark,
    head,
  );
  for (const x of [-0.12, 0.12])
    for (const y of [0.89, 1.11])
      box("barrel rail", x, y, 0.54, 0.045, 0.045, 0.76, steel, head);
  for (let i = 0; i < 6; i++) {
    const z = 0.24 + i * 0.115;
    box("cooling rib", 0, 1.12, z, 0.32, 0.055, 0.035, armor, head);
    box("lower cooling rib", 0, 0.88, z, 0.32, 0.055, 0.035, armor, head);
    box("left barrel brace", -0.15, 1, z, 0.04, 0.2, 0.035, dark, head);
    box("right barrel brace", 0.15, 1, z, 0.04, 0.2, 0.035, dark, head);
  }
  box("muzzle shroud", 0, 1, 0.885, 0.34, 0.29, 0.09, armor, head);
  box("muzzle recess", 0, 1, 0.934, 0.19, 0.16, 0.013, dark, head);
  box("laser aperture", 0, 1, 0.943, 0.07, 0.07, 0.012, "#ff334b", head, true);
  box("optical sensor", -0.29, 1.16, 0.03, 0.13, 0.15, 0.25, dark, head);
  box(
    "red tracking optic",
    -0.29,
    1.16,
    0.161,
    0.075,
    0.075,
    0.018,
    "#ff334b",
    head,
    true,
  );
  rod(
    "cable conduit",
    new Vector3(0.24, 0.94, -0.45),
    new Vector3(0.24, 1.15, -0.04),
    0.035,
    dark,
    head,
  );
  // Merge by material and moving assembly to keep the added detail cheap to render.
  for (const parent of [root, head]) {
    const groups = new Map<unknown, Mesh[]>();
    for (const mesh of parent.getChildMeshes(true) as Mesh[]) {
      const group = groups.get(mesh.material) ?? [];
      group.push(mesh);
      groups.set(mesh.material, group);
    }
    for (const group of groups.values()) {
      const merged = Mesh.MergeMeshes(
        group,
        true,
        true,
        undefined,
        false,
        false,
      );
      if (merged) {
        merged.name =
          parent === head ? "beacon turret assembly" : "beacon tripod assembly";
        merged.parent = parent;
        merged.isPickable = false;
      }
    }
  }
  return { root, head };
}

export class Beacons {
  robots = new Map<number, Robot>();
  drops: BeaconDrop[];
  carried = new Set<string>();
  private dropModels: TransformNode[];
  private carryModels = new Map<string, TransformNode>();
  private nextId = 1;
  time = 0;
  onEvent: (event: BeaconEvent) => void = () => {};
  onHit: (owner: string, target: Hittable, damage: number) => void = () => {};
  constructor(public world: World) {
    this.drops = office01.weaponEnds.map((p) => ({
      team: p.x < 0 ? "RED" : "BLUE",
      x: p.x,
      z: p.z - 2,
      cooldown: 0,
    }));
    this.dropModels = this.drops.map((d) => {
      const model = beaconModel(world, d.team).root;
      model.position.set(d.x, 0.15, d.z);
      model.scaling.setAll(0.75);
      const label = world.label(
        `${d.team} · DEFENSIVE BEACON`,
        d.x,
        d.z - 1.5,
        TEAMS[d.team],
        3.5,
      );
      label.parent = model;
      label.position.x -= d.x;
      label.position.z -= d.z;
      label.position.y -= 0.15;
      return model;
    });
  }
  reset() {
    this.syncedStates = undefined;
    this.syncedDrops = undefined;
    this.syncedCarriers = "";
    for (const r of this.robots.values()) r.root.dispose();
    this.robots.clear();
    this.carried.clear();
    for (const m of this.carryModels.values()) m.dispose();
    this.carryModels.clear();
    for (const d of this.drops) d.cooldown = 0;
    this.render([], 0);
  }
  acquire(actor: BeaconActor) {
    if (actor.player.hp <= 0 || this.carried.has(actor.id)) return false;
    const d = this.drops.find(
      (d) =>
        d.cooldown <= 0 &&
        Math.hypot(
          actor.player.root.position.x - d.x,
          actor.player.root.position.z - d.z,
        ) < 1.6,
    );
    if (!d) return false;
    d.cooldown = BEACON.respawn;
    this.carried.add(actor.id);
    return true;
  }
  place(actor: BeaconActor) {
    if (
      !this.carried.has(actor.id) ||
      actor.player.hp <= 0 ||
      !actor.player.grounded
    )
      return false;
    const p = actor.player.root.position,
      yaw = actor.player.root.rotation.y;
    const x = p.x + Math.sin(yaw) * 1.8,
      z = p.z + Math.cos(yaw) * 1.8;
    if (
      !office01.footprint.some(
        (r) =>
          Math.abs(x - r.x) < r.w / 2 - 0.7 &&
          Math.abs(z - r.z) < r.d / 2 - 0.7,
      )
    )
      return false;
    const start = p.add(new Vector3(0, 0.6, 0)),
      end = new Vector3(x, 0.6, z),
      delta = end.subtract(start);
    const hit = this.world.scene.pickWithRay(
      new Ray(start, delta.normalize(), 1.8),
      (m) =>
        m.isEnabled() &&
        (!!m.metadata?.solid ||
          (!!m.metadata?.damageable &&
            !actor.player.bodyMeshes.includes(m as Mesh))),
    );
    if (hit?.hit) return false;
    const blocked = this.world.solids.some((m) => {
      if (!m.isEnabled()) return false;
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      return (
        x > b.minimumWorld.x - 0.6 &&
        x < b.maximumWorld.x + 0.6 &&
        z > b.minimumWorld.z - 0.6 &&
        z < b.maximumWorld.z + 0.6
      );
    });
    if (
      blocked ||
      [...this.robots.values()].some((r) => Math.hypot(r.x - x, r.z - z) < 1.4)
    )
      return false;
    this.carried.delete(actor.id);
    this.create({
      id: this.nextId++,
      owner: actor.id,
      team: actor.team,
      x,
      z,
      hp: 100,
      yaw,
      charge: 0,
    });
    this.onEvent({
      kind: "place",
      position: new Vector3(x, 1, z),
      team: actor.team,
      owner: actor.id,
    });
    return true;
  }
  private create(state: BeaconState) {
    const { root, head } = beaconModel(this.world, state.team);
    root.position.set(state.x, 0, state.z);
    const bar = this.world.box("beacon HP", 0, 2, 0, 1.1, 0.1, 0.12, "#59eea1");
    bar.parent = root;
    const chargeBar = this.world.box(
      "beacon charge",
      0,
      1.83,
      0,
      1.1,
      0.05,
      0.1,
      "#ffcc66",
    );
    chargeBar.parent = root;
    const laser = MeshBuilder.CreateCylinder(
      "beacon targeting laser",
      { height: 1, diameter: 0.018, tessellation: 4 },
      this.world.scene,
    );
    laser.material = this.world.mat("#ff334b", true);
    laser.parent = root;
    laser.isPickable = false;
    const dot = MeshBuilder.CreateSphere(
      "beacon red dot",
      { diameter: 0.11, segments: 4 },
      this.world.scene,
    );
    dot.material = laser.material;
    dot.parent = root;
    dot.isPickable = false;
    const robot = {
      ...state,
      root,
      head,
      bar,
      chargeBar,
      laser,
      dot,
      scanHold: 0,
      scanStep: 0,
    } as Robot;
    robot.targetable = {
      get hp() {
        return robot.hp;
      },
      kind: "beacon",
      team: state.team,
      canDamageFrom: () => true,
      damage: (amount) => {
        const damage = Math.min(robot.hp, Math.max(0, amount));
        robot.hp -= damage;
        if (damage > 0)
          this.onEvent({
            kind: "damage",
            position: new Vector3(robot.x, 2, robot.z),
            team: robot.team,
            damage,
          });
        if (robot.hp <= 0) {
          this.world.explosions.burst(
            new Vector3(robot.x, 0.7, robot.z),
            "#8aabb8",
            1.2,
            "bazookaExplosion",
          );
          robot.root.dispose();
          this.robots.delete(robot.id);
        }
      },
    };
    for (const m of head.getChildMeshes()) {
      m.isPickable = true;
      m.metadata = { damageable: robot.targetable };
    }
    for (const m of root.getChildMeshes())
      if (![bar, chargeBar, laser, dot].includes(m as Mesh)) {
        m.isPickable = true;
        m.metadata = { damageable: robot.targetable };
      }
    for (const m of [bar, chargeBar]) m.isPickable = false;
    this.robots.set(state.id, robot);
    return robot;
  }
  visible(robot: BeaconState, actor: BeaconActor) {
    const start = new Vector3(robot.x, 1, robot.z),
      end = actor.player.root.position.add(new Vector3(0, 1, 0)),
      delta = end.subtract(start);
    const distance = delta.length();
    const hit = this.world.scene.pickWithRay(
      new Ray(start, delta.normalize(), distance),
      (m) =>
        m.isEnabled() &&
        m.metadata?.damageable !== this.robots.get(robot.id)?.targetable &&
        (!!m.metadata?.solid || !!m.metadata?.damageable),
    );
    return (
      !hit?.hit || actor.player.bodyMeshes.includes(hit.pickedMesh as Mesh)
    );
  }
  update(dt: number, actors: BeaconActor[]) {
    this.time += dt;
    for (const d of this.drops) {
      const previous = d.cooldown;
      d.cooldown = Math.max(0, d.cooldown - dt);
      if (previous > 0 && d.cooldown === 0)
        this.onEvent({
          kind: "available",
          position: new Vector3(d.x, 0, d.z),
          team: d.team,
        });
    }
    for (const id of this.carried)
      if (
        !actors.some(
          (a) => a.id === id && a.player.hp > 0 && a.connected !== false,
        )
      )
        this.carried.delete(id);
    for (const a of actors)
      for (const m of a.player.bodyMeshes) m.computeWorldMatrix(true);
    for (const r of this.robots.values()) {
      if (this.time >= (r.nextSearch ?? 0)) {
        const candidates = actors.filter(
          (a) =>
            a.team !== r.team &&
            a.player.hp > 0 &&
            a.connected !== false &&
            Math.hypot(
              a.player.root.position.x - r.x,
              a.player.root.position.z - r.z,
            ) <= BEACON.range,
        );
        candidates.sort(
          (a, b) =>
            Math.hypot(
              a.player.root.position.x - r.x,
              a.player.root.position.z - r.z,
            ) -
            Math.hypot(
              b.player.root.position.x - r.x,
              b.player.root.position.z - r.z,
            ),
        );
        r.visibleId = candidates.find((a) => this.visible(r, a))?.id;
        r.nextSearch =
          (Math.floor((this.time - (r.id % 3) / 30) / 0.1) + 1) * 0.1 +
          (r.id % 3) / 30;
      }
      const visibleTarget = actors.find(
        (a) =>
          a.id === r.visibleId &&
          a.player.hp > 0 &&
          a.connected !== false &&
          Math.hypot(
            a.player.root.position.x - r.x,
            a.player.root.position.z - r.z,
          ) <= BEACON.range,
      );
      const remembered = actors.find(
        (a) =>
          a.id === r.target &&
          a.team !== r.team &&
          a.player.hp > 0 &&
          a.connected !== false &&
          Math.hypot(
            a.player.root.position.x - r.x,
            a.player.root.position.z - r.z,
          ) <= BEACON.range,
      );
      const target =
        visibleTarget ??
        (r.lastSeen !== undefined && this.time - r.lastSeen <= BEACON.memory
          ? remembered
          : undefined);
      if (visibleTarget) {
        r.lastSeen = this.time;
        r.lastKnown = visibleTarget.player.root.position.clone();
      }
      if (!target) {
        r.target = undefined;
        r.charge = 0;
        r.scanHold -= dt;
        if (!r.pose && r.scanHold <= 0) {
          const poses = [1.2, -0.7, 2.4, 0.3, -2.1, -0.25];
          const to = poses[(r.scanStep++ + r.id) % poses.length];
          this.beginMotion(r, to, ((r.scanStep % 3) - 1) * 0.12);
        }
        this.advanceMotion(r, dt);
        continue;
      }
      if (r.target !== target.id) {
        r.charge = 0;
        r.pose = undefined;
      }
      r.target = target.id;
      const aim = visibleTarget ? target.player.root.position : r.lastKnown!;
      const desired = Math.atan2(aim.x - r.x, aim.z - r.z);
      if (
        !r.pose &&
        (Math.abs(this.angle(desired - r.yaw)) > 0.04 ||
          Math.abs(r.pitch ?? 0) > 0.015)
      )
        this.beginMotion(r, desired, 0);
      this.advanceMotion(r, dt);
      if (!visibleTarget) {
        r.charge = 0;
        continue;
      }
      r.charge += dt;
      r.firingInterval =
        Math.abs(this.angle(desired - r.yaw)) > 0.05
          ? BEACON.pursuitCharge
          : BEACON.charge;
      if (r.charge + 1e-7 >= r.firingInterval) {
        r.charge = 0;
        if (this.visible(r, visibleTarget)) this.fire(r, actors);
      }
    }
    this.render(actors, dt);
  }
  private fire(r: Robot, actors: BeaconActor[]) {
    r.head.rotation.set(r.pitch ?? 0, r.yaw, 0);
    r.head.computeWorldMatrix(true);
    const matrix = r.head.getWorldMatrix();
    const origin = Vector3.TransformCoordinates(new Vector3(0, 1, 0), matrix);
    const direction = Vector3.TransformNormal(
      new Vector3(0, 0, 1),
      matrix,
    ).normalize();
    const hit = this.world.scene.pickWithRay(
      new Ray(origin, direction, BEACON.range),
      (m) =>
        m.isEnabled() &&
        m.metadata?.damageable !== r.targetable &&
        (!!m.metadata?.solid || !!m.metadata?.damageable),
    );
    const end =
      hit?.hit && hit.pickedPoint
        ? hit.pickedPoint.clone()
        : origin.add(direction.scale(BEACON.range));
    // Cast from the pivot so a muzzle close to cover cannot shoot through it.
    const muzzle = origin.add(
      direction.scale(Math.min(0.94, hit?.hit ? hit.distance : 0.94)),
    );
    const victim = hit?.pickedMesh?.metadata?.damageable as
      Hittable | undefined;
    const actor = actors.find((a) =>
      a.player.bodyMeshes.some((m) => m.metadata?.damageable === victim),
    );
    if (
      victim &&
      (actor ? actor.team !== r.team : victim.team !== r.team) &&
      victim.canDamageFrom(r)
    ) {
      const before = victim.hp;
      victim.damage(BEACON.damage);
      if (victim.hp < before) this.onHit(r.owner, victim, before - victim.hp);
    }
    this.onEvent({
      kind: "shot",
      position: muzzle,
      end,
      team: r.team,
      owner: r.owner,
    });
    if (hit?.hit) {
      let normal = hit.getNormal(true) ?? direction.scale(-1);
      if (Vector3.Dot(normal, direction) > 0) normal = normal.scale(-1);
      const impact = end.add(normal.scale(0.12));
      const reflected = direction
        .subtract(normal.scale(2 * Vector3.Dot(direction, normal)))
        .normalize();
      this.onEvent({
        kind: "impact",
        position: impact,
        end: actor ? undefined : impact.add(reflected.scale(2)),
        team: r.team,
        owner: r.owner,
        material: actor
          ? "player"
          : victim instanceof Destructible
            ? victim.prop.kind === "glass"
              ? "glass"
              : ["server", "coreDoor", "vending"].includes(victim.prop.kind)
                ? "metal"
                : "wood"
            : "metal",
        destroyed: !!victim && victim.hp <= 0,
      });
    }
  }
  private angle(value: number) {
    return Math.atan2(Math.sin(value), Math.cos(value));
  }
  private beginMotion(r: Robot, yaw: number, pitch: number) {
    r.motionId = (r.motionId ?? 0) + 1;
    r.movementClip = (r.motionId * 7 + r.id * 3) % BEACON_MOVEMENT_CLIPS.length;
    r.pose = {
      from: r.yaw,
      to: r.yaw + this.angle(yaw - r.yaw),
      fromPitch: r.pitch ?? 0,
      toPitch: pitch,
      elapsed: 0,
      duration: BEACON_MOVEMENT_CLIPS[r.movementClip].duration,
    };
    r.moving = true;
    r.motionElapsed = 0;
  }
  private advanceMotion(r: Robot, dt: number) {
    if (!r.pose) {
      r.moving = false;
      return;
    }
    const p = r.pose;
    p.elapsed = Math.min(p.duration, p.elapsed + dt);
    r.motionElapsed = p.elapsed;
    const t = p.elapsed / p.duration,
      eased = t * t * (3 - 2 * t);
    r.yaw = p.from + (p.to - p.from) * eased;
    r.pitch = p.fromPitch + (p.toPitch - p.fromPitch) * eased;
    if (t >= 1) {
      r.pose = undefined;
      r.moving = false;
      r.scanHold = 0.6 + (r.scanStep % 4) * 0.3;
    }
  }
  spawnTestGuard(actor: BeaconActor) {
    const p = actor.player.root.position;
    for (const [dx, dz] of [
      [0, 2.5],
      [2.5, 0],
      [-2.5, 0],
      [0, -2.5],
    ]) {
      const x = p.x + dx,
        z = p.z + dz;
      if (
        !office01.footprint.some(
          (r) =>
            Math.abs(x - r.x) < r.w / 2 - 0.7 &&
            Math.abs(z - r.z) < r.d / 2 - 0.7,
        )
      )
        continue;
      const blocked = this.world.solids.some((m) => {
        if (!m.isEnabled()) return false;
        m.computeWorldMatrix(true);
        const b = m.getBoundingInfo().boundingBox;
        return (
          x > b.minimumWorld.x - 0.6 &&
          x < b.maximumWorld.x + 0.6 &&
          z > b.minimumWorld.z - 0.6 &&
          z < b.maximumWorld.z + 0.6
        );
      });
      if (!blocked) {
        return this.create({
          id: this.nextId++,
          owner: actor.id,
          team: actor.team,
          x,
          z,
          hp: 100,
          yaw: Math.PI,
          charge: 0,
        });
      }
    }
  }
  render(actors: BeaconActor[], dt: number) {
    if (this.world.authoritative) {
      for (const r of this.robots.values()) {
        r.head.rotation.set(r.pitch ?? 0, r.yaw, 0);
        r.head.computeWorldMatrix(true);
      }
      return;
    }
    this.drops.forEach((d, i) =>
      this.dropModels[i].setEnabled(d.cooldown <= 0),
    );
    for (const [id, m] of this.carryModels)
      if (
        !this.carried.has(id) ||
        !actors.some((a) => a.id === id && !a.pulseTrapSelected)
      ) {
        m.dispose();
        this.carryModels.delete(id);
      }
    for (const a of actors) {
      const carrying = this.carried.has(a.id) && !a.pulseTrapSelected;
      a.player.gun.setEnabled(!carrying);
      if (carrying && !this.carryModels.has(a.id)) {
        const m = beaconModel(this.world, a.team).root;
        m.parent = a.player.root;
        m.position.set(0, 1.4, 0.45);
        m.scaling.setAll(0.6);
        this.carryModels.set(a.id, m);
      }
    }
    for (const r of this.robots.values()) {
      r.head.rotation.y = r.yaw;
      r.head.rotation.x = r.pitch ?? 0;
      r.bar.scaling.x = Math.max(0.001, r.hp / 100);
      r.chargeBar.scaling.x = Math.max(
        0.001,
        r.charge / (r.firingInterval ?? BEACON.charge),
      );
      r.head.computeWorldMatrix(true);
      const matrix = r.head.getWorldMatrix();
      const start = Vector3.TransformCoordinates(new Vector3(0, 1, 0), matrix),
        dir = Vector3.TransformNormal(new Vector3(0, 0, 1), matrix).normalize();
      const hit = this.world.scene.pickWithRay(
        new Ray(start, dir, 15),
        (m) =>
          m.isEnabled() &&
          m.metadata?.damageable !== r.targetable &&
          (!!m.metadata?.solid || !!m.metadata?.damageable),
      );
      const length = hit?.hit ? hit.distance : 15;
      r.laser.scaling.y = length;
      const localStart = start.subtract(r.root.position);
      r.laser.position.copyFrom(localStart.add(dir.scale(length / 2)));
      r.laser.rotationQuaternion = Quaternion.RotationAxis(
        Vector3.Cross(Vector3.Up(), dir).normalize(),
        Math.acos(Math.max(-1, Math.min(1, dir.y))),
      );
      r.dot.position.copyFrom(localStart.add(dir.scale(length)));
    }
  }
  private syncedStates?: BeaconState[];
  private syncedDrops?: BeaconDrop[];
  private syncedCarriers = "";
  sync(
    states: BeaconState[],
    drops: BeaconDrop[],
    carriers: string[],
    actors: BeaconActor[],
    dt: number,
  ) {
    const key = carriers.join("|");
    if (
      states === this.syncedStates &&
      drops === this.syncedDrops &&
      key === this.syncedCarriers
    ) {
      this.render(actors, dt);
      return;
    }
    this.syncedStates = states;
    this.syncedDrops = drops;
    this.syncedCarriers = key;
    for (const [id, r] of this.robots)
      if (!states.some((s) => s.id === id)) {
        r.root.dispose();
        this.robots.delete(id);
      }
    for (const s of states) {
      const r = this.robots.get(s.id) ?? this.create(s);
      Object.assign(r, s);
    }
    this.drops.forEach((d, i) => {
      if (drops[i]) d.cooldown = drops[i].cooldown;
    });
    this.carried = new Set(carriers);
    this.render(actors, dt);
  }
  snapshot() {
    return [...this.robots.values()].map(
      ({
        id,
        owner,
        team,
        x,
        z,
        hp,
        yaw,
        charge,
        target,
        moving,
        motionId,
        movementClip,
        pitch,
        motionElapsed,
        firingInterval,
      }) => ({
        id,
        owner,
        team,
        x,
        z,
        hp,
        yaw,
        charge,
        target,
        moving,
        motionId,
        movementClip,
        pitch,
        motionElapsed,
        firingInterval,
      }),
    );
  }
}
