import test from "node:test";
import assert from "node:assert/strict";
import { preferredRenderer, rendererLabel } from "./rendererSelection";

test("mobile defaults to WebGL while explicit renderer selection is respected", () => {
  assert.equal(preferredRenderer(null, true), "webgl");
  assert.equal(preferredRenderer(null, false), "webgpu");
  assert.equal(preferredRenderer("webgpu", true), "webgpu");
  for (const mobile of [false, true]) for (const option of ["webgl", "webgl2"])
    assert.equal(preferredRenderer(option, mobile), "webgl");
});
test("renderer labels report the actual context version rather than the requested version", () => {
  assert.equal(rendererLabel({ isWebGPU: false, webGLVersion: 2 }), "WebGL 2");
  assert.equal(rendererLabel({ isWebGPU: false, webGLVersion: 1 }), "WebGL 1");
  assert.equal(rendererLabel({ isWebGPU: true }), "WebGPU");
});
