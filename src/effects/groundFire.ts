import type { CombatLighting } from "./combatLighting";
import {
  Color4,
  Sprite,
  SpriteManager,
  Vector3,
  Constants,
  type Scene,
} from "@babylonjs/core";
import { nearView, viewPlanes } from "../game/viewRegion";
import { FILMED_FIRE, groundFireOpacity, type FireFilm } from "./filmedFire";
/** A bounded, decorative pool; never changes collision or explosion damage. */
export class GroundFires {
  private manager?: SpriteManager;
  private pool: { sprite: Sprite; age: number; phase: number }[] = [];
  constructor(
    private scene: Scene,
    private film: FireFilm | undefined = FILMED_FIRE.ground,
    private lighting?: CombatLighting,
  ) {
    if (this.film) {
      this.manager = new SpriteManager(
        "filmed ground fire pool",
        this.film.url,
        8,
        this.film.cellSize,
        this.scene,
      );
      this.manager.isPickable = false;
      this.manager.disableDepthWrite = true;
      this.manager.blendMode = Constants.ALPHA_COMBINE;
    }
  }
  get count() {
    return this.pool.filter((f) => f.age < 5).length;
  }
  emit(position: Vector3, power: number) {
    if (!this.film || !this.manager) return;
    let fire = this.pool.find((f) => f.age >= 5);
    if (!fire && this.pool.length >= 8)
      fire = this.pool.reduce((a, b) => (a.age > b.age ? a : b));
    if (!fire) {
      const sprite = new Sprite("post explosion filmed fire", this.manager);
      sprite.isPickable = false;
      fire = { sprite, age: 5, phase: 0 };
      this.pool.push(fire);
    }
    fire.age = 0;
    fire.phase = Math.floor(Math.random() * this.film.frames);
    fire.sprite.position.set(position.x, 0.9, position.z);
    fire.sprite.width = Math.min(5, 2.5 + power * 0.4);
    fire.sprite.height = 1.8;
    fire.sprite.color = new Color4(1, 1, 1, 1);
    fire.sprite.isVisible = true;
  }
  update(dt: number) {
    if (!this.film || !this.pool.length) return;
    const camera = this.scene.activeCamera,
      planes = camera ? viewPlanes(camera) : undefined;
    for (const fire of this.pool) {
      fire.age += dt;
      const alpha = groundFireOpacity(fire.age);
      fire.sprite.isVisible =
        alpha > 0 && (!planes || nearView(planes, fire.sprite.position, 3, 0));
      fire.sprite.color.a = alpha;
      if (fire.sprite.isVisible)
        this.lighting?.afterburn(fire.sprite.position, 1.9 * alpha);
      const rate =
        camera &&
        Vector3.DistanceSquared(camera.globalPosition, fire.sprite.position) >
          2500
          ? 8
          : this.film.fps;
      const playbackTime = Math.floor(fire.age * rate) / rate;
      fire.sprite.cellIndex =
        (Math.floor(playbackTime * this.film.fps) + fire.phase) %
        this.film.frames;
    }
  }
}
