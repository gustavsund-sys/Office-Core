import {
  Camera,
  Color4,
  Constants,
  Ray,
  Sprite,
  SpriteManager,
  Vector3,
  type FreeCamera,
} from "@babylonjs/core";
import type { World } from "../map/builder";
import type { Player, Input } from "../player/player";

/** Tight aim cone measured in metres at the observer, never a general enemy marker. */
export function sniperThreat(
  origin: Vector3,
  direction: Vector3,
  target: Vector3,
) {
  const delta = target.subtract(origin),
    distance = delta.length();
  if (distance > 120 || distance < 0.1) return false;
  const along = Vector3.Dot(delta, direction);
  return (
    along > 0 &&
    delta.subtract(direction.scale(along)).length() <=
      Math.min(2.5, 1 + distance * 0.008)
  );
}
export class RifleScope {
  private yaw = 0;
  private pitch = 0;
  private saved?: { mode: number; fov: number; minZ: number };
  private overlay = document.createElement("div");
  private pointer?: { x: number; y: number };
  constructor(
    private player: Player,
    private input: Input,
    private view: FreeCamera,
    private eligible: () => boolean,
  ) {
    input.scopeRoot = player.root;
    this.overlay.className = "boss-lookout-overlay scoped";
    this.overlay.hidden = true;
    this.overlay.innerHTML =
      '<div class="boss-scope"><i></i></div><div class="boss-reticle">+</div><div class="boss-status">HUNTING RIFLE · RMB: EXIT SCOPE</div>';
    document.querySelector("#ui")!.append(this.overlay);
    window.addEventListener("pointerdown", (e) => {
      if (
        e.button !== 2 ||
        e.target !== document.querySelector("#game") ||
        !eligible()
      )
        return;
      e.preventDefault();
      if (input.scoped) this.exit();
      else {
        this.saved = { mode: view.mode, fov: view.fov, minZ: view.minZ };
        this.yaw = player.root.rotation.y;
        this.pitch = player.gun.rotation.x;
        input.scoped = player.scoped = true;
        document.body.classList.add("rifle-scoped");
        input.down = input.pressed = false;
        this.pointer = undefined;
        this.camera();
        input.requestLock(true);
      }
    });
    window.addEventListener("pointermove", (e) => {
      if (!input.scoped) return;
      const previous = this.pointer;
      this.pointer = { x: e.clientX, y: e.clientY };
      if (
        !input.locked &&
        (!previous || e.target !== document.querySelector("#game"))
      )
        return;
      this.yaw +=
        (input.locked ? e.movementX : e.clientX - previous!.x) * 0.00065;
      this.pitch = Math.max(
        -1.3,
        Math.min(
          1.3,
          this.pitch +
            (input.locked ? e.movementY : e.clientY - previous!.y) * 0.00065,
        ),
      );
    });
    window.addEventListener("keydown", (e) => {
      if (e.code === "Escape") this.exit();
    });
    window.addEventListener("blur", () => this.exit());
  }
  aimAt(target: Vector3) {
    if (!this.eligible()) return;
    this.saved ??= {
      mode: this.view.mode,
      fov: this.view.fov,
      minZ: this.view.minZ,
    };
    const delta = target.subtract(
      this.player.root.position.add(new Vector3(0, this.player.crouched ? 0.975 : 1.5, 0)),
    );
    this.yaw = Math.atan2(delta.x, delta.z);
    this.pitch = -Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    this.input.scoped = this.player.scoped = true;
    document.body.classList.add("rifle-scoped");
    this.camera();
    this.view.getViewMatrix(true);
  }
  exit() {
    if (!this.saved) return;
    this.input.scoped = this.player.scoped = false;
    document.body.classList.remove("rifle-scoped");
    Object.assign(this.view, this.saved);
    this.saved = undefined;
    this.overlay.hidden = true;
    this.player.setViewVisibility(1);
    this.input.down = this.input.pressed = false;
    if (this.input.locked) document.exitPointerLock();
  }
  camera() {
    if (!this.input.scoped) return false;
    if (!this.eligible()) {
      this.exit();
      return false;
    }
    this.overlay.hidden = false;
    this.view.mode = Camera.PERSPECTIVE_CAMERA;
    this.view.fov = 0.2;
    this.view.minZ = 0.08;
    this.view.position.copyFrom(this.player.root.position).y += this.player.crouched ? 0.975 : 1.5;
    this.view.rotationQuaternion = null;
    this.view.rotation.set(this.pitch, this.yaw, 0);
    this.player.setViewVisibility(0);
    this.view.getViewMatrix(true);
    return true;
  }
}
/** These sprites exist exclusively in the local active turret observer's scene. */
export class SniperGlints {
  private manager?: SpriteManager;
  private sprites = new Map<Player, Sprite>();
  private elapsed = 0;
  constructor(private world: World) {}
  update(dt: number, enabled: boolean, target: Vector3, players: Player[]) {
    if (!enabled) {
      for (const sprite of this.sprites.values()) sprite.isVisible = false;
      return;
    }
    this.elapsed += dt;
    if (this.elapsed < 0.05) return; // At most 20 cheap cone/visibility checks per second.
    this.elapsed = 0;
    for (const [player, sprite] of this.sprites) {
      if (!players.includes(player)) {
        sprite.dispose();
        this.sprites.delete(player);
      }
    }
    for (const sprite of this.sprites.values()) sprite.isVisible = false;
    for (const player of players) {
      if (
        !player.scoped ||
        player.hp <= 0 ||
        player.weaponId !== "huntingRifle"
      )
        continue;
      const origin = player.shotOrigin;
      const pitch = player.gun.rotation.x,
        yaw = player.root.rotation.y;
      const direction = new Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        -Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      );
      if (!sniperThreat(origin, direction, target)) continue;
      const delta = target.subtract(origin),
        distance = delta.length();
      if (
        this.world.scene.pickWithRay(
          new Ray(origin, delta.normalize(), Math.max(0, distance - 0.12)),
          (m) =>
            m.isEnabled() &&
            !!m.metadata?.solid &&
            !player.bodyMeshes.includes(m as never),
        )?.hit
      )
        continue;
      this.manager ??= new SpriteManager(
        "private sniper glints",
        "/vfx/kenney/spark.png",
        8,
        512,
        this.world.scene,
      );
      this.manager.blendMode = Constants.ALPHA_ADD;
      this.manager.disableDepthWrite = true;
      this.manager.fogEnabled = false;
      let sprite = this.sprites.get(player);
      if (!sprite) {
        if (this.sprites.size >= 8) continue;
        sprite = new Sprite("scope glint", this.manager);
        sprite.isPickable = false;
        this.sprites.set(player, sprite);
      }
      sprite.position.copyFrom(origin);
      sprite.size = Math.max(0.2, Math.min(1.6, distance * 0.012));
      sprite.color = new Color4(1, 0.88, 0.6, 0.9);
      sprite.isVisible = true;
    }
  }
}
