import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine, Scene, Vector3 } from "@babylonjs/core";
import { LookoutRounds, lookoutFlightTime } from "./lookoutRounds";
test("Lookout travel scales with distance and caps at 100 milliseconds", () => {
  assert.equal(lookoutFlightTime(0), 0);
  assert.equal(lookoutFlightTime(40), 0.05);
  assert.equal(lookoutFlightTime(80), 0.1);
  assert.equal(lookoutFlightTime(350), 0.1);
});
test("the tracer travels as a short segment and the locked hit resolves only once on arrival", () => {
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
  assert.ok(tracer.position.z > 15 && tracer.position.z < 21);
  assert.ok(tracer.scaling.y <= 3);
  rounds.update(0.025);
  assert.equal(hits, 1);
  assert.equal(rounds.pending, 0);
  rounds.update(1);
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
