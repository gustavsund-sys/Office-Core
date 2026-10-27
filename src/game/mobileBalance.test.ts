import test from "node:test";
import assert from "node:assert/strict";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { weaponStats } from "../config/weaponBalance";
import { ShotPrediction } from "../network/shotPrediction";
import { NullEngine, Scene, DirectionalLight, ShadowGenerator, Vector3, Mesh, PickingInfo } from "@babylonjs/core";
import { World } from "../map/builder";
import { Player } from "../player/player";
import { Weapons } from "../weapons/system";

test("mobile balance only changes pistol rate/damage and bazooka rate", () => {
  assert.equal(weaponStats("pistol", true).fireRate, 2);
  assert.equal(weaponStats("pistol", true).damage, 17);
  assert.equal(weaponStats("bazooka", true).fireRate, 0.5);
  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    assert.deepEqual(weaponStats(id, false), WEAPONS[id]);
    if (id !== "pistol" && id !== "bazooka") assert.deepEqual(weaponStats(id, true), WEAPONS[id]);
  }
  assert.equal(WEAPONS.pistol.damage, 20);
  assert.equal(WEAPONS.pistol.fireRate, 4);
  assert.equal(WEAPONS.bazooka.fireRate, 1);
});
test("cosmetic prediction matches mobile and desktop shot intervals", () => {
  for (const mobile of [false, true]) for (const id of ["pistol", "bazooka"] as const) {
    const prediction = new ShotPrediction();
    prediction.mobileBalance = mobile;
    const interval = 1 / weaponStats(id, mobile).fireRate;
    assert.ok(prediction.update(id, 0, true, true, true));
    assert.equal(prediction.update(id, interval - 0.01, true, true, true), undefined);
    assert.ok(prediction.update(id, 0.011, true, true, true));
  }
});
test("authoritative weapon logic applies profile damage and enforces both mobile intervals", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const world = new World(scene, new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene)));
    for (const mobile of [false, true]) {
      const player = new Player(world);
      const weapons = new Weapons(player, () => {}, () => {});
      weapons.mobileBalance = mobile;
      weapons.visuals = false;
      const victim = { hp: 100, canDamageFrom: () => true, damage(amount: number) { this.hp -= amount; } };
      const body = new Mesh("target", scene);
      body.metadata = { damageable: victim };
      const hit = new PickingInfo();
      hit.hit = true; hit.pickedMesh = body; hit.pickedPoint = new Vector3(0, 1, 2);
      weapons.pickHit = () => hit;
      const command = { moveX: 0, moveZ: 0, aimX: 0, aimZ: 2, fire: true, pressed: true };
      weapons.update(command, 0);
      assert.equal(victim.hp, mobile ? 83 : 80);
      const ammo = weapons.ammo;
      const interval = mobile ? 0.5 : 0.25;
      weapons.update(command, interval - 0.01);
      assert.equal(weapons.ammo, ammo);
      weapons.update(command, 0.011);
      assert.equal(weapons.ammo, ammo - 1);
      weapons.equip("bazooka"); weapons.cooldown = 0;
      weapons.update(command, 0);
      const rockets = weapons.ammo;
      weapons.update(command, (mobile ? 2 : 1) - 0.01);
      assert.equal(weapons.ammo, rockets);
      weapons.update(command, 0.011);
      assert.equal(weapons.ammo, rockets - 1);
      player.root.dispose(); body.dispose();
    }
  } finally { scene.dispose(); engine.dispose(); }
});
