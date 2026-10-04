import { RCSession } from "./rcSession";
import { advanceCountdown, finishLocalRound } from "./roundFlow";
import { applyOnline as applyOnlineImpl } from "./snapshotReconciliation";
import { tickOnline as tickOnlineImpl } from "./onlineSimulation";
import {
  resize as resizeImpl,
  updateCamera as updateCameraImpl,
} from "./cameraController";
import {
  updateDisarm as updateDisarmImpl,
  updateLobbyMusic as updateLobbyMusicImpl,
  setControlScheme as setControlSchemeImpl,
  setPaused as setPausedImpl,
  updateBeaconPrompt as updateBeaconPromptImpl,
} from "./interfaceSession";
import {
  showHitHealth as showHitHealthImpl,
  updateHitHealthBars as updateHitHealthBarsImpl,
  showDamageNumber as showDamageNumberImpl,
  updateDamageNumbers as updateDamageNumbersImpl,
  beaconImpact as beaconImpactImpl,
  beaconShot as beaconShotImpl,
} from "./combatPresentation";
import { startMatch as startMatchImpl } from "./matchSession";
import { installMultiplayer as installMultiplayerImpl } from "./networkSession";

import { LoadoutUI } from "../ui/loadout";

import { PulseTrapAudio } from "../audio/pulseTrap";

import { BeaconAudio } from "../audio/beacon";
import { EngagementUI } from "../ui/engagement";
import { EngagementAudio } from "../audio/engagement";
import {
  CombatLedger,
  emptyPerformance,
  type PingKind,
  type TeamPing,
} from "./engagement";
import type { Hittable } from "../core/hittable";

import { Disarm } from "./disarm";
import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  type AbstractEngine,
  FreeCamera,
  GlowLayer,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3,
  Camera,
  Ray,
  Matrix,
  Plane,
} from "@babylonjs/core";

import { WEAPONS, type WeaponId } from "../config/weapons";
import { WeaponAudio } from "../audio/weapons";
import { CoreMatch } from "./match";
import { Lobby } from "../ui/lobby";

import { CONFIG, TEAMS, type Team } from "../config/game";
import { World } from "../map/builder";
import { office01 } from "../maps/office01";
import { Input, Player } from "../player/player";
import { Damageable } from "../core/damageable";
import { Destructible } from "../core/destructible";
import { Weapons } from "../weapons/system";
import { Pickup } from "../pickups/pickup";
import { HUD } from "../ui/hud";
import { Debug } from "../debug/debug";

import { ShotPrediction } from "../network/shotPrediction";

import { Multiplayer } from "../network/client";
import { MSG, type Snapshot, type NetInput } from "../../shared/protocol";
export class Game {
  rc!: RCSession;
  loadout!: LoadoutUI;
  beaconAudio = new BeaconAudio();
  pulseTrapAudio = new PulseTrapAudio();
  testToolsEnabled =
    new URLSearchParams(location.search).get("devtools") === "1" ||
    new URLSearchParams(location.search).get("playtest") === "1";
  multiplayer?: Multiplayer;
  inputSequence = 0;
  pendingInputs: NetInput[] = [];
  onlinePressed = false;
  shotPrediction = new ShotPrediction();
  predictedRockets: {
    mesh: import("@babylonjs/core").Mesh;
    start: Vector3;
    direction: Vector3;
    age: number;
  }[] = [];
  pendingPlantAt?: number;
  hitHealthBars = new Map<
    string,
    { el: HTMLElement; fill: HTMLElement; hp: number; until: number }
  >();
  damageNumbers: { el: HTMLElement; position: Vector3; life: number }[] = [];
  onlineSpawned = false;
  predictedPosition?: Vector3;
  visualCorrection = Vector3.Zero();
  lastPositionCorrection = 0;
  predictedVelocity = 0;
  onlinePlayers = new Map<string, Player>();
  onlineTraces: { mesh: import("@babylonjs/core").Mesh; life: number }[] = [];
  onlineModels = new Map<string, string>();
  onlineObjects = new Map<string, import("@babylonjs/core").Mesh>();
  onlineInput = {
    warcry: false,
    jump: false,
    interact: false,
    slot: 0 as 0 | 1 | 2 | 3,
  };
  networkElapsed = 0;
  nameTimer = 0;
  lobby!: Lobby;
  engine: AbstractEngine;
  scene: Scene;
  camera: FreeCamera;
  world: World;
  player: Player;
  input: Input;
  weapons: Weapons;
  pickup: Pickup;
  hud: HUD;
  engagement!: EngagementUI;
  engagementAudio?: EngagementAudio;
  localLedger = new CombatLedger();
  lastTeamPing = -10;
  localCountdown = 0;
  localRoundAction?: () => void;
  countdownSound = 0;
  botRespawn = 0;

