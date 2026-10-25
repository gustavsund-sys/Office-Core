# Static rendering and intermittent white palms

## Additional rendering reductions

- Static walls are rendered in material/spatial groups (24 m chunks), preserving every triangle, UV, material and shadow receiver. Their original meshes remain invisible but pickable in `world.solids`; movement obstacles and bullet surfaces are unchanged. Destructible cover and doors are excluded.
- Idle destructible props no longer rewrite emissive colours and positions every frame. Damage starts feedback; the final frame restores the original finish and position. Reset restores immediately. Hit colour is reused instead of allocated each frame.

Local warmed WebGPU turret profile: 29.7 → 34.5 FPS; CPU scene frame 31.95 → 27.43 ms; draws 2,800 → 2,560; active meshes 1,185 → 1,109. Normal view remains approximately 60 FPS. Same opt-in profile as `turret-performance.md`; these are local idle-simulation measurements, not a hardware-independent promise.

## Palms

The GLB has no images/textures: its palette is `COLOR_0` vertex data multiplied by a white PBR material. A missing image download therefore cannot explain white palms.

The browser reproduced a WebGPU validation failure during startup: **13 vertex-stage uniform buffers exceed the device limit of 12**. Startup previously assigned the same six-light budget to Standard and PBR materials. PBR needs additional buffers; it now receives a four-light budget on WebGPU (Standard retains six). WebGL retains eight. The corrected browser run emitted no GPU validation warnings in the sampled startup/profile logs. This is a concrete failure found and fixed; it does not prove every intermittent white appearance has the same cause.

Additionally, plant vertex colours are explicitly enabled, shader hot swapping is disabled for that shared material, replacements await shader compilation, and asset readiness waits for all plant replacements rather than only container loading. The green fallback is hidden only after preparation. No replacement foliage or external texture was added.

Regression coverage checks retained wall picking/shadows/collision references, damage/reset feedback and the separate PBR buffer budget. Repeat starts and rounds on affected hardware remain useful to confirm the intermittent symptom is gone.
