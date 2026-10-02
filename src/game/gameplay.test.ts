import { rotatingCameraPose } from "./rotatingCamera";
import { relativeMovement, lookDirection } from "../player/look";
import { ChaseCamera } from "./chaseCamera";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  NullEngine,
  FreeCamera,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Mesh,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Player, type PlayerCommand } from "../player/player";
import { Weapons } from "../weapons/system";
import { Damageable } from "../core/damageable";
import { Pickup } from "../pickups/pickup";
import { blocked } from "./collision";
import { Destructible } from "../core/destructible";
import { office01 } from "../maps/office01";
class TestWorld extends World {
  override label(text: string) {
    return new Mesh(text, this.scene);
  }
}
function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("sun", new Vector3(0, -1, 0), scene);
  const world = new TestWorld(scene, new ShadowGenerator(64, light));
  const player = new Player(world);
  player.root.position.set(0, 0, 0);
  player.root.rotation.y = 0;
  let shots = 0;
  const weapon = new Weapons(
    player,
    () => {},
    () => shots++,
  );
  return {
    engine,
    scene,
    world,
    player,
    weapon,
    shots: () => shots,
    sync: () => scene.meshes.forEach((m) => m.computeWorldMatrix(true)),
  };
}
const idle: PlayerCommand = {
  moveX: 0,
  moveZ: 0,
  aimX: 0,
  aimZ: 10,
  fire: false,
  pressed: false,
};
test("pistol deals 20 damage, is click-only, and respects cooldown", () => {
  const s = setup();
  try {
    const t = new Damageable(s.world, "target", 0, 5);
    s.sync();
    s.weapon.update({ ...idle, fire: true, pressed: true }, 0.01);
    assert.equal(t.hp, 80);
    s.weapon.update({ ...idle, fire: true, pressed: true }, 0.05);
    assert.equal(t.hp, 80);
    s.weapon.update({ ...idle, fire: true }, 0.3);
    assert.equal(t.hp, 80);
    s.weapon.update({ ...idle, fire: true, pressed: true }, 0.3);
    assert.equal(t.hp, 60);
    assert.equal(s.weapon.ammo, 58);
  } finally {
    s.engine.dispose();
  }
});
test("walls stop bullets before targets, and range is enforced", () => {
  const s = setup();
  try {
    const t = new Damageable(s.world, "target", 0, 5);
    s.world.wall(0, 2, 3, 0.4);
    s.sync();
    s.weapon.update({ ...idle, pressed: true }, 0.3);
    assert.equal(t.hp, 100);
    s.player.root.position.set(10, 0, 0);
    const far = new Damageable(s.world, "target", 10, 22);
    s.sync();
    s.weapon.update({ ...idle, pressed: true }, 0.3);
    assert.equal(far.hp, 100);
  } finally {
    s.engine.dispose();
  }
});
test("Machine Gun stays empty after 100 rounds until ammo is collected", () => {
  const s = setup();
  try {
    s.weapon.equip("machineGun");
    for (let i = 0; i < 100; i++)
      s.weapon.update({ ...idle, fire: true }, 0.101);
    assert.equal(s.shots(), 100);
    assert.equal(s.weapon.id, "machineGun");
    assert.equal(s.weapon.ammo, 0);
    s.weapon.update({ ...idle, fire: true }, 1);
    assert.equal(s.shots(), 100);
  } finally {
    s.engine.dispose();
  }
});
test("dummy death and five-second respawn; Core shield requires base entry", () => {
  const s = setup();
  try {
    const t = new Damageable(s.world, "target", 0, 5);
    t.damage(100);
    assert.equal(t.mesh.isEnabled(), false);
    t.update(4.9, 0);
    assert.equal(t.hp, 0);
    t.update(0.11, 0);
    assert.equal(t.hp, 100);
    assert.equal(t.mesh.isEnabled(), true);
    const core = new Damageable(s.world, "core", 10, 10, "RED");
    assert.equal(core.canDamageFrom({ x: 0, z: 10 }), false);
    assert.equal(core.canDamageFrom({ x: 7, z: 10 }), true);
    core.damage(20);
    assert.equal(core.hp, 980);
  } finally {
    s.engine.dispose();
  }
});
test("Atrium no longer has the legacy machine gun spawn", () => {
  const s = setup();
  try {
    const p = new Pickup(s.world);
    s.player.root.position.set(office01.pickup.x, 0, office01.pickup.z);
    let picked = 0;
    p.update(0.016, 0, s.weapon, () => picked++);
    assert.equal(s.weapon.id, "pistol");
    assert.equal(picked, 0);
    p.update(0.1, 0, s.weapon, () => picked++);
    assert.equal(picked, 0);
  } finally {
    s.engine.dispose();
  }
});
test("Core rooms require a destroyed door, while spawn pads stay reachable", () => {
  const s = setup();
  try {
    s.world.build();
    office01.bases.forEach(
      (b) => new Damageable(s.world, "core", b.x, b.z, b.team),
    );
    const key = (x: number, z: number) => `${x},${z}`;
    const reachable = () => {
      const start: [number, number] = [
        office01.spawn.x * 2,
        office01.spawn.z * 2,
      ];
      const queue: [number, number][] = [start];
      const seen = new Set([key(...start)]);
      const distances = new Map([[key(...start), 0]]);
      for (let i = 0; i < queue.length; i++) {
        const [x, z] = queue[i];
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx,
            nz = z + dz,
            k = key(nx, nz);
          if (
            Math.abs(nx) > office01.size - 1 ||
            Math.abs(nz) > office01.size - 1 ||
            seen.has(k) ||
            blocked(nx * 0.5, nz * 0.5, 0.36, s.world.obstacles)
          )
            continue;
          seen.add(k);
          distances.set(k, distances.get(key(x, z))! + 0.5);
          queue.push([nx, nz]);
        }
      }
      return { seen, distances };
    };
    const before = reachable();
    assert.ok(before.seen.has("0,2"), "pickup reachable");
    for (const endpoint of office01.weaponEnds)
      assert.ok(
        before.seen.has(key(endpoint.x * 2, endpoint.z * 2)),
        "exterior weapon reachable",
      );
    assert.ok(before.distances.get("0,2")! > 60, "long corridors remain");
    const doors = s.world.destructibles.filter(
      (d) => d.prop.kind === "coreDoor",
    );
    assert.equal(doors.length, 12, "three doors for each of four cores");
    for (const b of office01.bases) {
      const spawnZ = b.z - Math.sign(b.z) * 9;
      assert.equal(
        blocked(b.x, spawnZ, 0.36, s.world.obstacles),
        false,
        `${b.team} spawn clear`,
      );
      assert.ok(
        before.seen.has(key(b.x * 2, spawnZ * 2)),
        `${b.team} spawn reachable`,
      );
      assert.equal(
        before.seen.has(
          key((b.x + Math.sign(b.x) * 3) * 2, (b.z + Math.sign(b.z)) * 2),
        ),
        false,
        `${b.team} core sealed`,
      );
      for (const dx of [-3, 3])
        for (const dz of [-3, 3])
          assert.equal(
            before.seen.has(key((b.x + dx) * 2, (b.z + dz) * 2)),
            false,
            `${b.team} room corner ${dx},${dz} is sealed`,
          );
    }
    for (const door of doors) {
      assert.equal(door.hp, 100);
      assert.equal(
        blocked(door.prop.x, door.prop.z, 0.36, s.world.obstacles),
        true,
      );
      for (let i = 0; i < 5; i++) door.damage(20, "coreBuster");
      assert.equal(door.hp, 0);
      assert.equal(
        blocked(door.prop.x, door.prop.z, 0.36, s.world.obstacles),
        false,
      );
    }
    const after = reachable();
    for (const b of office01.bases)
      assert.ok(
        after.seen.has(
          key((b.x + Math.sign(b.x) * 3) * 2, (b.z + Math.sign(b.z)) * 2),
        ),
        `${b.team} core accessible after breach`,
      );
  } finally {
    s.engine.dispose();
  }
});

