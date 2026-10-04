import { predictionBlocked } from "./predictionWindow";
import { beam, flash as pooledFlash, releaseEffect } from "./effectPool";

import { Vector3, Ray, MeshBuilder, Quaternion } from "@babylonjs/core";

import { WEAPONS, type WeaponId } from "../config/weapons";

import { CONFIG, TEAMS, type Team } from "../config/game";

import { office01 } from "../maps/office01";
import { Player } from "../player/player";

import { heldWeapon, rocketModel } from "../weapons/models";

import { networkAim } from "../network/aim";
import { interpolateYaw } from "../network/interpolation";

import { type NetInput } from "../../shared/protocol";
import type { Game } from "./game";
type Context = Pick<
  Game,
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
export function tickOnline(this: Context, dt: number) {
  const net = this.multiplayer!,
    snapshot = net.snapshot;
  this.time += dt;
  if (this.predictedPosition) {
    this.player.root.position.copyFrom(this.predictedPosition);
    this.player.verticalVelocity = this.predictedVelocity;
  }
  this.networkElapsed += dt;
  const command = this.input.command(this.world, this.player.root.position);
  const rcInput = this.rc.control(command.pressed);
  if (this.rc.locked) {
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
  if (!this.rc.locked)
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
      this.weapons.reloadRemaining <= 0 &&
      !this.weapons.carryingBeacon &&
      !this.weapons.pulseTrapSelected &&
      !this.weapons.remoteControlled,
  );
  if (predictedShot) {
    this.player.recoil = 1;
    this.player.animate(!!(command.moveX || command.moveZ), 0);
    if (predictedShot.audio && this.sound)
      this.weaponAudio?.play(this.weapons.id);
    const start = this.player.shotOrigin;
    const direction = this.player.shotDirection(command, start);
    const muzzle = pooledFlash(this.scene, 0.23);
    muzzle.position.copyFrom(start);
    muzzle.material = this.world.mat("#ffe8a1", true);
    muzzle.isPickable = false;
    this.onlineTraces.push({ mesh: muzzle, life: 0.045 });
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
      const hit = this.scene.pickWithRay(
        ray,
        (mesh) =>
          mesh.isEnabled() &&
          !this.player.bodyMeshes.includes(
            mesh as import("@babylonjs/core").Mesh,
          ) &&
          (!!mesh.metadata?.solid || !!mesh.metadata?.damageable),
      );
      const end = hit?.pickedPoint ?? start.add(direction.scale(ray.length));
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
      moveX: this.paused ? 0 : command.moveX / length,
      moveZ: this.paused ? 0 : command.moveZ / length,
      fire: !this.paused && command.fire,
      pressed: !this.paused && this.onlinePressed,
      ...(this.rc.locked
        ? {
            moveX: 0,
            moveZ: 0,
            fire: false,
            pressed: false,
            jump: false,
            interact: false,
            warcry: false,
            slot: 0 as const,
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
      warcry: false,
      jump: false,
      interact: false,
      slot: 0,
    };
  }
  this.predictedPosition = this.player.root.position.clone();
  this.predictedVelocity = this.player.verticalVelocity;
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
      if (own && state.rcRemote) player.root.rotation.y = state.yaw;
      else if (own)
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
        this.weapons.bazookaReserve = state.reserve;
        this.weapons.reloadRemaining = state.reload;
      }
      steps.push({ id: state.id, x: state.x, z: state.z, moving });
    }
    this.pickup.beacons.sync(
      snapshot.beacons ?? [],
      snapshot.beaconDrops ?? [],
      snapshot.players.filter((p) => p.beacon).map((p) => p.id),
      snapshot.players.flatMap((p) => {
        const player =
          p.id === net.room?.sessionId
            ? this.player
            : this.onlinePlayers.get(p.id);
        return player
          ? [
              {
                id: p.id,
                team: p.team,
                player,
                pulseTrapSelected: p.pulseTrapSelected,
              },
            ]
          : [];
      }),
      dt,
    );
    this.pickup.pulseTraps.sync(
      snapshot.pulseTraps ?? [],
      snapshot.pulseTrapDrops ?? [],
      snapshot.players.flatMap((p) => {
        const player =
          p.id === net.room?.sessionId
            ? this.player
            : this.onlinePlayers.get(p.id);
        return player
          ? [
              {
                id: p.id,
                team: p.team,
                player,
                weapons: {
                  utilityKind: p.utilityKind ?? "pulseTrap",
                  utilityCount: p.utilityCount ?? (p.pulseTrap ? 1 : 0),
                  carryingPulseTrap: p.pulseTrap ?? false,
                  pulseTrapSelected: p.pulseTrapSelected ?? false,
                  carryingBeacon: p.beacon ?? false,
                  switchSlot: () => {},
                },
              },
            ]
          : [];
      }),
    );
    this.pickup.pulseTraps.syncMedkits(snapshot.placedMedkits ?? []);
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
      snapshot.bombs.map((b) => ({
        id: String(b.id),
        timer: b.timer,
        ...spatial(b),
      })),
    );
    const alarmTeams =
      snapshot.alarms ?? (snapshot.alarm ? [snapshot.alarm] : []);
    for (const core of snapshot.cores)
      if (
        core.active &&
        core.hp > 0 &&
        core.hp <= 350 &&
        !alarmTeams.includes(core.team)
      )
        alarmTeams.push(core.team);
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
    const timer =
      document.querySelector<HTMLElement>("#network-bomb-timer") ??
      document.createElement("div");
    timer.id = "network-bomb-timer";
    timer.style.cssText =
      "position:fixed;bottom:170px;left:50%;transform:translateX(-50%);color:#ffda61;background:#14252ee8;padding:12px 18px;border:1px solid #ffda61;border-radius:6px;font-size:20px;font-weight:bold;z-index:75;pointer-events:none";
    document.querySelector("#ui")!.append(timer);
    timer.replaceChildren();
    timer.hidden = !snapshot.bombs.length && this.pendingPlantAt === undefined;
    const ownBombs = snapshot.bombs.filter(
      (b) => b.owner === net.room?.sessionId,
    );
    if (
      ownBombs.length ||
      (this.pendingPlantAt !== undefined && this.time - this.pendingPlantAt > 1)
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
