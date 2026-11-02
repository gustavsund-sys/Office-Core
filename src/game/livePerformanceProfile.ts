import { EngineInstrumentation, SceneInstrumentation, WebGPUEngine } from "@babylonjs/core";
import type { Game } from "./game";
import { readGraphics } from "./graphicsSettings";

/** Opt-in, local-only recording. The download contains no player names or chat. */
export function installLivePerformanceProfile(game: Game) {
  const { scene, engine, camera } = game;
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;z-index:99999;top:8px;left:8px;padding:8px;background:#10202aee;color:white;font:12px sans-serif;border:1px solid #76c4d3;border-radius:5px;display:flex;gap:6px;align-items:center";
  const status = document.createElement("span");
  const record = document.createElement("button");
  const download = document.createElement("button");
  record.textContent = "Starta mätning";
  download.textContent = "Ladda ner";
  download.disabled = true;
  status.textContent = "Analysläge redo";
  panel.append(status, record, download);
  document.body.append(panel);

  let active = false;
  let start = 0, previous = 0, lastBucket = 0;
  let frames: number[] = [], cpu: number[] = [], render: number[] = [], targets: number[] = [], evaluation: number[] = [], gpu: number[] = [];
  let samples: object[] = [];
  let sceneInfo: SceneInstrumentation | undefined;
  let engineInfo: EngineInstrumentation | undefined;
  let gpuSupported = false;
  let gpuCounterCount = 0;
  const gpuEngine = engine.isWebGPU ? engine as WebGPUEngine : undefined;
  const profileSize = { width: 1920, height: 1080 };
  const lockSize = () => {
    if (engine.getRenderWidth() !== profileSize.width || engine.getRenderHeight() !== profileSize.height) {
      engine.setSize(profileSize.width, profileSize.height);
      if (camera.mode === 1 && camera.orthoTop != null && camera.orthoBottom != null) {
        const halfHeight = (camera.orthoTop - camera.orthoBottom) / 2;
        camera.orthoLeft = -halfHeight * profileSize.width / profileSize.height;
        camera.orthoRight = halfHeight * profileSize.width / profileSize.height;
      }
    }
  };
  lockSize();
  window.addEventListener("resize", lockSize);
  let metadata: object = {};
  const round = (n: number) => Math.round(n * 100) / 100;
  const mean = (a: number[]) => a.length ? round(a.reduce((s, n) => s + n, 0) / a.length) : null;
  const percentile = (a: number[], p: number) => a.length ? round([...a].sort((x, y) => x - y)[Math.ceil(a.length * p) - 1]) : null;
  const flush = (now: number) => {
    if (!frames.length || !sceneInfo) return;
    const network = game.multiplayer;
    samples.push({
      elapsedMs: Math.round(now - start), durationMs: Math.round(now - lastBucket),
      frames: frames.length, fps: round(1000 * frames.length / frames.reduce((a, b) => a + b, 0)),
      frameMs: { mean: mean(frames), p95: percentile(frames, .95), p99: percentile(frames, .99), max: round(Math.max(...frames)), over33ms: frames.filter(x => x > 33.4).length, over50ms: frames.filter(x => x > 50).length },
      sceneCpuMs: mean(cpu), renderCpuMs: mean(render), renderTargetsCpuMs: mean(targets), activeMeshEvaluationCpuMs: mean(evaluation), gpuMs: mean(gpu),
      drawCalls: sceneInfo.drawCallsCounter.current, activeMeshes: scene.getActiveMeshes().length, activeTriangles: Math.round(scene.getActiveIndices() / 3),
      renderTargets: scene.customRenderTargets.length, shadowsEnabled: scene.shadowsEnabled, fogMode: scene.fogMode,
      effectLayers: scene.effectLayers.filter(l => l.isEnabled).map(l => l.name),
      position: { x: round(camera.position.x), y: round(camera.position.y), z: round(camera.position.z) },
      cameraRotation: { x: round(camera.rotation.x), y: round(camera.rotation.y), z: round(camera.rotation.z) },
      viewport: { width: window.innerWidth, height: window.innerHeight, renderWidth: engine.getRenderWidth(), renderHeight: engine.getRenderHeight(), pixelRatio: window.devicePixelRatio },
      graphics: readGraphics() ?? "unknown", hidden: document.hidden,
      network: network ? { connected: network.connected, rttMs: round(network.rtt), ackAgeMs: round(network.ackAge), snapshotAgeMs: network.lastSnapshotAt ? round(now - network.lastSnapshotAt) : null, jitterMs: round(network.timing.jitter), bufferMs: round(network.timing.delay) } : null,
    });
    frames = []; cpu = []; render = []; targets = []; evaluation = []; gpu = []; lastBucket = now;
  };
  const after = scene.onAfterRenderObservable.add(() => {
    if (!active || !sceneInfo) return;
    lockSize();
    const now = performance.now();
    if (previous) frames.push(now - previous);
    previous = now;
    cpu.push(sceneInfo.frameTimeCounter.current);
    render.push(sceneInfo.renderTimeCounter.current);
    targets.push(sceneInfo.renderTargetsRenderTimeCounter.current);
    evaluation.push(sceneInfo.activeMeshesEvaluationTimeCounter.current);
    // Babylon's GPU counter is in nanoseconds and can arrive asynchronously.
    const gpuCounter = gpuEngine?.gpuTimeInFrameForMainPass?.counter ?? engineInfo?.gpuFrameTimeCounter;
    const gpuNs = gpuCounter?.current ?? 0;
    if (gpuSupported && gpuCounter && gpuCounter.count > gpuCounterCount) {
      gpuCounterCount = gpuCounter.count;
      if (gpuNs > 0) gpu.push(gpuNs / 1e6);
    }
    if (now - lastBucket >= 1000) flush(now);
    if (now - start >= 30 * 60 * 1000) stop();
  });
  function stop() {
    if (!active) return;
    flush(performance.now()); active = false;
    if (gpuEngine && gpuSupported) gpuEngine.enableGPUTimingMeasurements = false;
    if (engineInfo) { engineInfo.captureGPUFrameTime = false; engineInfo.dispose(); engineInfo = undefined; }
    sceneInfo?.dispose(); sceneInfo = undefined;
    record.textContent = "Starta ny mätning";
    download.disabled = !samples.length;
    status.textContent = `Mätning klar: ${samples.length} sektioner`;
  }
  record.onclick = () => {
    if (active) { stop(); return; }
    lockSize();
    samples = []; frames = []; cpu = []; render = []; targets = []; evaluation = []; gpu = [];
    sceneInfo = new SceneInstrumentation(scene);
    sceneInfo.captureFrameTime = true; sceneInfo.captureRenderTime = true;
    sceneInfo.captureRenderTargetsRenderTime = true; sceneInfo.captureActiveMeshesEvaluationTime = true;
    gpuSupported = engine.isWebGPU ? (engine as WebGPUEngine).enabledExtensions.includes("timestamp-query") : !!engine.getCaps().timerQuery;
    if (gpuSupported) {
      try {
        if (gpuEngine) gpuEngine.enableGPUTimingMeasurements = true;
        else { engineInfo = new EngineInstrumentation(engine); engineInfo.captureGPUFrameTime = true; }
      }
      catch { engineInfo?.dispose(); engineInfo = undefined; gpuSupported = false; }
    }
    gpuCounterCount = 0;
    start = lastBucket = performance.now(); previous = 0; active = true;
    metadata = { startedAt: new Date().toISOString(), userAgent: navigator.userAgent, renderer: engine.isWebGPU ? "WebGPU" : "WebGL", gpuTimingSupported: gpuSupported, gpuTimingNote: gpuEngine ? "GPU main render pass only; excludes render targets and compute. Results arrive asynchronously; null means unavailable." : "GPU frame results arrive asynchronously; null means unavailable.", fixedRenderSize: profileSize, frameTimingNote: "Frame intervals are measured between scene renders; CPU counters measure Babylon scene work, not all JavaScript.", graphics: readGraphics() ?? "unknown" };
    status.textContent = "Mätning pågår"; record.textContent = "Stoppa mätning"; download.disabled = true;
  };
  download.onclick = () => {
    const blob = new Blob([JSON.stringify({ format: "office-core-performance-v1", metadata, samples }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `office-core-performance-${new Date().toISOString().replace(/[:.]/g, "-")}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  scene.onDisposeObservable.addOnce(() => { stop(); scene.onAfterRenderObservable.remove(after); window.removeEventListener("resize", lockSize); panel.remove(); });
}
