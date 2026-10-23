# Filmed fire (local playtest)

- Bins: FX Elements **High-Angle Fire 041** — https://www.fxelements.com/products/clips/high-angle-fire-041
- RC bomber explosion: **CG Gas Bomb 005c** — https://www.fxelements.com/products/clips/cg-gas-bomb-005c
- Every fifth turret floor hit, per shooter: **Spark Hit Ground 002a** — https://www.fxelements.com/products/clips/spark-hit-ground-002a
- Windblown Fire 050 is no longer used or loaded by the game.
- Bin sprite is rotated clockwise 90 degrees so right-to-left source motion rises bottom-to-top.
- Downloaded ProRes/alpha originals through the owner's account on 2026-10-23. Newsletter enrollment and license acceptance were explicitly approved by the owner.
- Original ZIPs remain in the owner's Downloads directory. Unpacked working movies and PNG atlases are outside the repository in `/tmp/officecore-fire-originals/`.
- Runtime textures: `public/vfx/fire/high-angle-041.webp` and `windblown-050.webp`. These licensed textures are intentionally excluded from Git; they must be supplied locally on another checkout. Do not commit stock footage or atlases to the public repository.
- Conversion: `scripts/fire-atlas.swift input.mov output.png` decodes 48 frames with native AVFoundation, crops a fixed alpha union, blends the loop boundary, and outputs a 40-frame atlas (256 px cells, 8 columns, 24 fps). PNG is converted to WebP with alpha, quality 85, method 6. Runtime total is 906,116 bytes.
- Large explosions no longer leave ground fire. RC gas animation plays once over four seconds; sparks play once, with twelve pooled sprites per kind. Existing explosion damage and audio remain unchanged.
- New downloads and license acceptance explicitly approved by owner on 2026-10-23. Gas uses the first four seconds (64 frames at 16fps). The free spark download contains animated Alembic geometry; Blender renders 40 frames at two-frame intervals (12fps) into a 256px/cell atlas. Both runtime atlases stay under ignored public/vfx/fire/, outside the public Git repository.
- Lighting continues to use the existing four-light pool, with nearby ground fire sharing the three fire slots. No additional shadow maps or per-fire lights are created.
