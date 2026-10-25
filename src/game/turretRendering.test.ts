import test from "node:test";
import assert from "node:assert/strict";
import {
  Camera,
  NullEngine,
  Scene,
  FreeCamera,
  MeshBuilder,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { detailVisible, installOfficeDetailLOD } from "../map/detailLOD";
import { batchBuildingTrim } from "../map/buildingBatch";
import { World } from "../map/builder";

test("detail LOD keeps a hysteresis band and recovers fine trim through a scope", () => {
  assert.equal(detailVisible(1, 200, Math.PI / 2, 1000, true), true);
  assert.equal(detailVisible(1, 200, Math.PI / 2, 1000, false), false);
  assert.equal(detailVisible(1, 300, Math.PI / 2, 1000, true), false);
  assert.equal(detailVisible(1, 100, Math.PI / 2, 1000, false), true);
  const engine = new NullEngine({
      renderWidth: 1920,
      renderHeight: 1080,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    }),
    scene = new Scene(engine);
  try {
    installOfficeDetailLOD(scene);
    const camera = new FreeCamera("view", new Vector3(0, 0, -100), scene);
    camera.setTarget(Vector3.Zero());
    camera.fov = 1;
    camera.computeWorldMatrix();
    const trim = MeshBuilder.CreateBox(
      "drawer handle",
      { width: 0.3, height: 0.025, depth: 0.08 },
      scene,
    );
    trim.metadata = { distanceDetail: true };
    trim.isPickable = false;
    trim.computeWorldMatrix(true);
    assert.equal(scene.customLODSelector!(trim, camera), null);
    camera.fov = 0.2;
    assert.equal(
      scene.customLODSelector!(trim, camera),
      trim,
      "precision scope restores detail naturally",
    );
    camera.fov = 1;
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    assert.equal(
      scene.customLODSelector!(trim, camera),
      trim,
      "normal map view stays unchanged",
    );
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    trim.isPickable = true;
    assert.equal(
      scene.customLODSelector!(trim, camera),
      trim,
      "hit surfaces never disappear",
    );
    trim.isPickable = false;
    trim.metadata = {};
    assert.equal(
      scene.customLODSelector!(trim, camera),
      trim,
      "players, weapons and untagged meshes are unaffected",
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("spatial trim batching preserves walls and leaves distant map chunks independent", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const world = new World(
      scene,
      new ShadowGenerator(
        32,
        new DirectionalLight("sun", Vector3.Down(), scene),
      ),
    );
    const wall = world.box("wall", 0, 0.95, 0, 5, 1.9, 0.4, "#aabbcc", true);
    for (const x of [1, 2, 3, 50])
      world.box("wall cap", x, 1.94, 0, 1, 0.1, 0.44, "#ddeeff");
    const capIndices = scene.meshes
      .filter((m) => m.name === "wall cap")
      .reduce((n, m) => n + m.getTotalIndices(), 0);
    batchBuildingTrim(world);
    const caps = scene.meshes.filter((m) => m.name.startsWith("wall cap"));
    assert.equal(caps.length, 2);
    assert.equal(
      caps.reduce((n, m) => n + m.getTotalIndices(), 0),
      capIndices,
    );
    assert.equal(world.solids.length, 1);
    assert.equal(world.solids[0], wall);
    assert.equal(wall.isDisposed(), false);
    assert.equal(wall.isPickable, true);
    assert.equal(world.obstacles.length, 1);
    assert.ok(
      caps.some((m) => m.position.x === 50),
      "far chunk remains independently culled",
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
