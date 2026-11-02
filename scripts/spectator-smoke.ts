import assert from "node:assert/strict";
import { Client, type Room } from "colyseus.js";
import { SnapshotReceiver, type StreamPacket } from "../src/network/streams";
import { MSG, type Snapshot } from "../shared/protocol";
const endpoint = process.env.GAME_SERVER_URL ?? "ws://127.0.0.1:26789";
const http = endpoint.replace(/^ws/, "http");
const client = () => new Client(endpoint, { headers: { Origin: "http://127.0.0.1:5173" } });
const wait = (room: Room, predicate: (snapshot: Snapshot) => boolean) => new Promise<Snapshot>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Snapshot timed out")), 10000);
  const receiver = new SnapshotReceiver();
  const off = room.onMessage(MSG.snapshot, (packet: Snapshot | StreamPacket) => {
    const snapshot = "stream" in packet ? receiver.decode(packet) : packet;
    if (snapshot && predicate(snapshot)) { clearTimeout(timer); off(); resolve(snapshot); }
  });
});
const rooms: Room[] = [];
try {
  const lobby = (await (await fetch(`${http}/rooms`)).json()).rooms[0];
  const a = await client().joinById(lobby.id, { token: "local:spectate-a", name: "Alice", team: "RED" }); rooms.push(a);
  const b = await client().joinById(lobby.id, { token: "local:spectate-b", name: "Bob", team: "BLUE" }); rooms.push(b);
  a.send(MSG.start); await wait(a, s => !!s.preparing);
  a.send(MSG.loadout, { weapon: "machineGun", skill: "pulseTrap" });
  b.send(MSG.loadout, { weapon: "pulseGun", skill: "superMedkit" });
  await wait(a, s => s.started);
  for (let i = 0; i < 6; i++) {
    const player = await client().joinById(lobby.id, { token: `local:spectate-extra-${i}`, name: `Extra ${i}`, team: i % 2 ? "BLUE" : "RED" });
    rooms.push(player);
  }
  await wait(a, s => s.players.length === 8);
  const watch = await client().joinById(lobby.id, { token: "local:spectate-observer", spectator: true }); rooms.push(watch);
  const state = await wait(watch, s => s.started && s.players.length === 8);
  assert.equal(state.players.some(p => p.id === watch.sessionId), false);
  const receiver = new SnapshotReceiver();
  const streamed = new Promise<Snapshot>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Spectator stream timed out")), 5000);
    const off = watch.onMessage(MSG.snapshot, (packet: StreamPacket) => {
      if (!("stream" in packet)) return;
      const frame = receiver.decode(packet);
      if (frame) { clearTimeout(timer); off(); resolve(frame); }
    });
  });
  watch.send(MSG.netReady, { stream: 2 });
  assert.equal((await streamed).players.length, 8);
  const listed = (await (await fetch(`${http}/rooms`)).json()).rooms[0];
  assert.equal(listed.players.length, 8); assert.equal(listed.capacity, 8);
  watch.send(MSG.netReady, { stream: 2 });
  watch.send(MSG.input, { seq: 1, moveX: 1, moveZ: 0, aimX: 0, aimZ: 0, fire: true, pressed: true, jump: false, interact: false, slot: 0 });
  assert.equal((await wait(a, s => s.players.length === 8)).players.length, 8);
  const playerLeaving = rooms[rooms.length - 2];
  await playerLeaving.leave();
  rooms.splice(rooms.length - 2, 1);
  await wait(a, s => s.players.length === 7);
  await watch.leave(); rooms.pop();
  const joined = await client().joinById(lobby.id, { token: "local:spectate-observer", name: "Viewer", team: "RED" }); rooms.push(joined);
  assert.ok((await wait(joined, s => s.players.length === 8)).players.some(p => p.id === joined.sessionId));
  console.log("Spectator receives snapshots without a player slot and can join after leaving spectator mode.");
} finally {
  await Promise.allSettled(rooms.map(room => room.leave()));
}
