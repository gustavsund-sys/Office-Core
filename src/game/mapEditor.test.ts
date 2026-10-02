import { Disarm } from "./disarm";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  GroundMesh,
  FreeCamera,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Pickup } from "../pickups/pickup";
import { Player } from "../player/player";
import { Weapons } from "../weapons/system";
import {
  applyMap,
  defaultMap,
  mapWarnings,
  OBJECTS,
  parseMap,
  type MapDocument,
} from "../maps/layout";
import { office01 } from "../maps/office01";
class TestWorld extends World {
  override label(text: string) {
    return new GroundMesh(text, this.scene);
  }
}
function setup(doc: MapDocument) {
  applyMap(doc);
  const engine = new NullEngine(),
    scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 20, 0), scene);
  const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), scene);
  const world = new TestWorld(scene, new ShadowGenerator(64, sun));
  const player = new Player(world);
  const weapons = new Weapons(
    player,
    () => {},
    () => {},
  );
  return { engine, scene, world, player, weapons };
}
test("map files round-trip and reject malformed spawn configuration", () => {
  const doc = defaultMap();
  assert.deepEqual(parseMap(JSON.parse(JSON.stringify(doc))), doc);
  const bad = () => structuredClone(doc);
  let p = bad();
  p.spawns[0].interval = NaN;
  assert.throws(() => parseMap(p));
  p = bad();
  p.spawns[0].pool = [];
  assert.throws(() => parseMap(p));
  p = bad();
  p.spawns[0].pool = ["coreBuster"];
  assert.throws(() => parseMap(p));
  p = bad();
  p.objects[0].id = p.spawns[0].id;
  assert.throws(() => parseMap(p));
  p = bad();
  p.objects[0].x = 10000;
  assert.throws(() => parseMap(p));
  p = bad();
  p.objects[0].rotation = 45;
  assert.throws(() => parseMap(p));
});
test("map validation finds blocked team spawns without warnings on the default map", () => {
  const doc = defaultMap();
  assert.deepEqual(mapWarnings(doc), []);
  doc.objects.push({
    id: "blocked",
    kind: "boxes",
    x: 73,
    z: 0,
    w: 5,
    d: 5,
    rotation: 0,
    destructible: true,
  });
  assert.ok(
    mapWarnings(doc).some((message) => message.includes("Blå spawnplats")),
  );
});
test("custom weapons use their exact delay and respawn interval; random slots expose only one model", () => {
  const doc = defaultMap();
  doc.objects = [];
  doc.spawns = [
    {
      id: "custom",
      type: "weapon",
      x: 0,
      z: 0,
      weapon: "random",
      pool: ["bazooka", "machineGun"],
      interval: 7,
      initialDelay: 3,
      amount: 0,
    },
  ];
  const s = setup(doc);
  try {
    const pickup = new Pickup(s.world);
    assert.equal(pickup.endpoints.filter((p) => p.root.isEnabled()).length, 0);
    pickup.tickTimers(2.9);
    assert.equal(pickup.endpoints.filter((p) => p.root.isEnabled()).length, 0);
    pickup.tickTimers(0.1);
    assert.equal(pickup.endpoints.filter((p) => p.root.isEnabled()).length, 1);
    s.player.root.position.set(0, 0, 0);
    pickup.chooseRequested = true;
    pickup.update(0, 0, s.weapons, () => {});
    assert.ok(["bazooka", "machineGun"].includes(s.weapons.id));
    assert.equal(pickup.weaponSlots[0].cooldown, 7);
    assert.equal(pickup.endpoints.filter((p) => p.root.isEnabled()).length, 0);
    pickup.tickTimers(6.9);
    assert.equal(pickup.endpoints.filter((p) => p.root.isEnabled()).length, 0);
    pickup.tickTimers(0.2);
    assert.equal(pickup.endpoints.filter((p) => p.root.isEnabled()).length, 1);
  } finally {
    s.engine.dispose();
    applyMap(defaultMap());
  }
});
test("custom ammo grants its configured amount and respawns after its own interval", () => {
  const doc = defaultMap();
  doc.objects = [];
  doc.spawns = [
    {
      id: "ammo",
      type: "ammo",
      x: 0,
      z: 0,
      weapon: "pistol",
      pool: ["pistol"],
      interval: 13,
      initialDelay: 0,
      amount: 17,
    },
  ];
  const s = setup(doc);
  try {
    const pickup = new Pickup(s.world);
    s.player.root.position.set(0, 0, 0);
    const before = s.weapons.ammo;
    pickup.update(0, 0, s.weapons, () => {});
    assert.equal(s.weapons.ammo, before + 17);
    assert.equal(pickup.ammoDrops[0].cooldown, 13);
    pickup.tickTimers(12);
    assert.equal(pickup.ammoDrops[0].root.isEnabled(), false);
    pickup.tickTimers(1);
    assert.equal(pickup.ammoDrops[0].root.isEnabled(), true);
  } finally {
    s.engine.dispose();
    applyMap(defaultMap());
  }
});
test("all palette objects build and rotated cover keeps its collision orientation", () => {
  const doc = defaultMap();
  doc.spawns = [];
  doc.objects = Object.keys(OBJECTS).map((kind, i) => ({
    id: `prop-${i}`,
    kind: kind as keyof typeof OBJECTS,
    x: -15 + (i % 6) * 5,
    z: -10 + Math.floor(i / 6) * 5,
    rotation: 90,
    destructible: true,
  }));
  const s = setup(doc);
  try {
    s.world.build();
    assert.equal(s.world.destructibles.length, Object.keys(OBJECTS).length + 6);
    const wall = s.world.destructibles.find(
      (p) => p.prop.kind === "partition",
    )!;
    assert.equal(wall.obstacles[0].w, 0.3);
    assert.equal(wall.obstacles[0].d, 3);
    const count = s.world.obstacles.length;
    wall.damage(500);
    assert.ok(s.world.obstacles.length < count);
    assert.equal(office01.bases.length, 2);
  } finally {
    s.engine.dispose();
    applyMap(defaultMap());
  }
});

