import { shard, beam, flash as pooledFlash } from "./effectPool";

import { Vector3 } from "@babylonjs/core";

import { CONFIG, TEAMS } from "../config/game";

import { connectionError } from "../network/errors";

import { Multiplayer } from "../network/client";

import type { Game } from "./game";
type Context = Pick<
  Game,
  | "applyOnline"
  | "beaconAudio"
  | "beaconImpact"
  | "beaconShot"
  | "engagement"
  | "engagementAudio"
  | "hud"
  | "inputSequence"
  | "lobby"
  | "match"
  | "rc"
  | "multiplayer"
  | "onlineTraces"
  | "player"
  | "prepareAudio"
  | "scene"
  | "showDamageNumber"
  | "showHitHealth"
  | "sound"
  | "testPlayer"
  | "testWeapons"
  | "weaponAudio"
  | "world"
>;
export function installMultiplayer(this: Context) {
  const panel = document.createElement("div");
  panel.className = "network-lobby";
  panel.innerHTML =
    '<h3>OFFICE01 · MULTIPLAYER</h3><p>Välj ditt namn och anslut till en lobby. Därefter väljer du lag och chattar med spelarna.</p><div id="available-rooms">Hämtar OFFICE01…</div><button id="leave-room" hidden>LÄMNA SPELET</button><p id="network-status" role="status"></p>';
  this.lobby.el.before(panel);
  this.lobby.el.hidden = true;
  const nameField = this.lobby.nameInput.closest("label")!;
  const musicButton =
    this.lobby.el.querySelector<HTMLButtonElement>(".lobby-music")!;
  panel.querySelector("#available-rooms")!.before(nameField);
  panel.append(musicButton);
  this.lobby.update([], "RED");
  this.lobby.el.querySelector(".lobby-status")!.textContent =
    "VÄLJ NAMN OCH LAG";
  this.lobby.el.querySelector("small")!.textContent =
    "Anslut till lobbyn för att se spelare och chatta.";
  const play = document.querySelector<HTMLButtonElement>("#play")!;
  play.hidden = true;
  const net = (this.multiplayer ??= new Multiplayer());
  let busy = false;
  panel.querySelector("#leave-room")!.addEventListener("click", async () => {
    const button = panel.querySelector<HTMLButtonElement>("#leave-room")!;
    button.disabled = true;
    try {
      await this.multiplayer?.leave();
    } finally {
      location.reload();
    }
  });
  const leaveInGame = document.createElement("button");
  leaveInGame.id = "leave-game";
  leaveInGame.textContent = "LÄMNA LOBBY";
  leaveInGame.hidden = true;
  this.hud.el.querySelector("header")!.append(leaveInGame);
  leaveInGame.addEventListener("click", () => {
    leaveInGame.disabled = true;
    panel.querySelector<HTMLButtonElement>("#leave-room")!.click();
  });
  const connect = async (id: string) => {
    if (!this.lobby.validName()) return;
    if (this.multiplayer?.room || busy) return;
    busy = true;
    panel
      .querySelectorAll<HTMLButtonElement>("[data-room]")
      .forEach((button) => (button.disabled = true));
    const net = (this.multiplayer ??= new Multiplayer());
    net.onStatus = (text) => {
      panel.querySelector("#network-status")!.textContent = text;
    };
    net.onSnapshot = (snapshot) => this.applyOnline(snapshot);
    net.onEvent = (event) => {
      // Own shots are presented immediately. Server hits/impacts remain authoritative.
      if (
        event.player === net.room?.sessionId &&
        (event.kind === "shot" || event.kind === "trace")
      )
        return;
      const position = new Vector3(event.x, event.y, event.z);
      const distance = Vector3.Distance(position, this.player.root.position);
      if (
        event.kind === "ammoPickup" &&
        event.player === net.room?.sessionId &&
        this.sound
      )
        this.weaponAudio?.playAmmoPickup();
      if (event.kind === "rcExplosion")
        this.rc.explosion(event.player ?? "", position);
      if (event.kind === "pulseTrapAvailable")
        this.hud.toast(
          `Pulse Trap available in ${event.team === "BLUE" ? "Blue" : "Red"} Weapon drop!`,
        );
      if (event.kind === "beaconAvailable")
        this.hud.toast(
          `Defensive beacon available in ${event.team === "BLUE" ? "Blue" : "Red"} Weapon drop!`,
        );
      if (event.kind === "beaconImpact")
        this.beaconImpact(
          position,
          event.material ?? "metal",
          event.destroyed,
          event.endX === undefined
            ? undefined
            : new Vector3(event.endX, event.endY!, event.endZ!),
        );
      if (event.kind === "beaconDamage")
        this.showDamageNumber(position, event.damage ?? 0);
      if (event.kind === "beaconPlace" || event.kind === "beaconShot")
        this.beaconAudio.play(
          event.kind === "beaconPlace" ? "place" : "shot",
          distance,
          this.sound,
        );
      if (event.kind === "beaconShot" && event.endX !== undefined)
        this.beaconShot(
          position,
          new Vector3(event.endX, event.endY!, event.endZ!),
        );
      if (event.kind === "hit") {
        const material = event.material ?? "metal";
        if (
          event.player === net.room?.sessionId &&
          (material === "player" || event.team !== undefined)
        ) {
          this.engagement.confirm();
          this.engagementAudio?.hit();
        }
        this.engagement.impact(position, material, event.destroyed);
        this.engagementAudio?.impact(material, distance, event.destroyed);
      }
      if (event.kind === "kill" && event.player === net.room?.sessionId) {
        this.engagement.confirm(true);
        this.engagementAudio?.hit(true);
      }
      if (event.kind === "disarmed") {
        const name =
          net.snapshot?.players.find((p) => p.id === event.player)?.name ??
          "Player";
        this.hud.toast(`${name} · CORE BUSTER DISARMED`);
      }
      if (event.kind === "damage") {
        if (event.player === net.room?.sessionId)
          this.hud.damage(event.damage ?? 0);
        this.showDamageNumber(position, event.damage ?? 0);
        if (event.player) this.showHitHealth(event.player, event.damage ?? 0);
      }
      if (event.kind === "scream" && this.sound)
        this.weaponAudio?.playBusterScream(
          distance,
          (position.x - this.player.root.position.x) / Math.max(10, distance),
        );
      if (event.kind === "impact") {
        if (this.sound) this.weaponAudio?.playImpact(distance);
        for (let i = 0; i < 6; i++) {
          const spark = shard(this.scene, 0.09);
          spark.position.copyFrom(
            position.add(
              new Vector3(
                (Math.random() - 0.5) * 0.45,
                Math.random() * 0.35,
                (Math.random() - 0.5) * 0.45,
              ),
            ),
          );
          spark.material = this.world.mat("#ffe8a1", true);
          spark.isPickable = false;
          this.onlineTraces.push({ mesh: spark, life: 0.12 });
        }
      }
      if (event.kind === "jump" && this.sound)
        this.weaponAudio?.playMovement("jump");
      if (event.kind === "land" && this.sound)
        this.weaponAudio?.playMovement("land");
      if (event.kind === "trace") {
        const muzzle = pooledFlash(this.scene, 0.23);
        muzzle.position.copyFrom(position);
        muzzle.material = this.world.mat("#ffe8a1", true);
        muzzle.isPickable = false;
        this.onlineTraces.push({ mesh: muzzle, life: 0.045 });
        const end = new Vector3(event.endX!, event.endY!, event.endZ!);
        const mesh = beam(
          this.scene,
          position,
          end,
          event.weapon === "pulseGun" ? 0.14 : 0.025,
        );
        mesh.material = this.world.mat(
          event.weapon === "pulseGun" ? "#ff263e" : "#ffe4a5",
          true,
        );
        mesh.isPickable = false;
        this.onlineTraces.push({ mesh, life: 0.065 });
      }
      if (event.kind === "shot" && this.sound && event.weapon)
        this.weaponAudio?.playRemoteShot(
          event.weapon,
          distance,
          (event.x - this.player.root.position.x) / Math.max(10, distance),
          false,
        );
      if (event.kind === "explosion")
        this.world.explosions.burst(
          position,
          event.sound === "plasmaMine" ? "#ff55c3" : "#ffcf56",
          event.power ?? 1,
          event.sound === "bazookaExplosion" || event.sound === "plasmaMine"
            ? event.sound
            : undefined,
        );
      if (event.kind === "death") {
        this.world.explosions.playerDeath(position, TEAMS[event.team ?? "RED"]);
        if (this.sound) this.weaponAudio?.playDeath();
      }
      if (event.kind === "spawn") {
        this.world.explosions.playerSpawn(position, TEAMS[event.team ?? "RED"]);
        if (this.sound) this.weaponAudio?.playSpawn();
      }
      if (event.kind === "buster" && event.team === CONFIG.player.team)
        this.hud.toast("Active Core buster! protect him at all costs!");
    };
    net.onTeamPing = (ping) => {
      this.engagement.ping(ping);
      this.engagementAudio?.tone(650, 0.08, 0.035);
    };
    net.onChat = (message) => this.lobby.message(message.name, message.text);
    try {
      await net.connect(
        this.match.playerName,
        document.querySelector<HTMLInputElement>('input[name="team"]:checked')!
          .value,
        id,
      );
      this.inputSequence = Math.max(this.inputSequence, net.sequence + 1);
      panel
        .querySelectorAll<HTMLButtonElement>("button")
        .forEach((button) => (button.disabled = true));
      const leave = panel.querySelector<HTMLButtonElement>("#leave-room")!;
      leave.hidden = false;
      leaveInGame.hidden = false;
      leave.disabled = false;
      panel.querySelector<HTMLElement>("#available-rooms")!.hidden = true;
      panel.querySelector("h3")!.textContent = "SPELLOBBY · OFFICE01";
      panel.querySelector("p")!.textContent =
        "Skriv ditt namn och välj den Core du vill försvara.";
      this.lobby.el.querySelector("legend")!.after(nameField);
      this.lobby.el.querySelector(".lobby-chat")!.append(musicButton);
      musicButton.disabled = false;
      this.lobby.el.hidden = false;
      play.hidden = false;
      this.match.started = false;
      this.match.winner = undefined;
      document.querySelector<HTMLElement>(".build-panel")!.hidden = true;
      this.testPlayer?.root.dispose();
      this.testPlayer = undefined;
      this.testWeapons = undefined;
      this.prepareAudio();
    } catch (error) {
      net.onStatus(connectionError(error));
    } finally {
      busy = false;
      if (!net.room) void refresh();
    }
  };
  const refresh = async () => {
    if (net.room || busy) return;
    try {
      const rooms = await net.rooms();
      const list = panel.querySelector<HTMLElement>("#available-rooms")!;
      list.replaceChildren();
      for (const room of rooms) {
        const card = document.createElement("article");
        card.className = "available-room";
        const title = document.createElement("strong");
        title.textContent = room.name;
        const state = document.createElement("p");
        state.textContent = `${room.started ? "ANSLUT TILL PÅGÅENDE MATCH" : "TILLGÄNGLIGT"} · ${room.players.length}/${room.capacity} spelare`;
        const roster = document.createElement("ul");
        for (const member of room.players) {
          const row = document.createElement("li");
          row.textContent = `${member.name} · ${member.team} CORE`;
          row.style.color = TEAMS[member.team];
          roster.append(row);
        }
        if (!room.players.length) {
          const row = document.createElement("li");
          row.textContent = "Inga spelare ännu. Bli först att ansluta.";
          roster.append(row);
        }
        const join = document.createElement("button");
        join.dataset.room = room.id;
        join.textContent = room.started
          ? "ANSLUT TILL PÅGÅENDE MATCH"
          : "ANSLUT TILL OFFICE01";
        join.disabled = room.players.length >= room.capacity;
        join.addEventListener("click", () => void connect(room.id));
        card.append(title, state, roster, join);
        list.append(card);
      }
      if (!rooms.length)
        list.textContent = "OFFICE01 förbereds. Listan uppdateras automatiskt.";
    } catch (error) {
      panel.querySelector("#network-status")!.textContent =
        connectionError(error);
    }
  };
  const resume = net.resumeInfo();
  if (resume?.id) void connect(resume.id);
  else void refresh();
  window.setInterval(() => void refresh(), 5000);
}
