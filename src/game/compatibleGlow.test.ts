import test from "node:test";
import assert from "node:assert/strict";
import { GlowLayer, NullEngine, Scene } from "@babylonjs/core";
import { createGameGlow } from "./compatibleGlow";

for (const webgpu of [false, true]) for (const mobile of [false, true]) {
  test(`glow compatibility: mobile=${mobile}, webgpu=${webgpu}`, () => {
    const engine = new NullEngine();
    Object.defineProperty(engine, "isWebGPU", { value: webgpu });
    const scene = new Scene(engine);
    const halfFloat = engine.getCaps().textureHalfFloatRender;
    const glow = createGameGlow(scene, mobile);
    if (mobile && webgpu) {
      assert.equal(glow, undefined);
      assert.equal(scene.effectLayers?.length ?? 0, 0);
      assert.equal(scene.customRenderTargets.length, 0);
      assert.equal(scene.metadata.glowFormat, "disabled-mobile-webgpu");
    } else {
      assert.ok(glow instanceof GlowLayer);
      assert.equal(glow.isEnabled, true);
      assert.equal(scene.metadata.glowFormat, "automatic");
    }
    assert.equal(engine.getCaps().textureHalfFloatRender, halfFloat);
    engine.dispose();
  });
}
