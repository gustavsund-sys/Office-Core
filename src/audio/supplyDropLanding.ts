import { preparedMediaUrl } from "../network/preloadedMedia";
import type { SupplyState } from "../game/supplyDrop";

export class SupplyDropLandingAudio {
  private falling = false;
  constructor(private audio = new Audio(preparedMediaUrl("/audio/effects/supply-drop-landing.mp3"))) {}
  update(state: SupplyState | undefined, audible: boolean, distance: number) {
    const landed = !!state && state.remaining <= 0 && this.falling;
    this.falling = !!state && state.remaining > 0;
    if (!landed || !audible) return;
    this.audio.volume = Math.max(0, 1 - distance / 60);
    if (!this.audio.volume) return;
    this.audio.currentTime = 0;
    void this.audio.play().catch(() => {});
  }
}
