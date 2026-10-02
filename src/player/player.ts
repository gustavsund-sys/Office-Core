import {
  MeshBuilder,
  StandardMaterial,
  Color3,
  TransformNode,
  Vector3,
  Matrix,
  Plane,
  SceneLoader,
  Texture,
  type Mesh,
  type AbstractMesh,
  type AnimationGroup,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { heldWeapon } from "../weapons/models";
import type { WeaponId } from "../config/weapons";
import { relativeMovement, type ViewMode } from "./look";
import { World } from "../map/builder";
import { CONFIG } from "../config/game";
import { move } from "../game/collision";
import { office01 } from "../maps/office01";
export interface PlayerCommand {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  fire: boolean;
  pressed: boolean;
  facingYaw?: number;
  shotTarget?: Vector3;
}
export class Input {
  keys = new Set<string>();
  down = false;
  pressed = false;
  pointer = { x: 0, y: 0 };
  mode: ViewMode = "topDown";
  aimRelativeMovement = true;
  yaw = Math.PI;
  pitch = CONFIG.thirdPerson.initialPitch;
  active = false;
  lockUnavailable = false;
  dragging = false;
  get locked() {
    return document.pointerLockElement === this.canvas;
  }
  requestLock() {
    if (this.mode !== "thirdPerson" || !this.active || this.locked) return;
    try {
      const result = this.canvas.requestPointerLock();
      result?.catch(() => this.lockFailed());
    } catch {
      this.lockFailed();
    }
  }
  lockFailed() {
    this.lockUnavailable = true;
    window.dispatchEvent(new CustomEvent("look-lock-failed"));
  }

  constructor(public canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLButtonElement
      )
        return;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "F2"].includes(e.code))
        e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (
        this.active &&
        this.mode === "thirdPerson" &&
        (this.locked || this.dragging)
      ) {
        this.yaw += e.movementX * CONFIG.thirdPerson.sensitivity;
      }
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active) return;
      if (e.button === 2) this.dragging = true;
      if (
        this.mode === "thirdPerson" &&
        !this.locked &&
        !this.lockUnavailable &&
        e.button === 0
      ) {
        this.requestLock();
        return;
      }
      if (e.button === 0) {
        const r = canvas.getBoundingClientRect();
        this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
        this.down = true;
        this.pressed = true;
      }
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.down = false;
      if (e.button === 2) this.dragging = false;
    });
    document.addEventListener("pointerlockerror", () => this.lockFailed());
    window.addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => this.clear());
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  clear() {
    this.dragging = false;
    this.keys.clear();
    this.down = false;
    this.pressed = false;
  }
  shotTarget(world: World) {
    const ray = world.scene.activeCamera!.getForwardRay(100);
    const hit = world.scene.pickWithRay(
      ray,
      (m) =>
        m.isEnabled() &&
        (!!m.metadata?.solid ||
          (!!m.metadata?.damageable && m.metadata.damageable.hp > 0)),
    );
    return hit?.hit && hit.pickedPoint
      ? hit.pickedPoint
      : ray.origin.add(ray.direction.scale(100));
  }
  command(world: World, pos: Vector3): PlayerCommand {
    if (this.mode === "thirdPerson") {
      const movement = relativeMovement(
        Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
        Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
        this.yaw,
      );
      const c: PlayerCommand = {
        moveX: movement.x,
        moveZ: movement.z,
        aimX: pos.x + Math.sin(this.yaw) * 100,
        aimZ: pos.z + Math.cos(this.yaw) * 100,
        facingYaw: this.yaw,
        fire: this.down,
        pressed: this.pressed,
      };
      this.pressed = false;
      return c;
    }
    const ray = world.scene.createPickingRay(
      this.pointer.x,
      this.pointer.y,
      Matrix.Identity(),
      world.scene.activeCamera,
    );
    const distance = ray.intersectsPlane(new Plane(0, 1, 0, 0));
    const aim =
      distance !== null
        ? ray.origin.add(ray.direction.scale(distance))
        : pos.add(new Vector3(0, 0, 1));
    const c = {
      moveX: Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      moveZ: Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
      aimX: aim.x,
      aimZ: aim.z,
      fire: this.down,
      pressed: this.pressed,
    };
    if (this.aimRelativeMovement) {
      const dx = aim.x - pos.x,
        dz = aim.z - pos.z;
      const radius = Math.hypot(dx, dz);
      if (radius > 0.35) this.yaw = Math.atan2(dx, dz);
      // Stop forward movement near the cursor instead of orbiting across it.
      const forward = c.moveZ > 0 && radius < 0.65 ? 0 : c.moveZ;
      const movement = relativeMovement(c.moveX, forward, this.yaw);
      c.moveX = movement.x;
      c.moveZ = movement.z;
    }
    this.pressed = false;
    return c;
  }
}
export class Player {
  root: TransformNode;
  invulnerable = 0;
  barrier?: Mesh;
  setBarrier(active: boolean) {
    if (active && !this.barrier) {
      this.barrier = MeshBuilder.CreateSphere("warcry shield", { diameter: 2.8, segments: 16 }, this.world.scene);
      this.barrier.parent = this.root;
      this.barrier.position.y = 1.1;
      this.barrier.isPickable = false;
      const material = new StandardMaterial("warcry shield", this.world.scene);
      material.diffuseColor = Color3.FromHexString("#66eaff");
      material.emissiveColor = Color3.FromHexString("#229fba");
      material.alpha = 0.25;
      material.backFaceCulling = false;
      this.barrier.material = material;
    }
    this.barrier?.setEnabled(active);
  }
  hp = CONFIG.player.hp;
  recoil = 0;
  verticalVelocity = 0;
  landed = false;
  get grounded() {
    return this.root.position.y <= 0 && this.verticalVelocity === 0;
  }
  jump() {
    if (!this.grounded) return false;
    this.verticalVelocity = 5;
    return true;
  }
  walk = 0;
  legs: TransformNode[] = [];
  torso: Mesh;
  gun: Mesh;
  weaponZ = 0.56;
  bodyMeshes: Mesh[] = [];
  legacyMeshes: Mesh[] = [];
  animationGroups: {
    idle?: AnimationGroup;
    run?: AnimationGroup;
    jump?: AnimationGroup;
  } = {};
  activeAnimation?: AnimationGroup;
  constructor(public world: World) {
    this.root = new TransformNode("player", world.scene);
    this.root.position.set(office01.spawn.x, 0, office01.spawn.z);
    const part = (
      name: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: string,
    ) => {
      const m = world.box(name, x, y, z, w, h, d, c);
      m.parent = this.root;
      return m;
    };
    this.torso = part("jacket", 0, 1, 0, 0.65, 0.67, 0.4, "#f1e6c6");
    this.bodyMeshes.push(this.torso);
    this.bodyMeshes.push(
      part("vest", 0, 1.07, 0.23, 0.43, 0.42, 0.12, "#f17a61"),
    );
    this.bodyMeshes.push(part("head", 0, 1.59, 0, 0.43, 0.43, 0.43, "#d9a77b"));
    this.bodyMeshes.push(
      part("hair", 0, 1.81, -0.05, 0.46, 0.13, 0.4, "#343b45"),
    );
    this.bodyMeshes.push(
      part("left arm", -0.39, 1.04, 0.17, 0.22, 0.28, 0.62, "#efdfbd"),
    );
    this.bodyMeshes.push(
      part("right arm", 0.39, 1.04, 0.17, 0.22, 0.28, 0.62, "#efdfbd"),
    );
    this.gun = part("weapon", 0.26, 1.12, 0.56, 0.19, 0.22, 0.65, "#263647");
    for (const x of [-0.19, 0.19]) {
      const boot = part("boot", x, 0.3, 0, 0.24, 0.55, 0.3, "#253a4c");
      this.legs.push(boot);
      this.bodyMeshes.push(boot);
    }
    const ring = MeshBuilder.CreateTorus(
      "player ring",
      { diameter: 1.15, thickness: 0.035, tessellation: 32 },
      world.scene,
    );
    ring.parent = this.root;
    ring.position.y = 0.06;
    ring.material = world.mat("#f8e4ac", true);
    ring.isPickable = false;
    this.setWeaponModel("pistol");
    this.legacyMeshes = this.root.getChildMeshes() as Mesh[];
  }
  setWeaponModel(id: WeaponId) {
    this.gun?.dispose();
    this.gun = heldWeapon(this.world, id);
    this.gun.parent = this.root;
    const overhead = id === "coreBuster";
    const shoulder = id === "bazooka";
    this.weaponZ = overhead
      ? 0
      : shoulder
        ? 0.12
        : id === "pistol" || id === "pulseGun"
          ? 0.55
          : 0.52;
    this.gun.position.set(
      overhead ? 0 : shoulder ? 0.43 : 0.26,
      overhead ? 2.2 : shoulder ? 1.55 : 1.12,
      this.weaponZ,
    );
    for (const mesh of this.bodyMeshes) {
      if (overhead && (mesh.name === "right arm" || mesh.name === "left arm")) {
        mesh.position.set(mesh.name === "right arm" ? 0.38 : -0.38, 1.6, 0);
        mesh.rotation.set(Math.PI / 2, 0, 0);
        continue;
      }
      if (mesh.name === "right arm") {
        mesh.position.set(0.39, shoulder ? 1.32 : 1.04, shoulder ? 0.28 : 0.17);
        mesh.rotation.x = shoulder ? -0.65 : 0;
      }
      if (mesh.name === "left arm") {
        mesh.position.set(
          shoulder ? 0.15 : -0.39,
          shoulder ? 1.18 : 1.04,
          shoulder ? 0.48 : 0.17,
        );
        mesh.rotation.x = shoulder ? -0.3 : 0;
        mesh.rotation.y = shoulder ? -0.7 : 0;
      }
    }
  }
  async loadModel() {
    try {
      const result = await SceneLoader.ImportMeshAsync(
        "",
        "/models/kenney-protagonists/glb/animations/",
        "idle.glb",
        this.world.scene,
      );
      const modelRoot = new TransformNode(
        "kenney protagonist",
        this.world.scene,
      );
      modelRoot.parent = this.root;
      // The exported Kenney rig is 3.76 units tall; this matches the old 1.8m player.
      modelRoot.scaling.setAll(0.48);
      for (const mesh of result.meshes) {
        if (mesh === result.meshes[0] && !mesh.geometry) continue;
        mesh.parent = modelRoot;
        mesh.isPickable = false;
        mesh.setEnabled(true);
        mesh.isVisible = true;
        mesh.visibility = 1;
        const material = mesh.material as {
          alpha?: number;
          transparencyMode?: number | null;
          forceDepthWrite?: boolean;
        } | null;
        if (material) {
          material.alpha = 1;
          material.transparencyMode = null;
          material.forceDepthWrite = true;
          const skin = new Texture(
            "/models/kenney-protagonists/Skins/skaterMaleA.png",
            this.world.scene,
          );
          (
            material as { albedoTexture?: Texture; diffuseTexture?: Texture }
          ).albedoTexture = skin;
          (material as { diffuseTexture?: Texture }).diffuseTexture = skin;
        }
      }
      this.legacyMeshes.forEach((mesh) => {
        mesh.visibility = 0;
        mesh.isVisible = false;
      });
      // glTF can contain several action clips. Stop any clips the loader may
      // have auto-started, then explicitly play the real Idle action. The
      // second clip in the exported file is a one-frame targeting-pose helper
      // and would otherwise keep the character in a T-pose.
      result.animationGroups.forEach((group) => group.stop());
      const idle =
        result.animationGroups.find((group) => /idle/i.test(group.name)) ??
        result.animationGroups[0];
      if (idle) {
        idle.name = "kenney idle";
        idle.reset();
        idle.start(true, 1, idle.from, idle.to, true);
      }
      // Some Blender exports contain a broken rest-pose action. Keep the
      // character readable even when that clip only evaluates to a T-pose.
      // The arm bones are posed locally after the clip has been started.
      const skeleton = result.skeletons[0];
      if (skeleton) {
        const pose = (name: string, z: number) => {
          const bone = skeleton.bones.find((item) => item.name === name);
          if (bone) bone.rotation.z = z;
        };
        pose("LeftArm", -0.85);
        pose("RightArm", 0.85);
        pose("LeftForeArm", -0.55);
        pose("RightForeArm", 0.55);
        // The supplied Idle clip is currently a malformed one-frame export;
        // keep the corrected pose instead of letting it reset the bones.
        idle?.stop();
      }
      const hand = result.meshes
        .flatMap((mesh) => mesh.getChildTransformNodes())
        .find((node) => node.name === "RightHand");
      if (hand) {
        this.gun.visibility = 1;
        this.gun.isVisible = true;
        this.gun.parent = hand;
        this.gun.position.set(0.05, 0, 0.22);
        this.gun.rotation.set(Math.PI / 2, 0, 0);
      }
      document.querySelector("#toast")?.append("KENNEY MODEL LOADED");
    } catch (error) {
      console.error("Kenney player model could not be loaded", error);
      // Procedural player remains as a fallback if the model cannot load.
    }
  }
  private async loadAnimations(modelMeshes: AbstractMesh[]) {
    const destinations = new Map<string, TransformNode>();
    for (const mesh of modelMeshes)
      for (const node of mesh.getChildTransformNodes(true))
        destinations.set(node.name, node);
    for (const [name, file] of [
      ["idle", "idle.glb"],
      ["run", "run.glb"],
      ["jump", "jump.glb"],
    ] as const) {
      const source = await SceneLoader.ImportMeshAsync(
        "",
        "/models/kenney-protagonists/glb/animations/",
        file,
        this.world.scene,
      );
      const group = source.animationGroups[0];
      if (group) {
        const cloned = group.clone(
          `kenney ${name}`,
          (target) => destinations.get(target.name) ?? null,
          true,
        );
        if (cloned) this.animationGroups[name] = cloned;
      }
      source.meshes.forEach((mesh) => mesh.dispose());
      source.animationGroups.forEach((group) => group.dispose());
    }
    this.playAnimation("idle");
  }
  private playAnimation(name: "idle" | "run" | "jump") {
    const next = this.animationGroups[name];
    if (!next || this.activeAnimation === next) return;
    this.activeAnimation?.stop();
    next.start(true);
    this.activeAnimation = next;
  }
  update(c: PlayerCommand, dt: number) {
    this.simulate(c, dt);
    this.animate(!!(c.moveX || c.moveZ), dt);
  }
  simulate(c: PlayerCommand, dt: number) {
    this.landed = false;
    if (!this.grounded) {
      this.root.position.y += this.verticalVelocity * dt - 0.5 * 14 * dt * dt;
      this.verticalVelocity -= 14 * dt;
      if (this.root.position.y <= 0) {
        this.root.position.y = 0;
        this.verticalVelocity = 0;
        this.landed = true;
      }
    }
    const l = Math.hypot(c.moveX, c.moveZ) || 1;
    move(
      this.root.position,
      (c.moveX / l) * CONFIG.player.speed * dt,
      (c.moveZ / l) * CONFIG.player.speed * dt,
      CONFIG.player.radius,
      this.world.obstacles,
    );
    this.root.rotation.y =
      c.facingYaw ??
      Math.atan2(c.aimX - this.root.position.x, c.aimZ - this.root.position.z);
  }
  animate(moving: boolean, dt: number) {
    this.walk += dt * (moving ? 13 : 2);
    this.legs.forEach(
      (m, i) =>
        (m.rotation.x = moving ? Math.sin(this.walk + i * Math.PI) * 0.55 : 0),
    );
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.gun.position.z = this.weaponZ - this.recoil * 0.18;
    this.torso.position.y = 1 + Math.sin(this.walk) * (moving ? 0.045 : 0.018);
  }
  get direction() {
    return new Vector3(
      Math.sin(this.root.rotation.y),
      0,
      Math.cos(this.root.rotation.y),
    );
  }
}
