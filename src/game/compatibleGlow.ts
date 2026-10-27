import { markGPUStartup } from "./webgpuDiagnostics";
import { GlowLayer, type Scene } from "@babylonjs/core";

/** iPhone testing reproduced device loss with both half-float and byte glow
 * targets. The same scene starts with the layer disabled. Avoid allocating that
 * optional render chain on mobile WebGPU; retain emissive materials and lights.
 */
export function createGameGlow(scene: Scene, mobile: boolean) {
  scene.metadata ??= {};
  if (mobile && scene.getEngine().isWebGPU) {
    scene.metadata.glowFormat = "disabled-mobile-webgpu";
    markGPUStartup("glow disabled: mobile WebGPU compatibility");
    return undefined;
  }
  scene.metadata.glowFormat = "automatic";
  markGPUStartup("glow format: automatic");
  return new GlowLayer("subtle glow", scene, { mainTextureFixedSize: 512 });
}
