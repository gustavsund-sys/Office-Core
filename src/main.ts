import { installGameCache } from "./network/cache";
import "./ui/style.css";
import { applyMap, parseMap, STORAGE_KEY } from "./maps/layout";

async function start() {
  const loading = document.createElement("div");
  loading.className = "game-loading";
  loading.setAttribute("role", "status");
  loading.textContent = "Laddar Office Core…";
  document.body.append(loading);
  const params = new URLSearchParams(location.search);
  const { showIntro, showTutorial } = await import("./ui/intro");
  if (params.get("builder") !== "1" && (params.get("playtest") !== "1" || params.get("intro") === "1")) {
    loading.hidden = true;
    await showIntro(params.get("intro") === "1");
    loading.hidden = false;
  }
  await installGameCache();
  if (params.get("playtest") === "1") {
    const saved = localStorage.getItem(STORAGE_KEY);
    // A fresh browser origin can playtest the bundled map without an editor save.
    if (saved) applyMap(parseMap(JSON.parse(saved)));
    else applyMap(parseMap((await import("../server/map.json")).default));
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
  } else {
    loading.textContent = "Förbereder karta och grafik…";
    const { Game } = await import("./game/game");
    const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
    let engine: import("@babylonjs/core").AbstractEngine | undefined;
    const requestedRenderer = params.get("renderer");
    if (requestedRenderer !== "webgl") {
      loading.textContent = "Startar WebGPU…";
      const { WebGPUEngine } = await import("@babylonjs/core");
      let gpu: import("@babylonjs/core").WebGPUEngine | undefined;
      try {
        if (await WebGPUEngine.IsSupportedAsync) {
          gpu = new WebGPUEngine(canvas, { antialias: true, stencil: true });
          await gpu.initAsync();
          engine = gpu;
        }
      } catch (error) {
        gpu?.dispose();
        console.warn("WebGPU initialization failed; using WebGL.", error);
      }
    }
    new Game(canvas, engine);
    const guide = document.createElement("button");
    guide.className = "open-field-guide";
    guide.textContent = "Tutorial";
    guide.style.cssText = "position:fixed;bottom:8px;right:30px;z-index:210;padding:6px 12px;background:#163744;color:#d8eff0;border:1px solid #78b4bb;border-radius:4px;cursor:pointer";
    guide.onclick = () => { void showTutorial(); };
    document.querySelector("#overlay")!.append(guide);
    {
      const badge = document.createElement("div");
      badge.textContent = engine ? "RENDERER · WEBGPU" : "RENDERER · WEBGL";
      badge.style.cssText =
        "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:200;color:#b7f5ef;background:#10232be8;padding:5px 10px;border-radius:4px;font:12px monospace;pointer-events:none";
      document.body.append(badge);
    }
  }
  loading.remove();
}
void start().catch((error) => {
  document.querySelector(".game-loading")?.remove();
  console.error(error);
  const ui = document.querySelector("#ui")!;
  ui.innerHTML =
    '<div class="error"><h1>Office Core kunde inte starta</h1><p></p><a href="/">Försök igen</a> · <a href="/?builder=1">Kartbyggaren</a></div>';
  ui.querySelector("p")!.textContent =
    error instanceof Error
      ? error.message
      : "Kontrollera anslutningen och WebGL och försök igen.";
});
