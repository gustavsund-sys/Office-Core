export type MotionState =
  "idle" | "walk" | "sprint" | "injured" | "jump" | "fall";
export function motionPose(
  phase: number,
  stride: number,
  sprint: number,
  injured: boolean,
  airborne: boolean,
  velocityY: number,
  forward: number,
  strafe: number,
  landing: number,
) {
  const state: MotionState = airborne
    ? velocityY > 0
      ? "jump"
      : "fall"
    : injured && stride > 0.05
      ? "injured"
      : stride < 0.05
        ? "idle"
        : sprint > 0.5
          ? "sprint"
          : "walk";
  const amplitude = injured ? 0.3 : 0.38 + sprint * 0.4;
  const hips = [0, 1].map((i) => {
    const wave = Math.sin(phase + i * Math.PI);
    const limp = injured && i === 0 ? 0.38 : 1;
    return {
      x: airborne
        ? -0.35
        : wave * amplitude * stride * forward * limp - landing * 0.18,
      z: airborne
        ? i
          ? -0.07
          : 0.07
        : -wave * amplitude * 0.65 * stride * strafe + (i ? -0.025 : 0.025),
      knee: airborne
        ? velocityY > 0
          ? 0.95
          : 0.4
        : Math.max(0, Math.cos(phase + i * Math.PI)) *
            (0.4 + sprint * 0.65) *
            stride *
            limp +
          landing * 0.65,
    };
  });
  return {
    state,
    hips,
    bob: airborne
      ? -0.04
      : Math.sin(phase * 2) * (0.022 + sprint * 0.04) * stride - landing * 0.12,
    lean: airborne ? 0.12 : injured ? 0.18 : sprint * 0.2 * stride * forward,
    roll: Math.sin(phase) * (injured ? 0.13 : 0.025) * stride,
    armBob:
      Math.sin(phase * 2) * (0.012 + sprint * 0.022) * stride - landing * 0.05,
  };
}
