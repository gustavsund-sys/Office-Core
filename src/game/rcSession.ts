import { Camera, Ray, Vector3, TransformNode } from "@babylonjs/core";
import type { FreeCamera } from "@babylonjs/core";
import type { World } from "../map/builder";
import type { Player, Input, PlayerCommand } from "../player/player";
import type { Weapons } from "../weapons/system";
import {
  RCCars,
  RCVisuals,
  RC,
  type RCCarState,
  type RCActor,
  type RCCommand,
} from "./rcCar";
import { rcPilotGear, rcCarDebris } from "./rcCarModel";
import { RCAudio } from "../audio/rcCar";
export class RCSession {
  system: RCCars;
  visuals: RCVisuals;
  audio = new RCAudio();
  states: RCCarState[] = [];
  owner = "local";
  watch?: { position: Vector3; remaining: number };
  private driving = false;
  private gears = new Map<Player, TransformNode>();
  private previousCamera?: number;
  private previousFov?: number;
  el = document.createElement("div");
  constructor(
    public world: World,
    public input: Input,
    public player: Player,
    public weapons: Weapons,
  ) {
    this.system = new RCCars(world);
    this.visuals = new RCVisuals(world);
    this.system.onExplode = (s) =>
      this.explosion(s.owner, new Vector3(s.x, 0, s.z));
    this.el.className = "rc-overlay";
    this.el.hidden = true;
    document.querySelector("#ui")!.append(this.el);
  }
  control(pressed: boolean): RCCommand | undefined {
    const car = this.states.find((s) => s.owner === this.owner);
    if (!car) return undefined;
    const steer =
      Math.abs(this.input.remoteSteer) < 0.06 ? 0 : this.input.remoteSteer;
    const targetYaw = car.yaw + steer * 0.9;
    return {
      throttle:
        Number(this.input.keys.has("KeyW")) -
        Number(this.input.keys.has("KeyS")),
      yaw: Math.atan2(Math.sin(targetYaw), Math.cos(targetYaw)),
      detonate: pressed,
    };
  }

  local(command: PlayerCommand, dt: number, actors: RCActor[]) {
    const existing = this.system.controlling("local");
    const deploy =
      !existing &&
      this.weapons.pulseTrapSelected &&
      this.weapons.utilityKind === "rcCar" &&
      command.pressed;
    this.system.command(
      actors[0],
      existing ? this.control(command.pressed) : undefined,
      deploy,
    );
    this.system.update(dt, actors);
    this.states = this.system.snapshot();
    this.owner = "local";
    return existing || this.system.controlling("local");
  }
  explosion(owner: string, position: Vector3) {
    rcCarDebris(this.world, position);
    if (owner === this.owner) {
      this.watch = { position: position.clone(), remaining: RC.watch };
      this.input.clear();
    }
  }
  render(
    dt: number,
    states: RCCarState[],
    owner: string,
    players: { player: Player; remote: boolean }[],
    enabled: boolean,
    alive: boolean,
  ) {
    this.states = states;
    this.owner = owner;
    const own = states.find((s) => s.owner === owner);
    if (this.watch) {
      this.watch.remaining -= dt;
      if (this.watch.remaining <= 0 || !alive) this.watch = undefined;
    }
    if (own && !this.driving) this.input.yaw = own.yaw;
    this.driving = !!own && alive;
    this.input.remoteReady =
      enabled &&
      alive &&
      !own &&
      !this.watch &&
      this.weapons.utilityKind === "rcCar" &&
      this.weapons.utilityCount > 0 &&
      this.weapons.pulseTrapSelected;
    this.input.setRemote(this.driving, enabled ? dt : 0);
    this.visuals.sync(states, dt, owner !== "local");
    for (const { player, remote } of players) {
      let gear = this.gears.get(player);
      if (remote && !gear) {
        gear = rcPilotGear(this.world, player.root);
        this.gears.set(player, gear);
      }
      gear?.setEnabled(remote && player.hp > 0);
      player.gun.setEnabled(!remote && player.hp > 0);
    }
    for (const [p, g] of this.gears)
      if (!players.some((x) => x.player === p)) {
        g.dispose();
        this.gears.delete(p);
      }
    this.audio.update(
      enabled && !!own,
      this.input.keys.has("KeyW") ? 1 : this.input.keys.has("KeyS") ? -1 : 0,
      own?.speed ?? 0,
    );
    this.el.hidden = !this.driving && !this.watch;
    this.el.textContent = this.watch
      ? `RC BOMBER · DETONATED · ${this.watch.remaining.toFixed(1)}s`
      : "RC BOMBER · W / S: DRIVE · MOUSE: STEER · LMB: DETONATE";
  }
  get locked() {
    return this.driving || !!this.watch;
  }
  camera(camera: FreeCamera, dt: number) {
    const car = this.states.find((s) => s.owner === this.owner);
    this.player.root
      .getChildMeshes()
      .forEach((m) => (m.visibility = car && !this.watch ? 0 : 1));
    if (!car && !this.watch) {
      if (this.previousCamera !== undefined) {
        camera.mode = this.previousCamera;
        if (this.previousFov !== undefined) camera.fov = this.previousFov;
        this.previousFov = undefined;
        this.previousCamera = undefined;
      }
      return false;
    }
    this.previousCamera ??= camera.mode;
    this.previousFov ??= camera.fov;
    if (this.watch) {
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      const target = this.watch.position;
      camera.position.copyFrom(target.add(new Vector3(0, 22, -17)));
      camera.setTarget(target);
      return true;
    }
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    camera.fov = 0.85;
    const visual = this.visuals.models.get(car!.id)?.root;
    const yaw = visual?.rotation.y ?? car!.yaw;
    const p = visual?.position ?? new Vector3(car!.x, 0, car!.z);
    const target = p.add(
      new Vector3(Math.sin(yaw) * 4, 0.65, Math.cos(yaw) * 4),
    );
    const desired = p.add(
      new Vector3(-Math.sin(yaw) * 4.2, 2.8, -Math.cos(yaw) * 4.2),
    );
    const origin = p.add(new Vector3(0, 0.65, 0));
    const delta = desired.subtract(origin),
      length = delta.length();
    const hit = this.world.scene.pickWithRay(
      new Ray(origin, delta.scale(1 / length), length),
      (m) => m.isEnabled() && !!m.metadata?.solid,
    );
    const position =
      hit?.hit && hit.pickedPoint
        ? origin.add(delta.scale(Math.max(0.4, hit.distance - 0.2) / length))
        : desired;
    camera.position.copyFrom(position);
    camera.setTarget(target);
    return true;
  }
  reset() {
    this.system.reset();
    this.visuals.reset();
    this.states = [];
    this.watch = undefined;
    this.driving = false;
    this.input.remoteReady = false;
    this.input.setRemote(false);
    this.weapons.remoteControlled = false;
    this.audio.stop();
    for (const [p, g] of this.gears) {
      g.dispose();
      p.gun.setEnabled(true);
    }
    this.gears.clear();
    this.el.hidden = true;
  }
}
