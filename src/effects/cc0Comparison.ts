import {
  SpriteManager,
  Sprite,
  Vector3,
  Color4,
  Constants,
  type Scene,
} from "@babylonjs/core";
export type ExplosionPack = "kenney" | "sheet" | "more" | "smoke" | "hybrid";
/** Lazy, bounded pools for the local CC0 asset comparison. */
export class CC0Comparison {
  private pools = new Map<string, Sprite[]>();
  private active: {
    sprite: Sprite;
    key: string;
    age: number;
    life: number;
    frames: number;
    size: number;
  }[] = [];
  constructor(private scene: Scene) {
    scene.onDisposeObservable.addOnce(() => {
      this.active = [];
      this.pools.clear();
    });
  }
  get count() {
    return this.active.length;
  }
  private emit(
    key: string,
    position: Vector3,
    size: number,
    life: number,
    frames: number,
  ) {
    let pool = this.pools.get(key);
    if (!pool) {
      const manager = new SpriteManager(
        `CC0 ${key}`,
        `/vfx/cc0/${key}.png`,
        24,
        key === "cloud" || key === "puff" ? 512 : 128,
        this.scene,
      );
      manager.isPickable = false;
      manager.disableDepthWrite = true;
      manager.blendMode = Constants.ALPHA_COMBINE;
      pool = Array.from({ length: 24 }, () => {
        const s = new Sprite(`${key} pooled`, manager);
        s.isVisible = false;
        s.isPickable = false;
        return s;
      });
      this.pools.set(key, pool);
    }
    const sprite = pool.pop();
    if (!sprite) return;
    sprite.position.copyFrom(position);
    sprite.position.y += 0.5;
    sprite.cellIndex = 0;
    sprite.width = sprite.height = size;
    sprite.angle = 0;
    sprite.color = new Color4(1, 1, 1, 1);
    sprite.isVisible = true;
    this.active.push({ sprite, key, age: 0, life, frames, size });
  }
  burst(pack: ExplosionPack, position: Vector3, power: number) {
    if (pack === "sheet") this.emit("sheet", position, power * 3, 1.2, 64);
    if (pack === "more" || pack === "hybrid")
      this.emit("more", position, power * 3, 1.5, 60);
    if (pack === "smoke") this.emit("puff", position, power * 2.7, 0.7, 1);
    if (pack === "smoke" || pack === "hybrid")
      this.emit("cloud", position, power * 2.2, 1.8, 1);
  }
  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.isVisible = false;
        this.pools.get(p.key)!.push(p.sprite);
        this.active.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      p.sprite.cellIndex = Math.min(p.frames - 1, Math.floor(t * p.frames));
      if (p.frames === 1) {
        p.sprite.width = p.sprite.height = p.size * (0.6 + t * 0.8);
        p.sprite.color.a = (1 - t) * (p.key === "cloud" ? 0.6 : 1);
        p.sprite.position.y += dt * 0.4;
      }
    }
  }
}
