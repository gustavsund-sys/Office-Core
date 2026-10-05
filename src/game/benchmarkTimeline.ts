/** Fixed simulation clock keeps benchmark choreography independent of render FPS. */
export class BenchmarkTimeline {
  tick = 0;
  private remainder = 0;
  reset() {
    this.tick = 0;
    this.remainder = 0;
  }
  advance(seconds: number, step: (tick: number, dt: number) => void) {
    this.remainder += seconds;
    while (this.remainder + 1e-9 >= 1 / 60) {
      this.remainder -= 1 / 60;
      step(++this.tick, 1 / 60);
    }
  }
}
export function benchmarkRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
