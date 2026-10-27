import test from "node:test";
import assert from "node:assert/strict";
import {
  Vector3,
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
} from "@babylonjs/core";
import { Player } from "../player/player";
import { World as GameWorld } from "../map/builder";
import { CONFIG } from "../config/game";
import { MobileInput } from "../mobile/input";
import {
  stickVector,
  mobileViewSize,
  mobileDirection,
  MOBILE_CAMERA,
  mobileSpeed,
  aimStickFires,
} from "../mobile/controlMath";
import type { World } from "../map/builder";
import { readGraphics, saveGraphics, GRAPHICS_KEY } from "./graphicsSettings";

test("mobile input installs no desktop listeners or mouse lock", () => {
  // Constructor works without window/document, making desktop listeners impossible here.
  const input = new MobileInput({} as HTMLCanvasElement);
  input.requestLock();
  assert.equal(input.aimRelativeMovement, false);
});
test("movement and aiming sticks remain independent while moving and firing", () => {
  const input = new MobileInput({} as HTMLCanvasElement),
    world = {} as World,
    pos = new Vector3(10, 0, 20);
  input.movement = { x: -0.6, y: -0.8 };
  input.aim = { x: 1, y: 0 };
  input.down = true;
  input.pressed = true;
  const a = input.command(world, pos),
    b = input.command(world, pos);
  const direction = mobileDirection(-0.6, -0.8);
  assert.equal(a.moveX, direction.x);
  assert.equal(a.moveZ, direction.z);
  assert.equal(a.aimX, pos.x + 35);
  assert.equal(a.aimZ, pos.z);
  assert.equal(a.fire, true);
  assert.equal(a.pressed, true);
  assert.equal(b.pressed, false);
  input.remote = true;
  const remote = input.command(world, pos);
  assert.equal(remote.moveX, 0);
  assert.equal(remote.moveZ, 0);
  assert.equal(remote.fire, false);
  assert.deepEqual(input.remoteAxes(), { steer: -0.6, throttle: 0.8 });
});
test("touch cancellation clears firing, movement, driving and held actions", () => {
  const input = new MobileInput({} as HTMLCanvasElement);
  input.movement = { x: 1, y: 1 };
  input.down = input.pressed = input.remoteDetonate = true;
  input.keys.add("KeyC");
  input.clear();
  assert.deepEqual(input.movement, { x: 0, y: 0 });
  assert.equal(input.down, false);
  assert.equal(input.pressed, false);
  assert.equal(input.remoteDetonate, false);
  assert.equal(input.keys.size, 0);
});
test("stick output clamps at the circular edge and ignores small thumb jitter", () => {
  assert.deepEqual(stickVector(0.2, 0.1, 40), { x: 0, y: 0, strength: 0 });
  const a = stickVector(1000, -1000, 40);
  assert.ok(Math.abs(Math.hypot(a.x, a.y) - 1) < 1e-10);
  assert.equal(a.strength, 1);
  const b = stickVector(20, 0, 40);
  assert.ok(b.x > 0 && b.x < 1);
  assert.equal(b.y, 0);
  assert.equal(stickVector(Infinity, 0, 40).strength, 0);
});
test("mobile camera keeps its landscape scale without changing shared camera configuration", () => {
  assert.ok(Math.abs(20 / mobileViewSize(844, 390) - 1.1) < 1e-10);
  assert.equal(mobileViewSize(390, 844), mobileViewSize(844, 390));
  assert.ok(Number.isFinite(mobileViewSize(0, 0)));
});
test("mobile graphics are saved independently from existing desktop preferences", () => {
  const oldStorage = globalThis.localStorage,
    oldDocument = globalThis.document;
  const entries = new Map<string, string>();
  try {
    globalThis.localStorage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, v: string) => entries.set(key, v),
    } as Storage;
    globalThis.document = {
      documentElement: { dataset: { client: "desktop" } },
    } as unknown as Document;
    saveGraphics("standard");
    document.documentElement.dataset.client = "mobile";
    assert.equal(readGraphics(), undefined);
    saveGraphics("low");
    assert.equal(readGraphics(), "low");
    document.documentElement.dataset.client = "desktop";
    assert.equal(readGraphics(), "standard");
    assert.equal(entries.get(GRAPHICS_KEY), "standard");
  } finally {
    globalThis.localStorage = oldStorage;
    globalThis.document = oldDocument;
  }
});

