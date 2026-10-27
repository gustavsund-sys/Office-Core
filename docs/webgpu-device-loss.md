# iPhone WebGPU device-loss investigation — 26 October 2026

User-supplied report: iPhone 13, reported iOS 27, Babylon 8.56.2. The first recorded error is `deviceLost` with reason `destroyed` and an empty message. `MainRenderPass` then throws `Unable to begin render pass` at frame 424. Frames 421–423 started main, shadow and glow passes. No `gpuError` validation events or overlapping active passes were recorded. Pass creation success does not prove asynchronous GPU work completed successfully.

This establishes device loss before the failed pass, not which operation caused the loss. It does not establish an MSAA, portal, memory-pressure or shader-limit defect. The recorded 844×390 canvas is below the advertised 8192 texture dimension limit, but other constraints and native execution remain relevant.

The installed Babylon WebGPU engine calls `GPUDevice.destroy()` from `dispose()`. Production app code only explicitly disposes its main GPU engine if initialization fails; the victory view uses a separate WebGL engine. No matching application shutdown is identified in the supplied report.

WebKit's `Device.mm` can emit `Destroyed` with an empty message when disposing its native Device object; its explicit destroy path calls `loseTheDevice`, which supplies `Device lost.`. Current upstream source is supporting context, not proof of the exact implementation shipped on this phone:
https://github.com/WebKit/WebKit/blob/main/Source/WebGPU/WebGPU/Device.mm

Prepared follow-up diagnostics wrap `GPUDevice.destroy()` without blocking it, record its JavaScript call stack, observe engine disposal and context restoration, and preserve startup preparation/cleanup milestones. These distinguish an application shutdown from a lost native device without changing the renderer or effects. No data are sent automatically to a server. The follow-up is local until explicitly published and must be retested on the physical phone.

## Report after 9.32.0 upgrade

The supplied 9.32.0 report again records `deviceLost: destroyed` with an empty message, now after the first rendered frame. `javascriptDestroySeen` is false and `sameDevice` is true. Cleanup started/completed afterwards. The report does not contain a validation error. Thus upgrading alone did not resolve the symptom, and no application destroy call was intercepted. Native/browser loss remains a possibility, not a proven WebKit or hardware defect.

Prepared controlled rendering modes use `gpucheck=minimal`, `no-msaa`, `no-glow`, `no-shadows`, or `no-portals`. They keep WebGPU. Each single-feature mode disables only the named rendering feature, while minimal combines all four for the initial comparison. The selected mode is included in the local GPU report. Default gameplay keeps all existing rendering features; map collisions, network rules and damage are unchanged. The error screen links to these test modes. These controls still require physical-device testing and an explicit deployment.

## Mobile glow format investigation

Physical iPhone testing confirmed that `no-msaa` still loses the device, while
`minimal` and then `no-glow` start correctly. This implicates the glow path or
its interaction with the scene, rather than proving a specific driver defect.

The subsequent physical-device report confirmed `glow format: rgba8unorm`
and actual `rgba8unorm` blur targets, but still reported device loss during
preparation. Changing the format did not solve the failure. The experimental
capability override and LDR merge have therefore been removed.

`createGameGlow` now skips allocating GlowLayer for mobile WebGPU. This is a
compatibility workaround based on the successful no-glow device test, not a
claim that the precise native failure has been diagnosed. Desktop and WebGL
retain their existing layer. Emissive materials, lighting and shadows remain.
The lifecycle report records the compatibility decision. No URL test flag is
needed for mobile WebGPU normal play.

## Failure at the warmup/game handoff

The next device report confirmed the compatibility skip, completed graphics
cleanup and touch attachment, then lost the device at the first gameplay render
(frame 612). Thus removing glow alone is not a complete fix. Earlier successful
single runs do not establish glow as the sole cause.

The startup path also invoked `tick()` directly before `runRenderLoop`. Since
`tick()` renders the scene, that performed gameplay rendering outside the normal
engine begin/end-frame lifecycle. This direct call is now removed. The first
and subsequent gameplay updates all run through `startGameRenderLoop`, retaining
first-frame error reporting. Lifecycle markers bracket the first engine game
frame so the next device report can distinguish handoff from later failures.
This is a code-level correction; physical-device confirmation is still needed.

## GPU completion before resource cleanup

The subsequent report reached `game rendering starting` but never entered
`first engine game frame started`. It therefore does not demonstrate a failure
inside the first gameplay tick. GPU device loss is asynchronous: lifecycle
markers describe CPU progress, not completed GPU work.

Startup now stops its warmup loop and awaits WebGPU queue
`onSubmittedWorkDone()` before releasing temporary warmup meshes/effects. A
10-second timeout prevents a stalled queue from indefinitely blocking startup.
Cleanup runs on rejection too, but startup then fails instead of handing an
unhealthy device to gameplay. Queue-drain start/completion markers distinguish
failure during previously submitted work from failure after resource cleanup.
This addresses resource lifetime at the handoff; the next phone test is needed
to establish whether it resolves the device loss.

## Verified mobile configuration

The report with the GPU fence still lost the device before queue completion.
This run therefore fails during warmup GPU work, not exclusively in cleanup or
first gameplay rendering. A subsequent phone run with `gpucheck=no-shadows`
(with mobile glow already omitted) started successfully. Mobile WebGPU now uses
both glow and shadow passes disabled by default; MSAA, portal views, lighting
and gameplay remain enabled. This is a practical compatibility workaround;
the precise native failure or interaction is not established. Desktop and
WebGL keep their normal settings. Reports include `effectiveRendering` alongside
the requested URL mode to avoid confusing requested and applied settings.
