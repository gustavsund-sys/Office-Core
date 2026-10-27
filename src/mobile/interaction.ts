import type { Game } from "../game/game";
import { CONFIG, type Team } from "../config/game";
import { lookoutPose } from "../game/lookoutConfig";
import { lookoutTeam } from "../game/lookoutReward";
import { blocked } from "../game/collision";
import { RC } from "../game/rcCar";

export type MobileInteraction = "PLOCKA" | "PLACERA" | "ÖPPNA" | "DESARMERA";
type Context = Pick<Game, "player" | "weapons" | "pickup" | "world" | "multiplayer" | "boss" | "rc" | "testWeapons">;

/** Only explicit interactions: automatic ammo/health pickups do not need a button. */
export function mobileInteraction(game: Context): MobileInteraction | undefined {
  const { player, weapons, pickup } = game;
  if (player.hp <= 0 || weapons.remoteControlled || game.boss?.active || game.rc.locked) return;
  const p = player.root.position;
  const snapshot = game.multiplayer?.snapshot;
  const near = (x: number, z: number, radius = 2.2) => Math.hypot(p.x - x, p.z - z) < radius;
  const reachable = (x: number, z: number) => {
    for (let i = 1; i <= 20; i++) if (blocked(p.x + (x - p.x) * i / 20, p.z + (z - p.z) * i / 20, 0.02, game.world.obstacles)) return false;
    return true;
  };
  const bombs = snapshot?.bombs ?? [weapons, ...(game.testWeapons ? [game.testWeapons] : [])]
    .flatMap((owner) => owner.charges.map((charge) => charge.mesh.position));
  if (player.grounded && bombs.some((b) => Math.hypot(p.x - b.x, p.z - b.z) <= 1.2 && reachable(b.x, b.z))) return "DESARMERA";
  if (player.bossLookoutKey && [-1, 1].some((side) => {
    const door = lookoutPose(side).door;
    return lookoutTeam(side) === CONFIG.player.team && !game.boss?.isOccupied(side) && near(door.x, door.z, 3.5);
  })) return "ÖPPNA";
  const id = game.multiplayer?.room?.sessionId ?? "local";
  const actor = { id, team: CONFIG.player.team as Team, player, weapons };
  if (weapons.carryingCoreBuster) return player.grounded ? "PLACERA" : undefined;
  if (weapons.pulseTrapSelected) {
    if (weapons.utilityCount <= 0 || !player.grounded) return;
    if (weapons.utilityKind === "rcCar") {
      const yaw = player.root.rotation.y;
      return !blocked(p.x + Math.sin(yaw) * 0.95, p.z + Math.cos(yaw) * 0.95, RC.radius, game.world.obstacles) ? "PLACERA" : undefined;
    }
    return pickup.pulseTraps.placement(actor) ? "PLACERA" : undefined;
  }
  if (weapons.carryingBeacon) return pickup.beacons.placement(actor) ? "PLACERA" : undefined;
  if (snapshot) {
    if (snapshot.pickups.some((drop) => drop.active && near(drop.x, drop.z) &&
      (drop.type === "weapon" || (drop.type === "shield" && player.shield < 100)))) return "PLOCKA";
  } else {
    if (pickup.endpoints.some((drop) => drop.cooldown <= 0 && drop.root.isEnabled() && near(drop.root.position.x, drop.root.position.z))) return "PLOCKA";
    if (player.shield < 100 && pickup.healthDrops.some((drop) => drop.type === "shield" && drop.root.isEnabled() && near(drop.root.position.x, drop.root.position.z))) return "PLOCKA";
  }
  if (weapons.utilityCount <= 0 && pickup.pulseTraps.drops.some((drop) => drop.cooldown <= 0 && near(drop.x, drop.z))) return "PLOCKA";
  if (!weapons.carryingBeacon && pickup.beacons.drops.some((drop) => drop.cooldown <= 0 && near(drop.x, drop.z))) return "PLOCKA";
}