test("ordinary shots cannot damage a Core security door", () => {
  const s = setup();
  try {
    s.world.build();
    const door = s.world.destructibles.find(
      (d) =>
        d.prop.kind === "coreDoor" &&
        d.team === "BLUE" &&
        d.prop.w! > d.prop.d!,
    )!;
    const zDirection = Math.sign(door.prop.z);
    s.player.root.position.set(door.prop.x, 0, door.prop.z - zDirection * 2.5);
    s.sync();
    s.weapon.update(
      {
        ...idle,
        pressed: true,
        shotTarget: new Vector3(door.prop.x, 1.1, door.prop.z),
      },
      0.3,
    );
    assert.equal(door.hp, 100);
  } finally {
    s.engine.dispose();
  }
});

test("shooting cover destroys it once, removes collision, and exposes target behind it", () => {
  const s = setup();
  try {
    const mesh = s.world.box(
      "test copier",
      0,
      0.8,
      3,
      1.5,
      1.6,
      1.2,
      "#aaaaaa",
      true,
    );
    const object = new Destructible(
      s.world,
      { kind: "copier", x: 0, z: 3, destructible: true },
      [mesh],
      [s.world.obstacles[0]],
      s.world.explosions,
    );
    const target = new Damageable(s.world, "target", 0, 6);
    let bursts = 0;
    s.world.explosions.onBurst = () => bursts++;
    s.sync();
    assert.equal(blocked(0, 3, 0.36, s.world.obstacles), true);
    for (let i = 0; i < 3; i++)
      s.weapon.update({ ...idle, pressed: true }, 0.26);
    assert.equal(object.hp, 0);
    assert.equal(target.hp, 100);
    assert.equal(bursts, 1);
    assert.equal(blocked(0, 3, 0.36, s.world.obstacles), false);
    assert.ok(object.meshes.every((m) => !m.isEnabled()));
    s.weapon.update({ ...idle, pressed: true }, 0.26);
    assert.equal(target.hp, 80);
    object.damage(20);
    assert.equal(bursts, 1);
    assert.ok(s.world.explosions.particles.length > 20);
    for (let i = 0; i < 120; i++) s.world.explosions.update(1 / 60);
    assert.equal(s.world.explosions.particles.length, 0);
    assert.equal(s.world.explosions.lights.length, 0);
  } finally {
    s.engine.dispose();
  }
});
test("low desks remain shootable at weapon height", () => {
  const s = setup();
  try {
    const mesh = s.world.box("desk", 0, 0.95, 3, 2, 0.18, 1, "#aaaaaa", true);
    const desk = new Destructible(
      s.world,
      { kind: "desk", x: 0, z: 3 },
      [mesh],
      [s.world.obstacles[0]],
      s.world.explosions,
    );
    s.sync();
    s.weapon.update({ ...idle, pressed: true }, 0.26);
    assert.equal(desk.hp, 40);
  } finally {
    s.engine.dispose();
  }
});

