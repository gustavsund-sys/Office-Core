import { test } from "node:test";
import assert from "node:assert/strict";
import { BenchmarkTimeline, benchmarkRandom } from "./benchmarkTimeline";
test("benchmark emits the identical event timeline at different rendering rates", () => {
  const run = (fps: number) => {
    const clock = new BenchmarkTimeline();
    const events: number[] = [];
    for (let i = 0; i < fps * 3; i++)
      clock.advance(1 / fps, (tick) => {
        if (tick % 30 === 0) events.push(tick);
      });
    assert.equal(clock.tick, 180);
    clock.reset();
    assert.equal(clock.tick, 0);
    return events;
  };
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(144), run(60));
});
test("each explosion repeats identical random values independently of previous events", () => {
  const values = (seed: number) => {
    const random = benchmarkRandom(seed);
    return Array.from({ length: 100 }, random);
  };
  assert.deepEqual(values(12345), values(12345));
  assert.notDeepEqual(values(12345), values(12346));
});
