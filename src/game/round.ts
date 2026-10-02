import type { World } from "../map/builder";
import type { Damageable } from "../core/damageable";
import type { Weapons } from "../weapons/system";
import type { Pickup } from "../pickups/pickup";
export function resetRound(
  world: World,
  cores: Damageable[],
  weapons: Weapons[],
  pickup: Pickup,
) {
  world.destructibles.forEach((p) => p.reset());
  cores.forEach((c) => {
    c.hp = c.maxHp;
    c.flash = 0;
    c.respawn = 0;
    c.bar.scaling.x = 1;
    c.mesh.setEnabled(true);
  });
  for (const w of weapons) {
    for (const c of w.charges) c.mesh.dispose();
    w.charges = [];
    for (const r of w.rockets) r.mesh.dispose();
    w.rockets = [];
    for (const t of w.trail) t.mesh.dispose();
    w.trail = [];
    w.specialWeapon = undefined;
    w.warcryAvailable = false;
    w.player.invulnerable = 0;
    w.ammunition = {
      pistol: 60,
      machineGun: 100,
      bazooka: 3,
      burstGun: 100,
      pulseGun: 30,
      coreBuster: 1,
    };
    w.bazookaReserve = 0;
    w.cooldown = 0;
    w.equip("pistol");
    w.player.hp = 100;
    w.player.verticalVelocity = 0;
    w.player.root.setEnabled(true);
  }
  pickup.reset();
}
