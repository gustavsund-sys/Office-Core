/** Keep following the selected player through death; fall back only if they leave. */
export function spectatorTarget<T extends { id: string }>(players: readonly T[], selected?: string): T | undefined {
  return players.find((player) => player.id === selected) ?? players[0];
}
