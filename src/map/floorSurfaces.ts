interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface FloorSurface extends Rect {
  name: string;
  color: string;
}

/** Remove the overlapping area, leaving at most four non-overlapping strips. */
function subtract<T extends Rect>(a: T, b: Rect): T[] {
  const left = a.x - a.w / 2,
    right = a.x + a.w / 2,
    top = a.z - a.d / 2,
    bottom = a.z + a.d / 2;
  const l = Math.max(left, b.x - b.w / 2),
    r = Math.min(right, b.x + b.w / 2);
  const t = Math.max(top, b.z - b.d / 2),
    u = Math.min(bottom, b.z + b.d / 2);
  if (r - l <= 1e-8 || u - t <= 1e-8) return [a];
  return [
    [left, top, right, t],
    [left, u, right, bottom],
    [left, t, l, u],
    [r, t, right, u],
  ]
    .filter(([x, z, x2, z2]) => x2 - x > 1e-8 && z2 - z > 1e-8)
    .map(([x, z, x2, z2]) => ({
      ...a,
      x: (x + x2) / 2,
      z: (z + z2) / 2,
      w: x2 - x,
      d: z2 - z,
    }));
}

/** Later surfaces replace earlier ones. All resulting surfaces can share one height. */
export function partitionFloors<T extends Rect>(surfaces: readonly T[]): T[] {
  let pieces: T[] = [];
  for (const surface of surfaces)
    pieces = [
      ...pieces.flatMap((piece) => subtract(piece, surface)),
      { ...surface },
    ];
  return pieces;
}

/** Punch genuine openings through an otherwise opaque slab. */
export function cutFloorOpenings<T extends Rect>(
  surfaces: readonly T[],
  holes: readonly Rect[],
): T[] {
  let pieces = [...surfaces];
  for (const hole of holes)
    pieces = pieces.flatMap((piece) => subtract(piece, hole));
  return pieces;
}
