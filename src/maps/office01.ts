import type { Team } from "../config/game";
export interface Prop {
  kind:
    | "partition"
    | "bookshelf"
    | "whiteboard"
    | "meetingTable"
    | "boxes"
    | "pallet"
    | "coffee"
    | "waterCooler"
    | "vending"
    | "chair"
    | "bin"
    | "recycling"
    | "reception"
    | "coreDoor"
    | "desk"
    | "sofa"
    | "plant"
    | "server"
    | "cabinet"
    | "copier"
    | "counter"
    | "glass"
    | "pillar";
  x: number;
  z: number;
  w?: number;
  d?: number;
  destructible?: boolean;
  team?: Team;
  rotation?: number;
}
export interface Wall {
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface Room extends Wall {
  name: string;
}
const size = 220;
const stretch = 1.25;
const bases = [
  { team: "RED", x: -82, z: 0, spawn: { x: -73, z: 0 } },
  { team: "BLUE", x: 82, z: 0, spawn: { x: 73, z: 0 } },
] as { team: Team; x: number; z: number; spawn: { x: number; z: number } }[];
const rooms: Room[] = [
  { name: "RECEPTION / COMBAT ATRIUM", x: 0, z: 0, w: 32, d: 32 },
  { name: "OPEN OFFICE", x: -36, z: 10, w: 16, d: 12 },
  { name: "MEETING ROOM", x: 36, z: 10, w: 16, d: 12 },
  { name: "NORTH LOGISTICS", x: 0, z: 40, w: 16, d: 12 },
];
// Rectangles define the walkable footprint. Their union is rasterised into 2 m
// cells; merged boundary segments produce real walls, not decorative lines.
const corridors: Wall[] = [];
for (const sx of [-1, 1])
  for (const sz of [1]) {
    corridors.push(
      { x: sx * 32, z: sz * 40, w: 20, d: 6 },
      { x: sx * 24, z: sz * 33, w: 6, d: 20 },
      { x: sx * 18, z: sz * 26, w: 18, d: 6 },
      { x: sx * 12, z: sz * 20, w: 6, d: 16 },
      { x: sx * 40, z: sz * 32, w: 6, d: 20 },
      { x: sx * 33, z: sz * 24, w: 20, d: 6 },
      { x: sx * 26, z: sz * 12, w: 6, d: 28 },
      { x: sx * 20, z: sz * 8, w: 14, d: 6 },
    );
  }
corridors.push({ x: 0, z: 40, w: 52, d: 6 });
// Two exterior dog-leg corridors, connected outside the core rooms.
const weaponEnds: { x: number; z: number }[] = [];
for (const sx of [-1, 1])
  for (const sz of [1]) {
    corridors.push(
      { x: sx * 54, z: sz * 30, w: 30, d: 6 },
      { x: sx * 66, z: sz * 37, w: 6, d: 20 },
      { x: sx * 66, z: sz * 46, w: 20, d: 20 },
    );
    weaponEnds.push({ x: sx * 66, z: sz * 46 });
  }
// Stretch the surviving north wing horizontally, keeping core rooms and drop
// arenas at their original dimensions. Furniture keeps its physical size.
for (const room of rooms) {
  room.x *= stretch;
  room.w *= stretch;
}
for (const corridor of corridors) {
  corridor.x *= stretch;
  if (corridor.d !== 20 || corridor.w !== 20) corridor.w *= stretch;
}
for (const endpoint of weaponEnds) endpoint.x *= stretch;
// North transit hubs replace the former core rooms. Three mirrored lanes
// approach each new side base: north access, office access and the south loop.
for (const sx of [-1, 1])
  corridors.push(
    { x: sx * 50, z: 40, w: 12, d: 12 },
    { x: sx * 82, z: 17, w: 8, d: 40 },
    { x: sx * 64, z: 8, w: 40, d: 6 },
    { x: sx * 74, z: -2, w: 8, d: 24 },
    { x: sx * 64, z: -8, w: 40, d: 6 },
    { x: sx * 32.5, z: -12, w: 7.5, d: 36 },
    { x: sx * 45, z: -20, w: 28, d: 6 },
    { x: sx * 58, z: -16, w: 8, d: 32 },
    { x: sx * 38, z: -32, w: 54, d: 6 },
    { x: sx * 15, z: -28, w: 8, d: 36 },
    { x: sx * 65, z: -22, w: 8, d: 42 },
  );
corridors.push({ x: 0, z: -46, w: 138, d: 6 });
const footprint: Wall[] = [
  ...rooms,
  ...corridors,
  ...bases.map((b) => ({ ...b, w: 12, d: 12 })),
];
function boundaryWalls(): Wall[] {
  const n = size / 2;
  const floor = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const x = -size / 2 + i * 2 + 1,
        z = -size / 2 + j * 2 + 1;
      return footprint.some(
        (r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) <= r.d / 2,
      );
    }),
  );
  const open = (i: number, j: number) => floor[i]?.[j] ?? false;
  const result: Wall[] = [];
  // Merge consecutive exposed edges along each axis to keep mesh count low.
  for (let edge = 0; edge <= n; edge++)
    for (const horizontal of [true, false]) {
      let start = -1;
      for (let k = 0; k <= n; k++) {
        const exposed =
          k < n &&
          (horizontal
            ? open(k, edge - 1) !== open(k, edge)
            : open(edge - 1, k) !== open(edge, k));
        if (exposed && start < 0) start = k;
        if (!exposed && start >= 0) {
          const center = -size / 2 + start + k,
            length = (k - start) * 2;
          result.push(
            horizontal
              ? { x: center, z: -size / 2 + edge * 2, w: length + 0.4, d: 0.4 }
              : { x: -size / 2 + edge * 2, z: center, w: 0.4, d: length + 0.4 },
          );
          start = -1;
        }
      }
    }
  return result;
}
const props: Prop[] = [
  { kind: "counter", x: 0, z: 6, w: 5, d: 1.5, destructible: true },
  { kind: "sofa", x: -7, z: -5, destructible: true },
  { kind: "sofa", x: 7, z: -5, destructible: true },
  { kind: "glass", x: 0, z: -11, w: 5, d: 0.15, destructible: true },
  ...[-12, 12].flatMap((x) =>
    [-12, 12].map((z) => ({ kind: "pillar" as const, x, z })),
  ),
  ...[-7, 7].flatMap((x) =>
    [-10, 9].map((z) => ({ kind: "plant" as const, x, z, destructible: true })),
  ),
  ...[-39, -33].flatMap((x) =>
    [8, 13].map((z) => ({ kind: "desk" as const, x, z, destructible: true })),
  ),
  { kind: "desk", x: 36, z: 10, w: 6, d: 2.5, destructible: true },
  ...[-4, 0, 4].flatMap((x) =>
    [37].map((z) => ({
      kind: "cabinet" as const,
      x,
      z,
      destructible: true,
    })),
  ),
];
for (const sx of [-1, 1])
  for (const sz of [1]) {
    props.push(
      { kind: "copier", x: sx * 32, z: sz * 41.5, destructible: true },
      { kind: "cabinet", x: sx * 25.5, z: sz * 33, destructible: true },
      { kind: "plant", x: sx * 39, z: sz * 28, destructible: true },
      { kind: "server", x: sx * 22, z: sz * 25, destructible: true },
      { kind: "desk", x: sx * 12, z: sz * 22, destructible: true },
      { kind: "copier", x: sx * 10, z: sz * 5, destructible: true },
      { kind: "cabinet", x: sx * 10, z: sz * 3, destructible: true },
    );
  }
