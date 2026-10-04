import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CombatLedger,
  validTeamPing,
  highlights,
  emptyPerformance,
} from "./engagement";
import { OfficeRoom } from "../../server/room";
import type { Client } from "@colyseus/core";
import { MSG } from "../../shared/protocol";
test("assists require recent meaningful damage and round reset preserves series statistics", () => {
  const ledger = new CombatLedger();
  ledger.hit("helper", "victim", 20, 1);
  ledger.hit("expired", "victim", 70, -10);
  ledger.hit("small", "victim", 3, 2);
  ledger.kill("killer", "victim", 3, true);
  assert.equal(ledger.totals.get("helper")?.assists, 1);
  assert.equal(ledger.totals.get("expired"), undefined);
  assert.equal(ledger.totals.get("small"), undefined);
  assert.equal(ledger.totals.get("killer")?.defense, 1);
  assert.equal(ledger.damage.size, 0);
  ledger.add("helper", "disarms");
  ledger.add("helper", "coreDamage", 200);
  ledger.resetRound();
  assert.equal(ledger.round.size, 0);
  assert.equal(ledger.totals.get("helper")?.coreDamage, 200);
  assert.deepEqual(
    highlights([{ name: "Medic", ...emptyPerformance(), disarms: 2 }]),
    [{ title: "Rundans räddning", name: "Medic", value: 2 }],
  );
});
test("team pings reject malformed coordinates and unrecognized commands", () => {
  for (const value of [
    null,
    {},
    { kind: "enemy", x: NaN, z: 0 },
    { kind: "help", x: 0, z: Infinity },
    { kind: "enemy", x: 201, z: 0 },
    { kind: "cheat", x: 0, z: 0 },
  ])
    assert.equal(validTeamPing(value), false);
  assert.equal(validTeamPing({ kind: "defend", x: 82, z: 0 }), true);
});
test("server sends pings only to teammates, rate-limits spam and cancels countdown on disconnect", async () => {
  const room = new OfficeRoom();
  room.roomId = "engagement-test";
  room.event = () => {};
  room.onCreate({ hosted: true });
  room.clock.clear();
  room.setSimulationInterval(undefined as never);
  room.setPatchRate(null);
  const messages: { id: string; type: string; value: unknown }[] = [];
  const clients = ["alice", "eve", "bob"].map(
    (id) =>
      ({
        sessionId: id,
        send: (type: string, value: unknown) =>
          messages.push({ id, type, value }),
      }) as unknown as Client,
  );
  try {
    for (let i = 0; i < clients.length; i++) {
      await room.onJoin(
        clients[i],
        { name: clients[i].sessionId, team: i === 2 ? "BLUE" : "RED" },
        { uid: clients[i].sessionId },
      );
      room.clients.push(clients[i]);
    }
    room.started = true;
    messages.length = 0;
    room.handleTeamPing(clients[0], {
      kind: "enemy",
      x: 0,
      z: 0,
      name: "spoofed",
      team: "BLUE",
    });
    assert.deepEqual(
      messages.filter((m) => m.type === MSG.teamPing).map((m) => m.id),
      ["alice", "eve"],
    );
    assert.equal((messages[0].value as { name: string }).name, "alice");
    room.handleTeamPing(clients[0], { kind: "enemy", x: 0, z: 0 });
    assert.equal(messages.length, 2);
    const victim =
      room.participants.get("bob")!.player.bodyMeshes[0].metadata.damageable;
    victim.damage(30);
    room.participants.get("eve")!.weapons.onHit(victim, 30);
    victim.damage(70);
    room.participants.get("alice")!.weapons.onHit(victim, 70);
    assert.equal(
      room.snapshot().players.find((p) => p.id === "eve")?.assists,
      1,
    );
    assert.equal(
      room.snapshot().players.find((p) => p.id === "alice")?.kills,
      1,
    );
    room.winner = "RED";
    for (const client of clients) room.ready.add(client.sessionId);
    room.tryNextRound();
    assert.equal(room.snapshot().countdown, 3);
    room.participants.get("bob")!.connected = false;
    room.tick(0.1);
    assert.equal(room.snapshot().countdown, undefined);
    assert.equal(room.round, 1);
  } finally {
    room.clients.length = 0;
    room.onDispose();
  }
});
