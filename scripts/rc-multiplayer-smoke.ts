import assert from "node:assert/strict";
import { Client, type Room } from "colyseus.js";
import { MSG, type Snapshot, type NetInput } from "../shared/protocol";
import { SnapshotReceiver, type StreamPacket } from "../src/network/streams";
const endpoint = "ws://127.0.0.1:2568";
const clients: Room[] = [];
const states = new Map<string, Snapshot>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wait(check: () => boolean, timeout = 6000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw Error("RC test timed out");
    await sleep(40);
  }
}
try {
  const list = await (await fetch("http://127.0.0.1:2568/rooms")).json();
  const id = list.rooms.find((r: any) => !r.started).id;
  for (let i = 0; i < 2; i++) {
    const room = await new Client(endpoint, {
      headers: { Origin: "http://127.0.0.1:5173" },
    }).joinById(id, {
      token: `local:rc${i}`,
      name: `RC Test ${i}`,
      team: i ? "BLUE" : "RED",
    });
    clients.push(room);
    const receiver = new SnapshotReceiver();
    room.onMessage(MSG.snapshot, (packet: StreamPacket | Snapshot) => {
      const s = "stream" in packet ? receiver.decode(packet) : packet;
      if (s) states.set(room.sessionId, s);
    });
    room.onMessage(MSG.event, () => {});
    room.onMessage(MSG.chat, () => {});
    room.send(MSG.netReady, { stream: 2 });
  }
  const [a, b] = clients;
  await wait(
    () => !!states.get(a.sessionId)?.players.some((p) => p.id === b.sessionId),
  );
  a.send(MSG.start);
  await wait(() => !!states.get(a.sessionId)?.preparing);
  a.send(MSG.loadout, { weapon: "machineGun", skill: "rcCar" });
  b.send(MSG.loadout, { weapon: "machineGun", skill: "superMedkit" });
  await wait(() => !!states.get(a.sessionId)?.started);
  const own = () =>
    states.get(a.sessionId)!.players.find((p) => p.id === a.sessionId)!;
  const initial = { x: own().x, z: own().z };
  let seq = 1;
  const base = (): NetInput => ({
    seq: seq++,
    moveX: 0,
    moveZ: 0,
    aimX: own().x,
    aimZ: own().z + 5,
    fire: false,
    pressed: false,
    jump: false,
    interact: false,
    slot: 0,
  });
  a.send(MSG.input, { ...base(), slot: 3 });
  await wait(() => !!own().pulseTrapSelected);
  a.send(MSG.input, { ...base(), pressed: true });
  await wait(() => !!states.get(a.sessionId)?.rcCars?.length);
  assert.equal(own().utilityCount, 1);
  assert.ok(own().rcRemote);
  const start = states.get(a.sessionId)!.rcCars![0];
  for (let i = 0; i < 30; i++) {
    a.send(MSG.input, {
      ...base(),
      moveZ: 1,
      jump: true,
      fire: true,
      rc: { throttle: 1, yaw: start.yaw, detonate: false },
    });
    await sleep(34);
  }
  assert.equal(own().x, initial.x);
  assert.equal(own().z, initial.z);
  assert.equal(own().y, 0);
  assert.equal(own().ammo, 100);
  const moved = states.get(a.sessionId)!.rcCars![0];
  assert.ok(Math.hypot(moved.x - start.x, moved.z - start.z) > 0.15);
  a.send(MSG.input, {
    ...base(),
    rc: { throttle: 0, yaw: start.yaw, detonate: true },
  });
  await wait(() => states.get(a.sessionId)?.rcCars?.length === 0);
  assert.ok(own().rcRemote);
  await sleep(1800);
  assert.ok(own().rcRemote);
  await wait(() => !own().rcRemote, 3500);
  assert.equal(own().weapon, "machineGun");
  console.log(
    "PASS: RC loadout, streamed car, frozen pilot, blocked jump/gunfire, driving, detonation, three-second watch and restored special weapon",
  );
} finally {
  await Promise.allSettled(clients.map((c) => c.leave()));
}
