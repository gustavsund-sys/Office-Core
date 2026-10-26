/** Circular stick with a dead zone. Pixel density and screen size cannot amplify movement. */
export function stickVector(
  dx: number,
  dy: number,
  radius: number,
  deadZone = 0.02,
) {
  const distance = Math.hypot(dx, dy);
  if (
    !Number.isFinite(distance) ||
    radius <= 0 ||
    distance <= radius * deadZone
  )
    return { x: 0, y: 0, strength: 0 };
  const strength = Math.min(1, distance / radius);
  return {
    x: (dx / distance) * strength,
    y: (dy / distance) * strength,
    strength,
  };
}
export function mobileViewSize(width: number, height: number) {
  // Fixed landscape presentation: keep target scale stable across wide phone screens.
  return 20;
}

export const MOBILE_CAMERA = { height: 34, back: 18 } as const;
/** Correct the tilted overhead camera's foreshortening so diagonal sticks match screen direction. */
export function mobileDirection(x: number, y: number) {
  const sinAngle =
    MOBILE_CAMERA.height / Math.hypot(MOBILE_CAMERA.height, MOBILE_CAMERA.back);
  const z = -y / sinAngle;
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

/** Continuous analog speed, with walking across 90% of the stick travel. */
export function mobileSpeed(strength: number) {
  const value = Math.min(
    1,
    Math.max(0, Number.isFinite(strength) ? strength : 0),
  );
  const sprint = value > 0.9 + 1e-10;
  // Shared physics supplies 1.5x while sprinting. Encode the remaining analog magnitude.
  return {
    sprint,
    magnitude: sprint ? (1 + ((value - 0.9) / 0.1) * 0.5) / 1.5 : value / 0.9,
  };
}

/** The outer tenth of the aiming travel fires while direction remains continuous. */
export function aimStickFires(strength: number) {
  return Number.isFinite(strength) && strength >= 0.9;
}
