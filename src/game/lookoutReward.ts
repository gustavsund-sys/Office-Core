import type { Team } from "../config/game";

export interface LookoutRewardState {
  bossLookoutKey: boolean;
  bossLookoutKills: number;
  bossLookoutAmmo: number;
}
export function earnLookoutSupport(state: LookoutRewardState, amount: number) {
  if (state.bossLookoutKey || amount <= 0) return false;
  state.bossLookoutKills = Math.min(10, (state.bossLookoutKills ?? 0) + amount);
  if (state.bossLookoutKills < 10) return false;
  state.bossLookoutKey = true;
  state.bossLookoutAmmo = 100;
  return true;
}
export function earnLookoutKill(
  state: LookoutRewardState,
  team: Team,
  victim: Team,
) {
  if (team === victim || state.bossLookoutKey) return false;
  return earnLookoutSupport(state, 1);
}
export function exhaustLookout(state: LookoutRewardState) {
  state.bossLookoutKey = false;
  state.bossLookoutKills = 0;
  state.bossLookoutAmmo = 0;
}
export function loseLookoutOnDeath(state: LookoutRewardState, hp: number) {
  if (hp > 0 || !state.bossLookoutKey) return false;
  exhaustLookout(state);
  return true;
}
export function lookoutTeam(side: number): Team {
  return side < 0 ? "RED" : "BLUE";
}
