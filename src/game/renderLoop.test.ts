import test from "node:test";
import assert from "node:assert/strict";
import { guardedRenderLoop } from "./renderLoop";
test("a failed frame stops and reports once instead of silently freezing", () => {
  let frames = 0,
    stops = 0;
  const reports: unknown[] = [];
  const error = new Error("touch HUD failure");
  const frame = guardedRenderLoop(
    () => {
      frames++;
      if (frames === 2) throw error;
    },
    () => stops++,
    (e) => reports.push(e),
  );
  frame();
  assert.equal(stops, 0);
  frame();
  frame();
  assert.equal(frames, 2);
  assert.equal(stops, 1);
  assert.deepEqual(reports, [error]);
});

test("first gameplay render waits for the engine frame and first-frame failures are reported", async () => {
  const { startGameRenderLoop } = await import("./renderLoop");
  let callback: (() => void) | undefined;
  let insideFrame = false;
  let ticks = 0;
  const failure = new Error("first gameplay frame failed");
  const reports: unknown[] = [];
  const engine = {
    runRenderLoop(fn: () => void) { callback = fn; },
    stopRenderLoop(fn: () => void) { assert.equal(fn, callback); callback = undefined; },
  };
  startGameRenderLoop(engine, () => {
    assert.equal(insideFrame, true);
    ticks++;
    throw failure;
  }, (error) => reports.push(error));
  assert.equal(ticks, 0, "must not render synchronously during loop installation");
  insideFrame = true;
  callback!();
  insideFrame = false;
  assert.equal(ticks, 1);
  assert.equal(callback, undefined);
  assert.deepEqual(reports, [failure]);
});
