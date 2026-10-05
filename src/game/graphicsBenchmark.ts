import { BenchmarkTimeline, benchmarkRandom } from "./benchmarkTimeline";
import {
  Scene,
  FreeCamera,
  Camera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  GlowLayer,
  Color3,
  MeshBuilder,
  type AbstractEngine,
  type Engine,
  type WebGPUEngine,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { Beacons, type BeaconActor } from "./beacon";
import { Player } from "../player/player";
import {
  GRAPHICS,
  renderSize,
  frameStats,
  combatStats,
  standardIsComfortable,
  recommendGraphics,
  saveGraphics,
  type GraphicsTier,
} from "./graphicsSettings";

export function applyGraphics(engine: AbstractEngine, tier: GraphicsTier) {
  const canvas = engine.getRenderingCanvas()!;
  const size = renderSize(canvas.clientWidth, canvas.clientHeight, tier);
  engine.setHardwareScalingLevel(1 / size.scale);
  engine.resize();
  console.info("graphics", {
    engine: engine.isWebGPU ? "WebGPU" : "WebGL",
    tier,
    width: engine.getRenderWidth(),
    height: engine.getRenderHeight(),
    gpu: engine.isWebGPU
      ? (engine as WebGPUEngine).getInfo()
      : (engine as Engine).getGlInfo(),
    caps: { maxTextureSize: engine.getCaps().maxTextureSize },
  });
}
export async function testGraphics(
  engine: AbstractEngine,
  spriteMode?: boolean,
): Promise<GraphicsTier> {
  const overlay = document.createElement("section");
  overlay.className = "graphics-test";
  overlay.innerHTML =
    '<div class="graphics-report"><small>OFFICE CORE · GRAPHICS CHECK</small><h1>Hittar ditt bästa flyt</h1><p role="status">Laddar karta, modeller och shaders…</p><div class="graphics-results"></div></div>';
  document.body.append(overlay);
  document.body.classList.add("graphics-testing");
  const status = overlay.querySelector("p")!;
  const renderer = document.createElement("p");
  const info = engine.isWebGPU
    ? (engine as WebGPUEngine).getInfo()
    : (engine as Engine).getGlInfo();
  renderer.textContent = `${engine.isWebGPU ? "WebGPU" : "WebGL"} · ${info.renderer || "GPU-information ej tillgänglig"}`;
  status.before(renderer);
  const scene = new Scene(engine);
  const ambient = new HemisphericLight(
    "benchmark ambient",
    Vector3.Up(),
    scene,
  );
  ambient.intensity = 0.85;
  const sun = new DirectionalLight(
    "benchmark sunlight",
    new Vector3(-0.65, -1, 0.45),
    scene,
  );
  sun.position.set(12, 30, -20);
  sun.diffuse = Color3.FromHexString("#ffdfb0");
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  const glow = new GlowLayer("benchmark glow", scene, {
    mainTextureFixedSize: 512,
  });
  const world = new World(scene, shadows);
  world.build();
  if (spriteMode !== undefined) world.explosions.setSpriteMode(spriteMode);
  renderer.textContent += world.explosions.spriteMode
    ? " · VFX: Sprites LOD"
    : " · VFX: Klassisk 3D";
  const camera = new FreeCamera(
    "benchmark camera",
    new Vector3(0, 23, -10),
    scene,
  );
  camera.setTarget(new Vector3(0, 0, 3));
  camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
  camera.orthoTop = 15;
  camera.orthoBottom = -15;
  const aspect =
    engine.getRenderingCanvas()!.clientWidth /
    engine.getRenderingCanvas()!.clientHeight;
  camera.orthoLeft = -15 * aspect;
  camera.orthoRight = 15 * aspect;
  const players = Array.from({ length: 3 }, (_, i) => {
    const p = new Player(world);
    p.root.position.set((i % 4) * 3 - 4.5, 0, -4 + Math.floor(i / 4) * 4);
    p.torso.material = world.mat(i < 2 ? "#ef6259" : "#4abde4");
    p.setWeaponModel(i % 2 ? "machineGun" : "pulseGun");
    return p;
  });
  const shots = players.map(() => {
    const m = MeshBuilder.CreateBox(
      "benchmark laser",
      { width: 0.05, height: 0.05, depth: 3 },
      scene,
    );
    m.material = world.mat("#ffcf76", true);
    return m;
  });
  const actors: BeaconActor[] = players.map((player, i) => ({
    id: `benchmark-${i}`,
    team: i < 2 ? "RED" : "BLUE",
    player,
  }));
  const beacons = new Beacons(world);
  type Stats = ReturnType<typeof frameStats>;
  const results: {
    tier: GraphicsTier;
    size: ReturnType<typeof renderSize>;
    stats: Stats;
    normal: Stats;
    intense: Stats;
  }[] = [];
  let intense = true;
  let time = 0;
  const timeline = new BenchmarkTimeline();
  const simulate = (tick: number, dt: number) => {
    time = tick / 60;
    players.forEach((p, i) => {
      p.animate(true, dt);
      p.root.position.x = (i % 4) * 3 - 4.5 + Math.sin(time * 2 + i);
      p.root.rotation.y = Math.sin(time + i);
      shots[i].setEnabled(i === 0 && tick % (intense ? 9 : 18) < 4);
      shots[i].position.set(
        p.root.position.x,
        0.9,
        p.root.position.z + 2 + Math.sin(time * 8) * 3,
      );
    });
    if (tick % 180 === 60) {
      world.explosions.random = benchmarkRandom(tick + 12345);
      world.explosions.burst(
        new Vector3(3, 0.2, 1),
        "#ffcf56",
        1,
        "bazookaExplosion",
        "normal",
      );
    }
    beacons.sync(
      [0].map((i) => ({
        id: i + 1,
        owner: actors[i].id,
        team: i === 0 ? "RED" : "BLUE",
        x: i === 0 ? -5 : 5,
        z: 2,
        hp: 100,
        yaw: Math.sin(time * 2 + i) * 0.8,
        charge: (time % 3) / 3,
        target: actors[2].id,
        moving: true,
        pitch: 0,
      })),
      [],
      [],
      actors,
      dt,
    );
    // Follow a running player through the atrium, moving the entire map in view.
    const runner = players[0];
    runner.root.position.set(
      Math.sin(time * 0.7) * 4,
      0,
      1 + Math.cos(time * 0.7) * 2,
    );
    runner.root.rotation.y = Math.atan2(
      Math.cos(time * 0.7) * 4,
      -Math.sin(time * 0.7) * 2,
    );
    camera.position.set(
      runner.root.position.x,
      23,
      runner.root.position.z - 13,
    );
    camera.setTarget(runner.root.position.add(new Vector3(0, 0, 0)));
    shots[0].position.set(
      runner.root.position.x,
      0.9,
      runner.root.position.z + 3,
    );
    world.explosions.update(dt);
  };
  const resetLoop = () => {
    timeline.reset();
    time = 0;
    world.explosions.update(10);
    players.forEach((p) => {
      p.walk = 0;
      p.stride = 0;
    });
    simulate(0, 0);
  };
  const render = (dt: number) => {
    timeline.advance(dt, simulate);
    engine.beginFrame();
    scene.render();
    engine.endFrame();
  };
  try {
    await world.whenAssetsReady();
    await scene.whenReadyAsync();
    // Render first so deferred effects compile before collecting samples.
    for (let i = 0; i < 12; i++) {
      render(1 / 60);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }
    await scene.whenReadyAsync();
    for (const tier of [
      "high",
      "standard",
      "medium",
      "low",
    ] as GraphicsTier[]) {
      time = 0;
      applyGraphics(engine, tier);
      const quality = GRAPHICS[tier];
      scene.shadowsEnabled = quality.shadow > 0;
      if (quality.shadow) shadows.getShadowMap()?.resize(quality.shadow);
      shadows.filteringQuality =
        tier === "medium"
          ? ShadowGenerator.QUALITY_LOW
          : ShadowGenerator.QUALITY_HIGH;
      world.explosions.amount = quality.effects;
      glow.intensity = quality.glow;
      scene.imageProcessingConfiguration.vignetteEnabled =
        tier === "standard" || tier === "high";
      const phaseStats: Stats[] = [];
      for (const phase of ["normal", "intense"] as const) {
        intense = phase === "intense";
        const phaseSamples: number[] = [];
        for (let repetition = 0; repetition < 2; repetition++) {
          resetLoop();
          let warm = 0,
            measured = 0,
            last = 0;
          const samples: number[] = [];
          const visibility = () => {
            resetLoop();
            warm = 0;
            measured = 0;
            last = 0;
            samples.length = 0;
          };
          document.addEventListener("visibilitychange", visibility);
          const resize = () => {
            visibility();
            applyGraphics(engine, tier);
          };
          window.addEventListener("resize", resize);
          await new Promise<void>((resolve) => {
            const frame = (now: number) => {
              if (document.hidden) {
                status.textContent =
                  "Testet är pausat. Återvänd till fliken för att börja om denna nivå.";
                visibility();
                requestAnimationFrame(frame);
                return;
              }
              const elapsed = last ? now - last : 0;
              last = now;
              status.textContent = `Testar ${quality.name} · ${engine.getRenderWidth()} × ${engine.getRenderHeight()} · ${phase === "normal" ? "3 spelare · 1 beacon · 1 explosion" : "3 spelare · tätare skott · 1 explosion"} · varv ${repetition + 1}/2 · ${warm < 1500 ? "värmer shaders" : "mäter bildrutetider"}`;
              render(
                warm < 1500
                  ? elapsed / 1000
                  : Math.min(elapsed / 1000, Math.max(0, 3 - measured / 1000)),
              );
              if (warm < 1500) {
                warm += elapsed;
                if (warm >= 1500) {
                  resetLoop();
                  last = 0;
                }
              } else if (elapsed > 0) {
                samples.push(elapsed);
                measured += elapsed;
              }
              if (measured >= 3000) resolve();
              else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
          document.removeEventListener("visibilitychange", visibility);
          window.removeEventListener("resize", resize);
          phaseSamples.push(...samples);
        }
        phaseStats.push(frameStats(phaseSamples));
      }
      const normal = phaseStats[0],
        intenseStats = phaseStats[1];
      const stats = combatStats(normal, intenseStats);
      const size = renderSize(
        engine.getRenderingCanvas()!.clientWidth,
        engine.getRenderingCanvas()!.clientHeight,
        tier,
      );
      results.push({ tier, size, stats, normal, intense: intenseStats });
      overlay.querySelector(".graphics-results")!.innerHTML = results
        .map(
          (r) =>
            `<p><b>${GRAPHICS[r.tier].name}</b> · ${r.size.width} × ${r.size.height} · normal ${r.normal.fps.toFixed(0)} FPS / p95 ${r.normal.p95.toFixed(1)} ms · intensiv ${r.intense.fps.toFixed(0)} FPS / p95 ${r.intense.p95.toFixed(1)} ms · kraftiga hack ${(r.intense.stalls * 100).toFixed(1)} %</p>`,
        )
        .join("");
    }
    const recommended = recommendGraphics(results);
    status.textContent = `Rekommenderat: ${GRAPHICS[recommended].name}. ${recommended === "standard" && standardIsComfortable(results.find((r) => r.tier === "standard")!.stats) ? "Standard klarar minst 45 FPS i båda stridstesten och prioriteras för bildkvaliteten." : "Denna nivå har högst uppmätt FPS. Vid identisk FPS avgör andelen kraftiga hack."}`;
    const explanation = document.createElement("p");
    explanation.textContent =
      "Varje nivå kör samma förutbestämda loop två gånger per stridsfas, med identiska rörelser och explosioner. P95 är tiden som 95 % av bildrutorna håller sig under. Kraftiga hack är bildrutor över 50 ms. Rekommendationen använder FPS från det svagare stridsresultatet. Standard prioriteras från 45 FPS; annars väljs högst FPS, med hackprocent som utslagsgivare vid identisk FPS.";
    overlay.querySelector(".graphics-report")!.append(explanation);
    const table = document.createElement("div");
    table.className = "graphics-tier-table";
    table.innerHTML =
      "<table><thead><tr><th>Nivå</th><th>Max upplösning</th><th>Skuggor</th><th>Effekter</th><th>Glow</th></tr></thead><tbody>" +
      Object.values(GRAPHICS)
        .map(
          (q) =>
            `<tr><td>${q.name}</td><td>${q.height}p</td><td>${q.shadow === 0 ? "Av" : q.shadow === 512 ? "Enklare" : "Detaljerade"}</td><td>${q.effects === 1 ? "Full mängd" : q.effects === 0.6 ? "Reducerade" : "Få"}</td><td>${q.glow === 0.2 ? "Full" : q.glow === 0.1 ? "Reducerad" : "Begränsad"}</td></tr>`,
        )
        .join("") +
      "</tbody></table>";
    overlay.querySelector(".graphics-report")!.append(table);
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Grafiknivå");
    for (const [id, quality] of Object.entries(GRAPHICS)) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${quality.name} · max ${quality.height}p · ${quality.shadow ? (quality.shadow === 512 ? "enklare skuggor" : "detaljerade skuggor") : "skuggor av"}`;
      select.append(option);
    }
    select.value = recommended;
    const button = document.createElement("button");
    button.textContent = "Spara och fortsätt";
    overlay.querySelector(".graphics-report")!.append(select, button);
    const chosen = await new Promise<GraphicsTier>((resolve) => {
      button.onclick = () => resolve(select.value as GraphicsTier);
    });
    saveGraphics(chosen);
    applyGraphics(engine, chosen);
    return chosen;
  } finally {
    scene.dispose();
    overlay.remove();
    document.body.classList.remove("graphics-testing");
  }
}
