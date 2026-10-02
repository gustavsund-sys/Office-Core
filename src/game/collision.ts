export interface Obstacle {
  x: number;
  z: number;
  w: number;
  d: number;
}
export function blocked(x: number, z: number, r: number, walls: Obstacle[]) {
  return walls.some((b) => {
    const dx = x - Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
    const dz = z - Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
    return dx * dx + dz * dz < r * r;
  });
}
export function move(
  pos: { x: number; z: number },
  dx: number,
  dz: number,
  r: number,
  walls: Obstacle[],
) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.5)));
  for (let i = 0; i < steps; i++) {
    if (!blocked(pos.x + dx / steps, pos.z, r, walls)) pos.x += dx / steps;
    if (!blocked(pos.x, pos.z + dz / steps, r, walls)) pos.z += dz / steps;
  }
}
