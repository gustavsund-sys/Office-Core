import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  MeshBuilder,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { RCCars, RC, predictRCVisual } from "./rcCar";
import { validLoadout, applyLoadout } from "./loadout";
import { validInput } from "../../shared/protocol";
import { rcCarModel, rcCarDebris } from "./rcCarModel";
import { World } from "../map/builder";
import type { RCActor } from "./rcCar";
import { Weapons } from "../weapons/system";
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = {
    scene,
    obstacles: [],
    explosions: { burst: () => {} },
  } as unknown as World;
  const system = new RCCars(world);
  const root = new TransformNode("pilot", scene);
  const actor = {
    id: "pilot",
    team: "RED",
    player: { root, hp: 100, grounded: true },
    weapons: {
      utilityKind: "rcCar",
      utilityCount: 2,
      pulseTrapSelected: true,
      remoteControlled: false,
      switchSlot: () => {},
    },
  } as unknown as RCActor;
  return { engine, scene, world, system, actor };
}
test("RC deployment consumes one skill, bounds driving and restores special after the three-second watch", () => {
  const { engine, system, actor } = setup();
  system.command(actor, undefined, true);
  assert.equal(actor.weapons.utilityCount, 1);
  assert.equal(actor.weapons.remoteControlled, true);
  const start = system.snapshot()[0].z;
  for (let i = 0; i < 30; i++) {
    system.command(actor, { throttle: 1, yaw: 0, detonate: false }, false);
    system.update(1 / 30, [actor]);
  }
  assert.ok(system.snapshot()[0].z > start + 2);
  assert.ok(system.snapshot()[0].speed <= RC.speed);
  let restored = 0;
  actor.weapons.switchSlot = () => {
    restored++;
  };
  system.command(actor, { throttle: 0, yaw: 0, detonate: true }, false);
  assert.equal(system.snapshot().length, 0);
  assert.equal(system.controlling("pilot"), true);
  system.update(2.9, [actor]);
  assert.equal(restored, 0);
  system.update(0.11, [actor]);
  assert.equal(restored, 1);
  assert.equal(actor.weapons.remoteControlled, false);
  engine.dispose();
});
test("RC collision, stale controls, blocked deployment and disconnect do not leave an active vehicle", () => {
  const { engine, world, system, actor } = setup();
  world.obstacles.push({ x: 0, z: 2, w: 4, d: 0.2 });
  system.command(actor, undefined, true);
  for (let i = 0; i < 60; i++) {
    system.command(actor, { throttle: 1, yaw: 0, detonate: false }, false);
    system.update(1 / 30, [actor]);
  }
  assert.ok(system.snapshot()[0].z <= 1.36);
  system.remove("pilot");
  world.obstacles.push({ x: 0, z: 0.95, w: 2, d: 1 });
  system.command(actor, undefined, true);
  assert.equal(system.snapshot().length, 0);
  assert.equal(actor.weapons.utilityCount, 1);
  world.obstacles = [];
  system.command(actor, undefined, true);
  system.command(actor, { throttle: 1, yaw: 0, detonate: false }, false);
  system.update(0.35, [actor]);
  assert.equal(system.snapshot()[0].speed, 0);
  actor.connected = false;
  system.update(0.03, [actor]);
  assert.equal(system.snapshot().length, 0);
  assert.equal(actor.weapons.remoteControlled, false);
  engine.dispose();
});
test("RC blast damages once per target, falls off and respects solid cover", () => {
  const { engine, scene, system, actor } = setup();
  system.command(actor, undefined, true);
  const z = system.snapshot()[0].z;
  const hits: number[] = [];
  const target = {
    hp: 100,
    canDamageFrom: () => true,
    damage(amount: number) {
      this.hp -= amount;
      hits.push(amount);
    },
  };
  for (let i = 0; i < 2; i++) {
    const mesh = MeshBuilder.CreateBox("target", { size: 0.4 }, scene);
    mesh.position.set(0, 0.7, z + 1);
    mesh.metadata = { damageable: target };
    mesh.computeWorldMatrix(true);
  }
  const wall = MeshBuilder.CreateBox(
    "cover",
    { width: 2, height: 2, depth: 0.2 },
    scene,
  );
  wall.position.set(0, 1, z + 0.5);
  wall.metadata = { solid: true };
  wall.computeWorldMatrix(true);
  system.detonate("pilot");
  assert.equal(hits.length, 0);
  wall.dispose();
  system.watches.clear();
  actor.weapons.utilityCount = 1;
  system.command(actor, undefined, true);
  system.detonate("pilot");
  assert.equal(hits.length, 1);
  assert.ok(hits[0] > 0 && hits[0] < RC.damage);
  engine.dispose();
});
test("RC input accepts only bounded valid controls and is a valid starting skill", () => {
  assert.ok(validLoadout({ weapon: "bazooka", skill: "rcCar" }));
  const base = {
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimZ: 0,
    fire: false,
    pressed: false,
    jump: false,
    interact: false,
    slot: 0,
  };
  assert.ok(
    validInput({ ...base, rc: { throttle: -1, yaw: Math.PI, detonate: true } }),
  );
  for (const rc of [
    null,
    { throttle: 2, yaw: 0, detonate: false },
    { throttle: 0, yaw: Infinity, detonate: false },
    { throttle: 0, yaw: 0, detonate: 1 },
    { throttle: 0, yaw: 0, detonate: false, inject: true },
  ])
    assert.equal(validInput({ ...base, rc }), false);
});
test("RC model is approximately eight percent wider than the Pulse Trap", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    world = new World(scene);
  const model = rcCarModel(world);
  model.root.computeWorldMatrix(true);
  const meshes = model.root.getChildMeshes();
  meshes.forEach((m) => m.computeWorldMatrix(true));
  const bounds = model.root.getHierarchyBoundingVectors();
  const width = bounds.max.x - bounds.min.x;
  assert.ok(width > 1.05 * 1.05 && width < 1.05 * 1.12, `${width}`);
  engine.dispose();
});

