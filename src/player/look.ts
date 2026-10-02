export type ViewMode = "thirdPerson" | "topDown";
export function relativeMovement(strafe: number, forward: number, yaw: number) {
  return {
    x: strafe * Math.cos(yaw) + forward * Math.sin(yaw),
    z: forward * Math.cos(yaw) - strafe * Math.sin(yaw),
  };
}
export function lookDirection(yaw: number, pitch: number) {
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: -Math.sin(pitch),
    z: Math.cos(yaw) * Math.cos(pitch),
  };
}
