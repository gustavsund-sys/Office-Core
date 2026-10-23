import {
  Constants,
  Sprite,
  SpriteManager,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { nearView, viewPlanes } from "../game/viewRegion";

export type FilmedImpactKind = "rc" | "spark";
export const IMPACT_FILMS = {
  rc: { url: "/vfx/fire/gas-bomb-005c.webp", frames: 64, fps: 16, size: 12 },
  spark: {
    url: "/vfx/fire/spark-ground-002a.webp",
    frames: 40,
    fps: 12,
    size: 3.5,
  },
};
/** Only actual floor contacts count; walls, bodies and misses never advance it. */
export class GroundHitCadence {
  private hits = 0;
  hit(position: Vector3, normal: Vector3) {
    if (position.y > 0.2 || normal.y < 0.8) return false;
    return ++this.hits % 5 === 0;
  }
  reset() {
    this.hits = 0;
  }
}
/** Small reusable sprite pools, playing once rather than looping the explosion. */
export class FilmedImpacts {
  private managers = new Map<FilmedImpactKind, SpriteManager>();
  private effects: {
    kind: FilmedImpactKind;
    sprite: Sprite;
    anchor: Vector3;
    age: number;
  }[] = [];
  constructor(private scene: Scene) {}
  emit(kind: FilmedImpactKind, position: Vector3) {
    const film = IMPACT_FILMS[kind];
    let manager = this.managers.get(kind);
    if (!manager) {
      manager = new SpriteManager(
        `filmed ${kind}`,
        film.url,
        12,
        256,
        this.scene,
      );
      manager.isPickable = false;
      manager.disableDepthWrite = true;
      manager.blendMode = Constants.ALPHA_COMBINE;
      this.managers.set(kind, manager);
    }
    let effect = this.effects.find(
      (e) => e.kind === kind && e.age >= film.frames / film.fps,
    );
    if (!effect && this.effects.filter((e) => e.kind === kind).length >= 12)
      effect = this.effects
        .filter((e) => e.kind === kind)
        .reduce((a, b) => (a.age > b.age ? a : b));
    if (!effect) {
      effect = {
        kind,
        sprite: new Sprite(`filmed ${kind}`, manager),
        anchor: Vector3.Zero(),
        age: 0,
      };
      effect.sprite.isPickable = false;
      this.effects.push(effect);
    }
    effect.age = 0;
    effect.anchor.copyFrom(position);
    effect.sprite.position.copyFrom(position);
    effect.sprite.position.y += kind === "rc" ? 2.2 : 0.8;
    effect.sprite.size = film.size;
    effect.sprite.cellIndex = 0;
    effect.sprite.isVisible = true;
  }
  update(dt: number) {
    const camera = this.scene.activeCamera;
    const planes = camera ? viewPlanes(camera) : undefined;
    for (const e of this.effects) {
      e.age += dt;
      const film = IMPACT_FILMS[e.kind];
      if (camera && e.kind === "rc") {
        // Source detonation starts at (0.33,0.88), away from atlas centre.
        e.sprite.position
          .copyFrom(e.anchor)
          .addInPlace(
            camera.getDirection(Vector3.Right()).scale(film.size * 0.17),
          )
          .addInPlace(
            camera.getDirection(Vector3.Up()).scale(film.size * 0.38),
          );
      }
      e.sprite.color.a = Math.min(
        1,
        Math.max(0, (film.frames / film.fps - e.age) / 0.4),
      );
      e.sprite.cellIndex = Math.min(
        film.frames - 1,
        Math.floor(e.age * film.fps),
      );
      e.sprite.isVisible =
        e.age < film.frames / film.fps &&
        (!planes || nearView(planes, e.sprite.position, film.size, 0));
    }
  }
}
