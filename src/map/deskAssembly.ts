import type { World } from "./builder";
import { OBJECTS } from "../maps/layout";

/** One actual furniture assembly, reused on both office floors. */
export function deskAssembly(
  world: World,
  x: number,
  z: number,
  w: number = OBJECTS.desk[1],
  d: number = OBJECTS.desk[2],
  solid = true,
) {
  return [
    world.box("desk", x, 0.95, z, w, 0.18, d, "#b5a58b", solid),
    world.box("pedestal", x, 0.44, z, w * 0.72, 0.85, d * 0.65, "#405561"),
    world.box("screen", x, 1.45, z + 0.2, 0.9, 0.65, 0.12, "#182c39"),
    world.box(
      "display",
      x,
      1.46,
      z + 0.13,
      0.76,
      0.48,
      0.02,
      "#68c5cc",
      false,
      true,
    ),
    world.box("keyboard", x, 1.06, z - 0.2, 0.7, 0.035, 0.25, "#263b49"),
    world.box("chair", x, 0.5, z - 1, 0.75, 0.15, 0.7, "#314753"),
    world.box("chair back", x, 0.85, z - 1.3, 0.75, 0.7, 0.14, "#314753"),
  ];
}