test("WASD rotates with facing, strafing remains perpendicular", () => {
  const f = relativeMovement(0, 1, Math.PI / 2),
    r = relativeMovement(1, 0, Math.PI / 2);
  assert.ok(Math.abs(f.x - 1) < 1e-6 && Math.abs(f.z) < 1e-6);
  assert.ok(Math.abs(r.x) < 1e-6 && Math.abs(r.z + 1) < 1e-6);
  const look = lookDirection(0, 0.3);
  assert.ok(look.y < 0 && look.z > 0);
});
test("chase camera pulls in before a wall and returns behind the player", () => {
  const s = setup();
  try {
    const camera = new FreeCamera("test camera", Vector3.Zero(), s.scene),
      chase = new ChaseCamera();
    s.world.wall(0, -2, 6, 0.4);
    s.sync();
    const close = chase.update(camera, s.world, Vector3.Zero(), 0, 0, 1);
    assert.ok(close < 2);
    assert.ok(camera.position.z > -1.8);
    const far = chase.update(camera, s.world, new Vector3(10, 0, 0), 0, 0, 1);
    assert.ok(far > 4.9);
    assert.ok(camera.position.z < 0);
  } finally {
    s.engine.dispose();
  }
});
test("third-person shots converge toward the crosshair while walls still block", () => {
  const s = setup();
  try {
    const target = new Damageable(s.world, "target", 3, 6);
    s.sync();
    s.weapon.update(
      { ...idle, pressed: true, shotTarget: new Vector3(3, 1.1, 6) },
      0.26,
    );
    assert.equal(target.hp, 80);
    s.world.wall(1.5, 3, 3, 0.4);
    s.sync();
    s.weapon.update(
      { ...idle, pressed: true, shotTarget: new Vector3(3, 1.1, 6) },
      0.26,
    );
    assert.equal(target.hp, 80);
  } finally {
    s.engine.dispose();
  }
});

