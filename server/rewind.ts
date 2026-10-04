import { Vector3, type Ray, type Scene, type Mesh } from "@babylonjs/core";
import type { Player } from "../src/player/player";
export interface RewindActor {
  id: string;
  player: Player;
  life: number;
}
type Pose = {
  id: string;
  life: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
};
export class HitHistory {
  frames: { at: number; poses: Pose[] }[] = [];
  record(at: number, actors: RewindActor[]) {
    this.frames.push({
      at,
      poses: actors
        .filter((a) => a.player.hp > 0)
        .map((a) => ({
          id: a.id,
          life: a.life,
          x: a.player.root.position.x,
          y: a.player.root.position.y,
          z: a.player.root.position.z,
          yaw: a.player.root.rotation.y,
        })),
    });
    while (this.frames.length > 32 || this.frames[0]?.at < at - 300)
      this.frames.shift();
  }
  pick(
    scene: Scene,
    ray: Ray,
    shooter: Player,
    actors: RewindActor[],
    requested: number,
    now: number,
  ) {
    const at = Math.max(now - 200, Math.min(now, requested));
    const before = [...this.frames].reverse().find((f) => f.at <= at),
      after = this.frames.find((f) => f.at >= at);
    const saved: { player: Player; position: Vector3; yaw: number }[] = [];
    try {
      for (const a of actors) {
        if (a.player === shooter || a.player.hp <= 0) continue;
        const p = before?.poses.find((p) => p.id === a.id && p.life === a.life),
          q = after?.poses.find((p) => p.id === a.id && p.life === a.life);
        if (!p || !q || Math.hypot(p.x - q.x, p.z - q.z) > 4) continue;
        const t =
          after!.at === before!.at
            ? 0
            : (at - before!.at) / (after!.at - before!.at);
        saved.push({
          player: a.player,
          position: a.player.root.position.clone(),
          yaw: a.player.root.rotation.y,
        });
        a.player.root.position.set(
          p.x + (q.x - p.x) * t,
          p.y + (q.y - p.y) * t,
          p.z + (q.z - p.z) * t,
        );
        a.player.root.rotation.y =
          p.yaw +
          Math.atan2(Math.sin(q.yaw - p.yaw), Math.cos(q.yaw - p.yaw)) * t;
        for (const m of a.player.bodyMeshes) m.computeWorldMatrix(true);
      }
      return scene.pickWithRay(
        ray,
        (m) =>
          m.isEnabled() &&
          !shooter.bodyMeshes.includes(m as Mesh) &&
          (!!m.metadata?.solid ||
            (!!m.metadata?.damageable && m.metadata.damageable.hp > 0)),
      );
    } finally {
      for (const s of saved) {
        s.player.root.position.copyFrom(s.position);
        s.player.root.rotation.y = s.yaw;
        for (const m of s.player.bodyMeshes) m.computeWorldMatrix(true);
      }
    }
  }
}
