import { CONFIG, type Team } from "../config/game";
import {
  earnLookoutKill,
  exhaustLookout,
  lookoutTeam,
  loseLookoutOnDeath,
} from "./lookoutReward";
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

import { LOOKOUT, lookoutPose } from "./lookoutConfig";
export { LOOKOUT, lookoutPose } from "./lookoutConfig";
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
/** Presentation shared by local playtests and server-authoritative matches. */
export class BossLookout {
  onEnter?: () => boolean;
  onExit?: () => void;
  online?: { send: (action: string, controls?: object) => void };
  private networkClock = 0;
  testFireRemaining = 0;
  active = false;
  selected = false;
  ammo = LOOKOUT.shots;
  private side = 1;
  private occupied = new Set<number>();
  private lastRound = 1;
  private yaw = 0;
  private pitch = 0.24;
  private recoilKick = 0;
  private recoilBack = 0;
  private fire = false;
  private scope = false;
  private cooldown = 0;
  private fallbackPointer?: { x: number; y: number };
  private savedMode = Camera.ORTHOGRAPHIC_CAMERA;
  private savedFov = 0.8;
  private savedMinZ = 1;
  private rounds?: LookoutRounds;
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
    private firingSound: (
      firing: boolean,
      naturalTail: boolean,
    ) => void = () => {},
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
    this.rounds = new LookoutRounds(world.scene, true, position => world.explosions.filmedImpact("spark", position));
    this.atmosphere = new LookoutAtmosphere(world.scene);
    for (const side of [-1, 1])
      this.turrets.set(side, buildLookoutRoom(world, side, LOOKOUT.height));
    this.viewGun = this.turrets.get(-1)!.gun;
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
    window.addEventListener("keyup", (e) => {
      if (e.code === "KeyC") this.player.crouched = false;
    });
    window.addEventListener("blur", () => {
      this.player.crouched = false;
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
    this.player.bossLookoutKey = true;
    this.player.bossLookoutKills = 10;
    this.player.bossLookoutAmmo = LOOKOUT.shots;
    this.ammo = LOOKOUT.shots;
    this.toast(
      "BOSS KEY UNLOCKED! · 10 enemy kills · Use your team's lift · 100 turret rounds",
    );
  }
  recordKill(victim: Team) {
    if (earnLookoutKill(this.player, CONFIG.player.team as Team, victim))
      this.reward();
  }
  syncRound(round: number) {
    if (round !== this.lastRound) {
      this.rounds?.clear();
      this.exit();
      if (round < this.lastRound) {
        exhaustLookout(this.player);
        this.player.bossLookoutAmmo = LOOKOUT.shots;
      }
      this.selected = false;
      this.lastRound = round;
    }
  }
  key(e: KeyboardEvent) {
    if (e.repeat) return this.active;
    if (this.online) {
      if (this.active) {
        if (e.code === "KeyB") this.online.send("exit");
        if (e.code === "KeyC") this.player.crouched = true;
        return e.code !== "Escape";
      }
      if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code))
        this.selected = false;
      if (e.code === "KeyE" && this.player.hp > 0) {
        const pos = this.player.root.position;
        if (
          [-1, 1].some(
            (side) => Vector3.Distance(pos, lookoutPose(side).door) < 3.5,
          )
        ) {
          this.online.send("interact");
          return true;
        }
      }
      return false;
    }
    if (this.active) {
      if (e.code === "KeyB") this.exit();
      if (e.code === "KeyC") this.player.crouched = true;
      return e.code !== "Escape";
    }
    if (["Digit1", "Digit2", "Digit3", "Digit4"].includes(e.code))
      this.selected = false;
    if (e.code !== "KeyE" || this.player.hp <= 0) return false;
    const pos = this.player.root.position;
    for (const side of [-1, 1])
      if (Vector3.Distance(pos, lookoutPose(side).door) < 3.5) {
        if (lookoutTeam(side) !== CONFIG.player.team)
          this.toast(
            "This Boss Lookout belongs to the other team. Use your own team’s lift.",
          );
        else if (this.player.bossLookoutKey) this.enter(side);
        else this.toast("Boss Lookout requires a key");
        return true;
      }
    return false;
  }
  enter(side: number) {
    if (!this.player.bossLookoutKey || this.active || this.player.hp <= 0)
      return;
    if (!this.online && lookoutTeam(side) !== CONFIG.player.team) {
      this.toast(
        "This Boss Lookout belongs to the other team. Use your own team’s lift.",
      );
      return;
    }
    this.selected = false;
    this.side = side;
    this.active = true;
    this.player.bossLookoutActive = true;
    this.ammo = this.player.bossLookoutAmmo ?? LOOKOUT.shots;
    this.cooldown = 0;
    this.fire = false;
    this.scope = false;
    this.savedMode = this.view.mode;
    this.savedFov = this.view.fov;
    this.savedMinZ = this.view.minZ;
    this.yaw = lookoutPose(side).yaw;
    this.pitch = 0.24;
    this.recoilKick = 0;
    this.recoilBack = 0;
    this.fallbackPointer = undefined;
    this.atmosphere?.enter();
    const rig = this.turrets?.get(side);
    if (rig) this.viewGun = rig.gun;
    this.player.root.position.copyFrom(
      lookoutPose(side).station.add(
        new Vector3(-side * LOOKOUT.eyeOffset, 0, 0),
      ),
    );
    this.player.verticalVelocity = 0;
    this.input.clear();
    if (!this.onEnter?.()) this.lockMouse();
  }
  resumeAfterEntryFilm() {
    if (!this.active) return;
    this.input.clear();
    this.lockMouse();
  }
  exit() {
    if (!this.active) return;
    this.onExit?.();
    if (!this.online) {
      this.player.bossLookoutAmmo = this.player.bossLookoutKey ? this.ammo : 0;
      if (this.ammo <= 0) exhaustLookout(this.player);
    }
    this.active = false;
    this.recoilKick = 0;
    this.recoilBack = 0;
    const restingRig = this.turrets?.get(this.side);
    if (restingRig) restingRig.gun.position.z = 0.25;
    this.testFireRemaining = 0;
    this.player.bossLookoutActive = false;
    this.player.crouched = false;
    if (this.player.root.scaling) this.player.root.scaling.y = 1;
    this.player.legs?.forEach((hip) => {
      hip.rotation.x = 0;
    });
    this.player.knees?.forEach((knee) => {
      knee.rotation.x = 0;
    });
    this.fire = false;
    this.firingSound?.(false, true);
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
        // Stand just behind the opening; the lowered eye remains behind cover.
        new Vector3(
          -this.side * LOOKOUT.eyeOffset,
          this.player.crouched ? LOOKOUT.crouchEyeHeight : LOOKOUT.eyeHeight,
          0,
        ),
      ),
    );
    this.view.rotationQuaternion = null;
    const firingPitch = Math.max(-1.3, this.pitch - this.recoilKick);
    this.view.rotation.set(firingPitch, this.yaw, 0);
    const rig = this.turrets.get(this.side);
    if (rig) {
      rig.yaw.rotation.y = this.yaw;
      rig.pitch.rotation.x = firingPitch;
      rig.gun.position.z = 0.25 - this.recoilBack;
    }
    this.player.root.scaling.y = this.player.crouched ? 0.48 : 1;
    this.player.legs?.forEach((hip) => {
      hip.rotation.x = this.player.crouched ? -0.65 : 0;
    });
    this.player.knees?.forEach((knee) => {
      knee.rotation.x = this.player.crouched ? 1.2 : 0;
    });
    this.player.setViewVisibility(0);
    this.view.getViewMatrix(true);
    return true;
  }
  syncOnline(snapshot: import("../../shared/protocol").Snapshot, id: string) {
    const self = snapshot.players.find((p) => p.id === id);
    if (!self) {
      this.exit();
      return;
    }
    this.occupied = new Set(
      snapshot.players
        .filter((p) => p.lookout && p.id !== id)
        .map((p) => p.lookout!.side),
    );
    const state = self.lookout;
    if (state && !this.active) {
      this.player.bossLookoutKey = true;
      this.enter(state.side);
    }
    if (!state && this.active) this.exit();
    if (self.lookoutKey && !this.player.bossLookoutKey) {
      this.selected = false;
      this.toast("BOSS LOOKOUT KEY · E at your team’s Lookout door");
    }
    this.player.bossLookoutKey = !!self.lookoutKey;
    this.player.bossLookoutKills = self.lookoutKills ?? 0;
    this.player.bossLookoutAmmo = self.lookoutAmmo ?? LOOKOUT.shots;
    if (state) this.ammo = state.ammo;
    for (const p of snapshot.players)
      if (p.lookout && p.id !== id) {
        const rig = this.turrets.get(p.lookout.side);
        if (rig) {
          rig.yaw.rotation.y = p.lookout.yaw;
          rig.pitch.rotation.x = p.lookout.pitch;
        }
      }
  }
  networkShot(event: import("../../shared/protocol").NetEvent, own: boolean) {
    const start = new Vector3(event.x, event.y, event.z);
    const end = new Vector3(event.endX!, event.endY!, event.endZ!);
    this.world.explosions.muzzle(
      start,
      false,
      end.subtract(start),
      1.587,
      "turret",
    );
    this.rounds?.launch(start, end, true, () => {}, event.groundHit === false ? Vector3.Zero() : Vector3.Up(), event.player ?? "remote");
    if (own) {
      this.recoilKick = Math.min(0.035, this.recoilKick + 0.012);
      this.recoilBack = Math.min(0.065, this.recoilBack + 0.045);
      this.shot();
    }
  }
  decorateHud() {
    if (!this.active && !this.player.bossLookoutSelected) return;
    const ui = document.querySelector("#ui")!;
    ui.querySelector("#weapon")!.textContent = this.active
      ? "LOOKOUT MACHINE GUN"
      : "BOSS LOOKOUT KEY";
    ui.querySelector("#mode")!.textContent = this.active
      ? "RMB: SCOPE · B: BAIL"
      : "E AT A BOSS LOOKOUT DOOR";
    ui.querySelector("#ammo")!.textContent = this.active
      ? `${this.ammo} / 100`
      : "1 KEY";
  }
  update(dt: number, paused: boolean) {
    if (!this.player.bossLookoutKey) this.selected = false;
    if (!this.online && loseLookoutOnDeath(this.player, this.player.hp)) {
      this.selected = false;
      this.ammo = 0;
      this.toast("Boss Key lost on death · Get 10 enemy kills for a new key");
    }
    if (this.active && this.player.hp <= 0) this.exit();
    this.player.bossLookoutSelected =
      this.selected && this.player.bossLookoutKey;
    this.held.setEnabled(this.player.bossLookoutSelected && !this.active);
    this.player.gun.setEnabled(
      !this.player.bossLookoutSelected && !this.active,
    );
    document.body.classList.toggle("boss-lookout-active", this.active);
    for (const [side, turret] of this.turrets)
      turret.gun.setEnabled(!this.active || side !== this.side || !this.scope);
    this.overlay.hidden = !this.active || paused;

    this.overlay.classList.toggle("scoped", this.scope);
    this.overlay.querySelector(".boss-status")!.textContent =
      `BOSS LOOKOUT · ${this.ammo} / 100 · RMB: SCOPE · C: CROUCH · B: BAIL`;
    if (paused) {
      this.testFireRemaining = 0;
      this.firingSound?.(false, false);
      this.fire = false;
      this.scope = false;
      if (this.online && this.active)
        this.online.send("aim", {
          yaw: this.yaw,
          pitch: this.pitch,
          fire: false,
          crouched: false,
        });
      this.fallbackPointer = undefined;
      if (this.active && document.pointerLockElement)
        document.exitPointerLock();
      return;
    }
    this.testFireRemaining = Math.max(0, this.testFireRemaining - dt);
    this.firingSound?.(
      this.active && (this.fire || this.testFireRemaining > 0),
      true,
    );
    this.rounds?.update(dt);
    this.prompt.hidden = true;
    if (this.active) {
      // Exponential recovery stays consistent across different frame rates.
      this.recoilKick *= Math.exp(-12 * dt);
      this.recoilBack *= Math.exp(-22 * dt);
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.camera();
      this.networkClock += dt;
      if (this.online && this.networkClock >= 0.05) {
        this.networkClock = 0;
        this.online.send("aim", {
          yaw: this.yaw,
          pitch: this.pitch - this.recoilKick,
          fire: this.fire,
          crouched: this.player.crouched,
        });
      }
      if (
        !this.online &&
        (this.fire || this.testFireRemaining > 0) &&
        this.cooldown <= 0
      ) {
        this.cooldown = LOOKOUT.interval;
        this.ammo--;
        this.shot();
        const ray = this.view.getForwardRay(LOOKOUT.range);
        const picked = this.world.scene.pickWithRay(
          ray,
          (m) =>
            (m.isPickable ||
              /^(walkable floor|corridor runner|room carpet|base carpet)$/.test(
                m.name,
              )) &&
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
              Math.min(LOOKOUT.range, picked?.hit ? picked.distance : Infinity)
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
        this.world.explosions.muzzle(
          start,
          false,
          end.subtract(start),
          1.587,
          "turret",
        );
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

        // Apply after tracing this shot; the next shot follows the lifted aim.
        this.recoilKick = Math.min(0.035, this.recoilKick + 0.012);
        this.recoilBack = Math.min(0.065, this.recoilBack + 0.045);
        this.camera();

        if (this.ammo <= 0) {
          this.exit();
          this.toast(
            "Turret empty · Boss Key expired · Get 10 enemy kills for a new key",
          );
        }
      }
      return;
    }
    if (this.player.hp <= 0) return;
    if (
      [-1, 1].some(
        (s) =>
          Vector3.Distance(lookoutPose(s).door, this.player.root.position) <
          3.5,
      )
    ) {
      this.prompt.hidden = false;
      const nearby = [-1, 1].find(
        (side) =>
          Vector3.Distance(lookoutPose(side).door, this.player.root.position) <
          3.5,
      )!;
      this.prompt.textContent =
        lookoutTeam(nearby) !== CONFIG.player.team
          ? "ENEMY BOSS LOOKOUT · USE YOUR TEAM’S LIFT"
          : this.occupied?.has(nearby)
            ? "BOSS LOOKOUT OCCUPIED · WAIT FOR YOUR TEAMMATE"
            : this.player.bossLookoutKey
              ? "E · ENTER BOSS LOOKOUT"
              : "BOSS KEY · 10 ENEMY KILLS REQUIRED";
    }
  }
}
