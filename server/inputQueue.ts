import type { NetInput } from "../shared/protocol";
export const INPUT_STEP = 1 / 30;
/** Preserve simulated time and ordered actions; catch up at most three steps per tick. */
export function takeInputs(queue: NetInput[], credit: number): NetInput[] {
  return queue.splice(0, Math.min(3, Math.floor((credit + 1e-8) / INPUT_STEP)));
}
