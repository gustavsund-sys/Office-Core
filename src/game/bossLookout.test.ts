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

test('the turret rotates about a fixed world-space mount and the room shell stops shots', async () => {
  const {NullEngine,Scene,DirectionalLight,ShadowGenerator,Mesh}=await import('@babylonjs/core');
  const {World}=await import('../map/builder');
  const {buildLookoutRoom}=await import('./bossLookoutRoom');
  const engine=new NullEngine(),scene=new Scene(engine);
  class TestWorld extends World { override label(text:string){return new Mesh(text,this.scene);} }
  const light=new DirectionalLight('light',new Vector3(0,-1,0),scene);
  const world=new TestWorld(scene,new ShadowGenerator(64,light));
  const rig=buildLookoutRoom(world,-1,20);
  rig.yaw.computeWorldMatrix(true);rig.pitch.computeWorldMatrix(true);
  const pivot=rig.yaw.getAbsolutePosition().clone();
  const initial=Vector3.TransformCoordinates(new Vector3(0,0,1),rig.gun.computeWorldMatrix(true));
  rig.yaw.rotation.y+=.5;rig.pitch.rotation.x=.7;
  rig.yaw.computeWorldMatrix(true);rig.pitch.computeWorldMatrix(true);
  const muzzle=Vector3.TransformCoordinates(new Vector3(0,0,1),rig.gun.computeWorldMatrix(true));
  assert.deepEqual(rig.yaw.getAbsolutePosition().asArray(),pivot.asArray());
  assert.ok(Vector3.Distance(initial,muzzle)>.1);
  assert.ok(Math.abs(pivot.y-21.1)<.00001);
  const shell=scene.getMeshByName('Boss Lookout room shell')!;
  assert.ok(shell.getChildMeshes().length>0);
  assert.ok(shell.getChildMeshes().every(m=>m.isPickable&&m.metadata.solid));
  engine.dispose();
});
