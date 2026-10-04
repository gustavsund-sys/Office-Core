/** Keep an off-canvas ray from invalidating the entire movement packet. */
export function networkAim(x: number, z: number, aimX: number, aimZ: number) {
  const dx = Number.isFinite(aimX) ? aimX - x : 0;
  const dz = Number.isFinite(aimZ) ? aimZ - z : 1;
  const scale = Math.min(1, 100 / Math.max(1, Math.hypot(dx, dz)));
  return {
    aimX: Math.max(-199, Math.min(199, x + dx * scale)),
    aimZ: Math.max(-199, Math.min(199, z + dz * scale)),
  };
}
