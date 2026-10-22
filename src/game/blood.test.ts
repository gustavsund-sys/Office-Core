import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { BloodCadence } from "../effects/bloodCadence";

test("blood cadence is first then fifth and independent per victim and life", () => {
  const cadence = new BloodCadence();
  assert.deepEqual(
    Array.from({ length: 11 }, () => cadence.hit("a")),
    [true, false, false, false, true, false, false, false, false, true, false],
  );
  assert.equal(cadence.hit("b"), true);
  cadence.resetPlayer("a");
  assert.equal(cadence.hit("a"), true);
  assert.equal(cadence.hit("b"), false);
  cadence.reset();
  assert.equal(cadence.hit("b"), true);
});

test("blood persists, adds a wall stain only nearby, never changes collisions, resets each round", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = new World(
    scene,
    new ShadowGenerator(64, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  try {
    const wall = world.box("wall", 1.5, 1, 0, 0.2, 2, 5, "#aaaaaa", true);
    wall.computeWorldMatrix(true);
    const obstacles = world.obstacles.length;
    world.blood.splat(new Vector3(0, 1, 0));
    assert.equal(world.blood.count, 2);
    const stains = scene.getMeshByName("round blood stains")!;
    assert.equal(stains.isPickable, false);
    world.blood.update(10);
    assert.equal(world.blood.count, 2);
    world.blood.splat(new Vector3(10, 1, 0));
    assert.equal(world.blood.count, 3);
    assert.equal(world.obstacles.length, obstacles);
    assert.equal(world.solids.length, 1);
    world.blood.reset();
    assert.equal(world.blood.count, 0);
    assert.equal(stains.isEnabled(), false);
    world.blood.splat(new Vector3(10, 1, 0));
    assert.equal(world.blood.count, 1);
    assert.equal(stains.isEnabled(), true);
    world.authoritative = true;
    world.blood.splat(Vector3.Zero());
    assert.equal(world.blood.count, 1);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
