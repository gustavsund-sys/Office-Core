import { encodeSnapshot } from "../network/snapshots";
import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotSender, SnapshotReceiver } from "../network/streams";
import type { Snapshot, NetPlayer } from "../../shared/protocol";
function player(id = "a"): NetPlayer {
  return {
    id,
    name: id,
    team: "RED",
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    hp: 100,
    weapon: "pistol",
    ammo: 60,
    reserve: 0,
    reload: 2,
    ack: 0,
    verticalVelocity: 0,
    utilityCount: 2,
  };
}
function state(seq: number, time: number, p = player()): Snapshot {
  return {
    seq,
    serverTime: time,
    owner: "a",
    players: [p],
    cores: [],
    props: [],
    pickups: [],
    bombs: [],
    rockets: [],
    started: true,
  };
}
test("stream lanes omit unchanged inventory and advance timers from anchors", () => {
  const sender = new SnapshotSender(),
    receiver = new SnapshotReceiver();
  const first = sender.encode(state(1, 1000));
  assert.equal(receiver.decode(first)?.players[0].reload, 2);
  const next = sender.encode(
    state(2, 1050, { ...player(), x: 2, reload: 1.95 }),
  );
  assert.equal(next.slow, undefined);
  assert.equal(next.clocks, undefined);
  assert.equal(next.order, undefined);
  assert.equal(next.fast?.players[0].change.set.x, 2);
  const decoded = receiver.decode(next)!;
  assert.equal(decoded.players[0].reload, 1.95);
  assert.equal(decoded.players[0].utilityCount, 2);
  assert.equal(decoded.players[0].x, 2);
  const changed = sender.encode(
    state(3, 1100, { ...player(), x: 3, reload: 0, utilityCount: 1, kills: 2 }),
  );
  assert.equal(changed.slow?.players[0].change.set.utilityCount, 1);
  assert.equal(receiver.decode(changed)?.players[0].reload, 0);
});
test("join, removal, optional clearing, gap recovery and reset keep streams coherent", () => {
  const sender = new SnapshotSender(),
    receiver = new SnapshotReceiver();
  receiver.decode(sender.encode(state(1, 1000)));
  const b = {
    ...player("b"),
    team: "BLUE" as const,
    loadout: { weapon: "bazooka", skill: "pulseTrap" },
  };
  const s = { ...state(2, 1050), players: [player(), b] } as Snapshot;
  const joined = receiver.decode(sender.encode(s))!;
  assert.equal(joined.players.length, 2);
  assert.equal(joined.players[1].id, "b");
  assert.equal(joined.players[1].name, "b");
  assert.equal(joined.players[1].weapon, "pistol");
  const third = sender.encode({
    ...state(3, 1100),
    players: [{ ...b, loadout: undefined }],
  } as Snapshot);
  const removed = receiver.decode(third)!;
  assert.deepEqual(
    removed.players.map((p) => p.id),
    ["b"],
  );
  assert.equal(removed.players[0].loadout, undefined);
  sender.encode(state(4, 1150));
  assert.equal(receiver.decode(sender.encode(state(5, 1200))), undefined);
  const recovered = receiver.decode(
    new SnapshotSender().encode(state(6, 1250)),
  )!;
  assert.equal(recovered.players[0].id, "a");
  assert.equal(recovered.players[0].reload, 2);
});
test("bomb, drop, protection and disarm clocks progress and stop without retransmission", () => {
  const sender = new SnapshotSender(),
    receiver = new SnapshotReceiver();
  const a = {
    ...state(1, 1000, { ...player(), disarm: 1, invulnerable: 3 }),
    countdown: 3,
    bombs: [{ id: 1, x: 0, y: 0, z: 0, timer: 5 }],
    beaconDrops: [{ team: "RED" as const, x: 0, z: 0, cooldown: 180 }],
  };
  receiver.decode(sender.encode(a));
  const b = {
    ...a,
    seq: 2,
    serverTime: 1050,
    players: [
      { ...a.players[0], disarm: 1.05, invulnerable: 2.95, reload: 1.95 },
    ],
    countdown: 2.95,
    bombs: [{ ...a.bombs[0], timer: 4.95 }],
    beaconDrops: [{ ...a.beaconDrops[0], cooldown: 179.95 }],
  };
  const packet = sender.encode(b);
  assert.equal(packet.slow, undefined);
  assert.equal(packet.clocks, undefined);
  const result = receiver.decode(packet)!;
  assert.equal(result.bombs[0].timer, 4.95);
  assert.equal(result.players[0].disarm, 1.05);
  assert.equal(result.players[0].invulnerable, 2.95);
  assert.equal(result.countdown, 2.95);
  assert.equal(result.beaconDrops?.[0].cooldown, 179.95);
  const stop = receiver.decode(
    sender.encode({ ...state(3, 1100), bombs: [] }),
  )!;
  assert.equal(stop.players[0].disarm, undefined);
  assert.equal(stop.players[0].invulnerable, undefined);
  assert.equal(stop.countdown, undefined);
});
test("JSON transport preserves timer anchors and reduces traffic during timed combat", () => {
  const sender = new SnapshotSender(),
    receiver = new SnapshotReceiver();
  let previous: Snapshot | undefined;
  let legacyBytes = 0,
    streamBytes = 0;
  const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  for (let frame = 0; frame < 60; frame++) {
    const snapshot = {
      ...state(frame + 1, 1000 + frame * 50),
      players: Array.from({ length: 8 }, (_, i) => ({
        ...player(String(i)),
        x: frame * 0.1 + i,
        reload: Math.max(0, 3 - frame * 0.05),
        invulnerable: Math.max(0, 4 - frame * 0.05),
      })),
      bombs: [{ id: 99, x: 0, y: 0, z: 0, timer: 5 - frame * 0.05 }],
      beaconDrops: [
        { team: "RED" as const, x: 0, z: 0, cooldown: 180 - frame * 0.05 },
      ],
    };
    const packet = json(sender.encode(snapshot));
    const decoded = receiver.decode(packet)!;
    assert.ok(
      Math.abs(decoded.players[3].reload - snapshot.players[3].reload) < 0.076,
    );
    assert.equal(decoded.players[3].x, snapshot.players[3].x);
    assert.ok(
      Math.abs(decoded.bombs[0].timer - snapshot.bombs[0].timer) < 0.000001,
    );
    streamBytes += JSON.stringify(packet).length;
    legacyBytes += JSON.stringify(encodeSnapshot(previous, snapshot)).length;
    previous = snapshot;
  }
  assert.ok(
    streamBytes < legacyBytes * 0.8,
    `stream ${streamBytes}, legacy ${legacyBytes}`,
  );
});
test("room shares fast packets and gives a coherent full baseline after targeted resync", async () => {
  const { OfficeRoom } = await import("../../server/room");
  const room = Object.create(OfficeRoom.prototype) as InstanceType<
    typeof OfficeRoom
  >;
  const received = new Map<string, unknown[]>();
  const clients = ["a", "b", "legacy"].map((sessionId) => ({
    sessionId,
    send: (_type: string, packet: unknown) =>
      received.get(sessionId)!.push(json(packet)),
  }));
  function json<T>(packet: T): T {
    return JSON.parse(JSON.stringify(packet));
  }
  clients.forEach((c) => received.set(c.sessionId, []));
  Object.assign(room, {
    clients,
    metrics: { frames: 0 },
    frame: 0,
    optimizedClients: new Map(),
    streamClients: new Map([
      ["a", 0],
      ["b", 0],
    ]),
    streamSender: new SnapshotSender(),
    snapshot: () => state(1, 1000),
  });
  const a = new SnapshotReceiver(),
    b = new SnapshotReceiver();
  room.sendSnapshots();
  assert.equal(a.decode(received.get("a")!.pop() as any)?.players[0].id, "a");
  assert.equal(b.decode(received.get("b")!.pop() as any)?.players[0].id, "a");
  room.sendSnapshots();
  assert.ok(a.decode(received.get("a")!.pop() as any));
  assert.ok(b.decode(received.get("b")!.pop() as any));
  // Client a asks for recovery while client b retains its older baseline.
  room.streamClients.set("a", 0);
  room.sendSnapshots(clients[0] as any);
  assert.ok(a.decode(received.get("a")!.pop() as any));
  room.sendSnapshots();
  assert.ok(a.decode(received.get("a")!.pop() as any));
  assert.ok(b.decode(received.get("b")!.pop() as any));
  assert.equal("stream" in (received.get("legacy")![0] as object), false);
});
