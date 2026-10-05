export type GraphicsTier = "low" | "medium" | "standard" | "high";
export const GRAPHICS = {
  low: { name: "Låg", height: 720, shadow: 0, effects: 0.3, glow: 0.04 },
  medium: {
    name: "Mellan",
    height: 1080,
    shadow: 512,
    effects: 0.6,
    glow: 0.1,
  },
  standard: {
    name: "Standard",
    height: 1080,
    shadow: 1024,
    effects: 1,
    glow: 0.2,
  },
  high: { name: "Hög", height: 1440, shadow: 1024, effects: 1, glow: 0.2 },
} as const;
export const GRAPHICS_KEY = "officeCore.graphics.v1";
export function readGraphics(): GraphicsTier | undefined {
  try {
    const tier = localStorage.getItem(GRAPHICS_KEY);
    return tier && Object.hasOwn(GRAPHICS, tier)
      ? (tier as GraphicsTier)
      : undefined;
  } catch {
    return;
  }
}
export function saveGraphics(tier: GraphicsTier) {
  try {
    localStorage.setItem(GRAPHICS_KEY, tier);
  } catch {}
}
export function renderSize(width: number, height: number, tier: GraphicsTier) {
  const max = GRAPHICS[tier].height;
  const scale = Math.min(1, max / height, (max * 16) / 9 / width);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  };
}
export function frameStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean =
    samples.reduce((sum, x) => sum + x, 0) / Math.max(1, samples.length);
  return {
    fps: 1000 / Math.max(1, mean),
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)] ?? Infinity,
    spikes:
      samples.filter((x) => x > 33.4).length / Math.max(1, samples.length),
    stalls: samples.filter((x) => x > 50).length / Math.max(1, samples.length),
  };
}
export function smoothEnough(stats: ReturnType<typeof frameStats>) {
  return stats.fps >= 57 && stats.p95 <= 18 && stats.spikes < 0.02;
}

export function standardIsComfortable(stats: ReturnType<typeof frameStats>) {
  // Standard retains its requested quality preference once the FPS target is met.
  return stats.fps >= 45;
}
export function recommendGraphics(
  results: { tier: GraphicsTier; stats: ReturnType<typeof frameStats> }[],
): GraphicsTier {
  const standard = results.find((r) => r.tier === "standard");
  if (standard && standardIsComfortable(standard.stats)) return "standard";
  return results.reduce((best, candidate) => {
    if (candidate.stats.fps > best.stats.fps) return candidate;
    if (
      candidate.stats.fps === best.stats.fps &&
      candidate.stats.stalls < best.stats.stalls
    )
      return candidate;
    return best;
  }).tier;
}

export function combatStats(
  normal: ReturnType<typeof frameStats>,
  intense: ReturnType<typeof frameStats>,
) {
  return {
    fps: Math.min(normal.fps, intense.fps),
    p95: Math.max(normal.p95, intense.p95),
    spikes: Math.max(normal.spikes, intense.spikes),
    stalls: Math.max(normal.stalls, intense.stalls),
  };
}
