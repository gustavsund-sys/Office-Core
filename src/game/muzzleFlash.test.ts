import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine, Scene, Vector3 } from "@babylonjs/core";
import {
  MuzzleFlashes,
  muzzleTexture,
  WEAPON_FLASHES,
} from "../effects/muzzleFlash";
test("muzzle flame follows barrel axis, uses crossed non-pickable planes and expires in bounded pool", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const effects = new MuzzleFlashes(scene);
    const direction = new Vector3(1, 0.2, 0.4).normalize();
    effects.emit(new Vector3(3, 2, 1), direction);
    const root = scene.transformNodes.find(
      (n) => n.name === "crossed muzzle flash",
    )!;
    root.computeWorldMatrix(true);
    const axis = Vector3.TransformNormal(
      Vector3.Forward(),
      root.getWorldMatrix(),
    ).normalize();
    assert.ok(Vector3.Dot(axis, direction) > 0.999);
    assert.equal(root.getChildMeshes().length, 3);
    assert.ok(root.getChildMeshes().every((m) => !m.isPickable));
    assert.equal(
      scene.meshes.filter((m) => m.name === "axial flame").length,
      2,
    );
    for (let i = 0; i < 200; i++)
      effects.emit(Vector3.Zero(), direction, i % 2 === 0);
    assert.equal(scene.meshes.length, 96);
    assert.equal(
      scene.materials.filter((m) => m.name.startsWith("muzzle flame")).length,
      13,
    );
    effects.update(0.1);
    assert.ok(
      scene.transformNodes
        .filter((n) => n.name === "crossed muzzle flash")
        .every((n) => !n.isEnabled()),
    );
    effects.emit(Vector3.Zero(), direction);
    assert.equal(scene.meshes.length, 96);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("weapon muzzle variants match the chosen reference numbers", () => {
  assert.deepEqual(WEAPON_FLASHES.machineGun, [4, 5, 6]);
  assert.deepEqual(WEAPON_FLASHES.huntingRifle, [1]);
  for (const weapon of ["pistol", "burstGun"] as const) {
    assert.equal(muzzleTexture(weapon, 0), "/vfx/muzzle/numbered-7.png");
    assert.equal(muzzleTexture(weapon, 0.5), "/vfx/muzzle/numbered-8.png");
    assert.equal(muzzleTexture(weapon, 0.999), "/vfx/muzzle/numbered-9.png");
  }
  assert.equal(muzzleTexture("machineGun", 0.5), "/vfx/muzzle/numbered-5.png");
  assert.equal(
    muzzleTexture("huntingRifle", 0.999),
    "/vfx/muzzle/numbered-1.png",
  );
  assert.equal(muzzleTexture(undefined, 0), "/vfx/muzzle/flash-1.png");
});

test("turret uses flash 4 and advances clockwise roll five degrees per shot without turning the barrel axis", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  try {
    const effects = new MuzzleFlashes(scene);
    assert.equal(muzzleTexture("turret", 0), "/vfx/muzzle/numbered-4.png");
    assert.equal(muzzleTexture("turret", 0.99), "/vfx/muzzle/numbered-4.png");
    for (let shot = 1; shot <= 73; shot++) {
      effects.emit(Vector3.Zero(), Vector3.Forward(), false, 1, "turret");
      const root = scene.transformNodes.find(
        (n) => n.name === "crossed muzzle flash",
      )!;
      root.computeWorldMatrix(true);
      const right = Vector3.TransformNormal(
        Vector3.Right(),
        root.getWorldMatrix(),
      ).normalize();
      const forward = Vector3.TransformNormal(
        Vector3.Forward(),
        root.getWorldMatrix(),
      ).normalize();
      const angle = (-shot * Math.PI) / 36;
      assert.ok(Math.abs(right.x - Math.cos(angle)) < 1e-6);
      assert.ok(Math.abs(right.y - Math.sin(angle)) < 1e-6);
      assert.ok(Vector3.Dot(forward, Vector3.Forward()) > 0.999);
      effects.update(0.1);
      // Ordinary weapon flashes must not advance the turret's rotation.
      effects.emit(Vector3.Zero(), Vector3.Forward(), false, 1, "pistol");
      effects.update(0.1);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
