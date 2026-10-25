import { FilmedImpacts, type FilmedImpactKind } from "./filmedImpacts";

import type { MuzzleWeapon } from "./muzzleFlash";
import { MuzzleFlashes } from "./muzzleFlash";
import type { ExplosionPack } from "./cc0Comparison";
import { SpriteExplosions, localSpriteVFX } from "./spriteExplosions";
import {
  Mesh,
  MeshBuilder,
  PointLight,
  StandardMaterial,
  Vector3,
  Color3,
} from "@babylonjs/core";
import type { World } from "../map/builder";
export type ExplosionStyle = "normal" | "large" | "plasma";
export function explosionPresentation(
  power: number,
  sound?: string,
  style?: ExplosionStyle,
) {
  return {
    power:
      style === "normal"
        ? 1
        : style === "large" || style === "plasma"
          ? 2.2
          : power,
    plasma: style === "plasma" || sound === "plasmaMine",
  };
}
interface Particle {
  mesh: Mesh;
  sharedTextures?: boolean;
  velocity: Vector3;
  spin: Vector3;
  life: number;
  maxLife: number;
  kind: "debris" | "smoke" | "flash" | "ring" | "spawn";
}
export class Explosions {
  particles: Particle[] = [];
  visuals = true;
  amount = 1;
  random: () => number = Math.random;
  spriteMode = false;
  private sprites?: SpriteExplosions;
  private muzzleFlashes?: MuzzleFlashes;
  private filmedImpacts?: FilmedImpacts;
  private lightPool: {
    light: PointLight;
    life: number;
    duration: number;
    power: number;
  }[] = [];
  private prepareLights() {
    if (this.lightPool.length) return;
    for (let i = 0; i < 2; i++) {
      const light = new PointLight(
        `pooled explosion light ${i}`,
        Vector3.Zero(),
        this.world.scene,
      );
      light.intensity = 0;
      light.range = 6;
      light.specular = Color3.Black();
      // Reserve stable slots even while dark. Never toggle enabled state or receiver lists.
      light.renderPriority = 10;
      this.lightPool.push({ light, life: 0, duration: 0.12, power: 3 });
    }
  }
  private light(
    position: Vector3,
    plasma: boolean,
    duration: number,
    power: number,
    range: number,
  ) {
    this.prepareLights();
    const slot = this.lightPool.reduce((a, b) => (a.life <= b.life ? a : b));
    slot.light.position.copyFrom(position);
    slot.light.diffuse.copyFromFloats(
      plasma ? 0.875 : 1,
      plasma ? 0.44 : 0.77,
      plasma ? 1 : 0.49,
    );
    slot.light.range = range;
    slot.life = slot.duration = duration;
    slot.power = power;
    slot.light.intensity = power;
    if (!this.lights.includes(slot)) this.lights.push(slot);
  }
  prepare(position: Vector3) {
    if (!this.visuals) return;
    this.prepareLights();
    this.muzzleFlashes ??= new MuzzleFlashes(this.world.scene);
    this.muzzleFlashes.prepare(position);
    this.filmedImpacts ??= new FilmedImpacts(this.world.scene);
    this.filmedImpacts.prepare(position);
  }
  /** Rehearse the real effect path while keeping sound, shake and damage callbacks silent. */
  rehearse(position: Vector3, style: ExplosionStyle) {
    const notify = this.onBurst;
    this.onBurst = () => {};
    try {
      this.burst(
        position,
        "#ffcf56",
        style === "normal" ? 1 : 2.2,
        style === "plasma" ? "plasmaMine" : "bazookaExplosion",
        style,
      );
    } finally {
      this.onBurst = notify;
    }
  }

