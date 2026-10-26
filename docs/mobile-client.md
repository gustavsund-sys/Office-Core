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
  the shared desktop sprint. The larger right stick controls aim and fires in the outer 10% of its travel ring.
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
