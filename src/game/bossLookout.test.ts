import { test } from "node:test";
import assert from "node:assert/strict";
import { Camera, Vector3 } from "@babylonjs/core";
import { BossLookout, lookoutPose, LOOKOUT } from "./bossLookout";

test("a Core victory unlocks one reward in the following round, never immediately or twice", () => {
  let rewards = 0;
  const boss = Object.assign(Object.create(BossLookout.prototype), {
    lastWins: 0,
    lastRound: 1,
    pending: false,
    player: { bossLookoutKey: false },
    drops: [],
    exit: () => {},
    reward: () => rewards++,
  }) as BossLookout;
  boss.syncRound(1, 0);
  boss.syncRound(1, 1);
  assert.equal(rewards, 0);
  boss.syncRound(2, 1);
  boss.syncRound(2, 1);
  assert.equal(rewards, 1);
  boss.syncRound(3, 1);
  assert.equal(rewards, 1);
  boss.syncRound(3, 2);
  boss.syncRound(4, 2);
  assert.equal(rewards, 2);
});

test("entering consumes exactly one key, grants 100 separate shots and bail restores camera and door position", () => {
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { pointerLockElement: null },
  });
  try {
    const player = {
      bossLookoutKey: true,
      hp: 100,
      root: { position: Vector3.Zero() },
      verticalVelocity: 0,
      setViewVisibility: () => {},
    };
    const view = { mode: Camera.ORTHOGRAPHIC_CAMERA, fov: 0.9, minZ: 0.3 };
    const boss = Object.assign(Object.create(BossLookout.prototype), {
      active: false,
      player,
      view,
      input: { clear: () => {} },
      lockMouse: () => {},
      viewGun: { setEnabled: () => {} },
      overlay: { hidden: true },
    }) as BossLookout;
    boss.enter(-1);
    assert.equal(player.bossLookoutKey, false);
    assert.equal(boss.active, true);
    assert.equal(boss.ammo, 100);
    boss.ammo = 12;
    boss.enter(1);
    assert.equal(boss.ammo, 12);
    boss.exit();
    assert.equal(boss.active, false);
    assert.equal(view.mode, Camera.ORTHOGRAPHIC_CAMERA);
    assert.equal(view.fov, 0.9);
    assert.equal(view.minZ, 0.3);
    assert.equal(player.root.position.x, -94);
    assert.equal(player.root.position.z, -15);
    boss.enter(1);
    assert.equal(boss.active, false);
  } finally {
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("lookouts and lower access doors mirror each other and weapon range reaches the whole map", () => {
  const a = lookoutPose(-1),
    b = lookoutPose(1);
  assert.equal(a.station.x, -b.station.x);
  assert.equal(a.door.z, b.door.z);
  assert.ok(a.station.y === 20);
  assert.ok(LOOKOUT.range > 220);
});

test("Lookout atmosphere fades the distant boundary and restores the exact normal scene on exit", async () => {
  const { NullEngine, Scene, Color3, Color4 } = await import("@babylonjs/core");
  const { LookoutAtmosphere } = await import("./bossLookoutRoom");
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.012;
  scene.fogStart = 5;
  scene.fogEnd = 222;
  scene.fogColor = new Color3(0.2, 0.3, 0.4);
  scene.clearColor = new Color4(0.3, 0.4, 0.5, 1);
  const atmosphere = new LookoutAtmosphere(scene);
  atmosphere.enter();
  atmosphere.enter();
  assert.equal(scene.fogMode, Scene.FOGMODE_LINEAR);
  assert.equal(scene.fogStart, 55);
  assert.equal(scene.fogEnd, 170);
  atmosphere.exit();
  atmosphere.exit();
  assert.equal(scene.fogMode, Scene.FOGMODE_EXP2);
  assert.equal(scene.fogDensity, 0.012);
  assert.equal(scene.fogStart, 5);
  assert.equal(scene.fogEnd, 222);
  assert.deepEqual(scene.fogColor.asArray(), [0.2, 0.3, 0.4]);
  assert.deepEqual(scene.clearColor.asArray(), [0.3, 0.4, 0.5, 1]);
  engine.dispose();
});

test("both lift entrances and bail positions are inside the connected ground-floor footprint", async () => {
  const { office01 } = await import("../maps/office01");
  for (const side of [-1, 1]) {
    const { door } = lookoutPose(side);
    for (const z of [door.z, door.z - 2])
      assert.ok(
        office01.footprint.some(
          (r) =>
            Math.abs(door.x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2,
        ),
      );
  }
});

test("the turret rotates about a fixed world-space mount and the room shell stops shots", async () => {
  const { NullEngine, Scene, DirectionalLight, ShadowGenerator, Mesh } =
    await import("@babylonjs/core");
  const { World } = await import("../map/builder");
  const { buildLookoutRoom } = await import("./bossLookoutRoom");
  const engine = new NullEngine(),
    scene = new Scene(engine);
  class TestWorld extends World {
    override label(text: string) {
      return new Mesh(text, this.scene);
    }
  }
  const light = new DirectionalLight("light", new Vector3(0, -1, 0), scene);
  const world = new TestWorld(scene, new ShadowGenerator(64, light));
  const rig = buildLookoutRoom(world, -1, 20);
  rig.yaw.computeWorldMatrix(true);
  rig.pitch.computeWorldMatrix(true);
  const pivot = rig.yaw.getAbsolutePosition().clone();
  const initial = Vector3.TransformCoordinates(
    new Vector3(0, 0, 1),
    rig.gun.computeWorldMatrix(true),
  );
  rig.yaw.rotation.y += 0.5;
  rig.pitch.rotation.x = 0.7;
  rig.yaw.computeWorldMatrix(true);
  rig.pitch.computeWorldMatrix(true);
  const muzzle = Vector3.TransformCoordinates(
    new Vector3(0, 0, 1),
    rig.gun.computeWorldMatrix(true),
  );
  assert.deepEqual(rig.yaw.getAbsolutePosition().asArray(), pivot.asArray());
  assert.ok(Vector3.Distance(initial, muzzle) > 0.1);
  assert.ok(Math.abs(pivot.y - 21.55) < 0.00001);
  // The elevated receiver must clear the 1.1 m breastwork in its forward pose.
  rig.yaw.rotation.y = Math.PI / 2;
  rig.pitch.rotation.x = 0.24;
  rig.yaw.computeWorldMatrix(true);
  rig.pitch.computeWorldMatrix(true);
  const { TURRET_MUZZLE } = await import("./bossTurretModel");
  const tip = Vector3.TransformCoordinates(
    TURRET_MUZZLE,
    rig.gun.computeWorldMatrix(true),
  );
  assert.ok(tip.y > 21.1);
  assert.ok(tip.x > -87 + 0.2125);
  const { FreeCamera } = await import("@babylonjs/core");
  const normalView = new FreeCamera(
    "unscoped turret",
    new Vector3(-94 + LOOKOUT.eyeOffset, LOOKOUT.height + LOOKOUT.eyeHeight, 0),
    scene,
  );
  normalView.rotation.set(0.24, Math.PI / 2, 0);
  normalView.getViewMatrix(true);
  const sightline = scene.pickWithRay(normalView.getForwardRay(4), (mesh) =>
    mesh.isDescendantOf(rig.gun),
  );
  assert.equal(
    sightline?.hit,
    false,
    "receiver must never block the unscoped crosshair",
  );

  const shell = scene.getMeshByName("Boss Lookout room shell")!;
  assert.ok(shell.getChildMeshes().length > 0);
  assert.ok(
    shell.getChildMeshes().every((m) => m.isPickable && m.metadata.solid),
  );
  engine.dispose();
});

test("normal camera clears the Lookout roof without changing orthographic ground framing", async () => {
  const { CONFIG } = await import("../config/game");
  const { rotatingCameraPose } = await import("./rotatingCamera");
  const roofTop = LOOKOUT.height + 3.4 + 0.125;
  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    const pose = rotatingCameraPose(Vector3.Zero(), yaw);
    // Clearance includes the upper half of the orthographic view and near plane.
    assert.ok(pose.position.y > roofTop + CONFIG.camera.viewSize / 4 + 1);
    const delta = pose.position.subtract(pose.target);
    const horizontal = Math.hypot(delta.x, delta.z);
    assert.ok(
      Math.abs(
        delta.y / horizontal - Math.tan((CONFIG.camera.angle * Math.PI) / 180),
      ) < 1e-8,
    );
  }
});

test("a missed mesh pick with distance zero still produces a floor tracer and impact", async () => {
  const { Ray, Matrix } = await import("@babylonjs/core");
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  const classList = { toggle: () => {} };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { body: { classList } },
  });
  let endpoint: Vector3 | undefined,
    surface = false;
  const gun = {
    setEnabled: () => {},
    computeWorldMatrix: () => Matrix.Identity(),
  };
  const boss = Object.assign(Object.create(BossLookout.prototype), {
    active: true,
    fire: true,
    ammo: 100,
    cooldown: 0,
    drops: [],
    turrets: new Map(),
    player: { bossLookoutSelected: false, gun, bodyMeshes: [] },
    overlay: { classList, querySelector: () => ({ textContent: "" }) },
    prompt: {},
    world: {
      scene: {
        pickWithRay: () => ({
          hit: false,
          distance: 0,
          pickedPoint: null,
          getNormal: () => null,
        }),
      },
      mat: () => null,
    },
    view: {
      getForwardRay: () =>
        new Ray(new Vector3(0, 20, 0), new Vector3(0, -1, 0), LOOKOUT.range),
    },
    held: gun,
    viewGun: gun,
    camera: () => {},
    shot: () => {},
    rounds: {
      update: () => {},
      launch: (_start: Vector3, end: Vector3, contact: boolean) => {
        endpoint = end;
        surface = contact;
        return {};
      },
    },
  }) as BossLookout;
  try {
    boss.update(1 / 60, false);
    assert.equal(surface, true);
    assert.ok(endpoint);
    assert.ok(Math.abs(endpoint.y - 0.06) < 1e-8);
    assert.equal(boss.ammo, 99);
  } finally {
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("Crouch lowers the turret eye below the protective sill and visibly bends the operator", async () => {
  const { NullEngine, Scene, FreeCamera, TransformNode } =
    await import("@babylonjs/core");
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const root = new TransformNode("operator", scene);
  const hip = new TransformNode("hip", scene),
    knee = new TransformNode("knee", scene);
  const player = {
    root,
    legs: [hip],
    knees: [knee],
    crouched: false,
    setViewVisibility: () => {},
  };
  const view = new FreeCamera("view", Vector3.Zero(), scene);
  const boss = Object.assign(Object.create(BossLookout.prototype), {
    active: true,
    side: -1,
    scope: false,
    yaw: Math.PI / 2,
    pitch: 0.24,
    turrets: new Map(),
    player,
    view,
  }) as BossLookout;
  boss.camera();
  const standing = view.position.y;
  player.crouched = true;
  boss.camera();
  assert.ok(standing > LOOKOUT.height + 1.1);
  assert.ok(view.position.y < LOOKOUT.height + 1.1);
  assert.ok(root.scaling.y < 0.6);
  assert.ok(hip.rotation.x < 0 && knee.rotation.x > 1);
  player.crouched = false;
  boss.camera();
  assert.equal(root.scaling.y, 1);
  assert.equal(knee.rotation.x, 0);
  scene.dispose();
  engine.dispose();
});
