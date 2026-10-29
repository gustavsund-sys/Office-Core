import { blocked, type Obstacle } from "./collision";
import { office01 } from "../maps/office01";
import type { Team } from "../config/game";

export type SupplyKind = "bossKey" | "shield" | "beacon" | "coreBuster";
export interface SupplyItem { kind: SupplyKind; x: number; z: number; available: boolean }
export interface SupplyState { team: Team; x: number; z: number; remaining: number; items: SupplyItem[] }
export const SUPPLY_DESCENT = 30;
const kinds: SupplyKind[] = ["bossKey", "bossKey", "shield", "shield", "shield", "beacon", "beacon", "coreBuster", "coreBuster"];

/** Pick a clear, walkable patch that fits the crate and all nine separate rewards. */
export function supplyLocations(obstacles: Obstacle[]) {
  const candidates: { x: number; z: number; items: SupplyItem[] }[] = [];
  const walkable = (x: number, z: number) => office01.footprint.some((r) =>
    Math.abs(x - r.x) <= r.w / 2 - 1 && Math.abs(z - r.z) <= r.d / 2 - 1);
  for (let x = -80; x <= 80; x += 2) for (let z = -12; z <= 54; z += 2) {
    if (!walkable(x, z) || blocked(x, z, 2.0, obstacles)) continue;
    const items = kinds.map((kind, i) => {
      const angle = Math.PI * 2 * i / kinds.length;
      return { kind, x: x + 3.8 * Math.cos(angle), z: z + 3.8 * Math.sin(angle), available: true };
    });
    if (items.every((item) => walkable(item.x, item.z) && !blocked(item.x, item.z, 1.1, obstacles)))
      candidates.push({ x, z, items });
  }
  return candidates;
}
export class SupplyDrop {
  elapsed = 0;
  state?: SupplyState;
  started = false;
  private sites?: Partial<Record<Team, { x: number; z: number; items: SupplyItem[] }>>;
  prepare(obstacles: Obstacle[]) {
    const locations = supplyLocations(obstacles);
    this.sites = {};
    for (const team of ["RED", "BLUE"] as const) {
      const base = office01.bases.find((b) => b.team === team)!;
      const nearby = locations.filter((point) => Math.hypot(point.x - base.x, point.z - base.z) >= 9 && point.items.every((item) => Math.hypot(item.x - base.x, item.z - base.z) >= 5.5))
        .sort((a, b) => Math.hypot(a.x - base.x, a.z - base.z) - Math.hypot(b.x - base.x, b.z - base.z) || a.x - b.x || a.z - b.z);
      this.sites[team] = nearby[0];
    }
  }
  reset() { this.elapsed = 0; this.state = undefined; this.started = false; }
  update(dt: number) {
    if (dt <= 0) return;
    this.elapsed += dt;
    if (this.state && this.state.remaining > 0) {
      const remaining = this.state.remaining - dt;
      this.state.remaining = remaining < 1e-9 ? 0 : remaining;
      if (!this.state.remaining) return "landed" as const;
    }
  }
  request(team: Team, wins: Record<Team, number>, x: number, z: number, obstacles: Obstacle[]) {
    const enemy = team === "RED" ? "BLUE" : "RED";
    if (this.started || wins[team] >= wins[enemy]) return false;
    const zone = office01.weaponEnds.find((p) => (team === "RED" ? p.x < 0 : p.x > 0) && Math.hypot(x - p.x, z - p.z) <= 8);
    if (!zone) return false;
    if (!this.sites) this.prepare(obstacles);
    const location = this.sites![team];
    if (!location || blocked(location.x, location.z, 2.0, obstacles) || location.items.some((item) => blocked(item.x, item.z, 1.1, obstacles))) return false;
    this.state = { team, x: location.x, z: location.z, items: location.items.map((item) => ({ ...item, available: true })), remaining: SUPPLY_DESCENT };
    this.started = true;
    return true;
  }
  collect(x: number, z: number, canTake: (kind: SupplyKind) => boolean) {
    if (!this.state || this.state.remaining > 0) return;
    const item = this.state.items.filter((item) => item.available && canTake(item.kind) && Math.hypot(x - item.x, z - item.z) < 2.2)
      .sort((a, b) => Math.hypot(x - a.x, z - a.z) - Math.hypot(x - b.x, z - b.z))[0];
    if (item) item.available = false;
    return item?.kind;
  }
}
