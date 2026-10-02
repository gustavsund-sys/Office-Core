import type { Team } from "../config/game";
export interface MatchMember { name: string; team: Team; }
export class CoreMatch {
  members: MatchMember[] = [];
  playerName = "You";
  setPlayerName(name: string) {
    this.playerName = name.trim().slice(0, 24) || "You";
    if (this.members[0]) this.members[0].name = this.playerName;
  }
  started = false;
  winner?: Team;
  selectTeam(team: Team) {
    this.members = [{ name: this.playerName, team }, { name: "Test player", team: team === "BLUE" ? "RED" : "BLUE" }];
  }
  start(team: Team) {
    this.selectTeam(team);
    this.started = true;
    this.winner = undefined;
  }
  isActive(team: Team) { return this.members.some(member => member.team === team); }
  evaluate(cores: { team?: Team; hp: number }[]) {
    if (!this.started || this.winner) return this.winner;
    const alive = cores.filter(core => core.team && this.isActive(core.team) && core.hp > 0);
    if (alive.length === 1) this.winner = alive[0].team;
    return this.winner;
  }
}
