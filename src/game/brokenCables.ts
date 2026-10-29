import { Color3, MeshBuilder, PointLight, TransformNode, Vector3 } from "@babylonjs/core";
import type { World } from "../map/builder";
import { office01 } from "../maps/office01";
import { enclosedOfficeZones } from "../map/officeDeadZones";
import { cutFloorOpenings } from "../map/floorSurfaces";
import { OFFICE_WINDOWS } from "../map/lowerOffice";
import { ROOF_FINISH_Y } from "../map/surfaceHeights";
import { preparedMediaUrl } from "../network/preloadedMedia";

/** Damaged overhead wiring at five fixed, clear locations. */
export class BrokenCables {
  private sites: { x: number; z: number; sparks: TransformNode; next: number; active: number }[] = [];
  private light: PointLight;
  private audio = new Audio(preparedMediaUrl("/audio/effects/electric-sparks.mp3"));
  private pending = false;
  private desired = false;
  private lastSite = -1;
  private lastFilter = 0;
  private time = 0;
  constructor(private world: World) {
    const anchors = [[-65, 14], [-40, -26], [0, -20], [40, -26], [65, 14]];
    // Use the same clipped rectangles as the dark technical roofs, so the entire
    // cable and transformer sit on a real roof panel rather than above a corridor.
    const keepClear = [
      ...office01.footprint.map(r => ({ ...r, w: r.w + 0.35, d: r.d + 0.35 })),
      ...OFFICE_WINDOWS.map(r => ({ ...r, z: r.z - 0.45, w: r.w + 0.6, d: r.d + 1.5 })),
    ];
    const patches = enclosedOfficeZones(office01.footprint)
      .flatMap(zone => cutFloorOpenings(zone.patches, keepClear))
      .filter(r => r.w >= 6.5 && r.d >= 1.5);
    for (const [ax, az] of anchors) {
      const candidates = patches.filter(r => this.sites.every(p => Math.hypot(r.x - p.x, r.z - p.z) > 12));
      candidates.sort((a, b) => Math.hypot(a.x - ax, a.z - az) - Math.hypot(b.x - ax, b.z - az) || a.x - b.x || a.z - b.z);
      const site = candidates[0]; if (!site) continue;
      const length = Math.min(9, site.w / 2 - 0.65);
      const root = new TransformNode("damaged electrical cable", world.scene); root.position.set(site.x, ROOF_FINISH_Y, site.z);
      for (const transformerX of [-length, length]) {
      const transformer = MeshBuilder.CreateBox("ceiling transformer", { width: 1.05, height: 0.55, depth: 0.9 }, world.scene);
      transformer.parent = root; transformer.position.set(transformerX, 0.28, 0); transformer.material = world.mat("#59646a"); transformer.isPickable = false;
      const label = MeshBuilder.CreateBox("electrical hazard label", { width: 0.5, height: 0.4, depth: 0.025 }, world.scene);
      label.parent = root; label.position.set(transformerX, 0.28, -0.465); label.material = world.mat("#f6cf37"); label.isPickable = false;
      const bolt = MeshBuilder.CreateLines("electrical hazard lightning symbol", { points: [new Vector3(transformerX + 0.06, 0.44, -0.482), new Vector3(transformerX - 0.08, 0.27, -0.482), new Vector3(transformerX + 0.02, 0.27, -0.482), new Vector3(transformerX - 0.06, 0.12, -0.482)] }, world.scene);
      bolt.parent = root; bolt.color = new Color3(0.08, 0.08, 0.05); bolt.isPickable = false;
      }
      for (const side of [-1, 1]) {
        const end = length - 0.53;
        const path = Array.from({ length: 33 }, (_, i) => {
          const t = i / 32;
          const x = side * (0.22 + (end - 0.22) * t);
          // Gentle bends vanish at the broken tips and at the box connection.
          const z = Math.sin(t * Math.PI) * (0.34 * Math.sin(t * 7 + side) + 0.17 * Math.sin(t * 13));
          const y = 0.09 + 0.19 * t * t;
          return new Vector3(x, y, z);
        });
        const cable = MeshBuilder.CreateTube("flexible broken cable", { path, radius: 0.09, tessellation: 10, cap: 3 }, world.scene);
        cable.parent = root; cable.material = world.mat("#222d34"); cable.isPickable = false;
        const core = MeshBuilder.CreateTube("exposed copper cable end", { path: [new Vector3(side * 0.22, 0.09, 0), new Vector3(side * 0.09, 0.10, 0)], radius: 0.035, tessellation: 6 }, world.scene);
        core.parent = root; core.material = world.mat("#c88c54"); core.isPickable = false;
      }
      const sparks = new TransformNode("blue electrical sparks", world.scene); sparks.parent = root;
      // Jagged blue-white arc bridges the two exposed wire ends.
      const arcPath = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return new Vector3(-0.09 + 0.18 * t, 0.11 + Math.sin(t * Math.PI) * 0.11 + (i % 2 ? 0.035 : 0), (i === 0 || i === 8 ? 0 : (i % 2 ? 0.045 : -0.045)));
      });
      for (const [radius, color] of [[0.045, "#2374e5"], [0.018, "#c8efff"]] as const) {
        const arc = MeshBuilder.CreateTube("electrical arc across cable break", { path: arcPath, radius, tessellation: 6 }, world.scene);
        arc.parent = sparks; arc.material = world.mat(color, true); arc.isPickable = false;
      }
      sparks.setEnabled(false);
      this.sites.push({ ...site, sparks, next: 4 + Math.random() * 2, active: 0 });
    }
    this.light = new PointLight("broken cable blue light", Vector3.Zero(), world.scene);
    this.light.diffuse = new Color3(0.08, 0.45, 1); this.light.specular = Color3.Black(); this.light.range = 7; this.light.renderPriority = 25; this.light.intensity = 0;
    this.audio.loop = true; this.audio.volume = 0;
  }
  update(dt: number, position: Vector3, audible: boolean) {
    this.time += dt;
    this.sites.forEach((site) => {
      site.next -= dt;
      if (site.next <= 0) { site.active = 0.22; site.next += 4 + Math.random() * 2; }
      site.active = Math.max(0, site.active - dt);
      site.sparks.setEnabled(site.active > 0);
    });
    let nearest = -1, distance = Infinity;
    this.sites.forEach((site, i) => { const d = Math.hypot(position.x - site.x, position.z - site.z); if (d < distance) { distance = d; nearest = i; } });
    const site = this.sites[nearest];
    if (site) {
      this.light.position.set(site.x, ROOF_FINISH_Y + 0.5, site.z);
      this.light.intensity = site.active > 0 && distance < 35 ? 1.3 : 0;
      this.lastFilter += dt;
      if (nearest !== this.lastSite || this.lastFilter > 1) { this.world.lighting?.receivers(this.light); this.lastSite = nearest; this.lastFilter = 0; }
    }
    this.audio.volume = 0.45 * Math.max(0, 1 - distance / 25);
    this.desired = audible && distance < 25 && !!site && site.active > 0;
    if (!this.desired) { if (!this.audio.paused) this.audio.pause(); }
    else if (this.audio.paused && !this.pending) {
      this.pending = true;
      void this.audio.play().catch(() => {}).finally(() => { this.pending = false; if (!this.desired && !this.audio.paused) this.audio.pause(); });
    }
  }
}
