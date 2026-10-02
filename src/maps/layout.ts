import { office01, type Prop } from "./office01";
import { WEAPONS, type WeaponId } from "../config/weapons";

export const OBJECTS = {
  desk: ["Skrivbord", 2, 1],
  sofa: ["Soffa", 2.7, 1.1],
  plant: ["Växt", 1, 1],
  server: ["Serverskåp", 1.3, 1.1],
  cabinet: ["Arkivskåp", 1.3, 1.1],
  copier: ["Kopiator", 1.3, 1.1],
  counter: ["Disk", 5, 1.5],
  glass: ["Glasvägg", 5, 0.15],
  pillar: ["Pelare", 0.65, 0.65],
  partition: ["Kontorsavskärmning", 3, 0.3],
  bookshelf: ["Arkivhylla", 3, 0.7],
  whiteboard: ["Whiteboard på hjul", 2.4, 0.5],
  meetingTable: ["Mötesbord", 6, 2.5],
  boxes: ["Flyttkartonger", 2, 1.5],
  pallet: ["Materialpall", 2.5, 2],
  coffee: ["Kaffeautomat", 1.2, 0.8],
  waterCooler: ["Vattenkylare", 0.8, 0.8],
  vending: ["Varuautomat", 1.6, 1],
  chair: ["Kontorsstol", 0.8, 0.8],
  bin: ["Papperskorg", 0.7, 0.7],
  recycling: ["Återvinningsstation", 2.4, 0.8],
  reception: ["Receptionsdisk i hörnform", 5, 3],
} as const;
export type ObjectKind = keyof typeof OBJECTS;
export interface MapObject extends Prop {
  id: string;
  kind: ObjectKind;
  rotation: number;
}
export interface SpawnPoint {
  id: string;
  type: "weapon" | "ammo" | "medkit" | "superMedkit";
  x: number;
  z: number;
  weapon: WeaponId | "random";
  pool: WeaponId[];
  interval: number;
  initialDelay: number;
  amount: number;
}
export interface MapDocument {
  version: 1;
  name: string;
  objects: MapObject[];
  spawns: SpawnPoint[];
}
export const STORAGE_KEY = "officeCore.map.v1";
export const AMMO_AMOUNTS: Record<WeaponId, number> = {
  pistol: 30,
  machineGun: 50,
  bazooka: 3,
  burstGun: 25,
  pulseGun: 15,
  coreBuster: 0,
};
const weapons = Object.keys(WEAPONS) as WeaponId[];
const ammo = weapons.filter((id) => id !== "coreBuster");
const originalProps = office01.props.map((p) => ({ ...p }));
export function defaultMap(): MapDocument {
  const spawns: SpawnPoint[] = [];
  const add = (
    type: SpawnPoint["type"],
    x: number,
    z: number,
    weapon: SpawnPoint["weapon"],
    interval: number,
  ) =>
    spawns.push({
      id: `spawn-${spawns.length}`,
      type,
      x,
      z,
      weapon,
      pool: type === "ammo" ? [...ammo] : [...weapons],
      interval,
      initialDelay: 0,
      amount: weapon === "random" ? 0 : AMMO_AMOUNTS[weapon],
    });
  for (const zone of office01.weaponEnds) {
    ammo.forEach((id, i) =>
      add("ammo", zone.x - 6, zone.z + (i - 2) * 2.8, id, 8),
    );
    [...ammo, "coreBuster" as const].forEach((id, i) =>
      add("weapon", zone.x + 6, zone.z + (i - 2) * 2.8, id, 20),
    );
  }
  for (const x of [-9, 9]) add("ammo", x, -2, "random", 12);
  for (const x of [-45, 45])
    ammo.forEach((id, i) => add("ammo", x + (i - 2) * 1.3, 15, id, 40));
  return {
    version: 1,
    name: "Office01",
    objects: originalProps.map((p, i) => ({
      ...p,
      id: `object-${i}`,
      kind: p.kind as ObjectKind,
      rotation: 0,
      destructible: !!p.destructible,
    })),
    spawns,
  };
}
export let activeMap = defaultMap();
export function applyMap(document: MapDocument) {
  activeMap = parseMap(document);
  office01.props.splice(0, office01.props.length, ...activeMap.objects);
}
export function objectBounds(object: MapObject) {
  const spec = OBJECTS[object.kind];
  const w = object.w ?? spec[1],
    d = object.d ?? spec[2];
  return object.rotation % 180 === 0 ? { w, d } : { w: d, d: w };
}
export function onFloor(x: number, z: number, margin = 0) {
  return office01.footprint.some(
    (r) =>
      Math.abs(x - r.x) <= r.w / 2 - margin &&
      Math.abs(z - r.z) <= r.d / 2 - margin,
  );
}
export function parseMap(raw: unknown): MapDocument {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  if (!raw || typeof raw !== "object") return fail("Ogiltig kartfil.");
  const doc = raw as MapDocument;
  if (
    doc.version !== 1 ||
    typeof doc.name !== "string" ||
    !doc.name.trim() ||
    doc.name.length > 60 ||
    !Array.isArray(doc.objects) ||
    !Array.isArray(doc.spawns)
  )
    return fail("Kartfilen måste ha version 1, namn, objekt och spawnplatser.");
  if (doc.objects.length > 240 || doc.spawns.length > 128)
    return fail("Max 240 objekt och 128 spawnplatser.");
  const ids = new Set<string>();
  const finite = (n: unknown, lo: number, hi: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  const position = (p: { id: string; x: number; z: number }) => {
    if (
      !p ||
      typeof p.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) ||
      ids.has(p.id)
    )
      fail("Objekten måste ha unika ID.");
    ids.add(p.id);
    if (!finite(p.x, -110, 110) || !finite(p.z, -56, 88) || !onFloor(p.x, p.z))
      fail("Placera alla objekt och spawnplatser på kartans golv.");
  };
  // Carry existing placements in the former drop rooms into the shortened wing.
  const relocateDrop = <T extends { x: number; z: number }>(p: T): T =>
    p && Math.abs(Math.abs(p.x) - 82.5) <= 10 && p.z >= 60 && p.z <= 80
      ? { ...p, z: p.z - 24 }
      : p;
  const objects = doc.objects.map(relocateDrop).map((p) => {
    position(p);
    if (
      typeof p.kind !== "string" ||
      !Object.hasOwn(OBJECTS, p.kind) ||
      ![0, 90, 180, 270].includes(p.rotation) ||
      typeof p.destructible !== "boolean"
    )
      fail("Ogiltig objekttyp, rotation eller förstörbarhet.");
    if (
      (p.w !== undefined && !finite(p.w, 0.1, 12)) ||
      (p.d !== undefined && !finite(p.d, 0.1, 12))
    )
      fail("Objektstorlek måste vara 0,1–12 meter.");
    return {
      id: p.id,
      kind: p.kind,
      x: p.x,
      z: p.z,
      rotation: p.rotation,
      destructible: p.destructible,
      ...(p.w !== undefined ? { w: p.w } : {}),
      ...(p.d !== undefined ? { d: p.d } : {}),
    };
  });
  const spawns = doc.spawns.map(relocateDrop).map((p) => {
    position(p);
    if (
      !["weapon", "ammo", "medkit", "superMedkit"].includes(p.type) ||
      !(p.weapon === "random" || weapons.includes(p.weapon)) ||
      !Array.isArray(p.pool) ||
      p.pool.length < 1 ||
      p.pool.length > weapons.length ||
      !p.pool.every((id) => weapons.includes(id)) ||
      new Set(p.pool).size !== p.pool.length
    )
      fail("Välj ett giltigt vapen eller minst ett vapen i slumplistan.");
    if (
      p.type === "ammo" &&
      (p.weapon === "coreBuster" || p.pool.includes("coreBuster"))
    )
      fail("Core buster har ingen ammunition.");
    if (
      !finite(p.interval, 1, 3600) ||
      !finite(p.initialDelay, 0, 3600) ||
      !finite(p.amount, 0, 500) ||
      !Number.isInteger(p.amount)
    )
      fail("Spawnintervall: 1–3600 s, fördröjning: 0–3600 s, ammo: 0–500.");
    return {
      id: p.id,
      type: p.type,
      x: p.x,
      z: p.z,
      weapon: p.weapon,
      pool: [...p.pool],
      interval: p.interval,
      initialDelay: p.initialDelay,
      amount: p.amount,
    };
  });
  return { version: 1, name: doc.name.trim(), objects, spawns };
}
// Reachability includes furniture and footprint walls. Core rooms are reserved;
// validation checks routes between both spawn pads, atrium and every pickup.
export function mapWarnings(doc: MapDocument): string[] {
  const warnings = new Set<string>();
  const obstacles = [
    ...office01.walls,
    ...doc.objects.map((p) => ({ ...p, ...objectBounds(p) })),
  ];
  const clear = (x: number, z: number) =>
    onFloor(x, z) &&
    !obstacles.some(
      (p) =>
        Math.abs(x - p.x) < p.w / 2 + 0.4 && Math.abs(z - p.z) < p.d / 2 + 0.4,
    ) &&
    !office01.bases.some((b) => Math.abs(x - b.x) < 5 && Math.abs(z - b.z) < 5);
  for (const p of doc.objects) {
    const b = objectBounds(p);
    if (
      office01.bases.some(
        (base) =>
          Math.abs(p.x - base.x) < b.w / 2 + 6 &&
          Math.abs(p.z - base.z) < b.d / 2 + 6,
      )
    )
      warnings.add(
        "Ett objekt ligger för nära ett core-rum eller dess ingångar.",
      );
    if (
      ![-1, 1].every((sx) =>
        [-1, 1].every((sz) =>
          onFloor(p.x + (sx * b.w) / 2, p.z + (sz * b.d) / 2),
        ),
      )
    )
      warnings.add("Ett objekt går utanför golvet.");
  }
  const red = office01.bases[0];
  const start = [Math.round(red.spawn.x), Math.round(red.spawn.z)];
  const queue = [start],
    seen = new Set<string>();
  if (clear(...(start as [number, number]))) seen.add(start.join(","));
  else warnings.add("Röd spawnplats är blockerad.");
  for (let i = 0; i < queue.length && seen.size > 0; i++) {
    const [x, z] = queue[i];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        key = `${nx},${nz}`;
      if (!seen.has(key) && clear(nx, nz)) {
        seen.add(key);
        queue.push([nx, nz]);
      }
    }
  }
  const targets = [
    {
      x: office01.bases[1].spawn.x,
      z: office01.bases[1].spawn.z,
      label: "Blå spawnplats",
    },
    { x: 0, z: 0, label: "Atrium" },
    ...doc.spawns.map((p) => ({ ...p, label: `Spawnplats ${p.id}` })),
  ];
  for (const p of targets)
    if (!seen.has(`${Math.round(p.x)},${Math.round(p.z)}`))
      warnings.add(`${p.label} är blockerad eller saknar framkomlig väg.`);
  return [...warnings];
}
