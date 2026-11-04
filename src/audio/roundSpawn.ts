import { gameAudio } from "./mixer";
import { preparedMediaUrl } from "../network/preloadedMedia";
import type { Team } from "../config/game";

/** A personal announcement for the first living spawn of each round. */
export class RoundSpawnAudio {
  private heardRound?: number;
  constructor(private sounds: Record<Team, HTMLAudioElement> = {
    RED: gameAudio(preparedMediaUrl("/audio/effects/red-team-core.mp3")),
    BLUE: gameAudio(preparedMediaUrl("/audio/effects/blue-team-core.mp3")),
  }) {}
  update(started: boolean, round: number, team: Team | undefined, alive: boolean, audible: boolean) {
    if (!started) { this.heardRound = undefined; return; }
    if (!team || !alive || this.heardRound === round) return;
    this.heardRound = round;
    if (audible) {
      const audio = this.sounds[team];
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    }
  }
}
