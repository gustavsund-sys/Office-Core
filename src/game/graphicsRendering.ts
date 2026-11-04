import type { AbstractEngine, Engine, WebGPUEngine } from "@babylonjs/core";
import {
  renderSize,
  readResolution,
  type GraphicsTier,
} from "./graphicsSettings";

export function applyGraphics(engine: AbstractEngine, tier: GraphicsTier) {
  const canvas = engine.getRenderingCanvas()!;
  const size = renderSize(
    canvas.clientWidth,
    canvas.clientHeight,
    tier,
    readResolution(),
  );
  engine.setHardwareScalingLevel(1 / size.scale);
  engine.resize();
  console.info("graphics", {
    engine: engine.isWebGPU ? "WebGPU" : "WebGL",
    tier,
    width: engine.getRenderWidth(),
    height: engine.getRenderHeight(),
    gpu: engine.isWebGPU
      ? (engine as WebGPUEngine).getInfo()
      : (engine as Engine).getGlInfo(),
    caps: { maxTextureSize: engine.getCaps().maxTextureSize },
  });
}
