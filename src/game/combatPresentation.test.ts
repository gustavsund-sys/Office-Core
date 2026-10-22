import { test } from "node:test";
import assert from "node:assert/strict";
import { Matrix, Vector3, Viewport } from "@babylonjs/core";
import { projectCombatPoint, updateHitHealthBars, updateDamageNumbers } from "./combatPresentation";

test("combat overlays use CSS canvas dimensions and offsets rather than rendering pixels", () => {
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 10, top: 20 }) }) } as unknown as Document;
  try {
    for (const width of [1280, 1920, 3840]) {
      const game = {
        engine: { getRenderingCanvas: () => ({ getBoundingClientRect: () => ({ left: 80, top: 60, width, height: width * 9 / 16 }) }), getRenderWidth: () => 960, getRenderHeight: () => 540 },
        camera: { viewport: new Viewport(0, 0, 1, 1) },
        scene: { getTransformMatrix: () => Matrix.Identity() },
      } as unknown as Parameters<typeof projectCombatPoint>[0];
      const point = projectCombatPoint(game, Vector3.Zero());
      assert.equal(point.x, width / 2 + 70);
      assert.equal(point.y, width * 9 / 32 + 40);
    }
  } finally { globalThis.document = previous; }
});

test("damage number and health bar stay centred on a moving player's head", () => {
  const previous = globalThis.document;
  globalThis.document = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }) } as unknown as Document;
  try {
    const player = { root: { position: Vector3.Zero() }, hp: 100 };
    const number = { el: { style: {}, hidden: false, remove() {} }, position: Vector3.Zero(), life: 1.2, playerId: "local" };
    const bar = { el: { style: {}, hidden: false, remove() {} }, fill: { style: {} }, hp: 80, until: 2 };
    const game = {
      player, onlinePlayers: new Map(), time: 0,
      damageNumbers: [number], hitHealthBars: new Map([["local", bar]]),
      engine: { getRenderingCanvas: () => ({ getBoundingClientRect: () => ({ width: 1920, height: 1080, left: 0, top: 0 }) }) },
      camera: { viewport: new Viewport(0, 0, 1, 1) },
      scene: { getTransformMatrix: () => Matrix.Scaling(.05, .05, .05) },
    } as unknown as Parameters<typeof updateDamageNumbers>[0];
    player.root.position.x = 2;
    updateHitHealthBars.call(game);
    updateDamageNumbers.call(game, .1);
    assert.equal(number.position.x, 2);
    assert.equal(number.position.y, 1.85);
    assert.equal((number.el.style as { left: string }).left, (bar.el.style as { left: string }).left);
    assert.ok(parseFloat((number.el.style as { top: string }).top) < parseFloat((bar.el.style as { top: string }).top));
  } finally { globalThis.document = previous; }
});
