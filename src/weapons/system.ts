import { weaponStats } from "../config/weaponBalance";
import type { DeathSource } from "../ui/combatFeed";
import {
  shard,
  beam,
  flash as pooledFlash,
  releaseEffect,
} from "../game/effectPool";
import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Ray,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { Player, type PlayerCommand } from "../player/player";
import { Destructible } from "../core/destructible";
import { heldWeapon, rocketModel } from "./models";
import type { Hittable } from "../core/hittable";
export class Weapons {
  pickHit?: (ray: Ray) => import("@babylonjs/core").PickingInfo | null;
  carryingBeacon = false;
  remoteControlled = false;
  utilityKind: "pulseTrap" | "superMedkit" | "rcCar" = "pulseTrap";
  utilityCount = 0;
  get carryingPulseTrap() {
    return this.utilityKind === "pulseTrap" && this.utilityCount > 0;
  }
  set carryingPulseTrap(value: boolean) {
    if (value) {
      this.utilityKind = "pulseTrap";
      this.utilityCount = Math.max(1, this.utilityCount);
    } else if (this.utilityKind === "pulseTrap") this.utilityCount = 0;
  }
  pulseTrapSelected = false;
  warcryAvailable = false;
  onWarcry: () => void = () => {};
  activateWarcry() {
    if (
      !this.carryingCoreBuster ||
      !this.warcryAvailable ||
      this.player.hp <= 0
    )
      return false;
    this.warcryAvailable = false;
    this.player.invulnerable = 4;
    this.onWarcry();
    return true;
  }
  mobileBalance = false;
  id: WeaponId = "pistol";
  specialWeapon?: WeaponId;
  onEmpty: () => void = () => {};
  onTrace: (start: Vector3, end: Vector3) => void = () => {};
  onCoreBusterAcquired: () => void = () => {};
  onCoreBusterDropped: (position: Vector3) => void = () => {};
  charges: { mesh: Mesh; timer: number }[] = [];
  get carryingCoreBuster() {
    return this.specialWeapon === "coreBuster";
  }
  dropCoreBuster() {
    if (!this.carryingCoreBuster) return;
    this.onCoreBusterDropped(this.player.root.position.clone());
    this.specialWeapon = undefined;
    this.equip("pistol");
  }
  switchSlot(slot: 1 | 2 | 3) {
    if (this.remoteControlled) return;
    if (slot === 3) {
      if (this.utilityCount > 0) {
        this.pulseTrapSelected = true;
        this.burstRemaining = 0;
      }
      return;
    }
    this.pulseTrapSelected = false;
    const id = slot === 1 ? "pistol" : this.specialWeapon;
    if (id && id !== this.id) this.equip(id);
  }
  ammunition: Record<WeaponId, number> = {
    pistol: 60,
    machineGun: 100,
    bazooka: 3,
    burstGun: 100,
    pulseGun: 30,
    coreBuster: 1,
    huntingRifle: 10,
  };
  reserves = Object.fromEntries(
    Object.keys(WEAPONS).map((id) => [id, 0]),
  ) as Record<WeaponId, number>;
  get bazookaReserve() {
    return this.reserves.bazooka;
  }
  set bazookaReserve(value: number) {
    this.reserves.bazooka = value;
  }
  get reserve() {
    return this.reserves[this.id];
  }
  set reserve(value: number) {
    this.reserves[this.id] = value;
  }
  reloads: Partial<
    Record<
      WeaponId,
      { remaining: number; duration: number; kind: "magazine" | "chamber" }
    >
  > = {};
  onReload: (kind: "magazine" | "chamber", weapon: WeaponId) => void = () => {};
  get reloadRemaining() {
    return this.reloads[this.id]?.remaining ?? 0;
  }
  set reloadRemaining(value: number) {
    if (value <= 0) delete this.reloads[this.id];
    else
      this.reloads[this.id] = {
        remaining: value,
        duration: value,
        kind: "magazine",
      };
  }
  get reloadDuration() {
    return this.reloads[this.id]?.duration ?? 1;
  }
  syncReload(
    remaining: number,
    duration: number,
    kind: "magazine" | "chamber",
  ) {
    if (remaining <= 0) delete this.reloads[this.id];
    else this.reloads[this.id] = { remaining, duration, kind };
  }
  requestReload() {
    if (
      this.id === "coreBuster" ||
      this.carryingBeacon ||
      this.pulseTrapSelected ||
      this.remoteControlled ||
      this.player.hp <= 0 ||
      this.reloadRemaining > 0 ||
      this.ammo >= WEAPONS[this.id].ammo ||
      this.reserve <= 0
    )
      return false;
    this.reloads[this.id] = { remaining: 1, duration: 1, kind: "magazine" };
    this.burstRemaining = 0;
    this.onReload("magazine", this.id);
    return true;
  }
  private reloadEmptyMagazine() {
    if (this.ammo > 0 || this.reserve <= 0 || this.id === "coreBuster")
      return false;
    this.onEmpty();
    return this.requestReload();
  }
  private chamberRifle() {
    this.reloads.huntingRifle = { remaining: 8, duration: 8, kind: "chamber" };
    this.onReload("chamber", "huntingRifle");
  }
  get ammo() {
    return this.ammunition[this.id];
  }
  set ammo(value: number) {
    this.ammunition[this.id] = value;
  }
  addAmmo(id: WeaponId, amount: number) {
    if (id === "coreBuster") return;
    this.reserves[id] += amount;
    if (id === this.id && this.ammo === 0) this.requestReload();
  }
  cooldown = 0;
  burstRemaining = 0;
  rockets: {
    mesh: Mesh;
    origin: Vector3;
    start: Vector3;
    direction: Vector3;
    distance: number;
  }[] = [];
  trail: { mesh: Mesh; life: number; maxLife: number; smoke: boolean }[] = [];
  effects: { mesh: Mesh; life: number }[] = [];
  visuals = true;
  constructor(
    public player: Player,
    public onHit: (
      target: Hittable,
      damage: number,
      source?: DeathSource,
    ) => void,
    public onShot: () => void,
    public onShield: () => void = () => {},
    public onImpact: (position: Vector3) => void = () => {},
  ) {}
  equip(id: WeaponId) {
    if (this.carryingCoreBuster && id !== "coreBuster") return;
    const acquired = id === "coreBuster" && !this.carryingCoreBuster;
    if (id === "coreBuster") this.ammunition.coreBuster = 1;
    if (id !== "pistol") this.specialWeapon = id;
    this.id = id;
    this.player.setWeaponModel(id);
    if (acquired) {
      this.warcryAvailable = true;
      this.onCoreBusterAcquired();
    }

    this.burstRemaining = 0;
    if (id === "bazooka" && this.ammo === 0 && this.bazookaReserve > 0)
      this.requestReload();
  }
  advanceReloads(dt: number, applyAmmo = true) {
    this.player.reloadPose = this.reloadRemaining;
    for (const [id, state] of Object.entries(this.reloads) as [
      WeaponId,
      NonNullable<Weapons["reloads"][WeaponId]>,
    ][]) {
      state.remaining = Math.max(0, state.remaining - dt);
      if (state.remaining === 0) {
        if (state.kind === "magazine" && applyAmmo) {
          const loaded = Math.min(
            WEAPONS[id].ammo - this.ammunition[id],
            this.reserves[id],
          );
          this.ammunition[id] += loaded;
          this.reserves[id] -= loaded;
        }
        delete this.reloads[id];
      }
    }
  }
  update(c: PlayerCommand, dt: number) {
    this.advanceReloads(dt);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    if (this.player.hp <= 0) this.dropCoreBuster();
    for (const charge of [...this.charges]) {
      charge.timer -= dt;
      if (charge.timer <= 0) {
        const position = charge.mesh.position;
        this.coreBusterBlast(position);
        for (const wall of this.player.world.destructibles) {
          if (
            wall.prop.kind === "coreDoor" &&
            wall.hp > 0 &&
            Vector3.Distance(position, wall.position) < 4
          ) {
            const damage = wall.hp;
            wall.damage(damage, "coreBuster");
            this.onHit(wall, damage, "coreBuster");
          }
        }
        this.player.world.explosions.burst(
          position.clone(),
          "#ffcf56",
          2.5,
          "bazookaExplosion",
        );
        charge.mesh.dispose();
        this.charges.splice(this.charges.indexOf(charge), 1);
      }
    }
    if (this.player.hp <= 0) return;
    if (this.pulseTrapSelected || this.remoteControlled)
      c = { ...c, fire: false, pressed: false };
    if (this.carryingCoreBuster) {
      if (c.pressed && this.player.grounded) {
        const mesh = heldWeapon(this.player.world, "coreBuster");
        mesh.position.copyFrom(this.player.root.position);
        mesh.position.y = 0.48;
        mesh.rotation.y = this.player.root.rotation.y;
        this.charges.push({ mesh, timer: 25 });
        this.specialWeapon = undefined;
        this.equip("pistol");
      }
      return;
    }
    for (const particle of this.trail) {
      particle.life -= dt;
      const age = 1 - particle.life / particle.maxLife;
      const material = particle.mesh.material as StandardMaterial;
      material.alpha = Math.max(0, (1 - age) * (particle.smoke ? 0.25 : 0.8));
      particle.mesh.scaling.setAll(
        particle.smoke ? 1 + age * 2.5 : Math.max(0.05, 1 - age),
      );
      particle.mesh.position.y += dt * (particle.smoke ? 0.4 : 0.08);
      if (particle.life <= 0) {
        particle.mesh.dispose();
        material.dispose();
      }
    }
    this.trail = this.trail.filter((particle) => particle.life > 0);
    this.updateRockets(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const e of this.effects) {
      e.life -= dt;
      if (e.life <= 0) releaseEffect(e.mesh);
    }
    this.effects = this.effects.filter((e) => e.life > 0);
    if (this.reloadRemaining > 0) {
      return;
    }
    if (
      this.carryingBeacon ||
      this.pulseTrapSelected ||
      this.remoteControlled
    ) {
      this.burstRemaining = 0;
      return;
    }
    if (this.ammo <= 0) {
      this.burstRemaining = 0;
      if (this.player.hp > 0) {
        if (this.reserve > 0) this.reloadEmptyMagazine();
        else if (c.pressed) this.onEmpty();
      }
      return;
    }
    const data = weaponStats(this.id, this.mobileBalance);
    if (
      this.id === "burstGun" &&
      this.cooldown === 0 &&
      this.burstRemaining === 0 &&
      c.pressed
    ) {
      this.burstRemaining = 5;
    }
    if (
      this.cooldown > 0 ||
      !(this.id === "burstGun"
        ? this.burstRemaining > 0
        : data.automatic
          ? c.fire || c.pressed
          : c.pressed)
    )
      return;
    this.cooldown = 1 / data.fireRate;
    if (this.id === "burstGun") {
      this.burstRemaining--;
      if (this.burstRemaining === 0) this.cooldown = 1;
    }
    this.player.recoil = 1;
    const scene = this.player.world.scene;
    const origin = this.player.shotOrigin;
    const direction = this.player.shotDirection(c, origin);
    if (this.id === "bazooka") {
      const mesh = rocketModel(this.player.world);
      const start = origin.clone();
      mesh.position.copyFrom(start);
      mesh.rotationQuaternion = Quaternion.FromLookDirectionLH(
        direction,
        Vector3.Up(),
      );
      mesh.isPickable = false;
      this.rockets.push({
        mesh,
        origin: this.player.root.position.add(new Vector3(0, 1.1, 0)),
        start,
        direction,
        distance: 0,
      });
      this.onShot();
      --this.ammo;
      this.reloadEmptyMagazine();
      return;
    }
    const ray = new Ray(origin, direction, data.range);
    const hit = this.pickHit
      ? this.pickHit(ray)
      : scene.pickWithRay(
          ray,
          (m) =>
            m.isEnabled() &&
            !this.player.bodyMeshes.includes(m as Mesh) &&
            (!!m.metadata?.solid ||
              (!!m.metadata?.damageable && m.metadata.damageable.hp > 0)),
        );
    const end =
      hit?.hit && hit.pickedPoint
        ? hit.pickedPoint
        : origin.add(direction.scale(data.range));
    const start = origin.clone();
    this.onTrace(start, end);
    if (this.visuals) {
      const tracer = beam(
        scene,
        start,
        end,
        this.id === "pulseGun" ? 0.14 : 0.025,
      );
      tracer.name = this.id === "pulseGun" ? "pulse beam" : "tracer";
      tracer.material = this.player.world.mat(
        this.id === "pulseGun" ? "#ff263e" : "#ffe4a5",
        true,
      );
      tracer.isPickable = false;
      this.effects.push({ mesh: tracer, life: 0.065 });
      if (
        !this.player.world.explosions.muzzle(
          start,
          this.id === "pulseGun",
          end.subtract(start),
          this.id === "huntingRifle" ? 1.75 : 1.3,
          this.id,
        )
      ) {
        const flash = pooledFlash(scene, 0.23);
        flash.position.copyFrom(start);
        flash.material = this.player.world.mat("#ffe8a1", true);
        flash.isPickable = false;
        this.effects.push({ mesh: flash, life: 0.045 });
      }
    }
    if (hit?.hit) {
      this.onImpact(end);
      const spriteImpact =
        this.visuals &&
        this.player.world.explosions.impact(
          end,
          hit.pickedMesh?.metadata?.material ?? "metal",
        );
      for (let i = 0; this.visuals && !spriteImpact && i < 5; i++) {
        const spark = shard(scene, 0.065 + Math.random() * 0.07);
        spark.position.copyFrom(
          end.add(
            new Vector3(
              (Math.random() - 0.5) * 0.35,
              Math.random() * 0.3,
              (Math.random() - 0.5) * 0.35,
            ),
          ),
        );
        spark.material = this.player.world.mat("#ffdc96", true);
        spark.isPickable = false;
        this.effects.push({ mesh: spark, life: 0.12 });
      }
      const t = hit.pickedMesh?.metadata?.damageable as Hittable | undefined;
      if (t) {
        if (t.canDamageFrom(this.player.root.position)) {
          const damage = Math.min(data.damage, t.hp);
          const before = t.hp;
          t.damage(data.damage);
          if (t.hp < before) this.onHit(t, damage, this.id);
        } else {
          this.onShield();
        }
      }
    }
    if (this.id !== "burstGun" || this.burstRemaining === 4) this.onShot();
    this.ammo--;
    const autoReloaded = this.reloadEmptyMagazine();
    if (this.id === "huntingRifle") {
      this.player.kickBack(direction);
      this.cooldown = 0;
      if (!autoReloaded) this.chamberRifle();
    }
  }
  private blastBlocked(origin: Vector3, position: Vector3, victim: Hittable) {
    const delta = position.subtract(origin),
      length = delta.length();
    if (length <= 0.15) return false;
    return !!this.player.world.scene.pickWithRay(
      new Ray(
        origin.add(delta.normalizeToNew().scale(0.08)),
        delta.normalizeToNew(),
        length - 0.12,
      ),
      (mesh) =>
        mesh.isEnabled() &&
        mesh.metadata?.damageable !== victim &&
        (!!mesh.metadata?.solid ||
          mesh.metadata?.damageable instanceof Destructible),
    )?.hit;
  }
  private coreBusterBlast(position: Vector3) {
    const origin = position.add(new Vector3(0, 0.62, 0));
    const victims = new Map<Hittable, Vector3>();
    for (const mesh of this.player.world.scene.meshes) {
      const victim = mesh.metadata?.damageable as Hittable | undefined;
      if (victim && victim.hp > 0 && mesh.isEnabled() && !victims.has(victim))
        victims.set(
          victim,
          (victim as Hittable & { position?: Vector3 }).position ??
            mesh.getAbsolutePosition(),
        );
    }
    if (!this.player.bodyMeshes.some((mesh) => mesh.metadata?.damageable)) {
      const player = this.player;
      const self: Hittable = {
        get hp() {
          return player.hp;
        },
        canDamageFrom: () => true,
        damage: (amount) => {
          if (player.invulnerable > 0) return;
          player.takeDamage(amount);
        },
      };
      victims.set(self, player.root.position.add(new Vector3(0, 1.1, 0)));
    }
    const hits: { victim: Hittable; damage: number }[] = [];
    for (const [victim, target] of victims) {
      if (victim instanceof Destructible) continue;
      const distance = Math.hypot(target.x - origin.x, target.z - origin.z);
      if (distance >= 4) continue;
      const aim = target.clone();
      aim.y = Math.max(aim.y, 1.1);
      if (this.blastBlocked(origin, aim, victim)) continue;
      if (victim.kind === "core") {
        if ((victim as Hittable & { active?: boolean }).active === false)
          continue;
        hits.push({ victim, damage: 500 });
      } else {
        // Lethal within one metre, then the same linear falloff as bazooka splash.
        hits.push({
          victim,
          damage: Math.max(1, Math.round(140 * (1 - distance / 4))),
        });
      }
    }
    // Resolve cover for everyone before any explosion damage can remove it.
    for (const { victim, damage } of hits) {
      const before = victim.hp;
      victim.damage(damage);
      if (victim.hp < before)
        this.onHit(victim, before - victim.hp, "coreBuster");
    }
  }
  private updateRockets(dt: number) {
    const scene = this.player.world.scene;
    for (const rocket of [...this.rockets]) {
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(remaining, 0.025);
        remaining -= step;
        rocket.distance = Math.min(40, rocket.distance + step * 9.9);
        const next = rocket.start.add(rocket.direction.scale(rocket.distance));
        next.y += Math.sin((rocket.distance / 40) * Math.PI) * 0.75;
        const delta = next.subtract(rocket.mesh.position);
        const length = delta.length();
        if (length > 0)
          rocket.mesh.rotationQuaternion = Quaternion.FromLookDirectionLH(
            delta.scale(1 / length),
            Vector3.Up(),
          );
        const flame = rocket.mesh
          .getChildMeshes()
          .find((part) => part.name === "rocket flare");
        if (flame) flame.scaling.y = 0.8 + Math.random() * 0.4;
        const hit =
          length > 0
            ? scene.pickWithRay(
                new Ray(rocket.mesh.position, delta.scale(1 / length), length),
                (mesh) =>
                  mesh.isEnabled() &&
                  !this.player.bodyMeshes.includes(mesh as Mesh) &&
                  (!!mesh.metadata?.solid ||
                    (!!mesh.metadata?.damageable &&
                      mesh.metadata.damageable.hp > 0)),
              )
            : null;
        if (hit?.hit && hit.pickedPoint) {
          const target = hit.pickedMesh?.metadata?.damageable as
            Hittable | undefined;
          const candidates = new Map<Hittable, Vector3>();
          for (const mesh of scene.meshes) {
            const victim = mesh.metadata?.damageable as Hittable | undefined;
            if (
              victim &&
              victim.hp > 0 &&
              mesh.isEnabled() &&
              !candidates.has(victim)
            )
              candidates.set(
                victim,
                (victim as Hittable & { position?: Vector3 }).position ??
                  mesh.getAbsolutePosition(),
              );
          }
          for (const [victim, position] of candidates) {
            const distance = Vector3.Distance(hit.pickedPoint, position);
            if (victim !== target && distance >= 4) continue;
            if (
              !(victim === target && victim.kind === "core"
                ? (victim as Hittable & { active?: boolean }).active !== false
                : victim.canDamageFrom(rocket.origin))
            )
              continue;
            if (victim !== target) {
              if (this.blastBlocked(hit.pickedPoint, position, victim))
                continue;
            }
            const before = victim.hp;
            victim.damage(
              victim === target
                ? victim.kind === "core"
                  ? 250
                  : WEAPONS.bazooka.damage
                : Math.max(1, Math.round(90 * (1 - distance / 4))),
            );
            if (victim.hp < before)
              this.onHit(victim, before - victim.hp, "bazooka");
          }
          this.onImpact(hit.pickedPoint);
          this.player.world.explosions.burst(
            hit.pickedPoint,
            "#ffb34f",
            1.5,
            "bazookaExplosion",
            "normal",
          );
        }
        for (const smoke of this.visuals ? [false, true] : []) {
          const mesh = MeshBuilder.CreateSphere(
            smoke ? "rocket smoke" : "burning rocket trail",
            { diameter: smoke ? 0.16 : 0.09, segments: 4 },
            scene,
          );
          mesh.position.copyFrom(
            rocket.mesh.position.subtract(rocket.direction.scale(0.5)),
          );
          mesh.isPickable = false;
          const material = this.player.world
            .mat(smoke ? "#778085" : "#ff8a32", !smoke)
            .clone("rocket trail fade");
          material.alpha = smoke ? 0.25 : 0.8;
          material.disableDepthWrite = true;
          mesh.material = material;
          const life = smoke ? 0.9 : 0.3;
          this.trail.push({ mesh, smoke, life, maxLife: life });
        }
        rocket.mesh.position.copyFrom(next);
        if (hit?.hit || rocket.distance >= 40) {
          rocket.mesh.dispose();
          this.rockets.splice(this.rockets.indexOf(rocket), 1);
          break;
        }
      }
    }
  }
}
