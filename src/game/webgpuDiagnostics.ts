/// <reference types="@webgpu/types" />
import { gpuInvestigation } from "./gpuInvestigation";
import { Engine, type WebGPUEngine } from "@babylonjs/core";

export class GPUReport {
  effectiveRendering?: ReturnType<typeof gpuInvestigation>;
  readonly errors: { kind: string; detail: unknown }[] = [];
  readonly lifecycle: { kind: string; detail: unknown }[] = [];
  readonly events: { kind: string; detail: unknown }[] = [];
  constructor(readonly device: unknown) {}
  add(kind: string, detail: unknown) {
    this.events.push({ kind, detail });
    if (
      ["deviceLost", "failedPass", "gpuError", "deviceDestroyCall"].includes(
        kind,
      ) &&
      this.errors.length < 8
    )
      this.errors.push({ kind, detail });
    if (
      [
        "deviceDestroyCall",
        "engineDisposed",
        "contextRestored",
        "startupStage",
      ].includes(kind)
    ) {
      this.lifecycle.push({ kind, detail });
      if (this.lifecycle.length > 16) this.lifecycle.shift();
    }
    if (this.events.length > 24) this.events.shift();
  }
  json() {
    return JSON.stringify(
      {
        device: this.device,
        effectiveRendering: this.effectiveRendering,
        errors: this.errors,
        lifecycle: this.lifecycle,
        events: this.events,
      },
      null,
      2,
    );
  }
}
let active: GPUReport | undefined;
export function getWebGPUReport() {
  return active?.json();
}
export function markGPUStartup(stage: string) {
  active?.add("startupStage", { stage });
}
export function recordEffectiveGPURendering(rendering: ReturnType<typeof gpuInvestigation>) {
  if (active) active.effectiveRendering = { ...rendering };
}
function changed() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("webgpu-report"));
}

/** Diagnostic-only wrappers preserve native arguments, return values and thrown errors. */
export function installWebGPUDiagnostics(engine: WebGPUEngine, onDeviceLost?: (error: Error) => void) {
  const device = engine._device;
  const limitNames = [
    "maxTextureDimension2D",
    "maxUniformBuffersPerShaderStage",
    "maxBindingsPerBindGroup",
    "maxColorAttachmentBytesPerSample",
    "maxColorAttachments",
    "maxBufferSize",
  ] as const;
  const limits = Object.fromEntries(
    limitNames.map((k) => [k, device.limits[k]]),
  );
  const report = (active = new GPUReport({
    engine: `Babylon ${Engine.Version} WebGPU`,
    rendering: gpuInvestigation(),
    limits,
    features: Array.from(device.features),
  }));
  const destroyDevice = device.destroy.bind(device);
  device.destroy = () => {
    report.add("deviceDestroyCall", {
      stack: new Error("GPUDevice.destroy invoked by JavaScript").stack,
    });
    changed();
    return destroyDevice();
  };
  let disposed = false;
  engine.onDisposeObservable?.add(() => {
    disposed = true;
    report.add("engineDisposed", {});
    changed();
  });
  engine.onContextRestoredObservable?.add(() => {
    report.add("contextRestored", { sameDevice: engine._device === device });
    changed();
  });
  const views = new WeakMap<object, unknown>();
  const track = (texture: GPUTexture) => {
    const info = {
      label: texture.label,
      width: texture.width,
      height: texture.height,
      format: texture.format,
      samples: texture.sampleCount,
      destroyed: false,
    };
    const createView = texture.createView.bind(texture),
      destroy = texture.destroy.bind(texture);
    texture.createView = (descriptor?: GPUTextureViewDescriptor) => {
      const view = createView(descriptor);
      views.set(view, { texture: info, view: descriptor ?? {} });
      return view;
    };
    texture.destroy = () => {
      info.destroyed = true;
      return destroy();
    };
    return texture;
  };
  const createTexture = device.createTexture.bind(device);
  device.createTexture = (descriptor) => track(createTexture(descriptor));
  const createEncoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (descriptor) => {
    const encoder = createEncoder(descriptor);
    const begin = encoder.beginRenderPass.bind(encoder);
    let open: string | undefined;
    encoder.beginRenderPass = (pass) => {
      const attachment = (view: GPUTextureView | undefined) =>
        view
          ? (views.get(view) ?? {
              label: view.label,
              source: "external or created before diagnostics",
            })
          : undefined;
      const detail = {
        label: pass.label ?? "unnamed",
        previousPassStillOpen: open,
        colors: Array.from(pass.colorAttachments, (a) =>
          a
            ? {
                view: attachment(a.view as GPUTextureView),
                resolve: attachment(
                  a.resolveTarget as GPUTextureView | undefined,
                ),
                load: a.loadOp,
                store: a.storeOp,
              }
            : null,
        ),
        depth: pass.depthStencilAttachment
          ? {
              view: attachment(
                pass.depthStencilAttachment.view as GPUTextureView,
              ),
              depthReadOnly: pass.depthStencilAttachment.depthReadOnly,
              stencilReadOnly: pass.depthStencilAttachment.stencilReadOnly,
            }
          : undefined,
      };
      try {
        const result = begin(pass);
        open = detail.label;
        const end = result.end.bind(result);
        result.end = () => {
          end();
          open = undefined;
        };
        report.add("pass", detail);
        return result;
      } catch (error) {
        report.add("failedPass", { ...detail, error: String(error) });
        changed();
        throw error;
      }
    };
    return encoder;
  };
  device.addEventListener("uncapturederror", (event) => {
    report.add("gpuError", {
      name: (event as GPUUncapturedErrorEvent).error.constructor.name,
      message: (event as GPUUncapturedErrorEvent).error.message,
    });
    changed();
  });
  void device.lost.then((info) => {
    report.add("deviceLost", {
      reason: info.reason,
      message: info.message,
      javascriptDestroySeen: report.errors.some(
        (e) => e.kind === "deviceDestroyCall",
      ),
      sameDevice: engine._device === device,
    });
    changed();
    // A lost device can stop frames without throwing inside the game callback.
    if (!disposed && engine._device === device)
      onDeviceLost?.(new Error(`WebGPU tappade grafikenheten (${info.reason})${info.message ? `: ${info.message}` : ". Kopiera GPU-rapporten nedan."}`));
  });
  // Track the canvas texture as well: MSAA resolves target it on every main pass.
  const context = (engine as unknown as { _context: GPUCanvasContext })
    ._context;
  const current = context.getCurrentTexture.bind(context);
  const seen = new WeakSet<GPUTexture>();
  context.getCurrentTexture = () => {
    const texture = current();
    if (!seen.has(texture)) {
      seen.add(texture);
      track(texture);
    }
    return texture;
  };
  return report;
}
