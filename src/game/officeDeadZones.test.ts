import { ROOF_FINISH_Y } from "../map/surfaceHeights";
import { serviceDuctPath } from "../map/ductPath";
import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  StandardMaterial,
} from "@babylonjs/core";
import { enclosedOfficeZones } from "../map/officeDeadZones";
import {
  buildOfficeServiceDecor,
  SERVICE_ROOF_Y,
} from "../map/officeServiceDecor";
import { office01 } from "../maps/office01";
import { World } from "../map/builder";

test("ceiling layout finds enclosed dead areas, excludes exterior and preserves cell coverage after merging", () => {
  const zones = enclosedOfficeZones(office01.footprint);
  assert.ok(zones.length >= 10 && zones.length < 25);
  const contains = (
    r: { x: number; z: number; w: number; d: number },
    x: number,
    z: number,
  ) => Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2;
  for (const zone of zones) {
    assert.equal(
      zone.patches.reduce((n, r) => n + r.w * r.d, 0),
      zone.cells.length * 4,
    );
    for (const cell of zone.cells) {
      assert.ok(!office01.footprint.some((r) => contains(r, cell.x, cell.z)));
      assert.equal(
        zone.patches.filter((r) => contains(r, cell.x, cell.z)).length,
        1,
      );
    }
  }
  assert.ok(
    !zones.flatMap((z) => z.patches).some((r) => contains(r, 105, 80)),
    "outside map remains undecorated",
  );
});

test("office service decoration is static and merged, with no gameplay collisions, shadow casters or extra lights", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const sun = new DirectionalLight("sun", Vector3.Down(), scene),
      shadows = new ShadowGenerator(32, sun);
    const world = new World(scene, shadows),
      lightCount = scene.lights.length;
    buildOfficeServiceDecor(world);
    const decorations = scene.meshes.filter((m) => m.metadata?.officeService);
    assert.ok(
      decorations.length > 30 && decorations.length < 150,
      `merged decoration count: ${decorations.length}`,
    );
    assert.ok(decorations.every((m) => !m.isPickable));
    const roofMaterial = scene.materials.find(
      (m) => m.name === "dark acoustic technical roof",
    ) as StandardMaterial;
    assert.ok(
      roofMaterial.diffuseColor.r < 0.25 && roofMaterial.diffuseColor.g < 0.3,
      "roof is darker than the playable floor",
    );
    const roofs = decorations.filter((m) => m.material === roofMaterial);
    assert.ok(roofs.length > 0 && SERVICE_ROOF_Y >= 1);
    for (const roof of roofs) {
      roof.computeWorldMatrix(true);
      assert.ok(
        Math.abs(
          roof.getBoundingInfo().boundingBox.maximumWorld.y - ROOF_FINISH_Y,
        ) < 1e-5,
      );
      assert.ok(
        roof.getBoundingInfo().boundingBox.minimumWorld.y > 1,
        "roof sits above the gameplay floor",
      );
    }

    assert.equal(scene.lights.length, lightCount);
    assert.equal(world.obstacles.length, 0);
    assert.equal(world.solids.length, 0);
    assert.equal(shadows.getShadowMap()?.renderList?.length ?? 0, 0);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("roof ducts span both sides and use smooth bounded bends in either orientation", () => {
  for (const [w, d] of [
    [40, 3.5],
    [3.5, 28],
    [6, 6],
  ]) {
    const path = serviceDuctPath(0, 0, w, d),
      alongX = w >= d;
    assert.equal(path.length, 14, "fixed small path budget");
    const first = path[0],
      last = path[path.length - 1];
    const span = alongX ? last.x - first.x : last.z - first.z;
    assert.ok(span > Math.max(w, d) - 0.1, "duct reaches both edges");
    assert.ok(
      path.some(
        (p) => Math.abs(p.x - first.x) > 0.1 && Math.abs(p.z - first.z) > 0.1,
      ),
      "run bends rather than remaining straight",
    );
    for (const point of path) {
      assert.ok(Math.abs(point.x) <= w / 2 && Math.abs(point.z) <= d / 2);
    }
    for (let i = 2; i < path.length; i++) {
      const a = path[i - 1].subtract(path[i - 2]).normalize(),
        b = path[i].subtract(path[i - 1]).normalize();
      assert.ok(Vector3.Dot(a, b) > 0.94, "arc joins stay smooth");
    }
  }
});
