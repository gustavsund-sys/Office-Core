import { GPU_CHECKS } from "../game/gpuInvestigation";
import { getWebGPUReport } from "../game/webgpuDiagnostics";
/** Kept outside #ui so a failed HUD update cannot hide the error report. */
export function showRuntimeError(error: unknown) {
  console.error("Office Core runtime failure", error);
  document.querySelector(".runtime-error")?.remove();
  const panel = document.createElement("section");
  panel.className = "runtime-error";
  panel.setAttribute("role", "alert");
  panel.style.cssText =
    "position:fixed;inset:0;z-index:100000;background:#10212bf5;color:#edf6f5;display:grid;place-content:center;gap:12px;padding:24px;font:16px system-ui;overflow:auto;pointer-events:auto;user-select:text";
  const heading = document.createElement("h1");
  heading.textContent = "Spelet kunde inte fortsätta";
  const message = document.createElement("pre");
  message.style.cssText =
    "white-space:pre-wrap;overflow-wrap:anywhere;max-width:85vw;font:13px monospace";
  message.textContent = error instanceof Error ? error.message : String(error);
  const retry = document.createElement("a");
  retry.href = location.href;
  retry.textContent = "Ladda om";
  retry.style.color = "#ffcf7b";
  const compatibility = document.createElement("a");
  const url = new URL(location.href);
  url.searchParams.set("renderer", "webgl");
  compatibility.href = url.href;
  compatibility.textContent = "Starta med WebGL";
  compatibility.style.color = "#ffcf7b";
  panel.append(heading, message, retry, compatibility);
  if (getWebGPUReport()) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "WebGPU-felrapport";
    const data = document.createElement("pre");
    data.style.cssText =
      "white-space:pre-wrap;overflow-wrap:anywhere;max-width:85vw;font:11px monospace";
    const update = () => {
      data.textContent = getWebGPUReport() ?? "";
    };
    update();
    window.addEventListener("webgpu-report", update);
    const copy = document.createElement("button");
    copy.textContent = "Kopiera GPU-rapport";
    copy.onclick = () =>
      void navigator.clipboard
        .writeText(data.textContent ?? "")
        .then(() => {
          copy.textContent = "Kopierad";
        })
        .catch(() => {
          details.open = true;
          copy.textContent = "Visa rapporten nedan";
        });
    const checks = document.createElement("details");
    const checkSummary = document.createElement("summary");
    checkSummary.textContent = "Isolera felet med WebGPU";
    checks.append(checkSummary);
    for (const [mode,label] of GPU_CHECKS) {
      const link = document.createElement("a");
      const testUrl = new URL(location.href);
      testUrl.searchParams.set("renderer","webgpu");
      testUrl.searchParams.set("gpucheck",mode);
      link.href = testUrl.href; link.textContent = label;
      link.style.cssText = "display:block;padding:8px 0;color:#ffcf7b";
      checks.append(link);
    }
    panel.append(checks);
    details.append(summary, data);
    panel.append(copy, details);
  }
  document.body.append(panel);
}
