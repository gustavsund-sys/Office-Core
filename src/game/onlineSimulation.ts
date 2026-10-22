import { updateBombCountdowns } from "../ui/bombCountdowns";
import { predictionBlocked } from "./predictionWindow";
import { shotTraceEnd } from "./shotTrace";
import { beam, flash as pooledFlash, releaseEffect } from "./effectPool";

import { Vector3, Ray, MeshBuilder, Quaternion } from "@babylonjs/core";

import { WEAPONS, type WeaponId } from "../config/weapons";

import { CONFIG, TEAMS, type Team } from "../config/game";

import { office01 } from "../maps/office01";
import { Player } from "../player/player";

import { heldWeapon, rocketModel } from "../weapons/models";

import { networkAim } from "../network/aim";
import { interpolateYaw } from "../network/interpolation";

import type { BeaconActor } from "./beacon";
import type { TrapActor } from "./pulseTrap";
import { type Snapshot, type NetInput } from "../../shared/protocol";
import type { Game } from "./game";
type Context = Pick<
  Game,
  | "boss"
  | "beaconAudio"
  | "cores"
  | "hud"
  | "debug"
  | "engine"
  | "lastPositionCorrection"
  | "input"
  | "inputSequence"
  | "isCarpet"
  | "rc"
  | "multiplayer"
  | "networkElapsed"
  | "onlineInput"
  | "onlineModels"
  | "onlineObjects"
  | "onlinePlayers"
  | "onlinePressed"
  | "onlineTraces"
  | "paused"
  | "pendingInputs"
  | "pendingPlantAt"
  | "pickup"
  | "player"
  | "predictedPosition"
  | "predictedRockets"
  | "predictedStamina"
  | "predictedExhausted"
  | "predictedKnockbackX"
  | "predictedKnockbackZ"
  | "predictedVelocity"
  | "pulseTrapAudio"
  | "scene"
  | "shotPrediction"
  | "sound"
  | "time"
  | "updateBeaconPrompt"
  | "updateCamera"
  | "updateDamageNumbers"
  | "updateDisarm"
  | "updateEngagement"
  | "updateHitHealthBars"
  | "visualCorrection"
  | "weaponAudio"
  | "weapons"
  | "world"
>;
type VisualFrame = {
  snapshot: Snapshot;
  carriers: string[];
  beaconActors: BeaconActor[];
  trapActors: TrapActor[];
  objects: {
    key: string;
    weapon: WeaponId;
    owner?: string;
    x: number;
    y: number;
    z: number;
    target: Vector3;
  }[];
  objectKeys: Set<string>;
  ownBombs: Snapshot["bombs"];
  bombCountdowns: { timer: number; label: string }[];
  pendingCountdowns: { timer: number; label: string }[];
  alarmTeams: Team[];
};
type VisualContext = Pick<
  Context,
  "multiplayer" | "player" | "onlinePlayers" | "pickup"
