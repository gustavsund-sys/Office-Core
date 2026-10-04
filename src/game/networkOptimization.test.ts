import { networkAim } from "../network/aim";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeSnapshot, decodeSnapshot } from "../network/snapshots";
import { NetworkTiming } from "../network/timing";
import { takeInputs, INPUT_STEP } from "../../server/inputQueue";
import type { Snapshot, NetInput } from "../../shared/protocol";
import {
  NullEngine,
  Scene,
  MeshBuilder,
  TransformNode,
  Ray,
  Vector3,
} from "@babylonjs/core";
import { HitHistory } from "../../server/rewind";
import type { Player } from "../player/player";
import { beam, releaseEffect } from "./effectPool";
test("delta reconstructs changes, removals and cleared optional fields without mutating baseline", () => {
  const a = {
    seq: 1,
    serverTime: 100,
    players: [
      { id: "a", name: "Alpha", x: 1, beacon: true },
      { id: "b", name: "Beta" },
    ],
    pickups: Array.from({ length: 50 }, (_, id) => ({ id, x: id })),
  } as unknown as Snapshot;
  const b = {
    ...a,
    seq: 2,
    serverTime: 150,
    players: [{ id: "a", name: "Alpha", x: 2 }],
  } as unknown as Snapshot;
  const packet = encodeSnapshot(a, b);
  assert.deepEqual(decodeSnapshot(a, packet), b);
  assert.equal((a.players[0] as any).beacon, true);
  assert.equal(decodeSnapshot({ ...a, seq: 0 }, packet), undefined);
  assert.ok(JSON.stringify(packet).length < JSON.stringify(b).length / 2);
});
test("input catchup preserves discrete edges and consumes only available movement credit", () => {
  const make = (seq: number, extra = {}) =>
    ({
      seq,
      slot: 0,
      pressed: false,
      jump: false,
      interact: false,
      warcry: false,
      ...extra,
    }) as NetInput;
  const queue = [
    make(1),
    make(2, { pressed: true }),
    make(3),
    make(4, { interact: true }),
    make(5),
  ];
  assert.deepEqual(
    takeInputs(queue, INPUT_STEP).map((i) => i.seq),
    [1],
  );
  assert.deepEqual(
    takeInputs(queue, 0.1).map((i) => i.seq),
    [2, 3, 4],
  );
  assert.deepEqual(
    takeInputs(queue, INPUT_STEP).map((i) => i.seq),
    [5],
  );
  const burst = Array.from({ length: 11 }, (_, i) => make(i + 1));
  const replayed: number[] = [];
  let credit = 11 * INPUT_STEP;
  while (burst.length) {
    const batch = takeInputs(burst, credit);
    assert.ok(batch.length <= 3);
    replayed.push(...batch.map((i) => i.seq!));
    credit -= batch.length * INPUT_STEP;
  }
  assert.deepEqual(
    replayed,
    Array.from({ length: 11 }, (_, i) => i + 1),
  );
  const fresh = [make(6)];
  assert.equal(takeInputs(fresh, 0).length, 0);
  assert.equal(fresh.length, 1);
});
test("interpolation adapts to jitter within bounded latency", () => {
  const timing = new NetworkTiming();
  for (let i = 0; i < 40; i++) timing.observe(10000 + i * 50, i * 50);
  const stable = timing.delay;
  for (let i = 40; i < 60; i++)
    timing.observe(10000 + i * 50, i * 50 + (i % 2 ? 90 : 0));
  assert.ok(timing.delay > stable);
  assert.ok(timing.delay <= 160 && timing.delay >= 65);
  assert.ok(Number.isFinite(timing.renderTime(4000)));
});
test("rewind hits historical player, restores position and respects walls and new lives", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("target", scene);
  const body = MeshBuilder.CreateBox("body", { size: 1 }, scene);
  body.parent = root;
  body.metadata = { damageable: { hp: 100 } };
  const player = { root, bodyMeshes: [body], hp: 100 } as unknown as Player;
  const shooter = { bodyMeshes: [] } as unknown as Player;
  const actors = [{ id: "a", player, life: 1 }];
  const history = new HitHistory();
  root.position.set(0, 0, 5);
  history.record(1000, actors);
  root.position.x = 3;
  history.record(1100, actors);
  body.computeWorldMatrix(true);
  const ray = new Ray(Vector3.Zero(), Vector3.Forward(), 10);
  assert.equal(
    history.pick(scene, ray, shooter, actors, 1000, 1100)?.pickedMesh,
    body,
  );
  assert.equal(root.position.x, 3);
  assert.equal(
    history.pick(scene, ray, shooter, [{ ...actors[0], life: 2 }], 1000, 1100)
      ?.hit,
    false,
  );
  const wall = MeshBuilder.CreateBox("wall", { size: 1 }, scene);
  wall.position.z = 2;
  wall.metadata = { solid: true };
  wall.computeWorldMatrix(true);
  assert.equal(
    history.pick(scene, ray, shooter, actors, 1000, 1100)?.pickedMesh,
    wall,
  );
  scene.dispose();
  engine.dispose();
});
test("transient beams reuse geometry after expiry", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const a = beam(scene, Vector3.Zero(), Vector3.Forward(), 0.1);
  releaseEffect(a);
  const b = beam(scene, Vector3.Zero(), new Vector3(3, 0, 0), 0.2);
  assert.equal(a, b);
  assert.equal(b.scaling.y, 3);
  assert.equal(scene.meshes.length, 1);
  scene.dispose();
  engine.dispose();
});

