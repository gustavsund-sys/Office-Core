import {
  Color3,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  RawTexture,
  Ray,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";
import type { World } from "../map/builder";
import { BloodCadence } from "./bloodCadence";
import { shard, releaseEffect } from "../game/effectPool";

export class BloodStains {
  cadence = new BloodCadence();
  private mesh?: Mesh;
  private matrices = new Float32Array(16 * 64);
  count = 0;
  private particles: { mesh: Mesh; velocity: Vector3; life: number }[] = [];
  constructor(private world: World) {}
  hit(id: string, position: Vector3) {
    if (this.cadence.hit(id)) this.splat(position);
  }
  private prepare() {
    if (this.mesh) return;
    const scene = this.world.scene;
    const size = 128,
      data = new Uint8Array(size * size * 4);
    let seed = 8291;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const spots = [{ x: 0.5, y: 0.5, rx: 0.2, ry: 0.16 }];
    for (let i = 0; i < 45; i++) {
      const angle = random() * Math.PI * 2,
        distance = random() * 0.42;
      const radius = 0.008 + random() * 0.06;
      spots.push({
        x: 0.5 + Math.cos(angle) * distance,
        y: 0.5 + Math.sin(angle) * distance,
        rx: radius,
        ry: radius * (0.6 + random()),
      });
    }
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let alpha = 0;
        for (const spot of spots) {
          const r =
            ((x / size - spot.x) / spot.rx) ** 2 +
            ((y / size - spot.y) / spot.ry) ** 2;
          alpha = Math.max(alpha, Math.min(1, Math.max(0, (1 - r) * 8)));
        }
        const i = (y * size + x) * 4;
        data[i] = 90 + random() * 35;
        data[i + 1] = 8;
        data[i + 2] = 12;
        data[i + 3] = alpha * 220;
      }
    const texture = RawTexture.CreateRGBATexture(
      data,
      size,
      size,
      scene,
      true,
      false,
    );
    texture.hasAlpha = true;
    texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const mat = new StandardMaterial("persistent blood", scene);
    mat.diffuseTexture = texture;
    mat.useAlphaFromDiffuseTexture = true;
    mat.diffuseColor = Color3.White();
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    this.mesh = MeshBuilder.CreatePlane(
      "round blood stains",
      { size: 1 },
      scene,
    );
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = true;
    this.mesh.setEnabled(false);
  }
  private add(
    position: Vector3,
    normal: Vector3,
    scale: number,
    twist: number,
  ) {
    this.prepare();
    if ((this.count + 1) * 16 > this.matrices.length) {
      const buffer = new Float32Array(this.matrices.length * 2);
      buffer.set(this.matrices);
      this.matrices = buffer;
    }
    // Floor planes need a non-parallel up axis.
    const facing =
      Math.abs(normal.y) > 0.9
        ? Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2)
        : Quaternion.FromLookDirectionLH(normal.negate(), Vector3.Up());
    const orientation = facing.multiply(
      Quaternion.RotationAxis(Vector3.Forward(), twist),
    );
    Matrix.Compose(
      new Vector3(scale, scale, scale),
      orientation,
      position,
    ).copyToArray(this.matrices, this.count++ * 16);
    this.mesh!.thinInstanceSetBuffer("matrix", this.matrices, 16, false);
    this.mesh!.thinInstanceCount = this.count;
    this.mesh!.thinInstanceRefreshBoundingInfo();
    this.mesh!.setEnabled(true);
  }
  drop(position: Vector3) {
    if (this.world.authoritative) return;
    this.add(new Vector3(position.x + (Math.random() - 0.5) * 0.2, 0.071, position.z + (Math.random() - 0.5) * 0.2),
      Vector3.Up(), 0.3 * (0.95 + Math.random() * 0.3), Math.random() * Math.PI * 2);
  }
  splat(position: Vector3) {
    if (this.world.authoritative) return;
    const twist = Math.random() * Math.PI * 2;
    this.add(
      new Vector3(position.x, 0.07, position.z),
      Vector3.Up(),
      1.15 * (1 + Math.random() * 0.15),
      twist,
    );
    const origin = new Vector3(
      position.x,
      Math.min(1.35, Math.max(0.75, position.y)),
      position.z,
    );
    let nearest: ReturnType<typeof this.world.scene.pickWithRay> = null;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const hit = this.world.scene.pickWithRay(
        new Ray(origin, new Vector3(Math.sin(angle), 0, Math.cos(angle)), 2),
        (m) =>
          m.isEnabled() &&
          !!m.metadata?.solid &&
          /^(wall|column)$/.test(m.name),
      );
      if (hit?.hit && (!nearest?.hit || hit.distance < nearest.distance))
        nearest = hit;
    }
    if (nearest?.pickedPoint) {
      const normal =
        nearest.getNormal(true) ??
        origin.subtract(nearest.pickedPoint).normalize();
      this.add(
        nearest.pickedPoint.add(normal.scale(0.015)),
        normal,
        0.9 * (1 + Math.random() * 0.15),
        Math.random() * Math.PI * 2,
      );
    }
    for (let i = 0; i < 7; i++) {
      const mesh = shard(this.world.scene, 0.045);
      mesh.material = this.world.mat("#8c1824");
      mesh.position.copyFrom(origin);
      const angle = twist + (i * Math.PI * 2) / 7;
      this.particles.push({
        mesh,
        velocity: new Vector3(
          Math.cos(angle) * 1.7,
          0.5 + i * 0.12,
          Math.sin(angle) * 1.7,
        ),
        life: 0.35,
      });
    }
  }
  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        releaseEffect(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y -= dt * 6;
      p.mesh.position.addInPlace(p.velocity.scale(dt));
    }
  }
  reset() {
    this.count = 0;
    this.cadence.reset();
    if (this.mesh) {
      this.mesh.thinInstanceCount = 0;
      this.mesh.setEnabled(false);
    }
    for (const p of this.particles) releaseEffect(p.mesh);
    this.particles.length = 0;
  }
}
