import type { Game } from "./game";
type Context = Pick<
  Game,
  | "disarmAudio"
  | "hud"
  | "input"
  | "loadout"
  | "lobbyMusic"
  | "lobbyMusicBlocked"
  | "lobbyMusicPending"
  | "lobbyMuted"
  | "match"
  | "multiplayer"
  | "paused"
  | "pickup"
  | "player"
  | "sound"
  | "weaponAudio"
  | "rc"
  | "weapons"
>;
export function updateDisarm(this: Context, progress?: number) {
  this.hud.disarm(progress);
  this.disarmAudio.loop = true;
  if (progress !== undefined && this.sound && !this.paused) {
    if (this.disarmAudio.paused) void this.disarmAudio.play().catch(() => {});
  } else {
    this.disarmAudio.pause();
    this.disarmAudio.currentTime = 0;
  }
}

export function updateLobbyMusic(this: Context, unlock = false) {
  if (unlock) this.lobbyMusicBlocked = false;
  this.lobbyMusic.loop = true;
  this.lobbyMusic.volume = this.lobbyMuted ? 0 : 0.7;
  const inLobby = !this.match.started && !this.match.winner && this.sound;
  if (!inLobby) {
    this.lobbyMusic.pause();
    if (this.match.started) this.lobbyMusic.currentTime = 0;
    return;
  }
  if (
    !this.lobbyMusic.paused ||
    this.lobbyMusicBlocked ||
    this.lobbyMusicPending
  )
    return;
  this.lobbyMusicPending = true;
  void this.lobbyMusic
    .play()
    .catch(() => {
      this.lobbyMusicBlocked = true;
    })
    .finally(() => {
      this.lobbyMusicPending = false;
      if (this.match.started || this.match.winner || !this.sound)
        this.lobbyMusic.pause();
    });
}

export function setControlScheme(
  this: Context,
  aimRelative: boolean,
  save = true,
) {
  this.input.aimRelativeMovement = aimRelative;
  this.input.clear();
  document.querySelector("#movement-mode")!.textContent = aimRelative
    ? "Siktstyrd"
    : "Klassisk";
  document
    .querySelectorAll<HTMLInputElement>('input[name="controls"]')
    .forEach(
      (radio) =>
        (radio.checked = radio.value === (aimRelative ? "aim" : "classic")),
    );
  if (save)
    try {
      localStorage.setItem(
        "office-wars-controls",
        aimRelative ? "aim" : "classic",
      );
    } catch {
      /* Keep the choice for this session even without storage. */
    }
}

export function setPaused(this: Context, value: boolean) {
  if (this.loadout && !this.loadout.el.hidden) {
    this.input.active = false;
    document.querySelector<HTMLElement>("#overlay")!.style.display = "none";
    return;
  }
  if (this.match.winner && !value) return;
  this.paused = value;
  if (value) {
    this.rc?.audio.stop();
    this.disarmAudio.pause();
    this.weaponAudio?.releaseMachineGun(false);
    this.weaponAudio?.setAlarm(false);
    this.weaponAudio?.setBusterClock(false);
    this.weaponAudio?.updateFootsteps([], this.player.root.position, false);
  }
  this.input.active = !value;
  this.input.clear();
  if (value && this.input.locked) document.exitPointerLock();

  (document.querySelector("#overlay") as HTMLElement).style.display = value
    ? "grid"
    : "none";
  document.querySelector("#play")!.innerHTML =
    this.multiplayer?.room && !this.multiplayer.snapshot?.started
      ? "STARTA MATCH <span>↗</span>"
      : "FORTSÄTT SPELA <span>↗</span>";
  document.body.classList.toggle("playing", !value);
}

export function updateBeaconPrompt(this: Context) {
  let el = document.querySelector<HTMLDivElement>("#beacon-prompt");
  if (!el) {
    el = document.createElement("div");
    el.id = "beacon-prompt";
    document.querySelector("#ui")!.append(el);
  }
  const p = this.player.root.position;
  const nearest = this.pickup.beacons.drops.find(
    (d) => d.cooldown <= 0 && Math.hypot(p.x - d.x, p.z - d.z) < 1.6,
  );
  const trap = this.pickup.pulseTraps.drops.find(
    (d) => d.cooldown <= 0 && Math.hypot(p.x - d.x, p.z - d.z) < 1.6,
  );
  el.hidden =
    this.paused ||
    this.weapons.remoteControlled ||
    this.player.hp <= 0 ||
    (!nearest &&
      !trap &&
      !this.weapons.carryingBeacon &&
      !this.weapons.pulseTrapSelected);
  el.textContent = this.weapons.pulseTrapSelected
    ? this.weapons.utilityKind === "rcCar"
      ? "RC BOMBER [3] · LMB: DEPLOY · WASD: DRIVE · E: DETONATE"
      : this.weapons.utilityKind === "superMedkit"
        ? "SUPER MED-KIT [3] · LMB / E: PLACE · 100 HP"
        : "PULSE TRAP [3] · LMB / E: PLACE · 5m TRIGGER"
    : this.weapons.carryingBeacon
      ? "DEFENSIVE BEACON · LMB / E: PLACE"
      : trap && !this.weapons.carryingPulseTrap
        ? "E · PICK UP PULSE TRAP · SLOT [3]"
        : "E · PICK UP DEFENSIVE BEACON";
}
