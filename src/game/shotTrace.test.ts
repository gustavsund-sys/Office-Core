import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Ray,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Player } from "../player/player";
import { shotTraceEnd } from "./shotTrace";

test("predicted traces stop at the nearest player, wall or live object and ignore the shooter", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("light", Vector3.Down(), scene);
  const world = new World(scene, new ShadowGenerator(32, light));
  try {
    const shooter = new Player(world),
      target = new Player(world);
    shooter.root.position.set(0, 0, 0);
    target.root.position.set(0, 0, 5);
    const ray = new Ray(new Vector3(0, 1.1, 0), Vector3.Forward(), 20);
    const end = () => shotTraceEnd(scene, ray, shooter, [shooter, target]);
    scene.meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    assert.ok(
      end().z > 4 && end().z < 5,
      "unannotated remote player stops the trace",
    );
    assert.equal(target.hp, 100, "prediction must not inflict damage");
    target.root.position.z = 7;
    assert.ok(
      end().z > 6 && end().z < 7,
      "updated player matrices are used immediately",
    );
    const wall = world.box("wall", 0, 1, 3, 3, 2, 0.2, "#888888", true);
    wall.computeWorldMatrix(true);
    assert.ok(Math.abs(end().z - 2.9) < 0.001);
    const object = world.box("object", 0, 1, 2, 2, 2, 0.2, "#888888");
    object.metadata = { damageable: { hp: 20 } };
    object.computeWorldMatrix(true);
    assert.ok(Math.abs(end().z - 1.9) < 0.001);
    object.metadata.damageable.hp = 0;
    assert.ok(Math.abs(end().z - 2.9) < 0.001);
    wall.setEnabled(false);
    target.hp = 0;
    assert.equal(end().z, 20);
    target.hp = 100;
    target.root.setEnabled(false);
    assert.equal(end().z, 20);
  } finally {
    engine.dispose();
  }
});
