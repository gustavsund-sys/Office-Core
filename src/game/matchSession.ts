import { setGameUpdateAllowed } from "../network/cache";
import { markGPUStartup } from "./webgpuDiagnostics";

import { applyLoadout } from "./loadout";

import { Vector3, Ray } from "@babylonjs/core";

import { CONFIG, TEAMS, type Team } from "../config/game";

import { office01 } from "../maps/office01";
import { Player } from "../player/player";

import { Weapons } from "../weapons/system";

import type { Game } from "./game";
type Context = Pick<
  Game,
  | "rangeMode"
  | "bindLocalTarget"
  | "cameraTarget"
  | "cores"
  | "hud"
  | "engagement"
  | "loadout"
  | "match"
  | "pickup"
  | "player"
  | "recordLocalHit"
  | "scene"
  | "sound"
  | "testPlayer"
  | "testToolsEnabled"
  | "testWeapons"
  | "weaponAudio"
  | "weapons"
  | "world"
>;
export function startMatch(this: Context, team: Team) {
  markGPUStartup(`local match starting: ${team}`);
  setGameUpdateAllowed(false);
  applyLoadout(this.weapons, this.loadout.choice);
  this.loadout.el.hidden = true;
  this.match.start(team);
  CONFIG.player.team = team;
  const base = office01.bases.find((base) => base.team === team)!;
  this.player.root.position.set(this.rangeMode ? 0 : base.spawn.x, 0, this.rangeMode ? -10 : base.spawn.z);
  this.player.torso.material = this.world.finish(TEAMS[team], "fabric");
  this.world.explosions.playerSpawn(this.player.root.position, TEAMS[team]);
  this.cores.forEach((core) => core.setActive(this.match.isActive(core.team!)));
  if (this.testToolsEnabled) {
    const other = this.match.members[1];
    const otherBase = office01.bases.find((base) => base.team === other.team)!;
    this.testPlayer = new Player(this.world);
    this.testPlayer.root.position.set(this.rangeMode ? 0 : otherBase.spawn.x, 0, this.rangeMode ? 6 : otherBase.spawn.z);
    this.testPlayer.torso.material = this.world.finish(
      TEAMS[other.team],
      "fabric",
    );
    this.bindLocalTarget(this.player, "local");
    this.bindLocalTarget(this.testPlayer, "bot");
    this.testWeapons = new Weapons(
      this.testPlayer,
      (target, damage, source) =>
        this.recordLocalHit("bot", target, damage, source),
      () => {
        if (this.testPlayer)
          this.engagement.shotOutsideView(this.testPlayer.root.position, "bot");
        if (!this.sound || !this.testPlayer) return;
        const origin = this.testPlayer.root.position.add(
          new Vector3(0, 1.1, 0),
        );
        const listener = this.player.root.position.add(new Vector3(0, 1.1, 0));
        const delta = listener.subtract(origin);
        const distance = delta.length();
        const hit =
          distance > 0
            ? this.scene.pickWithRay(
                new Ray(origin, delta.scale(1 / distance), distance),
                (mesh) =>
                  mesh.isEnabled() &&
                  (!!mesh.metadata?.solid || !!mesh.metadata?.damageable),
              )
            : null;
        const blocked = !!hit?.hit;
        this.weaponAudio?.playRemoteShot(
          "machineGun",
          distance,
          (origin.x - listener.x) / Math.max(10, distance),
          blocked,
        );
      },
    );
    this.testWeapons.equip("machineGun");
    this.testWeapons.ammo = Infinity;
    if (!this.rangeMode) this.pickup.beacons.spawnTestGuard({
      id: "bot",
      team: other.team,
      player: this.testPlayer,
    });
    if (!this.rangeMode) this.pickup.pulseTraps.spawnTestTrap(other.team);
    this.world.label(
      "TEST PLAYER",
      otherBase.spawn.x,
      otherBase.spawn.z - 2,
      TEAMS[other.team],
      3,
    );
  }
  document.querySelector(".health > span")!.textContent =
    `PLAYER / ${team} TEAM`;
  document.querySelector(".team-choice")!.setAttribute("disabled", "");
  this.cameraTarget.copyFrom(this.player.root.position);
  this.hud.toast(`${team} TEAM · FIRST TO 3 · PROTECT YOUR CORE`);
}
