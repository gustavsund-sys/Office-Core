import type { Team } from "../src/config/game";
import type { WeaponId } from "../src/config/weapons";
export const MSG = {
  activity: "activity",
  idle: "idle",
  loadout: "loadout",
  netReady: "netReady",
  teamPing: "teamPing",
  ready: "ready",
  chat: "chat",
  input: "input",
  motionDiagnostics: "motionDiagnostics",
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
  preparing?: boolean;
}
export interface NetInput {
  rc?: import("../src/game/rcCar").RCCommand;
  viewTime?: number;
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
  slot: 0 | 1 | 2 | 3;
}
export interface NetPlayer {
  rcRemote?: boolean;
  beacon?: boolean;
  loadout?: import("../src/game/loadout").Loadout;
  utilityKind?: "pulseTrap" | "superMedkit" | "rcCar";
  utilityCount?: number;
  pulseTrap?: boolean;
  pulseTrapSelected?: boolean;
  assists?: number;
  disarms?: number;
  coreDamage?: number;
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
  rcCars?: import("../src/game/rcCar").RCCarState[];
  seq?: number;
  serverTime?: number;
  placedMedkits?: import("../src/game/pulseTrap").PlacedMedkit[];
  pulseTraps?: import("../src/game/pulseTrap").PulseTrapState[];
  pulseTrapDrops?: import("../src/game/pulseTrap").PulseTrapDrop[];
  beacons?: import("../src/game/beacon").BeaconState[];
  beaconDrops?: import("../src/game/beacon").BeaconDrop[];
  countdown?: number;
  roundStats?: ({
    id: string;
    name: string;
    team: Team;
  } & import("../src/game/engagement").Performance)[];
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
  preparing?: boolean;
  winner?: Team;
}
export interface NetEvent {
  material?: "player" | "metal" | "glass" | "wood";
  destroyed?: boolean;
  damage?: number;
  inputSeq?: number;
  kind:
    | "rcExplosion"
    | "ammoPickup"
    | "pulseTrapAvailable"
    | "beaconImpact"
    | "beaconPlace"
    | "beaconShot"
    | "beaconAvailable"
    | "beaconDamage"
    | "hit"
    | "kill"
    | "disarmed"
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
  explosionStyle?: "normal" | "large" | "plasma";
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
          "rc",
          "seq",
          "viewTime",
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
    (v.rc === undefined ||
      (typeof v.rc === "object" &&
        v.rc !== null &&
        Object.keys(v.rc).every((k) =>
          ["throttle", "yaw", "detonate"].includes(k),
        ) &&
        Number.isFinite(v.rc.throttle) &&
        Math.abs(v.rc.throttle) <= 1 &&
        Number.isFinite(v.rc.yaw) &&
        Math.abs(v.rc.yaw) <= Math.PI &&
        typeof v.rc.detonate === "boolean")) &&
    (v.viewTime === undefined ||
      (Number.isFinite(v.viewTime) && v.viewTime >= 0)) &&
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
    [0, 1, 2, 3].includes(v.slot)
  );
}
