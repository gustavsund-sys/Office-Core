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
import { TEAMS, type Team } from "../src/config/game";
import {
  MSG,
  validInput,
  type NetInput,
  type Snapshot,
  type NetEvent,
} from "../shared/protocol";
class ServerWorld extends World {
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
  screamed: boolean;
}
export class OfficeRoom extends Room {
  static active = 0;
  static rooms = new Map<string, OfficeRoom>();
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
  winner?: Team;
  owner = "";
  time = 0;
  onCreate(options: { hosted?: boolean } = {}) {
    this.hosted = options.hosted === true;
    if (this.hosted) this.autoDispose = false;
    if (OfficeRoom.active >= 1) throw new ServerError(503, "Server full");
    OfficeRoom.active++;
    this.counted = true;
    OfficeRoom.rooms.set(this.roomId, this);
    this.maxClients = Number(process.env.MAX_PLAYERS_PER_ROOM ?? 16);
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
    this.world.explosions.visuals = false;
    this.world.explosions.onBurst = (position, power, sound) =>
      this.event({
        kind: "explosion",
        x: position.x,
        y: position.y,
        z: position.z,
        power,
        sound,
      });
    this.onMessage(MSG.ping, (client, stamp) => {
      if (
        this.permit(client) &&
        typeof stamp === "number" &&
        Number.isFinite(stamp)
      )
        client.send(MSG.ping, stamp);
    });
    this.onMessage(MSG.input, (client, payload) => {
      const p = this.participants.get(client.sessionId);
      if (!p) return;
      const now = Date.now();
      if (now - p.window > 1000) {
        p.window = now;
        p.messages = 0;
      }
      if (++p.messages > 90) return;
      if (!validInput(payload)) return;
      if (payload.seq !== undefined) {
        if (payload.seq <= p.lastSeq || p.queue.length >= 12) return;
        p.lastSeq = payload.seq;
        if (this.started) p.queue.push(payload);
        else p.ack = payload.seq;
      }
      p.input = {
        ...payload,
        pressed: p.input.pressed || payload.pressed,
        jump: p.input.jump || payload.jump,
        interact: p.input.interact || payload.interact,
      };
      p.lastInput = now;
    });
    this.onMessage(MSG.profile, (client, name) => {
      if (
        !this.permit(client) ||
        this.started ||
        typeof name !== "string" ||
        name.length > 24
      )
        return;
      const p = this.participants.get(client.sessionId);
      if (p) p.name = name.trim() || "Player";
    });
    this.onMessage(MSG.team, (client, team) => {
      if (!this.permit(client)) return;
      const p = this.participants.get(client.sessionId);
      if (
        p &&
        !this.started &&
        typeof team === "string" &&
        Object.hasOwn(TEAMS, team)
      ) {
        p.team = team as Team;
        this.spawn(p);
        this.refreshCores();
      }
    });
    this.onMessage(MSG.start, (client) => {
      if (!this.permit(client)) return;
      if (
        client.sessionId !== this.owner ||
        this.started ||
        new Set([...this.participants.values()].map((p) => p.team)).size < 2
      )
        return;
      this.started = true;
      void this.lock();
      console.info("match started", this.roomId);
    });
    const rate = Math.max(
      10,
      Math.min(60, Number(process.env.SERVER_TICK_RATE ?? 30)),
    );
    this.setSimulationInterval(
      (dt) => this.tick(Math.min(dt / 1000, 0.1)),
      1000 / rate,
    );
    this.clock.setInterval(
      () => this.broadcast(MSG.snapshot, this.snapshot()),
      50,
    );
    console.info("room created", this.roomId);
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
  onJoin(
    client: Client,
    options: { name?: string; team?: Team },
    auth: { uid: string },
  ) {
    if ([...this.participants.values()].some((p) => p.uid === auth.uid))
      throw new ServerError(409, "Already in match");
    const player = new Player(this.world);
    const participant: Participant = {
      uid: auth.uid,
      name:
        typeof options.name === "string"
          ? options.name.trim().slice(0, 24) || "Player"
          : "Player",
      team: Object.hasOwn(TEAMS, options.team ?? "") ? options.team! : "RED",
      player,
      weapons: undefined!,
      input: idle(),
      queue: [],
      ack: -1,
      lastSeq: -1,
      lastInput: 0,
      window: 0,
      messages: 0,
      respawn: 0,
      connected: true,
      screamed: false,
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
      () => {},
      () => event("shot"),
    );
    participant.weapons.visuals = false;
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
      participant.screamed = false;
      event("buster");
    };
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
        if (this.started) {
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
    this.refreshCores();
    this.scene.render();
    client.send(MSG.snapshot, this.snapshot());
    console.info("player joined", this.roomId);
  }
  spawn(p: Participant) {
    const base = office01.bases.find((base) => base.team === p.team)!;
    p.player.root.position.set(base.x, 0, base.z - Math.sign(base.z) * 9);
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
  tick(dt: number) {
    this.time += dt;
    if (!this.started || this.winner) return;
    for (const [id, p] of this.participants) {
      if (p.player.hp <= 0 && p.respawn === 0) {
        p.weapons.dropCoreBuster();
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
      const queued = p.queue.shift();
      const input =
        Date.now() - p.lastInput < 300 && p.connected && p.player.hp > 0
          ? (queued ??
            (p.lastSeq >= 0
              ? { ...idle(), aimX: p.input.aimX, aimZ: p.input.aimZ }
              : p.input))
          : idle();
      if (
        p.weapons.carryingCoreBuster &&
        !p.screamed &&
        (input.moveX || input.moveZ)
      ) {
        p.screamed = true;
        this.event({
          kind: "scream",
          player: id,
          x: p.player.root.position.x,
          y: p.player.root.position.y,
          z: p.player.root.position.z,
        });
      }
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
      p.player.update(input, p.lastSeq >= 0 ? (queued ? 1 / 30 : 0) : dt);
      if (queued?.seq !== undefined) p.ack = queued.seq;
      if (p.player.landed)
        this.event({
          kind: "land",
          x: p.player.root.position.x,
          y: 0,
          z: p.player.root.position.z,
        });
      for (const mesh of p.player.bodyMeshes) mesh.computeWorldMatrix(true);
      p.weapons.update(input, dt);
      this.pickup.chooseRequested = input.interact;
      this.pickup.update(0, this.time, p.weapons, () => {});
      p.input.pressed = false;
      p.input.jump = false;
      p.input.interact = false;
      p.input.slot = 0;
    }
    for (const weapons of this.orphanWeapons) weapons.update(idle(), dt);
    this.orphanWeapons = this.orphanWeapons.filter((w) => {
      if (w.charges.length || w.rockets.length) return true;
      w.player.root.dispose();
      return false;
    });
    // Advance shared pickup timers once per server tick, with an off-map probe.
    for (const drop of this.pickup.ammoDrops)
      drop.cooldown = Math.max(0, drop.cooldown - dt);
    for (const slot of this.pickup.singleAmmoSlots) {
      const before = slot.cooldown;
      slot.cooldown = Math.max(0, before - dt);
      if (before > 0 && !slot.cooldown) {
        slot.selected = Math.floor(Math.random() * slot.drops.length);
        slot.drops.forEach((drop) => (drop.cooldown = 0));
      }
    }
    for (const pickup of this.pickup.endpoints)
      pickup.cooldown = Math.max(0, pickup.cooldown - dt);
    this.world.explosions.update(dt);
    const alive = this.cores.filter((core) => core.active && core.hp > 0);
    if (alive.length === 1) {
      this.winner = alive[0].team;
      console.info("match ended", this.roomId);
    }
  }
  snapshot(): Snapshot {
    return {
      owner: this.owner,
      players: [...this.participants].map(([id, p]) => ({
        id,
        ack: p.ack,
        verticalVelocity: p.player.verticalVelocity,
        name: p.name,
        team: p.team,
        x: p.player.root.position.x,
        y: p.player.root.position.y,
        z: p.player.root.position.z,
        yaw: p.player.root.rotation.y,
        hp: p.player.hp,
        weapon: p.weapons.id,
        special: p.weapons.specialWeapon,
        ammo: p.weapons.ammo,
        reserve: p.weapons.bazookaReserve,
        reload: p.weapons.reloadRemaining,
      })),
      cores: this.cores.map((core) => ({
        team: core.team!,
        hp: core.hp,
        active: core.active,
      })),
      props: this.world.destructibles.map((prop) => prop.hp),
      pickups: [
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
          active: p.cooldown === 0,
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
            [...this.participants.values()].some(
              (p) =>
                p.team !== b.team &&
                p.player.hp > 0 &&
                Math.abs(p.player.root.position.x - b.x) < 5.5 &&
                Math.abs(p.player.root.position.z - b.z) < 5.5,
            ),
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
      started: this.started,
      winner: this.winner,
    };
  }
  event(event: NetEvent) {
    this.broadcast(MSG.event, event);
  }
  async onLeave(client: Client, consented: boolean) {
    const p = this.participants.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    p.input = idle();
    try {
      if (consented) throw new Error();
      await this.allowReconnection(client, 20);
      p.connected = true;
    } catch {
      p.weapons.dropCoreBuster();
      if (p.weapons.charges.length || p.weapons.rockets.length) {
        p.player.root.setEnabled(false);
        this.orphanWeapons.push(p.weapons);
      } else p.player.root.dispose();
      this.participants.delete(client.sessionId);
      if (this.owner === client.sessionId)
        this.owner = this.participants.keys().next().value ?? "";
      this.refreshCores();
      if (this.hosted && this.started && this.participants.size === 0)
        await this.disconnect();
    }
    console.info("player disconnected", this.roomId);
  }
  onDispose() {
    if (this.counted) OfficeRoom.active--;
    OfficeRoom.rooms.delete(this.roomId);
    this.scene?.dispose();
    this.engine?.dispose();
    console.info("room disposed", this.roomId);
  }
}
