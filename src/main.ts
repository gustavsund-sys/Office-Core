import { fetchServer } from "./network/serverReady";
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
      const response = params.get("builder") === "1"
        ? await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" })
        : await fetchServer(url, { onWaiting: () => {
          loading.textContent = "Väntar på spelservern… Kallstart kan ta en stund. Spelet fortsätter ladda automatiskt.";
        } });
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
          gpu = new WebGPUEngine(canvas, { antialias: true, stencil: true, powerPreference: "high-performance" });
          await gpu.initAsync();
          engine = gpu;
        }
      } catch (error) {
        gpu?.dispose();
        console.warn("WebGPU initialization failed; using WebGL.", error);
      }
    }
    const { Engine } = await import("@babylonjs/core");
    engine ??= new Engine(canvas, true, { stencil: true, powerPreference: "high-performance" });
    const { readGraphics, saveGraphics, GRAPHICS } = await import("./game/graphicsSettings");
    const { testGraphics, applyGraphics } = await import("./game/graphicsBenchmark");
    loading.hidden = true;
    if (!readGraphics()) await testGraphics(engine);
    applyGraphics(engine, readGraphics() ?? "standard");
    loading.hidden = false;
    const game = new Game(canvas, engine);
    const resizeGraphics = () => applyGraphics(engine!, readGraphics() ?? "standard");
    window.addEventListener("resize", resizeGraphics);
    const graphicsButton = document.createElement("button");
    graphicsButton.className = "graphics-display-icon";
    graphicsButton.title = "Grafikinställningar";
    graphicsButton.setAttribute("aria-label", "Grafikinställningar");
    graphicsButton.setAttribute("aria-expanded", "false");
    graphicsButton.setAttribute("aria-controls", "graphics-menu");
    graphicsButton.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v3M8 20h8"/></svg>';
    const graphicsMenu = document.createElement("section");
    graphicsMenu.id = "graphics-menu";
    graphicsMenu.className = "graphics-menu";
    graphicsMenu.hidden = true;
    graphicsMenu.setAttribute("aria-label", "Grafikinställningar");
    graphicsMenu.innerHTML = '<header><strong>GRAFIK</strong><button class="graphics-close" aria-label="Stäng grafikinställningar">×</button></header><label>Grafiknivå<select aria-label="Välj grafiknivå"></select></label><p class="graphics-details"></p><button class="graphics-apply">Använd grafiknivå</button><button class="graphics-retest">Testa grafik igen</button><small>Testet tar drygt en minut. Dina val sparas på denna enhet.</small>';
    const select = graphicsMenu.querySelector("select")!;
    for (const [tier, quality] of Object.entries(GRAPHICS)) {
      const option = document.createElement("option");
      option.value = tier; option.textContent = quality.name; select.append(option);
    }
    const describe = () => {
      const quality = GRAPHICS[select.value as keyof typeof GRAPHICS];
      graphicsMenu.querySelector(".graphics-details")!.textContent = `Max ${quality.height}p · ${quality.shadow === 0 ? "skuggor av" : quality.shadow === 512 ? "enklare skuggor" : "detaljerade skuggor"} · ${quality.effects === 1 ? "fulla effekter" : "reducerade effekter"}`;
    };
    select.onchange = describe;
    const closeGraphics = () => { graphicsMenu.hidden = true; graphicsButton.setAttribute("aria-expanded", "false"); };
    graphicsButton.onclick = () => {
      if (!graphicsMenu.hidden) { closeGraphics(); return; }
      select.value = readGraphics() ?? "standard"; describe();
      graphicsMenu.hidden = false; graphicsButton.setAttribute("aria-expanded", "true");
    };
    graphicsMenu.querySelector<HTMLButtonElement>(".graphics-close")!.onclick = closeGraphics;
    const updateQuality = (tier: keyof typeof GRAPHICS) => {
      saveGraphics(tier); applyGraphics(engine!, tier);
      const quality = GRAPHICS[tier];
      game.scene.shadowsEnabled = quality.shadow > 0;
      if (quality.shadow) game.world.shadows.getShadowMap()?.resize(quality.shadow);
      game.world.shadows.filteringQuality = quality.shadow === 512 ? 0 : 2;
      game.world.explosions.amount = quality.effects;
      for (const layer of game.scene.effectLayers) if (layer.name === "subtle glow") (layer as import("@babylonjs/core").GlowLayer).intensity = quality.glow;
      game.scene.imageProcessingConfiguration.vignetteEnabled = quality.effects === 1;
    };
    graphicsMenu.querySelector<HTMLButtonElement>(".graphics-apply")!.onclick = () => { updateQuality(select.value as keyof typeof GRAPHICS); closeGraphics(); };
    graphicsMenu.querySelector<HTMLButtonElement>(".graphics-retest")!.onclick = async () => {
      closeGraphics(); graphicsButton.disabled = true;
      const loops = [...engine!.activeRenderLoops];
      engine!.stopRenderLoop();
      try { updateQuality(await testGraphics(engine!, game.world.explosions.spriteMode)); }
      finally { loops.forEach(loop => engine!.runRenderLoop(loop)); graphicsButton.disabled = false; }
    };
    document.querySelector("#overlay")!.append(graphicsButton, graphicsMenu);
    const guide = document.createElement("button");
    guide.className = "open-field-guide";
    guide.textContent = "Tutorial";
    guide.style.cssText = "position:fixed;bottom:8px;right:30px;z-index:210;padding:6px 12px;background:#163744;color:#d8eff0;border:1px solid #78b4bb;border-radius:4px;cursor:pointer";
    guide.onclick = () => { void showTutorial(); };
    document.querySelector("#overlay")!.append(guide);
    {
      const badge = document.createElement("div");
      badge.textContent = engine.isWebGPU ? "RENDERER · WEBGPU" : "RENDERER · WEBGL";
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
    '<div class="error"><h1>Office Core kunde inte starta</h1><p></p><a href="/">Försök igen</a></div>';
  if (import.meta.env.DEV) {
    const builder = document.createElement("a");
    builder.href = "/?builder=1";
    builder.textContent = "Kartbyggaren";
    ui.querySelector(".error")!.append(" · ", builder);
  }
  ui.querySelector("p")!.textContent =
    error instanceof Error
      ? error.message
      : "Kontrollera anslutningen och WebGL och försök igen.";
});
