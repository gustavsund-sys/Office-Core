# Local ventilation smoke preview

User supplied `WindblownSmoke-007-ProRes.zip` (FX Elements, Windblown Smoke 007). Original footage stays in Downloads / temporary conversion storage. The converted atlas is excluded from Git under `public/vfx/vent-smoke/`; it must not be added to the public repository or static-media branch as standalone stock footage.

Generated with the native `scripts/fire-atlas.swift` converter: 40 alpha frames, 256px cells, 2048x1280 PNG, 566,524 bytes (approximately 553 KiB). Runtime uses 10 fps for a four-second loop; converter crossfades the final eight source frames into the beginning. All grille outlets share one SpriteManager/texture, have offset phase, no lights/shadows/collision, no depth writes, and skip animation outside the camera frustum with a margin. Runtime asset discovery includes the local atlas in startup download/cache preparation.

Local review: `/scripts/look-preview.html?renderer=webgpu&vent=1`. The original alpha is preserved; no black background plate. Preview has not been deployed. Distribution requires the licensed converted asset to be packaged through an appropriate deployment path rather than committed to public Git.
