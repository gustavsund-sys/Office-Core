import type { Team } from "../src/config/game";
import type { WeaponId } from "../src/config/weapons";
export const MSG = {
  input: "input",
  start: "start",
  team: "team",
  snapshot: "snapshot",
  event: "event",
} as const;
export interface NetInput {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  fire: boolean;
  pressed: boolean;
  jump: boolean;
  interact: boolean;
  slot: 0 | 1 | 2;
}
export interface NetPlayer {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  weapon: WeaponId;
  special?: WeaponId;
  ammo: number;
  reserve: number;
  reload: number;
}
export interface Snapshot {
  players: NetPlayer[];
  cores: { team: Team; hp: number; active: boolean }[];
  props: number[];
  pickups: {
    x: number;
    y: number;
    z: number;
    id: WeaponId;
    active: boolean;
    type: "ammo" | "weapon";
    dropped: boolean;
  }[];
  bombs: { id: number; x: number; y: number; z: number; timer: number }[];
  rockets: { id: number; x: number; y: number; z: number }[];
  alarm?: Team;
  started: boolean;
  winner?: Team;
}
export interface NetEvent {
  kind: "trace" | "shot" | "death" | "spawn" | "buster" | "explosion";
  player?: string;
  team?: Team;
  weapon?: WeaponId;
  x: number;
  y: number;
  z: number;
  sound?: string;
  power?: number;
  endX?: number;
  endY?: number;
  endZ?: number;
}
export function validInput(value: unknown): value is NetInput {
  if (!value || typeof value !== "object") return false;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "moveX",
          "moveZ",
          "aimX",
          "aimZ",
          "fire",
          "pressed",
          "jump",
          "interact",
          "slot",
        ].includes(key),
    )
  )
    return false;
  const v = value as NetInput;
  return (
    [v.moveX, v.moveZ, v.aimX, v.aimZ].every(Number.isFinite) &&
    Math.abs(v.moveX) <= 1 &&
    Math.abs(v.moveZ) <= 1 &&
    Math.abs(v.aimX) < 200 &&
    Math.abs(v.aimZ) < 200 &&
    [v.fire, v.pressed, v.jump, v.interact].every(
      (x) => typeof x === "boolean",
    ) &&
    [0, 1, 2].includes(v.slot)
  );
}
