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
