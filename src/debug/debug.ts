import { MeshBuilder, type Mesh } from "@babylonjs/core";
import { office01 } from "../maps/office01";
import { CONFIG } from "../config/game";
import type { World } from "../map/builder";
import type { Player } from "../player/player";
import type { Weapons } from "../weapons/system";
import type { Pickup } from "../pickups/pickup";
import type { Damageable } from "../core/damageable";
export class Debug {
  enabled = false;
  bounds: Mesh[] = [];
  obstacles: World["obstacles"] = [];
  world: World;
  el = document.querySelector<HTMLElement>("#debug")!;
  constructor(world: World, player: Player) {
    this.world = world;
    this.obstacles = [...world.obstacles];
    for (const b of world.obstacles) {
      const m = MeshBuilder.CreateBox(
        "collision boundary",
        { width: b.w, height: 0.12, depth: b.d },
        world.scene,
      );
      m.position.set(b.x, 0.15, b.z);
      const mat = world.mat("#ff5588").clone("debug wire");
      mat.wireframe = true;
      m.material = mat;
      m.isPickable = false;
      m.setEnabled(false);
      this.bounds.push(m);
    }
    window.addEventListener("keydown", (e) => {
      if (this.enabled && e.code === "Digit1")
        player.root.position.set(0, 0, 1);
      if (this.enabled && /^Digit[2-3]$/.test(e.code)) {
        const b = office01.bases[Number(e.code.slice(-1)) - 2];
        player.root.position.set(b.spawn.x, 0, b.spawn.z);
      }
      if (e.code === "F2" && !e.repeat) {
        this.enabled = !this.enabled;
        this.el.style.display = this.enabled ? "block" : "none";
        this.bounds.forEach((m, i) =>
          m.setEnabled(
            this.enabled && world.obstacles.includes(this.obstacles[i]),
          ),
        );
      }
    });
  }
  update(
    fps: number,
    player: Player,
    w: Weapons,
    p: Pickup,
    cores: Damageable[],
  ) {
    if (!this.enabled) return;
    this.bounds.forEach((m, i) =>
      m.setEnabled(this.world.obstacles.includes(this.obstacles[i])),
    );
    const v = player.root.position;
    this.el.textContent = `DEBUG / F2\nFPS ${fps.toFixed(0)}\nPLAYER ${v.x.toFixed(2)}, ${v.z.toFixed(2)} / HP ${player.hp}\nCAMERA ${JSON.stringify(CONFIG.camera)}\nWEAPON ${w.id} / AMMO ${w.ammo}\nWEAPON DROPS ${p.endpoints.length} / AMMO DROPS ${p.ammoDrops.length}\n${cores.map((c) => `${c.team} ${c.hp}`).join(" · ")}\nPINK = COLLISION BOUNDS\nTELEPORT: 1 Reception / 2 Red / 3 Blue`;
  }
}