>;
const visualFrames = new WeakMap<VisualContext, VisualFrame>();
function prepareVisualFrame(
  game: VisualContext,
  snapshot: Snapshot,
): VisualFrame {
  const beaconActors: BeaconActor[] = [];
  const trapActors: TrapActor[] = [];
  const carriers: string[] = [];
  for (const p of snapshot.players) {
    if (p.beacon) carriers.push(p.id);
    const player =
      p.id === game.multiplayer?.room?.sessionId
        ? game.player
        : game.onlinePlayers.get(p.id);
    if (!player) continue;
    const actor = {
      id: p.id,
      team: p.team,
      player,
      pulseTrapSelected: p.pulseTrapSelected,
    };
    beaconActors.push(actor);
    trapActors.push({
      ...actor,
      weapons: {
        utilityKind: p.utilityKind ?? "pulseTrap",
        utilityCount: p.utilityCount ?? (p.pulseTrap ? 1 : 0),
        carryingPulseTrap: p.pulseTrap ?? false,
        pulseTrapSelected: p.pulseTrapSelected ?? false,
        carryingBeacon: p.beacon ?? false,
        switchSlot: () => {},
      },
    });
  }
  const objects: VisualFrame["objects"] = [];
  for (const b of snapshot.bombs)
    objects.push({
      ...b,
      key: `bomb:${b.id}`,
      weapon: "coreBuster",
      target: new Vector3(b.x, b.y, b.z),
    });
  for (const r of snapshot.rockets)
    objects.push({
      ...r,
      key: `rocket:${r.id}`,
      weapon: "bazooka",
      target: new Vector3(r.x, r.y, r.z),
    });
  for (const p of snapshot.pickups)
    if (p.dropped && p.active)
      objects.push({
        ...p,
        key: `drop:${p.x}:${p.z}`,
        weapon: "coreBuster",
        target: new Vector3(p.x, p.y, p.z),
      });
  const ownBombs = snapshot.bombs.filter(
    (b) => b.owner === game.multiplayer?.room?.sessionId,
  );
  const bombCountdowns = (ownBombs.length ? ownBombs : snapshot.bombs).map(
    (b) => ({
      timer: b.timer,
      label:
        b.owner === game.multiplayer?.room?.sessionId
          ? "DIN CORE BUSTER"
          : "CORE BUSTER",
    }),
  );
  const alarmTeams = [
    ...(snapshot.alarms ?? (snapshot.alarm ? [snapshot.alarm] : [])),
  ];
  for (const core of snapshot.cores)
    if (
      core.active &&
      core.hp > 0 &&
      core.hp <= 350 &&
      !alarmTeams.includes(core.team)
    )
      alarmTeams.push(core.team);
  return {
    snapshot,
    ownBombs,
    bombCountdowns,
    pendingCountdowns: [
      { timer: 25, label: "DIN CORE BUSTER" },
      ...bombCountdowns,
    ],
    alarmTeams,
    carriers,
    beaconActors,
    trapActors,
    objects,
    objectKeys: new Set(objects.map((o) => o.key)),
  };
}
export function syncOnlineVisuals(
  game: VisualContext,
  snapshot: Snapshot,
  dt: number,
) {
  let visuals = visualFrames.get(game);
  const newVisualFrame = visuals?.snapshot !== snapshot;
  if (newVisualFrame) {
    visuals = prepareVisualFrame(game, snapshot);
    visualFrames.set(game, visuals);
    game.pickup.beacons.sync(
      snapshot.beacons ?? [],
      snapshot.beaconDrops ?? [],
      visuals.carriers,
      visuals.beaconActors,
      dt,
    );
    game.pickup.pulseTraps.sync(
      snapshot.pulseTraps ?? [],
      snapshot.pulseTrapDrops ?? [],
      visuals.trapActors,
    );
    game.pickup.pulseTraps.syncMedkits(snapshot.placedMedkits ?? []);
  } else {
    game.pickup.beacons.render(visuals!.beaconActors, dt);
    game.pickup.pulseTraps.render(visuals!.trapActors);
  }
  return { visuals: visuals!, newVisualFrame };
}
export function tickOnline(this: Context, dt: number) {
  this.weapons.advanceReloads(dt, false);
  const net = this.multiplayer!,
    snapshot = net.snapshot;
  this.time += dt;
  if (this.predictedPosition) {
    this.player.root.position.copyFrom(this.predictedPosition);
    this.player.stamina = this.predictedStamina;
    this.player.sprintExhausted = this.predictedExhausted;
    this.player.verticalVelocity = this.predictedVelocity;
    this.player.knockbackX = this.predictedKnockbackX;
    this.player.knockbackZ = this.predictedKnockbackZ;
  }
  this.networkElapsed += dt;
  const command = this.input.command(this.world, this.player.root.position);
  const rcInput = this.rc.control(command.pressed, dt);
  if (this.rc.locked || this.boss?.active || this.boss?.selected) {
    command.moveX = 0;
    command.moveZ = 0;
    command.fire = false;
  }
  this.onlinePressed ||= command.pressed;
  if (
    command.pressed &&
    !this.paused &&
    this.weapons.carryingCoreBuster &&
    !this.weapons.carryingBeacon &&
    !this.weapons.pulseTrapSelected &&
    this.player.grounded
  )
    this.pendingPlantAt = this.time;
  if (!this.rc.locked && !this.boss?.active) this.player.faceAim(command);
  if (
    command.pressed &&
    snapshot?.started &&
    net.connected &&
    !this.paused &&
    this.player.hp > 0 &&
    this.weapons.ammo <= 0 &&
    this.weapons.reserve <= 0 &&
    this.weapons.reloadRemaining <= 0 &&
    !this.weapons.carryingCoreBuster &&
    !this.weapons.carryingBeacon &&
    !this.weapons.pulseTrapSelected &&
    !this.weapons.remoteControlled &&
    this.sound
  )
    this.weaponAudio?.playEmpty();
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
      this.weapons.reloadRemaining <= 0 &&
      !this.weapons.carryingBeacon &&
      !this.weapons.pulseTrapSelected &&
      !this.weapons.remoteControlled &&
      !this.boss?.active,
  );
  if (predictedShot) {
    this.player.recoil = 1;
    this.player.animate(!!(command.moveX || command.moveZ), 0);
    if (predictedShot.audio && this.sound)
      this.weaponAudio?.play(this.weapons.id);
    const start = this.player.shotOrigin;
    const direction = this.player.shotDirection(command, start);
    if (this.weapons.id === "huntingRifle") this.player.kickBack(direction);
    if (!this.world.explosions.muzzle(start, this.weapons.id === "pulseGun")) {
      const muzzle = pooledFlash(this.scene, 0.23);
      muzzle.position.copyFrom(start);
      muzzle.material = this.world.mat("#ffe8a1", true);
      muzzle.isPickable = false;
      this.onlineTraces.push({ mesh: muzzle, life: 0.045 });
    }
    if (this.weapons.id === "bazooka") {
      const mesh = rocketModel(this.world);
      const origin = start.clone();
      mesh.position.copyFrom(origin);
      mesh.isPickable = false;
      this.predictedRockets.push({
        mesh,
        start: origin,
        direction: direction.clone(),
        age: 0,
      });
    }
    if (this.weapons.id !== "bazooka") {
      const ray = new Ray(start, direction, WEAPONS[this.weapons.id].range);
      const end = shotTraceEnd(
        this.scene,
        ray,
        this.player,
        this.onlinePlayers.values(),
      );
      const tracer = beam(
        this.scene,
        start,
        end,
        this.weapons.id === "pulseGun" ? 0.14 : 0.025,
      );
      tracer.material = this.world.mat(
        this.weapons.id === "pulseGun" ? "#ff263e" : "#ffe4a5",
        true,
      );
      tracer.isPickable = false;
      this.onlineTraces.push({ mesh: tracer, life: 0.065 });
    }
  }
  this.networkElapsed = Math.min(this.networkElapsed, 0.1);
  while (this.networkElapsed >= 1 / 30) {
    this.networkElapsed -= 1 / 30;
    // Keep all unacknowledged steps. Hold edges until a slot becomes available.
    if (predictionBlocked(this.pendingInputs)) continue;
    const length = Math.max(1, Math.hypot(command.moveX, command.moveZ));
    const input: NetInput = {
      rc: rcInput
        ? {
            ...rcInput,
            yaw: Math.atan2(Math.sin(rcInput.yaw), Math.cos(rcInput.yaw)),
            detonate: this.onlinePressed,
          }
        : undefined,
      viewTime: net.timing.renderTime(performance.now()),
      seq: this.inputSequence++,
      ...networkAim(
        this.player.root.position.x,
        this.player.root.position.z,
        command.aimX,
        command.aimZ,
      ),
      ...this.onlineInput,
      scoped: !!command.scoped,
      aimY:
        command.aimY === undefined
          ? undefined
          : this.player.root.position.y +
            1.1 +
            (command.aimY - this.player.root.position.y - 1.1) *
              Math.min(
                1,
                100 /
                  Math.max(
                    1,
                    Math.hypot(
                      command.aimX - this.player.root.position.x,
                      command.aimZ - this.player.root.position.z,
                    ),
                  ),
              ),
      moveX: this.paused ? 0 : command.moveX / length,
      moveZ: this.paused ? 0 : command.moveZ / length,
      sprint: !this.paused && !this.rc.locked && command.sprint,
      fire: !this.paused && command.fire,
      pressed: !this.paused && this.onlinePressed,
      ...(this.rc.locked || this.boss?.active
        ? {
            moveX: 0,
            moveZ: 0,
            fire: false,
            pressed: false,
            jump: false,
            interact: false,
            warcry: false,
            slot: 0 as const,
            reload: false,
          }
        : {}),
    };
    net.send(input);
    if (
      snapshot?.started &&
      !snapshot.winner &&
      !this.paused &&
      this.player.hp > 0 &&
      net.connected
    ) {
      this.pendingInputs.push(input);
      if (input.jump) this.player.jump();
      this.player.simulate(input, 1 / 30);
    }
    this.onlinePressed = false;
    this.onlineInput = {
      useMedkit: false,
      reload: false,
      warcry: false,
      jump: false,
      interact: false,
      slot: 0,
    };
  }
  this.predictedPosition = this.player.root.position.clone();
  this.predictedStamina = this.player.stamina;
  this.predictedExhausted = this.player.sprintExhausted;
  this.predictedVelocity = this.player.verticalVelocity;
  this.predictedKnockbackX = this.player.knockbackX;
  this.predictedKnockbackZ = this.player.knockbackZ;
  if (
    snapshot?.started &&
    !this.paused &&
    this.player.hp > 0 &&
    net.connected
  ) {
    if (!predictionBlocked(this.pendingInputs) && !this.rc.locked)
      this.player.simulate(command, this.networkElapsed);
    this.player.animate(
      !this.rc.locked &&
        !predictionBlocked(this.pendingInputs) &&
        !!(command.moveX || command.moveZ),
      dt,
    );
  }
  if (snapshot) {
    const newSnapshot = visualFrames.get(this)?.snapshot !== snapshot;
    if (newSnapshot)
      for (const [id, player] of this.onlinePlayers)
        if (!snapshot.players.some((p) => p.id === id)) {
          player.root.dispose();
          this.onlinePlayers.delete(id);
          this.onlineModels.delete(id);
        }
    const steps: { id: string; x: number; z: number; moving: boolean }[] = [];
    const renderAt = net.timing.renderTime(performance.now());
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
      player.bossLookoutActive = !!state.lookout;
      if (!own) {
        player.crouched = !!state.lookout?.crouched;
        player.root.scaling.y = player.crouched ? 0.48 : 1;
        player.gun.setEnabled(!state.lookout);
      }
      player.shield = state.shield ?? 0;
      player.medkit = state.medkit ?? false;
      if (!own) {
        player.sprinting = state.sprinting ?? false;
        player.sprintExhausted = state.sprintExhausted ?? false;
        player.verticalVelocity = state.verticalVelocity;
        player.reloadPose = state.reload;
      }
      player.showTacticalShield();
      player.invulnerable = state.invulnerable ?? 0;
      player.setBarrier(player.invulnerable > 0 && player.hp > 0);
      const target = new Vector3(state.x, state.y, state.z);
      const moving = Vector3.Distance(player.root.position, target) > 0.002;
      if (!own)
        player.root.position.copyFrom(
          Vector3.Lerp(
            player.root.position,
            target,
            Vector3.Distance(player.root.position, target) > 8 ? 1 : 1,
          ),
        );
      if (own && (state.rcRemote || state.lookout))
        player.root.rotation.y = state.yaw;
      else if (own) player.faceAim(command);
      else {
        player.root.rotation.y = state.yaw;
        player.animate(moving, dt);
      }
      if (newSnapshot)
        player.torso.material = this.world.mat(TEAMS[state.team]);
      if (this.onlineModels.get(state.id) !== state.weapon) {
        player.setWeaponModel(state.weapon);
        this.onlineModels.set(state.id, state.weapon);
        if (own && !state.rcRemote && !state.lookout) player.faceAim(command);
      }
      if (!own) {
        player.gun.rotation.x = state.gunPitch ?? 0;
        player.scoped = state.scoped ?? false;
      }
      if (own && newSnapshot) {
        this.weapons.remoteControlled = state.rcRemote ?? false;
        this.weapons.carryingBeacon = state.beacon ?? false;
        this.weapons.utilityKind = state.utilityKind ?? "pulseTrap";
        this.weapons.utilityCount =
          state.utilityCount ?? (state.pulseTrap ? 1 : 0);
        this.weapons.pulseTrapSelected = state.pulseTrapSelected ?? false;
        this.weapons.id = state.weapon;
        this.weapons.warcryAvailable = state.warcryAvailable ?? false;
        this.weapons.specialWeapon = state.special;
        this.weapons.ammo = state.ammo;
        this.weapons.reserve = state.reserve;
        this.weapons.syncReload(
          state.reload,
          state.reloadDuration ?? 1,
          state.reloadKind ?? "magazine",
        );
      }
      steps.push({ id: state.id, x: state.x, z: state.z, moving });
    }
    const { visuals, newVisualFrame } = syncOnlineVisuals(this, snapshot, dt);
    this.pickup.pulseTraps.animate(
      this.pulseTrapAudio.update(
        this.paused ? 0 : dt,
        this.sound && !this.paused && !!snapshot.started && !snapshot.winner,
        this.player.root.position,
        snapshot.pulseTraps ?? [],
      ),
    );
    this.beaconAudio.update(
      dt,
      this.sound && !this.paused,
      this.player.root.position,
      snapshot.beacons ?? [],
    );
    this.weaponAudio?.updateFootsteps(
      steps,
      this.player.root.position,
      this.sound && !this.paused,
      (x, z) => this.isCarpet(x, z),
    );
    const objects = visuals.objects;
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
        const delta = object.target.subtract(mesh.position);
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
      const target = object.target;
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
    if (newVisualFrame)
      for (const [key, mesh] of this.onlineObjects)
        if (!visuals.objectKeys.has(key)) {
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
      snapshot.bombs.map((b) => ({
        id: String(b.id),
        timer: b.timer,
        ...spatial(b),
      })),
    );
    const alarmTeams = visuals.alarmTeams;
    const ownAlarm = alarmTeams.includes(CONFIG.player.team as Team)
      ? (CONFIG.player.team as Team)
      : alarmTeams[0];
    const endangered = snapshot.cores.find((c) => c.team === ownAlarm);
    const urgency = endangered ? Math.max(0, 1 - endangered.hp / 350) : 0;
    this.world.updateAlarm(ownAlarm, this.time, urgency);
    this.weaponAudio?.setCoreAlarms(
      !this.paused && this.sound
        ? alarmTeams.map((team) => {
            const base = office01.bases.find((b) => b.team === team)!;
            return {
              id: team,
              urgency: Math.max(
                0,
                1 -
                  (snapshot.cores.find((c) => c.team === team)?.hp ?? 1000) /
                    350,
              ),
              ...spatial(base),
            };
          })
        : [],
    );
    let timer = document.querySelector<HTMLElement>("#network-bomb-timer");
    if (!timer) {
      timer = document.createElement("div");
      timer.id = "network-bomb-timer";
      timer.style.cssText =
        "position:fixed;bottom:170px;left:50%;transform:translateX(-50%);color:#ffda61;background:#14252ee8;padding:12px 18px;border:1px solid #ffda61;border-radius:6px;font-size:20px;font-weight:bold;z-index:75;pointer-events:none";
      document.querySelector("#ui")!.append(timer);
    }
    const ownBombs = visuals.ownBombs;
    if (
      ownBombs.length ||
      (this.pendingPlantAt !== undefined && this.time - this.pendingPlantAt > 1)
    )
      this.pendingPlantAt = undefined;
    if (this.pendingPlantAt !== undefined)
      visuals.pendingCountdowns[0].timer =
        25 - (this.time - this.pendingPlantAt);
    updateBombCountdowns(
      timer,
      this.pendingPlantAt !== undefined
        ? visuals.pendingCountdowns
        : visuals.bombCountdowns,
    );
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
    releaseEffect(trace.mesh);
    return false;
  });
  this.pickup.ammoDrops.forEach((drop) => (drop.sign.rotation.y += dt * 1.1));
  this.pickup.endpoints.forEach((drop) => (drop.root.rotation.y += dt));
  this.visualCorrection.scaleInPlace(Math.exp(-dt * 14));
  const simulationPosition = this.player.root.position.clone();
  this.player.root.position.addInPlace(this.visualCorrection);
  this.rc.render(
    dt,
    snapshot?.rcCars ?? [],
    net.room!.sessionId,
    (snapshot?.players ?? []).flatMap((p) => {
      const player =
        p.id === net.room!.sessionId
          ? this.player
          : this.onlinePlayers.get(p.id);
      return player ? [{ player, remote: p.rcRemote ?? false }] : [];
    }),
    this.sound && !this.paused,
    this.player.hp > 0,
  );
  this.updateCamera(dt);
  this.world.explosions.update(dt);
  this.world.blood.update(dt);
  this.cores.forEach((core) => core.update(dt, this.time));
  this.world.destructibles.forEach((prop) => prop.update(dt));
  if (snapshot) {
    this.hud.scoreboard(snapshot.players);
    const self = snapshot.players.find(
      (p) => p.id === this.multiplayer?.room?.sessionId,
    );
    this.updateDisarm(self?.disarm);
    const threat = snapshot.bombs.flatMap((b) =>
      office01.bases.filter(
        (core) => Math.hypot(b.x - core.x, b.z - core.z) <= 5,
      ),
    )[0];
    if (threat) this.hud.plantedWarning(threat.team);
    else if (snapshot.alarms?.length)
      this.hud.breachWarning(snapshot.alarms[0]);
  }
  this.updateBeaconPrompt();
  this.updateEngagement(dt);
  this.hud.update(dt, this.cores, this.weapons, this.player);
  this.boss?.decorateHud();
  net.reportMotion(
    this.engine.getFps(),
    this.pendingInputs.length,
    this.lastPositionCorrection,
    this.engine.getDeltaTime(),
    this.engine.isWebGPU ? "WebGPUEngine" : "Engine",
  );
  this.debug.update(
    this.engine.getFps(),
    this.player,
    this.weapons,
    this.pickup,
    this.cores,
    {
      sentRate: net.sentRate,
      ackAge: net.ackAge,
      snapshotAge: net.lastSnapshotAt
        ? performance.now() - net.lastSnapshotAt
        : 0,
      ping: net.rtt,
      jitter: net.timing.jitter,
      buffer: net.timing.delay,
      pending: this.pendingInputs.length,
      correction: this.lastPositionCorrection,
    },
  );
  this.scene.render();
  this.player.root.position.copyFrom(simulationPosition);
}