test("RC debris fades and expires without changing or disposing cached model materials", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    world = new World(scene);
  const before = rcCarModel(world);
  const materials = new Set(
    before.root.getChildMeshes().map((m) => m.material!),
  );
  let disposed = 0;
  for (const material of materials)
    material.onDisposeObservable.add(() => disposed++);
  rcCarDebris(world, Vector3.Zero());
  assert.ok(world.explosions.particles.length > 0);
  world.explosions.update(2.5);
  for (const material of materials) assert.equal(material.alpha, 1);
  world.explosions.update(0.3);
  assert.equal(disposed, 0);
  const after = rcCarModel(world);
  assert.equal(
    after.root.getChildMeshes().length,
    before.root.getChildMeshes().length,
  );
  for (const material of materials)
    assert.ok(scene.materials.includes(material));
  engine.dispose();
});

test("RC turning rate is proportional to steering offset in both directions", () => {
  const turn = (offset: number) => {
    const { engine, system, actor } = setup();
    system.command(actor, undefined, true);
    system.command(actor, { throttle: 1, yaw: offset, detonate: false }, false);
    system.update(1 / 30, [actor]);
    const rate = system.snapshot()[0].steer;
    engine.dispose();
    return rate;
  };
  const small = turn(0.09),
    large = turn(0.9);
  assert.ok(Math.abs(large / small - 10) < 0.001);
  assert.equal(turn(0), 0);
  assert.ok(Math.abs(turn(-0.9) + large) < 0.001);
  assert.equal(RC.speed, 5.5 * 1.2);
  assert.ok(Math.abs(RC.reverse - 3 * 1.2) < 1e-10);
});

test("RC visual prediction bridges network gaps, caps stale motion and respects walls", () => {
  const state = {
    id: 1,
    owner: "pilot",
    team: "RED" as const,
    x: 0,
    z: 0,
    yaw: 0,
    speed: 6.6,
    steer: 1,
    hp: 100,
  };
  const next = predictRCVisual(state, 0.05, []);
  assert.ok(next.z > 0 && next.yaw > 0);
  assert.deepEqual(
    predictRCVisual(state, 1, []),
    predictRCVisual(state, 0.1, []),
  );
  const stopped = predictRCVisual({ ...state, steer: 0 }, 0.1, [
    { x: 0, z: 0.7, w: 4, d: 0.2 },
  ]);
  assert.ok(stopped.z <= 0.051);
  assert.equal(state.z, 0);
});

test("RC keyboard controls turn with A/D and detonate with E, not fire", async () => {
  const { RCSession } = await import("./rcSession");
  const keys = new Set<string>(["KeyW", "KeyD"]);
  const context = {
    states: [{ owner: "test", yaw: 0 }],
    owner: "test",
    input: { keys, remoteSteer: -1 },
  };
  const control = (fire: boolean) =>
    RCSession.prototype.control.call(context as never, fire)!;
  assert.equal(control(true).detonate, false);
  assert.equal(control(false).throttle, 1);
  assert.ok(control(false).yaw > 0);
  keys.clear();
  keys.add("KeyS");
  keys.add("KeyA");
  assert.equal(control(false).throttle, -1);
  assert.ok(control(false).yaw < 0);
  keys.add("KeyE");
  assert.equal(control(false).detonate, true);
});

test("RC steering ramps with hold time and stays independent of frame rate", async () => {
  const { rampRCSteering } = await import("./rcSession");
  const simulate = (fps: number, seconds: number) => {
    let steer = 0;
    for (let i = 0; i < Math.round(fps * seconds); i++)
      steer = rampRCSteering(steer, 1, 1 / fps);
    return steer;
  };
  assert.ok(simulate(60, 0.1) < 0.2);
  assert.equal(simulate(60, 1), 1);
  assert.ok(Math.abs(simulate(30, 0.5) - simulate(120, 0.5)) < 0.001);
  assert.ok(rampRCSteering(1, -1, 1 / 60) < 0);
  assert.ok(rampRCSteering(1, 0, 0.1) < 0.5);
});
