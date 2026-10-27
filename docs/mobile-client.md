# Desktop and mobile clients

Both presentations run the same `Game`, map, player simulation, weapons, pickups,
match flow, prediction/reconciliation, Colyseus protocol and server URL. The
server remains authoritative. Do not duplicate those systems into the mobile
folder. Damage, HP, movement speeds, pickup ranges and hitboxes are identical.

The landing screen (`src/client/chooseClient.ts`) offers an explicit choice.
`?client=desktop` starts the existing desktop presentation; `?client=mobile`
lazily imports `src/mobile/presentation.ts` and its stylesheet. Existing URL
parameters such as `playtest=1` continue to work. The map editor remains desktop.
The selected client is explicit in the URL, never switched by screen resize.

`GamePresentation` supplies optional input creation, attach, frame, camera and
resize hooks. All hooks default to no-op, so the desktop continues through its
existing input and camera code. Mobile never changes CONFIG.camera, gameplay
models, collision geometry, speeds or protocol. The few shared action/scope
methods expose existing behavior for both keyboard and touch.

Mobile files:

- `input.ts`: independent touch state, no desktop event listeners or pointer lock;
  left stick controls movement independently of aim; its outer edge requests
  the shared desktop sprint. The larger right stick controls aim and fires in the outer 5% of its travel ring.
- `controls.ts`: independent movement and aiming sticks, per-pointer capture/release, held action cancellation on pause,
  blur, death and hidden tab; inventory delegates to shared game actions. Turret
  and rifle use the existing scope implementation, driven by explicit touch APIs.
- `presentation.ts`: separate closer overhead camera; mobile resize projection,
  shared RC and scope cameras. No changes to desktop camera settings.
- `mobile.css`: safe area insets, landscape-only layout with portrait rotation guard, readable vitals,
  tappable inventory, scrollable lobby/loadout, optional compact scoreboard.
- `controlMath.ts`: circular stick dead zone/clamping and mobile view size.

RC Bomber uses analog left-stick throttle/steering with the existing steering
ramp. Detonate is a touch button. Desktop WASD/E behavior is unchanged when the
optional analog source is absent.

Graphics persist under `officeCore.graphics.v1.mobile`; desktop retains its
existing `officeCore.graphics.v1`. Cache/assets remain shared on the same origin.
Intro, tutorial, resource preparation, WebGPU/WebGL fallback and server startup
are shared. Touch emits normal trusted pointer activity for the inactivity timer.

## Local review

- `http://127.0.0.1:5175/?playtest=1` — version chooser
- `http://127.0.0.1:5175/?playtest=1&client=desktop` — desktop
- `http://127.0.0.1:5175/?playtest=1&client=mobile` — mobile

Use the same online origin with `?client=mobile` for multiplayer after deployment.
A phone cannot reach the computer's 127.0.0.1. For a physical local phone test,
serve Vite on the LAN and use the computer's LAN address (or deploy a preview).
Production uses HTTPS. This change does not deploy anything.

Verify 844×390 layout and the rotation guard at 390×844, simultaneous steering and fire, release outside a control,
interrupted touches, rotation, pause/resume, RC deploy/drive/detonate, rifle scope,
turret/crouch/exit, inventory and match ready/return flows. Browser viewport tests
are not substitutes for testing Safari/iOS and Chrome/Android on physical devices.

## Installed web app and updates

`public/mobile.webmanifest` starts `/?client=mobile` in standalone landscape mode.
Mobile injects the manifest and Apple home-screen metadata before startup. The
manifest and index are revalidated by Firebase (`no-cache`). Icons are local PNGs
in three explicit sizes. Android can offer the native install prompt; iOS receives
Safari Add to Home Screen instructions. Where orientation locking is unsupported,
a full-screen rotation guard blocks play; returning to landscape requires resume
if rotation interrupted an active session. Actual aspect ratio follows the phone's
landscape screen rather than letterboxing desktop to 16:9.

