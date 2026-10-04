/** Server-time interpolation; increase buffering quickly on jitter, relax it slowly. */
export class NetworkTiming {
  offset = 0;
  delay = 85;
  jitter = 0;
  private previous?: { server: number; arrival: number };
  private offsets: number[] = [];
  observe(server: number, arrival: number) {
    this.offsets.push(server - arrival);
    if (this.offsets.length > 40) this.offsets.shift();
    const desired = Math.max(...this.offsets);
    this.offset = this.previous
      ? this.offset + (desired - this.offset) * 0.1
      : desired;
    if (this.previous) {
      const gap = Math.max(1, server - this.previous.server),
        variation = Math.abs(arrival - this.previous.arrival - gap);
      this.jitter = this.jitter * 0.85 + variation * 0.15;
      const target = Math.min(160, Math.max(65, gap + 15 + this.jitter * 2));
      this.delay += (target - this.delay) * (target > this.delay ? 0.3 : 0.03);
    }
    this.previous = { server, arrival };
  }
  renderTime(now: number) {
    return now + this.offset - this.delay;
  }
}
