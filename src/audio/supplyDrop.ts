import { preparedMediaUrl } from "../network/preloadedMedia";

/** Loop the supplied recording during the descent, respecting the game's sound setting. */
export class SupplyDropAudio {
  private audio: HTMLAudioElement;
  private pending = false;
  private desired = false;
  constructor(audio = new Audio(preparedMediaUrl("/audio/effects/supply-drop.mp3"))) {
    this.audio = audio;
    audio.loop = true;
    audio.volume = 0.5;
  }
  update(falling: boolean, audible: boolean, distance = 0) {
    this.audio.volume = 0.5 * Math.max(0, 1 - Math.max(0, distance - 10) / 100);
    this.desired = falling && audible;
    if (!this.desired) {
      if (!this.audio.paused) this.audio.pause();
      if (!falling && this.audio.currentTime) this.audio.currentTime = 0;
      return;
    }
    if (this.audio.paused && !this.pending) {
      this.pending = true;
      void this.audio.play().catch(() => {}).finally(() => {
        this.pending = false;
        if (!this.desired && !this.audio.paused) this.audio.pause();
      });
    }
  }
}
