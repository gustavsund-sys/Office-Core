import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  Vector3,
  FreeCamera,
  MeshBuilder,
  TransformNode,
  StandardMaterial,
} from "@babylonjs/core";
import { Explosions } from "../effects/explosions";
import { ModelDisposal } from "./deferredModelDisposal";
import type { World } from "../map/builder";

test("real rehearsals suppress callbacks and repeated bursts reuse enabled lights and stable receivers", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const camera = new FreeCamera("camera", new Vector3(0, 5, -8), scene);
    camera.setTarget(Vector3.Zero());
    const effects = new Explosions({ scene } as World);
    effects.setSpriteMode(true);
    effects.prepare(Vector3.Zero());
    const pool = scene.lights.slice();
    assert.equal(pool.length, 2);
    let callbacks = 0;
    effects.onBurst = () => callbacks++;
    for (const style of ["normal", "large", "plasma"] as const) {
      effects.rehearse(Vector3.Zero(), style);
      assert.ok(effects.lights.length > 0);
      effects.update(20);
    }
    assert.equal(callbacks, 0);
    let removed = 0;
    scene.onLightRemovedObservable.add(() => removed++);
    for (let i = 0; i < 10; i++) {
      effects.burst(Vector3.Zero(), "#ffcf56", 1);
      effects.update(20);
    }
    assert.equal(callbacks, 10);
    assert.deepEqual(scene.lights, pool);
    assert.equal(removed, 0);
    assert.ok(
      pool.every((light) => light.isEnabled() && light.intensity === 0),
    );
    assert.ok(
      pool.every(
        (light) =>
          light.includedOnlyMeshes.length === 0 &&
          light.excludedMeshes.length === 0,
      ),
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("retired model immediately stops rendering/picking, releases bounded children and preserves shared resources", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const root = new TransformNode("beacon", scene);
    const joint = new TransformNode("joint", scene);
    joint.parent = root;
    const material = new StandardMaterial("shared weapon finish", scene);
    const parts = Array.from({ length: 20 }, (_, i) => {
      const mesh = MeshBuilder.CreateBox(`part ${i}`, {}, scene);
      mesh.parent = i % 2 ? root : joint;
      mesh.material = material;
      return mesh;
    });
    const other = MeshBuilder.CreateBox("other weapon", {}, scene);
    other.material = material;
    const disposal = new ModelDisposal(scene);
    disposal.retire(root);
    disposal.retire(root); // no duplicate work
    assert.ok(parts.every((mesh) => !mesh.isEnabled()));
    assert.ok(parts.every((mesh) => !mesh.isDisposed()));
    disposal.flush(4, 100);
    assert.equal(parts.filter((mesh) => mesh.isDisposed()).length, 4);
    assert.equal(root.isDisposed(), false);
    for (let i = 0; i < 10; i++) disposal.flush(4, 100);
    assert.ok(root.isDisposed() && joint.isDisposed());
    assert.ok(parts.every((mesh) => mesh.isDisposed()));
    assert.ok(scene.materials.includes(material));
    assert.ok(other.isEnabled() && !other.isDisposed());
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