test("stick direction never fires and is retained after release", () => {
  const input = new MobileInput({} as HTMLCanvasElement),
    pos = Vector3.Zero();
  input.setAimStick(0.6, 0, 0.6);
  input.movement = { x: 1, y: 0 };
  const a = input.command({} as World, pos);
  assert.equal(a.fire, false);
  assert.equal(a.pressed, false);
  assert.equal(a.aimX, 35);
  input.movement = { x: 0, y: 0 };
  const b = input.command({} as World, pos);
  assert.equal(b.moveX, 0);
  assert.equal(b.moveZ, 0);
  assert.equal(b.aimX, 35);
  assert.equal(b.sprint, false);
});
test("diagonal movement projects onto the exact stick bearing in the tilted mobile camera", () => {
  const sin =
    MOBILE_CAMERA.height / Math.hypot(MOBILE_CAMERA.height, MOBILE_CAMERA.back);
  for (const [x, y] of [
    [1, 1],
    [-0.6, 0.8],
    [0.3, -0.7],
  ]) {
    const d = mobileDirection(x, y);
    assert.ok(Math.abs((d.z * sin) / d.x - -y / x) < 1e-10);
  }
});
test("outer stick requests shared sprint, exhausted players keep walking at PC speed", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const world = new GameWorld(
      scene,
      new ShadowGenerator(
        32,
        new DirectionalLight("sun", Vector3.Down(), scene),
      ),
    );
    const player = new Player(world),
      input = new MobileInput({} as HTMLCanvasElement);
    player.root.position.setAll(0);
    input.movement = { x: 0.4, y: 0 };
    assert.equal(input.command(world, player.root.position).sprint, false);
    input.movement = { x: 1, y: 0 };
    for (let i = 0; i < 120; i++)
      player.simulate(input.command(world, player.root.position), 1 / 30);
    assert.equal(player.stamina, 0);
    assert.equal(player.sprintExhausted, true);
    const x = player.root.position.x;
    for (let i = 0; i < 30; i++)
      player.simulate(input.command(world, player.root.position), 1 / 30);
    assert.ok(
      Math.abs(player.root.position.x - x - CONFIG.player.speed) < 1e-7,
    );
    assert.equal(player.sprinting, false);
    input.movement = { x: 0.6, y: 0 };
    assert.equal(input.command(world, player.root.position).sprint, false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("analog speed stays continuous across the 90 percent sprint boundary", () => {
  for (const [strength, sprint] of [
    [0, false],
    [0.01, false],
    [0.3, false],
    [0.6, false],
    [0.9, false],
    [0.91, true],
    [0.8, false],
    [1, true],
  ] as const) {
    const speed = mobileSpeed(strength);
    assert.equal(speed.sprint, sprint);
    assert.ok(
      Math.abs(
        speed.magnitude * (sprint ? 1.5 : 1) -
          (strength <= 0.9 ? strength / 0.9 : 1 + (strength - 0.9) * 5),
      ) < 1e-10,
    );
  }
});
test("shared movement retains fine analog speed and replay produces the same position", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const world = new GameWorld(
      scene,
      new ShadowGenerator(
        32,
        new DirectionalLight("sun", Vector3.Down(), scene),
      ),
    );
    const player = new Player(world),
      input = new MobileInput({} as HTMLCanvasElement);
    for (const strength of [0, 0.01, 0.1, 0.3, 0.6, 0.75, 0.9, 0.91, 0.95, 1]) {
      player.root.position.setAll(0);
      player.stamina = 4;
      player.sprintExhausted = false;
      input.movement = { x: strength, y: 0 };
      const command = input.command(world, player.root.position);
      player.simulate(command, 0.1);
      const expected =
        CONFIG.player.speed *
        (strength <= 0.9 ? strength / 0.9 : 1 + (strength - 0.9) * 5) *
        0.1;
      assert.ok(
        Math.abs(player.root.position.x - expected) < 1e-8,
        `strength ${strength}`,
      );
      const first = player.root.position.clone();
      player.root.position.setAll(0);
      player.stamina = 4;
      player.sprintExhausted = false;
      player.simulate(command, 0.1);
      assert.ok(Vector3.Distance(first, player.root.position) < 1e-10);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("aim ring fires only in its outer five percent and keeps aiming while firing", () => {
  const input = new MobileInput({} as HTMLCanvasElement);
  const world = {} as World;
  for (const value of [0, 0.3, 0.9, 0.94, 0.949999, NaN])
    assert.equal(aimStickFires(value), false);
  for (const value of [0.95, 0.99, 1]) assert.equal(aimStickFires(value), true);
  input.setAimStick(0.89, 0, 0.89);
  assert.equal(input.command(world, Vector3.Zero()).fire, false);
  input.setAimStick(0.95, 0, 0.95);
  const first = input.command(world, Vector3.Zero());
  assert.equal(first.fire, true);
  assert.equal(first.pressed, true);
  assert.equal(first.moveX, 0);
  input.setAimStick(0, -1, 1);
  const rotated = input.command(world, Vector3.Zero());
  assert.equal(rotated.fire, true);
  assert.equal(rotated.pressed, false);
  assert.equal(rotated.aimX, 0);
  assert.equal(rotated.aimZ, 35);
  input.setAimStick(0, -0.5, 0.5);
  assert.equal(input.command(world, Vector3.Zero()).fire, false);
  input.setAimStick(0, -1, 1);
  assert.equal(input.command(world, Vector3.Zero()).pressed, true);
  input.setAimStick(0, 0, 0);
  const released = input.command(world, Vector3.Zero());
  assert.equal(released.fire, false);
  assert.equal(released.aimZ, 35);
  assert.deepEqual(input.aimMovement, { x: 0, y: 0 });
  input.setAimStick(1, 0, 1);
  input.clear();
  assert.equal(input.fireHeld, false);
  assert.equal(input.down, false);
  assert.deepEqual(input.aimMovement, { x: 0, y: 0 });
});

import { mobileRepeatFire } from "../mobile/input";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { Weapons } from "../weapons/system";
test("mobile hold repeats firearm presses, stops on release and does not repeat equipment or empty clicks", () => {
  const input = new MobileInput({} as HTMLCanvasElement);
  const world = {} as World;
  const state = {
    id: "pistol" as WeaponId, ammo: 10, reloadRemaining: 0,
    carryingCoreBuster: false, carryingBeacon: false, pulseTrapSelected: false, remoteControlled: false,
  };
  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    state.id = id;
    state.carryingCoreBuster = id === "coreBuster";
    assert.equal(mobileRepeatFire(state), id !== "coreBuster" && id !== "machineGun");
  }
  state.id = "pistol"; state.carryingCoreBuster = false;
  input.repeatFire = mobileRepeatFire(state);
  input.setAimStick(1, 0, 1);
  for (let i = 0; i < 5; i++) assert.equal(input.command(world, Vector3.Zero()).pressed, true);
  input.setAimStick(0.5, 0, 0.5);
  assert.equal(input.command(world, Vector3.Zero()).pressed, false);
  for (const blocked of [
    { ammo: 0 }, { reloadRemaining: 1 }, { carryingBeacon: true },
    { pulseTrapSelected: true }, { remoteControlled: true },
  ]) assert.equal(mobileRepeatFire({ ...state, ...blocked }), false);
  input.clear();
  assert.equal(input.repeatFire, false);
});

test("held mobile fire respects each firearm's shared shot and reload limits", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const world = new GameWorld(scene, new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene)));
    for (const id of ["pistol", "pulseGun", "burstGun", "bazooka", "huntingRifle"] as const) {
      const player = new Player(world), input = new MobileInput({} as HTMLCanvasElement);
      const weapons = new Weapons(player, () => {}, () => {});
      weapons.visuals = false;
      weapons.equip(id);
      const startAmmo = weapons.ammo;
      input.setAimStick(1, 0, 1);
      for (let frame = 0; frame < 120; frame++) {
        input.repeatFire = mobileRepeatFire(weapons);
        weapons.update(input.command(world, player.root.position), 1 / 60);
      }
      const shots = startAmmo - weapons.ammo;
      if (id === "huntingRifle") assert.equal(shots, 1, "rifle cannot bypass its eight second cycle");
      else if (id === "bazooka") assert.equal(shots, 2, "rocket firing rate remains one per second");
      else if (id === "burstGun") assert.ok(shots >= 10 && shots <= 15, "hold repeats salvos with the existing pause");
      else assert.ok(shots >= 7 && shots <= 8, `${id} repeats at four shots per second`);
      input.setAimStick(0, 0, 0);
      if (id !== "burstGun") {
        const ammo = weapons.ammo;
        weapons.update(input.command(world, player.root.position), 1 / 60);
        assert.equal(weapons.ammo, ammo);
      }
      player.root.dispose();
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test("scoped mobile hold also repeats fire and stops when leaving the firing ring", () => {
  const input = new MobileInput({} as HTMLCanvasElement);
  input.scoped = true;
  input.repeatFire = true;
  const world = { scene: {
    activeCamera: { getForwardRay: () => ({ origin: Vector3.Zero(), direction: Vector3.Forward() }) },
    pickWithRay: () => null,
  } } as unknown as World;
  input.setAimStick(1, 0, 1);
  assert.equal(input.command(world, Vector3.Zero()).pressed, true);
  assert.equal(input.command(world, Vector3.Zero()).pressed, true);
  input.setAimStick(0, 0, 0);
  assert.equal(input.command(world, Vector3.Zero()).pressed, false);
});
