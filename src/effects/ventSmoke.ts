import {
  Color4,
  Constants,
  Sprite,
  SpriteManager,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { nearView, viewPlanes } from "../game/viewRegion";

export interface VentOutlet {
  position: Vector3;
  large?: boolean;
}

/** One shared, preloaded atlas; no video decoding, new lights or particle allocation in play. */
export function installVentSmoke(scene: Scene, outlets: VentOutlet[]) {
  if (!outlets.length) return;
  const manager = new SpriteManager(
    "ventilation smoke",
    "/vfx/vent-smoke/windblown-007.png",
    outlets.length * 2,
    256,
    scene,
  );
  manager.isPickable = false;
  manager.disableDepthWrite = true;
  manager.blendMode = Constants.ALPHA_COMBINE;
  const sprites = outlets.flatMap((outlet, i) =>
    Array.from({ length: 2 }, (_, layer) => {
      const sprite = new Sprite("vent grille smoke", manager);
      sprite.isPickable = false;
      sprite.width = outlet.large ? (layer ? 4.6 : 5.8) : layer ? 4.8 : 5.8;
      sprite.height = outlet.large ? (layer ? 8 : 6.6) : layer ? 4.8 : 4.2;
      sprite.position
        .copyFrom(outlet.position)
        .addInPlace(
          new Vector3(
            -0.85 + layer * 0.25,
            outlet.large ? 0.65 + layer * 0.35 : 0.45 + layer * 0.2,
            layer * (outlet.large ? 0.55 : 0.3),
          ),
        );
      sprite.angle = layer ? -0.12 : 0;
      sprite.color = new Color4(
        0.9,
        0.94,
        0.95,
        outlet.large ? (layer ? 0.28 : 0.44) : layer ? 0.25 : 0.42,
      );
      return { sprite, time: i * 1.37 + layer * 1.8, fps: layer ? 8.5 : 10 };
    }),
  );
  const observer = scene.onBeforeRenderObservable.add(() => {
    const camera = scene.activeCamera;
    if (!camera) return;
    const planes = viewPlanes(camera);
    const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
    for (const entry of sprites) {
      entry.sprite.isVisible = nearView(planes, entry.sprite.position, 4, 2);
      if (!entry.sprite.isVisible) continue;
      entry.time += dt;
      entry.sprite.cellIndex = Math.floor(entry.time * entry.fps) % 40;
    }
  });
  scene.onDisposeObservable.addOnce(() =>
    scene.onBeforeRenderObservable.remove(observer),
  );
  return manager;
}
