import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core";
import {
  MAX_PENDING_INPUTS,
  predictionBlocked,
  replayMovement,
} from "./predictionWindow";
import type { NetInput } from "../../shared/protocol";
function input(seq: number): NetInput {
  return {
    seq,
    moveX: 1,
    moveZ: 0,
    aimX: 100,
    aimZ: 0,
    fire: false,
    pressed: false,
    jump: false,
    interact: false,
    slot: 0,
  };
}
function player() {
  return {
    root: { position: Vector3.Zero() },
    verticalVelocity: 0,
    jumps: 0,
    jump() {
      this.jumps++;
    },
    simulate(c: NetInput, dt: number) {
      this.root.position.x += c.moveX * 6 * dt;
    },
  };
}
const state = (ack: number, x: number) => ({
  ack,
  x,
  y: 0,
  z: 0,
  verticalVelocity: 0,
});
test("three seconds without acknowledgements stops prediction at capacity without discarding movement", () => {
  const p = player();
  let pending: NetInput[] = [];
  let seq = 0;
  for (let frame = 0; frame < 90; frame++) {
    if (predictionBlocked(pending)) continue;
    const c = input(seq++);
    pending.push(c);
    p.simulate(c, 1 / 30);
  }
  assert.equal(pending.length, MAX_PENDING_INPUTS);
  assert.equal(seq, 64);
  assert.equal(pending[0].seq, 0);
  const predicted = p.root.position.x;
  // An old snapshot is more than eight metres behind. Replay must still be complete.
  pending = replayMovement(p, state(9, 2), pending, true);
  assert.equal(pending.length, 54);
  assert.ok(Math.abs(p.root.position.x - predicted) < 1e-9);
  // Fresh ack releases the blocked window without moving the player backwards.
  pending = replayMovement(p, state(63, 12.8), pending, true);
  assert.equal(pending.length, 0);
  assert.ok(!predictionBlocked(pending));
  assert.ok(Math.abs(p.root.position.x - predicted) < 1e-9);
  const next = input(seq++);
  pending.push(next);
  p.simulate(next, 1 / 30);
  assert.ok(p.root.position.x > predicted);
});
test("delayed ack replays unacknowledged edges and physics, without animation calls", () => {
  const p = {
    ...player(),
    animate() {
      throw Error("Replay must not advance animation");
    },
    update() {
      throw Error("Replay must not advance animation");
    },
  };
  const pending = [
    input(10),
    { ...input(11), jump: true, pressed: true, slot: 3 as const },
    input(12),
  ];
  const remaining = replayMovement(p, state(10, 10), pending, true);
  assert.deepEqual(
    remaining.map((c) => c.seq),
    [11, 12],
  );
  assert.equal(p.jumps, 1);
  assert.ok(remaining[0].pressed);
  assert.equal(remaining[0].slot, 3);
  assert.ok(Math.abs(p.root.position.x - 10.4) < 1e-9);
  assert.equal(pending.length, 3);
});
test("disabled prediction applies authoritative state without replay during RC control", () => {
  const p = player();
  replayMovement(p, state(0, 7), [input(1)], false);
  assert.equal(p.root.position.x, 7);
});
test("different frame rates and a frame stall produce identical acknowledged movement", () => {
  for (const fps of [25, 30, 60, 144]) {
    const p = player();
    let pending: NetInput[] = [];
    let elapsed = 0,
      seq = 0,
      serverX = 0;
    const queue: NetInput[] = [];
    for (let frame = 0; frame < fps * 5; frame++) {
      elapsed = Math.min(0.1, elapsed + (frame === fps ? 0.35 : 1 / fps));
      while (elapsed >= 1 / 30) {
        elapsed -= 1 / 30;
        if (predictionBlocked(pending)) continue;
        const c = input(seq++);
        pending.push(c);
        queue.push(c);
        p.simulate(c, 1 / 30);
      }
      // Simulate delayed, batched receipts after a three-second interruption.
      if (frame > fps * 3) {
        for (const c of queue) serverX += (c.moveX * 6) / 30;
        queue.length = 0;
        pending = replayMovement(p, state(seq - 1, serverX), pending, true);
      }
    }
    assert.ok(Math.abs(p.root.position.x - serverX) < 1e-8);
    assert.equal(pending.length, 0);
  }
});
