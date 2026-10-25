import test from "node:test";
import assert from "node:assert/strict";
import { partitionFloors } from "../map/floorSurfaces";
import { office01 } from "../maps/office01";

test("crossing carpets have one visible surface, preserve area and give later carpets priority", () => {
  const pieces = partitionFloors([
    { x: 0, z: 0, w: 10, d: 2, color: "first" },
    { x: 0, z: 0, w: 2, d: 10, color: "second" },
  ]);
  assert.equal(
    pieces.reduce((n, r) => n + r.w * r.d, 0),
    36,
  );
  assert.equal(
    pieces.filter((r) => Math.abs(r.x) < r.w / 2 && Math.abs(r.z) < r.d / 2)
      .length,
    1,
  );
  assert.equal(
    pieces.find((r) => Math.abs(r.x) < r.w / 2 && Math.abs(r.z) < r.d / 2)
      ?.color,
    "second",
  );
});
test("actual map floors, carpets and corridors contain no coplanar overlap", () => {
  const input = [
    ...office01.footprint,
    ...office01.corridors.map((r) => ({ ...r, w: r.w * 0.7, d: r.d * 0.7 })),
    ...office01.rooms,
    ...office01.bases.map((b) => ({ x: b.x, z: b.z, w: 9, d: 9 })),
  ];
  const pieces = partitionFloors(input);
  assert.ok(pieces.length < 600, `bounded floor mesh count: ${pieces.length}`);
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i],
        b = pieces[j];
      const w =
        Math.min(a.x + a.w / 2, b.x + b.w / 2) -
        Math.max(a.x - a.w / 2, b.x - b.w / 2);
      const d =
        Math.min(a.z + a.d / 2, b.z + b.d / 2) -
        Math.max(a.z - a.d / 2, b.z - b.d / 2);
      assert.ok(w <= 1e-8 || d <= 1e-8, `overlap ${i}/${j}`);
    }
  // Sample the union, including corridor intersections and room boundaries.
  for (let x = -105; x <= 105; x += 1.25)
    for (let z = -40; z <= 65; z += 1.25) {
      const contains = (r: { x: number; z: number; w: number; d: number }) =>
        Math.abs(x - r.x) <= r.w / 2 + 1e-8 &&
        Math.abs(z - r.z) <= r.d / 2 + 1e-8;
      assert.equal(
        pieces.some(contains),
        input.some(contains),
        `coverage ${x},${z}`,
      );
    }
});
