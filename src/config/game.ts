export const CONFIG = {
  camera: {
    height: 23,
    angle: 60,
    distance: 1,
    smoothing: 7,
    lookAhead: 2.3,
    viewSize: 27,
  },
  thirdPerson: {
    distance: 5,
    shoulder: 0.65,
    pivotHeight: 1.6,
    fov: 1.12,
    sensitivity: 0.0025,
    minPitch: -0.45,
    maxPitch: 1.05,
    initialPitch: 0.18,
  },
  player: { speed: 6.5, radius: 0.36, hp: 100, team: "RED" },
};
export const TEAMS = {
  RED: "#fa675f",
  BLUE: "#55b6ff",
} as const;
export const MAX_PLAYERS_PER_TEAM = 4;
export const MAX_PLAYERS = MAX_PLAYERS_PER_TEAM * Object.keys(TEAMS).length;
export type Team = keyof typeof TEAMS;
