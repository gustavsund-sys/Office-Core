import { gamePhase } from "./flow";
import { setGameUpdateAllowed } from "../network/cache";

import { CONFIG } from "../config/game";

import { type Snapshot } from "../../shared/protocol";
import type { Game } from "./game";
type Context = Pick<
  Game,
  | "hud"
  | "input"
  | "loadout"
  | "lobby"
  | "match"
  | "setPaused"
  | "updateLobbyMusic"
>;
export function presentMatch(
  this: Context,
  snapshot: Snapshot,
  own: Snapshot["players"][number],
) {
  CONFIG.player.team = own.team;
  this.hud.el.querySelector(".brand small")!.textContent =
    "ALPHA 0.1 · MULTIPLAYER";
  this.hud.el.querySelector(".location p")!.textContent =
    `ONLINE · ${snapshot.players.length} spelare`;
  this.hud.el.querySelector(".health > span")!.textContent =
    `PLAYER / ${own.team} TEAM`;
  this.match.members = snapshot.players.map((p) => ({
    name: p.name,
    team: p.team,
  }));
  this.lobby.update(this.match.members, own.team);
  this.lobby.el.querySelector(".lobby-status")!.textContent =
    `${snapshot.players.length} SPELARE · ONLINE`;
  this.lobby.el.querySelector("small")!.textContent =
    "Välj Core och namn. Första spelaren är värd och startar matchen när minst två lag har anslutit.";
  const play = document.querySelector<HTMLButtonElement>("#play")!;
  if (!snapshot.started) {
    const host = snapshot.owner === own.id;
    const enough = new Set(snapshot.players.map((p) => p.team)).size >= 2;
    play.disabled = !host || !enough;
    play.textContent = !host
      ? "VÄNTAR PÅ VÄRDEN"
      : enough
        ? "STARTA MATCH"
        : "VÄNTAR PÅ ETT ANNAT LAG";
  } else {
    play.disabled = false;
    play.textContent = "FORTSÄTT SPELA";
  }
  const wasPreparing = !this.loadout.el.hidden;
  const phase = gamePhase(snapshot);
  setGameUpdateAllowed(phase === "lobby" || phase === "seriesEnd");
  const lateEquipment = snapshot.started && !own.loadout && own.hp <= 0 && !snapshot.winner;
  this.loadout.el.hidden = phase !== "equipment" && !lateEquipment;
  if (!snapshot.started) {
    this.match.started = false;
    this.lobby.el.disabled = false;
    this.setPaused(true);
    if (!own.loadout) {
      this.loadout.confirmed = false;
      this.loadout.el.querySelector<HTMLButtonElement>(".loadout-confirm")!.disabled = false;
    }
  }
  if (lateEquipment) {
    this.setPaused(true);
    document.querySelector<HTMLElement>("#overlay")!.style.display = "none";
    this.input.active = false;
    this.loadout.el.querySelector(".loadout-status")!.textContent = "Matchen pågår. Välj utrustning för att ansluta till ditt lag.";
    this.loadout.el.querySelector<HTMLButtonElement>(".loadout-confirm")!.disabled = false;
  }
  if (wasPreparing && phase === "lobby") {
    this.setPaused(true);
    this.hud.toast("Ett lag saknas. Välj lag och starta igen.");
  }
  if (snapshot.preparing && !snapshot.started) {
    document.querySelector<HTMLElement>("#overlay")!.style.display = "none";
    this.input.active = false;
    this.loadout.el.querySelector(".loadout-status")!.textContent = own.loadout
      ? `REDO · VÄNTAR PÅ SPELARE (${snapshot.players.filter((p) => p.loadout).length}/${snapshot.players.length})`
      : "Välj din utrustning och gör dig redo att spawna.";
  }
  if (snapshot.started && !lateEquipment && !this.match.started) {
    this.match.started = true;
    this.updateLobbyMusic();
    this.setPaused(false);
    this.lobby.el.disabled = true;
  }
}
