export type PingKind = "enemy" | "defend" | "help";
export interface TeamPing {
  kind: PingKind;
  x: number;
  z: number;
  name?: string;
  team?: string;
}
export function validTeamPing(value: unknown): value is TeamPing {
  if (!value || typeof value !== "object") return false;
  const p = value as TeamPing;
  return (
    ["enemy", "defend", "help"].includes(p.kind) &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.z) &&
    Math.abs(p.x) < 200 &&
    Math.abs(p.z) < 200
  );
}
export interface Performance {
  kills: number;
  assists: number;
  disarms: number;
  coreDamage: number;
  defense: number;
}
export const emptyPerformance = (): Performance => ({
  kills: 0,
  assists: 0,
  disarms: 0,
  coreDamage: 0,
  defense: 0,
});
export class CombatLedger {
  totals = new Map<string, Performance>();
  round = new Map<string, Performance>();
  damage = new Map<string, Map<string, { amount: number; at: number }>>();
  add(id: string, key: keyof Performance, amount = 1) {
    for (const map of [this.totals, this.round]) {
      if (!map.has(id)) map.set(id, emptyPerformance());
      map.get(id)![key] += amount;
    }
  }
  hit(shooter: string, victim: string, amount: number, now: number) {
    if (shooter === victim || amount <= 0) return;
    if (!this.damage.has(victim)) this.damage.set(victim, new Map());
    const previous = this.damage.get(victim)!.get(shooter);
    this.damage
      .get(victim)!
      .set(shooter, {
        amount:
          (previous && now - previous.at <= 8 ? previous.amount : 0) + amount,
        at: now,
      });
  }
  kill(shooter: string, victim: string, now: number, defending: boolean) {
    this.add(shooter, "kills");
    if (defending) this.add(shooter, "defense");
    for (const [id, hit] of this.damage.get(victim) ?? [])
      if (
        id !== shooter &&
        id !== victim &&
        now - hit.at <= 8 &&
        hit.amount >= 15
      )
        this.add(id, "assists");
    this.damage.delete(victim);
  }
  resetRound() {
    this.round.clear();
    this.damage.clear();
  }
}
export function highlights(players: ({ name: string } & Performance)[]) {
  return (
    [
      ["Bästa försvarare", "defense"],
      ["Rundans räddning", "disarms"],
      ["Core-specialist", "coreDamage"],
      ["Lagspelare", "assists"],
      ["Flest kills", "kills"],
    ] as const
  ).flatMap(([title, key]) => {
    const best = [...players].sort((a, b) => b[key] - a[key])[0];
    return best && best[key] > 0
      ? [{ title, name: best.name, value: best[key] }]
      : [];
  });
}
