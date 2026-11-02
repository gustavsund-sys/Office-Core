import { Octree, SceneInstrumentation } from "@babylonjs/core";
import type { Game } from "./game";

/** Local-only observation of candidate selection; it does not alter culling. */
export function installCullingDiagnostics(game: Game) {
  const { scene, camera } = game;
  const panel = document.createElement("pre");
  panel.style.cssText = "position:fixed;z-index:99999;top:5px;left:5px;max-width:95vw;max-height:45vh;overflow:auto;background:#001b22ee;color:#fff;font:12px monospace;padding:8px;white-space:pre-wrap;pointer-events:none";
  panel.textContent = "Culling diagnostics warming up…";
  document.body.append(panel);
  const info = new SceneInstrumentation(scene);
  info.captureActiveMeshesEvaluationTime = true;
  info.captureFrameTime = true;
  const original = scene.getActiveMeshCandidates;
  let evaluationCalls = 0, candidateTotal = 0, mainCalls = 0, extraCalls = 0;
  let cpu: number[] = [], frame: number[] = [], active: number[] = [], draws: number[] = [];
  let start = performance.now(), prev = 0, gaps: number[] = [];
  scene.getActiveMeshCandidates = () => {
    const result = original();
    evaluationCalls++;
    candidateTotal += result.length;
    if (scene.activeCamera === camera) mainCalls++; else extraCalls++;
    return result;
  };
  const round = (x: number) => Math.round(x * 100) / 100;
  const avg = (xs: number[]) => round(xs.reduce((a,b) => a+b,0) / Math.max(xs.length,1));
  const observer = scene.onAfterRenderObservable.add(() => {
    const now = performance.now();
    if (now-start < 3000) { prev = now; evaluationCalls = candidateTotal = mainCalls = extraCalls = 0; return; }
    if (prev) gaps.push(now-prev);
    prev = now;
    cpu.push(info.activeMeshesEvaluationTimeCounter.current);
    frame.push(info.frameTimeCounter.current);
    active.push(scene.getActiveMeshes().length);
    draws.push(info.drawCallsCounter.current);
    if (now-start < 13000) return;
    const candidates = original();
    let enabled=0, visible=0, withinFrustum=0;
    for (let i=0;i<candidates.length;i++) {
      const mesh=candidates.data[i];
      if (!mesh.isEnabled() || mesh.isDisposed()) continue;
      enabled++;
      if (!mesh.isVisible || mesh.visibility <= 0 || !(mesh.layerMask & camera.layerMask)) continue;
      visible++;
      if (mesh.isInFrustum(scene.frustumPlanes)) withinFrustum++;
    }
    // Offline candidate comparison only: do not change the scene's culling provider.
    const bounds = scene.getWorldExtends();
    const tree = new Octree(Octree.CreationFuncForMeshes, 64, 3);
    const buildStart = performance.now();
    tree.update(bounds.min, bounds.max, scene.meshes);
    const buildMs = performance.now() - buildStart;
    const selectionStart = performance.now();
    let selected = tree.select(scene.frustumPlanes);
    for (let i = 0; i < 49; i++) selected = tree.select(scene.frustumPlanes);
    const treeSelectMs = (performance.now() - selectionStart) / 50;
    const selectedIds = new Set(selected.data.slice(0, selected.length).map(m => m.uniqueId));
    let missingVisible = 0;
    const missingNames: string[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const mesh = candidates.data[i];
      if (mesh.isEnabled() && !mesh.isDisposed() && mesh.isVisible && mesh.visibility > 0 &&
          (mesh.layerMask & camera.layerMask) && mesh.isInFrustum(scene.frustumPlanes) && !selectedIds.has(mesh.uniqueId)) { missingVisible++; missingNames.push(mesh.name); }
    }
    const octree = { candidates: selected.length, missingVisible, missingNames, buildMs: round(buildMs), meanSelectMs: round(treeSelectMs), note: "Static snapshot only; moving and newly created meshes need separate handling." };
    const result = { octree, renderer: game.engine.isWebGPU ? "WebGPU" : "WebGL", screen: [game.engine.getRenderWidth(),game.engine.getRenderHeight()], totalSceneMeshes: scene.meshes.length, candidateCount: candidates.length, enabledCandidates: enabled, eligibleVisibleLayer: visible, withinFrustum, meanActive: avg(active), meanDrawCalls: avg(draws), meanFrameMs: avg(gaps), meanSceneCpuMs: avg(frame), meanSelectionCpuMs: avg(cpu), frames: gaps.length, evaluations: evaluationCalls, mainCameraEvaluations: mainCalls, otherCameraEvaluations: extraCalls, meanCandidatesPerEvaluation: round(candidateTotal / Math.max(evaluationCalls,1)) };
    panel.textContent = `CULLING RESULT\n${JSON.stringify(result, null, 2)}`;
    console.info("Office Core culling diagnostics " + JSON.stringify(result));
    scene.getActiveMeshCandidates = original;
    scene.onAfterRenderObservable.remove(observer);
    info.dispose();
  });
  scene.onDisposeObservable.addOnce(() => { scene.getActiveMeshCandidates = original; scene.onAfterRenderObservable.remove(observer); info.dispose(); panel.remove(); });
}