test("rotating top-down preserves original height and 60-degree angle at every heading", () => {
  const player = new Vector3(10, 0, 12);
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const { position, target } = rotatingCameraPose(player, yaw);
    assert.equal(position.y, 23);
    assert.ok(
      Math.abs(
        Math.atan2(
          position.y,
          Math.hypot(position.x - target.x, position.z - target.z),
        ) -
          Math.PI / 3,
      ) < 1e-6,
    );
    const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    assert.ok(
      Vector3.Dot(position.subtract(player), forward) < 0,
      "camera remains behind player",
    );
    assert.ok(
      Vector3.Dot(target.subtract(player), forward) > 0,
      "view leads movement",
    );
  }
});

test("new weapons: burst cadence, bazooka magazine reload, pulse beam and ammo", () => {
  const s = setup();
  const command = {
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimZ: 10,
    fire: false,
    pressed: true,
  };
  try {
    s.weapon.equip("burstGun");
    s.weapon.update(command, 0.01);
    for (let i = 0; i < 4; i++)
      s.weapon.update({ ...command, pressed: false }, 0.081);
    assert.equal(s.weapon.ammo, 95);
    s.weapon.update(command, 0.5);
    assert.equal(s.weapon.ammo, 95);
    s.weapon.update(command, 0.51);
    assert.equal(s.weapon.ammo, 94);
    s.weapon.equip("bazooka");
    for (let i = 0; i < 3; i++) s.weapon.update(command, 1.01);
    assert.equal(s.weapon.ammo, 0);
    assert.equal(s.weapon.reloadRemaining, 0);
    s.weapon.update(command, 6);
    assert.equal(s.weapon.ammo, 0);
    s.weapon.addAmmo("bazooka", 3);
    assert.equal(s.weapon.reloadRemaining, 5);
    s.weapon.update(command, 4);
    assert.equal(s.weapon.ammo, 0);
    s.weapon.update(command, 1);
    assert.equal(s.weapon.ammo, 3);
    assert.equal(s.weapon.id, "bazooka");
    s.weapon.equip("pulseGun");
    s.weapon.update(command, 0.01);
    assert.equal(s.weapon.ammo, 29);
    assert.ok(s.weapon.effects.some((e) => e.mesh.name === "pulse beam"));
  } finally {
    s.scene.dispose();
    s.engine.dispose();
  }
});

test("bazooka travels along an arc and damages only on impact", () => {
  const s = setup();
  try {
    const target = new Damageable(s.world, "target", 0, 8);
    s.sync();
    s.weapon.equip("bazooka");
    s.weapon.update({ ...idle, pressed: true }, 0.01);
    assert.equal(target.hp, 100);
    assert.equal(s.weapon.rockets.length, 1);
    s.weapon.update(idle, 0.2);
    assert.equal(target.hp, 100);
    assert.ok(s.weapon.rockets[0].mesh.position.y > 1.1);
    s.weapon.update(idle, 0.8);
    assert.equal(target.hp, 0);
    assert.equal(s.weapon.rockets.length, 0);
  } finally {
    s.scene.dispose();
    s.engine.dispose();
  }
});

test("ammo crates replenish only their weapon and spawn faster in hotspots", () => {
  const s = setup();
  try {
    const pickup = new Pickup(s.world);
    assert.equal(new Set(pickup.ammoDrops.map((drop) => drop.id)).size, 5);
    const drop = pickup.ammoDrops.find((drop) => drop.id === "pulseGun")!;
    s.weapon.equip("pistol");
    const pistolAmmo = s.weapon.ammo;
    s.player.root.position.set(drop.root.position.x, 0, drop.root.position.z);
    pickup.update(0.01, 0, s.weapon, () => {});
    assert.equal(s.weapon.ammo, pistolAmmo);
    assert.equal(s.weapon.ammunition.pulseGun, 30);
    assert.equal(drop.cooldown, 0);
    assert.ok(drop.root.isEnabled());
    s.weapon.equip("pulseGun");
    pickup.update(0.01, 0, s.weapon, () => {});
    assert.equal(s.weapon.ammunition.pulseGun, 45);
    assert.ok(drop.cooldown > 0);
    for (const slot of pickup.singleAmmoSlots) {
      assert.equal(
        slot.drops.filter((drop) => drop.root.isEnabled()).length,
        1,
      );
    }
    assert.ok(pickup.ammoDrops.some((drop) => drop.interval === 8));
    assert.ok(pickup.ammoDrops.some((drop) => drop.interval === 12));
    assert.ok(pickup.ammoDrops.some((drop) => drop.interval === 40));
  } finally {
    s.scene.dispose();
    s.engine.dispose();
  }
});

