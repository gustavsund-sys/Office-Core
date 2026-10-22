import test from "node:test";
import assert from "node:assert/strict";
import {
  Vector3,
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  MeshBuilder,
  Ray,
} from "@babylonjs/core";
import { sniperThreat, SniperGlints } from "./rifleScope";
import { World } from "../map/builder";
import { Player } from "../player/player";
import { validInput } from "../../shared/protocol";

test("sniper glints use a narrow aim cone and reject backwards and distant aim", () => {
  const origin = new Vector3(0, 1.1, 0),
    forward = new Vector3(0, 0, 1);
  assert.equal(sniperThreat(origin, forward, new Vector3(0, 1.1, 80)), true);
  assert.equal(sniperThreat(origin, forward, new Vector3(1, 1.1, 80)), true);
  assert.equal(sniperThreat(origin, forward, new Vector3(6, 1.1, 80)), false);
  assert.equal(sniperThreat(origin, forward, new Vector3(0, 1.1, -10)), false);
  assert.equal(sniperThreat(origin, forward, new Vector3(0, 1.1, 130)), false);
});
test("Hunting Rifle scopes aim vertically and network validation rejects invalid scope state", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = new World(
    scene,
    new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  const player = new Player(world);
  player.root.position.setAll(0);
  player.setWeaponModel("huntingRifle");
  const command = {
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimY: 21,
    aimZ: 50,
    scoped: true,
    fire: true,
    pressed: true,
    jump: false,
    interact: false,
    slot: 0 as const,
  };
  player.faceAim(command);
  assert.equal(player.scoped, true);
  assert.ok(player.shotDirection(command).y > 0.3);
  assert.ok(player.gun.rotation.x < 0);
  assert.equal(validInput(command), true);
  assert.equal(validInput({ ...command, aimY: NaN }), false);
  assert.equal(validInput({ ...command, scoped: "yes" }), false);
  scene.dispose();
  engine.dispose();
});
test("glints exist only for the enabled observer, scoped rifles and clear sight", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = new World(
    scene,
    new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  const player = new Player(world);
  player.root.position.setAll(0);
  player.setWeaponModel("huntingRifle");
  player.root.rotation.y = 0;
  player.scoped = true;
  const origin = player.shotOrigin,
    target = origin.add(new Vector3(0, 0, 50));
  const glints = new SniperGlints(world);
  glints.update(0.1, false, target, [player]);
  assert.equal(scene.spriteManagers?.length ?? 0, 0);
  glints.update(0.1, true, target, [player]);
  const manager = scene.spriteManagers.find(
    (m) => m.name === "private sniper glints",
  )!;
  assert.equal(manager.sprites.filter((s) => s.isVisible).length, 1);
  const wall = MeshBuilder.CreateBox(
    "cover",
    { width: 10, height: 10, depth: 1 },
    scene,
  );
  wall.position.copyFrom(origin.add(new Vector3(0, 0, 20)));
  wall.metadata = { solid: true };
  wall.computeWorldMatrix(true);
  glints.update(0.1, true, target, [player]);
  assert.equal(manager.sprites.filter((s) => s.isVisible).length, 0);
  wall.dispose();
  player.scoped = false;
  glints.update(0.1, true, target, [player]);
  assert.equal(manager.sprites.filter((s) => s.isVisible).length, 0);
  scene.dispose();
  engine.dispose();
});
