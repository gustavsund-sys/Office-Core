import test from "node:test";
import assert from "node:assert/strict";
import { motionPose } from "../player/locomotion";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Player } from "../player/player";
import { tacticalShieldModel } from "../player/tacticalShield";

test("locomotion distinguishes sprint, limp, strafe, backwards, airborne and landing", () => {
  const pose = (
    sprint = 0,
    injured = false,
    air = false,
    vy = 0,
    forward = 1,
    side = 0,
    landing = 0,
  ) => motionPose(1, 1, sprint, injured, air, vy, forward, side, landing);
  const walk = pose(),
    run = pose(1),
    limp = pose(0, true);
  assert.equal(walk.state, "walk");
  assert.equal(run.state, "sprint");
  assert.equal(limp.state, "injured");
  assert.ok(Math.abs(run.hips[0].x) > Math.abs(walk.hips[0].x) * 1.5);
  assert.ok(run.lean > walk.lean);
  assert.ok(Math.abs(limp.hips[0].x) < Math.abs(limp.hips[1].x));
  assert.equal(pose(0, false, false, 0, -1).hips[0].x, -walk.hips[0].x);
  assert.equal(pose(0, false, false, 0, 0, 1).hips[0].x, 0);
  assert.ok(Math.abs(pose(0, false, false, 0, 0, 1).hips[0].z) > 0.1);
  assert.equal(pose(0, false, true, 5).state, "jump");
  assert.ok(pose(0, false, true, 5).hips[0].knee > 0, "knees flex backwards");
  assert.equal(pose(0, false, true, -5).state, "fall");
  assert.ok(pose(0, false, false, 0, 1, 0, 1).bob < walk.bob);
  assert.equal(motionPose(0, 0, 0, false, false, 0, 1, 0, 0).state, "idle");
});
test("animated poses preserve barrel alignment and shield instances share rigid geometry", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = new World(
    scene,
    new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  try {
    const player = new Player(world);
    player.root.position.setAll(0);
    player.setWeaponModel("huntingRifle");
    const command = {
      moveX: 0,
      moveZ: 1,
      aimX: 4,
      aimZ: 12,
      fire: false,
      pressed: false,
    };
    player.faceAim(command);
    for (const mode of ["walk", "sprint", "injured", "reload"]) {
      player.sprinting = mode === "sprint";
      player.hp = mode === "injured" ? 20 : 100;
      player.reloadPose = mode === "reload" ? 1 : 0;
      player.animate(true, 0.1);
      const muzzle = player.muzzlePosition;
      const direction = Vector3.TransformNormal(
        Vector3.Forward(),
        player.gun.computeWorldMatrix(true),
      ).normalize();
      const aim = new Vector3(4, 1.1, 12).subtract(muzzle).normalize();
      assert.ok(Vector3.Dot(direction, aim) > 0.99999, mode);
    }
    player.setWeaponModel("coreBuster");
    player.animate(true, 0.1);
    assert.ok(
      player.bodyMeshes.find((m) => m.name === "left arm")!.rotation.x < 0,
    );
    const a = tacticalShieldModel(world),
      b = tacticalShieldModel(world);
    assert.equal(a.getChildMeshes().length, b.getChildMeshes().length);
    assert.ok(a.getChildMeshes().length < 15);
    for (const mesh of a.getChildMeshes()) assert.equal(mesh.isPickable, false);
    assert.equal(
      a.getChildMeshes()[0].geometry,
      b.getChildMeshes()[0].geometry,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
