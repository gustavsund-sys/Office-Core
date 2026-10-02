import type { Team } from "../config/game";
export interface Hittable {
  hp: number;
  kind?: string;
  team?: Team;
  canDamageFrom(position: { x: number; z: number }): boolean;
  damage(amount: number): void;
}