test("side bases and new north/south approaches form a mirrored footprint", () => {
  const shape = (p: { x: number; z: number; w: number; d: number }) =>
    `${p.x},${p.z},${p.w},${p.d}`;
  const footprints = new Set(office01.footprint.map(shape));
  for (const rect of office01.footprint)
    assert.ok(
      footprints.has(shape({ ...rect, x: -rect.x })),
      `Missing mirror at ${rect.x}, ${rect.z}`,
    );
  assert.deepEqual(
    office01.bases.map((b) => [b.x, b.z]),
    [
      [-82, 0],
      [82, 0],
    ],
  );
  assert.deepEqual(
    office01.bases.map((b) => [b.spawn.x, b.spawn.z]),
    [
      [-73, 0],
      [73, 0],
    ],
  );
  for (const side of [-1, 1])
    for (const z of [8, -8, -22, -30, -44])
      assert.ok(
        office01.footprint.some(
          (r) =>
            Math.abs(side * 65 - r.x) <= r.w / 2 &&
            Math.abs(z - r.z) <= r.d / 2,
        ),
      );
});

test("med-kits heal living injured players, cap HP, and respawn per location", () => {
  for (const type of ["medkit", "superMedkit"] as const) {
    const doc = defaultMap();
    doc.spawns = [
      {
        id: "health",
        type,
        x: 0,
        z: 0,
        weapon: "pistol",
        pool: ["pistol"],
        interval: 10,
        initialDelay: 2,
        amount: 0,
      },
    ];
    const s = setup(parseMap(doc));
    try {
      const pickups = new Pickup(s.world);
      const drop = pickups.healthDrops[0];
      s.player.root.position.set(0, 0, 0);
      s.player.hp = 20;
      pickups.update(1, 0, s.weapons, () => {});
      assert.equal(s.player.hp, 20);
      pickups.update(1, 1, s.weapons, () => {});
      assert.equal(s.player.hp, type === "medkit" ? 70 : 100);
      assert.equal(drop.root.isEnabled(), false);
      s.player.hp = 0;
      pickups.update(10, 11, s.weapons, () => {});
      assert.equal(s.player.hp, 0);
      assert.equal(drop.root.isEnabled(), true);
      s.player.hp = 100;
      pickups.update(0, 11, s.weapons, () => {});
      assert.equal(drop.root.isEnabled(), true);
      s.player.hp = 80;
      pickups.update(0, 11, s.weapons, () => {});
      assert.equal(s.player.hp, 100);
      s.player.hp = 30;
      pickups.update(0, 11, s.weapons, () => {});
      assert.equal(s.player.hp, 30);
    } finally {
      s.engine.dispose();
      applyMap(defaultMap());
    }
  }
});

test("disarming requires proximity and ten seconds, and cancels on leaving, death or firing", () => {
  const s = setup(defaultMap());
  try {
    s.weapons.equip("coreBuster");
    s.player.root.position.set(0, 0, 0);
    s.weapons.update(
      { moveX: 0, moveZ: 0, aimX: 0, aimZ: 0, fire: true, pressed: true },
      0,
    );
    assert.equal(s.weapons.charges.length, 1);
    const channel = new Disarm();
    s.player.root.position.x = 2;
    channel.update(s.player, [s.weapons], true, false, 1);
    assert.equal(channel.target, undefined);
    s.player.root.position.x = 0;
    channel.update(s.player, [s.weapons], true, false, 4);
    assert.equal(channel.elapsed, 4);
    s.player.root.position.x = 2;
    channel.update(s.player, [s.weapons], false, false, 1);
    assert.equal(channel.elapsed, 0);
    s.player.root.position.x = 0;
    channel.update(s.player, [s.weapons], true, false, 4);
    channel.update(s.player, [s.weapons], false, true, 1);
    assert.equal(channel.target, undefined);
    channel.update(s.player, [s.weapons], true, false, 4);
    s.player.hp = 0;
    channel.update(s.player, [s.weapons], false, false, 1);
    assert.equal(channel.target, undefined);
    s.player.hp = 100;
    channel.update(s.player, [s.weapons], true, false, 9.9);
    assert.equal(s.weapons.charges.length, 1);
    channel.update(s.player, [s.weapons], false, false, 0.1);
    assert.equal(s.weapons.charges.length, 0);
    assert.equal(channel.target, undefined);
  } finally {
    s.engine.dispose();
    applyMap(defaultMap());
  }
});
