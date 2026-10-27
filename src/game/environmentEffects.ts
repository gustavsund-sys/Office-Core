import type { CombatLighting } from "../effects/combatLighting";
import type { Warzone } from "../effects/warzone";

/** Shared local/online presentation work, independent of network snapshots. */
export function updateEnvironmentEffects(
  game: { paused: boolean; warzone: Warzone; world: { lighting?: CombatLighting } },
  dt: number,
) {
  game.warzone.update(game.paused ? 0 : dt);
  // Short light pulses must expire even when gameplay is paused.
  game.world.lighting?.update(dt);
}
