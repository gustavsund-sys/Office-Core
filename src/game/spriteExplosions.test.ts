import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine, Scene, FreeCamera, Vector3 } from "@babylonjs/core";
import { SpriteExplosions, explosionDetail } from "../effects/spriteExplosions";
import { benchmarkRandom } from "./benchmarkTimeline";
test("sprite explosion detail drops with screen size and quality", () => {
  const near = explosionDetail(150, 1),
    far = explosionDetail(10, 1),
    low = explosionDetail(150, 0.3);
  assert.ok(far.spark < near.spark && far.smoke < near.smoke);
  assert.ok(low.fire < near.fire && low.spark < near.spark);
  assert.equal(far.light, false);
  assert.equal(near.light, true);
});
test("repeated sprite bursts reuse a bounded pool and clear expired effects", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("test", new Vector3(0, 10, -10), scene);
  scene.activeCamera = camera;
  try {
    const effects = new SpriteExplosions(scene);
    const capacity = scene.spriteManagers.reduce(
      (n, m) => n + m.sprites.length,
      0,
    );
    for (let i = 0; i < 100; i++)
      effects.burst(
        Vector3.Zero(),
        "#ffcf56",
        1.5,
        false,
        1,
        benchmarkRandom(i),
      );
    assert.ok(effects.count <= capacity);
    assert.ok(effects.count > 0);
    assert.equal(
      scene.spriteManagers.reduce((n, m) => n + m.sprites.length, 0),
      capacity,
    );
    for (let i = 0; i < 300; i++) {
      effects.muzzle(Vector3.Zero(), i % 2 === 0);
      effects.impact(Vector3.Zero(), "metal", true, 1);
      effects.impact(Vector3.Zero(), "wood", true, 0.3);
    }
    assert.ok(effects.count <= capacity);
    effects.update(10);
    assert.equal(effects.count, 0);
    effects.burst(Vector3.Zero(), "#ff66cb", 1.5, true, 1, benchmarkRandom(7));
    assert.ok(effects.count > 0);
    assert.equal(
      scene.spriteManagers.reduce((n, m) => n + m.sprites.length, 0),
      capacity,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("CC0 comparison lazily loads bounded pools and expires every pack", async () => {
  const { CC0Comparison } = await import("../effects/cc0Comparison");
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const fx = new CC0Comparison(scene);
    assert.equal(scene.spriteManagers?.length ?? 0, 0);
    for (const pack of ["sheet", "more", "smoke", "hybrid"] as const) {
      for (let i = 0; i < 100; i++) fx.burst(pack, Vector3.Zero(), 2);
    }
    assert.equal(scene.spriteManagers.length, 4);
    assert.ok(fx.count <= 96);
    fx.update(5);
    assert.equal(fx.count, 0);
    fx.burst("hybrid", Vector3.Zero(), 1);
    assert.equal(fx.count, 2);
    assert.equal(scene.spriteManagers.length, 4);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("weapon explosion styles change presentation without changing event power", async () => {
  const { explosionPresentation, Explosions } =
    await import("../effects/explosions");
  assert.deepEqual(explosionPresentation(1.5, "bazookaExplosion", "normal"), {
    power: 1,
    plasma: false,
  });
  assert.deepEqual(explosionPresentation(1.5, "bazookaExplosion", "large"), {
    power: 2.2,
    plasma: false,
  });
  assert.deepEqual(explosionPresentation(2, undefined, "plasma"), {
    power: 2.2,
    plasma: true,
  });
  const effects = new Explosions({} as never);
  effects.visuals = false;
  let event: unknown;
  effects.onBurst = (_position, power, sound, style) => {
    event = { power, sound, style };
  };
  effects.burst(Vector3.Zero(), "#ffaa00", 1.5, "bazookaExplosion", "large");
  assert.deepEqual(event, {
    power: 1.5,
    sound: "bazookaExplosion",
    style: "large",
  });
});
