import { Vector3 } from "@babylonjs/core";

/** A full-span duct run with two genuine quarter-circle elbows, not a sharp polyline. */
export function serviceDuctPath(x: number, z: number, w: number, d: number) {
  const alongX = w >= d,
    length = (alongX ? w : d) - 0.08;
  const offset = Math.min(0.9, (alongX ? d : w) * 0.22);
  const toWorld = (u: number, v: number) =>
    new Vector3(x + (alongX ? u : v), 0.34, z + (alongX ? v : u));
  const corners = [
    toWorld(-length / 2, -offset),
    toWorld(-length * 0.12, -offset),
    toWorld(-length * 0.12, offset),
    toWorld(length / 2, offset),
  ];
  const radius = Math.min(0.55, offset * 0.75),
    path = [corners[0]];
  for (let i = 1; i < corners.length - 1; i++) {
    const p = corners[i],
      incoming = corners[i - 1].subtract(p).normalize(),
      outgoing = corners[i + 1].subtract(p).normalize();
    const center = p.add(incoming.add(outgoing).scale(radius));
    const from = outgoing.scale(-radius),
      to = incoming.scale(-radius);
    for (let step = 0; step <= 5; step++) {
      const angle = (step * Math.PI) / 10;
      path.push(
        center.add(from.scale(Math.cos(angle))).add(to.scale(Math.sin(angle))),
      );
    }
  }
  path.push(corners[corners.length - 1]);
  return path;
}

/** Quarter-circle returns terminate below the roof, with no exposed tube caps. */
export function roofDuctReturns(path: Vector3[], radius: number) {
  if (path.length < 2) return path;
  const endCurve = (end: Vector3, neighbour: Vector3) => {
    const inward = neighbour.subtract(end).normalize();
    const r = Math.min(radius, Vector3.Distance(end, neighbour) * 0.7);
    const curve = [new Vector3(end.x, -0.3, end.z)];
    for (let i = 0; i <= 6; i++) {
      const angle = (i * Math.PI) / 12;
      const point = end.add(inward.scale(r * (1 - Math.cos(angle))));
      point.y = end.y - r + r * Math.sin(angle);
      curve.push(point);
    }
    return curve;
  };
  return [
    ...endCurve(path[0], path[1]),
    ...path.slice(1, -1),
    ...endCurve(path[path.length - 1], path[path.length - 2]).reverse(),
  ];
}
