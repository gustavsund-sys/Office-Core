/** Interpolate angles along the shortest arc, including the -PI/PI seam. */
export function interpolateYaw(from: number, to: number, fraction: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * fraction;
}
