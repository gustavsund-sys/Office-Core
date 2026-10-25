import { Vector3 } from "@babylonjs/core";
import { office01 } from "../maps/office01";
import type { Game } from "./game";

/** Local rendering-only comparison; never changes players, match state or the network. */
export function profileMapRoute(game: Game) {
  const { scene, engine, camera } = game;
  const original = camera.position.clone(),
    target = camera.getTarget().clone();
  const offset = original.subtract(target);
  const red = office01.bases.find((b) => b.team === "RED")!;
  const blue = office01.bases.find((b) => b.team === "BLUE")!;
  let started = performance.now() + 1000,
    previous = 0,
    pass = 0;
  const visible = new Set<number>();
  let samples: { gap: number; x: number; z: number; fresh: string[] }[] = [];
  let shaders: { at: number; x: number; z: number }[] = [];
  const shader = engine.onBeforeShaderCompilationObservable.add(() => {
    if (previous)
      shaders.push({
        at: performance.now(),
        x: camera.position.x,
        z: camera.position.z,
      });
  });
  const finishPass = (end: number) => {
    const times = samples.map((s) => s.gap).sort((a, b) => a - b);
    console.info(
      "Office Core route profile " +
        JSON.stringify({
          pass: pass + 1,
          renderer: engine.isWebGPU ? "WebGPU" : "WebGL",
          frames: times.length,
          maxMs: times.at(-1),
          p95Ms: times[Math.floor(times.length * 0.95)],
          over35: samples.filter((s) => s.gap > 35).length,
          shaderStarts: shaders.length,
          shaderLocations: shaders.slice(0, 25),
          slowFrames: samples
            .filter((s) => s.gap > 35)
            .sort((a, b) => b.gap - a.gap)
            .slice(0, 8),
          requests: (
            performance.getEntriesByType(
              "resource",
            ) as PerformanceResourceTiming[]
          )
            .filter((r) => r.startTime >= started && r.startTime <= end)
            .map((r) => ({
              url: r.name,
              bytes: r.transferSize,
              durationMs: r.duration,
            })),
        }),
    );
  };
  const cleanup = () => {
    scene.onBeforeRenderObservable.remove(before);
    scene.onAfterRenderObservable.remove(after);
    engine.onBeforeShaderCompilationObservable.remove(shader);
    camera.position.copyFrom(original);
    camera.setTarget(target);
  };
  const before = scene.onBeforeRenderObservable.add(() => {
    if (document.hidden) {
      console.warn("Route profile aborted: background tab");
      cleanup();
      return;
    }
    const now = performance.now();
    if (now < started) return;
    const t = Math.min(1, (now - started) / 12000);
    const focus = new Vector3(
      red.x + (blue.x - red.x) * t,
      0,
      red.z + (blue.z - red.z) * t + Math.sin(t * Math.PI * 2) * 8,
    );
    camera.position.copyFrom(focus.add(offset));
    camera.setTarget(focus);
  });
  const after = scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    if (now < started) return;
    const fresh: string[] = [];
    const active = scene.getActiveMeshes();
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i];
      if (!visible.has(mesh.uniqueId)) {
        visible.add(mesh.uniqueId);
        if (fresh.length < 8) fresh.push(mesh.name);
      }
    }
    if (previous)
      samples.push({
        gap: now - previous,
        x: camera.position.x,
        z: camera.position.z,
        fresh,
      });
    previous = now;
    if (now - started >= 12000) {
      finishPass(now);
      if (pass++ === 0) {
        started = now + 500;
        previous = 0;
        samples = [];
        shaders = [];
      } else cleanup();
    }
  });
  scene.onDisposeObservable.addOnce(cleanup);
}
