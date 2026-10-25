import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  MeshBuilder,
  Vector3,
  Ray,
  VertexData,
} from "@babylonjs/core";
import { softenBox, softBoxData } from "../visuals/softBox";

test("softened geometry preserves dimensions, outward normals and a bounded triangle count", () => {
  const data = softBoxData(2, 1, 3, 0.08);
  assert.equal(data.positions!.length / 3, 96);
  assert.equal(data.indices!.length / 3, 108);
  for (let axis = 0; axis < 3; axis++) {
    const values = Array.from(data.positions!).filter((_, i) => i % 3 === axis);
    assert.equal(Math.max(...values), [1, 0.5, 1.5][axis]);
    assert.equal(Math.min(...values), -[1, 0.5, 1.5][axis]);
  }
  const computed: number[] = [];
  VertexData.ComputeNormals(data.positions!, data.indices!, computed);
  for (let i = 0; i < computed.length; i += 3) {
    const dot =
      computed[i] * data.normals![i] +
      computed[i + 1] * data.normals![i + 1] +
      computed[i + 2] * data.normals![i + 2];
    assert.ok(dot > 0.75, `outward normal at ${i / 3}`);
  }
});

test("replaced box renders every face and shared geometry survives another object's destruction", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const a = MeshBuilder.CreateBox("a", {}, scene),
      b = MeshBuilder.CreateBox("b", {}, scene);
    softenBox(a, 2, 1, 3, 0.08);
    softenBox(b, 2, 1, 3, 0.08);
    assert.equal(a.geometry, b.geometry);
    assert.equal(
      a.subMeshes.reduce((n, s) => n + s.indexCount, 0),
      a.getTotalIndices(),
    );
    a.dispose(false, false);
    assert.ok(b.getTotalVertices() > 0);
    b.computeWorldMatrix(true);
    for (const dir of [Vector3.Right(), Vector3.Up(), Vector3.Forward()]) {
      const hit = scene.pickWithRay(
        new Ray(dir.scale(5), dir.negate(), 10),
        (m) => m === b,
      );
      assert.equal(hit?.hit, true);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
