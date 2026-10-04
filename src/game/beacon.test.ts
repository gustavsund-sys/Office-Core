import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  GroundMesh,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Player } from "../player/player";
import { Beacons, BEACON, type BeaconActor } from "./beacon";
import { Weapons } from "../weapons/system";
import { validInput } from "../../shared/protocol";
class TestWorld extends World {
  override label(text: string) {
    return new GroundMesh(text, this.scene);
  }
}
function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const world = new TestWorld(
    scene,
    new ShadowGenerator(
      64,
      new DirectionalLight("sun", new Vector3(0, -1, 0), scene),
    ),
  );
  const beacons = new Beacons(world);
  const actor = (
    id: string,
    team: "RED" | "BLUE",
    x: number,
    z: number,
  ): BeaconActor => {
    const player = new Player(world);
    player.root.position.set(x, 0, z);
    const target = {
      get hp() {
        return player.hp;
      },
      canDamageFrom: () => true,
      damage: (n: number) => {
        if (player.invulnerable <= 0) player.hp = Math.max(0, player.hp - n);
      },
    };
    for (const m of player.bodyMeshes) {
      m.isPickable = true;
      m.metadata = { damageable: target };
      m.computeWorldMatrix(true);
    }
    return { id, team, player };
  };
  return {
    world,
    beacons,
    actor,
    close: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}
