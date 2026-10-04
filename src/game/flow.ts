import type { Snapshot } from "../../shared/protocol";
export type GamePhase =
  "lobby" | "equipment" | "playing" | "roundEnd" | "countdown" | "seriesEnd";
export function gamePhase(
  state: Pick<
    Snapshot,
    "started" | "preparing" | "winner" | "seriesWinner" | "countdown"
  >,
): GamePhase {
  if (state.seriesWinner) return "seriesEnd";
  if (state.countdown) return "countdown";
  if (state.winner) return "roundEnd";
  if (state.started) return "playing";
  return state.preparing ? "equipment" : "lobby";
}
export function preparationStatus(
  players: { connected: boolean; team: string; loadout?: unknown }[],
) {
  if (new Set(players.map((p) => p.team)).size < 2) return "cancel";
  if (players.some((p) => !p.connected || !p.loadout)) return "waiting";
  return "ready";
}
