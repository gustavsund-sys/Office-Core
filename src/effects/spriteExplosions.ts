import { CC0Comparison, type ExplosionPack } from "./cc0Comparison";
import {
  SpriteManager,
  Sprite,
  Vector3,
  Color3,
  Color4,
  Constants,
  Camera,
  type Scene,
} from "@babylonjs/core";

type Kind = "fire" | "smoke" | "spark" | "ring" | "muzzle" | "debris";
interface Mote {
  sprite: Sprite;
  kind: Kind;
  velocity: Vector3;
  age: number;
  life: number;
  size: number;
  spin: number;
  color: Color3;
}
/** Sprite effects are the browser default; the comparison can request classic VFX. */
export function localSpriteVFX() {
  return (
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("explosions") !== "classic"
  );
}
export function explosionDetail(pixels: number, quality: number) {
  const lod = pixels < 25 ? 0.25 : pixels < 70 ? 0.55 : 1;
  const density = Math.max(0.08, Math.min(1, quality) * lod);
  return {
    fire: Math.max(1, Math.ceil(5 * density)),
    smoke: Math.ceil(6 * density),
    spark: Math.ceil(22 * density),
    ring: 1,
    light: density >= 0.55,
  };
}
export class SpriteExplosions {
  pack: ExplosionPack = "kenney";
  private comparison: CC0Comparison;
  private managers = new Map<Kind, SpriteManager>();
  private free = new Map<Kind, Sprite[]>();
  private active: Mote[] = [];
  constructor(private scene: Scene) {
    this.comparison = new CC0Comparison(scene);
    for (const [kind, capacity] of [
      ["fire", 64],
      ["smoke", 96],
      ["spark", 192],
      ["ring", 24],
      ["muzzle", 48],
      ["debris", 96],
    ] as const) {
      const manager = new SpriteManager(
        `LOD ${kind}`,
        `/vfx/kenney/${kind}.png`,
        capacity,
        512,
        scene,
      );
      manager.isPickable = false;
      manager.disableDepthWrite = true;
      manager.blendMode =
        kind === "smoke" || kind === "debris"
          ? Constants.ALPHA_COMBINE
          : Constants.ALPHA_ADD;
      this.managers.set(kind, manager);
      const pool: Sprite[] = [];
      for (let i = 0; i < capacity; i++) {
        const sprite = new Sprite(`${kind} pooled`, manager);
        sprite.isVisible = false;
        sprite.isPickable = false;
        pool.push(sprite);
      }
      this.free.set(kind, pool);
    }
    scene.onDisposeObservable.addOnce(() => {
      this.active.length = 0;
      this.free.clear();
      this.managers.clear();
    });
  }
  preparePack(pack: ExplosionPack) {
    this.pack = pack;
    this.comparison.burst(pack, Vector3.Zero(), 0);
    this.comparison.update(10);
  }
  get count() {
    return this.active.length;
  }
  burst(
    position: Vector3,
    color: string,
    power: number,
    plasma: boolean,
    quality: number,
    random: () => number,
  ) {
    const camera = this.scene.activeCamera;
    const height = this.scene.getEngine().getRenderHeight();
    const diameter = 3 * power;
    const pixels =
      camera?.mode === Camera.ORTHOGRAPHIC_CAMERA
        ? (diameter * height) /
          Math.max(
            1,
            Math.abs((camera.orthoTop ?? 15) - (camera.orthoBottom ?? -15)),
          )
        : (diameter * height) /
          Math.max(
            1,
            2 *
              Math.tan((camera?.fov ?? 0.8) / 2) *
              Vector3.Distance(
                position,
                camera?.globalPosition ?? Vector3.Zero(),
              ),
          );
    const detail = explosionDetail(pixels, quality);
    if (!plasma && this.pack !== "kenney")
      this.comparison.burst(this.pack, position, power);
    const alternate = !plasma && this.pack !== "kenney";
    const heavy = !plasma && power >= 1.5;
    const visualPower = power * (heavy ? 1.3 : 1);
    const tint = Color3.FromHexString(plasma ? "#ff62d9" : color);
    const emit = (
      kind: Kind,
      size: number,
      life: number,
      velocity: Vector3,
      tint: Color3,
    ) => {
      const sprite = this.free.get(kind)!.pop();
      if (!sprite) return;
      sprite.isVisible = true;
      sprite.position.copyFrom(position);
      sprite.position.y += 0.35;
      sprite.width = sprite.height = size;
      sprite.angle = random() * Math.PI * 2;
      sprite.color = new Color4(tint.r, tint.g, tint.b, 1);
      this.active.push({
        sprite,
        kind,
        velocity,
        age: 0,
        life,
        size,
        spin: (random() - 0.5) * 2,
        color: tint,
      });
    };
    emit("ring", power, 0.4, Vector3.Zero(), tint);
    for (let i = 0; i < (alternate ? 0 : detail.fire); i++) {
      const a = random() * Math.PI * 2;
      emit(
        "fire",
        visualPower * (0.8 + random() * 0.7),
        (heavy ? 0.6 : 0.35) + random() * 0.35,
        new Vector3(Math.cos(a) * power, 0.8, Math.sin(a) * power),
        plasma && i % 2 ? Color3.FromHexString("#63edff") : tint,
      );
    }
    for (let i = 0; i < (alternate ? 0 : detail.smoke); i++) {
      emit(
        "smoke",
        visualPower * (0.8 + random() * 0.6),
        1 + random() * 0.7,
        new Vector3(
          (random() - 0.5) * power * 2,
          1 + random(),
          (random() - 0.5) * power * 2,
        ),
        Color3.FromHexString(plasma ? "#70667f" : "#63717a"),
      );
    }
    for (let i = 0; i < detail.spark; i++) {
      const a = random() * Math.PI * 2,
        speed = (2 + random() * 5) * power;
      emit(
        "spark",
        0.12 + random() * 0.14,
        0.4 + random() * 0.7,
        new Vector3(Math.cos(a) * speed, 2 + random() * 4, Math.sin(a) * speed),
        plasma && i % 2
          ? Color3.FromHexString("#63edff")
          : Color3.FromHexString("#ffbc5e"),
      );
    }
    for (let i = 0; i < Math.ceil(detail.spark / 3); i++) {
      emit(
        "debris",
        0.16 + random() * 0.2,
        0.7 + random() * 0.6,
        new Vector3(
          (random() - 0.5) * power * 7,
          2 + random() * 4,
          (random() - 0.5) * power * 7,
        ),
        Color3.FromHexString("#82776b"),
      );
    }
    return detail;
  }
  private emitSmall(
    kind: Kind,
    position: Vector3,
    size: number,
    life: number,
    velocity: Vector3,
    color: string,
  ) {
    const sprite = this.free.get(kind)!.pop();
    if (!sprite) return;
    const tint = Color3.FromHexString(color);
    sprite.isVisible = true;
    sprite.position.copyFrom(position);
    sprite.width = sprite.height = size;
    sprite.angle = Math.random() * Math.PI * 2;
    sprite.color = new Color4(tint.r, tint.g, tint.b, 1);
    this.active.push({
      sprite,
      kind,
      velocity,
      age: 0,
      life,
      size,
      spin: (Math.random() - 0.5) * 8,
      color: tint,
    });
  }
  muzzle(position: Vector3, energy = false) {
    this.emitSmall(
      "muzzle",
      position,
      energy ? 0.55 : 0.42,
      0.065,
      Vector3.Zero(),
      energy ? "#ff6fcf" : "#fff0ba",
    );
  }
  impact(
    position: Vector3,
    material: string,
    destroyed: boolean,
    quality: number,
    strength = 1,
  ) {
    const camera = this.scene.activeCamera;
    const distance = camera
      ? Vector3.Distance(position, camera.globalPosition)
      : 0;
    const density =
      Math.max(0.1, quality) * (distance > 45 ? 0.3 : distance > 25 ? 0.6 : 1);
    const metal = material === "metal";
    const color =
      material === "glass"
        ? "#bdeefa"
        : material === "wood"
          ? "#d3ae79"
          : "#aaa69a";
    this.emitSmall(
      "smoke",
      position,
      0.35 * Math.sqrt(strength),
      0.4,
      new Vector3(0, 0.4, 0),
      color,
    );
    for (let i = 0; i < Math.ceil((destroyed ? 14 : 6) * density); i++) {
      const velocity = new Vector3(
        (Math.random() - 0.5) * 5,
        1 + Math.random() * 3,
        (Math.random() - 0.5) * 5,
      );
      this.emitSmall(
        metal ? "spark" : "debris",
        position,
        metal ? 0.08 : 0.12,
        destroyed ? 0.9 : 0.4,
        velocity,
        metal ? "#ffe4a0" : color,
      );
    }
  }
  update(dt: number) {
    this.comparison.update(dt);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.isVisible = false;
        this.free.get(p.kind)!.push(p.sprite);
        this.active.splice(i, 1);
        continue;
      }
      const age = p.age / p.life;
      if (p.kind === "spark" || p.kind === "debris") p.velocity.y -= 12 * dt;
      p.sprite.position.x += p.velocity.x * dt;
      p.sprite.position.y += p.velocity.y * dt;
      p.sprite.position.z += p.velocity.z * dt;
      if (p.sprite.position.y < 0.08) {
        p.sprite.position.y = 0.08;
        p.velocity.y = Math.abs(p.velocity.y) * 0.15;
      }
      p.sprite.angle += p.spin * dt;
      const size =
        p.size *
        (p.kind === "ring"
          ? 1 + age * 8
          : p.kind === "smoke"
            ? 1 + age * 2
            : p.kind === "fire"
              ? 0.7 + age * 2
              : 1);
      p.sprite.width = size;
      p.sprite.height = p.kind === "spark" ? size * 2.5 : size;
      p.sprite.color.a = (1 - age) * (p.kind === "smoke" ? 0.42 : 1);
      if (p.kind === "fire") {
        p.sprite.color.g = p.color.g * (1 - age * 0.6);
        p.sprite.color.b = p.color.b * (1 - age * 0.7);
      }
    }
  }
}
