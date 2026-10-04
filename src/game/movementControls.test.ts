import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core";
import { Input } from "../player/player";
import type { World } from "../map/builder";
test("WASD and arrows share directions without doubling speed, including mixed diagonals", () => {
  const originalWindow = globalThis.window,
    originalDocument = globalThis.document;
  try {
    globalThis.window = { addEventListener() {} } as unknown as Window &
      typeof globalThis;
    globalThis.document = { addEventListener() {} } as unknown as Document;
    const input = new Input({
      addEventListener() {},
    } as unknown as HTMLCanvasElement);
    input.mode = "thirdPerson";
    input.yaw = 0;
    const move = (...keys: string[]) => {
      input.keys = new Set(keys);
      const c = input.command({} as World, Vector3.Zero());
      return [c.moveX, c.moveZ];
    };
    assert.deepEqual(move("KeyW"), move("ArrowUp"));
    assert.deepEqual(move("KeyS"), move("ArrowDown"));
    assert.deepEqual(move("KeyA"), move("ArrowLeft"));
    assert.deepEqual(move("KeyD"), move("ArrowRight"));
    assert.deepEqual(move("KeyW", "ArrowUp"), move("KeyW"));
    assert.deepEqual(move("KeyW", "ArrowRight"), move("KeyW", "KeyD"));
    assert.deepEqual(move("KeyW", "ArrowDown"), move());
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
