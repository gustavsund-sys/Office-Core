import { preparedMediaUrl } from "../network/preloadedMedia";

/** Play once per spawn, retrying after a blocked autoplay attempt. */
export class ShootingRangeWelcome {
  private played = false;
  constructor(private audio = new Audio(preparedMediaUrl("/audio/effects/test-some-weapons.mp3"))) {}
  spawn(audible: boolean) {
    this.played = false;
    this.play(audible);
  }
  play(audible: boolean) {
    if (this.played || !audible) return;
    this.played = true;
    this.audio.currentTime = 0;
    void this.audio.play().catch(() => { this.played = false; });
  }
}
