export type WeaponId = "pistol" | "machineGun" | "bazooka" | "burstGun" | "pulseGun" | "coreBuster";
export interface WeaponData {
  name: string;
  damage: number;
  fireRate: number;
  range: number;
  ammo: number;
  automatic: boolean;
}
export const WEAPONS: Record<WeaponId, WeaponData> = {
  pistol: {
    name: "PISTOL",
    damage: 20,
    fireRate: 4,
    range: 20,
    ammo: 60,
    automatic: false,
  },
  coreBuster: { name: "CORE BUSTER", damage: 1000, fireRate: 1, range: 4, ammo: 1, automatic: false },
  bazooka: { name: "BAZOOKA", damage: 120, fireRate: 1, range: 40, ammo: 3, automatic: false },
  burstGun: { name: "BURST GUN", damage: 8, fireRate: 12.5, range: 25, ammo: 100, automatic: false },
  pulseGun: { name: "PULSE GUN", damage: 21, fireRate: 4, range: 20, ammo: 30, automatic: false },
  machineGun: {
    name: "MACHINE GUN",
    damage: 8,
    fireRate: 10,
    range: 20,
    ammo: 100,
    automatic: true,
  },
};
