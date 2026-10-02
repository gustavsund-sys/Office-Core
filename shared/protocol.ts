import type { Team } from "../src/config/game";
import type { WeaponId } from "../src/config/weapons";
export const MSG = {
  ready: "ready",
  chat: "chat",
  input: "input",
  ping: "ping",
  start: "start",
  restart: "restart",
  team: "team",
  profile: "profile",
  snapshot: "snapshot",
  event: "event",
} as const;
export interface AvailableRoom {
  id: string;
  name: string;
  players: { name: string; team: Team }[];
  capacity: number;
  started: boolean;
}
export interface NetInput {
  seq?: number;
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  fire: boolean;
  pressed: boolean;
  jump: boolean;
  interact: boolean;
  warcry?: boolean;
  slot: 0 | 1 | 2;
}
export interface NetPlayer {
  kills?: number;
  disarm?: number;
  ack: number;
  warcryAvailable?: boolean;
  invulnerable?: number;
  verticalVelocity: number;
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
  round?: number;
  wins?: Record<Team, number>;
  ready?: string[];
  seriesWinner?: Team;
  owner: string;
  players: NetPlayer[];
  cores: { team: Team; hp: number; active: boolean }[];
  props: number[];
  pickups: {
    x: number;
    y: number;
    z: number;
    id: WeaponId;
    active: boolean;
    type: "ammo" | "weapon" | "medkit" | "superMedkit";
    dropped: boolean;
  }[];
  bombs: {
    owner?: string;
    id: number;
    x: number;
    y: number;
    z: number;
    timer: number;
  }[];
  rockets: { owner?: string; id: number; x: number; y: number; z: number }[];
  alarms?: Team[];
  alarm?: Team;
  started: boolean;
  winner?: Team;
}
export interface NetEvent {
  damage?: number;
  inputSeq?: number;
  kind:
    | "trace"
    | "shot"
    | "death"
    | "spawn"
    | "buster"
    | "explosion"
    | "impact"
    | "jump"
    | "land"
    | "damage"
    | "scream";
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
          "seq",
          "moveX",
          "moveZ",
          "aimX",
          "aimZ",
          "fire",
          "pressed",
          "jump",
          "interact",
          "slot",
          "warcry",
        ].includes(key),
    )
  )
    return false;
  const v = value as NetInput;
  return (
    (v.seq === undefined || (Number.isSafeInteger(v.seq) && v.seq >= 0)) &&
    [v.moveX, v.moveZ, v.aimX, v.aimZ].every(Number.isFinite) &&
    Math.abs(v.moveX) <= 1 &&
    Math.abs(v.moveZ) <= 1 &&
    Math.abs(v.aimX) < 200 &&
    Math.abs(v.aimZ) < 200 &&
    [v.fire, v.pressed, v.jump, v.interact].every(
      (x) => typeof x === "boolean",
    ) &&
    (v.warcry === undefined || typeof v.warcry === "boolean") &&
    [0, 1, 2].includes(v.slot)
  );
}
