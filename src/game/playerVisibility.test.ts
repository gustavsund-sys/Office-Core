import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Ray,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Player } from "../player/player";

test("camera and RC visibility changes keep player hitboxes invisible and shootable", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("sun", new Vector3(0, -1, 0), scene);
  const world = new World(scene, new ShadowGenerator(32, light));
  const player = new Player(world);
  const hitboxes = player.root
    .getChildMeshes()
    .filter((mesh) => mesh.name === "player hitbox");
  assert.ok(hitboxes.length > 0);
  for (const visibility of [1, 0, 1]) {
    player.setViewVisibility(visibility);
    for (const box of hitboxes) {
      assert.equal(box.visibility, 0);
      assert.equal(box.isPickable, true);
      box.computeWorldMatrix(true);
    }
    assert.equal(player.torso.visibility, visibility);
  }
  player.root.position.setAll(0);
  player.root.computeWorldMatrix(true);
  for (const mesh of player.root.getChildMeshes()) mesh.computeWorldMatrix(true);
  const hit = scene.pickWithRay(
    new Ray(new Vector3(0, 1, -3), new Vector3(0, 0, 1), 6),
    (mesh) => hitboxes.includes(mesh),
  );
  assert.equal(hit?.hit, true);
  scene.dispose();
  engine.dispose();
});

test("shots hit all three body regions and miss just above the head", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("sun", Vector3.Down(), scene);
  const player = new Player(new World(scene, new ShadowGenerator(32, light)));
  try {
    player.root.position.set(4, 0, 8);
    player.root.rotation.y = Math.PI / 2;
    const world = player.root.computeWorldMatrix(true);
    const direction = Vector3.TransformNormal(Vector3.Forward(), world);
    for (const [index, height] of [0.15, 2, 4.07].entries()) {
      const start = Vector3.TransformCoordinates(new Vector3(0, height, -3), world);
      const hit = scene.pickWithRay(
        new Ray(start, direction, 6),
        mesh => player.hitboxes.some(box => box === mesh),
      );
      assert.equal(hit?.pickedMesh, player.hitboxes[index]);
    }
    const aboveHead = Vector3.TransformCoordinates(new Vector3(0, 4.09, -3), world);
    const miss = scene.pickWithRay(
      new Ray(aboveHead, direction, 6),
      mesh => player.hitboxes.some(box => box === mesh),
    );
    assert.equal(miss?.hit, false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("a dead player ignores movement, aim and jump until respawn", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("sun", Vector3.Down(), scene);
  const player = new Player(new World(scene, new ShadowGenerator(32, light)));
  try {
    player.root.position.setAll(0);
    const command = { moveX: 1, moveZ: 0, aimX: 10, aimZ: 0, fire: false, pressed: false };
    player.hp = 0;
    player.showLifeState(false, "#ffffff");
    player.simulate(command, 0.1);
    player.faceAim(command);
    assert.deepEqual(player.root.position.asArray(), [0, 0, 0]);
    assert.equal(player.root.rotation.y, 0);
    assert.equal(player.jump(), false);

    player.hp = 100;
    player.showLifeState(true, "#ffffff");
    player.simulate(command, 0.1);
    assert.ok(player.root.position.x > 0);
    assert.ok(player.root.rotation.y > 1);
    assert.equal(player.jump(), true);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
