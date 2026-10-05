import { Mesh, MeshBuilder, Vector3 } from "@babylonjs/core";
import { coreModel } from "./coreModel";
import { World } from "../map/builder";
import { TEAMS, type Team } from "../config/game";
export class Damageable {
  active = true;
  energy: Mesh[] = [];
  visuals: Mesh[] = [];
  hp: number;
  maxHp: number;
  mesh: Mesh;
  bar: Mesh;
  base: Mesh;
  flash = 0;
  respawn = 0;
  position: Vector3;
  constructor(
    public world: World,
    public kind: "core" | "target",
    x: number,
    z: number,
    public team?: Team,
  ) {
    const existing = new Set(world.scene.meshes);
    this.hp = this.maxHp = kind === "core" ? 1000 : 100;
    this.position = new Vector3(x, 0, z);
    const c = team ? TEAMS[team] : "#fa9974";
    if (kind === "core") {
      world.box("core plinth", x, 0.15, z, 2.5, 0.3, 2.5, "#1f3442", true);
      // One stable hit volume on the server; decorative geometry never affects hits.
      this.mesh = world.box("core", x, 1.7, z, 1.65, 2.7, 1.65, c);
      this.mesh.visibility = 0;
      if (!world.authoritative)
        this.energy = coreModel(world, team!, x, z).energy;
    } else {
      world.box("dummy foot", x, 0.1, z, 0.85, 0.2, 0.85, "#334a55");
      this.mesh = MeshBuilder.CreateCylinder(
        "dummy",
        { height: 1.5, diameter: 0.75, tessellation: 8 },
        world.scene,
      );
      this.mesh.position.set(x, 1, z);
      this.mesh.material = world.mat(c);
      world.shadows.addShadowCaster(this.mesh);
      const target = world.box(
        "bullseye",
        x,
        1.15,
        z - 0.39,
        0.33,
        0.33,
        0.03,
        "#ffebc5",
      );
      target.parent = this.mesh;
      target.position.set(0, 0.15, -0.39);
    }
    this.mesh.isPickable = true;
    this.mesh.metadata = { damageable: this };
    this.base = world.box(
      "health background",
      x,
      kind === "core" ? 3.95 : 2.65,
      z,
      2,
      0.09,
      0.16,
      "#152733",
    );
    this.bar = world.box(
      "health",
      x,
      kind === "core" ? 3.96 : 2.66,
      z,
      2,
      0.1,
      0.17,
      c,
      false,
      true,
    );
    this.visuals = world.scene.meshes.filter(
      (mesh) => !existing.has(mesh) && mesh.name !== "core plinth",
    ) as Mesh[];
  }
  setActive(active: boolean) {
    this.active = active;
    this.visuals.forEach((mesh) => mesh.setEnabled(active));
  }
  canDamageFrom(position: { x: number; z: number }) {
    return (
      this.active &&
      (this.kind !== "core" ||
        (Math.abs(position.x - this.position.x) < 4.5 &&
          Math.abs(position.z - this.position.z) < 4.5))
    );
  }
  damage(amount: number) {
    if (!this.active || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.16;
    if (!this.hp && this.kind === "core")
      this.world.explosions.burst(
        this.position,
        "#ff62d9",
        2,
        undefined,
        "plasma",
      );
    if (!this.hp && this.kind === "target") {
      this.mesh.setEnabled(false);
      this.respawn = 5;
    }
    this.bar.scaling.x = Math.max(0.001, this.hp / this.maxHp);
  }
  update(dt: number, time: number) {
    this.flash = Math.max(0, this.flash - dt);
    const s = this.flash > 0 ? 1.12 : 1;
    if (this.kind === "core") {
      for (const part of this.energy)
        part.scaling.x = part.scaling.z = s + Math.sin(time * 2) * 0.025;
    } else this.mesh.scaling.setAll(s);
    if (this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.hp = this.maxHp;
        this.mesh.setEnabled(true);
        this.bar.scaling.x = 1;
      }
    }
  }
}
