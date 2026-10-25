import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  Vector3,
  Ray,
  DirectionalLight,
  ShadowGenerator,
  PBRMaterial,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { batchWallVisuals } from "../map/buildingBatch";
import { materialLightLimit } from "../effects/combatLighting";
import { Destructible } from "../core/destructible";

test("wall batches retain invisible original bullet and movement collision surfaces", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const shadows = new ShadowGenerator(
      32,
      new DirectionalLight("sun", Vector3.Down(), scene),
    );
    const world = new World(scene, shadows);
    const a = world.box("wall", 2, 1, 2, 2, 2, 0.4, "#aabbcc", true);
    const b = world.box("wall", 5, 1, 2, 2, 2, 0.4, "#aabbcc", true);
    const far = world.box("wall", 50, 1, 2, 2, 2, 0.4, "#aabbcc", true);
    const obstacles = world.obstacles.slice();
    batchWallVisuals(world);
    assert.deepEqual(world.solids, [a, b, far]);
    assert.deepEqual(world.obstacles, obstacles);
    assert.equal(a.visibility, 0);
    assert.equal(far.visibility, 1);
    const visual = scene.meshes.find((m) => m.name === "wall visual batch")!;
    assert.equal(
      visual.getTotalIndices(),
      a.getTotalIndices() + b.getTotalIndices(),
    );
    assert.equal(visual.isPickable, false);
    assert.equal(visual.receiveShadows, true);
    assert.ok(shadows.getShadowMap()!.renderList!.includes(visual));
    assert.ok(!shadows.getShadowMap()!.renderList!.includes(a));
    const hit = scene.pickWithRay(
      new Ray(new Vector3(2, 1, -2), new Vector3(0, 0, 1)),
      (m) => world.solids.includes(m as typeof a),
    );
    assert.equal(hit?.pickedMesh, a);
    assert.ok(hit!.hit);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("idle furniture performs no material writes but damage and reset restore its exact finish", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const world = new World(
      scene,
      new ShadowGenerator(
        32,
        new DirectionalLight("sun", Vector3.Down(), scene),
      ),
    );
    const mesh = world.box("sofa", 1, 0.5, 2, 2, 1, 1, "#aabbcc");
    const prop = new Destructible(
      world,
      { kind: "sofa", x: 1, z: 2 },
      [mesh],
      [],
      world.explosions,
    );
    const material = prop.originals[0].material;
    const initial = material.emissiveColor.clone();
    let writes = 0;
    const copy = material.emissiveColor.copyFrom.bind(material.emissiveColor);
    material.emissiveColor.copyFrom = (color) => {
      writes++;
      return copy(color);
    };
    for (let i = 0; i < 120; i++) prop.update(1 / 60);
    assert.equal(writes, 0);
    prop.damage(1);
    prop.update(0.01);
    assert.ok(writes > 0);
    assert.ok(!material.emissiveColor.equals(initial));
    prop.update(1);
    assert.ok(material.emissiveColor.equals(initial));
    const settled = writes;
    prop.update(1);
    assert.equal(writes, settled);
    prop.damage(1);
    prop.update(0.01);
    prop.reset();
    assert.ok(material.emissiveColor.equals(initial));
    assert.equal(mesh.position.x, 1);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("PBR palms reserve their additional WebGPU buffers instead of inheriting the StandardMaterial light budget", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const palm = new PBRMaterial("palm", scene);
    const device = {
      getEngine: () => ({ isWebGPU: true }),
    } as unknown as Scene;
    assert.equal(materialLightLimit(device), 6);
    assert.equal(materialLightLimit(device, palm), 4);
    assert.equal(materialLightLimit(scene, palm), 8);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
