import type { Game } from "./game";
/** Local, opt-in capture. Never sends diagnostics to the multiplayer server. */
export function profileEffects(game: Game) {
  const {scene, engine} = game;
  let previous = performance.now(), frameStart = previous;
  const frames: {at:number; gap:number; cpu:number}[] = [];
  const shaders: number[] = [], lights: {at:number; action:string}[] = [];
  const before = engine.onBeginFrameObservable.add(() => {
    frameStart = performance.now();
  });
  const after = engine.onEndFrameObservable.add(() => {
    const now = performance.now();
    frames.push({at: now, gap: frameStart - previous, cpu: now - frameStart});
    previous = frameStart;
    while (frames.length > 600) frames.shift();
    while (shaders.length && shaders[0] < now - 10000) shaders.shift();
    while (lights.length && lights[0].at < now - 10000) lights.shift();
  });
  const shader = engine.onBeforeShaderCompilationObservable.add(() => shaders.push(performance.now()));
  const added = scene.onNewLightAddedObservable.add(() => lights.push({at:performance.now(),action:"add"}));
  const removed = scene.onLightRemovedObservable.add(() => lights.push({at:performance.now(),action:"remove"}));
  const original = game.world.explosions.burst;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  game.world.explosions.burst = function (...args) {
    const start = performance.now();
    const meshCount = scene.meshes.length;
    const result = original.apply(this,args);
    const creationMs = performance.now() - start;
    const timer = setTimeout(() => {
      timers.delete(timer);
      const samples = frames.filter(f => f.at >= start - 500 && f.at <= start + 1500);
      const gaps = samples.map(f=>f.gap).sort((a,b)=>a-b);
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      console.info("Office Core effect profile " + JSON.stringify({
        sound: args[3], power: args[2] ?? 1,
        creationMs: +creationMs.toFixed(2), meshesBefore: meshCount, meshesAfter: scene.meshes.length,
        maxFrameMs: +Math.max(0,...gaps).toFixed(2),
        p95FrameMs: +(gaps[Math.floor(gaps.length*.95)] ?? 0).toFixed(2),
        maxCpuMs: +Math.max(0,...samples.map(f=>f.cpu)).toFixed(2),
        slowFrames: samples.filter(f=>f.gap>50).length,
        shaderStarts: shaders.filter(at=>at>=start && at<=start+1500).length,
        lights: lights.filter(l=>l.at>=start && l.at<=start+1500).map(l=>l.action),
        requests: resources.filter(r=>r.startTime>=start && r.startTime<=start+1500).map(r=>({url:r.name, bytes:r.transferSize,durationMs:+r.duration.toFixed(1)})),
      }));
    }, 1600);
    timers.add(timer);
    return result;
  };
  scene.onDisposeObservable.addOnce(() => {
    engine.onBeginFrameObservable.remove(before);
    engine.onEndFrameObservable.remove(after);
    engine.onBeforeShaderCompilationObservable.remove(shader);
    scene.onNewLightAddedObservable.remove(added);
    scene.onLightRemovedObservable.remove(removed);
    game.world.explosions.burst = original;
    timers.forEach(clearTimeout);
  });
}
