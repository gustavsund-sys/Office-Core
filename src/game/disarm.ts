import { blocked } from "./collision";
import type { Weapons } from "../weapons/system";
import type { Player } from "../player/player";
export class Disarm {
  target?: { owner: Weapons; charge: Weapons["charges"][number] };
  elapsed = 0;
  update(
    player: Player,
    owners: Weapons[],
    requested: boolean,
    firing: boolean,
    dt: number,
  ) {
    const reachable = (charge: Weapons["charges"][number]) => {
      for (let i = 1; i <= 20; i++) {
        const t = i / 20;
        const p = player.root.position,
          q = charge.mesh.position;
        if (
          blocked(
            p.x + (q.x - p.x) * t,
            p.z + (q.z - p.z) * t,
            0.02,
            player.world.obstacles,
          )
        )
          return false;
      }
      return true;
    };
    const near = (charge: Weapons["charges"][number]) =>
      player.grounded &&
      Math.hypot(
        player.root.position.x - charge.mesh.position.x,
        player.root.position.z - charge.mesh.position.z,
      ) <= 1.2 &&
      reachable(charge);
    if (
      this.target &&
      (!this.target.owner.charges.includes(this.target.charge) ||
        !near(this.target.charge) ||
        player.hp <= 0 ||
        firing)
    )
      this.reset();
    if (!this.target && requested && player.hp > 0 && !firing) {
      for (const owner of owners) {
        const charge = owner.charges.find(near);
        if (charge) {
          this.target = { owner, charge };
          break;
        }
      }
    }
    if (!this.target) return false;
    this.elapsed += dt;
    if (this.elapsed + 1e-7 < 10) return true;
    const { owner, charge } = this.target;
    charge.mesh.dispose();
    owner.charges.splice(owner.charges.indexOf(charge), 1);
    this.reset();
    return true;
  }
  reset() {
    this.target = undefined;
    this.elapsed = 0;
  }
}
