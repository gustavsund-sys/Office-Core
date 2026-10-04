import { SnapshotReceiver, type StreamPacket } from "../src/network/streams";
import assert from "node:assert/strict";
import { Client, type Room } from "colyseus.js";
import { MSG, type Snapshot } from "../shared/protocol";
import { decodeSnapshot, type SnapshotDelta } from "../src/network/snapshots";
const endpoint = process.env.GAME_SERVER_URL ?? "ws://127.0.0.1:2568";
if (!/^ws:\/\/(127\.0\.0\.1|localhost):/.test(endpoint))
  throw Error("Local test server required");
const rtt = Math.max(0, Number(process.env.TEST_RTT_MS ?? 0));
const jitter = Math.max(0, Number(process.env.TEST_JITTER_MS ?? 0));
const sendAt = new Map<string, number>(),
  receiveAt = new Map<string, number>();
const delivery = new WeakMap<Map<string, number>, Map<string, Promise<void>>>();
let closing = false;
function delayed(id: string, order: Map<string, number>, fn: () => void) {
  const at = Math.max(
    (order.get(id) ?? 0) + 1,
    Date.now() + rtt / 2 + Math.random() * jitter,
  );
  order.set(id, at);
  let channel = delivery.get(order);
  if (!channel) {
    channel = new Map();
    delivery.set(order, channel);
  }
  const previous = channel.get(id) ?? Promise.resolve();
  channel.set(
    id,
    previous.then(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, at - Date.now())),
      );
      if (!closing) fn();
    }),
  );
}
const origin = "http://127.0.0.1:5173";
const rooms: Room[] = [];
const states = new Map<string, Snapshot>();
let wire = 0,
  full = 0,
  deltas = 0,
  failures = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
try {
  const list = await (
    await fetch(endpoint.replace("ws:", "http:") + "/rooms", {
      headers: { Origin: origin },
    })
  ).json();
  const lobby = list.rooms.find((r: any) => !r.started);
  assert.ok(lobby);
  for (let n = 0; n < 8; n++) {
    const room = await new Client(endpoint, {
      headers: { Origin: origin },
    }).joinById(lobby.id, {
      token: `local:net${n}`,
      name: `Net ${n}`,
      team: n % 2 ? "BLUE" : "RED",
    });
    rooms.push(room);
    room.onMessage(MSG.event, () => {});
    room.onMessage(MSG.chat, () => {});
    let receiver = new SnapshotReceiver();
    room.onMessage(
      MSG.snapshot,
      (packet: Snapshot | SnapshotDelta | StreamPacket) =>
        delayed(room.sessionId, receiveAt, () => {
          const next =
            "stream" in packet
              ? receiver.decode(packet)
              : decodeSnapshot(states.get(room.sessionId), packet);
          if (!next) {
            failures++;
            room.send(
              MSG.netReady,
              process.env.TEST_LEGACY === "true" ? undefined : { stream: 2 },
            );
            return;
          }
          states.set(room.sessionId, next);
          if ("delta" in packet || ("stream" in packet && !packet.full)) {
            deltas++;
            wire += Buffer.byteLength(JSON.stringify(packet));
            full += Buffer.byteLength(JSON.stringify(next));
          }
        }),
    );
    room.send(
      MSG.netReady,
      process.env.TEST_LEGACY === "true" ? undefined : { stream: 2 },
    );
  }
  await sleep(500 + rtt);
  rooms.forEach((r) =>
    r.send(MSG.loadout, { weapon: "machineGun", skill: "pulseTrap" }),
  );
  await new Promise((r) => setTimeout(r, 150));
  rooms[0].send(MSG.start);
  await sleep(500 + rtt);
  assert.ok(
    [...states.values()].every((s) => s.started && s.players.length === 8),
  );
  const queues: any[][] = rooms.map(() => []);
  const sequences = rooms.map(() => 0);
  const begins = rooms.map((r) =>
    states.get(r.sessionId)!.players.find((p) => p.id === r.sessionId)!,
  );
  for (let tick = 0; tick < 120; tick++) {
    rooms.forEach((room, n) => {
      queues[n].push({
        seq: sequences[n]++,
        moveX: n % 2 ? -0.2 : 0.2,
        moveZ: 0,
        aimX: 0,
        aimZ: 0,
        fire: tick < 30 && tick % 6 === 0,
        pressed: tick < 30 && tick % 6 === 0,
        jump: false,
        interact: false,
        warcry: false,
        slot: 0,
        viewTime: states.get(room.sessionId)!.serverTime! - 85,
      });
      // Four-client burst arrivals every 100 ms; others send steadily.
      if (n < 4 || tick % 3 === 2)
        for (const input of queues[n].splice(0))
          delayed(room.sessionId, sendAt, () => room.send(MSG.input, input));
    });
    await sleep(1000 / 30);
  }
  await sleep(500 + rtt + jitter);
  assert.equal(failures, 0);
  assert.ok(deltas > 100);
  rooms.forEach((r, n) => {
    const p = states
      .get(r.sessionId)!
      .players.find((p) => p.id === r.sessionId)!;
    assert.ok(p.ack >= 110);
    assert.ok(Math.hypot(p.x - begins[n].x, p.z - begins[n].z) < 35);
  });
  console.log(
    JSON.stringify(
      {
        players: 8,
        simulatedRttMs: rtt,
        protocol:
          process.env.TEST_LEGACY === "true" ? "legacy-delta" : "streams-v2",
        arrivalJitterMs: jitter,
        deltas,
        decodeFailures: failures,
        deltaBytes: wire,
        equivalentFullBytes: full,
        health: await (
          await fetch(endpoint.replace("ws:", "http:") + "/health")
        ).json(),
        reductionPercent: Math.round((1 - wire / full) * 100),
      },
      null,
      2,
    ),
  );
} finally {
  closing = true;
  await Promise.all(rooms.map((r) => r.leave()));
}
