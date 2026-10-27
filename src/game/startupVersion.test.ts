import test from "node:test";
import assert from "node:assert/strict";
import { checkStartupVersion } from "../network/startupVersion";
import { waitForWorker, activateStartupWorker } from "../network/cacheStartup";

const manifest = { version: "0123456789abcdef", bootstrap: "/assets/boot-new.js" };
test("startup verifies the network manifest before allowing the client to load", async () => {
  let fetched = false;
  assert.equal(await checkStartupVersion("https://game.test/assets/boot-new.js", async () => { fetched = true; return manifest; }, () => assert.fail("no reload")), true);
  assert.equal(fetched, true);
});
test("a stale shell redirects without starting its old client", async () => {
  let redirected = "";
  assert.equal(await checkStartupVersion("https://game.test/assets/boot-old.js", async () => manifest, v => { redirected = v; }), false);
  assert.equal(redirected, manifest.version);
});
test("failed or invalid checks do not load an unverified client", async () => {
  const navigation = () => assert.fail("must not navigate");
  await assert.rejects(checkStartupVersion("https://game.test/assets/boot-new.js", async () => { throw Error("offline"); }, navigation), /offline/);
  await assert.rejects(checkStartupVersion("https://game.test/assets/boot-new.js", async () => ({ ...manifest, bootstrap: "https://other.test/app.js" }), navigation), /ogiltig/);
});
test("startup waits for completed worker installation and reports a failed update", async () => {
  const worker = Object.assign(new EventTarget(), { state: "installing" });
  let ready = false;
  const wait = waitForWorker(worker as ServiceWorker).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  worker.state = "installed";
  worker.dispatchEvent(new Event("statechange"));
  await wait;
  assert.equal(ready, true);
  worker.state = "redundant";
  await assert.rejects(waitForWorker(worker as ServiceWorker), /kunde inte/);
});
test("startup activates only after the worker checks other game tabs", async () => {
  const container = new EventTarget();
  const worker = { postMessage: (message: { type: string }) => {
    assert.equal(message.type, "office-core-activate");
    container.dispatchEvent(new Event("controllerchange"));
  } };
  await activateStartupWorker(container as ServiceWorkerContainer, worker as ServiceWorker);
  worker.postMessage = () => { container.dispatchEvent(new MessageEvent("message", { data: { type: "office-core-update-blocked" } })); };
  await assert.rejects(activateStartupWorker(container as ServiceWorkerContainer, worker as ServiceWorker), /pågående match/);
});
test("stalled worker installation and activation have bounded waits", async () => {
  const worker = Object.assign(new EventTarget(), { state: "installing", postMessage() {} });
  await assert.rejects(waitForWorker(worker as unknown as ServiceWorker, 5), /för lång tid/);
  await assert.rejects(activateStartupWorker(new EventTarget() as ServiceWorkerContainer, worker as unknown as ServiceWorker, 5), /kunde inte aktiveras/);
});