The existing shared versioned service worker already checks at startup, every
five minutes and on page show/foreground. It now checks again on reconnect. Build
versioning includes the entry HTML, manifest, app icons and asset content hashes.
All JS/CSS chunks, including mobile's lazy chunks, are downloaded before a waiting
update is considered installed. Existing media are reused by content hash.

Updates remain manual to activate: the menu's new-version button asks every open
game tab whether activation is safe. Any active match blocks activation. On approval
the worker activates and the requesting menu reloads. Match state is never hot-swapped.
Multiplayer still requires an internet connection; installation is not offline play.

Physical iOS/Android installation, orientation-lock and two-thumb testing remain
necessary before calling the mobile release device-verified.

Dual-stick revision (26 October): mobile input compensates the tilted camera's ground-plane
foreshortening so on-screen diagonal movement matches the joystick. Aim direction is
retained when the right stick is released. Movement neither changes aim nor fires. Sprint requests begin above 90% stick strength. Walking scales continuously
from zero to normal walk speed over the first 90% of travel; the final 10%
scales smoothly up to full sprint speed. The unchanged
four-second stamina / exhaustion / recovery rules remain on client and server.
The shared sprint meter is visible in the mobile HUD. In scope/turret mode the
right stick adjusts aim without moving the operator; its outer ring fires. The left stick remains movement-only and does not move a scoped operator.

Analog magnitude is preserved by shared `Player.simulate` with a normalization
floor of one. Desktop cardinals and diagonals retain their previous speed; small
mobile inputs no longer normalize to full walk speed. The network already sends
fractional axes. Deploy both client and server together: an older server that
normalizes all inputs to unit length cannot provide these analog speeds.
The stick uses a 2% central dead zone with unquantized values outside it.

## WebGPU investigation (26 October)

Desktop prefers WebGPU. Mobile now defaults to Babylon Engine with WebGL 2 enabled (falling back to WebGL 1 only if context creation requires it). Explicit `renderer=webgpu` retains the diagnostic path. A physical iPhone reported `GPUCommandEncoder.beginRenderPass: Unable to begin render pass` after initialization. This message alone does not identify a specific effect or prove that WebGPU cannot run the game.

Mobile WebGPU sessions collect a bounded, local-only diagnostic report: device limits, validation errors, lost-device events, recent render-pass descriptors and attachment sizes/formats/sample counts. The error screen exposes the report for copying. Desktop can opt in using `gpuinspect=1`. No diagnostic data is automatically sent to the server. The mobile settings page and startup report show the actual WebGL context version.


## WebGL 2 comparison test

At the user's request, mobile now selects WebGL by default, using
`disableWebGL2Support: false`. Babylon attempts `webgl2` before its WebGL 1
fallback. `renderer=webgl2` and `renderer=webgl` both select this path; the
settings label reports `engine.webGLVersion`, not a claimed version based on
the URL. Normal-mode glow, shadow maps and other Standard effects are enabled
on this path. Mobile WebGPU compatibility restrictions only apply when WebGPU
is explicitly selected. Test with `client=mobile&renderer=webgl2&gpucheck=normal`.

## Touch fire assist and zoom

Mobile overhead view spans `20 / 1.1` world units vertically, making players and
props 10% larger than the previous 20-unit view. Desktop camera settings are
unchanged. On mobile, a held outer aim ring repeats trigger requests for pistol,
pulse, burst, bazooka and hunting rifle. Shared weapon cooldowns and reloads
remain authoritative locally and on the server; machine gun already supports
held fire. The assist works while scoped, stops on release/cancel, and does not
repeat equipment actions, Core buster placement or empty/reloading weapon
clicks. No protocol or server weapon rules changed.

## Mobile weapon balance

Mobile pistol: 0.5 seconds between shots (desktop: 0.25) and 17 damage
(desktop: 20). Mobile bazooka: 2 seconds between launches (desktop: 1).
`weaponStats` supplies the same profile to local weapon simulation, server weapon
simulation and cosmetic shot prediction. Magazine/reload rules and other
weapons retain their existing values. Join options declare the selected client
mode; a validated `clientMode` message refreshes it after reconnection. Balance
is held per player's Weapons instance, never by mutating shared WEAPONS data.
`scripts/mobile-balance-smoke.ts` checks independent profiles with two local
SDK clients and validates the reconnect-profile message.


