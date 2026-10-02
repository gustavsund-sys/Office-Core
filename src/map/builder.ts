import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  StandardMaterial,
  Vector3,
  ShadowGenerator,
} from "@babylonjs/core";
import { office01 } from "../maps/office01";
import { Explosions } from "../effects/explosions";
import { Destructible } from "../core/destructible";
import { TEAMS, type Team } from "../config/game";
import type { Obstacle } from "../game/collision";
export class World {
  obstacles: Obstacle[] = [];
  solids: Mesh[] = [];
  materials = new Map<string, StandardMaterial>();
  destructibles: Destructible[] = [];
  explosions: Explosions;
  alarmLights = new Map<
    Team,
    { light: PointLight; lens: Mesh; material: StandardMaterial }
  >();
  constructor(
    public scene: Scene,
    public shadows: ShadowGenerator,
  ) {
    this.explosions = new Explosions(this);
  }
  mat(color: string, glow = false) {
    const key = color + glow;
    if (this.materials.has(key)) return this.materials.get(key)!;
    const m = new StandardMaterial(key, this.scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = new Color3(0.08, 0.08, 0.08);
    if (glow) m.emissiveColor = m.diffuseColor.scale(0.65);
    this.materials.set(key, m);
    return m;
  }
  box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    solid = false,
    glow = false,
  ) {
    const m = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      this.scene,
    );
    m.position.set(x, y, z);
    m.material = this.mat(color, glow);
    m.receiveShadows = true;
    m.isPickable = solid;
    if (h > 0.2) this.shadows.addShadowCaster(m);
    if (solid) {
      this.obstacles.push({ x, z, w, d });
      this.solids.push(m);
      m.metadata = { solid: true };
    }
    return m;
  }
  label(text: string, x: number, z: number, color = "#c0ced4", size = 3) {
    const tex = new DynamicTexture(
      text,
      { width: 512, height: 128 },
      this.scene,
      false,
    );
    tex.hasAlpha = true;
    tex.drawText(
      text,
      null,
      82,
      "bold 48px sans-serif",
      color,
      "transparent",
      true,
    );
    const mat = new StandardMaterial("label", this.scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = Color3.White();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    const m = MeshBuilder.CreateGround(
      text,
      { width: size, height: size / 4 },
      this.scene,
    );
    m.position.set(x, 0.065, z);
    m.material = mat;
    m.isPickable = false;
    return m;
  }
  updateAlarm(team: Team | undefined, time: number) {
    const flash = Math.pow(Math.max(0, Math.sin(time * Math.PI * 3)), 2);
    for (const [owner, { light, material }] of this.alarmLights) {
      const level = owner === team ? flash : 0;
      light.intensity = level * 8;
      material.emissiveColor.set(0.12 + level * 0.88, 0.015, 0.015);
    }
  }
  build() {
    const size = office01.size;
    this.box("foundation", 0, -0.3, 0, size + 1, 0.6, size + 1, "#13232e");
    for (const r of office01.footprint)
      this.box("walkable floor", r.x, -0.045, r.z, r.w, 0.08, r.d, "#617577");
    for (const r of office01.corridors) {
      this.box(
        "corridor runner",
        r.x,
        0.005,
        r.z,
        r.w * 0.7,
        0.01,
        r.d * 0.7,
        "#435d66",
      );
    }
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        this.label("ATRIUM >", sx * 18, sz * 26, "#edcb89", 4);
        this.label("TRANSIT / 01", sx * 24, sz * 33, "#b5d5d4", 3.5);
        this.label("Weapon drop zone", sx * 49, sz * 30, "#ffdc66", 6);
        // Ground arrow points away from the office into the exterior passage.
        this.box("drop zone arrow shaft", sx * 53, 0.065, sz * 30, 2.2, 0.035, 0.22, "#ffdc66", false, true);
        for (const direction of [-1, 1]) {
          const wing = this.box("drop zone arrow head", sx * 53.75, 0.065, sz * 30 + direction * 0.35, 1.05, 0.035, 0.22, "#ffdc66", false, true);
          wing.rotation.y = sx * direction * Math.PI / 4;
        }
      }
    for (const zone of office01.weaponEnds) {
      // Yellow/black bands wrap each wall corner, with matching floor markings.
      for (const dx of [-1, 1])
        for (const dz of [-1, 1])
          for (let stripe = 0; stripe < 6; stripe++) {
            const distance = 0.3 + stripe * 0.4;
            const color = stripe % 2 === 0 ? "#ffce32" : "#172029";
            const x = zone.x + dx * 9.78;
            const z = zone.z + dz * 9.78;
            this.box("drop zone wall tape", x - dx * distance, 1.35, z, 0.4, 0.3, 0.055, color, false, true);
            this.box("drop zone wall tape", x, 1.35, z - dz * distance, 0.055, 0.3, 0.4, color, false, true);
            this.box("drop zone floor tape", x - dx * distance, 0.065, z - dz * 0.2, 0.4, 0.025, 0.28, color, false, true);
            this.box("drop zone floor tape", x - dx * 0.2, 0.065, z - dz * distance, 0.28, 0.025, 0.4, color, false, true);
          }
    }
    for (const r of office01.rooms) {
      this.box(
        "room carpet",
        r.x,
        0.01,
        r.z,
        r.w,
        0.025,
        r.d,
        r.name.startsWith("RECEPTION") ? "#91a09a" : "#4c626b",
      );
      this.label(
        r.name,
        r.x,
        r.z - r.d / 2 + 0.7,
        "#a4babd",
        Math.min(r.w - 1, 5),
      );
    }
    for (const b of office01.bases) {
      const c = TEAMS[b.team];
      this.box("base carpet", b.x, 0.012, b.z, 9, 0.03, 9, "#384b57");
      const fixture = this.box(
        "alarm fixture",
        b.x,
        3.45,
        b.z,
        0.9,
        0.16,
        0.9,
        "#26333b",
      );
      fixture.isPickable = false;
      const lens = MeshBuilder.CreateSphere(
        "alarm lens",
        { diameter: 0.62, segments: 8 },
        this.scene,
      );
      lens.position.set(b.x, 3.72, b.z);
      lens.material = this.mat("#491d20", true);
      lens.isPickable = false;
      const material = (lens.material as StandardMaterial).clone(
        `${b.team} alarm lens`,
      );
      lens.material = material;
      const light = new PointLight(
        `${b.team} alarm`,
        new Vector3(b.x, 3.25, b.z),
        this.scene,
      );
      light.diffuse = new Color3(1, 0.08, 0.06);
      light.specular = Color3.Black();
      // Reach the full depth of the corner rooms from the raised fixture.
      light.range = 18;
      light.intensity = 0;
      this.alarmLights.set(b.team, { light, lens, material });
      this.box(
        "team stripe",
        b.x,
        0.04,
        b.z - 4.25,
        8.5,
        0.03,
        0.12,
        c,
        false,
        true,
      );
      this.label(b.team + " / CORE", b.x, b.z + 3, c, 5);
      // Two front entrances and one side entrance, with internal sightline baffles.
      const sx = Math.sign(b.x),
        sz = Math.sign(b.z);
      // Close the entire room perimeter; outer map walls sit further away.
      this.wall(b.x + sx * 4.5, b.z, 0.4, 9.4);
      this.wall(b.x, b.z + sz * 4.5, 9.4, 0.4);
      // Exterior passages must not open a route around the security doors.
      this.wall(b.x + sx * 5.25, b.z - sz * 4.5, 1.5, 0.4);
      this.wall(b.x - sx * 4.5, b.z + sz * 2, 0.4, 5);
      this.wall(b.x - sx * 4.5, b.z - sz * 3.5, 0.4, 2);
      for (const offset of [-3.5, 3.5])
        this.wall(b.x + offset, b.z - sz * 4.5, 2, 0.4);
      this.wall(b.x, b.z - sz * 4.5, 1.4, 0.4);
      this.wall(b.x - sx * 2.7, b.z + sz * 0.1, 0.4, 2.5);
      this.wall(b.x - sx * 1.4, b.z - sz * 2.1, 3.5, 0.4);
      this.coreDoor(b.team, b.x - sx * 4.5, b.z - sz * 1.6, 0.48, 2.2);
      for (const offset of [-1.9, 1.9])
        this.coreDoor(b.team, b.x + offset, b.z - sz * 4.5, 2.1, 0.48);
      this.box(
        "door marker",
        b.x - sx * 4.5,
        0.06,
        b.z - sz * 1.6,
        0.7,
        0.08,
        1.6,
        c,
        false,
        true,
      );
      const spawnZ = b.z - sz * 9;
      this.box("spawn pad", b.x, 0.04, spawnZ, 4.3, 0.05, 2.4, "#365b61");
      this.label(b.team + " SPAWN", b.x, spawnZ, c, 3.5);
    }
    office01.walls.forEach((b) => this.wall(b.x, b.z, b.w, b.d));
    for (const p of office01.props) {
      const meshStart = this.scene.meshes.length;
      const obstacleStart = this.obstacles.length;
      const { x, z } = p;
      let w = p.w ?? 2,
        d = p.d ?? 1;
      if (p.kind === "desk" || p.kind === "counter") {
        this.box(p.kind, x, 0.95, z, w, 0.18, d, "#b5a58b", true);
        this.box("pedestal", x, 0.44, z, w * 0.72, 0.85, d * 0.65, "#405561");
        if (p.kind === "desk") {
          this.box("screen", x, 1.45, z + 0.2, 0.9, 0.65, 0.12, "#182c39");
          this.box(
            "display",
            x,
            1.46,
            z + 0.13,
            0.76,
            0.48,
            0.02,
            "#68c5cc",
            false,
            true,
          );
          this.box("keyboard", x, 1.06, z - 0.2, 0.7, 0.035, 0.25, "#263b49");
          this.box("chair", x, 0.5, z - 1, 0.75, 0.15, 0.7, "#314753");
          this.box("chair back", x, 0.85, z - 1.3, 0.75, 0.7, 0.14, "#314753");
        }
      } else if (p.kind === "sofa") {
        this.box("sofa", x, 0.4, z, 2.7, 0.8, 1.1, "#b27a59", true);
        this.box("sofa back", x, 0.85, z + 0.45, 2.7, 0.65, 0.22, "#c5926b");
        for (const dx of [-1.25, 1.25])
          this.box("arm", x + dx, 0.7, z, 0.2, 0.45, 1.1, "#c5926b");
      } else if (p.kind === "plant") {
        this.box("planter", x, 0.35, z, 1, 0.7, 1, "#c2b6a1", true);
        for (let i = 0; i < 5; i++) {
          const m = MeshBuilder.CreateSphere(
            "leaves",
            { diameter: 0.9, segments: 4 },
            this.scene,
          );
          m.position.set(
            x + Math.sin(i * 2) * 0.3,
            1.1 + (i % 2) * 0.3,
            z + Math.cos(i * 2) * 0.3,
          );
          m.scaling.y = 1.4;
          m.material = this.mat(i % 2 ? "#4b947d" : "#72ad82");
          m.isPickable = false;
          this.shadows.addShadowCaster(m);
        }
      } else if (p.kind === "glass") {
        const m = this.box("glass", x, 1, z, w, 2, d, "#8bd0d4", true);
        const mat = this.mat("#8bd0d4");
        mat.alpha = 0.24;
        m.material = mat;
        this.box("frame", x, 2, z, w, 0.07, 0.1, "#394f5e");
      } else if (p.kind === "pillar") {
        this.box("column", x, 1.3, z, 0.65, 2.6, 0.65, "#d0cbb7", true);
        this.box("column foot", x, 0.12, z, 0.9, 0.24, 0.9, "#344d58");
      } else {
        this.box(
          p.kind,
          x,
          0.9,
          z,
          1.3,
          1.8,
          1.1,
          p.kind === "server" ? "#243c4c" : "#9daaaa",
          true,
        );
        if (p.kind === "server")
          for (let y = 0.4; y < 1.7; y += 0.25) {
            this.box("server slot", x, y, z - 0.56, 1, 0.1, 0.02, "#11222e");
            this.box(
              "status LED",
              x + 0.4,
              y,
              z - 0.58,
              0.07,
              0.06,
              0.025,
              "#64edbe",
              false,
              true,
            );
          }
      }
      if (p.destructible)
        this.destructibles.push(
          new Destructible(
            this,
            p,
            this.scene.meshes.slice(meshStart) as Mesh[],
            this.obstacles.slice(obstacleStart),
            this.explosions,
          ),
        );
    }
    this.label("COMBAT ATRIUM", 0, 14, "#d3d8c6", 7);
    this.label("BREAKABLE COVER", 0, 10, "#edcb89", 4);
  }
  wall(x: number, z: number, w: number, d: number) {
    this.box("wall", x, 0.95, z, w, 1.9, d, "#adbaaf", true);
    this.box("wall cap", x, 1.94, z, w + 0.04, 0.1, d + 0.04, "#d8d8c4");
    this.box("skirting", x, 0.13, z, w + 0.04, 0.18, d + 0.04, "#334b55");
  }
  coreDoor(team: Team, x: number, z: number, w: number, d: number) {
    const meshStart = this.scene.meshes.length;
    const obstacleStart = this.obstacles.length;
    this.box(
      `${team} core security door`,
      x,
      0.95,
      z,
      w,
      1.9,
      d,
      "#33444e",
      true,
    );
    this.box(
      "door warning stripe",
      x,
      1.55,
      z,
      w + 0.04,
      0.12,
      d + 0.04,
      TEAMS[team],
      false,
      true,
    );
    this.destructibles.push(
      new Destructible(
        this,
        { kind: "coreDoor", x, z, w, d, team, destructible: true },
        this.scene.meshes.slice(meshStart) as Mesh[],
        this.obstacles.slice(obstacleStart),
        this.explosions,
      ),
    );
  }
}
