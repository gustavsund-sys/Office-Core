import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Mesh,
  MeshBuilder,
  Vector3,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { ServerLookout, type LookoutActor } from "../../server/lookout";
import { LOOKOUT, lookoutPose } from "./lookoutConfig";
import { office01 } from "../maps/office01";
import type { NetEvent } from "../../shared/protocol";
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  class TestWorld extends World {
    override label(text: string) {
      return new Mesh(text, this.scene);
    }
  }
  const world = new TestWorld(
    scene,
    new ShadowGenerator(64, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  const events: NetEvent[] = [];
  const system = new ServerLookout(world, (e) => events.push(e));
  const makeActor = () =>
    ({
      team: "RED",
      connected: true,
      player: {
        root: new Mesh("pilot", scene),
        gun: new Mesh("gun", scene),
        hp: 100,
        bossLookoutKey: false,
        bossLookoutActive: false,
        bodyMeshes: [],
        verticalVelocity: 0,
      },
      weapons: { onHit: () => {} },
    }) as unknown as LookoutActor;
  const actor = makeActor(),
    other = makeActor();
  const actors = new Map([
    ["a", actor],
    ["b", other],
  ]);
  const enter = () => {
    actor.player.bossLookoutKey = true;
    actor.player.root.position.copyFrom(lookoutPose(-1).door);
    system.command("a", actor, { action: "interact" }, false);
  };
  return { engine, scene, system, actor, other, actors, enter, events };
}
test("online Lookout requires earned nearby key, atomically claims a turret and releases it", () => {
  const s = setup();
  try {
    s.system.reset(s.actors, "RED");
    s.system.command("a", s.actor, { action: "interact" }, false);
    assert.equal(s.actor.player.bossLookoutKey, false);
    const zone = office01.weaponEnds.find((z) => z.x < 0)!;
    s.actor.player.root.position.set(zone.x, 1.6, zone.z - 5);
    s.system.command("a", s.actor, { action: "interact" }, false);
    assert.equal(s.actor.player.bossLookoutKey, true);
    assert.equal(s.system.keys.size, 0);
    s.actor.player.root.position.copyFrom(lookoutPose(-1).door);
    s.system.command("a", s.actor, { action: "interact" }, false);
    assert.equal(s.system.snapshot("a")?.ammo, 100);
    s.other.player.bossLookoutKey = true;
    s.other.player.root.position.copyFrom(lookoutPose(-1).door);
    s.system.command("b", s.other, { action: "interact" }, false);
    assert.equal(s.system.snapshot("b"), undefined);
    s.system.command("a", s.actor, { action: "exit" }, false);
    assert.equal(s.actor.player.bossLookoutActive, false);
    assert.equal(s.actor.player.root.position.y, 0);
    s.system.command("b", s.other, { action: "interact" }, false);
    assert.ok(s.system.snapshot("b"));
  } finally {
    s.engine.dispose();
  }
});
test("online Lookout clamps aim, ignores malformed controls and stops stale, crouched or dead firing", () => {
  const s = setup();
  try {
    s.enter();
    s.system.command(
      "a",
      s.actor,
      { action: "aim", yaw: NaN, pitch: 0, fire: true, crouched: false },
      false,
    );
    s.system.update(0.1, s.actors);
    assert.equal(s.events.length, 0);
    const aim = {
      action: "aim",
      yaw: Math.PI / 2,
      pitch: 0.24,
      fire: true,
      crouched: false,
    };
    s.system.command("a", s.actor, aim, false);
    s.system.update(0.1, s.actors);
    assert.equal(s.events.length, 1);
    assert.equal(s.system.snapshot("a")?.ammo, 99);
    s.system.update(0.31, s.actors);
    assert.equal(s.events.length, 1);
    s.system.command("a", s.actor, { ...aim, crouched: true }, false);
    s.system.update(0.1, s.actors);
    assert.equal(s.events.length, 1);
    assert.equal(s.actor.player.root.scaling.y, 0.48);
    s.system.command("a", s.actor, { ...aim, yaw: 999, pitch: -999 }, false);
    assert.equal(s.system.snapshot("a")?.pitch, -1.3);
    assert.ok(s.system.snapshot("a")!.yaw <= lookoutPose(-1).yaw + 1.2);
    s.actor.player.hp = 0;
    s.system.update(0.1, s.actors);
    assert.equal(s.system.snapshot("a"), undefined);
  } finally {
    s.engine.dispose();
  }
});
test("online turret resolves damage on server at tracer arrival and records the hit once", () => {
  const s = setup();
  try {
    s.enter();
    let hp = 100,
      hits = 0;
    const target = {
      get hp() {
        return hp;
      },
      damage: (n: number) => (hp -= n),
      canDamageFrom: () => true,
    };
    const mesh = MeshBuilder.CreateBox("target", { size: 2 }, s.scene);
    mesh.position.set(-60, LOOKOUT.height + LOOKOUT.eyeHeight, 0);
    mesh.metadata = { damageable: target };
    mesh.computeWorldMatrix(true);
    s.actor.weapons.onHit = () => hits++;
    s.system.command(
      "a",
      s.actor,
      {
        action: "aim",
        yaw: Math.PI / 2,
        pitch: 0,
        fire: true,
        crouched: false,
      },
      false,
    );
    s.system.update(0.01, s.actors);
    assert.equal(hp, 100);
    assert.equal(s.events.length, 1);
    s.system.command(
      "a",
      s.actor,
      {
        action: "aim",
        yaw: Math.PI / 2,
        pitch: 0,
        fire: false,
        crouched: false,
      },
      false,
    );
    s.system.update(0.1, s.actors);
    assert.equal(hp, 92);
    assert.equal(hits, 1);
    s.system.update(0.1, s.actors);
    assert.equal(hits, 1);
    s.system.reset(s.actors);
    assert.equal(s.system.pilots.size, 0);
    assert.equal(s.actor.player.bossLookoutKey, false);
  } finally {
    s.engine.dispose();
  }
});
