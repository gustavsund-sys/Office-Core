import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Mesh,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Player } from "../player/player";
import { Weapons } from "../weapons/system";
import { Pickup } from "../pickups/pickup";
import { office01 } from "../maps/office01";
import { CONFIG } from "../config/game";
import { replayMovement } from "./predictionWindow";
import { validInput, type NetInput } from "../../shared/protocol";
class TestWorld extends World {
  override label(text: string) {
    return new Mesh(text, this.scene);
  }
}
function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = new TestWorld(
    scene,
    new ShadowGenerator(64, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  const player = new Player(world);
  player.root.position.setAll(0);
  return { engine, scene, world, player };
}
const command: NetInput = {
  moveX: 1,
  moveZ: 0,
  aimX: 100,
  aimZ: 0,
  fire: false,
  pressed: false,
  jump: false,
  interact: false,
  slot: 0,
  sprint: true,
};
test("sprint lasts four seconds at 150%, exhausts and fully recharges in eight", () => {
  const s = setup();
  try {
    for (let i = 0; i < 120; i++) s.player.simulate(command, 1 / 30);
    assert.ok(
      Math.abs(s.player.root.position.x - CONFIG.player.speed * 6) < 1e-7,
    );
    assert.equal(s.player.stamina, 0);
    assert.equal(s.player.sprintExhausted, true);
    const start = s.player.root.position.x;
    for (let i = 0; i < 240; i++) s.player.simulate(command, 1 / 30);
    assert.ok(
      Math.abs(s.player.root.position.x - start - CONFIG.player.speed * 8) <
        1e-7,
    );
    assert.equal(s.player.stamina, 4);
    s.player.simulate(command, 1 / 30);
    assert.equal(s.player.sprinting, true);
  } finally {
    s.engine.dispose();
  }
});
test("shield absorbs damage first; low HP limps without sprint; medkit restores movement", () => {
  const s = setup();
  try {
    s.player.shield = 100;
    assert.equal(s.player.takeDamage(70), 0);
    assert.equal(s.player.shield, 30);
    assert.equal(s.player.hp, 100);
    assert.equal(s.player.takeDamage(110), 80);
    assert.equal(s.player.shield, 0);
    assert.equal(s.player.hp, 20);
    s.player.simulate(command, 1);
    assert.equal(s.player.sprinting, false);
    assert.ok(
      Math.abs(s.player.root.position.x - CONFIG.player.speed * 0.6) < 1e-7,
    );
    s.player.medkit = true;
    assert.equal(s.player.useMedkit(), true);
    assert.equal(s.player.hp, 70);
    assert.equal(s.player.useMedkit(), false);
    s.player.simulate(command, 0.1);
    assert.equal(s.player.sprinting, true);
    s.player.medkit = true;
    s.player.hp = 100;
    assert.equal(s.player.useMedkit(), false);
    assert.equal(s.player.medkit, true);
    s.player.resetVitals();
    assert.equal(s.player.shield, 0);
    assert.equal(s.player.medkit, false);
    assert.equal(s.player.stamina, 4);
  } finally {
    s.engine.dispose();
  }
});
test("each drop zone supplies shield and medkit, with cooldown and one-kit capacity", () => {
  const s = setup();
  try {
    const pickups = new Pickup(s.world);
    const weapons = new Weapons(
      s.player,
      () => {},
      () => {},
    );
    const shields = pickups.healthDrops.filter((p) => p.type === "shield");
    assert.equal(shields.length, office01.weaponEnds.length);
    let shieldSounds = 0;
    pickups.onShield = () => shieldSounds++;
    const shield = shields[0];
    s.player.root.position.copyFrom(shield.root.position);
    pickups.update(0, 0, weapons, () => {});
    assert.equal(s.player.shield, 0);
    assert.equal(shieldSounds, 0);
    pickups.chooseRequested = true;
    pickups.update(0, 0, weapons, () => {});
    assert.equal(shieldSounds, 1);
    assert.equal(pickups.chooseRequested, false);
    assert.equal(s.player.shield, 100);
    assert.equal(shield.root.isEnabled(), false);
    pickups.update(20, 20, weapons, () => {});
    assert.equal(shield.root.isEnabled(), true);
    assert.equal(shieldSounds, 1);
    s.player.shield = 40;
    pickups.chooseRequested = true;
    pickups.update(0, 20, weapons, () => {});
    assert.equal(s.player.shield, 100);
    const kit = pickups.healthDrops.find((p) => p.type === "medkit")!;
    s.player.root.position.copyFrom(kit.root.position);
    pickups.update(0, 20, weapons, () => {});
    assert.equal(s.player.medkit, true);
    assert.equal(s.player.hp, 100);
    s.player.showTacticalShield();
    assert.ok(
      s.scene.getTransformNodeByName("tactical shield armor")?.isEnabled(),
    );
    s.player.takeDamage(100);
    s.player.showTacticalShield();
    assert.equal(
      s.scene.getTransformNodeByName("tactical shield armor")?.isEnabled(),
      false,
    );
  } finally {
    s.engine.dispose();
  }
});
test("network validation and movement reconciliation retain sprint state", () => {
  const s = setup();
  try {
    assert.equal(validInput({ ...command, useMedkit: true }), true);
    assert.equal(validInput({ ...command, sprint: 100 }), false);
    const pending = Array.from({ length: 30 }, (_, seq) => ({
      ...command,
      seq: seq + 1,
    }));
    replayMovement(
      s.player,
      {
        x: 0,
        y: 0,
        z: 0,
        verticalVelocity: 0,
        ack: 0,
        stamina: 2,
        sprintExhausted: false,
      },
      pending,
      true,
    );
    assert.ok(Math.abs(s.player.stamina - 1) < 1e-7);
    assert.ok(
      Math.abs(s.player.root.position.x - CONFIG.player.speed * 1.5) < 1e-7,
    );
    replayMovement(
      s.player,
      {
        x: 0,
        y: 0,
        z: 0,
        verticalVelocity: 0,
        ack: 0,
        stamina: 2,
        sprintExhausted: false,
      },
      pending,
      true,
    );
    assert.ok(Math.abs(s.player.stamina - 1) < 1e-7); // Replay must not drain twice.
  } finally {
    s.engine.dispose();
  }
});
