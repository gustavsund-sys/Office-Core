import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  TransformNode,
  Vector3,
  MeshBuilder,
  type Mesh,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { batchPickupBody } from "../pickups/pickupBatch";

test("ammo slats batch into shared finishes without moving the crate, losing triangles or consuming its animated sign", () => {
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
    const root = new TransformNode("ammo crate", scene);
    root.position.set(32, 0.4, -21);
    root.scaling.setAll(1.25);
    for (let i = 0; i < 16; i++) {
      const part = world.box(
        "slat",
        0,
        -0.3 + i * 0.04,
        (i % 2) * 0.2,
        0.94,
        0.035,
        0.025,
        i % 2 ? "#a87943" : "#bd9056",
      );
      part.parent = root;
    }
    const bounds = () => {
      const meshes = root.getChildMeshes();
      for (const m of meshes) m.computeWorldMatrix(true);
      return meshes.reduce(
        (r, m) => {
          const b = m.getBoundingInfo().boundingBox;
          return {
            min: Vector3.Minimize(r.min, b.minimumWorld),
            max: Vector3.Maximize(r.max, b.maximumWorld),
          };
        },
        {
          min: new Vector3(Infinity, Infinity, Infinity),
          max: new Vector3(-Infinity, -Infinity, -Infinity),
        },
      );
    };
    const before = bounds(),
      indices = root
        .getChildMeshes()
        .reduce((n, m) => n + (m as Mesh).getTotalIndices(), 0);
    batchPickupBody(world, root);
    assert.equal(root.getChildMeshes().length, 2);
    assert.equal(
      root
        .getChildMeshes()
        .reduce((n, m) => n + (m as Mesh).getTotalIndices(), 0),
      indices,
    );
    const after = bounds();
    assert.ok(before.min.equalsWithEpsilon(after.min, 1e-5));
    assert.ok(before.max.equalsWithEpsilon(after.max, 1e-5));
    assert.ok(root.position.equals(new Vector3(32, 0.4, -21)));
    const sign = MeshBuilder.CreateBox("animated weapon sign", {}, scene);
    sign.parent = root;
    sign.rotation.y = 0.7;
    root.setEnabled(false);
    assert.ok(root.getChildMeshes().every((m) => !m.isEnabled()));
    root.setEnabled(true);
    assert.ok(root.getChildMeshes().every((m) => m.isEnabled()));
    assert.equal(sign.rotation.y, 0.7);
    assert.ok(
      root
        .getChildMeshes()
        .filter((m) => m !== sign)
        .every((m) => !m.isPickable),
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
