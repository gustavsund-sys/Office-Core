import test from "node:test";
import assert from "node:assert/strict";
import { waitForTextureAssets } from "./startupReadiness";
const texture = (ready: () => boolean, renderTarget = false) => ({
  name: "test",
  isReady: ready,
  isRenderTarget: renderTarget,
  getClassName: () => "Texture",
});
test("startup accepts textures becoming ready without another load event and ignores internal render targets", async () => {
  let ready = false,
    frames = 0;
  await waitForTextureAssets(
    () => [texture(() => ready), texture(() => false, true)],
    async () => {
      frames++;
      ready = true;
    },
  );
  assert.equal(frames, 1);
});
test("startup checks the current scene list when an asynchronous model replaces textures", async () => {
  let old = true,
    frames = 0;
  await waitForTextureAssets(
    () => (old ? [texture(() => false)] : []),
    async () => {
      frames++;
      old = false;
    },
  );
  assert.equal(frames, 1);
});
test("permanently unavailable textures produce a retryable startup error instead of an infinite wait", async () => {
  let time = 0;
  await assert.rejects(
    waitForTextureAssets(
      () => [texture(() => false)],
      async () => {
        time += 50000;
      },
      () => time,
    ),
    /ladda om/,
  );
});

import { waitForGraphicsWarmup } from "./startupReadiness";
test("optional shader warmup releases startup when scene never reports ready", async () => {
  let time = 0,
    frames = 0;
  const ready = await waitForGraphicsWarmup(
    () => false,
    async () => {
      time += 1000;
      frames++;
    },
    5000,
    () => time,
  );
  assert.equal(ready, false);
  assert.equal(frames, 5);
});
test("shader readiness succeeds immediately or after pending frames and propagates render failure", async () => {
  let frames = 0;
  assert.equal(
    await waitForGraphicsWarmup(
      () => true,
      async () => {
        frames++;
      },
    ),
    true,
  );
  assert.equal(frames, 0);
  assert.equal(
    await waitForGraphicsWarmup(
      () => frames === 2,
      async () => {
        frames++;
      },
    ),
    true,
  );
  await assert.rejects(
    waitForGraphicsWarmup(
      () => false,
      async () => {
        throw new Error("GPU failed");
      },
    ),
    /GPU failed/,
  );
});

import { finishStartupRendering } from "./startupReadiness";
test("warmup resources stay alive until GPU work completes, with rendering already stopped", async () => {
  const steps: string[] = [];
  let done!: () => void;
  const work = new Promise<void>((resolve) => { done = resolve; });
  const finishing = finishStartupRendering(
    () => { steps.push("stop"); },
    () => { steps.push("drain"); return work; },
    () => { steps.push("cleanup"); },
  );
  assert.deepEqual(steps, ["stop", "drain"]);
  done();
  await finishing;
  assert.deepEqual(steps, ["stop", "drain", "cleanup"]);
});
test("GPU failure prevents successful handoff but still cleans temporary resources", async () => {
  let cleaned = false;
  const failure = new Error("device lost");
  await assert.rejects(finishStartupRendering(() => {}, async () => { throw failure; }, () => { cleaned = true; }), (error) => error === failure);
  assert.equal(cleaned, true);
});
test("a stalled GPU queue produces an error rather than an infinite loading screen", async () => {
  let cleaned = false;
  await assert.rejects(finishStartupRendering(() => {}, () => new Promise(() => {}), () => { cleaned = true; }, 5), /GPU:n/);
  assert.equal(cleaned, true);
});
