import type { Snapshot } from "../../shared/protocol";
import {
  encodeSnapshot,
  decodeSnapshot,
  type SnapshotDelta,
  type Change,
} from "./snapshots";

type StreamChange<T extends object> = Partial<Change<T>>;
type Changes = {
  state?: StreamChange<Omit<Snapshot, "players">>;
  players?: { id: string; change: StreamChange<Snapshot["players"][number]> }[];
};
function compact<T extends object>(change: Change<T>): StreamChange<T> {
  return {
    ...(Object.keys(change.set).length ? { set: change.set } : {}),
    ...(change.clear.length ? { clear: change.clear } : {}),
    ...(Object.keys(change.arrays ?? {}).length
      ? { arrays: change.arrays }
      : {}),
  };
}
function expand<T extends object>(change?: StreamChange<T>): Change<T> {
  return {
    set: change?.set ?? {},
    clear: change?.clear ?? [],
    arrays: change?.arrays,
  };
}
export interface StreamPacket {
  stream: 2;
  full?: Snapshot;
  base?: number;
  seq: number;
  serverTime: number;
  fast?: Changes;
  slow?: Changes;
  removed?: string[];
  order?: string[];
  clocks?: Record<string, number>;
}
const fastPlayer = new Set([
  "ack",
  "verticalVelocity",
  "x",
  "y",
  "z",
  "yaw",
  "hp",
  "weapon",
  "pulseTrapSelected",
  "rcRemote",
]);
const fastState = new Set(["rockets", "beacons", "pulseTraps", "rcCars"]);
function split<T extends object>(
  change: Change<T>,
  keys: Set<string>,
  fast: boolean,
): Change<T> {
  const accept = (key: string) => keys.has(key) === fast;
  return {
    set: Object.fromEntries(
      Object.entries(change.set).filter(([k]) => accept(k)),
    ) as Partial<T>,
    clear: change.clear.filter((k) => accept(String(k))),
    arrays: Object.fromEntries(
      Object.entries(change.arrays ?? {}).filter(([k]) => accept(k)),
    ),
  };
}
function changed<T extends object>(change: Change<T>): boolean {
  return !!(
    Object.keys(change.set).length ||
    change.clear.length ||
    Object.keys(change.arrays ?? {}).length
  );
}
function lane(delta: SnapshotDelta, fast: boolean): Changes | undefined {
  const state = split(delta.state, fastState, fast);
  const players = delta.players.flatMap(({ id, change }) => {
    const part = split(change, fastPlayer, fast);
    return changed(part) ? [{ id, change: compact(part) }] : [];
  });
  return changed(state) || players.length
    ? {
        ...(changed(state) ? { state: compact(state) } : {}),
        ...(players.length ? { players } : {}),
      }
    : undefined;
}
/** Timer anchors are sent on start/stop/correction, rather than on every frame. */
export class SnapshotSender {
  private baseline?: Snapshot;
  private clocks: Record<string, number> = {};
  full(): StreamPacket {
    if (!this.baseline) throw new Error("Snapshot baseline missing");
    return {
      stream: 2,
      seq: this.baseline.seq!,
      serverTime: this.baseline.serverTime!,
      full: this.baseline,
      clocks: this.clocks,
    };
  }
  encode(snapshot: Snapshot): StreamPacket {
    const now = snapshot.serverTime!;
    const clocks: Record<string, number> = {};
    const timer = (
      key: string,
      seconds: number | undefined,
      elapsed = false,
    ) => {
      if (seconds === undefined) return undefined;
      if (seconds > 0 || elapsed) {
        const proposed = now + (elapsed ? -seconds : seconds) * 1000;
        const previous = this.clocks[key];
        clocks[key] =
          previous !== undefined && Math.abs(previous - proposed) <= 75
            ? previous
            : proposed;
      }
      return 0;
    };
    const wire: Snapshot = {
      ...snapshot,
      countdown: timer("countdown", snapshot.countdown),
      players: snapshot.players.map((p) => ({
        ...p,
        reload: timer(`p/${p.id}/reload`, p.reload)!,
        invulnerable: timer(`p/${p.id}/invulnerable`, p.invulnerable),
        disarm: timer(`p/${p.id}/disarm`, p.disarm, true),
      })),
      bombs: snapshot.bombs.map((b) => ({
        ...b,
        timer: timer(`b/${b.id}`, b.timer)!,
      })),
      beaconDrops: snapshot.beaconDrops?.map((d) => ({
        ...d,
        cooldown: timer(`bd/${d.team}`, d.cooldown)!,
      })),
      pulseTrapDrops: snapshot.pulseTrapDrops?.map((d) => ({
        ...d,
        cooldown: timer(`td/${d.team}`, d.cooldown)!,
      })),
    };
    const previous = this.baseline;
    const encoded = encodeSnapshot(previous, wire);
    const packet: StreamPacket = {
      stream: 2,
      seq: snapshot.seq!,
      serverTime: now,
    };
    if (!("delta" in encoded)) packet.full = wire;
    else {
      // Sequence and time already live in the envelope, never in either lane.
      delete encoded.state.set.seq;
      delete encoded.state.set.serverTime;
      packet.base = encoded.base;
      packet.fast = lane(encoded, true);
      packet.slow = lane(encoded, false);
      if (encoded.removed.length) packet.removed = encoded.removed;
      if (
        JSON.stringify(previous?.players.map((p) => p.id)) !==
        JSON.stringify(encoded.order)
      )
        packet.order = encoded.order;
    }
    if (!previous || JSON.stringify(clocks) !== JSON.stringify(this.clocks))
      packet.clocks = clocks;
    this.baseline = wire;
    this.clocks = clocks;
    return packet;
  }
}
export class SnapshotReceiver {
  private baseline?: Snapshot;
  private clocks: Record<string, number> = {};
  decode(packet: StreamPacket): Snapshot | undefined {
    let wire = packet.full;
    if (!wire) {
      if (!this.baseline || this.baseline.seq !== packet.base) return undefined;
      wire = this.baseline;
      // Both lanes patch the same frame; sequence advances only after both merge.
      for (const part of [packet.fast, packet.slow]) {
        if (!part) continue;
        wire = decodeSnapshot(wire, {
          delta: true,
          base: wire.seq!,
          seq: wire.seq!,
          serverTime: packet.serverTime,
          state: expand(part.state),
          players: (part.players ?? []).map((p) => ({
            id: p.id,
            change: expand(p.change),
          })),
          removed: [],
          order: [
            ...new Set([
              ...wire.players.map((p) => p.id),
              ...(part.players ?? []).map((p) => p.id),
            ]),
          ],
        })!;
      }
      const removed = new Set(packet.removed ?? []);
      const players = new Map(
        wire.players.filter((p) => !removed.has(p.id)).map((p) => [p.id, p]),
      );
      // Newly inserted players need an order including their ids before decoding each lane.
      wire = {
        ...wire,
        players: (packet.order ?? [...players.keys()]).map((id) =>
          players.get(id)!,
        ),
        seq: packet.seq,
        serverTime: packet.serverTime,
      };
    }
    this.baseline = wire;
    if (packet.clocks) this.clocks = packet.clocks;
    const remaining = (
      key: string,
      fallback: number | undefined,
      elapsed = false,
    ) => {
      const anchor = this.clocks[key];
      return anchor === undefined
        ? fallback
        : Math.max(
            0,
            (elapsed
              ? packet.serverTime - anchor
              : anchor - packet.serverTime) / 1000,
          );
    };
    return {
      ...wire,
      countdown: remaining("countdown", wire.countdown),
      players: wire.players.map((p) => ({
        ...p,
        reload: remaining(`p/${p.id}/reload`, p.reload)!,
        invulnerable: remaining(`p/${p.id}/invulnerable`, p.invulnerable),
        disarm: remaining(`p/${p.id}/disarm`, p.disarm, true),
      })),
      bombs: wire.bombs.map((b) => ({
        ...b,
        timer: remaining(`b/${b.id}`, b.timer)!,
      })),
      beaconDrops: wire.beaconDrops?.map((d) => ({
        ...d,
        cooldown: remaining(`bd/${d.team}`, d.cooldown)!,
      })),
      pulseTrapDrops: wire.pulseTrapDrops?.map((d) => ({
        ...d,
        cooldown: remaining(`td/${d.team}`, d.cooldown)!,
      })),
    };
  }
}
