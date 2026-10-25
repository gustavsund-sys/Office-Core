import {
  Camera,
  Color3,
  Scene,
  SceneInstrumentation,
  Vector3,
} from "@babylonjs/core";
import type { Game } from "./game";
import { LOOKOUT, lookoutPose } from "./lookoutConfig";

/** Development-only ablation test. No network diagnostics or gameplay mutation. */
export function profileTurret(game: Game) {
  const { scene, engine, camera } = game;
  const overlayStyle = document.createElement("style");
  overlayStyle.textContent =
    "#overlay,dialog.whats-new,dialog.whats-new::backdrop{display:none!important;backdrop-filter:none!important}";
  document.head.append(overlayStyle);

  const saved = {
    position: camera.position.clone(),
    rotation: camera.rotation.clone(),
    mode: camera.mode,
    fov: camera.fov,
    minZ: camera.minZ,
    fog: scene.fogMode,
    fogColor: scene.fogColor.clone(),
    fogStart: scene.fogStart,
    fogEnd: scene.fogEnd,
    shadows: scene.shadowsEnabled,
    layers: scene.effectLayers.map((l) => [l, l.isEnabled] as const),
  };
  const info = new SceneInstrumentation(scene);
  info.captureFrameTime = true;
  info.captureActiveMeshesEvaluationTime = true;
  info.captureRenderTargetsRenderTime = true;
  info.captureRenderTime = true;
  const phases = [
    { name: "normal", turret: false },
    { name: "turret-first", turret: true },
    { name: "turret-warm", turret: true },
    { name: "turret-no-portals", turret: true, portals: false },
    { name: "turret-no-shadows", turret: true, shadows: false },
    { name: "turret-no-glow", turret: true, glow: false },
    { name: "turret-no-fog", turret: true, fog: false },
    {
      name: "turret-minimal",
      turret: true,
      portals: false,
      shadows: false,
      glow: false,
      fog: false,
    },
    { name: "turret-final", turret: true },
    { name: "normal-final", turret: false },
  ];
  let index = 0,
    start = performance.now(),
    previous = 0,
    shaders = 0,
    ready = false;
  let samples: {
    gap: number;
    cpu: number;
    targets: number;
    evaluation: number;
    render: number;
    draws: number;
    meshes: number;
    vertices: number;
    portals: number;
  }[] = [];
  const shader = engine.onBeforeShaderCompilationObservable.add(
    () => shaders++,
  );
  const setup = () => {
    const p = phases[index];
    scene.shadowsEnabled = p.shadows !== false && saved.shadows;
    for (const [layer, enabled] of saved.layers)
      layer.isEnabled = p.glow !== false && enabled;
    scene.fogMode =
      p.turret && p.fog !== false ? Scene.FOGMODE_LINEAR : saved.fog;
    scene.fogStart = 55;
    scene.fogEnd = 170;
    scene.fogColor = Color3.FromHexString("#060b0f");
    start = performance.now();
    previous = 0;
    shaders = 0;
    samples = [];
    ready = false;
    console.info("Office Core turret profile phase " + p.name);
  };
  const pose = scene.onBeforeAnimationsObservable.add(() => {
    const p = phases[index];
    if (p.turret) {
      const station = lookoutPose(-1).station;
      camera.mode = Camera.PERSPECTIVE_CAMERA;
      camera.fov = 1;
      camera.minZ = 0.08;
      camera.position.copyFrom(
        station.add(new Vector3(LOOKOUT.eyeOffset, LOOKOUT.eyeHeight, 0)),
      );
      camera.rotationQuaternion = null;
      camera.rotation.set(0.24, Math.PI / 2, 0);
      game.player.setViewVisibility(0);
    } else {
      camera.mode = saved.mode;
      camera.fov = saved.fov;
      camera.minZ = saved.minZ;
      camera.position.copyFrom(saved.position);
      camera.rotation.copyFrom(saved.rotation);
    }
  });
  const portals = scene.onBeforeRenderObservable.add(() => {
    if (phases[index].portals === false)
      for (let i = scene.customRenderTargets.length - 1; i >= 0; i--)
        if (
          scene.customRenderTargets[i].name === "lower office perspective view"
        )
          scene.customRenderTargets.splice(i, 1);
  });
  const finish = () => {
    scene.onBeforeAnimationsObservable.remove(pose);
    scene.onBeforeRenderObservable.remove(portals);
    scene.onAfterRenderObservable.remove(after);
    engine.onBeforeShaderCompilationObservable.remove(shader);
    info.dispose();
    overlayStyle.remove();
    camera.mode = saved.mode;
    camera.fov = saved.fov;
    camera.minZ = saved.minZ;
    camera.position.copyFrom(saved.position);
    camera.rotation.copyFrom(saved.rotation);
    scene.fogMode = saved.fog;
    scene.fogColor.copyFrom(saved.fogColor);
    scene.fogStart = saved.fogStart;
    scene.fogEnd = saved.fogEnd;
    scene.shadowsEnabled = saved.shadows;
    for (const [l, e] of saved.layers) l.isEnabled = e;
    console.info("Office Core turret profile complete");
  };
  const after = scene.onAfterRenderObservable.add(() => {
    if (document.hidden) {
      console.warn("Office Core turret profile aborted: hidden tab");
      finish();
      return;
    }
    const now = performance.now();
    if (now - start < 1500) {
      previous = now;
      return;
    }
    if (!ready) {
      shaders = 0;
      ready = true;
    }
    if (previous)
      samples.push({
        gap: now - previous,
        cpu: info.frameTimeCounter.current,
        targets: info.renderTargetsRenderTimeCounter.current,
        evaluation: info.activeMeshesEvaluationTimeCounter.current,
        render: info.renderTimeCounter.current,
        draws: info.drawCallsCounter.current,
        meshes: scene.getActiveMeshes().length,
        vertices: scene.totalVerticesPerfCounter.current,
        portals: scene.customRenderTargets.filter(
          (t) => t.name === "lower office perspective view",
        ).length,
      });
    previous = now;
    if (now - start < 5500) return;
    const mean = (key: keyof (typeof samples)[number]) =>
      +(
        samples.reduce((n, s) => n + s[key], 0) / Math.max(1, samples.length)
      ).toFixed(2);
    const gaps = samples.map((s) => s.gap).sort((a, b) => a - b);
    if (phases[index].name === "turret-warm") {
      const counts = new Map<string, number>(),
        active = scene.getActiveMeshes();
      for (let i = 0; i < active.length; i++) {
        const name = active.data[i].name.replace(/\d+/g, "#");
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      console.info(
        "Office Core turret objects " +
          JSON.stringify([...counts].sort((a, b) => b[1] - a[1]).slice(0, 18)),
      );
    }
    console.info(
      "Office Core turret profile " +
        JSON.stringify({
          phase: phases[index].name,
          renderer: engine.isWebGPU ? "WebGPU" : "WebGL",
          fps: +(1000 / mean("gap")).toFixed(1),
          p95Ms: gaps[Math.floor(gaps.length * 0.95)],
          cpuMs: mean("cpu"),
          targetMs: mean("targets"),
          evaluateMs: mean("evaluation"),
          renderMs: mean("render"),
          draws: mean("draws"),
          meshes: mean("meshes"),
          vertices: mean("vertices"),
          portals: mean("portals"),
          shaderStarts: shaders,
        }),
    );
    index++;
    if (index >= phases.length) finish();
    else setup();
  });
  setup();
}
