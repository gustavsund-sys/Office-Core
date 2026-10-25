export interface OfficeRect {
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface DeadOfficeZone {
  cells: OfficeRect[];
  patches: OfficeRect[];
}

/** Only enclosed holes in the playable footprint, never the space outside the map. */
export function enclosedOfficeZones(
  footprint: readonly OfficeRect[],
): DeadOfficeZone[] {
  const step = 2,
    min = -110,
    count = 110;
  const occupied = new Uint8Array(count * count),
    seen = new Uint8Array(count * count);
  for (let iz = 0; iz < count; iz++)
    for (let ix = 0; ix < count; ix++) {
      const x = min + ix * step + 1,
        z = min + iz * step + 1;
      occupied[iz * count + ix] = Number(
        footprint.some(
          (r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2,
        ),
      );
    }
  const zones: DeadOfficeZone[] = [];
  for (let start = 0; start < occupied.length; start++) {
    if (occupied[start] || seen[start]) continue;
    seen[start] = 1;
    const queue = [start],
      cells: OfficeRect[] = [];
    let outside = false;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head],
        ix = index % count,
        iz = Math.floor(index / count);
      if (ix === 0 || iz === 0 || ix === count - 1 || iz === count - 1)
        outside = true;
      cells.push({
        x: min + ix * step + 1,
        z: min + iz * step + 1,
        w: step,
        d: step,
      });
      for (const [nx, nz] of [
        [ix - 1, iz],
        [ix + 1, iz],
        [ix, iz - 1],
        [ix, iz + 1],
      ]) {
        if (nx < 0 || nz < 0 || nx >= count || nz >= count) continue;
        const next = nz * count + nx;
        if (!occupied[next] && !seen[next]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (!outside && cells.length >= 2)
      zones.push({ cells, patches: mergeDeadCells(cells) });
  }
  return zones;
}

/** Join equal row runs vertically, preserving concave room shapes with few meshes. */
function mergeDeadCells(cells: OfficeRect[]) {
  const rows = new Map<number, number[]>();
  for (const cell of cells) {
    const row = rows.get(cell.z) ?? [];
    row.push(cell.x);
    rows.set(cell.z, row);
  }
  const result: OfficeRect[] = [];
  for (const [z, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length;) {
      const left = xs[i] - 1;
      let right = xs[i] + 1;
      i++;
      while (i < xs.length && xs[i] - 1 === right) {
        right = xs[i] + 1;
        i++;
      }
      const prior = result.find(
        (r) =>
          r.x === (left + right) / 2 &&
          r.w === right - left &&
          Math.abs(r.z + r.d / 2 - (z - 1)) < 1e-8,
      );
      if (prior) {
        prior.z += 1;
        prior.d += 2;
      } else result.push({ x: (left + right) / 2, z, w: right - left, d: 2 });
    }
  }
  return result;
}
