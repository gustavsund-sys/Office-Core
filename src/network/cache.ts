export function installGameCache() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
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
  void navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
      void registration.update().catch(() => {});
      navigator.serviceWorker.ready.then((ready) =>
        ready.active?.postMessage({ type: "office-core-version" }),
      );
      window.setInterval(() => void registration.update().catch(() => {}), 5 * 60 * 1000);
      window.addEventListener(
        "pageshow",
        () => void registration.update().catch(() => {}),
      );
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) void registration.update().catch(() => {});
      });
    })
    .catch((error) => console.warn("Game cache unavailable", error));
}
