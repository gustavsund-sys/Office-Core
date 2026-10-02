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
  id: WeaponId = "pistol";
  specialWeapon?: WeaponId;
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
  switchSlot(slot: 1 | 2) {
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
  };
  bazookaReserve = 0;
  get ammo() {
    return this.ammunition[this.id];
  }
  set ammo(value: number) {
    this.ammunition[this.id] = value;
  }
  addAmmo(id: WeaponId, amount: number) {
    if (id === "bazooka") {
      this.bazookaReserve += amount;
      if (
        this.id === "bazooka" &&
        this.ammo === 0 &&
        this.reloadRemaining === 0
      )
        this.reloadRemaining = 5;
    } else this.ammunition[id] += amount;
  }
  cooldown = 0;
  reloadRemaining = 0;
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
    public onHit: (target: Hittable, damage: number) => void,
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
    if (acquired) this.onCoreBusterAcquired();

    this.reloadRemaining = 0;
    this.burstRemaining = 0;
    if (id === "bazooka" && this.ammo === 0 && this.bazookaReserve > 0)
      this.reloadRemaining = 5;
  }
  update(c: PlayerCommand, dt: number) {
    if (this.player.hp <= 0) this.dropCoreBuster();
    for (const charge of [...this.charges]) {
      charge.timer -= dt;
      if (charge.timer <= 0) {
        const position = charge.mesh.position;
        for (const wall of this.player.world.destructibles) {
          if (
            wall.prop.kind === "coreDoor" &&
            wall.hp > 0 &&
            Vector3.Distance(position, wall.position) < 4
          ) {
            const damage = wall.hp;
            wall.damage(damage, "coreBuster");
            this.onHit(wall, damage);
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
      if (e.life <= 0) e.mesh.dispose();
    }
    this.effects = this.effects.filter((e) => e.life > 0);
    if (this.reloadRemaining > 0) {
      this.reloadRemaining = Math.max(0, this.reloadRemaining - dt);
      if (this.reloadRemaining === 0) {
        const loaded = Math.min(3, this.bazookaReserve);
        this.ammo = loaded;
        this.bazookaReserve -= loaded;
      }
      return;
    }
    if (this.ammo <= 0) {
      this.burstRemaining = 0;
      return;
    }
    const data = WEAPONS[this.id];
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
    const origin = this.player.root.position.add(new Vector3(0, 1.1, 0));
    const direction = c.shotTarget
      ? c.shotTarget.subtract(origin).normalize()
      : this.player.direction;
    if (this.id === "bazooka") {
      const mesh = rocketModel(this.player.world);
      const start = origin.add(direction.scale(0.45));
      mesh.position.copyFrom(start);
      mesh.rotationQuaternion = Quaternion.FromLookDirectionLH(
        direction,
        Vector3.Up(),
      );
      mesh.isPickable = false;
      this.rockets.push({
        mesh,
        origin: origin.clone(),
        start,
        direction,
        distance: 0,
      });
      this.onShot();
      if (--this.ammo === 0 && this.bazookaReserve > 0)
        this.reloadRemaining = 5;
      return;
    }
    const ray = new Ray(origin, direction, data.range);
    const hit = scene.pickWithRay(
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
    const start = origin.add(
      direction.scale(Math.min(0.65, Vector3.Distance(origin, end))),
    );
    this.onTrace(start, end);
    if (this.visuals) {
      const tracer =
        this.id === "pulseGun"
          ? MeshBuilder.CreateTube(
              "pulse beam",
              { path: [start, end], radius: 0.07, tessellation: 8 },
              scene,
            )
          : MeshBuilder.CreateLines("tracer", { points: [start, end] }, scene);
      if ("color" in tracer) tracer.color = Color3.FromHexString("#ffe4a5");
      if (this.id === "pulseGun")
        tracer.material = this.player.world.mat("#ff263e", true);

      tracer.isPickable = false;
      this.effects.push({ mesh: tracer, life: 0.065 });
      const flash = MeshBuilder.CreateSphere(
        "muzzle",
        { diameter: 0.23, segments: 4 },
        scene,
      );
      flash.position.copyFrom(start);
      flash.material = this.player.world.mat("#ffe8a1", true);
      flash.isPickable = false;
      this.effects.push({ mesh: flash, life: 0.045 });
    }
    if (hit?.hit) {
      this.onImpact(end);
      for (let i = 0; this.visuals && i < 5; i++) {
        const spark = MeshBuilder.CreateBox(
          "impact",
          { size: 0.065 + Math.random() * 0.07 },
          scene,
        );
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
        if (t.canDamageFrom(origin)) {
          const damage = Math.min(data.damage, t.hp);
          const before = t.hp;
          t.damage(data.damage);
          if (t.hp < before) this.onHit(t, damage);
        } else {
          this.onShield();
        }
      }
    }
    if (this.id !== "burstGun" || this.burstRemaining === 4) this.onShot();
    this.ammo--;
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
            if (!victim.canDamageFrom(rocket.origin)) continue;
            if (victim !== target) {
              const delta = position.subtract(hit.pickedPoint),
                length = delta.length();
              const obstruction =
                length > 0.15
                  ? scene.pickWithRay(
                      new Ray(
                        hit.pickedPoint.add(delta.normalizeToNew().scale(0.08)),
                        delta.normalizeToNew(),
                        length - 0.12,
                      ),
                      (mesh) =>
                        mesh.isEnabled() &&
                        mesh.metadata?.damageable !== victim &&
                        (!!mesh.metadata?.solid ||
                          mesh.metadata?.damageable?.prop?.kind === "coreDoor"),
                    )
                  : null;
              if (obstruction?.hit) continue;
            }
            const before = victim.hp;
            victim.damage(
              victim === target
                ? WEAPONS.bazooka.damage
                : Math.max(1, Math.round(90 * (1 - distance / 4))),
            );
            if (victim.hp < before) this.onHit(victim, before - victim.hp);
          }
          this.onImpact(hit.pickedPoint);
          this.player.world.explosions.burst(
            hit.pickedPoint,
            "#ffb34f",
            1.5,
            "bazookaExplosion",
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
