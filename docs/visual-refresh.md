# Office Core visual refresh

The existing red/blue office-worker identity is retained. Selected silhouettes now use rounded edges rather than replacing the stylized figures with realistic characters.

- Shared beveled geometry for heads, clothes, boots and selected furniture (96 vertices / 108 triangles per part). Geometry is reused by dimensions, with no extra draw calls for a bevel. Authoritative worlds retain simple boxes. Bounding dimensions and invisible player hitboxes stay unchanged.
- Matte fabric and subtle skin finishes share 64 px procedural textures. Team assignments retain fabric in local games, online games, the benchmark and victory presentations.
- Shared 256 px woven carpet with subtle tile variations; generated before startup readiness checks, no additional asset downloads.
- Sofas have rounded cushions, arms and a slightly rotated pillow. Their parts remain inside the destructible's mesh collection.
- Warm key light and cool ambient fill, shared with the graphics benchmark. No extra dynamic lights or postprocessing passes.
- The map foundation no longer casts shadows onto the floor immediately above it. This removed the diagonal shadow artifacts across the floor. Shadow depth is independent of the current scope camera's near/far limits.

## Local review

`/scripts/look-preview.html` (WebGL) and `/scripts/look-preview.html?renderer=webgpu` are development review pages using the actual map, players and material code. They are not production build entries. Buttons switch between close-up and gameplay framing and toggle shadows for comparison.

Verification includes geometry bounds, winding/normals, full submesh index coverage, geometry reuse after destruction, and existing invisible-player-hitbox tests. Actual FPS on other hardware still needs comparison; the additional silhouette triangles trade some geometry work for the requested appearance improvements.
