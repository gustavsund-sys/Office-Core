/** Game-ready alpha atlases made from the licensed source clips (not previews). */
export interface FireFilm {
  url: string;
  cellSize: number;
  frames: number;
  fps: number;
}
export const FILMED_FIRE: { bin?: FireFilm; ground?: FireFilm } = {
  bin: {
    url: "/vfx/fire/high-angle-041.webp",
    cellSize: 256,
    frames: 40,
    fps: 24,
  },
  ground: {
    url: "/vfx/fire/windblown-050.webp",
    cellSize: 256,
    frames: 40,
    fps: 24,
  },
};

/** Last two seconds fade; the effect is fully gone five seconds after impact. */
export function groundFireOpacity(age: number) {
  return Math.max(0, Math.min(1, (5 - age) / 2));
}
