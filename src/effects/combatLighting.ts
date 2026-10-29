import {
  Color3,
  PointLight,
  SpotLight,
  LightConstants,
  StandardMaterial,
  type Material,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import type { World } from "../map/builder";
import { nearView, viewPlanes } from "../game/viewRegion";

// Leave room for scene, mesh, material and shadow buffers on WebGPU's 12-buffer tier.
export function materialLightLimit(scene: Scene, material?: Material) {
  // PBR reserves two additional vertex-stage buffers (including its scene UBO).
  // The imported palms must fit the same 12-buffer WebGPU device tier.
  const pbr = material?.getClassName().startsWith("PBR") ?? false;
  return scene.getEngine().isWebGPU ? (pbr ? 4 : 6) : 8;
}

export function lightBlocked(
  a: { x: number; z: number },
  b: { x: number; z: number },
  wall: { x: number; z: number; w: number; d: number },
) {
  let lo = 0.015,
    hi = 0.985;
  for (const [origin, delta, min, max] of [
    [a.x, b.x - a.x, wall.x - wall.w / 2, wall.x + wall.w / 2],
    [a.z, b.z - a.z, wall.z - wall.d / 2, wall.z + wall.d / 2],
  ]) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return false;
    } else {
      const t1 = (min - origin) / delta,
        t2 = (max - origin) / delta;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
      if (lo > hi) return false;
    }
  }
  return true;
}
/** Three reusable fire lights and one shared gunshot pulse. No new shadow maps. */
export class CombatLighting {
  readonly lights: PointLight[] = [];
  private afterburns: { position: Vector3; level: number }[] = [];
  afterburn(position: Vector3, level: number) {
    if (this.afterburns.length < 8) this.afterburns.push({ position, level });
  }
  private pulseLife = 0;
  private pulsePower = 0;
  private filterElapsed = 1;
  private pulseFilterElapsed = 1;
  constructor(private world: World) {
    for (let i = 0; i < 4; i++) {
      const light = new PointLight(
        `warzone pooled light ${i}`,
        Vector3.Zero(),
        world.scene,
      );
      light.diffuse = Color3.FromHexString("#ffb255");
      light.specular = Color3.Black();
      light.intensity = 0;
      // Gunshot pulses must fit alongside the two permanently reserved explosion slots.
      light.renderPriority = i === 3 ? 20 : 0;
      light.range = i === 3 ? 5 : 6;
      light.includedOnlyMeshes = [];
      this.lights.push(light);
    }
  }
  pulse(position: Vector3, rifle = false, energy = false) {
    const camera = this.world.scene.activeCamera;
    if (!camera || !nearView(viewPlanes(camera), position, 1, 0)) return;
    const light = this.lights[3];
    light.position.copyFrom(position).y += 0.12;
    light.diffuse.copyFromFloats(1, energy ? 0.1 : 0.68, energy ? 0.16 : 0.28);
    this.pulseLife = 0.065;
    this.pulsePower = rifle ? 4.5 : 2.8;
    if (this.pulseFilterElapsed >= 0.1) {
      this.receivers(light);
      this.pulseFilterElapsed = 0;
    }
    light.intensity = this.pulsePower;
  }
  fire(index: number, position: Vector3, level: number) {
    const light = this.lights[index];
    light.position.copyFrom(position);
    light.intensity = level;
  }
  receivers(light: PointLight | SpotLight) {
    const p = light.position,
      range = light.range;
    const walls: { x: number; z: number; w: number; d: number }[] = [];
    for (const solid of this.world.solids) {
      if (!solid.isEnabled() || solid.isDisposed()) continue;
      solid.computeWorldMatrix();
      const box = solid.getBoundingInfo().boundingBox;
      if (box.maximumWorld.y <= p.y + 0.03 || box.minimumWorld.y > p.y)
        continue;
      const min = box.minimumWorld,
        max = box.maximumWorld;
      if (
        min.x > p.x + range ||
        max.x < p.x - range ||
        min.z > p.z + range ||
        max.z < p.z - range
      )
        continue;
      walls.push({
        x: (min.x + max.x) / 2,
        z: (min.z + max.z) / 2,
        w: max.x - min.x,
        d: max.z - min.z,
      });
    }
    const included: AbstractMesh[] = [];
    for (const mesh of this.world.scene.meshes) {
      if (
        !mesh.isEnabled() ||
        mesh.isDisposed() ||
        mesh.name.startsWith("warzone") ||
        !(mesh.material instanceof StandardMaterial) ||
        mesh.material.disableLighting
      )
        continue;
      mesh.computeWorldMatrix();
      const bounds = mesh.getBoundingInfo().boundingBox;
      const x = Math.max(
        bounds.minimumWorld.x,
        Math.min(p.x, bounds.maximumWorld.x),
      );
      const z = Math.max(
        bounds.minimumWorld.z,
        Math.min(p.z, bounds.maximumWorld.z),
      );
      if ((x - p.x) ** 2 + (z - p.z) ** 2 > range * range) continue;
      const target = { x, z };
      if (walls.some((w) => lightBlocked(p, target, w))) continue;
      // Reserve enough slots for existing sky, sun and the two Core alarms.
      mesh.material.maxSimultaneousLights = materialLightLimit(
        this.world.scene,
      );
      included.push(mesh);
    }
    // Babylon treats an empty inclusion list as "all meshes"; exclude everything
    // explicitly when the light has no receivers.
    light.includedOnlyMeshes = included;
    light.excludedMeshes = included.length
      ? []
      : this.world.scene.meshes.slice();
    // Babylon appends a newly included light to each mesh's existing list;
    // sorting scene.lights alone does not update that per-mesh ordering.
    for (const mesh of included)
      mesh.lightSources.sort(LightConstants.CompareLightsPriority);
  }
  update(dt: number) {
    const camera = this.world.scene.activeCamera;
    if (camera)
      for (const request of this.afterburns) {
        let slot = 0;
        const distance = (i: number) =>
          this.lights[i].intensity <= 0
            ? Infinity
            : Vector3.DistanceSquared(
                this.lights[i].position,
                camera.globalPosition,
              );
        for (let i = 1; i < 3; i++) if (distance(i) > distance(slot)) slot = i;
        if (
          Vector3.DistanceSquared(request.position, camera.globalPosition) <
          distance(slot)
        )
          this.fire(slot, request.position, request.level);
      }
    this.afterburns.length = 0;

    this.filterElapsed += dt;
    this.pulseFilterElapsed += dt;
    this.pulseLife = Math.max(0, this.pulseLife - dt);
    this.lights[3].intensity =
      this.pulsePower * Math.min(1, this.pulseLife / 0.035);
    if (this.filterElapsed >= 0.15) {
      for (const light of this.lights)
        if (light.intensity > 0) this.receivers(light);
      this.filterElapsed = 0;
    }
  }
}
