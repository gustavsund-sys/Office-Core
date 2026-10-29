import { Vector3 } from "@babylonjs/core";
export const LOOKOUT_KEY_HINT = "Boss Key required · Earn 10 points through kills, defense and disarms. Or perhaps fortune falls from above when hope is low...";
export const LOOKOUT = {
  shots: 100,
  damage: 8,
  interval: 0.1,
  range: 350,
  height: 20,
  eyeOffset: 5.9,
  eyeHeight: 1.95,
  crouchEyeHeight: 0.65,
};
export function lookoutExitSpawn(side: number) {
  return new Vector3(side * 90, 0, -12);
}
export function lookoutPose(side: number) {
  return {
    door: new Vector3(side * 94, 0, -13),
    station: new Vector3(side * 94, LOOKOUT.height, 0),
    yaw: (-side * Math.PI) / 2,
  };
}