for (const prop of props) prop.x *= stretch;
// Additional workstations fill the enlarged office without blocking its centre.
for (const x of [-49, -41])
  props.push({ kind: "desk", x, z: 5.5, destructible: true });
for (const x of [-8, 8])
  props.push({ kind: "plant", x, z: 43, destructible: true });
props.push(
  { kind: "cabinet", x: 49, z: 13, destructible: true },
  { kind: "copier", x: 41, z: 5.5, destructible: true },
);
export const office01 = {
  name: "Office01",
  size,
  width: 220,
  depth: 144,
  centerZ: 16,
  stretch,
  spawn: bases[0].spawn,
  bases,
  rooms,
  corridors,
  footprint,
  walls: [
    ...boundaryWalls(),
    // Permanent cover breaks long shots without dividing the open arena.
    { x: -6.25, z: 2, w: 3, d: 0.5 },
    { x: 6.25, z: 2, w: 3, d: 0.5 },
    { x: -2, z: 40, w: 0.5, d: 3 },
    { x: 2, z: 40, w: 0.5, d: 3 },
  ],
  props,
  targets: [
    { x: -5, z: 12 },
    { x: 5, z: 12 },
    { x: 12, z: -8 },
    { x: -12, z: -8 },
    { x: 0, z: -13 },
    { x: -30, z: 36 },
  ],
  weaponEnds,
  pickup: { x: 0, z: 1 },
  futurePickup: { x: 0, z: -3 },
};
