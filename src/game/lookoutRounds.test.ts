import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine, Scene, Vector3 } from "@babylonjs/core";
import {
  LookoutRounds,
  lookoutFlightTime,
  impactCenterToRef,
  lookoutTracerWidth,
} from "./lookoutRounds";
test("Lookout travel scales with distance and caps at 100 milliseconds", () => {
  assert.equal(lookoutFlightTime(0), 0);
  assert.equal(lookoutFlightTime(40), 0.05);
  assert.equal(lookoutFlightTime(80), 0.1);
  assert.equal(lookoutFlightTime(350), 0.1);
});
test("the tracer travels visibly and the locked hit resolves once before its afterimage fades", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    rounds = new LookoutRounds(scene, false);
  let hits = 0;
  const tracer = rounds.launch(
    Vector3.Zero(),
    new Vector3(0, 0, 40),
    true,
    () => hits++,
  );
  rounds.update(0.025);
  assert.equal(hits, 0);
  assert.ok(Math.abs(tracer.position.z + tracer.scaling.y / 2 - 20) < 1e-6);
  assert.ok(tracer.scaling.y >= 15);
  rounds.update(0.025);
  assert.equal(hits, 1);
  assert.equal(rounds.pending, 0);
  assert.equal(tracer.isEnabled(), true);
  assert.ok(tracer.scaling.y > 20);
  rounds.update(0.04);
  assert.ok(tracer.visibility > 0 && tracer.visibility < 1);
  rounds.update(1);
  assert.equal(tracer.isEnabled(), false);
  assert.equal(hits, 1);
  engine.dispose();
});
test("round reset cancels pending hits; missing a surface still consumes travel time", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    rounds = new LookoutRounds(scene, false);
  let hits = 0;
  rounds.launch(Vector3.Zero(), new Vector3(0, 0, 160), false, () => hits++);
  rounds.update(0.04);
  assert.equal(hits, 0);
  rounds.clear();
  rounds.update(0.2);
  assert.equal(hits, 0);
  assert.equal(rounds.pending, 0);
  rounds.launch(Vector3.Zero(), Vector3.Zero(), false, () => hits++);
  rounds.update(0.001);
  assert.equal(hits, 1);
  engine.dispose();
});

test("impact texture contact stays anchored on floors and walls as size and angle vary", () => {
  const right = new Vector3(1, 0, 0);
  const up = new Vector3(0, 0.8, 0.6);
  for (const anchor of [new Vector3(4, 0.1, 8), new Vector3(4, 2, 8)]) {
    for (const size of [0.4, 1, 3]) {
      for (const angle of [-0.25, 0, 0.25]) {
        const center = Vector3.Zero();
        impactCenterToRef(anchor, size, angle, right, up, center);
        const contact = center
          .add(right.scale(Math.sin(angle) * size * 0.34))
          .subtract(up.scale(Math.cos(angle) * size * 0.34));
        assert.ok(Vector3.Distance(contact, anchor) < 1e-8);
        assert.ok(center.y > anchor.y);
      }
    }
  }
});

test("floor contacts emit pooled flash and dust on arrival and return sprites to the pool", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const rounds = new LookoutRounds(scene);
  const ground = new Vector3(0, 0.06, 10);
  rounds.launch(new Vector3(0, 20, 0), ground, true, () => {}, Vector3.Up());
  rounds.update(0.05);
  const flash = scene.spriteManagers.find(
    (manager) => manager.name === "Lookout impact flash",
  )!;
  const dust = scene.spriteManagers.find(
    (manager) => manager.name === "Lookout impact dust",
  )!;
  assert.ok(
    flash.sprites.some(
      (sprite) => sprite.isVisible && sprite.position.y > ground.y,
    ),
  );
  assert.ok(dust.sprites.some((sprite) => sprite.isVisible));
  assert.equal(flash.sprites.length, 64);
  rounds.update(1);
  assert.equal(flash.sprites.filter((sprite) => sprite.isVisible).length, 0);
  rounds.launch(new Vector3(0, 20, 0), ground, true, () => {});
  rounds.update(0.05);
  assert.equal(flash.sprites.length, 64);
  rounds.clear();
  scene.dispose();
  engine.dispose();
});

test("unscoped tracers stay legible at range without making scoped tracers oversized", () => {
  assert.ok(lookoutTracerWidth(80, 1, 1080) > 0.08);
  assert.equal(lookoutTracerWidth(80, 0.2, 1080), 0.028);
  assert.equal(lookoutTracerWidth(1, 1, 1080), 0.028);
  assert.equal(lookoutTracerWidth(350, 1, 720), 0.12);
});

test("filmed sparks count every fifth floor contact per shooter, after arrival only", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  let sparks = 0;
  const rounds = new LookoutRounds(scene, true, () => sparks++);
  const start = new Vector3(0, 20, 0);
  for (let i = 0; i < 4; i++)
    rounds.launch(
      start,
      new Vector3(0, 0.06, 10),
      true,
      () => {},
      Vector3.Up(),
      "a",
    );
  rounds.launch(
    start,
    new Vector3(0, 2, 10),
    true,
    () => {},
    new Vector3(0, 0, -1),
    "a",
  );
  rounds.launch(
    start,
    new Vector3(0, 0.06, 10),
    false,
    () => {},
    Vector3.Up(),
    "a",
  );
  rounds.launch(
    start,
    new Vector3(0, 0.06, 10),
    true,
    () => {},
    Vector3.Up(),
    "b",
  );
  rounds.update(0.1);
  assert.equal(sparks, 0);
  rounds.launch(
    start,
    new Vector3(0, 0.06, 10),
    true,
    () => {},
    Vector3.Up(),
    "a",
  );
  assert.equal(sparks, 0);
  rounds.update(0.1);
  assert.equal(sparks, 1);
  rounds.clear();
  rounds.launch(
    start,
    new Vector3(0, 0.06, 10),
    true,
    () => {},
    Vector3.Up(),
    "a",
  );
  rounds.update(0.1);
  assert.equal(sparks, 1);
  scene.dispose();
  engine.dispose();
});
