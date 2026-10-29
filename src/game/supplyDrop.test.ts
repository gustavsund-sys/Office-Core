import test from "node:test";
import assert from "node:assert/strict";
import { SupplyDrop, supplyLocations } from "./supplyDrop";
import { supplyDropHeight } from "./supplyDropVisuals";
import { OfficeRoom } from "../../server/room";
import { office01 } from "../maps/office01";
import type { Client } from "@colyseus/core";

const actors = ["alice", "bob"].map((id) => ({ sessionId: id, send() {} }) as unknown as Client);
test("only the trailing team can request once at its zone, with a thirty second descent", () => {
  const drop = new SupplyDrop();
  const wins = { RED: 0, BLUE: 1 } as const;
  assert.equal(drop.request("BLUE", wins, 82.5, 46, []), false);
  assert.equal(drop.request("RED", wins, 0, 0, []), false);
  assert.equal(drop.request("RED", { RED: 0, BLUE: 0 }, -82.5, 46, []), false);
  assert.equal(drop.request("RED", wins, -82.5, 46, []), true);
  assert.equal(drop.state!.remaining, 30);
  const firstPlace = { x: drop.state!.x, z: drop.state!.z };
  assert.deepEqual(drop.state!.items.map((p) => p.kind).sort(), ["coreBuster", "coreBuster", "beacon", "beacon", "bossKey", "bossKey", "shield", "shield", "shield"].sort());
  assert.equal(drop.collect(drop.state!.items[0].x, drop.state!.items[0].z, () => true), undefined);
  drop.update(29.9);
  assert.ok(drop.state!.remaining > 0);
  assert.equal(drop.update(0.1), "landed");
  const item = drop.state!.items[0];
  assert.equal(drop.collect(item.x, item.z, (kind) => kind === "bossKey"), "bossKey");
  assert.equal(drop.collect(item.x, item.z, (kind) => kind === "bossKey"), undefined);
  const busters = drop.state!.items.filter((reward) => reward.kind === "coreBuster");
  assert.equal(busters.length, 2);
  for (const buster of busters) {
    assert.equal(drop.collect(buster.x, buster.z, () => false), undefined);
    assert.equal(buster.available, true);
    assert.equal(drop.collect(buster.x, buster.z, (kind) => kind === "coreBuster"), "coreBuster");
    assert.equal(drop.collect(buster.x, buster.z, (kind) => kind === "coreBuster"), undefined);
  }
  assert.equal(drop.request("RED", wins, -82.5, 46, []), false);
  drop.reset();
  assert.equal(drop.state, undefined);
  assert.equal(drop.started, false);
  assert.equal(drop.request("RED", wins, -82.5, 46, []), true);
  assert.deepEqual({ x: drop.state!.x, z: drop.state!.z }, firstPlace);
});

test("real office has clear drop locations and spaced rewards", () => {
  const room = new OfficeRoom(); room.roomId = "supply-map"; room.onCreate({ hosted: true });
  room.clock.clear(); room.setSimulationInterval(undefined as never); room.setPatchRate(null);
  try {
    const places = supplyLocations(room.world.obstacles);
    assert.ok(places.length > 0, "map must have a valid landing site");
    for (const item of places[0].items) for (const other of places[0].items)
      if (item !== other) assert.ok(Math.hypot(item.x - other.x, item.z - other.z) > 2.5);
    for (const team of ["RED", "BLUE"] as const) {
      const base = office01.bases.find((b) => b.team === team)!;
      const zone = office01.weaponEnds.find((p) => team === "RED" ? p.x < 0 : p.x > 0)!;
      const wins = team === "RED" ? { RED: 0, BLUE: 1 } : { RED: 1, BLUE: 0 };
      assert.equal(room.supplyDrop.request(team, wins, zone.x, zone.z, room.world.obstacles), true);
      const state = room.supplyDrop.state!;
      assert.ok(Math.hypot(state.x - base.x, state.z - base.z) < 20);
      const fixed = [state.x, state.z];
      room.supplyDrop.reset();
      assert.equal(room.supplyDrop.request(team, wins, zone.x, zone.z, []), true);
      assert.deepEqual([room.supplyDrop.state!.x, room.supplyDrop.state!.z], fixed);
      room.supplyDrop.reset();
    }
  } finally { room.onDispose(); }
});

test("server snapshots preserve independent supply state across collection", async () => {
  const room = new OfficeRoom(); room.roomId = "supply-snapshot"; room.onCreate({ hosted: true });
  room.clock.clear(); room.setSimulationInterval(undefined as never); room.setPatchRate(null);
  try {
    await room.onJoin(actors[0], { name: "Alice", team: "RED" }, { uid: "alice" });
    await room.onJoin(actors[1], { name: "Bob", team: "BLUE" }, { uid: "bob" });
    room.started = true;
    room.wins = { RED: 0, BLUE: 1 };
    const red = room.participants.get("alice")!;
    const blue = room.participants.get("bob")!;
    red.player.root.position.set(-82.5, 0, 46);
    blue.player.root.position.set(82.5, 0, 46);
    room.wins = { RED: 1, BLUE: 1 };
    assert.equal(room.requestSupply(actors[0]), false, "red cannot request at a tie");
    assert.equal(room.requestSupply(actors[1]), false, "blue cannot request at a tie");
    room.wins = { RED: 0, BLUE: 1 };
    assert.equal(room.requestSupply(actors[1]), false, "leading team cannot request");
    assert.equal(room.requestSupply(actors[0]), true, "trailing team can request immediately");
    assert.equal(room.requestSupply(actors[0]), false, "one per round");
    room.supplyDrop.update(30);
    const before = room.snapshot();
    const item = room.supplyDrop.state!.items[0];
    assert.equal(room.supplyDrop.collect(item.x, item.z, (kind) => kind === "bossKey"), "bossKey");
    const after = room.snapshot();
    assert.equal(before.supplyDrop!.items[0].available, true);
    assert.equal(after.supplyDrop!.items[0].available, false);
    room.completeNextRound();
    assert.equal(room.supplyDrop.state, undefined);
  } finally { room.onDispose(); }
});

test("crate descends 70 metres in 30 seconds and reaches the surface at zero", () => {
  assert.equal(supplyDropHeight(30), 70);
  assert.equal(supplyDropHeight(15), 35);
  assert.equal(supplyDropHeight(0), 0);
  assert.equal(supplyDropHeight(-1), 0);
  assert.equal(supplyDropHeight(40), 70);
});
