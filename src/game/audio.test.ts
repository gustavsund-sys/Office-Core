import { test } from "node:test";
import { strict as assert } from "node:assert";
import { machineGunRegions } from "../audio/machineGun.ts";
test("single-shot region includes the final report and all of its decay", () => {
  const rate = 1000,
    data = new Float32Array(1500);
  for (const onset of [100, 300, 500])
    for (let i = 0; i < 100; i++) data[onset + i] = Math.exp(-i / 20);
  for (let i = 600; i < 1200; i++) data[i] = 0.05 * Math.exp(-(i - 600) / 150);
  const region = machineGunRegions([data], rate);
  assert.ok(region.first >= 80 && region.first <= 110);
  assert.ok(region.last >= 480 && region.last <= 515);
  assert.equal(region.end, 1500);
});
