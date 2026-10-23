import type { WeaponId } from "../config/weapons";
import {
  Color3,
  Constants,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
  type Scene,
} from "@babylonjs/core";
export type MuzzleWeapon = WeaponId | "turret";
export const WEAPON_FLASHES: Partial<Record<MuzzleWeapon, readonly number[]>> =
  {
    turret: [4],
    machineGun: [4, 5, 6],
    huntingRifle: [1],
    pistol: [7, 8, 9],
    burstGun: [7, 8, 9],
  };
export function muzzleTexture(weapon?: MuzzleWeapon, random = Math.random()) {
  const choices = weapon && WEAPON_FLASHES[weapon];
  if (!choices) return `/vfx/muzzle/flash-${random < 0.5 ? 1 : 2}.png`;
  return `/vfx/muzzle/numbered-${choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random * choices.length)))]}.png`;
}
interface Flash {
  root: TransformNode;
  planes: Mesh[];
  age: number;
  life: number;
  size: number;
}
/** Two crossed axial flames plus a face-on core: readable from every camera angle. */
export class MuzzleFlashes {
  private pool: Flash[] = [];
  private turretRoll = 0;
  private materials = new Map<string, StandardMaterial>();
  private textures = new Map<string, Texture>();
  constructor(private scene: Scene) {
    // Warm the shared textures once so the first shot can display immediately.
    for (const energy of [false, true]) {
      this.material(energy, false, muzzleTexture(undefined, 0));
      this.material(energy, false, muzzleTexture(undefined, 1));
      this.material(energy, true, "");
    }
    for (const choices of Object.values(WEAPON_FLASHES))
      for (const number of choices!)
        this.material(false, false, `/vfx/muzzle/numbered-${number}.png`);
  }
  private material(energy: boolean, core: boolean, path: string) {
    const url = core ? "/vfx/kenney/muzzle.png" : path;
    const key = `${energy}:${url}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const mat = new StandardMaterial(`muzzle flame ${key}`, this.scene);
    let texture = this.textures.get(url);
    if (!texture) {
      texture = new Texture(url, this.scene);
      this.textures.set(url, texture);
    }
    mat.diffuseTexture = texture;
    mat.diffuseTexture.hasAlpha = true;
    mat.useAlphaFromDiffuseTexture = true;
    mat.disableLighting = true;
    mat.emissiveColor = energy
      ? new Color3(1, 0.12, 0.2)
      : new Color3(1, 0.82, 0.48);
    mat.backFaceCulling = false;
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.disableDepthWrite = true;
    this.materials.set(key, mat);
    return mat;
  }
  emit(
    position: Vector3,
    direction: Vector3,
    energy = false,
    size = 1,
    weapon?: MuzzleWeapon,
  ) {
    let flash = this.pool.find((f) => !f.root.isEnabled());
    if (!flash && this.pool.length >= 32)
      flash = this.pool.reduce((a, b) => (a.age > b.age ? a : b));
    if (!flash) {
      const root = new TransformNode("crossed muzzle flash", this.scene);
      const planes: Mesh[] = [];
      for (let i = 0; i < 2; i++) {
        const mesh = new Mesh("axial flame", this.scene);
        const data = new VertexData();
        data.positions =
          i === 0
            ? [-0.23, 0, 0, 0.23, 0, 0, 0.23, 0, 0.9, -0.23, 0, 0.9]
            : [0, -0.23, 0, 0, 0.23, 0, 0, 0.23, 0.9, 0, -0.23, 0.9];
        // Align the bright ignition point (inside the padded texture) with the barrel.
        for (let z = 2; z < data.positions.length; z += 3)
          data.positions[z] -= 0.12;
        data.indices = [0, 1, 2, 0, 2, 3];
        data.uvs = [0, 0, 0, 1, 1, 1, 1, 0];
        data.normals = [];
        VertexData.ComputeNormals(data.positions, data.indices, data.normals);
        data.applyToMesh(mesh);
        mesh.parent = root;
        planes.push(mesh);
      }
      const core = MeshBuilder.CreatePlane(
        "muzzle forward core",
        { size: 0.16, sideOrientation: Mesh.DOUBLESIDE },
        this.scene,
      );
      core.parent = root;
      core.position.z = 0.025;
      core.billboardMode = Mesh.BILLBOARDMODE_ALL;
      planes.push(core);
      for (const p of planes) {
        p.isPickable = false;
        p.alwaysSelectAsActiveMesh = true;
      }
      flash = { root, planes, age: 0, life: 0.06, size: 1 };
      this.pool.push(flash);
    }
    const forward =
      direction.lengthSquared() > 1e-8
        ? direction.normalizeToNew()
        : Vector3.Forward();
    flash.root.position.copyFrom(position);
    if (weapon === "turret")
      this.turretRoll = (this.turretRoll - Math.PI / 36) % (Math.PI * 2);
    flash.root.rotationQuaternion = Quaternion.RotationYawPitchRoll(
      Math.atan2(forward.x, forward.z),
      -Math.asin(Math.max(-1, Math.min(1, forward.y))),
      weapon === "turret" ? this.turretRoll : 0,
    );
    flash.age = 0;
    flash.life = 0.045 + Math.random() * 0.025;
    flash.size = size * (0.9 + Math.random() * 0.2);
    flash.root.scaling.setAll(flash.size);
    flash.root.setEnabled(true);
    const texture = muzzleTexture(weapon);
    for (const p of flash.planes) {
      p.material = this.material(
        energy,
        p.name === "muzzle forward core",
        texture,
      );
      p.visibility = 1;
    }
  }
  update(dt: number) {
    for (const f of this.pool)
      if (f.root.isEnabled()) {
        f.age += dt;
        if (f.age >= f.life) {
          f.root.setEnabled(false);
          continue;
        }
        const t = f.age / f.life;
        f.root.scaling.setAll(f.size * (1 - t * 0.2));
        for (const p of f.planes) p.visibility = 1 - t * t;
      }
  }
}
