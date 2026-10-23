import test from "node:test";
import assert from "node:assert/strict";
import { earnLookoutKill, loseLookoutOnDeath } from "./lookoutReward";
import { Player } from "../player/player";

test("only enemy kills unlock a key; dying without a key retains unfinished progression", () => {
  const state = {
    bossLookoutKey: false,
    bossLookoutKills: 8,
    bossLookoutAmmo: 0,
  };
  assert.equal(earnLookoutKill(state, "RED", "RED"), false);
  assert.equal(state.bossLookoutKills, 8);
  assert.equal(loseLookoutOnDeath(state, 0), false);
  assert.equal(state.bossLookoutKills, 8);
  earnLookoutKill(state, "RED", "BLUE");
  assert.equal(earnLookoutKill(state, "RED", "BLUE"), true);
  assert.equal(loseLookoutOnDeath(state, 100), false);
  assert.equal(loseLookoutOnDeath(state, 0), true);
  assert.deepEqual(state, {
    bossLookoutKey: false,
    bossLookoutKills: 0,
    bossLookoutAmmo: 0,
  });
});
test("fatal damage immediately removes the key, while shield absorption and nonfatal hits retain it", () => {
  const player = Object.assign(Object.create(Player.prototype), {
    hp: 20,
    shield: 20,
    invulnerable: 0,
    bossLookoutKey: true,
    bossLookoutKills: 10,
    bossLookoutAmmo: 42,
  }) as Player;
  player.takeDamage(10);
  assert.equal(player.bossLookoutKey, true);
  player.takeDamage(20);
  assert.equal(player.hp, 10);
  assert.equal(player.bossLookoutKey, true);
  player.takeDamage(10);
  assert.equal(player.bossLookoutKey, false);
  assert.equal(player.bossLookoutKills, 0);
  assert.equal(player.bossLookoutAmmo, 0);
});
