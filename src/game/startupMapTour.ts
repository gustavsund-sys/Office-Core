import { Vector3 } from "@babylonjs/core";
import type { Game } from "./game";
import { office01 } from "../maps/office01";

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}
/** Overlapping camera footprints also cover room edges, with no dependence on frame rate. */
export function mapTourPoints(
  rects: readonly Rect[],
  stepX: number,
  stepZ: number,
) {
  if (!rects.length) return [];
  const minX = Math.min(...rects.map((r) => r.x - r.w / 2));
  const maxX = Math.max(...rects.map((r) => r.x + r.w / 2));
  const minZ = Math.min(...rects.map((r) => r.z - r.d / 2));
  const maxZ = Math.max(...rects.map((r) => r.z + r.d / 2));
  const nx = Math.max(1, Math.ceil((maxX - minX) / Math.max(4, stepX)));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / Math.max(4, stepZ)));
  const points: { x: number; z: number }[] = [];
  for (let iz = 0; iz <= nz; iz++) {
    const row: { x: number; z: number }[] = [];
    for (let ix = 0; ix <= nx; ix++) {
      const x = minX + ((maxX - minX) * ix) / nx,
        z = minZ + ((maxZ - minZ) * iz) / nz;
      if (
        rects.some(
          (r) =>
            Math.abs(x - r.x) <= r.w / 2 + stepX / 2 &&
            Math.abs(z - r.z) <= r.d / 2 + stepZ / 2,
        )
      )
        row.push({ x, z });
    }
    points.push(...(iz % 2 ? row.reverse() : row));
  }
  return points;
}

/** Render the real scene behind the loading overlay; no gameplay ticks, audio or network input. */
export async function prepareMapTour(
  game: Game,
  frame: () => Promise<void>,
  progress: (fraction: number) => void,
  options: { budgetMs?: number; now?: () => number } = {},
) {
  const { scene, camera, engine, world } = game;
  const position = camera.position.clone(),
    target = camera.getTarget().clone();
  const offset = position.subtract(target);
  const width = Math.abs((camera.orthoRight ?? 20) - (camera.orthoLeft ?? -20));
  const height = Math.abs(
    (camera.orthoTop ?? 15) - (camera.orthoBottom ?? -15),
  );
  const depth = height * Math.sqrt(1 + (offset.z / Math.max(1, offset.y)) ** 2);
  const points = mapTourPoints(office01.footprint, width * 0.45, depth * 0.45);
  let shaderCount = 0,
    passes = 0,
    stable = false;
  const observer = engine.onBeforeShaderCompilationObservable.add(
    () => shaderCount++,
  );
  const now = options.now ?? (() => performance.now());
  const budgetMs = options.budgetMs ?? 15000;
  const started = now();
  try {
    // At most three passes and a soft time budget. Never hold startup indefinitely.
    tour: for (let pass = 0; pass < 3; pass++) {
      const before = shaderCount;
      for (let i = 0; i < points.length; i++) {
        // A slow mobile pass must not consume minutes before checking its budget.
        if (now() - started >= budgetMs) break tour;
        if (typeof document !== "undefined" && document.hidden) {
          // Background rAF is throttled: retain the current view and resume on return.
          while (typeof document !== "undefined" && document.hidden)
            await frame();
        }
        const focus = new Vector3(points[i].x, 0, points[i].z);
        camera.position.copyFrom(focus.add(offset));
        camera.setTarget(focus);
        camera.getViewMatrix(true);
        camera.getProjectionMatrix(true);
        game.warzone.update(0);
        world.lighting?.update(0.16);
        await frame();
        await frame();
        // Include shadow/glow render targets, rather than only surface materials.
        for (
          let wait = 0;
          wait < 12 && now() - started < budgetMs && !scene.isReady(true);
          wait++
        )
          await frame();
        progress(Math.min(0.98, (pass + i / Math.max(1, points.length)) / 3));
      }
      passes++;
      // Always complete one verification pass, even if the first reported no shaders.
      if (pass > 0 && shaderCount === before) {
        stable = true;
        break;
      }
      if (pass > 0 && now() - started > 15000) break;
    }
    console.info(
      "Office Core map warmup " +
        JSON.stringify({
          views: points.length,
          passes,
          shaderStarts: shaderCount,
          stable,
          durationMs: Math.round(now() - started),
        }),
    );
  } finally {
    engine.onBeforeShaderCompilationObservable.remove(observer);
    camera.position.copyFrom(position);
    camera.setTarget(target);
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    game.warzone.update(0);
    world.lighting?.update(0.16);
    // Re-render the restored starting view before lifting the overlay.
    await frame();
    await frame();
    progress(1);
  }
}
