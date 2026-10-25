import type { Game } from "../game/game";
import type { Input } from "../player/player";

/** Optional local presentation only. Never changes world rules or network protocol. */
export interface GamePresentation {
  createInput?: (canvas: HTMLCanvasElement) => Input;
  attach?: (game: Game) => void;
  update?: (game: Game, dt: number) => void;
  resize?: (game: Game) => void;
  camera?: (game: Game, dt: number) => boolean;
}
