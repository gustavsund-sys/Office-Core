import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@colyseus/core";
import { OfficeRoom } from "../../server/room";
import { MAX_PLAYERS } from "../config/game";
test("spectators receive snapshots without taking player places", async () => {
  const room = new OfficeRoom(); room.roomId = "spectator-test"; room.onCreate({ hosted: true });
  room.clock.clear(); room.setSimulationInterval(undefined as never); room.setPatchRate(null);
  const sent: string[] = [];
  const client = { sessionId: "spectator", send(type: string) { sent.push(type); } } as unknown as Client;
  try {
    assert.throws(() => room.onJoin(client, { spectator: true }, { uid: "watcher" }));
    room.started = true;
    room.onJoin(client, { spectator: true }, { uid: "watcher" });
    assert.equal(room.participants.size, 0);
    assert.equal(room.spectators.size, 1);
    assert.equal(room.maxClients, MAX_PLAYERS + 8);
    assert.ok(sent.length > 0);
    for (let i = 0; i < 7; i++) room.onJoin({ sessionId: `viewer-${i}`, send() {} } as unknown as Client, { spectator: true }, { uid: `viewer-${i}` });
    assert.equal(room.spectators.size, 8);
    assert.throws(() => room.onJoin({ sessionId: "too-many", send() {} } as unknown as Client, { spectator: true }, { uid: "too-many" }), /Spectator capacity reached/);
    await room.onLeave(client, true);
    assert.equal(room.spectators.size, 7);
  } finally { room.onDispose(); }
});