## Aim ring refinement

The right control and its thumb knob are 10% larger (162.8px control diameter).
Aiming occupies the first 95% of travel; firing starts at 95% instead of 90%.
The visible fire band matches the threshold, and nearby action buttons are
shifted outward to avoid overlap. Movement/sprint thresholds are unchanged.

## Lower-corner controls and contextual interaction

Both sticks sit near the lower safe-area edges. Reload is left of the aim
stick, crouch below-left and jump below-right. The combat strip reserves space
for those buttons. The explicit interaction button unfolds from the aim stick's
upper-right corner only when usable, with PLOCKA/PLACERA labels (plus ÖPPNA for
an available own lift and AVVÄPNA for a reachable bomb). It retracts and disables
hit testing/focus when unavailable. State is checked at 10 Hz and revalidated on
tap, without rebuilding DOM or doing placement ray tests every render frame.

Placement previews reuse the same read-only `placement` queries called by
Beacon/PulseTrap `place`. Core busters require grounding; RC deployment checks
its collision radius and uses the existing press action. Automatic ammo/health
collection does not show an unnecessary button. World pickup state comes from
snapshots online, so consumed/inactive drops do not leave a usable button behind.

## Compact combat notices

The in-game leave-lobby button is hidden on mobile; leaving remains available
inside the pause menu. Desktop Warcry and duplicate Core-buster carrier banners
are hidden. A touch Warcry action is shown near the aim controls only while
carrying a Core buster with a cry available or its protection active.

Existing warning, toast, bomb, disarm and lift-prompt nodes are grouped in a
bounded status dock below the Core bars. The whole engagement wrapper moves
intact to preserve its scoped queries; hit confirmation stays viewport-fixed.
Lazily-created panels are moved with a direct-child MutationObserver, avoiding
per-frame DOM rebuilding. Inactive notices take no space. Bomb rows use two
compact columns, and round countdown is a small badge instead of a full-screen
dim layer. The dock hides in menus but remains available during respawn.

### Menyer utan sidscroll

Mobilmenyn använder fasta rader för navigation, innehåll och primär åtgärd.
Lagvalet visar namn och status på samma rad samt båda lagen sida vid sida.
Chattmeddelanden och långa spelarlistor får egen intern scroll; sidan ligger still.
Utrustningsvalet visar illustrationerna till vänster, sex vapen i ett 3 × 2-rutnät
samt tre skills på en rad. På korta skärmar döljs detaljtexter, inte valen.
Knapparna behåller minst 44 px tryckyta. Spelknapparna har symboler och korta
etiketter; menyknapparna har rundade former. Desktop använder sin befintliga layout.

### Versionskontroll före klientstart (alla klienter)

`index.html` laddar en liten `boot.ts` utan spelmotor. Den hämtar
`game-version.json` med `cache: no-store` och kontrollerar att startfilen matchar
manifestets `bootstrap`. En äldre HTML/startfil navigerar en gång till aktuell
version; ett upprepat fel visas med en återförsöksknapp i stället för en reload-loop.
Innan `main.ts` importeras inväntas service workerns kompletta kodcache och säker
aktivering. En annan flik i match kan blockera aktiveringen; den nya fliken ber då
spelaren lämna den matchen först. Versionsknappen används fortfarande för senare
publiceringar under en redan öppen session. Oförändrade resurser återanvänds.

### Mobile menu theme

`src/mobile/theme.css` adds the mobile command-room palette after the viewport layout:
navy panels, team-colored lobby cards, gold primary actions and equipment selection,
and visible keyboard focus. It reuses existing loadout artwork and uses static CSS
backgrounds, with no additional image downloads or rendering loop. The viewport
layout and 44px touch targets remain in `layout.css`; compact landscape layouts
continue to hide secondary equipment descriptions. Desktop styles are unaffected.
