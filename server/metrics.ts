export class RoomMetrics {
  private ticks: number[] = [];
  maxInputQueue = 0;
  frames = 0;
  recordTick(ms: number, queue: number) {
    this.ticks.push(ms);
    if (this.ticks.length > 300) this.ticks.shift();
    this.maxInputQueue = Math.max(this.maxInputQueue, queue);
  }
  report() {
    const sorted = [...this.ticks].sort((a, b) => a - b);
    const percentile = (p: number) =>
      Math.round(
        (sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0) * 100,
      ) / 100;
    return {
      tickSamples: sorted.length,
      tickMs: {
        p50: percentile(0.5),
        p95: percentile(0.95),
        p99: percentile(0.99),
      },
      maxInputQueue: this.maxInputQueue,
      snapshotFrames: this.frames,
    };
  }
}
