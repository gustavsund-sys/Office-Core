import { beam } from "./effectPool";

import { Color3, Vector3, MeshBuilder, Matrix } from "@babylonjs/core";

import type { Game } from "./game";
type Context = Pick<
  Game,
  | "camera"
  | "damageNumbers"
  | "engagement"
  | "engine"
  | "hitHealthBars"
  | "multiplayer"
  | "onlinePlayers"
  | "player"
  | "scene"
  | "sound"
  | "testPlayer"
  | "time"
  | "weaponAudio"
  | "world"
>;
export function showHitHealth(
  this: Context,
  id: string,
  damage: number,
  currentHp?: number,
) {
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
        this.multiplayer?.snapshot?.players.find((p) => p.id === id)?.hp ?? 100,
      until: 0,
    };
    this.hitHealthBars.set(id, bar);
  }
  bar.hp = currentHp ?? Math.max(0, bar.hp - damage);
  bar.until = this.time + 2;
}

export function updateHitHealthBars(this: Context) {
  for (const [id, bar] of this.hitHealthBars) {
    const player = this.multiplayer
      ? id === this.multiplayer.room?.sessionId
        ? this.player
        : this.onlinePlayers.get(id)
      : id === "local"
        ? this.player
        : id === "bot"
          ? this.testPlayer
          : undefined;
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

export function showDamageNumber(
  this: Context,
  position: Vector3,
  damage: number,
) {
  const el = document.createElement("div");
  el.textContent = `−${Math.round(damage)}`;
  el.style.cssText =
    "position:absolute;color:#ff334b;font-size:24px;font-weight:900;text-shadow:0 2px 4px #000;pointer-events:none;z-index:90;transform:translate(-50%,-50%)";
  document.querySelector("#ui")!.append(el);
  this.damageNumbers.push({ el, position: position.clone(), life: 1.2 });
}

export function updateDamageNumbers(this: Context, dt: number) {
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

export function beaconImpact(
  this: Context,
  position: Vector3,
  material: string,
  destroyed?: boolean,
  reflected?: Vector3,
) {
  this.engagement.impact(
    position,
    material,
    destroyed,
    material === "player" ? 1 : 3,
  );
  if (material === "player") return;
  if (this.sound)
    this.weaponAudio?.playImpact(
      Vector3.Distance(position, this.player.root.position),
    );
  if (reflected) {
    const spark = MeshBuilder.CreateLines(
      "beacon ricochet",
      { points: [position, reflected] },
      this.scene,
    );
    spark.color = new Color3(1, 0.8, 0.35);
    spark.isPickable = false;
    window.setTimeout(() => spark.dispose(), 250);
  }
}

export function beaconShot(this: Context, start: Vector3, end: Vector3) {
  if (Vector3.DistanceSquared(start, end) < 0.0001) return;
  const beam = MeshBuilder.CreateTube(
    "beacon laser shot",
    {
      path: [start, end],
      radius: 0.055,
      tessellation: 6,
    },
    this.scene,
  );
  beam.material = this.world.mat("#ff334b", true);
  beam.isPickable = false;
  window.setTimeout(() => beam.dispose(), 180);
}