  filmedImpact(kind: FilmedImpactKind, position: Vector3) {
    if (!this.visuals) return;
    this.filmedImpacts ??= new FilmedImpacts(this.world.scene);
    this.filmedImpacts.emit(kind, position);
  }
  setSpriteMode(enabled: boolean) {
    this.update(10);
    this.spriteMode = enabled;
    if (enabled) this.sprites ??= new SpriteExplosions(this.world.scene);
  }
  setExplosionPack(pack: ExplosionPack) {
    this.setSpriteMode(true);
    if (this.sprites) this.sprites.preparePack(pack);
  }
  muzzle(
    position: Vector3,
    energy = false,
    direction?: Vector3,
    size = 1,
    weapon?: MuzzleWeapon,
  ) {
    if (this.visuals && direction) {
      this.muzzleFlashes ??= new MuzzleFlashes(this.world.scene);
      this.muzzleFlashes.emit(position, direction, energy, size, weapon);
      this.world.lighting?.pulse(position, weapon === "huntingRifle", energy);
      return true;
    }
    if (!this.visuals || !this.spriteMode || !this.sprites) return false;
    this.sprites.muzzle(position, energy);
    return true;
  }
  impact(
    position: Vector3,
    material = "metal",
    destroyed = false,
    strength = 1,
  ) {
    if (!this.visuals || !this.spriteMode || !this.sprites) return false;
    this.sprites.impact(position, material, destroyed, this.amount, strength);
    return true;
  }
  lights: { light: PointLight; life: number }[] = [];
  constructor(
    public world: World,
    public onBurst: (
      position: Vector3,
      power: number,
      sound?: string,
      style?: ExplosionStyle,
    ) => void = () => {},
  ) {
    if (localSpriteVFX()) this.setExplosionPack("hybrid");
  }
  burst(
    position: Vector3,
    color: string,
    power = 1,
    sound?: string,
    style?: ExplosionStyle,
  ) {
    if (!this.visuals) {
      this.onBurst(position, power, sound, style);
      return;
    }
    if (this.spriteMode && this.sprites) {
      const presentation = explosionPresentation(power, sound, style);
      const plasma = presentation.plasma;
      const detail = this.sprites.burst(
        position,
        color,
        presentation.power,
        plasma,
        this.amount,
        this.random,
      );
      if (detail.light) this.light(position, plasma, 0.12, 3, 6);
      this.onBurst(position, power, sound, style);
      return;
    }
    // Bound transient GPU resources during rapid destruction.
    while (this.particles.length > 220) this.remove(this.particles.shift()!);
    const scene = this.world.scene;
    const plasma = sound === "plasmaMine";
    const add = (
      mesh: Mesh,
      kind: Particle["kind"],
      life: number,
      velocity = Vector3.Zero(),
    ) => {
      mesh.position.copyFrom(position);
      mesh.isPickable = false;
      this.particles.push({
        mesh,
        kind,
        life,
        maxLife: life,
        velocity,
        spin: new Vector3(
          this.random() * 8,
          this.random() * 8,
          this.random() * 8,
        ),
      });
    };
    const flash = MeshBuilder.CreateSphere(
      "explosion flash",
      { diameter: 1, segments: 6 },
      scene,
    );
    flash.material = this.world
      .mat(plasma ? "#b9f7ff" : "#ffca70", true)
      .clone("burst material");
    add(flash, "flash", 0.22);
    const ring = MeshBuilder.CreateTorus(
      "shockwave",
      { diameter: 1, thickness: 0.055, tessellation: 40 },
      scene,
    );
    ring.material = this.world
      .mat(plasma ? "#ff55c3" : "#ffe8ad", true)
      .clone("ring material");
    add(ring, "ring", 0.45);
    ring.position.y = 0.12;
    for (let i = 0; i < Math.ceil(22 * this.amount); i++) {
      const chunk = MeshBuilder.CreateBox(
        "flying debris",
        {
          width: 0.12 + this.random() * 0.3,
          height: 0.1 + this.random() * 0.15,
          depth: 0.12 + this.random() * 0.25,
        },
        scene,
      );
      chunk.material = this.world
        .mat(
          plasma
            ? i % 3 === 0
              ? "#63eaff"
              : i % 3 === 1
                ? "#ff55c3"
                : "#b7c9cf"
            : i % 4 === 0
              ? "#ffc068"
              : color,
          plasma && i % 3 !== 2,
        )
        .clone("debris material");
      const a = this.random() * Math.PI * 2,
        speed = (2 + this.random() * 5) * power;
      add(
        chunk,
        "debris",
        1.1 + this.random() * 0.6,
        new Vector3(
          Math.cos(a) * speed,
          3 + this.random() * 5,
          Math.sin(a) * speed,
        ),
      );
    }
    for (let i = 0; i < Math.ceil(8 * this.amount); i++) {
      const smoke = MeshBuilder.CreateSphere(
        "smoke puff",
        { diameter: 0.5 + this.random() * 0.4, segments: 5 },
        scene,
      );
      const mat = new StandardMaterial("smoke material", scene);
      mat.diffuseColor = Color3.FromHexString(
        plasma
          ? i % 2
            ? "#69527d"
            : "#7e8faa"
          : i % 2
            ? "#45515b"
            : "#859393",
      );
      mat.specularColor = Color3.Black();
      mat.alpha = 0.6;
      smoke.material = mat;
      add(
        smoke,
        "smoke",
        0.7 + this.random() * 0.6,
        new Vector3(
          (this.random() - 0.5) * 3,
          1 + this.random() * 2,
          (this.random() - 0.5) * 3,
        ),
      );
    }
    this.light(position, plasma, 0.18, 5, 8);
    this.onBurst(position, power, sound, style);
  }
  playerDeath(position: Vector3, teamColor: string) {
    while (this.particles.length > 220) this.remove(this.particles.shift()!);
    for (let i = 0; i < Math.ceil(30 * this.amount); i++) {
      const mesh = MeshBuilder.CreateBox(
        "player fragment",
        { size: 0.12 + this.random() * 0.18 },
        this.world.scene,
      );
      mesh.position.copyFrom(
        position.add(
          new Vector3(
            (this.random() - 0.5) * 0.55,
            0.3 + this.random() * 1.4,
            (this.random() - 0.5) * 0.4,
          ),
        ),
      );
      mesh.material = this.world
        .mat(i % 3 === 0 ? teamColor : i % 3 === 1 ? "#efdfbd" : "#253a4c")
        .clone("player fragment fade");
      mesh.isPickable = false;
      const life = 1.4 + this.random() * 0.8;
      this.particles.push({
        mesh,
        kind: "debris",
        life,
        maxLife: life,
        velocity: new Vector3(
          (this.random() - 0.5) * 7,
          2 + this.random() * 4,
          (this.random() - 0.5) * 7,
        ),
        spin: new Vector3(
          this.random() * 8,
          this.random() * 8,
          this.random() * 8,
        ),
      });
    }
  }
  playerSpawn(position: Vector3, color: string) {
    const ring = MeshBuilder.CreateTorus(
      "spawn energy ring",
      { diameter: 0.6, thickness: 0.06, tessellation: 40 },
      this.world.scene,
    );
    ring.position.copyFrom(position.add(new Vector3(0, 0.08, 0)));
    ring.material = this.world.mat(color, true).clone("spawn ring fade");
    ring.isPickable = false;
    this.particles.push({
      mesh: ring,
      kind: "ring",
      life: 0.8,
      maxLife: 0.8,
      velocity: Vector3.Zero(),
      spin: Vector3.Zero(),
    });
    for (let i = 0; i < Math.ceil(22 * this.amount); i++) {
      const mesh = MeshBuilder.CreateSphere(
        "spawn energy particle",
        { diameter: 0.08, segments: 4 },
        this.world.scene,
      );
      const angle = (i / 22) * Math.PI * 2;
      mesh.position.copyFrom(
        position.add(
          new Vector3(
            Math.cos(angle) * 0.65,
            this.random() * 0.5,
            Math.sin(angle) * 0.65,
          ),
        ),
      );
      mesh.material = this.world.mat(color, true).clone("spawn particle fade");
      mesh.isPickable = false;
      const life = 0.7 + this.random() * 0.5;
      this.particles.push({
        mesh,
        kind: "spawn",
        life,
        maxLife: life,
        velocity: new Vector3(0, 1.5 + this.random(), 0),
        spin: Vector3.Zero(),
      });
    }
  }
  private remove(p: Particle) {
    if (p.sharedTextures) {
      const materials = new Set([
        p.mesh.material,
        ...p.mesh.getChildMeshes().map((m) => m.material),
      ]);
      p.mesh.dispose(false, false);
      for (const material of materials) material?.dispose(false, false);
    } else p.mesh.dispose(false, true);
  }
  update(dt: number) {
    this.sprites?.update(dt);
    this.muzzleFlashes?.update(dt);
    this.filmedImpacts?.update(dt);
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        this.remove(p);
        continue;
      }
      const age = 1 - p.life / p.maxLife;
      const mat = p.mesh.material as StandardMaterial;
      if (p.kind === "debris") {
        p.velocity.y -= 15 * dt;
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        p.mesh.rotation.addInPlace(p.spin.scale(dt));
        if (p.mesh.position.y < 0.12) {
          p.mesh.position.y = 0.12;
          p.velocity.y = Math.abs(p.velocity.y) * 0.25;
          p.velocity.x *= 0.65;
          p.velocity.z *= 0.65;
        }
        mat.alpha = Math.min(1, p.life * 3);
      } else if (p.kind === "spawn") {
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        mat.alpha = 1 - age;
      } else if (p.kind === "smoke") {
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        p.mesh.scaling.setAll(1 + age * 3);
        mat.alpha = (1 - age) * 0.48;
      } else {
        p.mesh.scaling.setAll(p.kind === "ring" ? 1 + age * 9 : 0.3 + age * 4);
        mat.alpha = 1 - age;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const l of this.lights) {
      l.life -= dt;
      const slot = l as (typeof this.lightPool)[number];
      l.light.intensity = Math.max(0, l.life / slot.duration) * slot.power;
    }
    this.lights = this.lights.filter((l) => l.life > 0);
  }
}
