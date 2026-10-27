import { WEAPONS } from "../config/weapons";
import type { Weapons } from "../weapons/system";
import { mobileDirection, mobileSpeed, aimStickFires } from "./controlMath";
import { Vector3 } from "@babylonjs/core";
import { Input, type PlayerCommand } from "../player/player";
import type { World } from "../map/builder";

export function mobileRepeatFire(weapon: Pick<Weapons, "id" | "ammo" | "reloadRemaining" | "carryingCoreBuster" | "carryingBeacon" | "pulseTrapSelected" | "remoteControlled">) {
  return !WEAPONS[weapon.id].automatic && !weapon.carryingCoreBuster &&
    !weapon.carryingBeacon && !weapon.pulseTrapSelected && !weapon.remoteControlled &&
    weapon.ammo > 0 && weapon.reloadRemaining <= 0;
}

/** Touch owns its state. No mouse listeners, pointer lock, or desktop preference writes. */
export class MobileInput extends Input {
  movement = { x: 0, y: 0 };
  aim = { x: 0, y: -1 };
  aimMovement = { x: 0, y: 0 };
  fireHeld = false;
  repeatFire = false;
  constructor(canvas: HTMLCanvasElement) {
    super(canvas, false);
    this.aimRelativeMovement = false;
  }
  setAimStick(x: number, y: number, strength: number) {
    this.aimMovement = { x, y };
    if (strength > 0) {
      const direction = mobileDirection(x, y);
      this.aim = { x: direction.x, y: -direction.z };
    }
    const firing = !this.remote && aimStickFires(strength);
    if (firing && !this.fireHeld) this.pressed = true;
    this.fireHeld = this.down = firing;
  }
  override requestLock() {
    /* Touch input never captures the mouse. */
  }
  override clear() {
    super.clear();
    this.movement = { x: 0, y: 0 };
    this.aimMovement = { x: 0, y: 0 };
    this.fireHeld = false;
    this.repeatFire = false;
  }
  override command(world: World, pos: Vector3): PlayerCommand {
    if (this.scoped) {
      const command = super.command(world, pos);
      command.pressed ||= this.repeatFire && command.fire;
      return command;
    }
    const strength = Math.hypot(this.movement.x, this.movement.y);
    const direction = mobileDirection(this.movement.x, this.movement.y);
    const speed = mobileSpeed(this.remote ? 0 : strength);
    const pressed = this.pressed;
    this.pressed = false;
    return {
      moveX: this.remote || !strength ? 0 : direction.x * speed.magnitude,
      moveZ: this.remote || !strength ? 0 : direction.z * speed.magnitude,
      aimX: pos.x + this.aim.x * 35,
      aimZ: pos.z - this.aim.y * 35,
      fire: !this.remote && this.down,
      pressed: !this.remote && (pressed || (this.repeatFire && this.down)),
      sprint: speed.sprint,
      crouched: this.keys.has("KeyC"),
    };
  }
  remoteAxes = () => ({ steer: this.movement.x, throttle: -this.movement.y });
}
