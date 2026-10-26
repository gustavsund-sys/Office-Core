import { mobileDirection, mobileSpeed, aimStickFires } from "./controlMath";
import { Vector3 } from "@babylonjs/core";
import { Input, type PlayerCommand } from "../player/player";
import type { World } from "../map/builder";

/** Touch owns its state. No mouse listeners, pointer lock, or desktop preference writes. */
export class MobileInput extends Input {
  movement = { x: 0, y: 0 };
  aim = { x: 0, y: -1 };
  aimMovement = { x: 0, y: 0 };
  fireHeld = false;
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
  }
  override command(world: World, pos: Vector3): PlayerCommand {
    if (this.scoped) return super.command(world, pos);
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
      pressed: !this.remote && pressed,
      sprint: speed.sprint,
      crouched: this.keys.has("KeyC"),
    };
  }
  remoteAxes = () => ({ steer: this.movement.x, throttle: -this.movement.y });
}
