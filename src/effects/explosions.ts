import {
  Mesh,
  MeshBuilder,
  PointLight,
  StandardMaterial,
  Vector3,
  Color3,
} from "@babylonjs/core";
import type { World } from "../map/builder";
interface Particle {
  mesh: Mesh;
  velocity: Vector3;
  spin: Vector3;
  life: number;
  maxLife: number;
  kind: "debris" | "smoke" | "flash" | "ring" | "spawn";
}
export class Explosions {
  particles: Particle[] = [];
  lights: { light: PointLight; life: number }[] = [];
  constructor(
    public world: World,
    public onBurst: (position: Vector3, power: number, sound?: string) => void = () => {},
  ) {}
  burst(position: Vector3, color: string, power = 1, sound?: string) {
    // Bound transient GPU resources during rapid destruction.
    while (this.particles.length > 220) this.remove(this.particles.shift()!);
    const scene = this.world.scene;
    const add = (
      mesh: Mesh,
      kind: Particle["kind"],
      life: number,
      velocity = Vector3.Zero(),
    ) => {
      mesh.position.copyFrom(position);
      mesh.isPickable = false;
      this.particles.push({
        mesh,
        kind,
        life,
        maxLife: life,
        velocity,
        spin: new Vector3(
          Math.random() * 8,
          Math.random() * 8,
          Math.random() * 8,
        ),
      });
    };
    const flash = MeshBuilder.CreateSphere(
      "explosion flash",
      { diameter: 1, segments: 6 },
      scene,
    );
    flash.material = this.world.mat("#ffca70", true).clone("burst material");
    add(flash, "flash", 0.22);
    const ring = MeshBuilder.CreateTorus(
      "shockwave",
      { diameter: 1, thickness: 0.055, tessellation: 40 },
      scene,
    );
    ring.material = this.world.mat("#ffe8ad", true).clone("ring material");
    add(ring, "ring", 0.45);
    ring.position.y = 0.12;
    for (let i = 0; i < 22; i++) {
      const chunk = MeshBuilder.CreateBox(
        "flying debris",
        {
          width: 0.12 + Math.random() * 0.3,
          height: 0.1 + Math.random() * 0.15,
          depth: 0.12 + Math.random() * 0.25,
        },
        scene,
      );
      chunk.material = this.world
        .mat(i % 4 === 0 ? "#ffc068" : color)
        .clone("debris material");
      const a = Math.random() * Math.PI * 2,
        speed = (2 + Math.random() * 5) * power;
      add(
        chunk,
        "debris",
        1.1 + Math.random() * 0.6,
        new Vector3(
          Math.cos(a) * speed,
          3 + Math.random() * 5,
          Math.sin(a) * speed,
        ),
      );
    }
    for (let i = 0; i < 8; i++) {
      const smoke = MeshBuilder.CreateSphere(
        "smoke puff",
        { diameter: 0.5 + Math.random() * 0.4, segments: 5 },
        scene,
      );
      const mat = new StandardMaterial("smoke material", scene);
      mat.diffuseColor = Color3.FromHexString(i % 2 ? "#45515b" : "#859393");
      mat.specularColor = Color3.Black();
      mat.alpha = 0.6;
      smoke.material = mat;
      add(
        smoke,
        "smoke",
        0.7 + Math.random() * 0.6,
        new Vector3(
          (Math.random() - 0.5) * 3,
          1 + Math.random() * 2,
          (Math.random() - 0.5) * 3,
        ),
      );
    }
    if (this.lights.length < 4) {
      const light = new PointLight("explosion light", position.clone(), scene);
      light.diffuse = Color3.FromHexString("#ffc57d");
      light.range = 8;
      light.intensity = 5;
      this.lights.push({ light, life: 0.18 });
    }
    this.onBurst(position, power, sound);
  }
  playerDeath(position: Vector3, teamColor: string) {
    while (this.particles.length > 220) this.remove(this.particles.shift()!);
    for (let i = 0; i < 30; i++) {
      const mesh = MeshBuilder.CreateBox("player fragment", { size: 0.12 + Math.random() * 0.18 }, this.world.scene);
      mesh.position.copyFrom(position.add(new Vector3((Math.random() - 0.5) * 0.55, 0.3 + Math.random() * 1.4, (Math.random() - 0.5) * 0.4)));
      mesh.material = this.world.mat(i % 3 === 0 ? teamColor : i % 3 === 1 ? "#efdfbd" : "#253a4c").clone("player fragment fade");
      mesh.isPickable = false;
      const life = 1.4 + Math.random() * 0.8;
      this.particles.push({ mesh, kind: "debris", life, maxLife: life, velocity: new Vector3((Math.random() - 0.5) * 7, 2 + Math.random() * 4, (Math.random() - 0.5) * 7), spin: new Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
    }
  }
  playerSpawn(position: Vector3, color: string) {
    const ring = MeshBuilder.CreateTorus("spawn energy ring", { diameter: 0.6, thickness: 0.06, tessellation: 40 }, this.world.scene);
    ring.position.copyFrom(position.add(new Vector3(0, 0.08, 0)));
    ring.material = this.world.mat(color, true).clone("spawn ring fade");
    ring.isPickable = false;
    this.particles.push({ mesh: ring, kind: "ring", life: 0.8, maxLife: 0.8, velocity: Vector3.Zero(), spin: Vector3.Zero() });
    for (let i = 0; i < 22; i++) {
      const mesh = MeshBuilder.CreateSphere("spawn energy particle", { diameter: 0.08, segments: 4 }, this.world.scene);
      const angle = i / 22 * Math.PI * 2;
      mesh.position.copyFrom(position.add(new Vector3(Math.cos(angle) * 0.65, Math.random() * 0.5, Math.sin(angle) * 0.65)));
      mesh.material = this.world.mat(color, true).clone("spawn particle fade");
      mesh.isPickable = false;
      const life = 0.7 + Math.random() * 0.5;
      this.particles.push({ mesh, kind: "spawn", life, maxLife: life, velocity: new Vector3(0, 1.5 + Math.random(), 0), spin: Vector3.Zero() });
    }
  }
  private remove(p: Particle) {
    p.mesh.dispose(false, true);
  }
  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        this.remove(p);
        continue;
      }
      const age = 1 - p.life / p.maxLife;
      const mat = p.mesh.material as StandardMaterial;
      if (p.kind === "debris") {
        p.velocity.y -= 15 * dt;
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        p.mesh.rotation.addInPlace(p.spin.scale(dt));
        if (p.mesh.position.y < 0.12) {
          p.mesh.position.y = 0.12;
          p.velocity.y = Math.abs(p.velocity.y) * 0.25;
          p.velocity.x *= 0.65;
          p.velocity.z *= 0.65;
        }
        mat.alpha = Math.min(1, p.life * 3);
      } else if (p.kind === "spawn") {
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        mat.alpha = 1 - age;
      } else if (p.kind === "smoke") {
        p.mesh.position.addInPlace(p.velocity.scale(dt));
        p.mesh.scaling.setAll(1 + age * 3);
        mat.alpha = (1 - age) * 0.48;
      } else {
        p.mesh.scaling.setAll(p.kind === "ring" ? 1 + age * 9 : 0.3 + age * 4);
        mat.alpha = 1 - age;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const l of this.lights) {
      l.life -= dt;
      l.light.intensity = Math.max(0, l.life / 0.18) * 5;
      if (l.life <= 0) l.light.dispose();
    }
    this.lights = this.lights.filter((l) => l.life > 0);
  }
}
