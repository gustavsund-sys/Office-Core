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