test("drop zones offer every weapon and inventory holds pistol plus one special", () => {
  const s = setup();
  try {
    const pickups = new Pickup(s.world);
    assert.equal(pickups.endpoints.length, 24);
    const drop = pickups.endpoints.find((drop) => drop.id === "bazooka")!;
    s.player.root.position.set(drop.root.position.x, 0, drop.root.position.z);
    pickups.update(0.01, 0, s.weapon, () => {});
    assert.equal(s.weapon.id, "pistol", "walking by does not pick a weapon");
    pickups.chooseRequested = true;
    pickups.update(0.01, 0, s.weapon, () => {});
    assert.equal(s.weapon.specialWeapon, "bazooka");
    s.weapon.switchSlot(1);
    assert.equal(s.weapon.id, "pistol");
    s.weapon.switchSlot(2);
    assert.equal(s.weapon.id, "bazooka");
    s.weapon.equip("pulseGun");
    assert.equal(s.weapon.specialWeapon, "pulseGun");
    s.weapon.switchSlot(1);
    s.weapon.switchSlot(2);
    assert.equal(s.weapon.id, "pulseGun");
  } finally {
    s.scene.dispose();
    s.engine.dispose();
  }
});

test("jump leaves the ground, rejects midair jump and lands once", () => {
  const s = setup();
  try {
    assert.equal(s.player.jump(), true);
    s.player.update(idle, 0.1);
    assert.ok(s.player.root.position.y > 0);
    assert.equal(s.player.jump(), false);
    let landings = 0;
    for (let i = 0; i < 20; i++) {
      s.player.update(idle, 0.05);
      if (s.player.landed) landings++;
    }
    assert.equal(landings, 1);
    assert.equal(s.player.grounded, true);
    assert.equal(s.player.root.position.y, 0);
  } finally {
    s.scene.dispose();
    s.engine.dispose();
  }
});

test("Core buster is exclusive, breaches barriers and persists as a death drop", () => {
  const s = setup();
  try {
    s.world.build();
    const pickups = new Pickup(s.world);
    s.weapon.onCoreBusterDropped = (position) =>
      pickups.dropCoreBuster(position);
    const door = s.world.destructibles.find(
      (wall) => wall.prop.kind === "coreDoor",
    )!;
    door.damage(1000);
    assert.equal(door.hp, 100);
    s.weapon.equip("coreBuster");
    s.weapon.switchSlot(1);
    assert.equal(s.weapon.id, "coreBuster");
    s.player.root.position.set(door.position.x + 1, 0, door.position.z);
    s.weapon.update({ ...idle, pressed: true }, 0.01);
    assert.equal(s.weapon.id, "pistol");
    assert.equal(door.hp, 100);
    s.weapon.update(idle, 24);
    assert.equal(door.hp, 100);
    s.weapon.update(idle, 1.1);
    assert.equal(door.hp, 0);
    s.weapon.equip("coreBuster");
    s.player.hp = 0;
    s.weapon.update(idle, 0.01);
    const dropped = pickups.endpoints.find((drop) => drop.dropped)!;
    assert.ok(dropped);
    assert.equal(s.weapon.specialWeapon, undefined);
    pickups.update(100, 100, s.weapon, () => {});
    assert.ok(pickups.endpoints.includes(dropped));
    s.player.hp = 100;
    pickups.chooseRequested = true;
    pickups.update(0.01, 101, s.weapon, () => {});
    assert.equal(s.weapon.id, "coreBuster");
    assert.ok(!pickups.endpoints.includes(dropped));
  } finally {
    s.scene.dispose();
    s.engine.dispose();
  }
});

