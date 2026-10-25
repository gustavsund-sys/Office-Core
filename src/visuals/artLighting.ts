import {
  Color3,
  type HemisphericLight,
  type DirectionalLight,
  type Scene,
  type ShadowGenerator,
} from "@babylonjs/core";

/** Same warm key / cool fill in the game and its graphics benchmark. No extra lights. */
export function officeLighting(
  scene: Scene,
  ambient: HemisphericLight,
  sun: DirectionalLight,
  shadows: ShadowGenerator,
) {
  ambient.intensity = 0.49;
  ambient.diffuse = Color3.FromHexString("#cadde7");
  ambient.groundColor = Color3.FromHexString("#716454");
  sun.intensity = 0.92;
  sun.diffuse = Color3.FromHexString("#ffe3bd");
  // Keep shadow depth independent of the scoped camera's near/far planes.
  sun.autoCalcShadowZBounds = true;
  shadows.bias = 0.0012;
  shadows.normalBias = 0.045;
  shadows.setDarkness(0.25);
  scene.imageProcessingConfiguration.contrast = 1.08;
  scene.imageProcessingConfiguration.exposure = 1.08;
}
