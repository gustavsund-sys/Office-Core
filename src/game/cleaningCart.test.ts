import { Player } from "../player/player";
import test from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  Mesh,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { World } from "../map/builder";
class TestWorld extends World {
  override label(text: string) {
    return new Mesh(text, this.scene);
  }
}
function setup(authoritative = false) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const world = new TestWorld(
    scene,
    new ShadowGenerator(32, new DirectionalLight("sun", Vector3.Down(), scene)),
  );
  world.authoritative = authoritative;
  return {
    engine,
    scene,
    world,
    close() {
      scene.dispose();
      engine.dispose();
    },
  };
}

test("cart pushes update collision and visual position, stop at walls and rewind before replay", () => {
  const s = setup();
  try {
    s.world.carts.add(0, 0);
    const c = s.world.carts.carts[0];
    assert.ok(c.root.getChildMeshes().length > 0);
    const initial = s.world.carts.snapshot();
    s.world.carts.push({ x: -0.95, z: 0 }, 0.1, 0, 0.42);
    assert.ok(c.obstacle.x > 0);
    assert.equal(c.body.position.x, c.obstacle.x);
    assert.equal(c.root.position.x, c.obstacle.x);
    const predicted = s.world.carts.snapshot();
    s.world.carts.sync(initial);
    s.world.carts.push({ x: -0.95, z: 0 }, 0.1, 0, 0.42);
    assert.deepEqual(
      s.world.carts.snapshot(),
      predicted,
      "replay is deterministic after authoritative rewind",
    );
    s.world.box("wall", 2, 1, 0, 0.4, 2, 5, "#888888", true);
    for (let i = 0; i < 100; i++)
      s.world.carts.push({ x: c.obstacle.x - 0.9, z: 0 }, 0.1, 0, 0.42);
    assert.ok(c.obstacle.x < 1.2, "cart stays in front of the wall");
    const stopped = c.obstacle.x;
    s.world.carts.push({ x: stopped - 0.9, z: 0 }, -0.1, 0, 0.42);
    assert.equal(c.obstacle.x, stopped, "walking away does not pull the cart");
    s.world.carts.reset();
    assert.deepEqual(s.world.carts.snapshot(), initial);
  } finally {
    s.close();
  }
});

test("office life creates identical collision and cart placement on server and client", () => {
  const client = setup(),
    server = setup(true);
  try {
    client.world.build();
    server.world.build();
    assert.ok(client.world.carts.carts.length > 0);
    assert.deepEqual(client.world.obstacles, server.world.obstacles);
    assert.deepEqual(
      client.world.carts.snapshot(),
      server.world.carts.snapshot(),
    );
    const names = client.scene.meshes.map((m) => m.name).join(" ");
    assert.match(names, /coat rack/);
    assert.match(names, /whiteboard/);
    assert.match(names, /cart/);
  } finally {
    client.close();
    server.close();
  }
});

test("player movement pushes the cart but render-only extrapolation never does", () => {
  const s = setup();
  try {
    s.world.carts.add(0, 0);
    const player = new Player(s.world);
    player.root.position.set(-0.95, 0, 0);
    const input = {
      moveX: 1,
      moveZ: 0,
      aimX: 10,
      aimZ: 0,
      fire: false,
      pressed: false,
    };
    player.simulate(input, 0.02, false);
    assert.equal(s.world.carts.snapshot()[0].x, 0);
    player.root.position.set(-0.95, 0, 0);
    player.simulate(input, 0.02);
    assert.ok(s.world.carts.snapshot()[0].x > 0);
  } finally {
    s.close();
  }
});