test("beacon retains special weapon, takes separate inventory and respawns with announcement at 180 seconds", () => {
  const s = setup();
  try {
    const drop = s.beacons.drops[0],
      a = s.actor("a", "RED", drop.x, drop.z),
      w = new Weapons(
        a.player,
        () => {},
        () => {},
      );
    w.equip("bazooka");
    assert.equal(s.beacons.acquire(a), true);
    assert.equal(s.beacons.acquire(a), false);
    assert.equal(w.specialWeapon, "bazooka");
    assert.equal(w.id, "bazooka");
    let announcements = 0;
    s.beacons.onEvent = (e) => {
      if (e.kind === "available") {
        announcements++;
        assert.equal(e.team, "RED");
      }
    };
    s.beacons.update(179, [a]);
    assert.equal(announcements, 0);
    assert.equal(drop.cooldown, 1);
    s.beacons.update(1, [a]);
    assert.equal(announcements, 1);
    assert.equal(drop.cooldown, 0);
    s.beacons.reset();
    assert.equal(s.beacons.carried.size, 0);
  } finally {
    s.close();
  }
});
test("beacon selects nearest visible enemy, never teammates, charges three seconds and ignores dead targets", () => {
  const s = setup();
  try {
    const owner = s.actor("owner", "RED", 0, -8);
    s.beacons.carried.add(owner.id);
    assert.equal(s.beacons.place(owner), true);
    const friend = s.actor("friend", "RED", 0, -4),
      near = s.actor("near", "BLUE", 2, -4),
      far = s.actor("far", "BLUE", 7, -3),
      outside = s.actor("outside", "BLUE", 20, 0);
    const actors = [owner, friend, near, far, outside];
    let shots = 0;
    s.beacons.onEvent = (e) => {
      if (e.kind === "shot") shots++;
    };
    s.beacons.update(2.9, actors);
    assert.equal(near.player.hp, 100);
    assert.equal(s.beacons.snapshot()[0].target, "near");
    s.beacons.update(0.1, actors);
    assert.equal(near.player.hp, 100 - BEACON.damage);
    assert.equal(friend.player.hp, 100);
    assert.equal(far.player.hp, 100);
    assert.equal(shots, 1);
    near.player.hp = 0;
    s.beacons.update(2.9, actors);
    assert.equal(s.beacons.snapshot()[0].target, "far");
    assert.equal(far.player.hp, 100);
    s.beacons.update(0.1, actors);
    assert.equal(far.player.hp, 75);
    far.player.hp = 0;
    s.beacons.update(3, actors);
    assert.equal(s.beacons.snapshot()[0].target, undefined);
    assert.equal(outside.player.hp, 100);
  } finally {
    s.close();
  }
});
test("walls block beacon targeting and placement; beacon is destroyed at 100 damage; reset removes robots", () => {
  const s = setup();
  try {
    const owner = s.actor("owner", "BLUE", 0, -8);
    s.beacons.carried.add(owner.id);
    const wall = s.world.box("wall", 0, 1, -6.7, 3, 2, 0.4, "#888888", true);
    wall.computeWorldMatrix(true);
    assert.equal(s.beacons.place(owner), false);
    assert.equal(s.beacons.carried.has(owner.id), true);
    wall.setEnabled(false);
    assert.equal(s.beacons.place(owner), true);
    const enemy = s.actor("enemy", "RED", 0, 0);
    wall.position.z = -3;
    wall.setEnabled(true);
    wall.computeWorldMatrix(true);
    s.beacons.update(3, [owner, enemy]);
    assert.equal(enemy.player.hp, 100);
    assert.equal(s.beacons.snapshot()[0].target, undefined);
    wall.setEnabled(false);
    s.beacons.update(3, [owner, enemy]);
    assert.equal(enemy.player.hp, 75);
    const r = [...s.beacons.robots.values()][0];
    r.targetable.damage(40);
    assert.equal(r.hp, 60);
    r.targetable.damage(60);
    assert.equal(s.beacons.robots.size, 0);
    s.beacons.carried.add(owner.id);
    assert.equal(s.beacons.place(owner), true);
    s.beacons.reset();
    assert.equal(s.beacons.robots.size, 0);
  } finally {
    s.close();
  }
});
test("beacon uses the fire button and rejects a separate placement input", () => {
  const input = {
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
  assert.equal(validInput({ ...input, pressed: true, fire: true }), true);
  assert.equal(validInput({ ...input, beacon: true }), false);
  assert.equal(validInput({ ...input, beacon: "true" }), false);
});

test("authoritative room handles pickup and placement, replicates robot HP and restores special weapon", async () => {
  const { OfficeRoom } = await import("../../server/room");
  const room = new OfficeRoom();
  room.roomId = "beacon-room";
  const events: import("../../shared/protocol").NetEvent[] = [];
  room.event = (e) => events.push(e);
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  try {
    await room.onJoin(
      { sessionId: "red", send: () => {} } as never,
      { name: "Red", team: "RED" },
      { uid: "red" },
    );
    await room.onJoin(
      { sessionId: "blue", send: () => {} } as never,
      { name: "Blue", team: "BLUE" },
      { uid: "blue" },
    );
    room.started = true;
    const red = room.participants.get("red")!,
      blue = room.participants.get("blue")!,
      d = room.pickup.beacons.drops[0];
    red.player.root.position.set(d.x, 0, d.z);
    red.weapons.equip("pulseGun");
    red.lastInput = Date.now();
    red.input = {
      moveX: 0,
      moveZ: 0,
      aimX: d.x,
      aimZ: d.z + 10,
      fire: false,
      pressed: false,
      jump: false,
      interact: true,
      slot: 0,
    };
    room.tick(0.01);
    assert.equal(
      room.snapshot().players.find((p) => p.id === "red")?.beacon,
      true,
    );
    assert.equal(red.weapons.specialWeapon, "pulseGun");
    red.input.pressed = true;
    red.lastInput = Date.now();
    room.tick(0.01);
    assert.equal(
      room.snapshot().players.find((p) => p.id === "red")?.beacon,
      false,
    );
    assert.equal(red.weapons.id, "pulseGun");
    assert.equal(room.snapshot().beacons?.length, 1);
    assert.ok(events.some((e) => e.kind === "beaconPlace" && e.team === "RED"));
    blue.player.root.position.set(d.x + 5, 0, d.z + 3);
    blue.player.invulnerable = 0;
    room.tick(3);
    assert.equal(blue.player.hp, 75);
    assert.ok(events.some((e) => e.kind === "beaconShot"));
    assert.ok(
      events.some(
        (e) => e.kind === "damage" && e.player === "blue" && e.damage === 25,
      ),
    );
    const robot = [...room.pickup.beacons.robots.values()][0];
    robot.targetable.damage(40);
    assert.equal(room.snapshot().beacons?.[0].hp, 60);
    room.completeNextRound();
    assert.equal(room.snapshot().beacons?.length, 0);
    assert.equal(
      room.snapshot().players.some((p) => p.beacon),
      false,
    );
  } finally {
    room.clock.clear();
    room.onDispose();
  }
});

test("test guard scans between poses, pauses silently and explodes into fragments on destruction", () => {
  const s = setup();
  try {
    const blue = s.actor("bot", "BLUE", 0, -8);
    const robot = s.beacons.spawnTestGuard(blue)!;
    assert.ok(robot);
    assert.equal(robot.team, "BLUE");
    assert.ok(
      Math.hypot(
        robot.x - blue.player.root.position.x,
        robot.z - blue.player.root.position.z,
      ) < 3,
    );
    s.beacons.update(0.01, [blue]);
    assert.equal(robot.moving, true);
    assert.ok(robot.pose);
    const duration = robot.pose.duration;
    const motion = robot.motionId;
    s.beacons.update(duration, [blue]);
    assert.equal(robot.moving, false);
    const yaw = robot.yaw;
    s.beacons.update(0.3, [blue]);
    assert.equal(robot.yaw, yaw);
    assert.equal(robot.moving, false);
    assert.equal(robot.motionId, motion);
    for (let i = 0; i < 30 && robot.motionId === motion; i++)
      s.beacons.update(0.05, [blue]);
    assert.equal(robot.motionId, (motion ?? 0) + 1);
    assert.equal(robot.moving, true);
    robot.targetable.damage(100);
    assert.equal(s.beacons.robots.size, 0);
    assert.ok(s.world.explosions.particles.some((p) => p.kind === "debris"));
    assert.ok(s.world.explosions.particles.some((p) => p.kind === "flash"));
  } finally {
    s.close();
  }
});

test("beacon fires before its aim settles, misses a visible enemy and strikes intervening cover along the barrel direction", () => {
  const s = setup();
  try {
    const owner = s.actor("owner", "RED", 0, -8);
    s.beacons.carried.add("owner");
    assert.equal(s.beacons.place(owner), true);
    const enemy = s.actor("enemy", "BLUE", 0, 0),
      r = [...s.beacons.robots.values()][0];
    const wall = s.world.box(
      "side cover",
      3,
      1,
      r.z,
      0.3,
      2,
      4,
      "#888888",
      true,
    );
    wall.computeWorldMatrix(true);
    const events: import("./beacon").BeaconEvent[] = [];
    s.beacons.onEvent = (e) => events.push(e);
    r.target = "enemy";
    r.yaw = Math.PI / 2;
    r.charge = 2.9;
    r.pose = {
      from: Math.PI / 2,
      to: 0,
      fromPitch: 0,
      toPitch: 0,
      elapsed: 0,
      duration: 10,
    };
    s.beacons.update(0.1, [owner, enemy]);
    assert.equal(enemy.player.hp, 100);
    assert.equal(r.charge, 0);
    assert.equal(events.filter((e) => e.kind === "shot").length, 1);
    const impact = events.find((e) => e.kind === "impact")!;
    assert.ok(impact);
    assert.ok(Math.abs(impact.position.x - 2.73) < 0.05);
    assert.equal(impact.material, "metal");
    r.pose = undefined;
    r.yaw = 0;
    r.pitch = 0;
    r.charge = 2.9;
    s.beacons.update(0.1, [owner, enemy]);
    assert.equal(enemy.player.hp, 75);
  } finally {
    s.close();
  }
});

test("beacon remembers enemies behind cover without blind fire and resumes only after sight returns", () => {
  const s = setup();
  try {
    const owner = s.actor("owner", "RED", 0, -8),
      enemy = s.actor("enemy", "BLUE", 0, 0);
    s.beacons.carried.add(owner.id);
    assert.equal(s.beacons.place(owner), true);
    const events: import("./beacon").BeaconEvent[] = [];
    s.beacons.onEvent = (e) => events.push(e);
    s.beacons.update(3, [owner, enemy]);
    assert.equal(enemy.player.hp, 75);
    const cover = s.world.box("cover", 0, 1, -3, 3, 2, 0.3, "#888888", true);
    cover.computeWorldMatrix(true);
    s.beacons.update(1, [owner, enemy]);
    assert.equal(s.beacons.snapshot()[0].target, "enemy");
    assert.equal(s.beacons.snapshot()[0].charge, 0);
    s.beacons.update(1, [owner, enemy]);
    assert.equal(events.filter((e) => e.kind === "shot").length, 1);
    assert.equal(enemy.player.hp, 75);
    cover.setEnabled(false);
    s.beacons.update(0.1, [owner, enemy]);
    assert.equal(events.filter((e) => e.kind === "shot").length, 1);
    s.beacons.update(2.9, [owner, enemy]);
    assert.equal(enemy.player.hp, 50);
    cover.setEnabled(true);
    s.beacons.update(4.1, [owner, enemy]);
    assert.equal(s.beacons.snapshot()[0].target, undefined);
    assert.equal(events.filter((e) => e.kind === "shot").length, 2);
  } finally {
    s.close();
  }
});
