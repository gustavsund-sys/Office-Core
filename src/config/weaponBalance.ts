import { WEAPONS, type WeaponId, type WeaponData } from "./weapons";

/** Shared by authoritative weapons and cosmetic prediction. Never mutate base stats. */
export function weaponStats(id: WeaponId, mobile = false): WeaponData {
  const base = WEAPONS[id];
  if (mobile && id === "pistol") return { ...base, fireRate: base.fireRate / 2, damage: base.damage * 0.85 };
  if (mobile && id === "bazooka") return { ...base, fireRate: 0.5 };
  return base;
}
