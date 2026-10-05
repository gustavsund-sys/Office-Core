import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderSize,
  frameStats,
  smoothEnough,
  recommendGraphics,
  combatStats,
} from "./graphicsSettings";
import { inactivityState } from "../../shared/inactivity";
test("render levels fit the viewport and retain aspect ratio", () => {
  for (const [w, h] of [
    [3440, 1440],
    [900, 1600],
    [800, 600],
    [1920, 1080],
  ])
    for (const tier of ["low", "medium", "standard", "high"] as const) {
      const size = renderSize(w, h, tier);
      assert.ok(size.width <= w && size.height <= h);
      assert.ok(Math.abs(size.width / size.height - w / h) < 0.01);
      if (tier === "low") assert.ok(size.height <= 720 && size.width <= 1280);
    }
});
test("recommendations reject spikes despite good average FPS", () => {
  assert.equal(smoothEnough(frameStats(Array(100).fill(13))), true);
  assert.equal(
    smoothEnough(frameStats([...Array(95).fill(10), ...Array(5).fill(60)])),
    false,
  );
});
test("idle deadline is five plus two minutes and real activity resets it", () => {
  assert.equal(inactivityState(0, 299999).warn, false);
  assert.equal(inactivityState(0, 300000).remaining, 120);
  assert.equal(inactivityState(0, 419999).expired, false);
  assert.equal(inactivityState(0, 420000).expired, true);
  assert.equal(inactivityState(420000, 420000).warn, false);
});

test("Standard at 56 FPS is preferred over a faster low tier", () => {
  const standard = frameStats([
    ...Array(94).fill(16.7),
    ...Array(6).fill(33.6),
  ]);
  assert.ok(standard.fps > 55 && standard.fps < 57);
  assert.equal(
    recommendGraphics([
      { tier: "standard", stats: standard },
      { tier: "low", stats: frameStats(Array(100).fill(16.7)) },
    ]),
    "standard",
  );
});
test("Standard above 45 FPS is retained despite a higher stall percentage", () => {
  assert.equal(
    recommendGraphics([
      {
        tier: "standard",
        stats: frameStats([...Array(90).fill(16), ...Array(10).fill(70)]),
      },
      { tier: "medium", stats: frameStats(Array(100).fill(16.7)) },
    ]),
    "standard",
  );
});

test("combat recommendation considers the worse phase rather than hiding stalls in an average", () => {
  const smooth = frameStats(Array(100).fill(16));
  const stalled = frameStats([...Array(90).fill(16), ...Array(10).fill(100)]);
  const combined = combatStats(smooth, stalled);
  assert.equal(combined.fps, stalled.fps);
  assert.equal(combined.p95, stalled.p95);
  assert.equal(
    recommendGraphics([
      { tier: "standard", stats: combined },
      { tier: "medium", stats: combatStats(smooth, smooth) },
    ]),
    "medium",
  );
});

test("Standard is preferred at 45 FPS in both phases, but not below the limit", () => {
  const low = {
    tier: "low" as const,
    stats: frameStats(Array(100).fill(16.7)),
  };
  assert.equal(
    recommendGraphics([
      {
        tier: "standard",
        stats: combatStats(
          frameStats(Array(100).fill(20)),
          frameStats(Array(100).fill(1000 / 45)),
        ),
      },
      low,
    ]),
    "standard",
  );
  assert.equal(
    recommendGraphics([
      {
        tier: "standard",
        stats: combatStats(
          frameStats(Array(100).fill(20)),
          frameStats(Array(100).fill(1000 / 44)),
        ),
      },
      low,
    ]),
    "low",
  );
});

test("fallback ranks FPS first and uses stall percentage only for exact FPS ties", () => {
  const base = frameStats(Array(100).fill(20));
  assert.equal(
    recommendGraphics([
      { tier: "high", stats: { ...base, fps: 43, stalls: 0.1 } },
      { tier: "low", stats: { ...base, fps: 42, stalls: 0 } },
    ]),
    "high",
  );
  assert.equal(
    recommendGraphics([
      { tier: "high", stats: { ...base, fps: 43, stalls: 0.1 } },
      { tier: "medium", stats: { ...base, fps: 43, stalls: 0.02 } },
    ]),
    "medium",
  );
});
