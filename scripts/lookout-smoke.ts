// Isolated local server only. Test fixtures are never exposed by production.
import assert from "node:assert/strict";
import { Client, type Room } from "colyseus.js";
import { MSG, type Snapshot } from "../shared/protocol";
import { OfficeRoom } from "../server/room";
import { lookoutPose } from "../src/game/lookoutConfig";
import { office01 } from "../src/maps/office01";
process.env.DEV_ALLOW_GUEST = "true";
process.env.PORT = "2569";
process.env.ALLOWED_ORIGINS = "http://127.0.0.1:5173";
await import("../server/index");
const client = new Client("ws://127.0.0.1:2569", {
  headers: { Origin: "http://127.0.0.1:5173" },
});
const connections: Room[] = [];
const wait = (room: Room, predicate: (s: Snapshot) => boolean) =>
  new Promise<Snapshot>((resolve, reject) => {
    const timer = setTimeout(() => {
      remove();
      reject(new Error("Lookout snapshot timeout"));
    }, 8000);
    const remove = room.onMessage(MSG.snapshot, (s: Snapshot) => {
      if (predicate(s)) {
        clearTimeout(timer);
        remove();
        resolve(s);
      }
    });
  });
let exitCode = 0;
try {
  const lobby = (await (await fetch("http://127.0.0.1:2569/rooms")).json())
    .rooms[0];
  const a = await client.joinById(lobby.id, {
    token: "local:lookout-a",
    name: "Turret test",
    team: "RED",
  });
  connections.push(a);
  a.onMessage(MSG.event, () => {});
  a.onMessage(MSG.snapshot, () => {});
  const b = await client.joinById(lobby.id, {
    token: "local:lookout-b",
    name: "Observer test",
    team: "BLUE",
  });
  connections.push(b);
  b.onMessage(MSG.event, () => {});
  b.onMessage(MSG.snapshot, () => {});
  a.send(MSG.start);
  await wait(a, (s) => !!s.preparing);
  a.send(MSG.loadout, { weapon: "machineGun", skill: "pulseTrap" });
  b.send(MSG.loadout, { weapon: "huntingRifle", skill: "superMedkit" });
  await wait(a, (s) => s.started);
  const server = OfficeRoom.rooms.get(lobby.id)!;
  const actor = server.participants.get(a.sessionId)!;
  // Simulate an earned reward, then use only actual WebSocket commands.
  server.lookout.reset(server.participants, "RED");
  const zone = office01.weaponEnds.find((z) => z.x < 0)!;
  actor.player.root.position.set(zone.x, 1.6, zone.z - 5);
  a.send(MSG.lookout, { action: "interact" });
  await wait(
    a,
    (s) => !!s.players.find((p) => p.id === a.sessionId)?.lookoutKey,
  );
  actor.player.root.position.copyFrom(lookoutPose(-1).door);
  a.send(MSG.lookout, { action: "interact" });
  const entered = await wait(
    b,
    (s) => !!s.players.find((p) => p.id === a.sessionId)?.lookout,
  );
  assert.equal(entered.players.find((p) => p.id === a.sessionId)!.y, 20);
  let shots = 0;
  b.onMessage(MSG.event, (e) => {
    if (e.kind === "turretTrace") shots++;
  });
  a.send(MSG.lookout, {
    action: "aim",
    yaw: Math.PI / 2,
    pitch: 0.3,
    fire: true,
    crouched: false,
  });
  await wait(
    b,
    (s) =>
      (s.players.find((p) => p.id === a.sessionId)?.lookout?.ammo ?? 100) < 100,
  );
  assert.ok(shots > 0, "observer receives turret tracers");
  a.send(MSG.lookout, {
    action: "aim",
    yaw: Math.PI / 2,
    pitch: 0.3,
    fire: false,
    crouched: true,
  });
  await wait(
    b,
    (s) => !!s.players.find((p) => p.id === a.sessionId)?.lookout?.crouched,
  );
  a.send(MSG.lookout, { action: "exit" });
  const exited = await wait(
    b,
    (s) => !s.players.find((p) => p.id === a.sessionId)?.lookout,
  );
  assert.equal(exited.players.find((p) => p.id === a.sessionId)!.y, 0);
  console.log(
    "PASS: two WebSocket clients, server key pickup, turret entry, observer state/tracers, ammunition, crouch and exit",
  );
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  for (const room of connections) await room.leave(true);
  process.exit(exitCode);
}
