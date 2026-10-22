import {
  Color4,
  Constants,
  Mesh,
  Sprite,
  SpriteManager,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { beam, releaseEffect } from "./effectPool";

export function lookoutFlightTime(distance: number) {
  return Math.min(0.1, Math.max(0, distance) / 800);
}
interface Round {
  mesh: Mesh;
  start: Vector3;
  end: Vector3;
  direction: Vector3;
  distance: number;
  duration: number;
  age: number;
  surface: boolean;
  arrive: () => void;
  normal: Vector3;
}
interface Impact {
  sprite: Sprite;
  age: number;
  life: number;
  size: number;
  smoke: boolean;
}
/** Visual travel and deferred hits; target selection still happens on the firing frame. */
export class LookoutRounds {
  private rounds: Round[] = [];
  private impacts: Impact[] = [];
  private pools = new Map<boolean, Sprite[]>();
  private managers = new Map<boolean, SpriteManager>();
  constructor(
    private scene: Scene,
    private visualImpacts = true,
  ) {}
  get pending() {
    return this.rounds.length;
  }
  launch(
    start: Vector3,
    end: Vector3,
    surface: boolean,
    arrive: () => void,
    normal = Vector3.Up(),
  ) {
    const distance = Vector3.Distance(start, end),
      direction = end.subtract(start).normalize();
    const mesh = beam(
      this.scene,
      start,
      start.add(direction.scale(Math.min(0.12, distance))),
      0.028,
    );
    // Shared material is supplied by the caller's world, avoiding one material per shot.
    const shot: Round = {
      mesh,
      start: start.clone(),
      end: end.clone(),
      direction,
      distance,
      duration: lookoutFlightTime(distance),
      age: 0,
      surface,
      arrive,
      normal: normal.clone(),
    };
    this.rounds.push(shot);
    return mesh;
  }
  update(dt: number) {
    for (const round of [...this.rounds]) {
      round.age += dt;
      if (round.age + 1e-7 >= round.duration) {
        this.rounds.splice(this.rounds.indexOf(round), 1);
        releaseEffect(round.mesh);
        round.arrive();
        if (round.surface && this.visualImpacts)
          this.impact(
            round.end.subtract(round.direction.scale(0.08)),
            round.normal,
          );
        continue;
      }
      const head = (round.distance * round.age) / round.duration;
      const tail = Math.max(
        0,
        head - Math.min(3, Math.max(0.12, round.distance * 0.15)),
      );
      round.mesh.position.copyFrom(
        round.start.add(round.direction.scale((head + tail) / 2)),
      );
      round.mesh.scaling.y = Math.max(0.01, head - tail);
    }
    for (const effect of [...this.impacts]) {
      effect.age += dt;
      if (effect.age >= effect.life) {
        effect.sprite.isVisible = false;
        this.pools.get(effect.smoke)!.push(effect.sprite);
        this.impacts.splice(this.impacts.indexOf(effect), 1);
        continue;
      }
      const t = effect.age / effect.life;
      effect.sprite.size =
        effect.size * (effect.smoke ? 1 + t * 0.8 : 1 - t * 0.3);
      effect.sprite.color.a = (1 - t) * (effect.smoke ? 0.6 : 1);
      if (effect.smoke) effect.sprite.position.y += dt * 0.35;
    }
  }
  private impact(position: Vector3, normal: Vector3) {
    const distance = this.scene.activeCamera
      ? Vector3.Distance(position, this.scene.activeCamera.globalPosition)
      : 0;
    const size = Math.max(0.4, Math.min(3, distance * 0.03));
    this.emit(position.add(normal.scale(size * 0.4)), size, 0.2, false);
    this.emit(position.add(normal.scale(size * 0.45)), size * 1.15, 0.4, true);
  }
  private emit(position: Vector3, size: number, life: number, smoke: boolean) {
    if (!this.managers.has(smoke)) {
      const manager = new SpriteManager(
        `Lookout ${smoke ? "impact dust" : "impact flash"}`,
        `/vfx/kenney/${smoke ? "smoke" : "muzzle"}.png`,
        64,
        512,
        this.scene,
      );
      manager.isPickable = false;
      manager.disableDepthWrite = true;
      manager.blendMode = smoke ? Constants.ALPHA_COMBINE : Constants.ALPHA_ADD;
      // Retain depth testing, so flashes never show through cover. Mild flashes stay legible in Lookout fog.
      manager.fogEnabled = smoke;
      const pool: Sprite[] = [];
      for (let i = 0; i < 64; i++) {
        const sprite = new Sprite("Lookout impact", manager);
        sprite.isVisible = false;
        sprite.isPickable = false;
        pool.push(sprite);
      }
      this.managers.set(smoke, manager);
      this.pools.set(smoke, pool);
    }
    const sprite = this.pools.get(smoke)!.pop();
    if (!sprite) return;
    sprite.position.copyFrom(position);
    sprite.size = size;
    sprite.angle = smoke ? Math.random() * Math.PI * 2 : 0;
    sprite.color = smoke
      ? new Color4(0.65, 0.61, 0.51, 0.6)
      : new Color4(1, 0.84, 0.48, 1);
    sprite.isVisible = true;
    this.impacts.push({ sprite, age: 0, life, size, smoke });
  }
  clear() {
    for (const round of this.rounds) releaseEffect(round.mesh);
    this.rounds = [];
    for (const effect of this.impacts) {
      effect.sprite.isVisible = false;
      this.pools.get(effect.smoke)!.push(effect.sprite);
    }
    this.impacts = [];
  }
}
