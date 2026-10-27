/** Explicit diagnostic URL modes; normal play retains every rendering feature. */
export function gpuInvestigation(
  search = typeof location === "undefined" ? "" : location.search,
) {
  const requested = new URLSearchParams(search).get("gpucheck");
  const mode = [
    "minimal",
    "no-msaa",
    "no-glow",
    "no-shadows",
    "no-portals",
  ].includes(requested ?? "")
    ? requested!
    : "normal";
  return {
    mode,
    antialias: mode !== "minimal" && mode !== "no-msaa",
    glow: mode !== "minimal" && mode !== "no-glow",
    shadows: mode !== "minimal" && mode !== "no-shadows",
    portals: mode !== "minimal" && mode !== "no-portals",
  };
}
export const GPU_CHECKS = [
  ["minimal", "WebGPU utan extra renderingspass"],
  ["no-msaa", "WebGPU utan kantutjämning"],
  ["no-glow", "WebGPU utan glow"],
  ["no-shadows", "WebGPU utan skuggor"],
  ["no-portals", "WebGPU utan kontorens extravyer"],
] as const;

/** Verified mobile WebGPU fallback; keep MSAA and portal views as requested. */
export function effectiveGPUConfig(
  requested: ReturnType<typeof gpuInvestigation>,
  mobile: boolean,
  webgpu: boolean,
) {
  return mobile && webgpu
    ? { ...requested, glow: false, shadows: false }
    : { ...requested };
}
