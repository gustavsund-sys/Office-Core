import type { Team } from "../config/game";
export interface Hittable {
  hp: number;
  team?: Team;
  canDamageFrom(position: { x: number; z: number }): boolean;
  damage(amount: number): void;
}
