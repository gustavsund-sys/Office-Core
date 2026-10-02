import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  FreeCamera,
  GlowLayer,
  HemisphericLight,
  Scene,
  ShadowGenerator,
  Vector3,
  Camera,
  Ray,
  MeshBuilder,
  Quaternion,
  Matrix,
} from "@babylonjs/core";
import { rotatingCameraPose } from "./rotatingCamera";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { WeaponAudio } from "../audio/weapons";
import { CoreMatch } from "./match";
import { Lobby } from "../ui/lobby";
import { showVictory } from "../ui/victory";
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
import { heldWeapon, rocketModel } from "../weapons/models";
import { connectionError } from "../network/errors";
import { ShotPrediction } from "../network/shotPrediction";
import { interpolateYaw } from "../network/interpolation";
import { Multiplayer } from "../network/client";
import { MSG, type Snapshot, type NetInput } from "../../shared/protocol";
export class Game {
  testToolsEnabled =
    new URLSearchParams(location.search).get("devtools") === "1";
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
  predictedVelocity = 0;
  onlinePlayers = new Map<string, Player>();
  onlineTraces: { mesh: import("@babylonjs/core").Mesh; life: number }[] = [];
  onlineModels = new Map<string, string>();
  onlineObjects = new Map<string, import("@babylonjs/core").Mesh>();
  onlineInput = { warcry: false, jump: false, interact: false, slot: 0 as 0 | 1 | 2 };
  networkElapsed = 0;
  nameTimer = 0;
  lobby!: Lobby;
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
  world: World;
  player: Player;
  input: Input;
  weapons: Weapons;
  pickup: Pickup;
  hud: HUD;
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
  targets: Damageable[];
  paused = true;
  time = 0;
  audio?: AudioContext;
  weaponAudio?: WeaponAudio;
  sound = true;
  cameraTarget = new Vector3();
  shake = 0;
  intrudedTeam?: Team;
  breachTeam?: Team;
  breachUntil = 0;
  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true });
    this.engine.setHardwareScalingLevel(
      Math.max(1, window.devicePixelRatio / 1.5),
    );
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString("#14232cff");
    this.scene.ambientColor = new Color3(0.28, 0.32, 0.36);
    const ambient = new HemisphericLight(
      "sky",
      new Vector3(0, 1, 0),
      this.scene,
    );
    ambient.intensity = 0.65;
    ambient.groundColor = Color3.FromHexString("#536a75");
    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.5, -1, 0.4),
      this.scene,
    );
    sun.position.set(12, 30, -20);
    sun.intensity = 0.75;
    sun.diffuse = Color3.FromHexString("#fff0cf");
    const shadows = new ShadowGenerator(2048, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_HIGH;
    shadows.bias = 0.0005;
    shadows.normalBias = 0.02;
    shadows.setDarkness(0.3);
    const glow = new GlowLayer("subtle glow", this.scene, {
      mainTextureFixedSize: 512,
    });
    glow.intensity = 0.28;
    this.scene.imageProcessingConfiguration.contrast = 1.06;
    this.scene.imageProcessingConfiguration.exposure = 0.95;
    this.scene.imageProcessingConfiguration.vignetteEnabled = true;
    this.scene.imageProcessingConfiguration.vignetteWeight = 1.4;
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
      this.explosionSound(audibleStrength);
    };
    this.player = new Player(this.world);
    this.input = new Input(canvas);
    this.player.root.rotation.y = this.input.yaw;
    this.cores = office01.bases.map(
      (b) => new Damageable(this.world, "core", b.x, b.z, b.team),
    );
    this.targets = office01.targets.map(
      (t) => new Damageable(this.world, "target", t.x, t.z),
    );
    this.hud = new HUD();
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
        this.hud.damage(d);
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
          this.hud.warning();
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
        lobby.update(this.match.members, this.match.members[0]?.team ?? "RED");
      },
    );
    this.lobby = lobby;
    this.match.setPlayerName(
      localStorage.getItem("officeCore.playerName") ?? "",
    );
    this.match.selectTeam("RED");
    lobby.update(this.match.members, "RED");
    document.querySelector(".brief")!.after(lobby.el);
    this.installMultiplayer();
    document.querySelector("#play")!.innerHTML = "STARTA MATCH <span>↗</span>";
    this.pickup = new Pickup(this.world);
    this.weapons.onCoreBusterDropped = (position) =>
      this.pickup.dropCoreBuster(position);
    this.weapons.onWarcry = () => { if (this.sound) this.weaponAudio?.playBusterScream(); };
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
      )}</div><label><input id="test-shooting" type="checkbox" checked> Testspelaren skjuter</label><button id="test-death">TEST: SPELAREN DÖR</button><p>Ljudnivåer</p>${Object.entries(
      {
        pistol: "Pistol",
        machineGun: "Kulspruta",
        bazooka: "Bazooka",
        burstGun: "Burst gun",
        pulseGun: "Pulse gun",
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
    this.debug = new Debug(this.world, this.player);
    this.cameraTarget.copyFrom(this.player.root.position);
    this.updateCamera(10);
    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointerdown", () => {
      if (this.sound && this.audio?.state === "suspended")
        void this.audio.resume();
    });
    window.addEventListener("keydown", () => {
      if (this.sound && this.audio?.state === "suspended")
        void this.audio.resume();
    });
    document.querySelector("#play")!.addEventListener("click", () => {
      if (this.multiplayer?.room) {
        this.prepareAudio();
        this.multiplayer.room.send(MSG.start);
        if (this.multiplayer.snapshot?.started) this.setPaused(false);
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
        return;
      }
      if (!this.paused && !e.repeat) {
        if (
          e.code === "Space" &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLButtonElement)
        ) {
          e.preventDefault();
          if (this.player.hp > 0 && this.player.jump() && this.sound)
            this.weaponAudio?.playMovement("jump");
        }
        if (e.code === "Digit1") this.weapons.switchSlot(1);
        if (e.code === "Digit2") this.weapons.switchSlot(2);
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
    const panel = document.createElement("div");
    panel.className = "network-lobby";
    panel.innerHTML =
      '<h3>OFFICE01 · MULTIPLAYER</h3><p>Anslut till OFFICE01. Skriv sedan ditt namn och välj Core i spellobbyn.</p><div id="available-rooms">Hämtar OFFICE01…</div><button id="leave-room" hidden>LÄMNA LOBBY</button><p id="network-status" role="status"></p>';
    this.lobby.el.before(panel);
    this.lobby.el.hidden = true;
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
        if (event.kind === "damage") {
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
            const spark = MeshBuilder.CreateBox(
              "online impact",
              { size: 0.09 },
              this.scene,
            );
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
          const muzzle = MeshBuilder.CreateSphere(
            "online muzzle",
            { diameter: 0.23, segments: 4 },
            this.scene,
          );
          muzzle.position.copyFrom(position);
          muzzle.material = this.world.mat("#ffe8a1", true);
          muzzle.isPickable = false;
          this.onlineTraces.push({ mesh: muzzle, life: 0.045 });
          const end = new Vector3(event.endX!, event.endY!, event.endZ!);
          const mesh =
            event.weapon === "pulseGun"
              ? MeshBuilder.CreateTube(
                  "online pulse",
                  { path: [position, end], radius: 0.07, tessellation: 8 },
                  this.scene,
                )
              : MeshBuilder.CreateLines(
                  "online tracer",
                  { points: [position, end] },
                  this.scene,
                );
          if (event.weapon === "pulseGun")
            mesh.material = this.world.mat("#ff263e", true);
          else if ("color" in mesh)
            mesh.color = Color3.FromHexString("#ffe4a5");
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
            "#ffcf56",
            event.power ?? 1,
            event.sound === "bazookaExplosion" ? "bazookaExplosion" : undefined,
          );
        if (event.kind === "death") {
          this.world.explosions.playerDeath(
            position,
            TEAMS[event.team ?? "RED"],
          );
          if (this.sound) this.weaponAudio?.playDeath();
        }
        if (event.kind === "spawn") {
          this.world.explosions.playerSpawn(
            position,
            TEAMS[event.team ?? "RED"],
          );
          if (this.sound) this.weaponAudio?.playSpawn();
        }
        if (event.kind === "buster" && event.team === CONFIG.player.team)
          this.hud.toast("Active Core buster! protect him at all costs!");
      };
      try {
        await net.connect(
          this.match.playerName,
          document.querySelector<HTMLInputElement>(
            'input[name="team"]:checked',
          )!.value,
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
          state.textContent = `${room.started ? "MATCH PÅGÅR" : "TILLGÄNGLIGT"} · ${room.players.length}/${room.capacity} spelare`;
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
            ? "MATCH PÅGÅR"
            : "ANSLUT TILL OFFICE01";
          join.disabled = room.started || room.players.length >= room.capacity;
          join.addEventListener("click", () => void connect(room.id));
          card.append(title, state, roster, join);
          list.append(card);
        }
        if (!rooms.length)
          list.textContent =
            "OFFICE01 förbereds. Listan uppdateras automatiskt.";
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
  applyOnline(snapshot: Snapshot) {
    const own = snapshot.players.find(
      (p) => p.id === this.multiplayer?.room?.sessionId,
    );
    if (!own) return;
    for (const state of snapshot.players) {
      const bar = this.hitHealthBars.get(state.id);
      if (bar) bar.hp = state.hp;
    }
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
    if (snapshot.started && !this.match.started) {
      this.match.started = true;
      this.setPaused(false);
      this.lobby.el.disabled = true;
    }
    this.pendingInputs = this.pendingInputs.filter(
      (input) => (input.seq ?? 0) > own.ack,
    );
    if (
      !this.onlineSpawned ||
      own.hp <= 0 ||
      Vector3.Distance(
        this.player.root.position,
        new Vector3(own.x, own.y, own.z),
      ) > 8
    )
      this.pendingInputs = [];
    this.player.root.position.set(own.x, own.y, own.z);
    this.player.verticalVelocity = own.verticalVelocity;
    if (snapshot.started && own.hp > 0)
      for (const input of this.pendingInputs) {
        if (input.jump) this.player.jump();
        this.player.update(input, 1 / 30);
      }
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
        () => this.multiplayer?.room?.send(MSG.restart),
      );
    }
  }
  tickOnline(dt: number) {
    const net = this.multiplayer!,
      snapshot = net.snapshot;
    this.time += dt;
    if (this.predictedPosition) {
      this.player.root.position.copyFrom(this.predictedPosition);
      this.player.verticalVelocity = this.predictedVelocity;
    }
    this.networkElapsed += dt;
    const command = this.input.command(this.world, this.player.root.position);
    this.onlinePressed ||= command.pressed;
    if (
      command.pressed &&
      !this.paused &&
      this.weapons.carryingCoreBuster &&
      this.player.grounded
    )
      this.pendingPlantAt = this.time;
    this.player.root.rotation.y = Math.atan2(
      command.aimX - this.player.root.position.x,
      command.aimZ - this.player.root.position.z,
    );
    const predictedShot = this.shotPrediction.update(
      this.weapons.id,
      dt,
      command.fire,
      command.pressed,
      !!snapshot?.started &&
        net.connected &&
        !this.paused &&
        this.player.hp > 0 &&
        this.weapons.ammo > 0 &&
        this.weapons.reloadRemaining <= 0,
    );
    if (predictedShot) {
      this.player.recoil = 1;
      this.player.animate(!!(command.moveX || command.moveZ), 0);
      if (predictedShot.audio && this.sound)
        this.weaponAudio?.play(this.weapons.id);
      const start = this.player.root.position
        .add(new Vector3(0, 1.1, 0))
        .add(this.player.direction.scale(0.65));
      const muzzle = MeshBuilder.CreateSphere(
        "predicted muzzle",
        { diameter: 0.23, segments: 4 },
        this.scene,
      );
      muzzle.position.copyFrom(start);
      muzzle.material = this.world.mat("#ffe8a1", true);
      muzzle.isPickable = false;
      this.onlineTraces.push({ mesh: muzzle, life: 0.045 });
      if (this.weapons.id === "bazooka") {
        const mesh = rocketModel(this.world);
        const origin = this.player.root.position
          .add(new Vector3(0, 1.1, 0))
          .add(this.player.direction.scale(0.45));
        mesh.position.copyFrom(origin);
        mesh.isPickable = false;
        this.predictedRockets.push({
          mesh,
          start: origin,
          direction: this.player.direction.clone(),
          age: 0,
        });
      }
      if (this.weapons.id !== "bazooka") {
        const ray = new Ray(
          start,
          this.player.direction,
          WEAPONS[this.weapons.id].range,
        );
        const hit = this.scene.pickWithRay(
          ray,
          (mesh) =>
            mesh.isEnabled() &&
            !this.player.bodyMeshes.includes(
              mesh as import("@babylonjs/core").Mesh,
            ) &&
            (!!mesh.metadata?.solid || !!mesh.metadata?.damageable),
        );
        const end =
          hit?.pickedPoint ??
          start.add(this.player.direction.scale(ray.length));
        const tracer =
          this.weapons.id === "pulseGun"
            ? MeshBuilder.CreateTube(
                "predicted pulse",
                { path: [start, end], radius: 0.07, tessellation: 8 },
                this.scene,
              )
            : MeshBuilder.CreateLines(
                "predicted tracer",
                { points: [start, end] },
                this.scene,
              );
        if (this.weapons.id === "pulseGun")
          tracer.material = this.world.mat("#ff263e", true);
        else if ("color" in tracer)
          tracer.color = Color3.FromHexString("#ffe4a5");
        tracer.isPickable = false;
        this.onlineTraces.push({ mesh: tracer, life: 0.065 });
      }
    }
    this.networkElapsed = Math.min(this.networkElapsed, 0.1);
    while (this.networkElapsed >= 1 / 30) {
      this.networkElapsed -= 1 / 30;
      const length = Math.max(1, Math.hypot(command.moveX, command.moveZ));
      const input: NetInput = {
        seq: this.inputSequence++,
        aimX: command.aimX,
        aimZ: command.aimZ,
        ...this.onlineInput,
        moveX: this.paused ? 0 : command.moveX / length,
        moveZ: this.paused ? 0 : command.moveZ / length,
        fire: !this.paused && command.fire,
        pressed: !this.paused && this.onlinePressed,
      };
      net.send(input);
      if (snapshot?.started && this.player.hp > 0 && net.connected) {
        this.pendingInputs.push(input);
        if (this.pendingInputs.length > 30) this.pendingInputs.shift();
        if (input.jump) this.player.jump();
        this.player.update(input, 1 / 30);
      }
      this.onlinePressed = false;
      this.onlineInput = { warcry: false, jump: false, interact: false, slot: 0 };
    }
    this.predictedPosition = this.player.root.position.clone();
    this.predictedVelocity = this.player.verticalVelocity;
    if (
      snapshot?.started &&
      !this.paused &&
      this.player.hp > 0 &&
      net.connected
    )
      this.player.simulate(command, this.networkElapsed);
    if (snapshot) {
      for (const [id, player] of this.onlinePlayers)
        if (!snapshot.players.some((p) => p.id === id)) {
          player.root.dispose();
          this.onlinePlayers.delete(id);
          this.onlineModels.delete(id);
        }
      const steps: { id: string; x: number; z: number; moving: boolean }[] = [];
      const renderAt = performance.now() - 85;
      const before =
        [...net.history].reverse().find((frame) => frame.at <= renderAt) ??
        net.history[0];
      const after =
        net.history.find((frame) => frame.at >= renderAt) ?? net.history.at(-1);
      const fraction =
        before && after && after.at > before.at
          ? Math.max(
              0,
              Math.min(1, (renderAt - before.at) / (after.at - before.at)),
            )
          : 1;
      for (const latest of snapshot.players) {
        const own = latest.id === net.room?.sessionId;
        const a = before?.snapshot.players.find((p) => p.id === latest.id);
        const b = after?.snapshot.players.find((p) => p.id === latest.id);
        const state =
          !own &&
          a &&
          b &&
          a.hp > 0 &&
          b.hp > 0 &&
          Math.hypot(a.x - b.x, a.z - b.z) < 8
            ? {
                ...latest,
                x: a.x + (b.x - a.x) * fraction,
                y: a.y + (b.y - a.y) * fraction,
                z: a.z + (b.z - a.z) * fraction,
                yaw: interpolateYaw(a.yaw, b.yaw, fraction),
              }
            : latest;

        let player = own ? this.player : this.onlinePlayers.get(state.id);
        if (!player) {
          player = new Player(this.world);
          player.root.position.set(state.x, state.y, state.z);
          this.onlinePlayers.set(state.id, player);
        }
        player.root.setEnabled(state.hp > 0);
        player.hp = state.hp;
        player.invulnerable = state.invulnerable ?? 0;
        player.setBarrier(player.invulnerable > 0 && player.hp > 0);
        const target = new Vector3(state.x, state.y, state.z);
        const moving = Vector3.Distance(player.root.position, target) > 0.04;
        if (!own)
          player.root.position.copyFrom(
            Vector3.Lerp(
              player.root.position,
              target,
              Vector3.Distance(player.root.position, target) > 8 ? 1 : 1,
            ),
          );
        if (own)
          player.root.rotation.y = Math.atan2(
            command.aimX - player.root.position.x,
            command.aimZ - player.root.position.z,
          );
        else {
          player.root.rotation.y = state.yaw;
          player.animate(moving, dt);
        }
        player.torso.material = this.world.mat(TEAMS[state.team]);
        if (this.onlineModels.get(state.id) !== state.weapon) {
          player.setWeaponModel(state.weapon);
          this.onlineModels.set(state.id, state.weapon);
        }
        if (own) {
          this.weapons.id = state.weapon;
          this.weapons.warcryAvailable = state.warcryAvailable ?? false;
          this.weapons.specialWeapon = state.special;
          this.weapons.ammo = state.ammo;
          this.weapons.bazookaReserve = state.reserve;
          this.weapons.reloadRemaining = state.reload;
        }
        steps.push({ id: state.id, x: state.x, z: state.z, moving });
      }
      this.weaponAudio?.updateFootsteps(
        steps,
        this.player.root.position,
        this.sound && !this.paused,
      );
      const objects = [
        ...snapshot.bombs.map((b) => ({
          ...b,
          key: `bomb:${b.id}`,
          weapon: "coreBuster" as WeaponId,
        })),
        ...snapshot.rockets.map((r) => ({
          ...r,
          key: `rocket:${r.id}`,
          weapon: "bazooka" as WeaponId,
        })),
        ...snapshot.pickups
          .filter((p) => p.dropped && p.active)
          .map((p) => ({
            ...p,
            key: `drop:${p.x}:${p.z}`,
            weapon: "coreBuster" as WeaponId,
          })),
      ];
      for (const object of objects) {
        let mesh = this.onlineObjects.get(object.key);
        if (!mesh) {
          const prediction =
            object.weapon === "bazooka" &&
            "owner" in object &&
            object.owner === net.room?.sessionId
              ? this.predictedRockets.shift()
              : undefined;
          mesh =
            prediction?.mesh ??
            (object.weapon === "bazooka"
              ? rocketModel(this.world)
              : heldWeapon(this.world, object.weapon));
          this.onlineObjects.set(object.key, mesh);
        }
        if (object.weapon === "bazooka") {
          const delta = new Vector3(object.x, object.y, object.z).subtract(
            mesh.position,
          );
          if (
            delta.length() > 0.01 &&
            !(
              "owner" in object &&
              object.owner === net.room?.sessionId &&
              mesh.rotationQuaternion
            )
          )
            mesh.rotationQuaternion = Quaternion.FromLookDirectionLH(
              delta.normalize(),
              Vector3.Up(),
            );
        }
        const target = new Vector3(object.x, object.y, object.z);
        if (object.weapon === "bazooka" && mesh.position.length() > 0) {
          mesh.position.copyFrom(
            Vector3.Lerp(mesh.position, target, 1 - Math.exp(-25 * dt)),
          );
          if (Math.random() < dt * 25) {
            const smoke = MeshBuilder.CreateSphere(
              "online rocket trail",
              { diameter: 0.16, segments: 4 },
              this.scene,
            );
            smoke.position.copyFrom(mesh.position);
            smoke.material = this.world.mat("#778085");
            smoke.isPickable = false;
            this.onlineTraces.push({ mesh: smoke, life: 0.6 });
          }
        } else mesh.position.copyFrom(target);
      }
      for (const [key, mesh] of this.onlineObjects)
        if (!objects.some((o) => o.key === key)) {
          mesh.dispose();
          this.onlineObjects.delete(key);
        }
      const spatial = (p: { x: number; z: number }) => {
        const d = Math.hypot(
          p.x - this.player.root.position.x,
          p.z - this.player.root.position.z,
        );
        return {
          distance: d,
          pan: (p.x - this.player.root.position.x) / Math.max(10, d),
          blocked: false,
        };
      };
      this.weaponAudio?.setBusterClock(
        !this.paused && this.sound,
        snapshot.bombs.map((b) => ({ id: String(b.id), ...spatial(b) })),
      );
      const alarmTeams =
        snapshot.alarms ?? (snapshot.alarm ? [snapshot.alarm] : []);
      const ownAlarm = alarmTeams.includes(CONFIG.player.team as Team)
        ? (CONFIG.player.team as Team)
        : alarmTeams[0];
      this.world.updateAlarm(ownAlarm, this.time);
      this.weaponAudio?.setCoreAlarms(
        !this.paused && this.sound
          ? alarmTeams.map((team) => {
              const base = office01.bases.find((b) => b.team === team)!;
              return { id: team, ...spatial(base) };
            })
          : [],
      );
      const timer =
        document.querySelector<HTMLElement>("#network-bomb-timer") ??
        document.createElement("div");
      timer.id = "network-bomb-timer";
      timer.style.cssText =
        "position:fixed;bottom:170px;left:50%;transform:translateX(-50%);color:#ffda61;background:#14252ee8;padding:12px 18px;border:1px solid #ffda61;border-radius:6px;font-size:20px;font-weight:bold;z-index:75;pointer-events:none";
      document.querySelector("#ui")!.append(timer);
      timer.replaceChildren();
      timer.hidden =
        !snapshot.bombs.length && this.pendingPlantAt === undefined;
      const ownBombs = snapshot.bombs.filter(
        (b) => b.owner === net.room?.sessionId,
      );
      if (
        ownBombs.length ||
        (this.pendingPlantAt !== undefined &&
          this.time - this.pendingPlantAt > 1)
      )
        this.pendingPlantAt = undefined;
      const visibleBombs = ownBombs.length ? ownBombs : snapshot.bombs;
      const timers =
        this.pendingPlantAt !== undefined
          ? [
              {
                timer: 25 - (this.time - this.pendingPlantAt),
                owner: net.room?.sessionId,
              },
              ...visibleBombs,
            ]
          : visibleBombs;
      for (const bomb of timers) {
        const row = document.createElement("div");
        row.textContent = `${bomb.owner === net.room?.sessionId ? "DIN CORE BUSTER" : "CORE BUSTER"} · ${Math.ceil(bomb.timer)} s `;
        const bar = document.createElement("progress");
        bar.max = 25;
        bar.value = bomb.timer;
        row.append(bar);
        timer.append(row);
      }
      for (const [id, player] of this.onlinePlayers)
        if (!snapshot.players.some((p) => p.id === id)) {
          player.root.dispose();
          this.onlinePlayers.delete(id);
        }
    }
    for (const rocket of this.predictedRockets) {
      rocket.age += dt;
      const distance = rocket.age * 9.9;
      rocket.mesh.position.copyFrom(
        rocket.start.add(rocket.direction.scale(distance)),
      );
      rocket.mesh.position.y += Math.sin((distance / 40) * Math.PI) * 0.75;
      rocket.mesh.rotationQuaternion = Quaternion.FromLookDirectionLH(
        rocket.direction,
        Vector3.Up(),
      );
      if (rocket.age > 1.5) rocket.mesh.dispose();
    }
    this.predictedRockets = this.predictedRockets.filter((r) => r.age <= 1.5);
    this.updateDamageNumbers(dt);
    this.updateHitHealthBars();
    for (const trace of this.onlineTraces) trace.life -= dt;
    this.onlineTraces = this.onlineTraces.filter((trace) => {
      if (trace.life > 0) return true;
      trace.mesh.dispose();
      return false;
    });
    this.pickup.ammoDrops.forEach((drop) => (drop.sign.rotation.y += dt * 1.1));
    this.pickup.endpoints.forEach((drop) => (drop.root.rotation.y += dt));
    this.updateCamera(dt);
    this.world.explosions.update(dt);
    this.cores.forEach((core) => core.update(dt, this.time));
    this.world.destructibles.forEach((prop) => prop.update(dt));
    this.hud.update(dt, this.cores, this.weapons, this.player);
    this.scene.render();
  }
  showHitHealth(id: string, damage: number) {
    let bar = this.hitHealthBars.get(id);
    if (!bar) {
      const el = document.createElement("div"),
        fill = document.createElement("div");
      el.style.cssText =
        "position:absolute;width:64px;height:8px;background:#4f1724;border:1px solid #f0ece5;border-radius:3px;overflow:hidden;pointer-events:none;z-index:85;transform:translate(-50%,-50%);box-shadow:0 1px 4px #000";
      fill.style.cssText = "height:100%;background:#65dc7b";
      el.append(fill);
      document.querySelector("#ui")!.append(el);
      bar = {
        el,
        fill,
        hp:
          this.multiplayer?.snapshot?.players.find((p) => p.id === id)?.hp ??
          100,
        until: 0,
      };
      this.hitHealthBars.set(id, bar);
    }
    bar.hp = Math.max(0, bar.hp - damage);
    bar.until = this.time + 2;
  }
  updateHitHealthBars() {
    for (const [id, bar] of this.hitHealthBars) {
      const player =
        id === this.multiplayer?.room?.sessionId
          ? this.player
          : this.onlinePlayers.get(id);
      if (this.time >= bar.until || !player) {
        bar.el.remove();
        this.hitHealthBars.delete(id);
        continue;
      }
      const position = player.root.position.add(new Vector3(0, 2.3, 0));
      const point = Vector3.Project(
        position,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        this.camera.viewport.toGlobal(
          this.engine.getRenderWidth(),
          this.engine.getRenderHeight(),
        ),
      );
      bar.el.style.left = `${point.x}px`;
      bar.el.style.top = `${point.y}px`;
      bar.el.hidden = point.z < 0 || point.z > 1 || bar.hp <= 0;
      bar.fill.style.width = `${Math.max(0, Math.min(100, bar.hp))}%`;
      bar.fill.style.background = bar.hp > 30 ? "#65dc7b" : "#ff334b";
    }
  }
  showDamageNumber(position: Vector3, damage: number) {
    const el = document.createElement("div");
    el.textContent = `−${Math.round(damage)}`;
    el.style.cssText =
      "position:absolute;color:#ff334b;font-size:24px;font-weight:900;text-shadow:0 2px 4px #000;pointer-events:none;z-index:90;transform:translate(-50%,-50%)";
    document.querySelector("#ui")!.append(el);
    this.damageNumbers.push({ el, position: position.clone(), life: 1.2 });
  }
  updateDamageNumbers(dt: number) {
    for (const number of this.damageNumbers) {
      number.life -= dt;
      number.position.y += dt * 0.8;
      const point = Vector3.Project(
        number.position,
        Matrix.Identity(),
        this.scene.getTransformMatrix(),
        this.camera.viewport.toGlobal(
          this.engine.getRenderWidth(),
          this.engine.getRenderHeight(),
        ),
      );
      number.el.style.left = `${point.x}px`;
      number.el.style.top = `${point.y}px`;
      number.el.style.opacity = String(Math.min(1, number.life * 2));
      number.el.hidden = point.z < 0 || point.z > 1;
      if (number.life <= 0) number.el.remove();
    }
    this.damageNumbers = this.damageNumbers.filter((n) => n.life > 0);
  }
  startMatch(team: Team) {
    this.match.start(team);
    CONFIG.player.team = team;
    const base = office01.bases.find((base) => base.team === team)!;
    this.player.root.position.set(base.x, 0, base.z - Math.sign(base.z) * 9);
    this.player.torso.material = this.world.mat(TEAMS[team]);
    this.world.explosions.playerSpawn(this.player.root.position, TEAMS[team]);
    this.cores.forEach((core) =>
      core.setActive(this.match.isActive(core.team!)),
    );
    if (this.testToolsEnabled) {
      const other = this.match.members[1];
      const otherBase = office01.bases.find(
        (base) => base.team === other.team,
      )!;
      this.testPlayer = new Player(this.world);
      this.testPlayer.root.position.set(
        otherBase.x,
        0,
        otherBase.z - Math.sign(otherBase.z) * 9,
      );
      this.testPlayer.torso.material = this.world.mat(TEAMS[other.team]);
      this.testWeapons = new Weapons(
        this.testPlayer,
        () => {},
        () => {
          if (!this.sound || !this.testPlayer) return;
          const origin = this.testPlayer.root.position.add(
            new Vector3(0, 1.1, 0),
          );
          const listener = this.player.root.position.add(
            new Vector3(0, 1.1, 0),
          );
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
      this.world.label(
        "TEST PLAYER",
        otherBase.x,
        otherBase.z - Math.sign(otherBase.z) * 11,
        TEAMS[other.team],
        3,
      );
    }
    document.querySelector(".health > span")!.textContent =
      `PLAYER / ${team} TEAM`;
    document.querySelector(".team-choice")!.setAttribute("disabled", "");
    this.cameraTarget.copyFrom(this.player.root.position);
    this.hud.toast(`${team} TEAM · LAST CORE STANDING WINS`);
  }
  setControlScheme(aimRelative: boolean, save = true) {
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
  setPaused(value: boolean) {
    if (this.match.winner && !value) return;
    this.paused = value;
    if (value) {
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
  resize() {
    this.engine.resize();
    const aspect = this.engine.getRenderWidth() / this.engine.getRenderHeight();
    const half = CONFIG.camera.viewSize / 2;
    this.camera.orthoTop = half;
    this.camera.orthoBottom = -half;
    this.camera.orthoLeft = -half * aspect;
    this.camera.orthoRight = half * aspect;
  }
  updateCamera(dt: number) {
    const c = CONFIG.camera;
    if (this.input.mode === "thirdPerson") {
      const pose = rotatingCameraPose(
        this.player.root.position,
        this.input.yaw,
      );
      this.camera.position.copyFrom(pose.position);
      this.camera.setTarget(pose.target);
      this.player.root.getChildMeshes().forEach((m) => (m.visibility = 1));
      if (this.shake > 0) {
        this.camera.position.x += Math.sin(this.time * 91) * this.shake * 0.35;
        this.shake = Math.max(0, this.shake - dt * 0.9);
      }
      return;
    }
    this.player.root.getChildMeshes().forEach((m) => (m.visibility = 1));
    const desired = this.player.root.position.add(
      new Vector3(0, 0, c.lookAhead),
    );
    const edge = office01.size / 2;
    const limitX = Math.max(0, edge - (this.camera.orthoRight ?? 18));
    const limitZ = Math.max(
      0,
      edge - c.viewSize / 2 / Math.sin((c.angle * Math.PI) / 180),
    );
    desired.x = Math.max(-limitX, Math.min(limitX, desired.x));
    desired.z = Math.max(-limitZ, Math.min(limitZ, desired.z));
    Vector3.LerpToRef(
      this.cameraTarget,
      desired,
      1 - Math.exp(-c.smoothing * dt),
      this.cameraTarget,
    );
    const h = c.height * c.distance;
    this.camera.position.copyFrom(
      this.cameraTarget.add(
        new Vector3(0, h, -h / Math.tan((c.angle * Math.PI) / 180)),
      ),
    );
    this.camera.setTarget(this.cameraTarget);
    if (this.shake > 0) {
      this.camera.position.x += Math.sin(this.time * 91) * this.shake;
      this.camera.position.z += Math.cos(this.time * 73) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 0.9);
    }
  }
  tick() {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
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
        this.respawnRemaining = 5;
        this.player.root.setEnabled(false);
      }
      if (this.respawnRemaining > 0) {
        this.respawnRemaining = Math.max(0, this.respawnRemaining - dt);
        if (this.respawnRemaining === 0) {
          const base = office01.bases.find(
            (base) => base.team === CONFIG.player.team,
          )!;
          this.player.root.position.set(
            base.x,
            0,
            base.z - Math.sign(base.z) * 9,
          );
          this.player.verticalVelocity = 0;
          this.player.hp = CONFIG.player.hp;
          this.player.root.setEnabled(true);
          this.world.explosions.playerSpawn(
            this.player.root.position,
            TEAMS[CONFIG.player.team as Team],
          );
          if (this.sound) this.weaponAudio?.playSpawn();
        }
      }
      const command = this.input.command(this.world, this.player.root.position);
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

      if (this.testPlayer && this.testWeapons && this.testShootingEnabled) {
        this.testFireTimer -= dt;
        if (this.testFireTimer <= 0) {
          this.testFiring = !this.testFiring;
          this.testFireTimer = this.testFiring
            ? 0.25 + Math.random() * 0.6
            : 1.5 + Math.random() * 3;
          if (this.testFiring)
            this.testPlayer.root.rotation.y =
              Math.atan2(
                -this.testPlayer.root.position.x,
                -this.testPlayer.root.position.z,
              ) +
              (Math.random() - 0.5) * 0.7;
        }
        const bot = {
          moveX: 0,
          moveZ: 0,
          aimX: 0,
          aimZ: 0,
          facingYaw: this.testPlayer.root.rotation.y,
          fire: this.testFiring,
          pressed: false,
        };
        this.testPlayer.update(bot, dt);
        this.testWeapons.update(bot, dt);
      }
      this.weapons.update(command, dt);
      if (!command.fire || this.weapons.id !== "machineGun")
        this.weaponAudio?.releaseMachineGun();
      this.pickup.update(dt, this.time, this.weapons, () =>
        this.hud.toast("PICKUP COLLECTED"),
      );
      this.cores.concat(this.targets).forEach((t) => t.update(dt, this.time));
      this.world.destructibles.forEach((o) => o.update(dt));
      this.world.explosions.update(dt);
      const winner = this.match.evaluate(this.cores);
      if (winner) {
        this.setPaused(true);
        showVictory(
          winner,
          this.match.members.filter((member) => member.team === winner),
        );
      }
    }
    const alarmTeam =
      this.intrudedTeam ??
      (this.time < this.breachUntil ? this.breachTeam : undefined);
    this.world.updateAlarm(this.paused ? undefined : alarmTeam, this.time);
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
        ...spatial(charge.mesh.position),
      })),
    );
    const alarmBase = office01.bases.find((base) => base.team === alarmTeam);
    this.weaponAudio?.setAlarm(
      !this.paused && this.sound && !!alarmBase,
      alarmBase ? spatial(alarmBase) : undefined,
    );
    this.player.setBarrier(this.player.invulnerable > 0 && this.player.hp > 0);
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
