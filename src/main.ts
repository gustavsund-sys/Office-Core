import { installGameCache } from "./network/cache";
import "./ui/style.css";
import { Game } from "./game/game";
import { applyMap, parseMap, STORAGE_KEY } from "./maps/layout";

async function start() {
  const params = new URLSearchParams(location.search);
  if (params.get("playtest") === "1") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved)
      throw new Error("Spara en karta i kartbyggaren innan du provspelar.");
    applyMap(parseMap(JSON.parse(saved)));
  } else {
    const url = new URL(
      import.meta.env.VITE_GAME_SERVER_URL || "ws://127.0.0.1:2567",
    );
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.pathname = "/map";
    url.search = "";
    url.hash = "";
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error("Kartan kunde inte hämtas från spelservern.");
      applyMap(parseMap(await response.json()));
    } catch (error) {
      if (params.get("builder") !== "1") throw error;
      console.warn(
        "Server map unavailable; editor uses its saved map or the default map.",
      );
    }
  }
  if (params.get("builder") === "1") {
    const { MapEditor } = await import("./map/editor");
    new MapEditor();
  } else new Game(document.querySelector<HTMLCanvasElement>("#game")!);
}
void start().catch((error) => {
  console.error(error);
  const ui = document.querySelector("#ui")!;
  ui.innerHTML =
    '<div class="error"><h1>Office Core kunde inte starta</h1><p></p><a href="/">Försök igen</a> · <a href="/?builder=1">Kartbyggaren</a></div>';
  ui.querySelector("p")!.textContent =
    error instanceof Error
      ? error.message
      : "Kontrollera anslutningen och WebGL och försök igen.";
});
installGameCache();
