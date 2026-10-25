# Glass views into the lower office

The two non-walkable southern pockets have actual slab openings and fixed 3D office geometry at Y = -5.6 m. Both floors now call `deskAssembly`; the default desk is 2 x 1 m, including the same screen, keyboard, pedestal and chair. Detail parts also use `World.propDetails`.

The game camera remains orthographic. Each glass opening therefore has its own off-axis perspective camera whose eye copies the active game/scope camera's world position. Its asymmetric frustum passes through the four glass corners. A render target 384 pixels wide (height follows each opening’s aspect ratio) displays only that room's lower-floor layer on the glass plane. This is perspective projection of the actual geometry, rather than moving or scaling the furniture to imitate depth.

Lower meshes are excluded from the main camera by layer mask, preventing an orthographic duplicate or objects leaking beyond the glass. The glass tint and frame remain ordinary upper-floor geometry. The portal's display surface is excluded from glow. Only nearby visible openings schedule their render targets; particles, sprites and camera postprocessing are disabled for these room passes. The offices add no dynamic lights or collision geometry.

Tests cover slab holes, unchanged walkable footprint, fixed geometry, layer separation, matching desk dimensions, glass-corner registration in WebGL/WebGPU depth ranges and natural perspective size reduction. The local material study has “Glaskontor” and “Passera glaset” controls for inspection.


## Dead-area decoration

The office windows are shortened to end at Z = -26.25, inside the foreground wall silhouette. One additional 8 x 7 m opening in the southern centre shows a meeting room. There are three perspective surfaces in total.

`officeDeadZones` flood-fills the 2 m map grid and selects enclosed voids only; the exterior stays empty. Equal cell runs merge into rectangular ceiling patches. Walkable footprints and glass openings are subtracted with clearance. `officeServiceDecor` uses one small shared procedural ceiling texture and reused metal finishes for ventilation ducts, couplings, cable trays, access hatches and passive light panels. Parts merge per material and area, remain non-pickable and add no dynamic lights or shadow casters.

The technical roofs now sit 1.2 m above the gameplay floor, with dark charcoal perforated panels in a 2:1 rectangular format. Glass clearances include extra room for the roof's projected edge. Ventilation runs span the available roof patches and use two rounded quarter-circle elbows with a fixed 14-point path and 12-sided tube cross-section. Couplings and wall collars merge with the existing metal batches. Roofs remain decorative, without lights, shadows or collision additions.
