# Office Core desktop

Electron client for macOS (Apple Silicon and Intel) and Windows x64.

The app loads `https://officecore-ad307.web.app/?client=desktop` with its own Chromium runtime. Game files and updates are delivered by the existing hosted game and its cache. Internet is required to start and play; this is not an offline game bundle. Multiplayer and anonymous Firebase authentication use the existing production services.

## Build

From this folder, using Node.js and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm dist:mac
pnpm dist:win
```

Installers are in `desktop/release/` (ignored by Git). macOS builds contain separate arm64 and x64 applications. The NSIS Windows installer installs for the current user, offers a destination folder and creates shortcuts.

The application version and runtime versions are pinned in this folder's `package.json` and independent lockfile. Changing the game website updates game content. Updating Electron or the desktop program itself requires distributing a new installer; automatic binary updates are not implemented in this first version.

## Testing and distribution

Test multiplayer, audio, fullscreen, reconnect, shooting range and game exit on each target OS. Building an EXE on a Mac does not verify Windows installation or GPU behavior.

Unsigned local test installers can be built without developer accounts. General distribution on macOS needs an Apple Developer ID signing identity and notarization credentials; Windows signing needs a suitable code-signing certificate/service. These are not included in the repository. Do not bypass operating-system security warnings when evaluating an installer. Configure signing for the distributable release.

## Runtime boundaries

The game renderer has sandboxing, context isolation and no Node.js integration. A sandboxed preload exposes `officeCoreDesktop.quit()` and the validated `setResolution(height)` action. The main process accepts this request only from the trusted game origin in the main frame. The pause/menu exit button uses this action to quit the entire application and restore the display mode. The game window accepts top-level navigation only to its production HTTPS origin. Other HTTPS links open in the normal browser. Permission requests are denied except pointer lock, fullscreen and keyboard lock from the game origin.

`Spel → Återanslut / ladda om` reloads the hosted game. If it cannot load, a local error page describes how to retry.

The client starts fullscreen and temporarily switches the primary display to its saved physical pixel mode (1920×1080 on first launch). Settings can switch between 1280×720, 1920×1080 and 2560×1440 through the native display helper, preserving the closest refresh rate. The selected mode is saved in the application data folder. Switching modes first restores the baseline display mode, so subsequent helpers always retain the original desktop mode for exit/crash recovery. Unsupported selections restore the last working game mode and report an error to the settings screen. A separate OS helper retains the previous mode and restores it on window close, leaving fullscreen, or loss of the parent process's stdin pipe. Unsupported displays retain their current mode and show a warning. No permanent display preference is saved. macOS helpers are compiled for both architectures during `dist:mac`; Windows uses its built-in PowerShell and Win32 display APIs. Windows display switching still needs runtime validation on Windows.

Mac distribution now fails before building if the Developer ID certificate or notarization credentials are missing. The release hook verifies deep signature integrity, Developer ID authority, the notarization ticket and Gatekeeper assessment before accepting a DMG build. Local launch tests alone do not validate browser-downloaded installers.

## Ad hoc test build (no paid membership)

`pnpm dist:mac:test` writes separate test installers to `release-test/`. It explicitly ad hoc-signs the complete app and nested binaries while keeping the configured hardened runtime. The test hook verifies the bundle identifier, sealed resources, strict deep signature integrity and DMG integrity. These tests do not assert Gatekeeper acceptance: the app has no Apple-issued Developer ID and is not notarized. The notarized `dist:mac` distribution route retains its certificate and notarization requirements.
