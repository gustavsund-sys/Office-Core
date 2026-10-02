import { TEAMS, MAX_PLAYERS_PER_TEAM, type Team } from "../config/game";
import type { MatchMember } from "../game/match";

export class Lobby {
  el = document.createElement("fieldset");
  constructor(public onSelect: (team: Team) => void, public onName: (name: string) => void) {
    this.el.className = "team-choice lobby";
    this.el.innerHTML = `<legend>SPELLOBBY · OFFICE01</legend><label class="player-name">DITT NAMN<input id="player-name" type="text" maxlength="24" placeholder="Skriv ditt namn" autocomplete="nickname"></label><div class="lobby-status">LOCAL PLAYTEST <span>2 spelare</span></div><div class="lobby-teams">${Object.entries(TEAMS).map(([team, color]) => `<label class="lobby-team" style="--team:${color}" data-team="${team}"><div class="lobby-core"><i></i><strong>${team} CORE</strong><input aria-label="Join ${team} core" type="radio" name="team" value="${team}" ${team === "RED" ? "checked" : ""}></div><span class="lobby-core-status"></span><ul class="lobby-members"></ul><span class="lobby-join">VÄLJ DETTA LAG →</span></label>`).join("")}</div><small>Lokal testlobby: du och en stillastående testspelare. Lag utan spelare har inaktiv core.</small>`;
    const nameInput = this.el.querySelector<HTMLInputElement>("#player-name")!;
    nameInput.value = localStorage.getItem("officeCore.playerName") ?? "";
    nameInput.addEventListener("input", () => {
      localStorage.setItem("officeCore.playerName", nameInput.value);
      this.onName(nameInput.value);
    });
    this.el.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.name !== "team") return;
      const team = this.el.querySelector<HTMLInputElement>('input:checked')!.value as Team;
      this.onSelect(team);
    });
  }
  update(members: MatchMember[], selected: Team) {
    for (const card of Array.from(this.el.querySelectorAll<HTMLElement>("[data-team]"))) {
      const team = card.dataset.team as Team;
      const players = members.filter(member => member.team === team);
      card.classList.toggle("selected", team === selected);
      const input = card.querySelector<HTMLInputElement>("input")!;
      input.checked = team === selected;
      input.disabled = players.length >= MAX_PLAYERS_PER_TEAM && team !== selected;
      card.querySelector(".lobby-join")!.textContent = input.disabled ? "LAGET ÄR FULLT" : "VÄLJ DETTA LAG →";
      card.querySelector(".lobby-core-status")!.textContent = players.length ? `AKTIV CORE · ${players.length}/${MAX_PLAYERS_PER_TEAM} SPELARE` : "INAKTIV CORE · 0/4 SPELARE";
      const list = card.querySelector("ul")!;
      list.replaceChildren();
      for (const player of players) {
        const item = document.createElement("li");
        item.textContent = `● ${player.name === "You" ? "Du" : player.name} · redo`;
        list.append(item);
      }
      if (!players.length) { const item = document.createElement("li"); item.textContent = "Ledig lagplats"; item.className = "empty-slot"; list.append(item); }
    }
  }
}
