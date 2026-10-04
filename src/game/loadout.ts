import { WEAPONS, type WeaponId } from "../config/weapons";
import type { Weapons } from "../weapons/system";
export const START_WEAPONS = [
  "machineGun",
  "burstGun",
  "pulseGun",
  "bazooka",
  "coreBuster",
] as const;
export interface Loadout {
  weapon: WeaponId;
  skill: "pulseTrap" | "superMedkit" | "rcCar";
}
export function validLoadout(value: unknown): value is Loadout {
  if (!value || typeof value !== "object") return false;
  const v = value as Loadout;
  return (
    Object.keys(v).every((k) => k === "weapon" || k === "skill") &&
    START_WEAPONS.some((w) => w === v.weapon) &&
    ["pulseTrap", "superMedkit", "rcCar"].includes(v.skill)
  );
}
export function applyLoadout(w: Weapons, choice: Loadout) {
  w.specialWeapon = undefined;
  w.pulseTrapSelected = false;
  w.ammunition[choice.weapon] = WEAPONS[choice.weapon].ammo;
  w.equip(choice.weapon);
  w.utilityKind = choice.skill;
  w.utilityCount = 2;
}
