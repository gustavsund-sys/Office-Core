import { Mesh, StandardMaterial, Color3, Vector3 } from "@babylonjs/core";
import type { World } from "../map/builder";
import type { Prop } from "../maps/office01";
import type { Obstacle } from "../game/collision";
import type { Explosions } from "../effects/explosions";
import type { Hittable } from "./hittable";
import type { Team } from "../config/game";
export class Destructible implements Hittable {
  hp: number;
  maxHp: number;
  flash = 0;
  position: Vector3;
  team?: Team;
  originals: {
    mesh: Mesh;
    position: Vector3;
    material: StandardMaterial;
    emissive: Color3;
  }[] = [];
  constructor(
    public world: World,
    public prop: Prop,
    public meshes: Mesh[],
    public obstacles: Obstacle[],
    public explosions: Explosions,
  ) {
    this.team = prop.team;
    this.hp = this.maxHp =
      prop.kind === "coreDoor"
        ? 100
        : prop.kind === "glass"
          ? 20
          : prop.kind === "plant"
            ? 40
            : prop.kind === "server"
              ? 80
              : 60;
    this.position = new Vector3(prop.x, 0.85, prop.z);
    for (const mesh of meshes) {
      const material = (mesh.material as StandardMaterial).clone(
        "breakable " + prop.kind,
      );
      mesh.material = material;
      this.originals.push({
        mesh,
        position: mesh.position.clone(),
        material,
        emissive: material.emissiveColor.clone(),
      });
      mesh.metadata = { damageable: this };
      mesh.isPickable = true;
    }
    // Low furniture still needs a shootable body at the common weapon height.
    const obstacle = obstacles[0];
    if (obstacle) {
      const hitbox = world.box(
        "breakable hitbox",
        obstacle.x,
        0.85,
        obstacle.z,
        obstacle.w,
        1.7,
        obstacle.d,
        "#ffffff",
      );
      hitbox.visibility = 0;
      world.shadows.removeShadowCaster(hitbox);
      hitbox.isPickable = true;
      hitbox.metadata = { damageable: this };
      this.meshes.push(hitbox);
    }
  }
  canDamageFrom() {
    return true;
  }
  damage(amount: number, source?: "coreBuster", effects = true) {
    if (this.prop.kind === "coreDoor" && source !== "coreBuster") return;
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.12;
    if (this.hp === 0) {
      // Remove both rendered parts and collision references, opening the route.
      for (const mesh of this.meshes) {
        this.world.shadows.removeShadowCaster(mesh);
        mesh.setEnabled(false);
      }
      this.world.obstacles = this.world.obstacles.filter(
        (o) => !this.obstacles.includes(o),
      );
      this.world.solids = this.world.solids.filter(
        (m) => !this.meshes.includes(m),
      );
      if (effects)
        this.explosions.burst(
          this.position,
          this.prop.kind === "coreDoor"
            ? "#ff685e"
            : this.prop.kind === "server"
              ? "#558da8"
              : this.prop.kind === "plant"
                ? "#70a77e"
                : "#b6aa8e",
          this.prop.kind === "coreDoor"
            ? 1.5
            : this.prop.kind === "server"
              ? 1.2
              : 1,
        );
    }
  }
  reset() {
    this.hp = this.maxHp;
    this.flash = 0;
    for (const mesh of this.meshes) {
      mesh.setEnabled(true);
      this.world.shadows.addShadowCaster(mesh);
      if (!this.world.solids.includes(mesh)) this.world.solids.push(mesh);
    }
    for (const obstacle of this.obstacles)
      if (!this.world.obstacles.includes(obstacle))
        this.world.obstacles.push(obstacle);
    for (const original of this.originals)
      original.mesh.position.copyFrom(original.position);
  }
  update(dt: number) {
    if (this.hp <= 0) return;
    this.flash = Math.max(0, this.flash - dt);
    for (const p of this.originals) {
      p.material.emissiveColor.copyFrom(
        this.flash > 0 ? new Color3(0.65, 0.32, 0.1) : p.emissive,
      );
      p.mesh.position.x =
        p.position.x +
        (this.flash > 0 ? Math.sin(this.flash * 100) * 0.045 : 0);
    }
  }
}
