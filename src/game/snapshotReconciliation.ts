import { replayMovement } from "./predictionWindow";
import { presentMatch } from "./matchPresentation";

import { resetRound } from "./round";

import { Vector3 } from "@babylonjs/core";

import { showVictory, closeVictory, updateReady } from "../ui/victory";

import { MSG, type Snapshot } from "../../shared/protocol";
import type { Game } from "./game";
type Context = Pick<
  Game,
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
  | "predictedVelocity"
  | "setPaused"
  | "updateLobbyMusic"
  | "visualCorrection"
  | "lastPositionCorrection"
  | "weapons"
  | "world"
>;
export function applyOnline(this: Context, snapshot: Snapshot) {
  if ((snapshot.round ?? 1) !== this.currentRound) {
    this.currentRound = snapshot.round ?? 1;
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
  this.hud.showStats(snapshot.started);
  this.hud.wins(snapshot.wins ?? { RED: 0, BLUE: 0 }, snapshot.round ?? 1);
  const own = snapshot.players.find(
    (p) => p.id === this.multiplayer?.room?.sessionId,
  );
  if (!own) return;
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
  this.pendingInputs = replayMovement(
    this.player,
    own,
    this.pendingInputs,
    snapshot.started && own.hp > 0 && !own.rcRemote,
  );
  const correction = previousPosition.subtract(this.player.root.position);
  this.lastPositionCorrection = correction.length();
  if (this.onlineSpawned && own.hp > 0 && correction.length() < 2)
    this.visualCorrection.addInPlace(correction);
  else this.visualCorrection.setAll(0);
  this.predictedPosition = this.player.root.position.clone();
  this.predictedVelocity = this.player.verticalVelocity;
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
    (p) => p.type === "medkit" || p.type === "superMedkit",
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
  if (snapshot.winner && !this.match.winner) {
    this.match.winner = snapshot.winner;
    this.setPaused(true);
    showVictory(
      snapshot.winner,
      this.match.members.filter((m) => m.team === snapshot.winner),
      () => {
        if (snapshot.seriesWinner) this.multiplayer?.room?.send(MSG.restart);
        else this.multiplayer?.room?.send(MSG.ready);
      },
      !!snapshot.seriesWinner,
      snapshot.wins,
      snapshot.roundStats ?? [],
      () => {
        this.multiplayer?.clearResume();
        void this.multiplayer?.leave().catch(error => console.warn("Leaving match", error)).finally(() => location.reload());
      },
    );
  }
  if (snapshot.winner) updateReady(snapshot.players, snapshot.ready ?? []);
  this.engagement.countdown(snapshot.countdown);
  this.playCountdown(snapshot.countdown);
}