test("delta updates a single object field and numeric array entry", () => {
  const a = {
    seq: 1,
    serverTime: 1,
    players: [],
    props: [100, 100],
    pickups: [{ x: 3, z: 2, active: true }],
    beacons: [{ id: 1, x: 5, hp: 100, yaw: 0 }],
  } as unknown as Snapshot;
  const b = {
    ...a,
    seq: 2,
    serverTime: 2,
    props: [100, 50],
    pickups: [{ x: 3, z: 2, active: false }],
    beacons: [{ id: 1, x: 5, hp: 100, yaw: 1 }],
  } as unknown as Snapshot;
  const delta = encodeSnapshot(a, b);
  assert.deepEqual(decodeSnapshot(a, delta), b);
  assert.deepEqual(a.props, [100, 100]);
  assert.ok("delta" in delta);
  assert.equal(delta.state.set.pickups, undefined);
});
test("rewind never exceeds 200 ms or projects into the future", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const root = new TransformNode("target", scene);
  const body = MeshBuilder.CreateBox("body", { size: 1 }, scene);
  body.parent = root;
  body.metadata = { damageable: { hp: 100 } };
  const player = { root, bodyMeshes: [body], hp: 100 } as unknown as Player;
  const shooter = { bodyMeshes: [] } as unknown as Player;
  const actors = [{ id: "a", player, life: 1 }];
  const history = new HitHistory();
  root.position.set(0, 0, 5);
  history.record(1000, actors);
  root.position.x = 2;
  history.record(1100, actors);
  root.position.x = 3;
  history.record(1300, actors);
  body.computeWorldMatrix(true);
  const ray = new Ray(Vector3.Zero(), Vector3.Forward(), 10);
  assert.equal(
    history.pick(scene, ray, shooter, actors, 1000, 1300)?.hit,
    false,
  );
  assert.equal(
    history.pick(scene, ray, shooter, actors, 2000, 1300)?.hit,
    false,
  );
  assert.equal(root.position.x, 3);
  scene.dispose();
  engine.dispose();
});

test("off-canvas aim remains bounded without changing its direction", () => {
  const x = 65,
    z = -25,
    target = networkAim(x, z, 10000, -8000);
  assert.ok(Math.abs(target.aimX) < 200 && Math.abs(target.aimZ) < 200);
  assert.ok(
    Math.abs(
      Math.atan2(target.aimX - x, target.aimZ - z) -
        Math.atan2(10000 - x, -8000 - z),
    ) < 1e-10,
  );
  assert.deepEqual(networkAim(0, 0, 2, 3), { aimX: 2, aimZ: 3 });
  assert.ok(Number.isFinite(networkAim(0, 0, NaN, Infinity).aimZ));
});
