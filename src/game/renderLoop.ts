/** Surface frame failures instead of leaving a frozen last frame without controls. */
export function guardedRenderLoop(
  tick: () => void,
  stop: () => void,
  report: (error: unknown) => void,
) {
  let failed = false;
  return () => {
    if (failed) return;
    try {
      tick();
    } catch (error) {
      failed = true;
      stop();
      report(error);
    }
  };
}

/** All game frames, including the first, belong to the engine's frame lifecycle. */
export function startGameRenderLoop(
  engine: { runRenderLoop(callback: () => void): void; stopRenderLoop(callback: () => void): void },
  tick: () => void,
  report: (error: unknown) => void,
) {
  const render = guardedRenderLoop(tick, () => engine.stopRenderLoop(render), report);
  engine.runRenderLoop(render);
  return render;
}
