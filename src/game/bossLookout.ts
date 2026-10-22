import { LookoutRounds } from "./lookoutRounds";
import { TURRET_MUZZLE } from "./bossTurretModel";
import {
  buildLookoutRoom,
  LookoutAtmosphere,
  type LookoutRig,
} from "./bossLookoutRoom";
import {
  Camera,
  Mesh,
  MeshBuilder,
  Vector3,
  type FreeCamera,
} from "@babylonjs/core";
import type { World } from "../map/builder";
import type { Player, Input } from "../player/player";
import type { Hittable } from "../core/hittable";
import { office01 } from "../maps/office01";

export const LOOKOUT = {
  shots: 100,
  damage: 8,
  interval: 0.1,
  range: 350,
  height: 20,
};
export function lookoutPose(side: number) {
  return {
    door: new Vector3(side * 94, 0, -13),
    station: new Vector3(side * 94, LOOKOUT.height, 0),
    yaw: (-side * Math.PI) / 2,
  };
}
export function keyModel(world: World) {
  const root = new Mesh("Boss Lookout key", world.scene);
  const ring = MeshBuilder.CreateTorus(
    "key bow",
    { diameter: 0.6, thickness: 0.13, tessellation: 20 },
    world.scene,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.45;
  ring.parent = root;
  ring.material = world.mat("#ffcf58");
  for (const [x, y, w, h] of [
    [0, -0.1, 0.13, 0.8],
    [0.15, -0.35, 0.3, 0.12],
    [0.15, -0.12, 0.3, 0.12],
  ]) {
    const m = world.box("key tooth", x, y, 0, w, h, 0.13, "#ffcf58");
    m.parent = root;
  }
  for (const m of root.getChildMeshes()) m.isPickable = false;
  return root;
}
/** Local playtest prototype. Round rewards are retained until the next round. */
export class BossLookout {
  active = false;
  selected = false;
  available = false;
  ammo = LOOKOUT.shots;
  private side = 1;
  private pending = false;
  private lastWins = 0;
  private lastRound = 1;
  private yaw = 0;
  private pitch = 0.24;
  private fire = false;
  private scope = false;
  private cooldown = 0;
  private fallbackPointer?: { x: number; y: number };
  private savedMode = Camera.ORTHOGRAPHIC_CAMERA;
  private savedFov = 0.8;
  private savedMinZ = 1;
  private rounds?: LookoutRounds;
  private drops: Mesh[] = [];
  private turrets = new Map<number, LookoutRig>();
  private atmosphere?: LookoutAtmosphere;
  private held: Mesh;
  private viewGun: Mesh;
  private overlay = document.createElement("div");
  private prompt = document.createElement("div");
  constructor(
    public world: World,
    public player: Player,
    public input: Input,
    public view: FreeCamera,
    private paused: () => boolean,
    private toast: (text: string) => void,
    private hit: (target: Hittable, damage: number) => void,
    private shot: () => void,
  ) {
    this.overlay.className = "boss-lookout-overlay";
    this.overlay.hidden = true;
    this.overlay.innerHTML =
      '<div class="boss-vignette"></div><div class="boss-scope"><i></i></div><div class="boss-reticle">+</div><div class="boss-status"></div>';
    this.prompt.className = "boss-lookout-prompt";
    this.prompt.hidden = true;
    document.querySelector("#ui")!.append(this.overlay, this.prompt);
    this.held = keyModel(world);
    this.held.parent = player.root;
    this.held.position.set(0.3, 1.2, 0.55);
    this.held.scaling.setAll(0.55);
    this.held.setEnabled(false);
    this.rounds = new LookoutRounds(world.scene);
    this.atmosphere = new LookoutAtmosphere(world.scene);
    for (const side of [-1, 1])
      this.turrets.set(side, buildLookoutRoom(world, side, LOOKOUT.height));
    this.viewGun = this.turrets.get(-1)!.gun;
    for (const zone of office01.weaponEnds) {
      const key = keyModel(world);
      key.position.set(zone.x, 1.6, zone.z - 5);
      key.setEnabled(false);
      this.drops.push(key);
    }
    window.addEventListener("pointermove", (e) => {
      if (!this.active || this.paused()) return;
      const center = lookoutPose(this.side).yaw;
      if (document.pointerLockElement === document.querySelector("#game")) {
        const speed = this.scope ? 0.00065 : 0.002;
        this.yaw = Math.max(
          center - 1.2,
          Math.min(center + 1.2, this.yaw + e.movementX * speed),
        );
        this.pitch = Math.max(
          0.12,
          Math.min(1.53, this.pitch + e.movementY * speed),
        );
      } else {
        // Keep FPS-like relative aiming even when an embedded browser refuses Pointer Lock.
        if (e.target !== document.querySelector("#game")) {
          this.fallbackPointer = undefined;
          return;
        }
        const previous = this.fallbackPointer;
        this.fallbackPointer = { x: e.clientX, y: e.clientY };
        if (!previous) return;
        const speed = this.scope ? 0.00065 : 0.002;
        this.yaw = Math.max(
          center - 1.2,
          Math.min(center + 1.2, this.yaw + (e.clientX - previous.x) * speed),
        );
        this.pitch = Math.max(
          0.12,
          Math.min(1.53, this.pitch + (e.clientY - previous.y) * speed),
        );
      }
    });
    window.addEventListener("pointerdown", (e) => {
      if (
        !this.active ||
        this.paused() ||
        e.target !== document.querySelector("#game")
      )
        return;
      if (e.button === 0) {
        this.fire = true;
        this.lockMouse();
      }
      if (e.button === 2) {
        this.scope = !this.scope;
        e.preventDefault();
      }
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0 || e.buttons === 0) this.fire = false;
    });
    window.addEventListener("blur", () => {
      this.fire = false;
      this.scope = false;
    });
  }
  private lockMouse() {
    void document
      .querySelector<HTMLCanvasElement>("#game")
      ?.requestPointerLock()
      ?.catch(() => {});
  }
  reward() {
    this.available = true;
    this.drops.forEach((k) => k.setEnabled(true));
    this.toast("Boss Lookout available · Collect a key in Weapon Drop");
  }
  syncRound(round: number, wins: number) {
    if (wins > this.lastWins) this.pending = true;
    this.lastWins = wins;
    if (round !== this.lastRound) {
      this.rounds?.clear();
      this.exit();
      this.player.bossLookoutKey = false;
      this.selected = false;
      this.available = false;
      this.drops.forEach((k) => k.setEnabled(false));
      if (this.pending) {
        this.reward();
        this.pending = false;
      }
      this.lastRound = round;
    }
  }
  key(e: KeyboardEvent) {
    if (e.repeat) return this.active;
    if (this.active) {
      if (e.code === "KeyB") this.exit();
      return e.code !== "Escape";
    }
    if (e.code === "Digit5") {
      this.selected = this.player.bossLookoutKey;
      return true;
    }
    if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code))
      this.selected = false;
    if (e.code !== "KeyE" || this.player.hp <= 0) return false;
    const pos = this.player.root.position;
    const drop = this.drops.find(
      (k) => k.isEnabled() && Vector3.Distance(pos, k.position) < 3,
    );
    if (drop && !this.player.bossLookoutKey) {
      this.player.bossLookoutKey = true;
      this.available = false;
      this.selected = true;
      this.drops.forEach((k) => k.setEnabled(false));
      this.toast("BOSS LOOKOUT KEY · [5] · E at a Lookout door");
      return true;
    }
    for (const side of [-1, 1])
      if (Vector3.Distance(pos, lookoutPose(side).door) < 3.5) {
        if (this.player.bossLookoutKey) this.enter(side);
        else this.toast("Boss Lookout requires a key");
        return true;
      }
    return false;
  }
  enter(side: number) {
    if (!this.player.bossLookoutKey || this.active || this.player.hp <= 0)
      return;
    this.player.bossLookoutKey = false;
    this.selected = false;
    this.side = side;
    this.active = true;
    this.ammo = LOOKOUT.shots;
    this.cooldown = 0;
    this.fire = false;
    this.scope = false;
    this.savedMode = this.view.mode;
    this.savedFov = this.view.fov;
    this.savedMinZ = this.view.minZ;
    this.yaw = lookoutPose(side).yaw;
    this.pitch = 0.24;
    this.fallbackPointer = undefined;
    this.atmosphere?.enter();
    const rig = this.turrets?.get(side);
    if (rig) this.viewGun = rig.gun;
    this.player.root.position.copyFrom(lookoutPose(side).station);
    this.player.verticalVelocity = 0;
    this.input.clear();
    this.lockMouse();
  }
  exit() {
    if (!this.active) return;
    this.active = false;
    this.fire = false;
    this.scope = false;
    this.player.root.position.copyFrom(
      lookoutPose(this.side).door.add(new Vector3(0, 0, -2)),
    );
    this.player.verticalVelocity = 0;
    this.player.knockbackX = 0;
    this.player.knockbackZ = 0;
    this.player.setViewVisibility(1);
    this.view.mode = this.savedMode;
    this.view.fov = this.savedFov;
    this.view.minZ = this.savedMinZ;
    this.viewGun.setEnabled(true);
    this.atmosphere?.exit();
    this.overlay.hidden = true;
    this.input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
  }
  camera() {
    if (!this.active) return false;
    this.view.mode = Camera.PERSPECTIVE_CAMERA;
    this.view.fov = this.scope ? 0.2 : 1.0;
    this.view.minZ = 0.08;
    this.view.position.copyFrom(
      lookoutPose(this.side).station.add(
        // Move 15% from the former eye position toward the fixed gun pivot.
        new Vector3(-this.side * 5.3575, 1.61, 0),
      ),
    );
    this.view.rotationQuaternion = null;
    this.view.rotation.set(this.pitch, this.yaw, 0);
    const rig = this.turrets.get(this.side);
    if (rig) {
      rig.yaw.rotation.y = this.yaw;
      rig.pitch.rotation.x = this.pitch;
    }
    this.player.setViewVisibility(0);
    return true;
  }
  decorateHud() {
    if (!this.active && !this.player.bossLookoutSelected) return;
    const ui = document.querySelector("#ui")!;
    ui.querySelector("#weapon")!.textContent = this.active
      ? "LOOKOUT MACHINE GUN"
      : "BOSS LOOKOUT KEY [5]";
    ui.querySelector("#mode")!.textContent = this.active
      ? "RMB: SCOPE · B: BAIL"
      : "E AT A BOSS LOOKOUT DOOR";
    ui.querySelector("#ammo")!.textContent = this.active
      ? `${this.ammo} / 100`
      : "1 KEY";
  }
  update(dt: number, paused: boolean) {
    if (this.active && this.player.hp <= 0) this.exit();
    this.player.bossLookoutSelected =
      this.selected && this.player.bossLookoutKey;
    this.held.setEnabled(this.player.bossLookoutSelected && !this.active);
    this.player.gun.setEnabled(
      !this.player.bossLookoutSelected && !this.active,
    );
    for (const drop of this.drops) if (drop.isEnabled()) drop.rotation.y += dt;
    document.body.classList.toggle("boss-lookout-active", this.active);
    for (const [side, turret] of this.turrets)
      turret.gun.setEnabled(!this.active || side !== this.side || !this.scope);
    this.overlay.hidden = !this.active || paused;

    this.overlay.classList.toggle("scoped", this.scope);
    this.overlay.querySelector(".boss-status")!.textContent =
      `BOSS LOOKOUT · ${this.ammo} / 100 · RMB: SCOPE · B: BAIL`;
    if (paused) {
      this.fire = false;
      this.scope = false;
      this.fallbackPointer = undefined;
      if (this.active && document.pointerLockElement)
        document.exitPointerLock();
      return;
    }
    this.rounds?.update(dt);
    this.prompt.hidden = true;
    if (this.active) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.camera();
      if (this.fire && this.cooldown <= 0) {
        this.cooldown = LOOKOUT.interval;
        this.ammo--;
        this.shot();
        const ray = this.view.getForwardRay(LOOKOUT.range);
        const picked = this.world.scene.pickWithRay(
          ray,
          (m) =>
            m.isPickable &&
            m.isEnabled() &&
            !this.player.bodyMeshes.some((body) => body === m),
        );
        let end =
          picked?.pickedPoint ??
          ray.origin.add(ray.direction.scale(LOOKOUT.range));
        let target = picked?.pickedMesh?.metadata?.damageable as
          Hittable | undefined;
        let surface = !!picked?.hit;
        let normal = picked?.getNormal(true) ?? ray.direction.scale(-1);
        // Map carpets are intentionally non-pickable for top-down aiming. Resolve
        // their floor plane here so elevated fire still impacts the visible ground.
        if (ray.direction.y < -0.0001) {
          const groundDistance = (0.06 - ray.origin.y) / ray.direction.y;
          if (
            groundDistance > 0 &&
            groundDistance <
              Math.min(LOOKOUT.range, picked?.distance ?? Infinity)
          ) {
            const point = ray.origin.add(ray.direction.scale(groundDistance));
            if (
              office01.footprint.some(
                (r) =>
                  Math.abs(point.x - r.x) <= r.w / 2 &&
                  Math.abs(point.z - r.z) <= r.d / 2,
              )
            ) {
              end = point;
              surface = true;
              target = undefined;
              normal = Vector3.Up();
            }
          }
        }
        const allowed =
          !!target && target.hp > 0 && target.canDamageFrom(ray.origin);
        const start = Vector3.TransformCoordinates(
          TURRET_MUZZLE,
          this.viewGun.computeWorldMatrix(true),
        );
        // Close cover can sit behind an extended barrel: never draw a backward tracer.
        if (Vector3.Dot(end.subtract(start), ray.direction) <= 0)
          start.copyFrom(ray.origin);
        const tracer = this.rounds!.launch(
          start,
          end,
          surface,
          () => {
            if (allowed && target && target.hp > 0) {
              const before = target.hp;
              target.damage(LOOKOUT.damage);
              if (target.hp < before) this.hit(target, before - target.hp);
            }
          },
          normal,
        );
        tracer.material = this.world.mat("#ffe4a2", true);
        if (this.ammo <= 0) {
          this.exit();
          this.toast("Boss Lookout empty · returned to door");
        }
      }
      return;
    }
    if (this.player.hp <= 0) return;
    if (
      this.drops.some(
        (k) =>
          k.isEnabled() &&
          Vector3.Distance(k.position, this.player.root.position) < 3,
      )
    ) {
      this.prompt.hidden = false;
      this.prompt.textContent = "E · PICK UP BOSS LOOKOUT KEY";
    } else if (
      [-1, 1].some(
        (s) =>
          Vector3.Distance(lookoutPose(s).door, this.player.root.position) <
          3.5,
      )
    ) {
      this.prompt.hidden = false;
      this.prompt.textContent = this.player.bossLookoutKey
        ? "E · ENTER BOSS LOOKOUT"
        : "BOSS LOOKOUT · KEY REQUIRED";
    }
  }
}
