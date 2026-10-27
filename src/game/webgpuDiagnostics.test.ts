import test from "node:test";
import assert from "node:assert/strict";
import { GPUReport, installWebGPUDiagnostics } from "./webgpuDiagnostics";
import type { WebGPUEngine } from "@babylonjs/core";
test("GPU reports retain a bounded history and preserve the first failure detail until newer events replace it", () => {
  const report = new GPUReport({ limit: 12 });
  for (let i = 0; i < 30; i++) report.add("pass", i);
  assert.equal(report.events.length, 24);
  assert.equal(report.events[0].detail, 6);
  assert.equal(JSON.parse(report.json()).device.limit, 12);
});
test("diagnostics record the failing pass and attachments while rethrowing the original native error", () => {
  const failure = new Error("Unable to begin render pass");
  let destroyed = false;
  const texture = {
    label: "depth",
    width: 384,
    height: 256,
    format: "depth24plus-stencil8",
    sampleCount: 1,
    createView: () => ({ label: "view" }),
    destroy: () => {
      destroyed = true;
    },
  };
  const encoder = {
    beginRenderPass: () => {
      throw failure;
    },
  };
  const device = {
    limits: {},
    features: new Set(),
    createTexture: () => texture,
    createCommandEncoder: () => encoder,
    addEventListener: () => {},
    lost: new Promise(() => {}),
    destroy: () => {},
  };
  const engine = {
    _device: device,
    _context: { getCurrentTexture: () => texture },
  } as unknown as WebGPUEngine;
  const report = installWebGPUDiagnostics(engine);
  const view = device.createTexture().createView();
  texture.destroy();
  assert.equal(destroyed, true);
  assert.throws(
    () =>
      device.createCommandEncoder().beginRenderPass.call(null, {
        label: "lower office",
        colorAttachments: [],
        depthStencilAttachment: { view },
      } as never),
    (e) => e === failure,
  );
  const entry = report.events.at(-1)!;
  assert.equal(entry.kind, "failedPass");
  const detail = entry.detail as {
    label: string;
    depth: { view: { texture: { destroyed: boolean; width: number } } };
  };
  assert.equal(detail.label, "lower office");
  assert.equal(detail.depth.view.texture.width, 384);
  assert.equal(detail.depth.view.texture.destroyed, true);
});

test("early GPU validation errors survive subsequent successful render passes", () => {
  const report = new GPUReport({});
  report.add("gpuError", { message: "invalid attachment" });
  for (let i = 0; i < 100; i++) report.add("pass", i);
  assert.equal(report.errors.length, 1);
  assert.deepEqual(report.errors[0].detail, { message: "invalid attachment" });
  assert.equal(report.events.length, 24);
});

test("device destruction records its JavaScript call site and still invokes the native operation", () => {
  let destroyed = 0;
  const device = {
    limits: {},
    features: new Set(),
    createTexture: () => {},
    createCommandEncoder: () => {},
    addEventListener: () => {},
    lost: new Promise(() => {}),
    destroy: () => {
      destroyed++;
    },
  };
  const engine = {
    _device: device,
    _context: { getCurrentTexture: () => {} },
  } as unknown as WebGPUEngine;
  const report = installWebGPUDiagnostics(engine);
  device.destroy();
  assert.equal(destroyed, 1);
  assert.equal(report.errors[0].kind, "deviceDestroyCall");
  assert.match(
    (report.errors[0].detail as { stack: string }).stack,
    /GPUDevice.destroy/,
  );
  for (let i = 0; i < 100; i++) report.add("pass", i);
  assert.equal(report.lifecycle[0].kind, "deviceDestroyCall");
});

for (const disposed of [false, true]) test(`device loss is surfaced without a frame, disposed=${disposed}`, async () => {
  let resolveLost!: (info: { reason: string; message: string }) => void;
  let dispose!: () => void;
  const errors: Error[] = [];
  const device = {
    limits: {}, features: new Set(), destroy() {},
    createTexture() {}, createCommandEncoder() {}, addEventListener() {},
    lost: new Promise<{ reason: string; message: string }>((resolve) => { resolveLost = resolve; }),
  };
  const engine = {
    _device: device, _context: { getCurrentTexture() {} },
    onDisposeObservable: { add(fn: () => void) { dispose = fn; } },
  } as unknown as WebGPUEngine;
  const report = installWebGPUDiagnostics(engine, (error) => errors.push(error));
  if (disposed) dispose();
  resolveLost({ reason: "destroyed", message: "" });
  await Promise.resolve();
  assert.equal(errors.length, disposed ? 0 : 1);
  assert.equal(report.errors.at(-1)?.kind, "deviceLost");
  if (!disposed) assert.match(errors[0].message, /WebGPU tappade/);
});
