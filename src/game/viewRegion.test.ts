import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  FreeCamera,
  Vector3,
  DirectionalLight,
  ShadowGenerator,
  MeshBuilder,
} from "@babylonjs/core";
import { nearView, viewPlanes } from "./viewRegion";
import { World } from "../map/builder";

test("view margin retains approaching objects and long beacon lasers", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("view", Vector3.Zero(), scene);
  camera.setTarget(new Vector3(0, 0, 10));
  camera.minZ = 0.1;
  camera.maxZ = 100;
  const planes = viewPlanes(camera);
  assert.equal(nearView(planes, new Vector3(0, 0, 10), 1, 0), true);
  assert.equal(nearView(planes, new Vector3(8, 0, 10), 1, 6), true);
  assert.equal(nearView(planes, new Vector3(20, 0, 10), 16, 4), true);
  assert.equal(nearView(planes, new Vector3(100, 0, 10), 16, 4), false);
  scene.dispose();
  engine.dispose();
});

test("shadow filtering preserves caster registration, tall shadows and authoritative simulation", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("view", Vector3.Zero(), scene);
  camera.setTarget(new Vector3(0, 0, 10));
  scene.activeCamera = camera;
  const light = new DirectionalLight(
    "sun",
    new Vector3(-0.65, -1, 0.45),
    scene,
  );
  const shadows = new ShadowGenerator(512, light);
  const world = new World(scene, shadows);
  const near = MeshBuilder.CreateBox("near", {}, scene);
  near.position.z = 10;
  const far = MeshBuilder.CreateBox("far", {}, scene);
  far.position.set(100, 0, 10);
  const tall = MeshBuilder.CreateBox("tall", { height: 10 }, scene);
  tall.position.set(15, 5, 10);
  [near, far, tall].forEach((m) => {
    m.computeWorldMatrix(true);
    shadows.addShadowCaster(m);
  });
  const map = shadows.getShadowMap()!;
  const list = map.renderList!;
  const filtered = map.getCustomRenderList!(0, list, list.length)!;
  assert.ok(filtered.includes(near));
  assert.ok(filtered.includes(tall));
  assert.ok(!filtered.includes(far));
  assert.equal(map.renderList!.length, 3);
  camera.position.x = 100;
  camera.setTarget(new Vector3(100, 0, 10));
  assert.ok(map.getCustomRenderList!(0, list, list.length)!.includes(far));
  world.authoritative = true;
  assert.equal(map.getCustomRenderList!(0, list, list.length), null);
  scene.dispose();
  engine.dispose();
});