test("headless authoritative hits emit traces and impacts without visual allocations", () => {
  const s = setup();
  try {
    const target = new Damageable(s.world, "target", 0, 5);
    s.sync();
    s.weapon.visuals = false;
    let impacts = 0,
      traces = 0;
    s.weapon.onImpact = (position) => {
      impacts++;
      assert.ok(position.z > 0);
    };
    s.weapon.onTrace = () => traces++;
    const meshes = s.scene.meshes.length;
    s.weapon.update({ ...idle, fire: true, pressed: true }, 1 / 30);
    assert.equal(target.hp, 80);
    assert.equal(impacts, 1);
    assert.equal(traces, 1);
    assert.equal(s.scene.meshes.length, meshes);
  } finally {
    s.engine.dispose();
  }
});

test("replaying unacknowledged movement reproduces position and jumping", () => {
  const s = setup();
  try {
    const server = new Player(s.world);
    const inputs = Array.from({ length: 18 }, (_, i) => ({
      ...idle,
      moveZ: 1,
      jump: i === 2,
    }));
    for (const input of inputs) {
      if (input.jump) s.player.jump();
      s.player.update(input, 1 / 30);
    }
    for (const input of inputs.slice(0, 7)) {
      if (input.jump) server.jump();
      server.update(input, 1 / 30);
    }
    s.player.root.position.copyFrom(server.root.position);
    s.player.verticalVelocity = server.verticalVelocity;
    for (const input of inputs.slice(7)) s.player.update(input, 1 / 30);
    for (const input of inputs.slice(7)) server.update(input, 1 / 30);
    assert.ok(
      Vector3.Distance(s.player.root.position, server.root.position) < 1e-8,
    );
    assert.equal(s.player.verticalVelocity, server.verticalVelocity);
  } finally {
    s.engine.dispose();
  }
});

test("bazooka splash damages nearby targets once, falls off and excludes distant targets", () => {
  const s = setup();
  try {
    const direct = new Damageable(s.world, "target", 0, 5);
    const nearby = new Damageable(s.world, "target", 1.8, 5);
    const far = new Damageable(s.world, "target", 8, 5);
    s.sync();
    s.weapon.equip("bazooka");
    s.weapon.update({ ...idle, fire: true, pressed: true }, 1 / 30);
    for (let i = 0; i < 30 && s.weapon.rockets.length; i++)
      s.weapon.update(idle, 1 / 30);
    assert.equal(direct.hp, 0);
    assert.ok(nearby.hp > 0 && nearby.hp < 100);
    assert.equal(far.hp, 100);
    const hp = nearby.hp;
    s.weapon.update(idle, 0.2);
    assert.equal(nearby.hp, hp);
  } finally {
    s.engine.dispose();
  }
});

test("solid walls shield nearby targets from bazooka splash", () => {
  const s = setup();
  try {
    new Damageable(s.world, "target", 0, 5);
    const protectedTarget = new Damageable(s.world, "target", 2.5, 5);
    s.world.box("blast shield", 1.3, 1, 5, 0.2, 2, 4, "#888888", true);
    s.sync();
    s.weapon.equip("bazooka");
    s.weapon.update({ ...idle, fire: true, pressed: true }, 1 / 30);
    for (let i = 0; i < 30 && s.weapon.rockets.length; i++)
      s.weapon.update(idle, 1 / 30);
    assert.equal(protectedTarget.hp, 100);
  } finally {
    s.engine.dispose();
  }
});

test("four bazooka direct hits destroy an active Core even when fired outside its proximity shield", () => {
  const s = setup();
  try {
    const core = new Damageable(s.world, "core", 0, 8, "BLUE");
    assert.equal(core.canDamageFrom(s.player.root.position), false);
    s.sync();
    s.weapon.equip("bazooka");
    s.weapon.ammo = 4;
    for (let shot = 0; shot < 4; shot++) {
      s.weapon.cooldown = 0;
      s.weapon.update({ ...idle, fire: true, pressed: true }, 1 / 30);
      for (let i = 0; i < 50 && s.weapon.rockets.length; i++)
        s.weapon.update(idle, 1 / 30);
      assert.equal(core.hp, 1000 - 250 * (shot + 1));
    }
  } finally {
    s.engine.dispose();
  }
});
