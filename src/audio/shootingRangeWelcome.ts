import { preparedMediaUrl } from "../network/preloadedMedia";

/** One welcome per game session, never on respawn or return visits. */
export class ShootingRangeWelcome {
  private played = false;
  constructor(private audio = new Audio(preparedMediaUrl("/audio/effects/shooting-range.mp3"))) {}
  play(audible: boolean) {
    if (this.played || !audible) return;
    this.played = true;
    this.audio.currentTime = 0;
    void this.audio.play().catch(() => { this.played = false; });
  }
}
