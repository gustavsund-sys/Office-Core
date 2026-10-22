import {
  Color4,
  Color3,
  StandardMaterial,
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
export function lookoutTracerWidth(
  distance: number,
  fov: number,
  renderHeight: number,
) {
  return Math.max(
    0.028,
    Math.min(
      0.12,
      ((2 * distance * Math.tan(fov / 2)) / Math.max(1, renderHeight)) * 1.15,
    ),
  );
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
export function impactCenterToRef(
  anchor: Vector3,
  size: number,
  angle: number,
  right: Vector3,
  up: Vector3,
  result: Vector3,
) {
  // The texture contact point is 34% below its centre, not at the image edge.
  const x = -Math.sin(angle) * size * 0.34;
  const y = Math.cos(angle) * size * 0.34;
  result.set(
    anchor.x + right.x * x + up.x * y,
    anchor.y + right.y * x + up.y * y,
    anchor.z + right.z * x + up.z * y,
  );
}
interface Impact {
  anchor: Vector3;
  sprite: Sprite;
  age: number;
  life: number;
  size: number;
  smoke: boolean;
}
/** Visual travel and deferred hits; target selection still happens on the firing frame. */
export class LookoutRounds {
  private tracerMaterial?: StandardMaterial;
  private right = new Vector3(1, 0, 0);
  private up = Vector3.Up();
  private rounds: Round[] = [];
  private impacts: Impact[] = [];
  private trails: { mesh: Mesh; life: number }[] = [];
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
    if (!this.tracerMaterial) {
      const material = new StandardMaterial("Lookout tracer glow", this.scene);
      material.disableLighting = true;
      material.emissiveColor = Color3.FromHexString("#ffe4a2");
      material.fogEnabled = false;
      this.tracerMaterial = material;
    }
    mesh.material = this.tracerMaterial;
    mesh.visibility = 1;
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
    const camera = this.scene.activeCamera;
    if (camera) {
      camera.getDirectionToRef(Vector3.RightReadOnly, this.right);
      camera.getDirectionToRef(Vector3.UpReadOnly, this.up);
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const trail = this.trails[i];
      trail.life -= dt;
      if (trail.life <= 0) {
        releaseEffect(trail.mesh);
        this.trails.splice(i, 1);
      } else trail.mesh.visibility = trail.life / 0.075;
    }
    for (const round of [...this.rounds]) {
      round.age += dt;
      if (round.age + 1e-7 >= round.duration) {
        this.rounds.splice(this.rounds.indexOf(round), 1);
        // Keep a short, depth-tested afterimage; hit timing remains unchanged.
        const tail = round.distance * 0.25;
        round.mesh.position.copyFrom(
          round.start.add(round.direction.scale((round.distance + tail) / 2)),
        );
        round.mesh.scaling.y = Math.max(0.01, round.distance - tail);
        if (camera) {
          const width = lookoutTracerWidth(
            Vector3.Distance(camera.globalPosition, round.mesh.position),
            camera.fov,
            this.scene.getEngine().getRenderHeight(),
          );
          round.mesh.scaling.x = round.mesh.scaling.z = width;
        }
        this.trails.push({ mesh: round.mesh, life: 0.075 });
        round.arrive();
        if (round.surface && this.visualImpacts)
          this.impact(round.end, round.normal);
        continue;
      }
      const head = (round.distance * round.age) / round.duration;
      const tail = Math.max(0, head - Math.max(6, round.distance * 0.65));
      round.mesh.position.copyFrom(
        round.start.add(round.direction.scale((head + tail) / 2)),
      );
      round.mesh.scaling.y = Math.max(0.01, head - tail);
      if (camera) {
        const distance = Vector3.Distance(
          camera.globalPosition,
          round.mesh.position,
        );
        const width = lookoutTracerWidth(
          distance,
          camera.fov,
          this.scene.getEngine().getRenderHeight(),
        );
        round.mesh.scaling.x = round.mesh.scaling.z = width;
      }
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
      if (effect.smoke) {
        effect.sprite.position.y += dt * 0.35;
      } else {
        impactCenterToRef(
          effect.anchor,
          effect.sprite.size,
          effect.sprite.angle,
          this.right,
          this.up,
          effect.sprite.position,
        );
      }
    }
  }
  private impact(position: Vector3, normal: Vector3) {
    const distance = this.scene.activeCamera
      ? Vector3.Distance(position, this.scene.activeCamera.globalPosition)
      : 0;
    const size =
      Math.max(0.4, Math.min(3, distance * 0.03)) *
      (0.85 + Math.random() * 0.3);
    const anchor = position.add(normal.scale(0.04));
    this.emit(anchor, size, 0.17 + Math.random() * 0.06, false);
    this.emit(anchor.add(this.up.scale(size * 0.2)), size * 1.15, 0.4, true);
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
    sprite.angle = smoke
      ? Math.random() * Math.PI * 2
      : (Math.random() - 0.5) * 0.5;
    if (!smoke)
      impactCenterToRef(
        position,
        size,
        sprite.angle,
        this.right,
        this.up,
        sprite.position,
      );
    sprite.color = smoke
      ? new Color4(0.65, 0.61, 0.51, 0.6)
      : new Color4(1, 0.84, 0.48, 1);
    sprite.isVisible = true;
    this.impacts.push({
      sprite,
      anchor: position.clone(),
      age: 0,
      life,
      size,
      smoke,
    });
  }
  clear() {
    for (const round of this.rounds) releaseEffect(round.mesh);
    this.rounds = [];
    for (const trail of this.trails) releaseEffect(trail.mesh);
    this.trails = [];
    for (const effect of this.impacts) {
      effect.sprite.isVisible = false;
      this.pools.get(effect.smoke)!.push(effect.sprite);
    }
    this.impacts = [];
  }
}
