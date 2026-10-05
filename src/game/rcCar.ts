import { MeshBuilder, Vector3, Ray, TransformNode } from "@babylonjs/core";
import type { World } from "../map/builder";
import type { Player } from "../player/player";
import type { Weapons } from "../weapons/system";
import type { Team } from "../config/game";
import type { Hittable } from "../core/hittable";
import { Destructible } from "../core/destructible";
import { move, blocked } from "./collision";
import { rcCarModel } from "./rcCarModel";
export const RC = {
  speed: 6.6,
  reverse: 3.6,
  acceleration: 8,
  turn: 2.8,
  radius: 0.55,
  hp: 50,
  blastRadius: 4,
  damage: 120,
  watch: 3,
};
export interface RCCommand {
  throttle: number;
  yaw: number;
  detonate: boolean;
}
export interface RCCarState {
  id: number;
  owner: string;
  team: Team;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  steer: number;
  hp: number;
}
export interface RCActor {
  id: string;
  team: Team;
  player: Player;
  weapons: Weapons;
  connected?: boolean;
}
interface Car extends RCCarState {
  age: number;
  throttle: number;
  aim: number;
  collider: ReturnType<typeof MeshBuilder.CreateBox>;
  lastCommand: number;
}
export class RCCars {
  cars = new Map<string, Car>();
  watches = new Map<string, { x: number; z: number; remaining: number }>();
  nextId = 1;
  time = 0;
  onHit: (owner: string, target: Hittable, damage: number) => void = () => {};
  onExplode: (car: RCCarState) => void = () => {};
  constructor(public world: World) {}
  controlling(owner: string) {
    return this.cars.has(owner) || this.watches.has(owner);
  }
  command(actor: RCActor, input: RCCommand | undefined, deploy: boolean) {
    if (actor.player.hp <= 0 || actor.connected === false) return;
    const car = this.cars.get(actor.id);
    if (car) {
      if (input?.detonate) {
        this.detonate(actor.id);
        return;
      }
      car.throttle = input?.throttle ?? 0;
      car.aim = input?.yaw ?? car.yaw;
      car.lastCommand = this.time;
      return;
    }
    if (
      this.watches.has(actor.id) ||
      !deploy ||
      actor.weapons.utilityKind !== "rcCar" ||
      actor.weapons.utilityCount <= 0 ||
      !actor.player.grounded
    )
      return;
    const yaw = actor.player.root.rotation.y,
      p = actor.player.root.position;
    const x = p.x + Math.sin(yaw) * 0.95,
      z = p.z + Math.cos(yaw) * 0.95;
    if (blocked(x, z, RC.radius, this.world.obstacles)) return;
    const collider = MeshBuilder.CreateBox(
      "RC authoritative hitbox",
      { width: 1.21, height: 0.605, depth: 1.012 },
      this.world.scene,
    );
    collider.position.set(x, 0.3, z);
    collider.rotation.y = yaw;
    collider.visibility = 0;
    collider.isPickable = true;
    const state: Car = {
      id: this.nextId++,
      owner: actor.id,
      team: actor.team,
      x,
      z,
      yaw,
      speed: 0,
      steer: 0,
      hp: RC.hp,
      age: 0,
      throttle: 0,
      aim: yaw,
      collider,
      lastCommand: this.time,
    };
    const target: Hittable & { position: Vector3 } = {
      get hp() {
        return state.hp;
      },
      get position() {
        return new Vector3(state.x, 0.3, state.z);
      },
      kind: "rcCar",
      team: actor.team,
      canDamageFrom: () => true,
      damage: (amount) => {
        state.hp = Math.max(0, state.hp - amount);
      },
    };
    collider.metadata = { damageable: target };
    collider.computeWorldMatrix(true);
    this.cars.set(actor.id, state);
    actor.weapons.utilityCount--;
    actor.weapons.pulseTrapSelected = false;
    actor.weapons.remoteControlled = true;
  }
  update(dt: number, actors: RCActor[]) {
    this.time += dt;
    for (const [owner, w] of this.watches) {
      w.remaining -= dt;
      if (
        w.remaining <= 0 ||
        !actors.some(
          (a) => a.id === owner && a.player.hp > 0 && a.connected !== false,
        )
      ) {
        this.watches.delete(owner);
        this.restore(actors.find((a) => a.id === owner));
      }
    }
    for (const [owner, c] of [...this.cars]) {
      const actor = actors.find((a) => a.id === owner);
      if (actor && actor.player.hp <= 0 && actor.connected !== false) {
        this.detonate(owner);
        this.watches.delete(owner);
        this.restore(actor);
        continue;
      }
      if (!actor || actor.connected === false) {
        this.remove(owner);
        this.restore(actor);
        continue;
      }
      if (c.hp <= 0) {
        this.detonate(owner);
        continue;
      }
      c.age += dt;
      if (this.time - c.lastCommand > 0.3) c.throttle = 0;
      const angle = Math.atan2(
        Math.sin(c.aim - c.yaw),
        Math.cos(c.aim - c.yaw),
      );
      const change = Math.max(
        -RC.turn * dt,
        Math.min(RC.turn * dt, angle * 3 * dt),
      );
      c.yaw += change;
      c.steer = change / Math.max(0.001, dt);
      const desired = c.throttle * (c.throttle < 0 ? RC.reverse : RC.speed);
      c.speed += Math.max(
        -RC.acceleration * dt,
        Math.min(RC.acceleration * dt, desired - c.speed),
      );
      const before = { x: c.x, z: c.z };
      move(
        c,
        Math.sin(c.yaw) * c.speed * dt,
        Math.cos(c.yaw) * c.speed * dt,
        RC.radius,
        this.world.obstacles,
      );
      if (
        Math.hypot(c.x - before.x, c.z - before.z) <
        Math.abs(c.speed * dt) * 0.25
      )
        c.speed *= 0.25;
      c.collider.position.set(c.x, 0.3, c.z);
      c.collider.rotation.y = c.yaw;
      c.collider.computeWorldMatrix(true);
    }
  }
  private restore(actor?: RCActor) {
    if (!actor) return;
    actor.weapons.remoteControlled = false;
    actor.weapons.pulseTrapSelected = false;
    actor.weapons.switchSlot(2);
  }
  remove(owner: string) {
    this.cars.get(owner)?.collider.dispose();
    this.cars.delete(owner);
  }
  detonate(owner: string) {
    const car = this.cars.get(owner);
    if (!car) return;
    this.remove(owner);
    this.watches.set(owner, { x: car.x, z: car.z, remaining: RC.watch });
    const origin = new Vector3(car.x, 0.45, car.z),
      victims = new Map<Hittable, Vector3>();
    for (const mesh of this.world.scene.meshes) {
      const v = mesh.metadata?.damageable as Hittable | undefined;
      if (v && v.hp > 0 && mesh.isEnabled() && !victims.has(v))
        victims.set(
          v,
          (v as Hittable & { position?: Vector3 }).position ??
            mesh.getAbsolutePosition(),
        );
    }
    const hits: { v: Hittable; damage: number }[] = [];
    for (const [v, p] of victims) {
      const distance = Math.hypot(origin.x - p.x, origin.z - p.z);
      if (distance >= RC.blastRadius || !v.canDamageFrom(origin)) continue;
      if (
        v.kind === "core" &&
        (v as Hittable & { active?: boolean }).active === false
      )
        continue;
      const target = p.clone();
      target.y = Math.max(0.5, target.y);
      const delta = target.subtract(origin),
        len = delta.length();
      if (
        len > 0.15 &&
        this.world.scene.pickWithRay(
          new Ray(
            origin.add(delta.normalizeToNew().scale(0.08)),
            delta.normalizeToNew(),
            len - 0.12,
          ),
          (m) =>
            m.isEnabled() &&
            m.metadata?.damageable !== v &&
            (!!m.metadata?.solid ||
              m.metadata?.damageable instanceof Destructible),
        )?.hit
      )
        continue;
      hits.push({
        v,
        damage: Math.max(
          1,
          Math.round(RC.damage * (1 - distance / RC.blastRadius)),
        ),
      });
    }
    for (const { v, damage } of hits) {
      const hp = v.hp;
      v.damage(damage);
      if (v.hp < hp) this.onHit(owner, v, hp - v.hp);
    }
    this.onExplode(car);
    this.world.explosions.burst(
      origin,
      "#ffb34f",
      1.5,
      "bazookaExplosion",
      "large",
    );
  }
  snapshot(): RCCarState[] {
    return [...this.cars.values()].map(
      ({ id, owner, team, x, z, yaw, speed, steer, hp }) => ({
        id,
        owner,
        team,
        x,
        z,
        yaw,
        speed,
        steer,
        hp,
      }),
    );
  }
  reset() {
    for (const owner of this.cars.keys()) this.remove(owner);
    this.watches.clear();
  }
}
/** Extrapolate only a short network gap, respecting the same wall collider. */
export function predictRCVisual(
  state: RCCarState,
  elapsed: number,
  obstacles: World["obstacles"],
): RCCarState {
  const result = { ...state };
  let remaining = Math.max(0, Math.min(0.1, elapsed));
  while (remaining > 1e-8) {
    const dt = Math.min(1 / 60, remaining);
    result.yaw += result.steer * dt;
    move(
      result,
      Math.sin(result.yaw) * result.speed * dt,
      Math.cos(result.yaw) * result.speed * dt,
      RC.radius,
      obstacles,
    );
    remaining -= dt;
  }
  return result;
}
export class RCVisuals {
  models = new Map<number, ReturnType<typeof rcCarModel>>();
  private samples = new Map<number, { state: RCCarState; age: number }>();
  constructor(public world: World) {}
  sync(states: RCCarState[], dt: number, extrapolate = false) {
    for (const [id, m] of this.models)
      if (!states.some((s) => s.id === id)) {
        m.root.dispose();
        this.models.delete(id);
        this.samples.delete(id);
      }
    for (const received of states) {
      let sample = this.samples.get(received.id);
      if (
        !sample ||
        ["x", "z", "yaw", "speed", "steer"].some(
          (k) =>
            received[k as keyof RCCarState] !==
            sample!.state[k as keyof RCCarState],
        )
      ) {
        sample = { state: { ...received }, age: 0 };
        this.samples.set(received.id, sample);
      } else sample.age += dt;
      const s = extrapolate
        ? predictRCVisual(received, sample.age, this.world.obstacles)
        : received;
      let m = this.models.get(s.id);
      if (!m) {
        m = rcCarModel(this.world);
        this.models.set(s.id, m);
        const aim = MeshBuilder.CreateBox(
          "RC aiming volume",
          { width: 1.21, height: 0.605, depth: 1.012 },
          this.world.scene,
        );
        aim.parent = m.root;
        aim.position.y = 0.3;
        aim.visibility = 0;
        aim.isPickable = false;
        aim.metadata = { rcAimTarget: true };
        m.root.position.set(s.x, 0, s.z);
        m.root.rotation.y = s.yaw;
      }
      const t = 1 - Math.exp(-dt * 18);
      m.root.position.x += (s.x - m.root.position.x) * t;
      m.root.position.z += (s.z - m.root.position.z) * t;
      m.root.rotation.y +=
        Math.atan2(
          Math.sin(s.yaw - m.root.rotation.y),
          Math.cos(s.yaw - m.root.rotation.y),
        ) * t;
      const lean = -s.steer * Math.min(1, Math.abs(s.speed) / RC.speed) * 0.1;
      m.body.rotation.z += (lean - m.body.rotation.z) * t;
      m.body.rotation.x +=
        (-(s.speed / RC.speed) * 0.085 - m.body.rotation.x) * t;
      m.body.position.y =
        Math.sin(performance.now() * 0.016) *
        Math.min(0.008, Math.abs(s.speed) * 0.002);
      for (const w of m.wheels) {
        w.spin.rotation.x += (s.speed * dt) / 0.18;
        w.pivot.position.y =
          w.baseY + (w.pivot.position.x < 0 ? -lean : lean) * 0.14;
        w.pivot.rotation.y = w.front ? s.steer * 0.11 : 0;
      }
    }
  }
  reset() {
    for (const m of this.models.values()) m.root.dispose();
    this.models.clear();
    this.samples.clear();
  }
}
