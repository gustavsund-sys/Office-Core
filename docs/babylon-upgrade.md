# Babylon upgrade — 26 October 2026

Core and loaders are upgraded together from 8.56.2 to exactly 9.32.0, verified against npm's stable latest tag. The lockfile also updates the matching glTF interface peer. WebGPU remains the preferred renderer. The diagnostic report now uses the installed engine's version instead of a hard-coded 8.56.2 string.

Babylon 9 no longer supplies all of the ambient WebGPU declarations used by our diagnostics through the same import path. An explicit development dependency on the official @webgpu/types definitions and a reference in the diagnostic module address the resulting type errors without changing runtime GPU behavior.

Checks: client/server TypeScript checks, 261 gameplay tests, and the isolated local two-client multiplayer smoke test pass. The smoke test covers room ownership, lobby changes, authoritative movement, malformed inputs, reconnection, rejected extra rooms and lobby reset.

This is not yet a physical-iPhone verification or proof that device loss is fixed. The supplied 8.56.2 report shows device loss before the failed render pass. Keep the local lifecycle diagnostics when retesting 9.32.0 on the same phone; do not infer the cause from a changed library version alone. No deployment is performed by the dependency upgrade.

Official release history: https://github.com/BabylonJS/Babylon.js/blob/master/CHANGELOG.md

Final validation also passed the production Vite build and all 16 cache tests. The engine chunk increased from about 1.40 MB gzip on 8.56.2 to 1.75 MB gzip on 9.32.0 (approximately +0.35 MB compressed). Other libraries were not intentionally upgraded.
