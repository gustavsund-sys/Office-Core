import { preparedMediaUrl } from "../network/preloadedMedia";
import type { Team } from "../config/game";

/** Announce the first damage to each team's Core once per round. */
export class CoreAttackAnnouncement {
  private round?: number;
  private announced = new Set<Team>();
  constructor(private sounds: Record<Team, HTMLAudioElement> = {
    RED: new Audio(preparedMediaUrl("/audio/effects/red-core-under-attack.mp3")),
    BLUE: new Audio(preparedMediaUrl("/audio/effects/blue-core-under-attack.mp3")),
  }) {}
  update(started: boolean, round: number, cores: readonly { team?: Team; hp: number; active: boolean }[], audible: boolean, listenerTeam?: Team) {
    if (!started) { this.round = undefined; this.announced.clear(); return; }
    if (this.round !== round) { this.round = round; this.announced.clear(); }
    for (const core of cores) {
      if (!core.team || !core.active || core.hp >= 1000 || this.announced.has(core.team)) continue;
      this.announced.add(core.team);
      if (audible && core.team === listenerTeam) { const sound = this.sounds[core.team]; sound.currentTime = 0; void sound.play().catch(() => {}); }
    }
  }
}
