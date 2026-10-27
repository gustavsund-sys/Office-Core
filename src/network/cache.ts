import { waitForWorker, activateStartupWorker } from "./cacheStartup";
let installation: Promise<void> | undefined;
let updateAllowed = true;
let updateButton: HTMLButtonElement | undefined;
export function setGameUpdateAllowed(allowed: boolean) {
  updateAllowed = allowed;
  if (updateButton) updateButton.hidden = !allowed;
}
export function installGameCache(startup = false): Promise<void> {
  return installation ??= setupGameCache(startup);
}
async function setupGameCache(startup: boolean) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "office-core-update-state") {
      event.source?.postMessage({
        type: "office-core-update-state",
        token: event.data.token,
        safe: updateAllowed,
      });
      return;
    }
    if (event.data?.type === "office-core-update-blocked" && updateButton) {
      updateButton.textContent =
        "Uppdatering väntar på att alla spelflikar lämnar matchen";
      updateButton.disabled = false;
      return;
    }
    if (event.data?.type !== "office-core-version") return;
    try {
      const key = "officeCore.cacheHistory";
      const previous = JSON.parse(localStorage.getItem(key) ?? "[]") as {
        version: string;
        installedAt: string;
      }[];
      if (!previous.some((entry) => entry.version === event.data.version))
        localStorage.setItem(
          key,
          JSON.stringify(
            [
              ...previous,
              {
                version: event.data.version,
                installedAt: new Date().toISOString(),
              },
            ].slice(-20),
          ),
        );
    } catch {
      /* Storage may be unavailable; gameplay does not depend on it. */
    }
  });
  await navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then(async (registration) => {
      const offerUpdate = () => {
        if (startup || !registration.waiting) return;
        updateButton ??= document.createElement("button");
        updateButton.className = "game-update";
        updateButton.textContent = "Ny version klar · Uppdatera spelet";
        updateButton.hidden = !updateAllowed;
        updateButton.onclick = () => {
          if (!updateAllowed) return;
          updateButton!.disabled = true;
          registration.waiting?.postMessage({ type: "office-core-activate" });
        };
        document.body.append(updateButton);
      };
      offerUpdate();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", offerUpdate);
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (updateButton?.disabled && updateAllowed) location.reload();
      });
      if (startup) {
        await registration.update();
        await waitForWorker(registration.installing);
        if (registration.waiting) await activateStartupWorker(navigator.serviceWorker, registration.waiting);
        if (!navigator.serviceWorker.controller) {
          const worker = registration.active ?? registration.installing;
          if (worker) await new Promise<void>((resolve, reject) => {
            const done = () => {
              clearTimeout(timer);
              navigator.serviceWorker.removeEventListener("controllerchange", changed);
            };
            const changed = () => { done(); resolve(); };
            const timer = window.setTimeout(() => { done(); reject(new Error("Spelcachen kunde inte aktiveras. Försök igen.")); }, 15000);
            navigator.serviceWorker.addEventListener("controllerchange", changed);
            if (navigator.serviceWorker.controller) changed();
          });
        }
        startup = false;
      } else void registration.update().catch(() => {});
      navigator.serviceWorker.ready.then((ready) =>
        ready.active?.postMessage({ type: "office-core-version" }),
      );
      window.setInterval(
        () => void registration.update().catch(() => {}),
        5 * 60 * 1000,
      );
      window.addEventListener(
        "online",
        () => void registration.update().catch(() => {}),
      );
      window.addEventListener(
        "pageshow",
        () => void registration.update().catch(() => {}),
      );
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void registration.update().catch(() => {});
      });
    })
    .catch((error) => {
      if (startup) { installation = undefined; throw error; }
      console.warn("Game cache unavailable", error);
    });
}
