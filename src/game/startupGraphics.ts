import { markGPUStartup } from "./webgpuDiagnostics";
import { materialLightLimit } from "../effects/combatLighting";
import { prepareMapTour } from "./startupMapTour";
import {
  waitForTextureAssets,
  waitForGraphicsWarmup,
  finishStartupRendering,
} from "./startupReadiness";
import {
  Mesh,
  Vector3,
  type AbstractMesh,
  type Material,
  type WebGPUEngine,
} from "@babylonjs/core";
import type { Game } from "./game";
import { WEAPONS, type WeaponId } from "../config/weapons";
import { heldWeapon } from "../weapons/models";
import { rcCarModel } from "./rcCarModel";
import { pulseTrapModel } from "./pulseTrap";
import { beaconModel } from "./beacon";
import { superMedkitModel } from "../pickups/superMedkitModel";
import { beam, shard, flash, releaseEffect } from "./effectPool";

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/** Warm actual scene resources without ticking gameplay, changing HP or playing sounds. */
export async function prepareStartupGraphics(
  game: Game,
  status: (text: string, progress: number) => void,
) {
  markGPUStartup("graphics preparation started");
  status("Möblerar kontoret…", 0);
  const { world, scene, camera } = game;
  const center = game.player.root.position.clone();
  const models = [
    ...Object.keys(WEAPONS).map((id) => heldWeapon(world, id as WeaponId)),
    rcCarModel(world).root,
    pulseTrapModel(world),
    beaconModel(world, "RED").root,
    beaconModel(world, "BLUE").root,
    superMedkitModel(world),
  ];
  models.forEach((m, i) =>
    m.position
      .copyFrom(center)
      .addInPlace(new Vector3((i % 4) - 2, 0.5, Math.floor(i / 4))),
  );
  const pooled = [
    beam(scene, center, center.add(new Vector3(2, 1, 3)), 0.04),
    shard(scene, 0.15),
    flash(scene, 0.2),
  ];
  for (const mesh of pooled) {
    mesh.position.copyFrom(center).y += 1;
    mesh.material = world.mat("#ffe4a5", true);
  }
  world.blood.drop(center);
  world.explosions.prepare(center);
  game.boss?.prepareGraphics(center);
  let renderError: unknown;
  const nextFrame = async () => {
    await frame();
    if (renderError !== undefined) throw renderError;
  };
  const warmRender = () => {
    try {
      scene.render();
    } catch (error) {
      renderError = error;
      game.engine.stopRenderLoop(warmRender);
    }
  };
  game.engine.runRenderLoop(warmRender);
  try {
    status("Ställer fram palmerna…", 0.12);
    await world.whenAssetsReady();
    status("Laddar eld, rök och gnistor…", 0.24);
    await waitForTextureAssets(() => scene.textures, nextFrame);
    status("Tänder kontorsbelysningen…", 0.35);
    if (!(await waitForGraphicsWarmup(() => scene.isReady(false), nextFrame)))
      console.warn(
        "Office Core: optional scene warmup budget reached; continuing with prepared assets.",
      );
    status("Provkör explosionerna bakom kulisserna…", 0.4);
    // Keep the same two light slots/material capacity for startup and live gameplay.
    for (const material of scene.materials)
      if ("maxSimultaneousLights" in material)
        (
          material as Material & { maxSimultaneousLights: number }
        ).maxSimultaneousLights = materialLightLimit(scene, material);
    world.explosions.rehearse(center, "normal");
    // Compile representatives of material/vertex-layout variants, including objects
    // outside the initial camera. Real render passes also prepare sprite pipelines.
    const variants = new Map<
      string,
      { material: Material; mesh: AbstractMesh }
    >();
    for (const mesh of scene.meshes)
      if (mesh.material && mesh.getTotalVertices()) {
        const key = `${mesh.material.uniqueId}:${mesh instanceof Mesh ? mesh.getVerticesDataKinds().join() : ""}:${mesh.hasThinInstances}`;
        if (!variants.has(key))
          variants.set(key, { material: mesh.material, mesh });
      }
    const jobs = [...variants.values()];
    for (let i = 0; i < jobs.length; i += 8) {
      await Promise.all(
        jobs.slice(i, i + 8).map(({ material, mesh }) =>
          material.forceCompilationAsync(mesh, {
            useInstances: mesh.hasThinInstances,
          }),
        ),
      );
      status(
        "Polerar skuggor och ljuseffekter…",
        0.4 + 0.25 * Math.min(1, (i + 8) / jobs.length),
      );
      await nextFrame();
    }
    for (const style of ["normal", "large", "plasma"] as const) {
      world.explosions.update(20);
      world.explosions.rehearse(center, style);
      // Advance actual sprites and light fades across several covered render passes.
      for (let step = 0; step < 4; step++) {
        world.explosions.update(1 / 60);
        await nextFrame();
      }
    }
    const original = camera.position.clone();
    try {
      // Shadow maps and sprite/glow variants are compiled while the loading screen covers the canvas.
      for (let i = 0; i < 3; i++) {
        world.lighting?.pulse(center, true, i === 1);
        await nextFrame();
      }
    } finally {
      camera.position.copyFrom(original);
    }
    await prepareMapTour(game, nextFrame, (fraction) =>
      status("Inspekterar kontorets alla hörn…", 0.7 + fraction * 0.28),
    );
    if (!(await waitForGraphicsWarmup(() => scene.isReady(false), nextFrame)))
      console.warn(
        "Office Core: optional scene warmup budget reached; continuing with prepared assets.",
      );
    status("Grafiken är redo för första skottet.", 1);
  } finally {
    await finishStartupRendering(
      () => game.engine.stopRenderLoop(warmRender),
      async () => {
        if (!game.engine.isWebGPU) return;
        markGPUStartup("warmup GPU queue draining");
        await (game.engine as WebGPUEngine)._device.queue.onSubmittedWorkDone();
        markGPUStartup("warmup GPU queue completed");
      },
      () => {
        markGPUStartup("graphics cleanup started");
        world.blood.reset();
        world.explosions.update(20);
        game.boss?.finishGraphicsPreparation();
        models.forEach((m) => m.dispose(false, false));
        pooled.forEach(releaseEffect);
        markGPUStartup("graphics cleanup completed");
      },
    );
  }
}
