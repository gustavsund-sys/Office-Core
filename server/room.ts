import { inactivityState, IDLE_CLOSE_CODE } from "../shared/inactivity";
import { RCCars } from "../src/game/rcCar";
import { SnapshotSender } from "../src/network/streams";
import { RoomMetrics } from "./metrics";
import { preparationStatus } from "../src/game/flow";
import { validLoadout, applyLoadout, type Loadout } from "../src/game/loadout";
import { takeInputs, INPUT_STEP } from "./inputQueue";
import { HitHistory } from "./rewind";
import { encodeSnapshot } from "../src/network/snapshots";
import { Destructible } from "../src/core/destructible";
import {
  CombatLedger,
  emptyPerformance,
  validTeamPing,
} from "../src/game/engagement";
import { resetRound } from "../src/game/round";
import { Disarm } from "../src/game/disarm";
import { Room, type Client, ServerError } from "@colyseus/core";
import { getAuth } from "firebase-admin/auth";
import {
  NullEngine,
  Scene,
  GroundMesh,
  FreeCamera,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { World } from "../src/map/builder";
import { Player } from "../src/player/player";
import { Weapons } from "../src/weapons/system";
import { Pickup } from "../src/pickups/pickup";
import { Damageable } from "../src/core/damageable";
import { office01 } from "../src/maps/office01";
import {
  TEAMS,
  MAX_PLAYERS,
  MAX_PLAYERS_PER_TEAM,
  type Team,
} from "../src/config/game";
import {
  MSG,
  validInput,
  type NetInput,
  type Snapshot,
  type NetEvent,
} from "../shared/protocol";
class ServerWorld extends World {
  override authoritative = true;
  override label(text: string) {
    return new GroundMesh(text, this.scene);
  }
}
const idle = (): NetInput => ({
  moveX: 0,
  moveZ: 0,
  aimX: 0,
  aimZ: 0,
  fire: false,
  pressed: false,
  jump: false,
  interact: false,
  slot: 0,
});
interface Participant {
  lastActivity?: number;
  activityWarned?: boolean;
  idleExpired?: boolean;
  loadout?: Loadout;
  awaitingLoadout?: boolean;
  inputCredit: number;
  lastInputDiagnostic: number;
  inputReportAt: number;
  lastClientDiagnostic: number;
  receivedInputs: number;
  processedInputs: number;
  rejectedInputs: number;
  life: number;
  shotTime?: number;
  lastPing: number;
  kills: number;
  disarm: Disarm;
  lastChat: number;
  uid: string;
  name: string;
  team: Team;
  player: Player;
  weapons: Weapons;
  input: NetInput;
  queue: NetInput[];
  ack: number;
  lastSeq: number;
  lastInput: number;
  window: number;
  messages: number;
  respawn: number;
  connected: boolean;
}
export class OfficeRoom extends Room {
  static measurements = new Set<RoomMetrics>();
  metrics = new RoomMetrics();

  static active = 0;
  static rooms = new Map<string, OfficeRoom>();
  optimizedClients = new Map<string, Snapshot | undefined>();
  frame = 0;
  hitHistory = new HitHistory();
  hosted = false;
  counted = false;
  engine!: NullEngine;
  scene!: Scene;
  world!: ServerWorld;
  pickup!: Pickup;
  orphanWeapons: Weapons[] = [];
  participants = new Map<string, Participant>();
  cores: Damageable[] = [];
  started = false;
  preparing = false;
  winner?: Team;
  ledger = new CombatLedger();
  countdownUntil = 0;
  round = 1;
  wins: Record<Team, number> = { RED: 0, BLUE: 0 };
  ready = new Set<string>();
  seriesWinner?: Team;
  owner = "";
  time = 0;
  onCreate(options: { hosted?: boolean } = {}) {
    OfficeRoom.measurements.add(this.metrics);
    this.hosted = options.hosted === true;
    if (this.hosted) this.autoDispose = false;
    if (OfficeRoom.active >= 1) throw new ServerError(503, "Server full");
    OfficeRoom.active++;
    this.counted = true;
    OfficeRoom.rooms.set(this.roomId, this);
    this.maxClients = MAX_PLAYERS;
    this.engine = new NullEngine();
    this.scene = new Scene(this.engine);
    new FreeCamera("server", new Vector3(0, 30, -20), this.scene);
    const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), this.scene);
    this.world = new ServerWorld(this.scene, new ShadowGenerator(64, sun));
    this.world.build();
    this.cores = office01.bases.map(
      (base) => new Damageable(this.world, "core", base.x, base.z, base.team),
    );
    this.cores.forEach((core) => core.setActive(false));
    this.pickup = new Pickup(this.world);
    this.pickup.onAmmo = (weapons) => {
      const entry = [...this.participants].find(
        ([, p]) => p.weapons === weapons,
      );
      if (entry)
        this.event({
          kind: "ammoPickup",
          player: entry[0],
          x: weapons.player.root.position.x,
          y: 0,
          z: weapons.player.root.position.z,
        });
    };
    this.pickup.beacons.onHit = (owner, target, damage) =>
      this.participants.get(owner)?.weapons.onHit(target, damage);
    this.pickup.beacons.onEvent = (e) =>
      this.event({
        kind: (
          {
            impact: "beaconImpact",
            place: "beaconPlace",
            shot: "beaconShot",
            available: "beaconAvailable",
            damage: "beaconDamage",
          } as const
        )[e.kind],
        player: e.owner,
        team: e.team,
        x: e.position.x,
        y: e.position.y,
        z: e.position.z,
        endX: e.end?.x,
        endY: e.end?.y,
        endZ: e.end?.z,
        damage: e.damage,
        material: e.material,
        destroyed: e.destroyed,
      });
    this.pickup.pulseTraps.onHit = (owner, target, damage) =>
      this.participants.get(owner)?.weapons.onHit(target, damage);
    this.pickup.pulseTraps.onDetonate = (trap) =>
      this.world.explosions.burst(
        new Vector3(trap.x, 0.35, trap.z),
        "#ff55c3",
        1.6,
        "plasmaMine",
      );
    this.pickup.pulseTraps.onAvailable = (team) =>
      this.event({ kind: "pulseTrapAvailable", team, x: 0, y: 0, z: 0 });
    this.rc = new RCCars(this.world);
    this.rc.onHit = (owner, target, damage) =>
      this.participants.get(owner)?.weapons.onHit(target, damage);
    this.rc.onExplode = (c) =>
      this.event({
        kind: "rcExplosion",
        player: c.owner,
        x: c.x,
        y: 0,
        z: c.z,
      });
    this.world.explosions.visuals = false;
    this.world.explosions.onBurst = (position, power, sound, style) =>
      this.event({
        kind: "explosion",
        x: position.x,
        y: position.y,
        z: position.z,
        power,
        sound,
        explosionStyle: style,
      });
    this.onMessage(MSG.activity, (client) => {
      const p = this.participants.get(client.sessionId);
      if (!p || p.idleExpired) return;
      const now = Date.now();
      if (now - (p.lastActivity ?? 0) < 900) return;
      p.lastActivity = now;
      if (p.activityWarned) client.send(MSG.idle, { remaining: null });
      p.activityWarned = false;
    });
    this.clock.setInterval(() => this.checkInactivity(), 1000);
    this.onMessage(MSG.netReady, (client, capabilities) => {
      if (!this.permit(client)) return;
      this.optimizedClients.set(client.sessionId, undefined);
      if (capabilities?.stream === 2)
        this.streamClients.set(client.sessionId, 0);
      this.sendSnapshots(client);
    });
    this.onMessage(MSG.ping, (client, stamp) => {
      if (
        this.permit(client) &&
        typeof stamp === "number" &&
        Number.isFinite(stamp)
      )
        client.send(MSG.ping, stamp);
    });
    this.onMessage(MSG.motionDiagnostics, (client, payload) => {
      const p = this.participants.get(client.sessionId);
      if (
        !p ||
        !payload ||
        typeof payload !== "object" ||
        Date.now() - p.lastClientDiagnostic < 750
      )
        return;
      const fields = [
        "fps",
        "pending",
        "correction",
        "sentRate",
        "ackAge",
        "snapshotAge",
        "clientAck",
        "sentSeq",
      ] as const;
      if (
        !fields.every(
          (k) =>
            typeof payload[k] === "number" &&
            Number.isFinite(payload[k]) &&
            Math.abs(payload[k]) < 1e12,
        )
      )
        return;
      p.lastClientDiagnostic = Date.now();
      const optional = [
        "packetAge",
        "maxPending",
        "maxFrameMs",
        "maxPacketGapMs",
        "maxSnapshotGapMs",
        "maxSnapshotHandlerMs",
        "decodeFailures",
        "predictionBlocked",
      ];
      const values = Object.fromEntries(
        [
          ...fields,
          ...optional.filter(
            (k) =>
              typeof payload[k] === "number" &&
              Number.isFinite(payload[k]) &&
              payload[k] >= 0 &&
              payload[k] < 1e12,
          ),
        ].map((k) => [k, Math.round(payload[k] * 100) / 100]),
      );
      console.info(
        JSON.stringify({
          kind: "client_motion",
          name: p.name,
          team: p.team,
          ...values,
          serverAck: p.ack,
          serverSeq: p.lastSeq,
          serverQueue: p.queue.length,
          winner: this.winner ?? null,
          version:
            typeof payload.version === "string"
              ? payload.version.slice(0, 40)
              : "unknown",
        }),
      );
    });
    this.onMessage(MSG.input, (client, payload) => {
      const p = this.participants.get(client.sessionId);
      if (!p) return;
      const now = Date.now();
      if (now - p.window > 1000) {
        p.window = now;
        p.messages = 0;
      }
      p.receivedInputs++;
      const reject = (reason: string) => {
        p.rejectedInputs++;
        if (now - p.lastInputDiagnostic < 5000) return;
        p.lastInputDiagnostic = now;
        console.warn(
          JSON.stringify({
            kind: "input_rejected",
            reason,
            name: p.name,
            team: p.team,
            queue: p.queue.length,
            ack: p.ack,
            lastSeq: p.lastSeq,
            messages: p.messages,
          }),
        );
      };
      if (++p.messages > 90) {
        reject("rate_limit");
        return;
      }
      if (!validInput(payload)) {
        reject("invalid_input");
        return;
      }
      if (payload.seq !== undefined) {
        if (payload.seq <= p.lastSeq) {
          reject("stale_sequence");
          return;
        }
        if (p.queue.length >= 64) {
          reject("queue_full");
          return;
        }
        p.lastSeq = payload.seq;
        if (this.started && !this.winner) p.queue.push(payload);
        else p.ack = payload.seq;
      }
      p.input = {
        ...payload,
        pressed: p.input.pressed || payload.pressed,
        jump: p.input.jump || payload.jump,
        interact: p.input.interact || payload.interact,
        warcry: p.input.warcry || payload.warcry,
      };
      p.lastInput = now;
    });
    this.onMessage(MSG.chat, (client, text) => {
      const p = this.participants.get(client.sessionId);
      if (
        !p ||
        this.started ||
        typeof text !== "string" ||
        text.length > 240 ||
        !text.trim() ||
        Date.now() - p.lastChat < 1000
      )
        return;
      p.lastChat = Date.now();
      this.broadcast(MSG.chat, { name: p.name, text: text.trim() });
    });
    this.onMessage(MSG.teamPing, (client, value) =>
      this.handleTeamPing(client, value),
    );
    this.onMessage(MSG.profile, (client, name) => {
      if (
        !this.permit(client) ||
        this.started ||
        typeof name !== "string" ||
        name.length > 24
      )
        return;
      const p = this.participants.get(client.sessionId);
      if (p && name.trim()) p.name = name.trim();
    });
    this.onMessage(MSG.team, (client, team) => {
      if (!this.permit(client)) return;
      const p = this.participants.get(client.sessionId);
      if (
        p &&
        !this.started &&
        !this.preparing &&
        typeof team === "string" &&
        Object.hasOwn(TEAMS, team) &&
        this.teamHasSpace(team as Team, client.sessionId)
      ) {
        p.team = team as Team;
        this.spawn(p);
        this.refreshCores();
      }
    });
    this.onMessage(MSG.ready, (client) => {
      if (!this.permit(client) || !this.winner || this.seriesWinner) return;
      this.ready.add(client.sessionId);
      this.tryNextRound();
    });
    this.onMessage(MSG.restart, async (client) => {
      if (!this.permit(client)) return;
      await this.restartFinishedMatch();
    });
    this.onMessage(MSG.loadout, (client, choice) => {
      const p = this.participants.get(client.sessionId);
      if (!this.permit(client) || !p || (this.started && !p.awaitingLoadout))
        return;
      if (choice !== null && !validLoadout(choice)) return;
      p.loadout = choice === null ? undefined : { ...choice };
      if (this.started && p.awaitingLoadout && p.loadout) {
        p.awaitingLoadout = false;
        this.spawn(p);
        applyLoadout(p.weapons, p.loadout);
        p.player.invulnerable = 3;
      }
      if (this.preparing) this.startWhenEquipped();
      this.sendSnapshots();
    });
    this.onMessage(MSG.start, (client) => {
      if (!this.permit(client)) return;
      if (
        client.sessionId !== this.owner ||
        this.started ||
        new Set(
          [...this.participants.values()]
            .filter((p) => p.connected)
            .map((p) => p.team),
        ).size < 2
      )
        return;
      this.preparing = true;
      this.startWhenEquipped();
      this.sendSnapshots();
    });
    const rate = Math.max(
      10,
      Math.min(60, Number(process.env.SERVER_TICK_RATE ?? 30)),
    );
    this.setSimulationInterval(
      (dt) => this.tick(Math.min(dt / 1000, 0.1)),
      1000 / rate,
    );
    this.clock.setInterval(() => this.sendSnapshots(), 50);
    console.info("room created", this.roomId);
  }
  private startWhenEquipped() {
    if (this.started || !this.preparing) return;
    const status = preparationStatus([...this.participants.values()]);
    if (status === "cancel") {
      this.preparing = false;
      return;
    }
    if (status !== "ready") return;
    this.started = true;
    this.preparing = false;
    for (const p of this.participants.values())
      if (p.loadout) applyLoadout(p.weapons, p.loadout);
    // Keep slots open for late arrivals; team capacity is enforced on join.
  }
  permit(client: Client) {
    const p = this.participants.get(client.sessionId);
    if (!p) return false;
    const now = Date.now();
    if (now - p.window > 1000) {
      p.window = now;
      p.messages = 0;
    }
    return ++p.messages <= 90;
  }
  async onAuth(
    _client: Client,
    options: { token?: string },
    request: { headers: { origin?: string } },
  ) {
    const allowed = (
      process.env.ALLOWED_ORIGINS ??
      "http://127.0.0.1:5173,http://localhost:5173"
    ).split(/[;,]/);
    if (request.headers.origin && !allowed.includes(request.headers.origin))
      throw new ServerError(403, "Origin rejected");
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.DEV_ALLOW_GUEST === "true" &&
      options.token?.startsWith("local:")
    )
      return { uid: options.token.slice(6) };
    if (typeof options.token !== "string" || options.token.length > 8192)
      throw new ServerError(401, "Authentication required");
    try {
      const token = await getAuth().verifyIdToken(options.token);
      return { uid: token.uid };
    } catch {
      throw new ServerError(401, "Invalid identity");
    }
  }
  checkInactivity(now = Date.now()) {
    for (const client of this.clients) {
      const p = this.participants.get(client.sessionId);
      if (!p || p.idleExpired) continue;
      const state = inactivityState(p.lastActivity ?? now, now);
      if (state.expired) {
        p.idleExpired = true;
        client.leave(IDLE_CLOSE_CODE);
      } else if (state.warn) {
        p.activityWarned = true;
        client.send(MSG.idle, { remaining: state.remaining });
      }
    }
  }
  onJoin(
    client: Client,
    options: { name?: string; team?: Team },
    auth: { uid: string },
  ) {
    if ([...this.participants.values()].some((p) => p.uid === auth.uid))
      throw new ServerError(409, "Already in match");
    if (
      typeof options.name !== "string" ||
      !options.name.trim() ||
      options.name.length > 24
    )
      throw new ServerError(400, "Choose a name before joining");
    const requestedTeam = Object.hasOwn(TEAMS, options.team ?? "")
      ? options.team!
      : "RED";
    const team = this.teamHasSpace(requestedTeam)
      ? requestedTeam
      : (Object.keys(TEAMS) as Team[]).find((candidate) =>
          this.teamHasSpace(candidate),
        );
    if (!team) throw new ServerError(409, "Both teams are full");
    const player = new Player(this.world);
    const participant: Participant = {
      lastActivity: Date.now(),
      lastPing: 0,
      kills: 0,
      disarm: new Disarm(),
      lastChat: 0,
      uid: auth.uid,
      name:
        typeof options.name === "string"
          ? options.name.trim().slice(0, 24) || "Player"
          : "Player",
      team,
      player,
      weapons: undefined!,
      input: idle(),
      inputCredit: 0,
      lastInputDiagnostic: 0,
      inputReportAt: Date.now(),
      lastClientDiagnostic: 0,
      receivedInputs: 0,
      processedInputs: 0,
      rejectedInputs: 0,
      life: 0,
      queue: [],
      ack: -1,
      lastSeq: -1,
      lastInput: 0,
      window: 0,
      messages: 0,
      respawn: 0,
      connected: true,
    };
    const event = (kind: NetEvent["kind"]) =>
      this.event({
        kind,
        inputSeq: participant.ack,
        player: client.sessionId,
        team: participant.team,
        weapon: participant.weapons.id,
        x: player.root.position.x,
        y: player.root.position.y,
        z: player.root.position.z,
      });
    participant.weapons = new Weapons(
      player,
      (target, damage) => {
        const victimEntry = [...this.participants].find(([, p]) =>
          p.player.bodyMeshes.some(
            (mesh) => mesh.metadata?.damageable === target,
          ),
        );
        const victim = victimEntry?.[1];
        const core = target instanceof Damageable && target.team;
        const hostile = victim
          ? victim.team !== participant.team
          : core
            ? target.team !== participant.team
            : false;
        if (core) {
          this.attackUntil.set(target.team as Team, this.time + 4);
          if (hostile) this.ledger.add(client.sessionId, "coreDamage", damage);
        }
        const material = victim
          ? "player"
          : target instanceof Destructible
            ? target.prop.kind === "glass"
              ? "glass"
              : ["server", "coreDoor", "vending"].includes(target.prop.kind)
                ? "metal"
                : "wood"
            : "metal";
        this.event({
          kind: "hit",
          player: client.sessionId,
          team: participant.team,
          damage,
          material,
          destroyed: target.hp <= 0,
          x:
            (target as { position?: Vector3 }).position?.x ??
            player.root.position.x,
          y: 1.1,
          z:
            (target as { position?: Vector3 }).position?.z ??
            player.root.position.z,
        });
        if (victim && victimEntry && hostile && victim !== participant) {
          this.ledger.hit(client.sessionId, victimEntry[0], damage, this.time);
          if (target.hp <= 0) {
            participant.kills++;
            const base = office01.bases.find(
              (b) => b.team === participant.team,
            )!;
            const defending =
              Math.hypot(
                victim.player.root.position.x - base.x,
                victim.player.root.position.z - base.z,
              ) <= 12;
            this.ledger.kill(
              client.sessionId,
              victimEntry[0],
              this.time,
              defending,
            );
            this.event({
              kind: "kill",
              player: client.sessionId,
              team: participant.team,
              x: victim.player.root.position.x,
              y: 1,
              z: victim.player.root.position.z,
            });
          }
        }
      },
      () => event("shot"),
    );
    participant.disarm.onComplete = () => {
      this.ledger.add(client.sessionId, "disarms");
      this.event({
        kind: "disarmed",
        player: client.sessionId,
        team: participant.team,
        x: player.root.position.x,
        y: 1,
        z: player.root.position.z,
      });
    };
    participant.weapons.visuals = false;
    participant.weapons.pickHit = (ray) =>
      this.hitHistory.pick(
        this.scene,
        ray,
        player,
        [...this.participants].map(([id, p]) => ({
          id,
          player: p.player,
          life: p.life,
        })),
        participant.shotTime ?? Date.now(),
        Date.now(),
      );
    participant.weapons.onImpact = (position) =>
      this.event({
        kind: "impact",
        x: position.x,
        y: position.y,
        z: position.z,
      });
    participant.weapons.onTrace = (start, end) =>
      this.event({
        kind: "trace",
        player: client.sessionId,
        inputSeq: participant.ack,
        weapon: participant.weapons.id,
        x: start.x,
        y: start.y,
        z: start.z,
        endX: end.x,
        endY: end.y,
        endZ: end.z,
      });
    participant.weapons.onCoreBusterAcquired = () => {
      event("buster");
    };
    participant.weapons.onWarcry = () =>
      this.event({
        kind: "scream",
        player: client.sessionId,
        x: player.root.position.x,
        y: player.root.position.y,
        z: player.root.position.z,
      });
    participant.weapons.onCoreBusterDropped = (position) =>
      this.pickup.dropCoreBuster(position);
    const target = {
      get hp() {
        return player.hp;
      },
      get team() {
        return participant.team;
      },
      get position() {
        return player.root.position.add(new Vector3(0, 1, 0));
      },
      canDamageFrom: () => true,
      damage: (amount: number) => {
        if (this.started && player.invulnerable <= 0) {
          const damage = Math.min(amount, player.hp);
          player.hp = Math.max(0, player.hp - amount);
          if (damage > 0)
            this.event({
              kind: "damage",
              player: client.sessionId,
              damage,
              x: player.root.position.x,
              y: player.root.position.y + 2,
              z: player.root.position.z,
            });
        }
      },
    };
    for (const mesh of player.bodyMeshes) {
      mesh.isPickable = true;
      mesh.metadata = { damageable: target };
    }
    this.participants.set(client.sessionId, participant);
    if (!this.owner) this.owner = client.sessionId;
    this.spawn(participant);
    if (this.started) {
      participant.awaitingLoadout = true;
      participant.player.hp = 0;
      participant.player.root.setEnabled(false);
    }
    this.refreshCores();
    this.scene.render();
    client.send(MSG.snapshot, this.snapshot());
    console.info("player joined", this.roomId);
  }
  handleTeamPing(client: Client, value: unknown) {
    const p = this.participants.get(client.sessionId);
    if (
      !p ||
      !p.connected ||
      !this.started ||
      this.winner ||
      p.player.hp <= 0 ||
      !validTeamPing(value) ||
      Date.now() - p.lastPing < 1200
    )
      return;
    p.lastPing = Date.now();
    const ping = {
      kind: value.kind,
      x: value.x,
      z: value.z,
      name: p.name,
      team: p.team,
    };
    for (const teammate of this.clients)
      if (this.participants.get(teammate.sessionId)?.team === p.team)
        teammate.send(MSG.teamPing, ping);
  }
  teamHasSpace(team: Team, exceptId?: string) {
    return (
      [...this.participants.entries()].filter(
        ([id, p]) => id !== exceptId && p.team === team,
      ).length < MAX_PLAYERS_PER_TEAM
    );
  }
  spawn(p: Participant) {
    p.life++;
    p.inputCredit = 0;
    p.queue = [];
    const base = office01.bases.find((base) => base.team === p.team)!;
    p.player.root.position.set(base.spawn.x, 0, base.spawn.z);
    p.player.hp = 100;
    p.player.verticalVelocity = 0;
    p.player.root.setEnabled(true);
  }
  refreshCores() {
    if (!this.started)
      this.cores.forEach((core) =>
        core.setActive(
          [...this.participants.values()].some((p) => p.team === core.team),
        ),
      );
  }
  attackUntil = new Map<Team, number>();
  tick(dt: number) {
    const start = performance.now();
    const queue = Math.max(
      0,
      ...[...this.participants.values()].map((p) => p.queue.length),
    );
    try {
      this.simulateTick(dt);
    } finally {
      this.metrics.recordTick(performance.now() - start, queue);
    }
  }
  private simulateTick(dt: number) {
    this.time += dt;
    if (this.countdownUntil) {
      if (
        ![...this.participants].every(
          ([id, p]) => p.connected && this.ready.has(id),
        ) ||
        new Set([...this.participants.values()].map((p) => p.team)).size < 2
      )
        this.countdownUntil = 0;
      else if (this.time >= this.countdownUntil) {
        this.countdownUntil = 0;
        this.completeNextRound();
      }
    }
    if (!this.started || this.winner) return;
    this.hitHistory.record(
      Date.now(),
      [...this.participants].map(([id, p]) => ({
        id,
        player: p.player,
        life: p.life,
      })),
    );
    this.pickup.tickTimers(dt);
    for (const [id, p] of this.participants) {
      if (p.awaitingLoadout) continue;
      if (p.player.hp <= 0 && p.respawn === 0) {
        p.weapons.dropCoreBuster();
        p.weapons.utilityCount = 0;
        p.weapons.pulseTrapSelected = false;
        p.respawn = 5;
        p.player.root.setEnabled(false);
        this.event({
          kind: "death",
          player: id,
          team: p.team,
          x: p.player.root.position.x,
          y: p.player.root.position.y,
          z: p.player.root.position.z,
        });
      }
      if (p.respawn > 0) {
        p.respawn = Math.max(0, p.respawn - dt);
        if (!p.respawn) {
          this.spawn(p);
          this.event({
            kind: "spawn",
            player: id,
            team: p.team,
            x: p.player.root.position.x,
            y: 0,
            z: p.player.root.position.z,
          });
        }
      }
      if (p.queue.length > 6 && Date.now() - p.lastInputDiagnostic > 5000) {
        p.lastInputDiagnostic = Date.now();
        console.warn(
          JSON.stringify({
            kind: "input_backlog",
            name: p.name,
            team: p.team,
            queue: p.queue.length,
            ack: p.ack,
            lastSeq: p.lastSeq,
            credit: p.inputCredit,
            dt,
          }),
        );
      }
      if (Date.now() - p.inputReportAt >= 5000) {
        const seconds = (Date.now() - p.inputReportAt) / 1000;
        console.info(
          JSON.stringify({
            kind: "input_flow",
            name: p.name,
            team: p.team,
            receivedPerSecond: Math.round(p.receivedInputs / seconds),
            processedPerSecond: Math.round(p.processedInputs / seconds),
            rejected: p.rejectedInputs,
            queue: p.queue.length,
            ack: p.ack,
            lastSeq: p.lastSeq,
          }),
        );
        p.inputReportAt = Date.now();
        p.receivedInputs = 0;
        p.processedInputs = 0;
        p.rejectedInputs = 0;
      }
      p.inputCredit = Math.min(0.5, p.inputCredit + dt);
      if (!p.connected || p.player.hp <= 0 || Date.now() - p.lastInput >= 300)
        p.queue = [];
      const batch = takeInputs(p.queue, p.inputCredit);
      p.processedInputs += batch.length;
      p.inputCredit = Math.max(0, p.inputCredit - batch.length * INPUT_STEP);
      const stepDt = dt / Math.max(1, batch.length);
      for (const queued of batch.length ? batch : [undefined]) {
        let input =
          Date.now() - p.lastInput < 300 && p.connected && p.player.hp > 0
            ? (queued ??
              (p.lastSeq >= 0
                ? { ...idle(), aimX: p.input.aimX, aimZ: p.input.aimZ }
                : p.input))
            : idle();
        const rcActor = {
          id,
          team: p.team,
          player: p.player,
          weapons: p.weapons,
          connected: p.connected,
        };
        const wasRemote = this.rc.controlling(id);
        const deploy =
          !wasRemote &&
          p.weapons.pulseTrapSelected &&
          p.weapons.utilityKind === "rcCar" &&
          input.pressed;
        this.rc.command(rcActor, input.rc, deploy);
        if (wasRemote || this.rc.controlling(id))
          input = {
            ...input,
            moveX: 0,
            moveZ: 0,
            fire: false,
            pressed: false,
            jump: false,
            interact: false,
            slot: 0,
            warcry: false,
          };
        p.weapons.remoteControlled = this.rc.controlling(id);
        if (input.warcry) p.weapons.activateWarcry();
        if (input.slot) p.weapons.switchSlot(input.slot);
        if (input.jump && p.player.grounded) {
          p.player.jump();
          this.event({
            kind: "jump",
            x: p.player.root.position.x,
            y: p.player.root.position.y,
            z: p.player.root.position.z,
          });
        }
        p.player.update(
          this.rc.controlling(id)
            ? { ...input, facingYaw: p.player.root.rotation.y }
            : input,
          p.lastSeq >= 0 ? (queued ? 1 / 30 : 0) : stepDt,
        );
        if (queued?.seq !== undefined) p.ack = queued.seq;
        if (p.player.landed)
          this.event({
            kind: "land",
            x: p.player.root.position.x,
            y: 0,
            z: p.player.root.position.z,
          });
        for (const mesh of p.player.bodyMeshes) mesh.computeWorldMatrix(true);
        const disarming = p.disarm.update(
          p.player,
          [...this.participants.values()]
            .map((p) => p.weapons)
            .concat(this.orphanWeapons),
          input.interact,
          input.fire,
          stepDt,
        );
        const actor = {
          id,
          team: p.team,
          player: p.player,
          connected: p.connected,
          weapons: p.weapons,
          pulseTrapSelected: p.weapons.pulseTrapSelected,
        };
        const placingTrap =
          p.weapons.utilityKind !== "rcCar" &&
          p.weapons.pulseTrapSelected &&
          (input.pressed || input.interact);
        if (placingTrap && !disarming) this.pickup.pulseTraps.place(actor);
        const placing =
          !placingTrap &&
          this.pickup.beacons.carried.has(id) &&
          (input.pressed || input.interact);
        if (placing && !disarming) this.pickup.beacons.place(actor);
        const placingBuster =
          !disarming && p.weapons.carryingCoreBuster && input.interact;
        const collected =
          !placing &&
          !placingTrap &&
          !placingBuster &&
          !disarming &&
          input.interact &&
          (this.pickup.pulseTraps.acquire(actor) ||
            this.pickup.beacons.acquire(actor));
        p.weapons.carryingBeacon = this.pickup.beacons.carried.has(id);
        p.shotTime = input.viewTime;
        p.weapons.update(
          disarming || placing || placingTrap
            ? { ...input, fire: false, pressed: false }
            : placingBuster
              ? { ...input, pressed: true }
              : input,
          stepDt,
        );
        this.pickup.chooseRequested =
          input.interact &&
          !disarming &&
          !collected &&
          !placing &&
          !placingTrap &&
          !placingBuster;
        this.pickup.update(0, this.time, p.weapons, () => {});
      }
      p.input.pressed = false;
      p.input.jump = false;
      p.input.interact = false;
      p.input.slot = 0;
      p.input.warcry = false;
    }
    this.rc.update(
      dt,
      [...this.participants].map(([id, p]) => ({
        id,
        team: p.team,
        player: p.player,
        weapons: p.weapons,
        connected: p.connected,
      })),
    );
    this.pickup.beacons.update(
      dt,
      [...this.participants].map(([id, p]) => ({
        id,
        team: p.team,
        player: p.player,
        connected: p.connected,
      })),
    );
    this.pickup.pulseTraps.update(
      dt,
      [...this.participants].map(([id, p]) => ({
        id,
        team: p.team,
        player: p.player,
        connected: p.connected,
        weapons: p.weapons,
      })),
    );
    for (const weapons of this.orphanWeapons) weapons.update(idle(), dt);
    this.orphanWeapons = this.orphanWeapons.filter((w) => {
      if (w.charges.length || w.rockets.length) return true;
      w.player.root.dispose();
      return false;
    });
    this.world.explosions.update(dt);
    const alive = this.cores.filter((core) => core.active && core.hp > 0);
    if (alive.length === 1) {
      this.winner = alive[0].team;
      this.rc.reset();
      for (const p of this.participants.values()) {
        p.weapons.remoteControlled = false;
        p.weapons.switchSlot(2);
      }
      if (this.winner) {
        this.wins[this.winner]++;
        this.ready.clear();
        if (this.wins[this.winner] >= 3) this.seriesWinner = this.winner;
      }
      console.info("match ended", this.roomId);
    }
  }
  rc!: RCCars;
  snapshot(): Snapshot {
    return {
      rcCars: this.rc.snapshot(),
      serverTime: Date.now(),
      placedMedkits: [...this.pickup.pulseTraps.medkits.values()].map((k) => ({
        ...k,
      })),
      pulseTraps: this.pickup.pulseTraps.snapshot(),
      pulseTrapDrops: this.pickup.pulseTraps.drops.map((d) => ({ ...d })),
      beacons: this.pickup.beacons.snapshot(),
      beaconDrops: this.pickup.beacons.drops.map((d) => ({ ...d })),
      owner: this.owner,
      players: [...this.participants].map(([id, p]) => ({
        id,
        rcRemote: this.rc.controlling(id),
        ack: p.ack,
        verticalVelocity: p.player.verticalVelocity,
        name: p.name,
        ...this.ledger.totals.get(id),
        kills: p.kills,
        disarm: p.disarm.target ? p.disarm.elapsed : undefined,
        team: p.team,
        x: p.player.root.position.x,
        y: p.player.root.position.y,
        z: p.player.root.position.z,
        yaw: p.player.root.rotation.y,
        hp: p.player.hp,
        beacon: this.pickup.beacons.carried.has(id),
        loadout: p.loadout,
        utilityKind: p.weapons.utilityKind,
        utilityCount: p.weapons.utilityCount,
        pulseTrap: p.weapons.carryingPulseTrap,
        pulseTrapSelected: p.weapons.pulseTrapSelected,
        weapon: p.weapons.id,
        special: p.weapons.specialWeapon,
        ammo: p.weapons.ammo,
        reserve: p.weapons.bazookaReserve,
        warcryAvailable: p.weapons.warcryAvailable,
        invulnerable: p.player.invulnerable,
        reload: p.weapons.reloadRemaining,
      })),
      cores: this.cores.map((core) => ({
        team: core.team!,
        hp: core.hp,
        active: core.active,
      })),
      props: this.world.destructibles.map((prop) => prop.hp),
      pickups: [
        ...this.pickup.healthDrops.map((p) => ({
          x: p.root.position.x,
          y: p.root.position.y,
          z: p.root.position.z,
          id: "pistol" as const,
          active: p.root.isEnabled(),
          type: p.type,
          dropped: false,
        })),
        ...this.pickup.ammoDrops.map((p) => ({
          x: p.root.position.x,
          y: p.root.position.y,
          z: p.root.position.z,
          id: p.id,
          active: p.root.isEnabled(),
          type: "ammo" as const,
          dropped: false,
        })),
        ...this.pickup.endpoints.map((p) => ({
          x: p.root.position.x,
          y: p.root.position.y,
          z: p.root.position.z,
          id: p.id,
          active: p.root.isEnabled(),
          type: "weapon" as const,
          dropped: !!p.dropped,
        })),
      ],
      bombs: [...this.participants.values()]
        .map((p) => p.weapons)
        .concat(this.orphanWeapons)
        .flatMap((w) =>
          w.charges.map((c) => ({
            owner: [...this.participants].find(([, p]) => p.weapons === w)?.[0],
            id: c.mesh.uniqueId,
            x: c.mesh.position.x,
            y: c.mesh.position.y,
            z: c.mesh.position.z,
            timer: c.timer,
          })),
        ),
      rockets: [...this.participants.values()]
        .map((p) => p.weapons)
        .concat(this.orphanWeapons)
        .flatMap((w) =>
          w.rockets.map((r) => ({
            owner: [...this.participants].find(([, p]) => p.weapons === w)?.[0],
            id: r.mesh.uniqueId,
            x: r.mesh.position.x,
            y: r.mesh.position.y,
            z: r.mesh.position.z,
          })),
        ),
      alarms: office01.bases
        .filter(
          (b) =>
            this.cores.some((c) => c.team === b.team && c.active && c.hp > 0) &&
            ((this.attackUntil.get(b.team) ?? 0) > this.time ||
              [...this.participants.values()].some(
                (p) =>
                  p.team !== b.team &&
                  p.player.hp > 0 &&
                  Math.abs(p.player.root.position.x - b.x) < 5.5 &&
                  Math.abs(p.player.root.position.z - b.z) < 5.5,
              )),
        )
        .map((b) => b.team),
      alarm: office01.bases.find(
        (b) =>
          this.cores.some((c) => c.team === b.team && c.active) &&
          [...this.participants.values()].some(
            (p) =>
              p.team !== b.team &&
              p.player.hp > 0 &&
              Math.abs(p.player.root.position.x - b.x) < 5.5 &&
              Math.abs(p.player.root.position.z - b.z) < 5.5,
          ),
      )?.team,
      countdown: this.countdownUntil
        ? Math.max(0, this.countdownUntil - this.time)
        : undefined,
      roundStats: [...this.participants].map(([id, p]) => ({
        id,
        name: p.name,
        team: p.team,
        ...(this.ledger.round.get(id) ?? emptyPerformance()),
      })),
      round: this.round,
      wins: { ...this.wins },
      ready: [...this.ready],
      seriesWinner: this.seriesWinner,
      started: this.started,
      preparing: this.preparing,
      winner: this.winner,
    };
  }
  tryNextRound() {
    if (!this.winner || this.seriesWinner || !this.participants.size) return;
    if (
      ![...this.participants].every(
        ([id, p]) => p.connected && this.ready.has(id),
      )
    )
      return;
    if (new Set([...this.participants.values()].map((p) => p.team)).size < 2)
      return;
    if (!this.countdownUntil) this.countdownUntil = this.time + 3;
  }
  completeNextRound() {
    this.ledger.resetRound();
    resetRound(
      this.world,
      this.cores,
      [...this.participants.values()]
        .map((p) => p.weapons)
        .concat(this.orphanWeapons),
      this.pickup,
    );
    for (const orphan of this.orphanWeapons) orphan.player.root.dispose();
    this.orphanWeapons = [];
    for (const p of this.participants.values()) {
      this.spawn(p);
      if (p.loadout) applyLoadout(p.weapons, p.loadout);
      if (p.awaitingLoadout) {
        p.player.hp = 0;
        p.player.root.setEnabled(false);
      }
      p.disarm.reset();
      this.rc.reset();
      p.respawn = 0;
      p.input = idle();
      p.queue = [];
    }
    this.attackUntil.clear();
    this.winner = undefined;
    this.round++;
    this.ready.clear();
    this.sendSnapshots();
  }
  async restartFinishedMatch() {
    if (!this.seriesWinner) return;
    this.completeNextRound();
    this.started = false;
    this.preparing = false;
    this.seriesWinner = undefined;
    this.winner = undefined;
    this.wins = { RED: 0, BLUE: 0 };
    this.round = 1;
    this.countdownUntil = 0;
    this.ready.clear();
    this.ledger.resetRound();
    this.ledger.totals.clear();
    for (const p of this.participants.values()) {
      p.kills = 0;
      p.loadout = undefined;
      p.awaitingLoadout = false;
    }
    this.refreshCores();
    this.sendSnapshots();
  }
  streamClients = new Map<string, number>();
  streamSender = new SnapshotSender();
  sendSnapshots(only?: Client) {
    this.metrics.frames++;
    const snapshot = { ...this.snapshot(), seq: ++this.frame };
    const stream = this.streamClients.size
      ? this.streamSender.encode(snapshot)
      : undefined;
    const encoded = new Map<
      Snapshot | undefined,
      ReturnType<typeof encodeSnapshot>
    >();
    for (const client of only ? [only] : this.clients) {
      if (this.streamClients.has(client.sessionId)) {
        client.send(
          MSG.snapshot,
          this.streamClients.get(client.sessionId) === stream!.base
            ? stream
            : this.streamSender.full(),
        );
        this.streamClients.set(client.sessionId, snapshot.seq);
      } else if (this.optimizedClients.has(client.sessionId)) {
        const baseline = this.optimizedClients.get(client.sessionId);
        let packet = encoded.get(baseline);
        if (!packet) {
          packet = encodeSnapshot(baseline, snapshot);
          encoded.set(baseline, packet);
        }
        client.send(MSG.snapshot, packet);
        this.optimizedClients.set(client.sessionId, snapshot);
      } else client.send(MSG.snapshot, snapshot);
    }
  }
  event(event: NetEvent) {
    this.broadcast(MSG.event, event);
  }
  async onLeave(client: Client, consented: boolean) {
    const p = this.participants.get(client.sessionId);
    if (!p) return;
    this.optimizedClients.delete(client.sessionId);
    this.streamClients.delete(client.sessionId);
    p.connected = false;
    this.rc.remove(client.sessionId);
    this.rc.watches.delete(client.sessionId);
    p.weapons.remoteControlled = false;
    p.input = idle();
    try {
      if (consented || p.idleExpired) throw new Error();
      await this.allowReconnection(client, 20);
      p.connected = true;
      this.startWhenEquipped();
      this.tryNextRound();
      this.sendSnapshots();
    } catch {
      p.weapons.dropCoreBuster();
      if (p.weapons.charges.length || p.weapons.rockets.length) {
        p.player.root.setEnabled(false);
        this.orphanWeapons.push(p.weapons);
      } else p.player.root.dispose();
      this.participants.delete(client.sessionId);
      this.ready.delete(client.sessionId);
      this.tryNextRound();
      if (this.owner === client.sessionId)
        this.owner = this.participants.keys().next().value ?? "";
      this.refreshCores();
      this.startWhenEquipped();
      this.sendSnapshots();
      if (this.hosted && this.started && this.participants.size === 0)
        await this.disconnect();
    }
    console.info("player disconnected", this.roomId);
  }
  onDispose() {
    OfficeRoom.measurements.delete(this.metrics);
    if (this.counted) OfficeRoom.active--;
    OfficeRoom.rooms.delete(this.roomId);
    this.scene?.dispose();
    this.engine?.dispose();
    console.info("room disposed", this.roomId);
  }
}
