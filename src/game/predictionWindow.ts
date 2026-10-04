import { Vector3 } from "@babylonjs/core";
import type { NetInput, NetPlayer } from "../../shared/protocol";

export const MAX_PENDING_INPUTS = 64;
/** Apply backpressure before sending: never drop steps needed to replay an ack. */
export function predictionBlocked(pending: readonly NetInput[]): boolean {
  return pending.length >= MAX_PENDING_INPUTS;
}
type MotionPlayer = {
  root: { position: Vector3 };
  verticalVelocity: number;
  jump(): void;
  simulate(input: NetInput, dt: number): void;
};
/** Replay physics only. Animation must advance once per rendered frame. */
export function replayMovement(
  player: MotionPlayer,
  own: Pick<NetPlayer, "x" | "y" | "z" | "verticalVelocity" | "ack">,
  pending: readonly NetInput[],
  predict: boolean,
): NetInput[] {
  const remaining = pending.filter((input) => (input.seq ?? 0) > own.ack);
  player.root.position.set(own.x, own.y, own.z);
  player.verticalVelocity = own.verticalVelocity;
  if (predict)
    for (const input of remaining) {
      if (input.jump) player.jump();
      player.simulate(input, 1 / 30);
    }
  return remaining;
}
