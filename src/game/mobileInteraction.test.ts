import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core";
import { mobileInteraction } from "../mobile/interaction";
import { CONFIG } from "../config/game";
import { lookoutPose } from "./lookoutConfig";

function context() {
  return {
    player: { hp: 100, shield: 0, grounded: true, bossLookoutKey: false, root: { position: Vector3.Zero(), rotation: { y: 0 } } },
    weapons: { charges: [], utilityCount: 0, utilityKind: "pulseTrap", pulseTrapSelected: false, carryingCoreBuster: false, carryingBeacon: false, remoteControlled: false },
    pickup: {
      endpoints: [], healthDrops: [],
      pulseTraps: { drops: [], placement: () => undefined },
      beacons: { drops: [], placement: () => undefined },
    },
    world: { obstacles: [] }, rc: { locked: false },
    boss: { active: false, isOccupied: () => false },
    multiplayer: undefined,
  } as unknown as Parameters<typeof mobileInteraction>[0];
}
test("interaction appears for a nearby available weapon and disappears after it is consumed or out of range", () => {
  const game = context();
  assert.equal(mobileInteraction(game), undefined);
  const drop = { cooldown: 0, root: { isEnabled: () => true, position: new Vector3(2.1, 0, 0) } };
  game.pickup.endpoints.push(drop as never);
  assert.equal(mobileInteraction(game), "PLOCKA");
  drop.root.position.x = 2.3;
  assert.equal(mobileInteraction(game), undefined);
  drop.root.position.x = 1;
  drop.cooldown = 20;
  assert.equal(mobileInteraction(game), undefined);
});
test("online interaction uses authoritative availability and omits automatic health/ammo pickups", () => {
  const game = context();
  const drop = { active: true, type: "weapon", x: 1, z: 0 };
  game.multiplayer = { snapshot: { pickups: [drop], bombs: [] } } as never;
  assert.equal(mobileInteraction(game), "PLOCKA");
  drop.active = false;
  assert.equal(mobileInteraction(game), undefined);
  drop.active = true;
  for (const type of ["ammo", "medkit", "superMedkit"]) {
    drop.type = type;
    assert.equal(mobileInteraction(game), undefined);
  }
  drop.type = "shield";
  assert.equal(mobileInteraction(game), "PLOCKA");
  game.player.shield = 100;
  assert.equal(mobileInteraction(game), undefined);
});
test("placement is offered only when grounded with usable equipment and a valid placement query", () => {
  const game = context();
  game.weapons.pulseTrapSelected = true;
  game.weapons.utilityCount = 2;
  assert.equal(mobileInteraction(game), undefined);
  game.pickup.pulseTraps.placement = () => ({ x: 0, z: 1.1, yaw: 0 });
  assert.equal(mobileInteraction(game), "PLACERA");
  game.player.verticalVelocity = 1;
  // Grounded is calculated from the actual player height/vertical state in the game.
  Object.defineProperty(game.player, "grounded", { value: false });
  assert.equal(mobileInteraction(game), undefined);
});
test("own unlocked elevator remains accessible, occupied and enemy elevators do not open", () => {
  const game = context();
  game.player.bossLookoutKey = true;
  const own = CONFIG.player.team === "RED" ? -1 : 1;
  game.player.root.position.copyFrom(lookoutPose(own).door);
  assert.equal(mobileInteraction(game), "ÖPPNA");
  game.boss!.isOccupied = () => true;
  assert.equal(mobileInteraction(game), undefined);
  game.boss!.isOccupied = () => false;
  game.player.root.position.copyFrom(lookoutPose(-own).door);
  assert.equal(mobileInteraction(game), undefined);
});
test("bomb disarm stays available nearby but walls and remote control hide the action", () => {
  const game = context();
  game.multiplayer = { snapshot: { pickups: [], bombs: [{ x: 1, z: 0 }] } } as never;
  assert.equal(mobileInteraction(game), "DESARMERA");
  game.world.obstacles.push({ x: 0.5, z: 0, w: 0.2, d: 2 });
  assert.equal(mobileInteraction(game), undefined);
  game.world.obstacles.length = 0;
  game.weapons.remoteControlled = true;
  assert.equal(mobileInteraction(game), undefined);
});

test("disarm takes priority over placement at its exact range and disappears outside it", () => {
  const game = context();
  game.weapons.carryingCoreBuster = true;
  const bomb = { x: 1.2, z: 0 };
  game.multiplayer = { snapshot: { pickups: [], bombs: [bomb] } } as never;
  assert.equal(mobileInteraction(game), "DESARMERA");
  bomb.x = 1.201;
  assert.equal(mobileInteraction(game), "PLACERA");
  bomb.x = 1;
  Object.defineProperty(game.player, "grounded", { value: false });
  assert.equal(mobileInteraction(game), undefined);
  game.player.hp = 0;
  assert.equal(mobileInteraction(game), undefined);
});
