import type { Snapshot, NetPlayer } from "../../shared/protocol";
export type Change<T> = {
  set: Partial<T>;
  clear: (keyof T)[];
  arrays?: Record<
    string,
    { index: number; value?: unknown; change?: Change<object> }[]
  >;
};
export interface SnapshotDelta {
  delta: true;
  base: number;
  seq: number;
  serverTime: number;
  state: Change<Omit<Snapshot, "players">>;
  players: { id: string; change: Change<NetPlayer> }[];
  removed: string[];
  order: string[];
}
function diff<T extends object>(before: T, after: T): Change<T> {
  const set: Partial<T> = {},
    clear: (keyof T)[] = [],
    arrays: NonNullable<Change<T>["arrays"]> = {};
  for (const key of new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ]) as Set<keyof T>) {
    if (Object.is(before[key], after[key])) continue;
    if (
      typeof before[key] === "object" &&
      typeof after[key] === "object" &&
      JSON.stringify(before[key]) === JSON.stringify(after[key])
    )
      continue;
    const a = before[key],
      b = after[key];
    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      arrays[String(key)] = b.flatMap((value, index) =>
        Object.is(a[index], value) ||
        (typeof a[index] === "object" &&
          typeof value === "object" &&
          JSON.stringify(a[index]) === JSON.stringify(value))
          ? []
          : [
              value &&
              a[index] &&
              typeof value === "object" &&
              typeof a[index] === "object"
                ? { index, change: diff(a[index], value) }
                : { index, value },
            ],
      );
      continue;
    }
    if (after[key] === undefined) clear.push(key);
    else set[key] = after[key];
  }
  return { set, clear, ...(Object.keys(arrays).length ? { arrays } : {}) };
}
function patch<T extends object>(before: T, change: Change<T>): T {
  const out = { ...before, ...change.set };
  for (const k of change.clear) delete out[k];
  for (const [key, edits] of Object.entries(change.arrays ?? {})) {
    const values = [...(out as any)[key]];
    for (const e of edits)
      values[e.index] = e.change ? patch(values[e.index], e.change) : e.value;
    (out as any)[key] = values;
  }
  return out;
}
export function encodeSnapshot(
  before: Snapshot | undefined,
  after: Snapshot,
): Snapshot | SnapshotDelta {
  if (!before || before.seq === undefined || after.seq === undefined)
    return after;
  const { players: old, ...oldState } = before,
    { players, ...state } = after;
  return {
    delta: true,
    base: before.seq,
    seq: after.seq,
    serverTime: after.serverTime!,
    state: diff(oldState, state),
    players: players.flatMap((p) => {
      const change = diff(
        old.find((o) => o.id === p.id) ?? ({} as NetPlayer),
        p,
      );
      return Object.keys(change.set).length ||
        change.clear.length ||
        Object.keys(change.arrays ?? {}).length
        ? [{ id: p.id, change }]
        : [];
    }),
    removed: old
      .filter((p) => !players.some((n) => n.id === p.id))
      .map((p) => p.id),
    order: players.map((p) => p.id),
  };
}
export function decodeSnapshot(
  before: Snapshot | undefined,
  packet: Snapshot | SnapshotDelta,
): Snapshot | undefined {
  if (!("delta" in packet)) return packet;
  if (!before || before.seq !== packet.base) return undefined;
  const players = new Map(before.players.map((p) => [p.id, p]));
  for (const id of packet.removed) players.delete(id);
  for (const p of packet.players)
    players.set(
      p.id,
      patch(players.get(p.id) ?? ({ id: p.id } as NetPlayer), p.change),
    );
  return {
    ...patch(before, packet.state),
    players: packet.order.map((id) => players.get(id)!),
    seq: packet.seq,
    serverTime: packet.serverTime,
  };
}
