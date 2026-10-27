/** Mobile defaults to WebGL 2-first; explicit WebGPU remains available for investigation. */
export function preferredRenderer(requested: string | null, mobile: boolean) {
  if (requested === "webgpu") return "webgpu";
  if (requested === "webgl" || requested === "webgl2") return "webgl";
  return mobile ? "webgl" : "webgpu";
}

export function rendererLabel(engine: { isWebGPU: boolean; webGLVersion?: number }) {
  if (engine.isWebGPU) return "WebGPU";
  return engine.webGLVersion ? `WebGL ${engine.webGLVersion}` : "WebGL";
}
