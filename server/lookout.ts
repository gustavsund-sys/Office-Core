import {
  earnLookoutKill,
  exhaustLookout,
  lookoutTeam,
  loseLookoutOnDeath,
} from "../src/game/lookoutReward";
import { Ray, Vector3 } from "@babylonjs/core";
import type { World } from "../src/map/builder";
import type { Player } from "../src/player/player";
import type { Weapons } from "../src/weapons/system";
import type { Team } from "../src/config/game";
import type { Hittable } from "../src/core/hittable";
import type { NetLookout, NetEvent } from "../shared/protocol";
import { LOOKOUT, lookoutPose } from "../src/game/lookoutConfig";
import { buildLookoutRoom } from "../src/game/bossLookoutRoom";
import { TURRET_MUZZLE } from "../src/game/bossTurretModel";
export interface LookoutActor {
  player: Player;
  weapons: Weapons;
  team: Team;
  connected: boolean;
}
type Pilot = NetLookout & { fire: boolean; cooldown: number; received: number };
/** Server owns rewards, occupancy, aim limits, ammunition and all damage. */
export class ServerLookout {
  pilots = new Map<string, Pilot>();
  private rigs;
  private clock = 0;
  private impacts: {
    remaining: number;
    target: Hittable;
    actor: LookoutActor;
    origin: Vector3;
  }[] = [];
  constructor(
    private world: World,
    private event: (e: NetEvent) => void,
  ) {
    this.rigs = new Map(
      [-1, 1].map((side) => [
        side,
        buildLookoutRoom(world, side, LOOKOUT.height),
      ]),
    );
  }
  reset(actors: Map<string, LookoutActor>, preserveProgress = false) {
    for (const [id, actor] of actors) {
      loseLookoutOnDeath(actor.player, actor.player.hp);
      this.exit(id, actor);
      if (!preserveProgress) {
        actor.player.bossLookoutKey = false;
        actor.player.bossLookoutKills = 0;
        actor.player.bossLookoutAmmo = 100;
      }
    }
    this.pilots.clear();
    this.impacts = [];
  }
  exit(id: string, actor: LookoutActor) {
    const pilot = this.pilots.get(id);
    if (!pilot) return;
    actor.player.bossLookoutAmmo = actor.player.bossLookoutKey ? pilot.ammo : 0;
    if (pilot.ammo <= 0) exhaustLookout(actor.player);
    this.pilots.delete(id);
    actor.player.bossLookoutActive = false;
    actor.player.crouched = false;
    actor.player.root.scaling.y = 1;
    actor.player.gun.setEnabled(true);
    actor.player.root.position.copyFrom(
      lookoutPose(pilot.side).door.add(new Vector3(0, 0, -2)),
    );
    actor.player.verticalVelocity = 0;
    actor.player.knockbackX = actor.player.knockbackZ = 0;
  }
  command(id: string, actor: LookoutActor, data: unknown, rcActive: boolean) {
    if (
      !data ||
      typeof data !== "object" ||
      !actor.connected ||
      actor.player.hp <= 0 ||
      rcActive
    )
      return;
    const value = data as Record<string, unknown>;
    const pilot = this.pilots.get(id);
    if (value.action === "exit") {
      this.exit(id, actor);
      return;
    }
    if (value.action === "aim" && pilot) {
      if (
        typeof value.yaw !== "number" ||
        !Number.isFinite(value.yaw) ||
        typeof value.pitch !== "number" ||
        !Number.isFinite(value.pitch) ||
        typeof value.fire !== "boolean" ||
        typeof value.crouched !== "boolean"
      )
        return;
      const center = lookoutPose(pilot.side).yaw;
      pilot.yaw = Math.max(center - 1.2, Math.min(center + 1.2, value.yaw));
      pilot.pitch = Math.max(-1.3, Math.min(1.53, value.pitch));
      pilot.fire = value.fire;
      pilot.crouched = value.crouched;
      pilot.received = this.clock;
      return;
    }
    if (value.action !== "interact" || pilot) return;
    const player = actor.player;
    for (const side of [-1, 1]) {
      if (Vector3.Distance(player.root.position, lookoutPose(side).door) >= 3.5)
        continue;
      if (lookoutTeam(side) !== actor.team)
        return "This Boss Lookout belongs to the other team. Use your own team's lift.";
      if ([...this.pilots.values()].some((p) => p.side === side))
        return "Boss Lookout is occupied. Wait for your teammate to leave.";
      if (!player.bossLookoutKey)
        return "Boss Key required · Get 10 enemy kills to unlock.";
      player.bossLookoutActive = true;
      player.verticalVelocity = 0;
      player.root.position.copyFrom(
        lookoutPose(side).station.add(
          new Vector3(-side * LOOKOUT.eyeOffset, 0, 0),
        ),
      );
      this.pilots.set(id, {
        side,
        ammo: player.bossLookoutAmmo ?? LOOKOUT.shots,
        yaw: lookoutPose(side).yaw,
        pitch: 0.24,
        crouched: false,
        fire: false,
        cooldown: 0,
        received: this.clock,
      });
      return;
    }
  }
  recordKill(id: string, actor: LookoutActor, victim: Team) {
    if (earnLookoutKill(actor.player, actor.team, victim))
      this.event({
        kind: "lookoutNotice",
        player: id,
        x: 0,
        y: 0,
        z: 0,
        message:
          "BOSS KEY UNLOCKED! · 10 enemy kills · Use your team's lift · 100 turret rounds",
      });
  }
  snapshot(id: string): NetLookout | undefined {
    const p = this.pilots.get(id);
    return p
      ? {
          side: p.side,
          ammo: p.ammo,
          yaw: p.yaw,
          pitch: p.pitch,
          crouched: p.crouched,
        }
      : undefined;
  }
  update(dt: number, actors: Map<string, LookoutActor>) {
    this.clock += dt;
    for (const actor of actors.values())
      loseLookoutOnDeath(actor.player, actor.player.hp);
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const hit = this.impacts[i];
      hit.remaining -= dt;
      if (hit.remaining > 0) continue;
      this.impacts.splice(i, 1);
      if (hit.target.hp <= 0 || !hit.target.canDamageFrom(hit.origin)) continue;
      const before = hit.target.hp;
      hit.target.damage(LOOKOUT.damage);
      if (hit.target.hp < before)
        hit.actor.weapons.onHit(
          hit.target,
          before - hit.target.hp,
          "machineGun",
        );
    }
    for (const [id, p] of this.pilots) {
      const actor = actors.get(id);
      if (!actor) {
        this.pilots.delete(id);
        continue;
      }
      if (!actor.connected || actor.player.hp <= 0 || p.ammo <= 0) {
        if (p.ammo <= 0)
          this.event({
            kind: "lookoutNotice",
            player: id,
            x: 0,
            y: 0,
            z: 0,
            message:
              "Turret empty · Boss Key expired · Get 10 enemy kills for a new key",
          });
        this.exit(id, actor);
        continue;
      }
      const player = actor.player;
      player.root.rotation.y = p.yaw;
      player.crouched = p.crouched;
      player.root.scaling.y = p.crouched ? 0.48 : 1;
      player.gun.setEnabled(false);
      player.root.computeWorldMatrix(true);
      for (const mesh of player.bodyMeshes) mesh.computeWorldMatrix(true);
      const rig = this.rigs.get(p.side)!;
      rig.yaw.rotation.y = p.yaw;
      rig.pitch.rotation.x = p.pitch;
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (
        !p.fire ||
        p.crouched ||
        this.clock - p.received > 0.3 ||
        p.cooldown > 0
      )
        continue;
      p.cooldown = LOOKOUT.interval;
      p.ammo--;
      const origin = player.root.position.add(
        new Vector3(0, LOOKOUT.eyeHeight, 0),
      );
      const direction = new Vector3(
        Math.sin(p.yaw) * Math.cos(p.pitch),
        -Math.sin(p.pitch),
        Math.cos(p.yaw) * Math.cos(p.pitch),
      );
      const ray = new Ray(origin, direction, LOOKOUT.range);
      const picked = this.world.scene.pickWithRay(
        ray,
        (m) =>
          m.isEnabled() &&
          (m.isPickable ||
            /^(walkable floor|corridor runner|room carpet|base carpet)$/.test(
              m.name,
            )) &&
          !player.bodyMeshes.includes(m as never),
      );
      let end =
        picked?.hit && picked.pickedPoint
          ? picked.pickedPoint
          : origin.add(direction.scale(LOOKOUT.range));
      const target = picked?.hit
        ? (picked.pickedMesh?.metadata?.damageable as Hittable | undefined)
        : undefined;
      if (!picked?.hit && direction.y < -0.0001) {
        const distance = (0.06 - origin.y) / direction.y;
        if (distance > 0 && distance < LOOKOUT.range)
          end = origin.add(direction.scale(distance));
      }
      const start = Vector3.TransformCoordinates(
        TURRET_MUZZLE,
        rig.gun.computeWorldMatrix(true),
      );
      this.event({
        kind: "turretTrace",
        player: id,
        weapon: "machineGun",
        x: start.x,
        y: start.y,
        z: start.z,
        endX: end.x,
        endY: end.y,
        endZ: end.z,
      });
      if (target && target.hp > 0)
        this.impacts.push({
          remaining: Math.min(0.1, Vector3.Distance(start, end) / 800),
          target,
          actor,
          origin,
        });
    }
  }
}
