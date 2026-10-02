import "./ui/style.css";
import { Game } from "./game/game";
try {
  new Game(document.querySelector<HTMLCanvasElement>("#game")!);
} catch (error) {
  console.error(error);
  document.querySelector("#ui")!.innerHTML =
    '<div class="error"><h1>Unable to start Office Wars</h1><p>This alpha requires a browser with WebGL enabled. Check hardware acceleration and reload.</p></div>';
}
