import { test } from "node:test";
import { strict as assert } from "node:assert";
import { shotAudibility } from "../audio/spatial";
test("remote shots become quieter and duller with distance and cover", () => {
  const near = shotAudibility(3, false), far = shotAudibility(70, false), covered = shotAudibility(70, true);
  assert.ok(near.gain > far.gain);
  assert.ok(near.frequency > far.frequency);
  assert.ok(covered.gain < far.gain);
  assert.ok(covered.frequency < far.frequency);
  assert.ok(shotAudibility(200, false).gain > 0);
});
