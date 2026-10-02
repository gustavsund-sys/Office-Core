import { test } from "node:test";
import assert from "node:assert/strict";
import { OfficeRoom } from "../../server/room";
import type { Client } from "@colyseus/core";
import type { NetEvent } from "../../shared/protocol";
import { office01 } from "../maps/office01";
test("server attributes planted bombs, broadcasts one carrier scream and reports actual player damage", async () => {
  const room = new OfficeRoom();
  room.roomId = "events-test";
  const events: NetEvent[] = [];
  room.event = (event) => events.push(event);
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  try {
    const client = { sessionId: "alice", send: () => {} } as unknown as Client;
    await room.onJoin(client, { name: "Alice", team: "RED" }, { uid: "alice" });
    const bob = { sessionId: "bob", send: () => {} } as unknown as Client;
    await room.onJoin(bob, { name: "Bob", team: "BLUE" }, { uid: "bob" });
    room.started = true;
    const p = room.participants.get("alice")!;
    p.weapons.equip("coreBuster");
    p.input = {
      moveX: 0,
      moveZ: 1,
      aimX: 0,
      aimZ: 0,
      fire: false,
      pressed: false,
      jump: false,
      interact: false,
      slot: 0,
    };
    p.lastInput = Date.now();
    room.tick(1 / 30);
    room.tick(1 / 30);
    assert.equal(events.filter((e) => e.kind === "scream").length, 0);
    p.input.warcry = true;
    room.tick(1 / 30);
    assert.equal(events.filter((e) => e.kind === "scream").length, 1);
    const carrierTarget = p.player.bodyMeshes[0].metadata.damageable;
    carrierTarget.damage(500);
    assert.equal(p.player.hp, 100);
    p.input.warcry = true;
    room.tick(1 / 30);
    assert.equal(events.filter((e) => e.kind === "scream").length, 1);
    assert.equal(
      room.snapshot().players.find((player) => player.id === "alice")!
        .warcryAvailable,
      false,
    );

    p.weapons.update(
      { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: false, pressed: false },
      4,
    );
    carrierTarget.damage(25);
    assert.equal(p.player.hp, 75);
    p.input.pressed = true;
    room.tick(1 / 30);
    const bomb = room.snapshot().bombs[0];
    assert.equal(bomb.owner, "alice");
    assert.ok(bomb.timer > 24);
    const target =
      room.participants.get("bob")!.player.bodyMeshes[0].metadata.damageable;
    target.damage(25);
    const hit = events.find((e) => e.kind === "damage" && e.player === "bob")!;
    assert.equal(hit.player, "bob");
    assert.equal(hit.damage, 25);
    const red = office01.bases.find((b) => b.team === "RED")!;
    room.participants.get("bob")!.player.root.position.set(red.x, 0, red.z);
    const blue = office01.bases.find((b) => b.team === "BLUE")!;
    p.player.root.position.set(blue.x, 0, blue.z);
    assert.deepEqual(new Set(room.snapshot().alarms), new Set(["RED", "BLUE"]));
    target.damage(100);
    p.weapons.onHit(target, 75);
    assert.equal(
      room.snapshot().players.find((p) => p.id === "alice")!.kills,
      1,
    );
    p.weapons.onHit(carrierTarget, 10);
    assert.equal(p.kills, 1);
  } finally {
    room.clock.clear();
    room.onDispose();
  }
});

test("New match closes a finished room but cannot interrupt a running match", async () => {
  const room = new OfficeRoom();
  let closed = 0;
  room.disconnect = async () => {
    closed++;
  };
  room.started = true;
  await room.restartFinishedMatch();
  assert.equal(closed, 0);
  room.winner = "RED";
  await room.restartFinishedMatch();
  assert.equal(closed, 0);
  room.seriesWinner = "RED";
  await room.restartFinishedMatch();
  assert.equal(closed, 1);
});

test("server limits teams to four players and refuses a ninth participant", () => {
  const room = new OfficeRoom();
  room.roomId = "capacity-test";
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  const join = (id: string) =>
    room.onJoin(
      { sessionId: id, send: () => {} } as unknown as Client,
      { name: id, team: "RED" },
      { uid: id },
    );
  try {
    assert.throws(
      () =>
        room.onJoin(
          { sessionId: "unnamed", send: () => {} } as unknown as Client,
          { name: "  " },
          { uid: "unnamed" },
        ),
      /Choose a name/,
    );
    assert.equal(room.maxClients, 8);
    for (let i = 0; i < 8; i++) join(`player-${i}`);
    for (const team of ["RED", "BLUE"] as const)
      assert.equal(
        [...room.participants.values()].filter((p) => p.team === team).length,
        4,
      );
    assert.equal(room.teamHasSpace("RED"), false);
    assert.equal(room.teamHasSpace("RED", "player-0"), true);
    assert.throws(() => join("player-8"), /Both teams are full/);
    assert.equal(room.participants.size, 8);
  } finally {
    room.onDispose();
  }
});

test("first-to-three series waits for every player and resets the world between rounds", async () => {
  const room = new OfficeRoom();
  room.roomId = "rounds-test";
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  try {
    for (const [id, team] of [
      ["alice", "RED"],
      ["bob", "BLUE"],
    ] as const)
      await room.onJoin(
        { sessionId: id, send: () => {} } as unknown as Client,
        { name: id, team },
        { uid: id },
      );
    room.started = true;
    const alice = room.participants.get("alice")!;
    alice.kills = 4;
    for (let win = 1; win <= 3; win++) {
      const prop = room.world.destructibles[0];
      prop.damage(prop.maxHp, "coreBuster", false);
      room.cores.find((c) => c.team === "BLUE")!.hp = 0;
      room.tick(1 / 30);
      room.tick(1 / 30);
      assert.equal(room.wins.RED, win);
      assert.equal(room.winner, "RED");
      room.ready.add("alice");
      room.tryNextRound();
      assert.equal(room.round, win);
      room.ready.add("bob");
      room.tryNextRound();
      if (win < 3) {
        assert.equal(room.round, win + 1);
        assert.equal(room.winner, undefined);
        assert.equal(prop.hp, prop.maxHp);
        assert.ok(prop.meshes.every((m) => m.isEnabled()));
        assert.equal(room.cores.find((c) => c.team === "BLUE")!.hp, 1000);
        assert.equal(alice.player.hp, 100);
        assert.equal(alice.weapons.id, "pistol");
        assert.equal(alice.kills, 4);
        assert.equal(room.ready.size, 0);
      } else {
        assert.equal(room.seriesWinner, "RED");
        assert.equal(room.round, 3);
      }
    }
  } finally {
    room.onDispose();
  }
});
