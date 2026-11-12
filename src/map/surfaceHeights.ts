import { OFFICE_WALL_HEIGHT } from "../maps/office01";

export const WALL_CAP_OFFSET = 0.04;
export const WALL_CAP_THICKNESS = 0.1;
export const WALL_TOP_Y = OFFICE_WALL_HEIGHT + WALL_CAP_OFFSET + WALL_CAP_THICKNESS / 2;

/** A recessed finish avoids coplanar overlap with the wall cap at shared edges. */
export const ROOF_FINISH_Y = WALL_TOP_Y - 0.025;
