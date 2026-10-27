/** Wait for the complete worker download, not just updatefound. */
export function waitForWorker(worker: ServiceWorker | null, timeoutMs = 60000): Promise<void> {
  if (!worker || worker.state === "installed" || worker.state === "activated") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", check);
      error ? reject(error) : resolve();
    };
    const check = () => {
      if (worker.state === "installed" || worker.state === "activated") finish();
      else if (worker.state === "redundant") finish(new Error("Uppdateringen kunde inte hämtas. Försök igen."));
    };
    const timer = setTimeout(() => finish(new Error("Uppdateringen tog för lång tid. Kontrollera anslutningen och försök igen.")), timeoutMs);
    worker.addEventListener("statechange", check);
    check();
  });
}
export function activateStartupWorker(container: ServiceWorkerContainer, worker: ServiceWorker, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      container.removeEventListener("controllerchange", changed);
      container.removeEventListener("message", message);
      error ? reject(error) : resolve();
    };
    const changed = () => finish();
    const message = (event: MessageEvent) => {
      if (event.data?.type === "office-core-update-blocked")
        finish(new Error("En annan spelflik har en pågående match. Lämna matchen i den fliken och försök igen för att starta den senaste versionen."));
    };
    const timer = setTimeout(() => finish(new Error("Den nya versionen kunde inte aktiveras. Försök igen.")), timeoutMs);
    container.addEventListener("controllerchange", changed);
    container.addEventListener("message", message);
    worker.postMessage({ type: "office-core-activate" });
  });
}
