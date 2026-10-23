import { FILMED_FIRE } from "./filmedFire";
import {
  Color3,
  Color4,
  Constants,
  Mesh,
  Sprite,
  SpriteManager,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
} from "@babylonjs/core";
import type { World } from "../map/builder";
import { BURNING_BINS } from "../maps/office01";
import { nearView, viewPlanes } from "../game/viewRegion";
export function fireDetail(pixels: number, quality: number) {
  if (pixels < 12) return { planes: 1, smoke: 0 };
  if (pixels < 45 || quality < 0.8)
    return { planes: 1, smoke: quality < 0.5 ? 0 : 2 };
  return { planes: 2, smoke: 4 };
}
export class Warzone {
  private time = 0;
  private fires: {
    root: TransformNode;
    planes: Mesh[];
    smoke: Sprite[];
    position: Vector3;
    filmSprite?: Sprite;
  }[] = [];
  constructor(
    private world: World,
    private quality: number,
  ) {
    const scene = world.scene;
    const material = new StandardMaterial("warzone flame", scene);
    material.diffuseTexture = new Texture("/vfx/muzzle/numbered-6.png", scene);
    material.diffuseTexture.hasAlpha = true;
    material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true;
    material.emissiveColor = new Color3(1, 0.7, 0.28);
    material.backFaceCulling = false;
    material.alphaMode = Constants.ALPHA_ADD;
    material.disableDepthWrite = true;
    const smokeManager = new SpriteManager(
      "warzone smoke pool",
      "/vfx/kenney/smoke.png",
      12,
      512,
      scene,
    );
    smokeManager.isPickable = false;
    smokeManager.disableDepthWrite = true;
    smokeManager.blendMode = Constants.ALPHA_COMBINE;
    const film = FILMED_FIRE.bin;
    const filmManager = film
      ? new SpriteManager(
          "filmed bin fire pool",
          film.url,
          3,
          film.cellSize,
          scene,
        )
      : undefined;
    if (filmManager) {
      filmManager.isPickable = false;
      filmManager.disableDepthWrite = true;
      filmManager.blendMode = Constants.ALPHA_COMBINE;
    }
    for (const bin of BURNING_BINS) {
      const root = new TransformNode("warzone fire", scene);
      root.position.set(bin.x, 1.05, bin.z);
      const planes: Mesh[] = [];
      for (let i = 0; i < 2; i++) {
        const plane = new Mesh("warzone flame plane", scene),
          data = new VertexData();
        data.positions =
          i === 0
            ? [-0.65, 0, 0, 0.65, 0, 0, 0.65, 1.8, 0, -0.65, 1.8, 0]
            : [0, 0, -0.65, 0, 0, 0.65, 0, 1.8, 0.65, 0, 1.8, -0.65];
        data.indices = [0, 1, 2, 0, 2, 3];
        data.uvs = [0, 0, 0, 1, 1, 1, 1, 0];
        data.normals = [];
        VertexData.ComputeNormals(data.positions, data.indices, data.normals);
        data.applyToMesh(plane);
        plane.parent = root;
        plane.material = material;
        plane.isPickable = false;
        planes.push(plane);
      }
      const smoke = Array.from({ length: 4 }, () => {
        const s = new Sprite("warzone smoke", smokeManager);
        s.isPickable = false;
        return s;
      });
      const filmSprite = filmManager
        ? new Sprite("High-Angle Fire 041 bin", filmManager)
        : undefined;
      if (filmSprite) {
        filmSprite.position.set(bin.x, 1.45, bin.z);
        filmSprite.size = 2.2;
        // Source flames travel right-to-left; turn their rise toward screen top.
        filmSprite.angle = -Math.PI / 2;
        filmSprite.isPickable = false;
      }
      this.fires.push({
        filmSprite,
        root,
        planes,
        smoke,
        position: new Vector3(bin.x, 1.6, bin.z),
      });
    }
  }
  update(dt: number) {
    this.time += dt;
    const camera = this.world.scene.activeCamera;
    if (!camera) return;
    const planes = viewPlanes(camera),
      height = this.world.scene.getEngine().getRenderHeight();
    let nearest = 0;
    for (let i = 1; i < this.fires.length; i++)
      if (
        Vector3.DistanceSquared(camera.globalPosition, this.fires[i].position) <
        Vector3.DistanceSquared(
          camera.globalPosition,
          this.fires[nearest].position,
        )
      )
        nearest = i;
    this.fires.forEach((fire, index) => {
      const visible = nearView(planes, fire.position, 3, 0);
      const distance = Vector3.Distance(camera.globalPosition, fire.position);
      const pixels =
        camera.mode === 1
          ? (height * 2) /
            Math.max(1, (camera.orthoTop ?? 20) - (camera.orthoBottom ?? -20))
          : height / (Math.max(1, distance) * Math.tan(camera.fov / 2));
      const detail = fireDetail(pixels, this.quality);
      const flicker =
        0.85 +
        0.1 * Math.sin(this.time * 11 + index * 3) +
        0.05 * Math.sin(this.time * 23 + index);
      fire.root.setEnabled(visible && !fire.filmSprite);
      if (fire.filmSprite && FILMED_FIRE.bin) {
        fire.filmSprite.isVisible = visible;
        const fps = pixels < 20 ? 8 : FILMED_FIRE.bin.fps;
        const time = Math.floor(this.time * fps) / fps;
        fire.filmSprite.cellIndex =
          (Math.floor(time * FILMED_FIRE.bin.fps) + index * 13) %
          FILMED_FIRE.bin.frames;
      }
      fire.root.rotation.y =
        detail.planes === 1
          ? Math.atan2(
              camera.globalPosition.x - fire.position.x,
              camera.globalPosition.z - fire.position.z,
            )
          : 0.15 * Math.sin(this.time + index);
      fire.planes.forEach((p, i) => {
        p.setEnabled(i < detail.planes);
        p.scaling.y = flicker;
        p.visibility = 0.8 + 0.15 * Math.sin(this.time * 13 + index);
      });
      fire.smoke.forEach((s, i) => {
        s.isVisible = visible && i < detail.smoke;
        if (!s.isVisible) return;
        const age = (this.time * 0.32 + i * 0.25 + index * 0.17) % 1;
        s.position.set(
          fire.position.x + Math.sin(this.time + i) * age * 0.3,
          1.7 + age * 2.7,
          fire.position.z + age * 0.35,
        );
        s.size = 0.65 + age * 1.35;
        s.angle = i + age * 0.4;
        s.color = new Color4(0.16, 0.18, 0.19, Math.sin(age * Math.PI) * 0.22);
      });
      this.world.lighting?.fire(
        index,
        fire.position,
        visible && pixels >= 18 && (this.quality >= 0.5 || index === nearest)
          ? 1.9 * flicker
          : 0,
      );
    });
  }
}
