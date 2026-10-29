import { Color3, Mesh, MeshBuilder, SpotLight, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import { heldWeapon } from "../weapons/models";
import type { World } from "../map/builder";
import { tacticalShieldModel } from "../player/tacticalShield";
import { beaconModel } from "./beacon";
import { keyModel } from "./bossLookout";
import { SUPPLY_DESCENT, type SupplyState } from "./supplyDrop";

/** Height of the bottom of the crate above the landing surface, in metres. */
export function supplyDropHeight(remaining: number) {
  return Math.max(0, Math.min(SUPPLY_DESCENT, remaining)) * (70 / SUPPLY_DESCENT);
}

/** Client-only models; authoritative availability is always read from the snapshot. */
export class SupplyDropVisuals {
  private root?: TransformNode;
  private load?: TransformNode;
  private items: TransformNode[] = [];
  private marker?: Mesh;
  private beaconPivot?: TransformNode;
  private beaconLight?: SpotLight;
  private lampMaterial?: StandardMaterial;
  private where = "";
  private wasFalling = false;
  private landedAt = 0;
  constructor(private world: World) {}
  clear() { this.beaconLight?.dispose(); this.root?.dispose(); this.lampMaterial?.dispose(); this.lampMaterial = undefined; this.beaconPivot = undefined; this.beaconLight = undefined; this.root = undefined; this.load = undefined; this.marker = undefined; this.items = []; this.where = ""; this.wasFalling = false; this.landedAt = 0; }
  update(state?: SupplyState) {
    if (!state) { if (this.root) this.clear(); return; }
    const where = `${state.x}:${state.z}`;
    if (!this.root || this.where !== where) {
      this.clear(); this.where = where;
      const root = this.root = new TransformNode("special supply drop", this.world.scene);
      root.position.set(state.x, 0, state.z);
      const marker = this.marker = MeshBuilder.CreateDisc("supply landing shadow", { radius: 4.8, tessellation: 32 }, this.world.scene);
      marker.rotation.x = Math.PI / 2; marker.position.y = 0.035; marker.parent = root;
      const shadow = this.world.mat("#24323b"); marker.material = shadow; marker.visibility = 0.58; marker.isPickable = false;
      const ring = MeshBuilder.CreateTorus("supply landing marker", { diameter: 9.6, thickness: 0.14, tessellation: 32 }, this.world.scene);
      ring.parent = root; ring.position.y = 0.06; ring.material = this.world.mat("#ffca58", true); ring.isPickable = false;
      const housing = new TransformNode("physical warning beacon housing", this.world.scene);
      housing.parent = root;
      housing.position.set(5.3, 0, 0);
      const pedestal = MeshBuilder.CreateCylinder("beacon metal base", { diameter: 0.85, height: 0.32, tessellation: 24 }, this.world.scene);
      pedestal.parent = housing; pedestal.position.y = 0.16; pedestal.material = this.world.finish("#343c42", "metal"); pedestal.isPickable = false;
      const dome = MeshBuilder.CreateSphere("beacon red glass dome", { diameter: 0.7, segments: 24 }, this.world.scene);
      dome.parent = housing; dome.position.y = 0.61; dome.scaling.y = 1.1; dome.isPickable = false;
      const glass = this.lampMaterial = new StandardMaterial("red beacon glass", this.world.scene);
      glass.diffuseColor = new Color3(0.55, 0.015, 0.02); glass.specularColor = new Color3(0.9, 0.7, 0.7); glass.specularPower = 96; glass.alpha = 0.55;
      dome.material = glass;
      const beacon = this.beaconPivot = new TransformNode("rotating beacon reflector", this.world.scene);
      beacon.parent = housing; beacon.position.y = 0.61;
      const reflector = MeshBuilder.CreateSphere("beacon silver reflector", { diameter: 0.45, segments: 16 }, this.world.scene);
      reflector.parent = beacon; reflector.scaling.x = 0.18; reflector.position.x = -0.12;
      reflector.material = this.world.finish("#b9c0c5", "metal"); reflector.isPickable = false;
      const bulb = MeshBuilder.CreateSphere("beacon bulb", { diameter: 0.18, segments: 12 }, this.world.scene);
      bulb.parent = beacon; bulb.material = glass; bulb.isPickable = false;
      const light = this.beaconLight = new SpotLight("supply rotating red light", new Vector3(state.x + 5.3, 0.65, state.z), new Vector3(1, -0.35, 0), Math.PI / 2.7, 2, this.world.scene);
      light.renderPriority = 25; light.diffuse = new Color3(1, 0.02, 0.02); light.specular = new Color3(0.5, 0.01, 0.01); light.intensity = 4; light.range = 12;
      const load = this.load = new TransformNode("supply airborne load", this.world.scene); load.parent = root;
      const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string) => {
        const m = this.world.box(name, x, y, z, w, h, d, color); m.parent = load; m.isPickable = false; return m;
      };
      box("supply crate", 0, 1.1, 0, 2.8, 2.2, 2.5, "#716340");
      for (const x of [-1.0, 1.0]) box("crate metal strap", x, 1.1, 0, 0.16, 2.28, 2.58, "#263b40");
      box("crate lid", 0, 2.25, 0, 2.95, 0.18, 2.65, "#a38b58");
      // Reinforced shipping crate with panel seams, corner guards and lid latches.
      for (const z of [-1.27, 1.27]) {
        for (const y of [0.55, 1.1, 1.65])
          box("crate panel seam", 0, y, z, 2.75, 0.025, 0.025, "#4f4937");
        for (const x of [-1.32, 1.32])
          box("crate corner guard", x, 1.1, z, 0.19, 2.24, 0.09, "#38464b");
        for (const x of [-1, 1]) {
          box("crate lid latch", x, 2.03, z * 1.025, 0.28, 0.3, 0.07, "#a1a9a6");
          box("crate latch catch", x, 2.02, z * 1.06, 0.1, 0.12, 0.04, "#344047");
        }
        box("supply identification plate", 0, 1.35, z * 1.025, 1.02, 0.6, 0.035, "#d2bc7c");
        box("supply plate marking", 0, 1.35, z * 1.05, 0.65, 0.09, 0.02, "#333e40");
      }
      for (const x of [-1.43, 1.43]) {
        box("crate carrying handle", x, 1.55, 0, 0.08, 0.14, 0.65, "#354449");
        for (const z of [-0.29, 0.29])
          box("handle mount", x, 1.42, z, 0.09, 0.25, 0.12, "#687579");
      }
      for (const x of [-1.15, 1.15]) for (const z of [-1.05, 1.05]) {
        const eye = MeshBuilder.CreateTorus("cargo suspension eye", { diameter: 0.22, thickness: 0.055, tessellation: 12 }, this.world.scene);
        eye.parent = load; eye.position.set(x, 2.4, z); eye.rotation.x = Math.PI / 2;
        eye.material = this.world.mat("#a4aaa0"); eye.isPickable = false;
      }
      // Inflated round cargo canopy: individual gores bulge between stitched seams.
      // The skirt turns inward slightly, leaving a visibly open, shaded underside.
      const gores = 28;
      const rows = 20;
      const columns = 6;
      const fabric = ["#858678", "#929284", "#7b7e72", "#898b7e"].map((color) => this.world.mat(color));
      const cordMaterial = this.world.mat("#56594e");
      const canopyPoint = (gore: number, across: number, down: number) => {
        const theta = down * Math.PI * 0.56;
        const angle = (gore + across) * Math.PI * 2 / gores;
        const inflation = Math.sin(across * Math.PI) * Math.sin(theta) * 0.14;
        const radius = Math.sin(theta) * 4.1 + inflation;
        return new Vector3(Math.cos(angle) * radius, 10.5 + Math.cos(theta) * 2.6 + inflation * 0.5, Math.sin(angle) * radius);
      };
      for (let gore = 0; gore < gores; gore++) {
        const paths: Vector3[][] = [];
        for (let col = 0; col <= columns; col++) {
          paths.push(Array.from({ length: rows + 1 }, (_, row) => canopyPoint(gore, col / columns, row / rows)));
        }
        const panel = MeshBuilder.CreateRibbon("parachute inflated fabric panel", {
          pathArray: paths, sideOrientation: Mesh.DOUBLESIDE,
        }, this.world.scene);
        panel.parent = load; panel.material = fabric[gore % fabric.length]; panel.isPickable = false;
        const seam = MeshBuilder.CreateTube("parachute stitched radial seam", {
          path: paths[0], radius: 0.012, tessellation: 4,
        }, this.world.scene);
        seam.parent = load; seam.material = cordMaterial; seam.isPickable = false;
        const angle = gore * Math.PI * 2 / gores;
        const attachment = new Vector3(Math.cos(angle) * 1.15, 2.4, Math.sin(angle) * 1.05);
        const cord = MeshBuilder.CreateTube("parachute suspension line", {
          path: [canopyPoint(gore, 0, 1), attachment], radius: 0.018, tessellation: 4,
        }, this.world.scene);
        cord.parent = load; cord.material = cordMaterial; cord.isPickable = false;
      }
      const hem = MeshBuilder.CreateTube("parachute reinforced skirt hem", {
        path: Array.from({ length: gores * columns + 1 }, (_, i) => canopyPoint(Math.floor(i / columns), (i % columns) / columns, 1)),
        radius: 0.025, tessellation: 4,
      }, this.world.scene);
      hem.parent = load; hem.material = cordMaterial; hem.isPickable = false;
      this.items = state.items.map((item) => {
        const anchor = new TransformNode(`supply ${item.kind}`, this.world.scene);
        anchor.parent = root; anchor.position.set(item.x - state.x, 0.65, item.z - state.z);
        const model = item.kind === "bossKey" ? keyModel(this.world) : item.kind === "shield" ? tacticalShieldModel(this.world) : item.kind === "coreBuster" ? heldWeapon(this.world, "coreBuster") : beaconModel(this.world, "BLUE").root;
        model.parent = anchor; model.scaling.setAll(item.kind === "beacon" ? 0.65 : item.kind === "bossKey" ? 1 : 1.2);
        return anchor;
      });
    }
    const falling = state.remaining > 0;
    const visible = falling || state.items.some((item) => item.available);
    this.root!.setEnabled(visible);
    this.beaconLight!.setEnabled(falling);
    if (falling && !this.wasFalling) this.world.lighting?.receivers(this.beaconLight!);
    this.lampMaterial!.emissiveColor.set(falling ? 1 : 0, 0, 0);
    const angle = performance.now() * 0.003;
    if (falling) this.beaconPivot!.rotation.y = angle;
    this.beaconLight!.direction.set(Math.cos(angle), -0.15, -Math.sin(angle));
    if (!falling && this.wasFalling) this.landedAt = performance.now();
    this.wasFalling = falling;
    this.load!.setEnabled(falling);
    // Use descent time, so all clients see the same sway. Settle before touchdown.
    const elapsed = SUPPLY_DESCENT - Math.max(0, Math.min(SUPPLY_DESCENT, state.remaining));
    const settle = Math.min(1, Math.max(0, state.remaining) / 4);
    const amplitude = settle * settle * (3 - 2 * settle);
    this.load!.position.set(Math.sin(elapsed * 1.05) * 0.45 * amplitude,
      supplyDropHeight(state.remaining), Math.sin(elapsed * 0.8) * 0.3 * amplitude);
    this.load!.rotation.set(Math.sin(elapsed * 0.8) * 0.025 * amplitude,
      Math.sin(elapsed * 0.38) * 0.09 * amplitude, Math.sin(elapsed * 1.05) * 0.035 * amplitude);
    const t = this.landedAt ? Math.min(1, (performance.now() - this.landedAt) / 650) : 1;
    const spread = 1 - (1 - t) * (1 - t);
    this.items.forEach((item, i) => {
      const reward = state.items[i];
      item.setEnabled(!falling && !!reward?.available);
      if (reward && !falling) item.position.set((reward.x - state.x) * spread, 0.65 + Math.sin(t * Math.PI) * 0.7, (reward.z - state.z) * spread);
    });
    this.marker!.visibility = falling ? 0.58 : 0.25;
  }
}
