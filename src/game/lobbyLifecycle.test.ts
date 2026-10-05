import { test } from "node:test";
import assert from "node:assert/strict";
import { OfficeRoom } from "../../server/room";
import type { Client } from "@colyseus/core";

test("late arrivals wait safely for equipment; new series preserves roster and clears scores", async () => {
  const room = new OfficeRoom();
  room.roomId = "lifecycle-test";
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  try {
    const client = (sessionId: string) => ({ sessionId, send: () => {} }) as unknown as Client;
    room.onJoin(client("a"), { name: "Alice", team: "RED" }, { uid: "a" });
    room.started = true;
    room.onJoin(client("b"), { name: "Bob", team: "BLUE" }, { uid: "b" });
    const late = room.participants.get("b")!;
    assert.equal(late.awaitingLoadout, true);
    assert.equal(late.player.hp, 0);
    room.tick(1 / 30);
    assert.equal(late.respawn, 0);
    assert.equal(late.player.root.isEnabled(), false);
    room.wins = { RED: 3, BLUE: 1 };
    room.winner = room.seriesWinner = "RED";
    room.round = 4;
    room.participants.get("a")!.kills = 9;
    await room.restartFinishedMatch();
    assert.equal(room.participants.size, 2);
    assert.equal(room.participants.get("a")!.name, "Alice");
    assert.equal(room.participants.get("b")!.team, "BLUE");
    assert.deepEqual(room.wins, { RED: 0, BLUE: 0 });
    assert.equal(room.round, 1);
    assert.equal(room.started, false);
    assert.equal(room.seriesWinner, undefined);
    assert.equal(room.participants.get("a")!.kills, 0);
    assert.equal(late.awaitingLoadout, false);
    assert.equal(late.loadout, undefined);
  } finally {
    room.onDispose();
  }
});
