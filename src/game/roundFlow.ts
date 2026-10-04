import { setGameUpdateAllowed } from "../network/cache";

import { applyLoadout } from "./loadout";

import { emptyPerformance } from "./engagement";

import { resetRound } from "./round";

import { showVictory, closeVictory } from "../ui/victory";

import { office01 } from "../maps/office01";

import type { Game } from "./game";
type Context = Pick<
  Game,
  | "botRespawn"
  | "cores"
  | "currentRound"
  | "engagement"
  | "loadout"
  | "localCountdown"
  | "localDisarm"
  | "localLedger"
  | "localRoundAction"
  | "rc"
  | "match"
  | "pickup"
  | "playCountdown"
  | "player"
  | "respawnRemaining"
  | "setPaused"
  | "teamWins"
  | "testPlayer"
  | "testToolsEnabled"
  | "testWeapons"
  | "weapons"
  | "world"
>;
export function advanceCountdown(this: Context, dt: number) {
  if (this.localCountdown > 0) {
    this.localCountdown = Math.max(0, this.localCountdown - dt);
    this.engagement.countdown(this.localCountdown || undefined);
    this.playCountdown(this.localCountdown || undefined);
    if (!this.localCountdown) {
      const action = this.localRoundAction;
      this.localRoundAction = undefined;
      action?.();
    }
  }
}
export function finishLocalRound(this: Context) {
  const winner = this.match.evaluate(this.cores);
  if (winner) {
    this.rc.reset();
    this.weapons.switchSlot(2);
    this.teamWins[winner]++;
    setGameUpdateAllowed(this.teamWins[winner] >= 3);
    this.setPaused(true);
    showVictory(
      winner,
      this.match.members.filter((member) => member.team === winner),
      () => {
        if (this.teamWins[winner] >= 3) {
          location.reload();
          return;
        }
        this.localRoundAction = () => {
          closeVictory();
          this.localLedger.resetRound();
          this.engagement.clear();
          this.match.winner = undefined;
          this.currentRound++;
          this.rc.reset();
          resetRound(
            this.world,
            this.cores,
            [this.weapons, ...(this.testWeapons ? [this.testWeapons] : [])],
            this.pickup,
          );
          this.localDisarm.reset();
          this.respawnRemaining = 0;
          this.botRespawn = 0;
          for (const [i, player] of [this.player, this.testPlayer].entries()) {
            if (player) {
              const base = office01.bases.find(
                (b) => b.team === this.match.members[i].team,
              )!;
              player.root.position.set(base.spawn.x, 0, base.spawn.z);
            }
          }
          if (this.testPlayer)
            this.pickup.beacons.spawnTestGuard({
              id: "bot",
              team: this.match.members[1].team,
              player: this.testPlayer,
            });
          if (this.testToolsEnabled)
            this.pickup.pulseTraps.spawnTestTrap(this.match.members[1].team);
          applyLoadout(this.weapons, this.loadout.choice);
          this.setPaused(false);
        };
        this.localCountdown = 3;
        this.engagement.countdown(3);
      },
      this.teamWins[winner] >= 3,
      this.teamWins,
      this.match.members.map((member, i) => ({
        name: member.name,
        ...(this.localLedger.round.get(i === 0 ? "local" : "bot") ??
          emptyPerformance()),
      })),
    );
  }
}
