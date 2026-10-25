# Turret frame-rate investigation

Reproduced locally with WebGPU using the real map and rendering pipeline. The opt-in development profile (`?playtest=1&turretprofile=1`) compares a normal camera and the Red Lookout station, then individually disables portals, shadows, glow and fog. Each phase warms for 1.5 seconds and measures for 4 seconds. Menus are hidden so CSS backdrop filters do not bias the comparison. The profile changes only its private local rendering session, never multiplayer state.

## Finding

The wide perspective turret camera sees most of the map. It is CPU/draw-submission heavy rather than a network problem. Before the changes, the warmed turret view had 1,979 active meshes and 4,546 draw calls per frame, compared with a few hundred meshes in the normal orthographic view. Glow and shadow passes repeat much of that work. No shader compilation occurred during the measured steady-state phases.

Ablation before optimization: warmed turret 21.5 FPS; without portals 22.9 FPS; without shadows 26.9 FPS; without glow 26.2 FPS. Removing fog did not materially help. The three perspective windows are a secondary cost, not the primary cause.

## Changes and measured result

- Ammo crates and medical pickup bodies merge rigid parts by material before animated signs/halos are attached. Local coordinates are preserved, including translated and scaled roots. All original triangles remain.
- Wall caps and skirting merge into material batches within 24 m map chunks. Solid walls and collision references stay intact.
- Only tagged non-interactive furniture trim uses perspective detail LOD: hide below 2 pixels, restore above 3 pixels. Orthographic view is unchanged; narrowing scope FOV naturally restores detail. Players, hit surfaces, untagged weapons and pickups are unaffected by this LOD.

| Warmed turret measurement | Before | After |
| --- | ---: | ---: |
| FPS | 21.5 | 29.7 |
| CPU frame time | 44.93 ms | 31.95 ms |
| Draw calls | 4,546 | 2,800 |
| Active meshes | 1,979 | 1,185 |
| Shader compilations | 0 | 0 |

Normal view remained approximately 60 FPS. After optimization, disabling glow reached 38.2 FPS and disabling shadows reached 37.1 FPS, confirming remaining rendering cost. These are local measurements, not a guarantee for other hardware or aiming directions. The profile models the turret camera and atmosphere while keeping the local game simulation idle; live combat may cost more.

Validation covers pickup bounds/indices/state preservation, camera-sensitive LOD with scope and hysteresis, and unchanged wall collision references and spatial culling chunks. No graphics preset, resolution or network tick settings were changed.
