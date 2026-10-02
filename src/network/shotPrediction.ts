import { WEAPONS, type WeaponId } from "../config/weapons";
/** Cosmetic only: this scheduler never changes health or authoritative ammo. */
export class ShotPrediction {
  cooldown = 0;
  burst = 0;
  weapon?: WeaponId;
  update(
    id: WeaponId,
    dt: number,
    fire: boolean,
    pressed: boolean,
    available: boolean,
  ) {
    if (id !== this.weapon) {
      this.weapon = id;
      this.cooldown = 0;
      this.burst = 0;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!available || id === "coreBuster") {
      this.burst = 0;
      return undefined;
    }
    if (id === "burstGun" && pressed && this.cooldown === 0 && this.burst === 0)
      this.burst = 5;
    if (
      this.cooldown > 0 ||
      !(id === "burstGun"
        ? this.burst > 0
        : WEAPONS[id].automatic
          ? fire || pressed
          : pressed)
    )
      return undefined;
    const audio = id !== "burstGun" || this.burst === 5;
    this.cooldown = 1 / WEAPONS[id].fireRate;
    if (id === "burstGun" && --this.burst === 0) this.cooldown = 1;
    return { audio };
  }
}