  debug: Debug;
  cores: Damageable[];
  match = new CoreMatch();
  testPlayer?: Player;
  testWeapons?: Weapons;
  testFireTimer = 1;
  testFiring = false;
  testShootingEnabled = true;
  respawnRemaining = 0;
  busterScreamPlayed = false;
  paused = true;
  time = 0;
  audio?: AudioContext;
  weaponAudio?: WeaponAudio;
  sound = true;
  localDisarm = new Disarm();
  localKills = 0;
  currentRound = 1;
  teamWins = { RED: 0, BLUE: 0 };
  disarmAudio = new Audio("/audio/disarm.mp3");
  lobbyMuted = localStorage.getItem("officeCore.lobbyMuted") === "true";
  updateDisarm(progress?: number) {
    return updateDisarmImpl.call(this, progress);
  }
  lobbyMusic = new Audio("/audio/music/tactical-pulse.mp3");
  lobbyMusicBlocked = false;
  lobbyMusicPending = false;
  updateLobbyMusic(unlock = false) {
    return updateLobbyMusicImpl.call(this);
  }
  cameraTarget = new Vector3();
  shake = 0;
  intrudedTeam?: Team;
  breachTeam?: Team;
  breachUntil = 0;
  constructor(canvas: HTMLCanvasElement, engine?: AbstractEngine) {
    this.engine = engine ?? new Engine(canvas, true, { stencil: true });
    this.engine.setHardwareScalingLevel(
      Math.max(1, window.devicePixelRatio / 1.5),
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString("#14232cff");
    this.scene.ambientColor = new Color3(0.13, 0.16, 0.19);
    const ambient = new HemisphericLight(
      "sky",
      new Vector3(0, 1, 0),
      this.scene,
    );
    ambient.intensity = 0.48;
    ambient.diffuse = Color3.FromHexString("#c6dce9");
    ambient.groundColor = Color3.FromHexString("#756452");
    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.65, -1, 0.45),
      this.scene,
    );
    sun.position.set(12, 30, -20);
    sun.intensity = 1.05;
    sun.diffuse = Color3.FromHexString("#ffdfb0");
    const shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    shadows.bias = 0.0005;
    shadows.normalBias = 0.02;
    shadows.setDarkness(0.18);
    const glow = new GlowLayer("subtle glow", this.scene, {
      mainTextureFixedSize: 512,
    });
    glow.intensity = 0.2;
    this.scene.imageProcessingConfiguration.contrast = 1.12;
    this.scene.imageProcessingConfiguration.exposure = 1.02;
    this.scene.imageProcessingConfiguration.vignetteEnabled = true;
    this.scene.imageProcessingConfiguration.vignetteWeight = 1.1;
    this.camera = new FreeCamera(
      "fixed follow",
      new Vector3(0, 23, -13),
      this.scene,
    );
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.fov = CONFIG.thirdPerson.fov;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 150;
    this.world = new World(this.scene, shadows);
    this.world.build();
    this.world.explosions.onBurst = (position, power, sound) => {
      const distance = Vector3.Distance(position, this.player.root.position);
      const strength = Math.max(0, 1 - distance / 22) * power;
      // Keep distant explosions audible without extending camera shake.
      const audibleStrength = Math.max(0.12 * power, strength);
      this.shake = Math.max(this.shake, strength * 0.24);
      if (
        sound === "bazookaExplosion" &&
        this.sound &&
        this.weaponAudio?.playBazookaExplosion(audibleStrength)
      )
        return;
      if (
        sound === "plasmaMine" &&
        this.sound &&
        this.weaponAudio?.playPlasmaMine(audibleStrength)
      )
        return;
      this.explosionSound(audibleStrength);
    };
    this.player = new Player(this.world);
    this.input = new Input(canvas);
    this.player.root.rotation.y = this.input.yaw;
    this.cores = office01.bases.map(
      (b) => new Damageable(this.world, "core", b.x, b.z, b.team),
    );
    this.hud = new HUD();
    this.engagement = new EngagementUI(this.world, (kind) =>
      this.sendTeamPing(kind),
    );
    this.localDisarm.onComplete = () => {
      this.localLedger.add("local", "disarms");
      this.hud.toast("CORE BUSTER DISARMED · ROUND SAVED");
      this.engagementAudio?.hit(true);
    };
    let preferred = true;
    try {
      const saved = localStorage.getItem("office-wars-controls");
      if (saved === "classic" || saved === "aim") preferred = saved === "aim";
    } catch {
      /* Storage may be unavailable in private browsers. */
    }
    this.setControlScheme(preferred, false);
    document
      .querySelectorAll<HTMLInputElement>('input[name="controls"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          if (radio.checked) this.setControlScheme(radio.value === "aim");
        });
      });
    document.body.classList.remove("third-person", "capture-fallback");
    this.weapons = new Weapons(
      this.player,
      (t, d) => {
        this.recordLocalHit("local", t, d);
        if (
          t instanceof Destructible &&
          t.prop.kind === "coreDoor" &&
          this.match.isActive(t.team as Team) &&
          t.team !== CONFIG.player.team &&
          t.team
        ) {
          this.breachTeam = t.team;
          this.breachUntil = this.time + 4;
          this.hud.breachWarning(t.team);
        } else if (t instanceof Damageable && t.team === CONFIG.player.team)
          this.hud.warning(t.team);
      },
      () => this.shotSound(),
      () => this.hud.toast("CORE SHIELDED — ENTER THE BASE"),
      () => this.weaponAudio?.playImpact(),
    );
    this.cores.forEach((core) => core.setActive(false));
    const lobby = new Lobby(
      (team) => {
        if (this.multiplayer?.room) {
          this.multiplayer.room.send(MSG.team, team);
          return;
        }
        this.match.selectTeam(team);
        lobby.update(this.match.members, team);
      },
      (name) => {
        if (this.multiplayer?.room) {
          clearTimeout(this.nameTimer);
          this.nameTimer = window.setTimeout(
            () => this.multiplayer?.room?.send(MSG.profile, name.slice(0, 24)),
            250,
          );
          return;
        }
        this.match.setPlayerName(name);
        lobby.update(
          this.multiplayer ? [] : this.match.members,
          this.match.members[0]?.team ?? "RED",
        );
      },
    );
    this.lobby = lobby;
    this.loadout = new LoadoutUI((choice) => {
      if (this.multiplayer?.room)
        this.multiplayer.room.send(MSG.loadout, choice);
      else if (choice) {
        this.prepareAudio();
        this.startMatch(
          (document.querySelector<HTMLInputElement>(
            'input[name="team"]:checked',
          )?.value ?? "RED") as Team,
        );
        this.setPaused(false);
      }
    });
    document.querySelector("#ui")!.append(this.loadout.el);
    lobby.onChat = (text) => {
      if (this.multiplayer?.room) {
        this.multiplayer.room.send(
          MSG.profile,
          this.lobby.el.querySelector<HTMLInputElement>("#player-name")!.value,
        );
        this.multiplayer.room.send(MSG.chat, text);
      } else this.hud.toast("Anslut till en lobby för att chatta.");
    };
    const music = lobby.el.querySelector<HTMLButtonElement>(".lobby-music")!;
    const updateMusic = () =>
      (music.textContent = this.lobbyMuted
        ? "Lobbymusik: av"
        : "Lobbymusik: på");
    updateMusic();
    music.addEventListener("click", () => {
      this.lobbyMuted = !this.lobbyMuted;
      localStorage.setItem("officeCore.lobbyMuted", String(this.lobbyMuted));
      this.updateLobbyMusic(true);
      updateMusic();
    });
    this.match.setPlayerName(
      localStorage.getItem("officeCore.playerName") ?? "",
    );
    this.match.selectTeam("RED");
    lobby.update(this.match.members, "RED");
    document.querySelector(".brief")!.after(lobby.el);
    if (new URLSearchParams(location.search).get("playtest") !== "1")
      this.installMultiplayer();
    const builderLink = document.createElement("a");
    builderLink.href = "/?builder=1";
    builderLink.className = "map-builder-link";
    builderLink.textContent = "ÖPPNA KARTBYGGAREN";
    document.querySelector(".pause-card")!.append(builderLink);
    document.querySelector("#play")!.innerHTML = "STARTA MATCH <span>↗</span>";
    this.pickup = new Pickup(this.world);
    this.pickup.onAmmo = () => {
      if (this.sound) this.weaponAudio?.playAmmoPickup();
    };
    this.pickup.pulseTraps.onHit = (owner, target, damage) =>
      this.recordLocalHit(owner, target, damage);
    this.pickup.pulseTraps.onDetonate = (trap) =>
      this.world.explosions.burst(
        new Vector3(trap.x, 0.35, trap.z),
        "#ff55c3",
        1.6,
        "plasmaMine",
      );
    this.pickup.pulseTraps.onAvailable = (team) =>
      this.hud.toast(
        `Pulse Trap available in ${team === "BLUE" ? "Blue" : "Red"} Weapon drop!`,
      );
    this.pickup.beacons.onHit = (owner, target, damage) =>
      this.recordLocalHit(owner, target, damage);
    this.pickup.beacons.onEvent = (e) => {
      if (e.kind === "available")
        this.hud.toast(
          `Defensive beacon available in ${e.team === "BLUE" ? "Blue" : "Red"} Weapon drop!`,
        );
      if (e.kind === "damage") this.showDamageNumber(e.position, e.damage ?? 0);
      if (e.kind === "place" || e.kind === "shot")
        this.beaconAudio.play(
          e.kind,
          Vector3.Distance(e.position, this.player.root.position),
          this.sound,
        );
      if (e.kind === "shot" && e.end) this.beaconShot(e.position, e.end);
      if (e.kind === "impact")
        this.beaconImpact(
          e.position,
          e.material ?? "metal",
          e.destroyed,
          e.end,
        );
    };
    this.weapons.onCoreBusterDropped = (position) =>
      this.pickup.dropCoreBuster(position);
    this.weapons.onWarcry = () => {
      if (this.sound) this.weaponAudio?.playBusterScream();
    };
    this.weapons.onCoreBusterAcquired = () => {
      this.busterScreamPlayed = false;
      this.hud.toast("Active Core buster! protect him at all costs!");
      const notice = document.querySelector<HTMLElement>(
        "#core-buster-notice",
      )!;
      notice.textContent = "Active Core buster! protect him at all costs!";
      notice.hidden = false;
    };
    const warcry = document.createElement("button");
    warcry.id = "warcry";
    warcry.hidden = true;
    this.hud.el.append(warcry);
    warcry.addEventListener("click", () => {
      if (this.paused) return;
      if (this.multiplayer?.room) this.onlineInput.warcry = true;
      else this.weapons.activateWarcry();
    });
    const notice = document.createElement("div");
    notice.id = "core-buster-notice";
    notice.hidden = true;
    document.querySelector("#ui")!.append(notice);
    const panel = document.createElement("aside");
    panel.className = "build-panel";
    panel.hidden = !this.testToolsEnabled;
    panel.innerHTML = `<details open><summary>BYGGPANEL · TEST</summary><p>Utrusta spelaren</p><div class="build-weapons">${Object.entries(
      WEAPONS,
    )
      .filter(([id]) => id !== "coreBuster")
      .map(([id, data]) => `<button data-equip="${id}">${data.name}</button>`)
      .join(
        "",
      )}</div><button id="test-beacon">DEFENSIVE BEACON</button><button id="test-pulse-trap">PULSE TRAP [3]</button><button id="test-rc-car">RC BOMBER [3]</button><button id="view-test-trap">VISA TESTMINAN</button><label><input id="test-shooting" type="checkbox" checked> Testspelaren skjuter</label><button id="test-death">TEST: SPELAREN DÖR</button><p>Ljudnivåer</p>${Object.entries(
      {
        pistol: "Pistol",
        machineGun: "Kulspruta",
        bazooka: "Bazooka",
        burstGun: "Burst gun",
        pulseGun: "Pulse gun",
        plasmaMine: "Pulse Trap",
        explosion: "Explosioner",
        bazookaExplosion: "Bazookaexplosion",
        ricochet: "Rikoschetter",
        coreAlarm: "Core-larm",
        footsteps: "Fotsteg",
        jump: "Hopp",
        land: "Landning",
        busterScream: "Core buster-skrik",
        busterClock: "Core buster-timer",
        death: "Dödsljud",
        spawn: "Spawn",
      },
    )
      .map(
        ([id, name]) =>
          `<label>${name}<output>100 %</output><input aria-label="Volym ${name}" data-level="${id}" type="range" min="0" max="200" value="100" step="5"></label>`,
      )
      .join("")}<small>Nivåerna sparas på denna enhet.</small></details>`;
    document.body.append(panel);
    panel
      .querySelector("#test-shooting")!
      .addEventListener("change", (event) => {
        this.testShootingEnabled = (event.target as HTMLInputElement).checked;
      });
    panel.querySelector("#test-beacon")!.addEventListener("click", () => {
      if (
        this.multiplayer ||
        !this.match.started ||
        this.match.winner ||
        this.player.hp <= 0
      )
        return;
      this.pickup.beacons.carried.add("local");
      this.weapons.carryingBeacon = true;
      this.hud.toast("DEFENSIVE BEACON · LMB TO PLACE");
    });
    panel.querySelector("#test-pulse-trap")!.addEventListener("click", () => {
      if (
        this.multiplayer ||
        !this.match.started ||
        this.match.winner ||
        this.player.hp <= 0
      )
        return;
      this.weapons.carryingPulseTrap = true;
      this.weapons.switchSlot(3);
      this.hud.toast("PULSE TRAP · [3] SELECT · LMB: PLACE");
    });
    panel.querySelector("#test-rc-car")!.addEventListener("click", () => {
      if (
        this.multiplayer ||
        !this.match.started ||
        this.match.winner ||
        this.player.hp <= 0 ||
        this.rc.locked
      )
        return;
      this.weapons.utilityKind = "rcCar";
      this.weapons.utilityCount = 2;
      this.weapons.switchSlot(3);
      this.hud.toast("RC BOMBER · LMB: DEPLOY · W/S + MOUSE: DRIVE");
    });
    panel.querySelector("#view-test-trap")!.addEventListener("click", () => {
      if (
        this.multiplayer ||
        !this.match.started ||
        this.match.winner ||
        this.player.hp <= 0
      )
        return;
      const trap = this.pickup.pulseTraps.spawnTestTrap(
        this.match.members[1].team,
      );
      this.player.root.position.set(
        trap.x + (trap.team === "BLUE" ? -6 : 6),
        0,
        trap.z,
      );
      this.cameraTarget.copyFrom(this.player.root.position);
      this.input.clear();
      this.hud.toast(
        "TEST PULSE TRAP · SÖDRA HÖRNET · GÅ NÄRMARE FÖR DETONATION",
      );
    });
    panel.querySelector("#test-death")!.addEventListener("click", () => {
      if (this.match.started && !this.match.winner) this.player.hp = 0;
    });
    for (const button of Array.from(
      panel.querySelectorAll<HTMLButtonElement>("[data-equip]"),
    ))
      button.addEventListener("click", () => {
        this.weaponAudio?.releaseMachineGun(false);
        this.weapons.equip(button.dataset.equip as WeaponId);
        this.hud.toast(`EQUIPPED: ${WEAPONS[this.weapons.id].name}`);
      });
    // Preserve the mix chosen in the local playtest on every hosting origin.
    const savedMix = {
      footsteps: 10,
      busterScream: 65,
      bazookaExplosion: 70,
    } as Record<string, number>;
    if (localStorage.getItem("officeCore.bazookaExplosionMixVersion") !== "1") {
      localStorage.setItem("officeWars.audio.bazookaExplosion", "70");
      localStorage.setItem("officeCore.bazookaExplosionMixVersion", "1");
    }
    const migrateMix =
      localStorage.getItem("officeCore.audioMixVersion") !== "1";
    for (const slider of Array.from(
      panel.querySelectorAll<HTMLInputElement>("[data-level]"),
    )) {
      const key = slider.dataset.level!;
      if (migrateMix)
        localStorage.setItem(
          `officeWars.audio.${key}`,
          String(savedMix[key] ?? 100),
        );
      const saved = Number(
        localStorage.getItem(`officeWars.audio.${key}`) ?? 100,
      );
      slider.value = String(
        Math.max(0, Math.min(200, Number.isFinite(saved) ? saved : 100)),
      );
      slider.previousElementSibling!.textContent = `${slider.value} %`;
      slider.addEventListener("input", () => {
        slider.previousElementSibling!.textContent = `${slider.value} %`;
        localStorage.setItem(`officeWars.audio.${key}`, slider.value);
        this.prepareAudio().setLevel(key, Number(slider.value) / 100);
      });
    }
    localStorage.setItem("officeCore.audioMixVersion", "1");
    panel.addEventListener("pointerdown", (event) => event.stopPropagation());
    panel.addEventListener("keydown", (event) => event.stopPropagation());
    this.rc = new RCSession(this.world, this.input, this.player, this.weapons);
    this.rc.system.onHit = (owner, target, damage) =>
      this.recordLocalHit(owner, target, damage);
    this.debug = new Debug(this.world, this.player);
    this.cameraTarget.copyFrom(this.player.root.position);
    this.updateCamera(10);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointerdown", () => {
      this.updateLobbyMusic(true);
      if (this.sound && this.audio?.state === "suspended")
        void this.audio.resume();
    });
    window.addEventListener("keydown", () => {
      this.updateLobbyMusic(true);
      if (this.sound && this.audio?.state === "suspended")
        void this.audio.resume();
    });
    document.querySelector("#play")!.addEventListener("click", () => {
      if (!this.lobby.validName()) return;
      if (this.multiplayer?.room) {
        this.prepareAudio();
        this.multiplayer.room.send(MSG.start);
        if (this.multiplayer.snapshot?.started) this.setPaused(false);
        return;
      }
      if (!this.match.started && !this.loadout.confirmed) {
        document.querySelector<HTMLElement>("#overlay")!.style.display = "none";
        this.loadout.el.hidden = false;
        return;
      }
      const firstSpawn = !this.match.started;
      if (!this.match.started)
        this.startMatch(
          (document.querySelector<HTMLInputElement>(
            'input[name="team"]:checked',
          )?.value ?? "RED") as Team,
        );
      const audio = this.prepareAudio();
      if (firstSpawn)
        void audio.load().then(() => {
          if (this.sound && !this.paused) audio.playSpawn();
        });
      this.setPaused(false);
    });
    document
      .querySelector("#pause")!
      .addEventListener("click", () => this.setPaused(!this.paused));
    window.addEventListener("keydown", (e) => {
      if (!this.paused && !e.repeat && this.multiplayer?.room) {
        if (e.code === "Space") {
          e.preventDefault();
          this.onlineInput.jump = true;
        }
        if (e.code === "KeyQ") this.onlineInput.warcry = true;
        if (e.code === "KeyE") this.onlineInput.interact = true;
        if (e.code === "Digit1") this.onlineInput.slot = 1;
        if (e.code === "Digit2") this.onlineInput.slot = 2;
        if (e.code === "Digit3") this.onlineInput.slot = 3;
        return;
      }
      if (!this.paused && !e.repeat) {
        if (
          e.code === "Space" &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLButtonElement)
        ) {
          e.preventDefault();
          if (
            !this.rc.locked &&
            this.player.hp > 0 &&
            this.player.jump() &&
            this.sound
          )
            this.weaponAudio?.playMovement("jump");
        }
        if (e.code === "Digit1") this.weapons.switchSlot(1);
        if (e.code === "Digit2") this.weapons.switchSlot(2);
        if (e.code === "Digit3") this.weapons.switchSlot(3);
        if (e.code === "KeyQ") this.weapons.activateWarcry();
        if (e.code === "KeyE") this.pickup.chooseRequested = true;
      }
      if (e.code === "KeyC" && !e.repeat) {
        this.setControlScheme(!this.input.aimRelativeMovement);
        this.hud.toast(
          this.input.aimRelativeMovement
            ? "SIKTSTYRD STYRNING"
            : "KLASSISK STYRNING",
        );
      }
      if (e.code === "Escape" && !e.repeat) {
        if (this.input.locked) return; // Native Escape releases pointer lock first.
        this.setPaused(!this.paused);
      }
    });
    window.addEventListener("blur", () => this.setPaused(true));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.setPaused(true);
    });
    document.querySelector("#sound")!.addEventListener("click", () => {
      this.sound = !this.sound;
      if (!this.sound) {
        this.weaponAudio?.releaseMachineGun(false);
        this.weaponAudio?.setAlarm(false);
        this.weaponAudio?.setBusterClock(false);
        this.weaponAudio?.updateFootsteps([], this.player.root.position, false);
      }
      document.querySelector("#sound")!.textContent = this.sound
        ? "SOUND ON"
        : "SOUND OFF";
      if (this.sound) {
        this.prepareAudio();
      }
    });
    this.engine.runRenderLoop(() => this.tick());
  }
  installMultiplayer() {
    return installMultiplayerImpl.call(this);
  }
  applyOnline(snapshot: Snapshot) {
    return applyOnlineImpl.call(this, snapshot);
  }
  tickOnline(dt: number) {
    return tickOnlineImpl.call(this, dt);
  }
  showHitHealth(id: string, damage: number, currentHp?: number) {
    return showHitHealthImpl.call(this, id, damage, currentHp);
  }
  updateHitHealthBars() {
    return updateHitHealthBarsImpl.call(this);
  }
  showDamageNumber(position: Vector3, damage: number) {
    return showDamageNumberImpl.call(this, position, damage);
  }
  updateDamageNumbers(dt: number) {
    return updateDamageNumbersImpl.call(this, dt);
  }
  startMatch(team: Team) {
    return startMatchImpl.call(this, team);
  }
  setControlScheme(aimRelative: boolean, save = true) {
    return setControlSchemeImpl.call(this, aimRelative);
  }
  setPaused(value: boolean) {
    return setPausedImpl.call(this, value);
  }
  resize() {
    return resizeImpl.call(this);
  }
  updateCamera(dt: number) {
    return updateCameraImpl.call(this, dt);
  }
  tick() {
    this.updateLobbyMusic();
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
    advanceCountdown.call(this, dt);
    if (this.multiplayer?.room) {
      this.tickOnline(dt);
      return;
    }
    if (!this.paused) {
      this.time += dt;
      if (this.player.hp <= 0 && this.respawnRemaining === 0) {
        if (this.sound) this.weaponAudio?.playDeath();
        this.world.explosions.playerDeath(
          this.player.root.position,
          TEAMS[CONFIG.player.team as Team],
        );
        this.weapons.dropCoreBuster();
        this.weapons.utilityCount = 0;
        this.weapons.pulseTrapSelected = false;
        this.respawnRemaining = 5;
        this.player.root.setEnabled(false);
      }
      if (this.respawnRemaining > 0) {
        this.respawnRemaining = Math.max(0, this.respawnRemaining - dt);
        if (this.respawnRemaining === 0) {
          const base = office01.bases.find(
            (base) => base.team === CONFIG.player.team,
          )!;
          this.player.root.position.set(base.spawn.x, 0, base.spawn.z);
          this.player.verticalVelocity = 0;
          this.player.hp = CONFIG.player.hp;
          this.localLedger.damage.delete("local");
          this.player.root.setEnabled(true);
          this.world.explosions.playerSpawn(
            this.player.root.position,
            TEAMS[CONFIG.player.team as Team],
          );
          if (this.sound) this.weaponAudio?.playSpawn();
        }
      }
      let command = this.input.command(this.world, this.player.root.position);
      const rcActors = [
        {
          id: "local",
          team: CONFIG.player.team as Team,
          player: this.player,
          weapons: this.weapons,
        },
        ...(this.testPlayer && this.testWeapons
          ? [
              {
                id: "bot",
                team: this.match.members[1].team,
                player: this.testPlayer,
                weapons: this.testWeapons,
              },
            ]
          : []),
      ];
      const remote = this.rc.local(command, dt, rcActors);
      if (remote)
        command = {
          ...command,
          facingYaw: this.player.root.rotation.y,
          moveX: 0,
          moveZ: 0,
          fire: false,
          pressed: false,
        };
      this.rc.render(
        dt,
        this.rc.system.snapshot(),
        "local",
        rcActors.map((a) => ({
          player: a.player,
          remote: this.rc.system.controlling(a.id),
        })),
        this.sound && !this.paused,
        this.player.hp > 0,
      );
      if (this.player.hp <= 0) {
        command.moveX = 0;
        command.moveZ = 0;
        command.fire = false;
        command.pressed = false;
      }
      document.querySelector<HTMLElement>("#core-buster-notice")!.hidden =
        !this.weapons.carryingCoreBuster;
      const beforeMove = this.player.root.position.clone();
      this.player.update(command, dt);
      if (this.player.landed && this.sound)
        this.weaponAudio?.playMovement("land");
      const moving =
        this.player.grounded &&
        Math.hypot(
          beforeMove.x - this.player.root.position.x,
          beforeMove.z - this.player.root.position.z,
        ) > 0.001;
      this.weaponAudio?.updateFootsteps(
        [
          {
            id: "local",
            x: this.player.root.position.x,
            z: this.player.root.position.z,
            moving,
          },
        ],
        this.player.root.position,
        this.sound,
        (x, z) => this.isCarpet(x, z),
      );
      const p = this.player.root.position;
      this.intrudedTeam = office01.bases.find(
        (b) =>
          this.match.isActive(b.team) &&
          b.team !== CONFIG.player.team &&
          Math.abs(p.x - b.x) < 5.5 &&
          Math.abs(p.z - b.z) < 5.5,
      )?.team;
      this.updateCamera(dt);

      if (this.testPlayer && this.testPlayer.hp <= 0) {
        if (!this.botRespawn) {
          this.botRespawn = 5;
          this.testPlayer.root.setEnabled(false);
        }
        this.botRespawn = Math.max(0.00001, this.botRespawn - dt);
        if (this.botRespawn <= 0.00001) {
          this.botRespawn = 0;
          this.testPlayer.hp = 100;
          this.testPlayer.root.setEnabled(true);
          this.localLedger.damage.delete("bot");
        }
      }
      if (
        this.testPlayer &&
        this.testPlayer.hp > 0 &&
        this.testWeapons &&
        this.testShootingEnabled
      ) {
        this.testFireTimer -= dt;
        if (this.testFireTimer <= 0) {
          this.testFiring = !this.testFiring;
          this.testFireTimer = this.testFiring
            ? 0.25 + Math.random() * 0.6
            : 1.5 + Math.random() * 3;
        }
        const bot = {
          moveX: 0,
          moveZ: 0,
          aimX: this.player.root.position.x,
          aimZ: this.player.root.position.z,
          facingYaw: Math.atan2(
            this.player.root.position.x - this.testPlayer.root.position.x,
            this.player.root.position.z - this.testPlayer.root.position.z,
          ),
          fire: this.testFiring && this.player.hp > 0,
          pressed: false,
        };
        this.testPlayer.update(bot, dt);
        this.testWeapons.update(bot, dt);
      }
      const disarming = this.localDisarm.update(
        this.player,
        [this.weapons, ...(this.testWeapons ? [this.testWeapons] : [])],
        this.pickup.chooseRequested,
        command.fire,
        dt,
      );
      if (disarming) this.pickup.chooseRequested = false;
      const beaconActor = {
        id: "local",
        team: CONFIG.player.team as Team,
        player: this.player,
        weapons: this.weapons,
        pulseTrapSelected: this.weapons.pulseTrapSelected,
      };
      const placingTrap =
        this.weapons.utilityKind !== "rcCar" &&
        this.weapons.pulseTrapSelected &&
        command.pressed;
      if (placingTrap && !disarming) this.pickup.pulseTraps.place(beaconActor);
      const placingBeacon =
        !placingTrap &&
        this.pickup.beacons.carried.has("local") &&
        command.pressed;
      if (placingBeacon && !disarming) this.pickup.beacons.place(beaconActor);
      if (
        this.pickup.chooseRequested &&
        this.pickup.pulseTraps.acquire(beaconActor)
      ) {
        this.pickup.chooseRequested = false;
        this.hud.toast("PULSE TRAP · [3] SELECT · LMB: PLACE");
      }
      if (
        this.pickup.chooseRequested &&
        this.pickup.beacons.acquire(beaconActor)
      ) {
        this.pickup.chooseRequested = false;
        this.hud.toast("DEFENSIVE BEACON · LMB TO PLACE");
      }
      this.weapons.carryingBeacon = this.pickup.beacons.carried.has("local");
      this.weapons.update(
        disarming || placingBeacon || placingTrap
          ? { ...command, fire: false, pressed: false }
          : command,
        dt,
      );
      if (!command.fire || this.weapons.id !== "machineGun")
        this.weaponAudio?.releaseMachineGun();
      this.pickup.update(dt, this.time, this.weapons, () =>
        this.hud.toast("PICKUP COLLECTED"),
      );
      this.pickup.beacons.update(dt, [
        beaconActor,
        ...(this.testPlayer
          ? [
              {
                id: "bot",
                team: this.match.members[1].team,
                player: this.testPlayer,
              },
            ]
          : []),
      ]);
      this.pickup.pulseTraps.update(dt, [
        beaconActor,
        ...(this.testPlayer && this.testWeapons
          ? [
              {
                id: "bot",
                team: this.match.members[1].team,
                player: this.testPlayer,
                weapons: this.testWeapons,
              },
            ]
          : []),
      ]);
      this.cores.forEach((t) => t.update(dt, this.time));
      this.world.destructibles.forEach((o) => o.update(dt));
      this.world.explosions.update(dt);
      finishLocalRound.call(this);
    }
    const alarmTeam =
      this.intrudedTeam ??
      (this.time < this.breachUntil ? this.breachTeam : undefined);
    const ownCore = this.cores.find((c) => c.team === CONFIG.player.team);
    this.world.updateAlarm(
      this.paused
        ? undefined
        : ownCore && ownCore.hp <= 350
          ? ownCore.team
          : alarmTeam,
      this.time,
      ownCore ? Math.max(0, 1 - ownCore.hp / 350) : 0,
    );
    const spatial = (position: { x: number; y?: number; z: number }) => {
      const origin = new Vector3(position.x, position.y ?? 1.1, position.z);
      const listener = this.player.root.position.add(new Vector3(0, 1.1, 0));
      const delta = listener.subtract(origin);
      const distance = delta.length();
      const hit =
        distance > 0
          ? this.scene.pickWithRay(
              new Ray(origin, delta.scale(1 / distance), distance),
              (mesh) => {
                if (!mesh.isEnabled()) return false;
                const target = mesh.metadata?.damageable;
                if (
                  target?.kind === "core" &&
                  Math.hypot(
                    target.position.x - origin.x,
                    target.position.z - origin.z,
                  ) < 1
                )
                  return false;
                return !!mesh.metadata?.solid || !!target;
              },
            )
          : null;
      return {
        distance,
        pan: (origin.x - listener.x) / Math.max(10, distance),
        blocked: !!hit?.hit,
      };
    };
    this.weaponAudio?.setBusterClock(
      !this.paused && this.sound,
      this.weapons.charges.map((charge) => ({
        id: String(charge.mesh.uniqueId),
        timer: charge.timer,
        ...spatial(charge.mesh.position),
      })),
    );
    const alarmBase = office01.bases.find((base) => base.team === alarmTeam);
    this.weaponAudio?.setAlarm(
      !this.paused && this.sound && !!alarmBase,
      alarmBase ? spatial(alarmBase) : undefined,
    );
    this.player.setBarrier(this.player.invulnerable > 0 && this.player.hp > 0);
    if (!this.multiplayer) this.hud.showStats(this.match.started);
    if (!this.multiplayer) this.hud.wins(this.teamWins, this.currentRound);
    this.hud.scoreboard(
      this.multiplayer
        ? []
        : this.match.members.map((p, i) => ({
            ...p,
            ...(this.localLedger.totals.get(i === 0 ? "local" : "bot") ??
              emptyPerformance()),
          })),
    );
    this.updateDisarm(
      this.localDisarm.target ? this.localDisarm.elapsed : undefined,
    );
    const threat = [
      this.weapons,
      ...(this.testWeapons ? [this.testWeapons] : []),
    ]
      .flatMap((w) => w.charges)
      .flatMap((b) =>
        office01.bases.filter(
          (core) =>
            Math.hypot(
              b.mesh.position.x - core.x,
              b.mesh.position.z - core.z,
            ) <= 5,
        ),
      )[0];
    if (threat) this.hud.plantedWarning(threat.team);
    this.updateDamageNumbers(dt);
    this.updateHitHealthBars();
    this.pickup.pulseTraps.animate(
      this.pulseTrapAudio.update(
        this.paused ? 0 : dt,
        this.sound && !this.paused && this.match.started && !this.match.winner,
        this.player.root.position,
        this.pickup.pulseTraps.snapshot(),
      ),
    );
    this.beaconAudio.update(
      dt,
      this.sound && !this.paused,
      this.player.root.position,
      this.pickup.beacons.snapshot(),
    );
    this.updateBeaconPrompt();
    this.updateEngagement(dt);
    this.hud.update(
      this.paused ? 0 : dt,
      this.cores,
      this.weapons,
      this.player,
    );
    this.debug.update(
      this.engine.getFps(),
      this.player,
      this.weapons,
      this.pickup,
      this.cores,
    );
    this.scene.render();
  }
  beaconImpact(
    position: Vector3,
    material: string,
    destroyed?: boolean,
    reflected?: Vector3,
  ) {
    return beaconImpactImpl.call(
      this,
      position,
      material,
      destroyed,
      reflected,
    );
  }
  beaconShot(start: Vector3, end: Vector3) {
    return beaconShotImpl.call(this, start, end);
  }
  updateBeaconPrompt() {
    return updateBeaconPromptImpl.call(this);
  }
  isCarpet(x: number, z: number) {
    return !office01.corridors.some(
      (r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2,
    );
  }
  sendTeamPing(kind: PingKind) {
    if (
      this.paused ||
      !this.match.started ||
      this.player.hp <= 0 ||
      this.time - this.lastTeamPing < 1.2
    )
      return;
    this.lastTeamPing = this.time;
    const ray = this.scene.createPickingRay(
      this.input.pointer.x,
      this.input.pointer.y,
      Matrix.Identity(),
      this.camera,
    );
    const distance = ray.intersectsPlane(new Plane(0, 1, 0, 0));
    const aim =
      distance !== null
        ? ray.origin.add(ray.direction.scale(distance))
        : this.player.root.position;
    const cmd = { aimX: aim.x, aimZ: aim.z };
    const base = office01.bases.find((b) => b.team === CONFIG.player.team)!;
    const ping: TeamPing = {
      kind,
      x:
        kind === "help"
          ? this.player.root.position.x
          : kind === "defend"
            ? base.x
            : cmd.aimX,
      z:
        kind === "help"
          ? this.player.root.position.z
          : kind === "defend"
            ? base.z
            : cmd.aimZ,
      name: this.match.playerName,
      team: CONFIG.player.team,
    };
    if (
      !Number.isFinite(ping.x) ||
      !Number.isFinite(ping.z) ||
      Math.abs(ping.x) >= 200 ||
      Math.abs(ping.z) >= 200
    )
      return;
    if (this.multiplayer?.room) this.multiplayer.room.send(MSG.teamPing, ping);
    else {
      this.engagement.ping(ping);
      this.engagementAudio?.tone(650, 0.08, 0.035);
    }
  }
  playCountdown(seconds?: number) {
    const value = seconds === undefined ? 0 : Math.ceil(seconds);
    if (value && value !== this.countdownSound) {
      if (this.engagementAudio) this.engagementAudio.active = this.sound;
      this.engagementAudio?.tone(430 + value * 80, 0.12, 0.06);
    }
    this.countdownSound = value;
  }
  updateEngagement(dt: number) {
    const active = this.match.started && !this.paused && !this.match.winner;
    const snapshot = this.multiplayer?.snapshot;
    const hp =
      snapshot?.cores.find((c) => c.team === CONFIG.player.team)?.hp ??
      this.cores.find((c) => c.team === CONFIG.player.team)?.hp ??
      1000;
    const bombs =
      snapshot?.bombs ??
      [this.weapons, ...(this.testWeapons ? [this.testWeapons] : [])].flatMap(
        (w) =>
          w.charges.map((c) => ({
            x: c.mesh.position.x,
            z: c.mesh.position.z,
            timer: c.timer,
          })),
      );
    const threats = bombs
      .flatMap((b) =>
        office01.bases
          .filter((core) => Math.hypot(b.x - core.x, b.z - core.z) <= 5)
          .map((core) => ({ team: core.team, timer: b.timer })),
      )
      .sort((a, b) => a.timer - b.timer);
    const hit = document.querySelector<HTMLElement>("#hit-confirm")!;
    if (this.input.mode === "topDown") {
      hit.style.left = `${this.input.pointer.x}px`;
      hit.style.top = `${this.input.pointer.y}px`;
    }
    for (const core of this.cores)
      document
        .querySelector(`#hp-${core.team}`)
        ?.closest(".core")
        ?.classList.toggle(
          "critical",
          core.active && core.hp > 0 && core.hp <= 350,
        );
    this.engagement.update(dt, active, hp / 1000, threats[0]);
    this.engagementAudio?.update(
      dt,
      this.sound && (active || !!this.localCountdown || !!snapshot?.countdown),
      this.player.root.position,
      active ? hp / 1000 : 1,
      active ? threats[0]?.timer : undefined,
    );
  }
  bindLocalTarget(player: Player, id: string) {
    const target = {
      get hp() {
        return player.hp;
      },
      get position() {
        return player.root.position.add(new Vector3(0, 1, 0));
      },
      canDamageFrom: () => true,
      damage: (amount: number) => {
        if (player.hp > 0 && player.invulnerable <= 0) {
          const damage = Math.min(player.hp, amount);
          player.hp = Math.max(0, player.hp - amount);
          if (id === "local") this.hud.damage(damage);
          else this.showHitHealth(id, damage, player.hp);
          this.showDamageNumber(
            player.root.position.add(new Vector3(0, 2, 0)),
            damage,
          );
        }
      },
    };
    for (const mesh of player.bodyMeshes) {
      mesh.metadata = { damageable: target };
      mesh.isPickable = true;
    }
  }
  recordLocalHit(id: string, target: Hittable, damage: number) {
    const victim = [
      ["local", this.player],
      ["bot", this.testPlayer],
    ] as const;
    const entry = victim.find(([, player]) =>
      player?.bodyMeshes.some((m) => m.metadata?.damageable === target),
    );
    const material = entry
      ? "player"
      : target instanceof Destructible
        ? target.prop.kind === "glass"
          ? "glass"
          : ["server", "coreDoor"].includes(target.prop.kind)
            ? "metal"
            : "wood"
        : "metal";
    const position =
      (target as { position?: Vector3 }).position ?? this.player.root.position;
    this.engagement.impact(position, material, target.hp <= 0);
    this.engagementAudio?.impact(
      material,
      Vector3.Distance(position, this.player.root.position),
      target.hp <= 0,
    );
    if (id === "local") {
      this.engagement.confirm();
      this.engagementAudio?.hit();
    }
    if (
      target instanceof Damageable &&
      target.kind === "core" &&
      target.team !==
        (id === "local" ? CONFIG.player.team : this.match.members[1]?.team)
    )
      this.localLedger.add(id, "coreDamage", damage);
    if (entry && entry[0] !== id) {
      this.localLedger.hit(id, entry[0], damage, this.time);
      if (target.hp <= 0) {
        const base = office01.bases.find(
          (b) =>
            b.team ===
            (id === "local" ? CONFIG.player.team : this.match.members[1]?.team),
        )!;
        this.localLedger.kill(
          id,
          entry[0],
          this.time,
          Math.hypot(position.x - base.x, position.z - base.z) <= 12,
        );
        if (id === "local") {
          this.engagement.confirm(true);
          this.engagementAudio?.hit(true);
        }
      }
    }
  }
  explosionSound(strength: number) {
    if (!this.sound || !this.audio || strength <= 0) return;
    if (this.weaponAudio?.playExplosion(strength)) return;
    const ctx = this.audio,
      t = ctx.currentTime;
    const buffer = ctx.createBuffer(
      1,
      Math.floor(ctx.sampleRate * 0.55),
      ctx.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] =
        (Math.random() * 2 - 1) * Math.pow(1 - i / samples.length, 2);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32 * strength, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start();
    const bass = ctx.createOscillator(),
      bg = ctx.createGain();
    bass.frequency.setValueAtTime(100, t);
    bass.frequency.exponentialRampToValueAtTime(28, t + 0.35);
    bg.gain.setValueAtTime(0.35 * strength, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    bass.connect(bg).connect(ctx.destination);
    bass.start();
    bass.stop(t + 0.4);
  }
  prepareAudio() {
    this.audio ??= new AudioContext();
    this.weaponAudio ??= new WeaponAudio(this.audio);
    this.engagementAudio ??= new EngagementAudio(this.audio);
    document
      .querySelectorAll<HTMLInputElement>("[data-level]")
      .forEach((slider) =>
        this.weaponAudio!.setLevel(
          slider.dataset.level!,
          Number(slider.value) / 100,
        ),
      );
    void this.audio.resume();
    void this.weaponAudio.load();
    return this.weaponAudio;
  }
  shotSound() {
    if (!this.sound) return;
    this.weaponAudio?.play(this.weapons.id);
  }
}
