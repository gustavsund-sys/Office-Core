import test from "node:test";
import assert from "node:assert/strict";
import { gpuInvestigation, GPU_CHECKS } from "./gpuInvestigation";
test("normal and unknown modes retain all rendering features", () => {
  for (const search of ["", "?gpucheck=unknown"])
    assert.deepEqual(gpuInvestigation(search), {
      mode: "normal",
      antialias: true,
      glow: true,
      shadows: true,
      portals: true,
    });
});
test("each WebGPU isolation mode changes only its nominated feature", () => {
  for (const [mode, feature] of [
    ["no-msaa", "antialias"],
    ["no-glow", "glow"],
    ["no-shadows", "shadows"],
    ["no-portals", "portals"],
  ] as const) {
    const config = gpuInvestigation(`?client=mobile&gpucheck=${mode}`);
    for (const name of ["antialias", "glow", "shadows", "portals"] as const)
      assert.equal(config[name], name !== feature);
  }
  const minimal = gpuInvestigation("?gpucheck=minimal");
  assert.equal(
    minimal.antialias || minimal.glow || minimal.shadows || minimal.portals,
    false,
  );
  assert.equal(GPU_CHECKS.length, 5);
});

import {NullEngine,Scene,FreeCamera,Vector3} from '@babylonjs/core';
import {createOfficePortal} from '../map/officePortal';
test('portal isolation removes only its decorative view and does not schedule its render target',()=>{
 for(const portals of [true,false]){
  const engine=new NullEngine(),scene=new Scene(engine);
  try {
   const camera=new FreeCamera('viewer',new Vector3(0,23,-13),scene);camera.setTarget(Vector3.Zero());
   scene.metadata={gpuInvestigation:{portals}};
   const portal=createOfficePortal(scene,{x:0,z:0,w:8,d:7},[]);
   portal.update();
   assert.equal(portal.surface.isEnabled(),portals);
   assert.equal(scene.customRenderTargets.includes(portal.target),portals);
  } finally {scene.dispose();engine.dispose();}
 }
});

import { effectiveGPUConfig } from "./gpuInvestigation";
test("mobile WebGPU uses the verified no-glow/no-shadow configuration without changing desktop or WebGL", () => {
  const requested = gpuInvestigation("");
  for (const mobile of [false, true]) for (const webgpu of [false, true]) {
    const actual = effectiveGPUConfig(requested, mobile, webgpu);
    assert.equal(actual.glow, !(mobile && webgpu));
    assert.equal(actual.shadows, !(mobile && webgpu));
    assert.equal(actual.antialias, true);
    assert.equal(actual.portals, true);
  }
  assert.equal(requested.glow, true);
  assert.equal(requested.shadows, true);
  assert.equal(effectiveGPUConfig(gpuInvestigation("?gpucheck=minimal"), true, true).portals, false);
});
