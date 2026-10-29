import { replayMovement } from "./predictionWindow";
import { presentMatch } from "./matchPresentation";

import { resetRound } from "./round";

import { Vector3 } from "@babylonjs/core";

import { showVictory, closeVictory, updateReady } from "../ui/victory";

import { MSG, type Snapshot } from "../../shared/protocol";
import type { Game } from "./game";
type Context = Pick<
  Game,
  | "roundMedia"
  | "sound"
  | "cores"
  | "currentRound"
  | "engagement"
  | "hitHealthBars"
  | "hud"
  | "input"
  | "loadout"
  | "lobby"
  | "localDisarm"
  | "match"
  | "rc"
  | "multiplayer"
  | "onlineSpawned"
  | "pendingInputs"
  | "inputSequence"
  | "pickup"
  | "playCountdown"
  | "player"
  | "predictedPosition"
  | "predictedStamina"
  | "predictedExhausted"
  | "predictedKnockbackX"
  | "predictedKnockbackZ"
  | "predictedVelocity"
  | "setPaused"
  | "updateLobbyMusic"
  | "visualCorrection"
  | "lastPositionCorrection"
  | "weapons"
  | "world"
>;
const contributionHistory = new WeakMap<object, { id: string; assists: number; disarms: number; defense: number }>();
export function applyOnline(this: Context, snapshot: Snapshot) {
  if ((snapshot.round ?? 1) !== this.currentRound) {
    this.currentRound = snapshot.round ?? 1;
    if (this.currentRound % 2 === 0) this.hud.toast("EXTRA LEVERANS · +1 SKILL TILL BÅDA LAGEN");
    closeVictory();
    this.match.winner = undefined;
    this.rc.reset();
    resetRound(this.world, this.cores, [this.weapons], this.pickup);
    this.localDisarm.reset();
    this.engagement.clear();
    this.onlineSpawned = false;
    this.pendingInputs = [];
    this.setPaused(false);
  }
  if (!snapshot.started && this.match.winner) {
    closeVictory();
    this.match.winner = undefined;
    this.onlineSpawned = false;
  }
  this.hud.showStats(snapshot.started);
  this.hud.wins(snapshot.wins ?? { RED: 0, BLUE: 0 }, snapshot.round ?? 1);
  const own = snapshot.players.find(
    (p) => p.id === this.multiplayer?.room?.sessionId,
  );
  if (!own) return;
  const stats = snapshot.roundStats?.find((p) => p.id === own.id);
  if (stats) {
    const previous = contributionHistory.get(this);
    if (previous?.id === own.id && snapshot.started && !snapshot.winner) {
      if (stats.disarms > previous.disarms) this.hud.toast("CORE BUSTER AVVÄPNAD · +200 POÄNG");
      else if (stats.defense > previous.defense) this.hud.toast("CORE FÖRSVARAD · +75 POÄNG");
      else if (stats.assists > previous.assists) this.hud.toast("ASSIST · +50 POÄNG");
    }
    contributionHistory.set(this, { id: own.id, assists: stats.assists, disarms: stats.disarms, defense: stats.defense });
  }
  this.inputSequence = Math.max(this.inputSequence, own.ack + 1);
  if (snapshot.winner || !snapshot.started) this.pendingInputs = [];
  for (const state of snapshot.players) {
    const bar = this.hitHealthBars.get(state.id);
    if (bar) bar.hp = state.hp;
  }
  presentMatch.call(this, snapshot, own);
  if (!this.onlineSpawned || own.hp <= 0) this.pendingInputs = [];
  // Compare fixed simulation states, excluding render-only extrapolation.
  const previousPosition = (
    this.predictedPosition ?? this.player.root.position
  ).clone();
  this.player.hp = own.hp;
  this.player.bossLookoutActive = !!own.lookout;
  this.player.shield = own.shield ?? 0;
  this.player.medkit = own.medkit ?? false;
  // Rewind shared pushable props before replaying unacknowledged movement.
  // Replays advance carts once from authoritative state instead of pushing twice.
  if (snapshot.carts) this.world.carts?.sync(snapshot.carts);
  this.pendingInputs = replayMovement(
    this.player,
    own,
    this.pendingInputs,
    snapshot.started && own.hp > 0 && !own.rcRemote && !own.lookout,
  );
  const correction = previousPosition.subtract(this.player.root.position);
  this.lastPositionCorrection = correction.length();
  if (this.onlineSpawned && own.hp > 0 && correction.length() < 2)
    this.visualCorrection.addInPlace(correction);
  else this.visualCorrection.setAll(0);
  this.predictedPosition = this.player.root.position.clone();
  this.predictedStamina = this.player.stamina;
  this.predictedExhausted = this.player.sprintExhausted;
  this.predictedVelocity = this.player.verticalVelocity;
  this.predictedKnockbackX = this.player.knockbackX;
  this.predictedKnockbackZ = this.player.knockbackZ;
  this.onlineSpawned = true;
  this.cores.forEach((core) => {
    const state = snapshot.cores.find((c) => c.team === core.team);
    if (state) {
      core.setActive(state.active);
      if (core.hp > state.hp) core.damage(core.hp - state.hp);
      core.hp = state.hp;
    }
  });
  snapshot.props.forEach((hp, index) => {
    const prop = this.world.destructibles[index];
    if (prop && prop.hp > hp) prop.damage(prop.hp - hp, "coreBuster", false);
  });
  const health = snapshot.pickups.filter(
    (p) =>
      p.type === "medkit" || p.type === "superMedkit" || p.type === "shield",
  );
  this.pickup.healthDrops.forEach((drop, index) =>
    drop.root.setEnabled(health[index]?.active ?? false),
  );
  const ammo = snapshot.pickups.filter((p) => p.type === "ammo");
  this.pickup.ammoDrops.forEach((drop, index) =>
    drop.root.setEnabled(ammo[index]?.active ?? false),
  );
  const weapons = snapshot.pickups.filter(
    (p) => p.type === "weapon" && !p.dropped,
  );
  this.pickup.endpoints
    .filter((p) => !p.dropped)
    .forEach((drop, index) =>
      drop.root.setEnabled(weapons[index]?.active ?? false),
    );
  this.roundMedia.sync(
    snapshot.round ?? 1,
    snapshot.started,
    !!snapshot.winner,
    this.world.coreBreached,
    this.sound,
  );
  if (snapshot.winner && !this.match.winner) {
    this.match.winner = snapshot.winner;
    this.setPaused(true);
    const destroyed = snapshot.cores.find(
      (core) => core.active && core.hp <= 0,
    );
    if (destroyed) this.roundMedia.playCore(destroyed.team);
    showVictory(
      snapshot.winner,
      this.match.members.filter((m) => m.team === snapshot.winner),
      () => {
        if (snapshot.seriesWinner) this.multiplayer?.room?.send(MSG.restart);
        else this.multiplayer?.room?.send(MSG.ready);
      },
      !!snapshot.seriesWinner,
      snapshot.wins,
      (snapshot.seriesWinner ? snapshot.seriesStats : snapshot.roundStats) ?? [],
      () => {
        this.multiplayer?.clearResume();
        void this.multiplayer
          ?.leave()
          .catch((error) => console.warn("Leaving match", error))
          .finally(() => location.reload());
      },
      own.id,
    );
  }
  if (snapshot.winner) updateReady(snapshot.players, snapshot.ready ?? []);
  this.engagement.countdown(snapshot.countdown);
  this.playCountdown(snapshot.countdown);
}
