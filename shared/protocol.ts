import type { CombatDeath } from "../src/ui/combatFeed";
import type { Team } from "../src/config/game";
import type { WeaponId } from "../src/config/weapons";
export const MSG = {
  lookout: "lookout",
  supplyRequest: "supplyRequest",
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
  clientMode: "clientMode",
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
  aimY?: number;
  scoped?: boolean;
  crouched?: boolean;
  sprint?: boolean;
  useMedkit?: boolean;
  fire: boolean;
  pressed: boolean;
  jump: boolean;
  interact: boolean;
  warcry?: boolean;
  reload?: boolean;
  slot: 0 | 1 | 2 | 3;
}
export interface NetLookout {
  side: number;
  ammo: number;
  yaw: number;
  pitch: number;
  crouched: boolean;
}
export interface NetPlayer {
  carryingCoreBuster?: boolean;
  lookout?: NetLookout;
  lookoutKey?: boolean;
  lookoutKills?: number;
  lookoutAmmo?: number;
  rcRemote?: boolean;
  beacon?: boolean;
  loadout?: import("../src/game/loadout").Loadout;
  utilityKind?: "pulseTrap" | "superMedkit" | "rcCar";
  utilityCount?: number;
  pulseTrap?: boolean;
  pulseTrapSelected?: boolean;
  defense?: number;
  assists?: number;
  disarms?: number;
  coreDamage?: number;
  kills?: number;
  disarm?: number;
  ack: number;
  warcryAvailable?: boolean;
  invulnerable?: number;
  verticalVelocity: number;
  knockbackX?: number;
  knockbackZ?: number;
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  yaw: number;
  gunPitch?: number;
  scoped?: boolean;
  crouched?: boolean;
  stamina?: number;
  sprintExhausted?: boolean;
  sprinting?: boolean;
  shield?: number;
  medkit?: boolean;
  hp: number;
  weapon: WeaponId;
  special?: WeaponId;
  ammo: number;
  reserve: number;
  reloadDuration?: number;
  reloadKind?: "magazine" | "chamber";
  reload: number;
}
export interface Snapshot {
  supplyDrop?: import("../src/game/supplyDrop").SupplyState;
  supplyRequestReady?: boolean;
  carts?: import("../src/map/cleaningCarts").CartState[];
  rcCars?: import("../src/game/rcCar").RCCarState[];
  seq?: number;
  serverTime?: number;
  placedMedkits?: import("../src/game/pulseTrap").PlacedMedkit[];
  pulseTraps?: import("../src/game/pulseTrap").PulseTrapState[];
  pulseTrapDrops?: import("../src/game/pulseTrap").PulseTrapDrop[];
  beacons?: import("../src/game/beacon").BeaconState[];
  beaconDrops?: import("../src/game/beacon").BeaconDrop[];
  countdown?: number;
  seriesStats?: ({ id: string; name: string; team: Team } & import("../src/game/engagement").Performance)[];
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
    type: "ammo" | "weapon" | "medkit" | "superMedkit" | "shield";
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
  /** Authoritative floor contact for turret VFX cadence. */
  groundHit?: boolean;
  message?: string;
  blood?: boolean;
  material?: "player" | "metal" | "glass" | "wood";
  destroyed?: boolean;
  damage?: number;
  inputSeq?: number;
  kind:
    | "lookoutNotice"
    | "turretTrace"
    | "rcExplosion"
    | "medkit"
    | "shieldPickup"
    | "ammoPickup"
    | "reload"
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
  death?: CombatDeath;
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
          "aimY",
          "scoped",
          "crouched",
          "fire",
          "pressed",
          "jump",
          "interact",
          "slot",
          "warcry",
          "reload",
          "sprint",
          "useMedkit",
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
    (v.aimY === undefined ||
      (Number.isFinite(v.aimY) && Math.abs(v.aimY) < 200)) &&
    (v.scoped === undefined || typeof v.scoped === "boolean") &&
    (v.crouched === undefined || typeof v.crouched === "boolean") &&
    [v.fire, v.pressed, v.jump, v.interact].every(
      (x) => typeof x === "boolean",
    ) &&
    (v.warcry === undefined || typeof v.warcry === "boolean") &&
    (v.sprint === undefined || typeof v.sprint === "boolean") &&
    (v.useMedkit === undefined || typeof v.useMedkit === "boolean") &&
    (v.reload === undefined || typeof v.reload === "boolean") &&
    [0, 1, 2, 3].includes(v.slot)
  );
}
