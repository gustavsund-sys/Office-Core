import { preparedMediaUrl } from "../network/preloadedMedia";
import type { SupplyState } from "../game/supplyDrop";
import type { Team } from "../config/game";

/** Play once when the requesting team's incoming drop first appears. */
export class SupplyDropRequestAudio {
  private seen = false;
  constructor(private audio = new Audio(preparedMediaUrl("/audio/effects/supply-drop-request.mp3"))) {}
  update(state: SupplyState | undefined, team: Team | undefined, audible: boolean) {
    if (!state) { this.seen = false; return; }
    if (this.seen || !team) return;
    this.seen = true;
    if (state.team === team && state.remaining > 0 && audible) {
      this.audio.currentTime = 0;
      void this.audio.play().catch(() => {});
    }
  }
}
