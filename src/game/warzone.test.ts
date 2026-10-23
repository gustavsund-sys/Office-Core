import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  FreeCamera,
  Vector3,
  DirectionalLight,
  ShadowGenerator,
  Mesh,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { CombatLighting, lightBlocked } from "../effects/combatLighting";
import { Warzone, fireDetail } from "../effects/warzone";
import { BURNING_BINS } from "../maps/office01";
import { blocked } from "./collision";
class TestWorld extends World {
  override label(text: string) {
    return new Mesh(text, this.scene);
  }
}
test("fire LOD reduces transparent surfaces and smoke on small or low-quality views", () => {
  assert.deepEqual(fireDetail(80, 1), { planes: 2, smoke: 4 });
  assert.deepEqual(fireDetail(25, 1), { planes: 1, smoke: 2 });
  assert.deepEqual(fireDetail(8, 1), { planes: 1, smoke: 0 });
  assert.deepEqual(fireDetail(80, 0.3), { planes: 1, smoke: 0 });
});
test("light receiver segments respect walls and open passages", () => {
  const wall = { x: 0, z: 0, w: 0.4, d: 5 };
  assert.equal(lightBlocked({ x: -2, z: 0 }, { x: 2, z: 0 }, wall), true);
  assert.equal(lightBlocked({ x: -2, z: 4 }, { x: 2, z: 4 }, wall), false);
  assert.equal(lightBlocked({ x: -2, z: 0 }, { x: -0.2, z: 0 }, wall), false);
});
test("fires use a fixed light/smoke budget, pause out of view, and bins share physical collision", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("test", new Vector3(0, 25, -15), scene);
  camera.setTarget(new Vector3(0, 0, 10));
  scene.activeCamera = camera;
  const world = new TestWorld(
    scene,
    new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  try {
    world.build();
    for (const bin of BURNING_BINS)
      assert.equal(blocked(bin.x, bin.z, 0.3, world.obstacles), true);
    const lights = new CombatLighting(world);
    world.lighting = lights;
    const warzone = new Warzone(world, 1);
    warzone.update(0.016);
    lights.fire(0, new Vector3(BURNING_BINS[0].x, 1.6, BURNING_BINS[0].z), 1.9);
    lights.update(0.2);
    assert.ok(
      lights.lights[0].includedOnlyMeshes.some(
        (m) => m.name === "walkable floor",
      ),
      "fire above its bin illuminates the floor",
    );
    const meshCount = scene.meshes.length;
    for (let i = 0; i < 100; i++) {
      warzone.update(0.016);
      lights.pulse(new Vector3(0, 1, 0));
      lights.update(0.016);
    }
    assert.equal(lights.lights.length, 4);
    assert.equal(scene.meshes.length, meshCount);
    assert.equal(
      scene.spriteManagers.find((m) => m.name === "warzone smoke pool")!.sprites
        .length,
      12,
    );
    assert.ok(lights.lights.every((l) => !l.getShadowGenerator()));
    lights.update(0.1);
    assert.equal(lights.lights[3].intensity, 0);
    camera.position.set(1000, 25, 1000);
    camera.setTarget(new Vector3(1000, 0, 1010));
    warzone.update(0.016);
    assert.ok(lights.lights.slice(0, 3).every((l) => l.intensity === 0));
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("legacy ground fire pool expires and remains bounded", async () => {
  const { groundFireOpacity } = await import("../effects/filmedFire");
  const { GroundFires } = await import("../effects/groundFire");
  assert.equal(groundFireOpacity(0), 1);
  assert.equal(groundFireOpacity(3), 1);
  assert.equal(groundFireOpacity(4), 0.5);
  assert.equal(groundFireOpacity(5), 0);
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const fires = new GroundFires(scene, {
      url: "/vfx/kenney/fire.png",
      cellSize: 512,
      frames: 1,
      fps: 24,
    });
    fires.emit(new Vector3(1, 0, 2), 2);
    const sprite = scene.spriteManagers[0].sprites[0];
    fires.update(4);
    assert.equal(sprite.color.a, 0.5);
    assert.equal(sprite.isVisible, true);
    fires.update(1);
    assert.equal(sprite.color.a, 0);
    assert.equal(sprite.isVisible, false);
    for (let i = 0; i < 100; i++) fires.emit(Vector3.Zero(), 2);
    assert.equal(scene.spriteManagers[0].sprites.length, 8);
    fires.update(5);
    assert.ok(scene.spriteManagers[0].sprites.every((s) => !s.isVisible));
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("large explosions do not allocate ground fire, while filmed impacts reuse bounded pools", async () => {
  const { FilmedImpacts } = await import("../effects/filmedImpacts");
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const shadows = new ShadowGenerator(
      256,
      new DirectionalLight("sun", new Vector3(0, -1, 0), scene),
    );
    const world = new World(scene, shadows);
    world.explosions.burst(
      Vector3.Zero(),
      "#ffaa22",
      2.2,
      "bazookaExplosion",
      "large",
    );
    assert.ok(
      !(scene.spriteManagers ?? []).some((m) => m.name.includes("ground fire")),
    );
    const effects = new FilmedImpacts(scene);
    for (let i = 0; i < 30; i++) effects.emit("rc", Vector3.Zero());
    const manager = scene.spriteManagers.find((m) => m.name === "filmed rc")!;
    assert.equal(manager.sprites.length, 12);
    effects.update(4.1);
    assert.ok(manager.sprites.every((s) => !s.isVisible));
    effects.emit("rc", Vector3.Zero());
    assert.equal(manager.sprites.length, 12);
    assert.equal(manager.sprites.filter((s) => s.isVisible).length, 1);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
