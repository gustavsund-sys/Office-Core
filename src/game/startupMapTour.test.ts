import test from "node:test";
import assert from "node:assert/strict";
import { mapTourPoints } from "./startupMapTour";

test("map tour covers distant custom-map rooms and their edges with overlapping views", () => {
  const rooms = [
    { x: -70, z: 0, w: 35, d: 24 },
    { x: 0, z: 40, w: 32, d: 16 },
    { x: 85, z: -25, w: 24, d: 30 },
  ];
  const points = mapTourPoints(rooms, 18, 12);
  assert.ok(points.length > 0 && points.length < 200);
  for (const room of rooms)
    for (const x of [room.x - room.w / 2, room.x, room.x + room.w / 2])
      for (const z of [room.z - room.d / 2, room.z, room.z + room.d / 2])
        assert.ok(
          points.some(
            (p) => Math.abs(p.x - x) <= 9.001 && Math.abs(p.z - z) <= 6.001,
          ),
          `Uncovered ${x},${z}`,
        );
  assert.deepEqual(points, mapTourPoints(rooms, 18, 12));
});
test("map tour handles an empty footprint and small rooms without changing map data", () => {
  assert.deepEqual(mapTourPoints([], 18, 12), []);
  const rooms = [{ x: 12, z: 4, w: 2, d: 2 }];
  const before = JSON.stringify(rooms);
  const points = mapTourPoints(rooms, 18, 12);
  assert.equal(JSON.stringify(rooms), before);
  assert.ok(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)));
  assert.ok(
    points.some((p) => Math.abs(p.x - 12) <= 1 && Math.abs(p.z - 4) <= 1),
  );
});

import { NullEngine, Scene, FreeCamera, Vector3 } from "@babylonjs/core";
import { prepareMapTour } from "./startupMapTour";
import type { Game } from "./game";

test("covered camera tour restores pose after normal completion and a failed render", async () => {
  for (const failure of [false, true]) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const camera = new FreeCamera("start", new Vector3(-40, 23, -15), scene);
      camera.setTarget(new Vector3(-40, 0, 0));
      const position = camera.position.clone(),
        target = camera.getTarget().clone();
      let frames = 0,
        lighting = 0,
        warzone = 0;
      const progress: number[] = [];
      const game = {
        scene,
        engine,
        camera,
        world: { lighting: { update: () => lighting++ } },
        warzone: { update: () => warzone++ },
      } as unknown as Game;
      const run = prepareMapTour(
        game,
        async () => {
          frames++;
          if (failure && frames === 3) throw new Error("render failed");
        },
        (p) => progress.push(p),
      );
      if (failure) await assert.rejects(run, /render failed/);
      else await run;
      assert.ok(camera.position.equalsWithEpsilon(position));
      assert.ok(camera.getTarget().equalsWithEpsilon(target));
      assert.ok(lighting > 0 && warzone > 0);
      assert.equal(progress.at(-1), 1);
      assert.ok(frames < 2000);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  }
});

test("slow scene preparation stops within the per-view budget and restores the camera", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const camera = new FreeCamera("mobile", new Vector3(-40, 34, -18), scene);
    camera.setTarget(new Vector3(-40, 0, 0));
    const original = camera.position.clone(),
      target = camera.getTarget().clone();
    let time = 0,
      frames = 0;
    const progress: number[] = [];
    const game = {
      scene,
      engine,
      camera,
      world: {},
      warzone: { update: () => {} },
    } as unknown as Game;
    await prepareMapTour(
      game,
      async () => {
        time += 1000;
        frames++;
      },
      (p) => progress.push(p),
      { budgetMs: 3000, now: () => time },
    );
    assert.ok(frames <= 6, `excessive frames ${frames}`);
    assert.ok(camera.position.equalsWithEpsilon(original));
    assert.ok(camera.getTarget().equalsWithEpsilon(target));
    assert.equal(progress.at(-1), 1);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
