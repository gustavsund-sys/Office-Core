/** First hit, then every fifth hit; respawn restarts the sequence. */
export class BloodCadence {
  private hits = new Map<string, number>();
  hit(id: string) {
    const count = (this.hits.get(id) ?? 0) + 1;
    this.hits.set(id, count);
    return count === 1 || count % 5 === 0;
  }
  resetPlayer(id: string) {
    this.hits.delete(id);
  }
  reset() {
    this.hits.clear();
  }
}
