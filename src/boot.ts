import { installGameCache } from "./network/cache";
import { checkStartupVersion } from "./network/startupVersion";

const gate = document.createElement("section");
gate.id = "version-startup";
gate.setAttribute("role", "status");
gate.style.cssText = "position:fixed;inset:0;z-index:5000;display:grid;place-content:center;gap:14px;text-align:center;padding:24px;background:#0b202c;color:#dcebe9;font:16px/1.5 system-ui";
const title = document.createElement("strong");
title.textContent = "OFFICE CORE";
title.style.cssText = "font-size:28px;letter-spacing:.06em";
const status = document.createElement("span");
status.textContent = "Kontrollerar senaste versionen…";
gate.append(title, status);
document.body.append(gate);

async function boot() {
  if (import.meta.env.PROD) {
    const ready = await checkStartupVersion(import.meta.url, async () => {
      const response = await fetch("/game-version.json", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Kunde inte kontrollera senaste versionen. Kontrollera anslutningen och försök igen.");
      return response.json();
    }, (version) => {
      const key = "officeCore.startupRedirect";
      let attempted = new URL(location.href).searchParams.get("v");
      try { attempted = sessionStorage.getItem(key) ?? attempted; } catch { /* Storage is optional. */ }
      if (attempted === version) throw new Error("Sidan levererar fortfarande en äldre startfil. Försök ladda om igen.");
      try { sessionStorage.setItem(key, version); } catch { /* URL also guards reload loops. */ }
      const url = new URL(location.href);
      url.searchParams.set("v", version);
      location.replace(url.href);
    });
    if (!ready) return;
    try { sessionStorage.removeItem("officeCore.startupRedirect"); } catch { /* Storage is optional. */ }
    status.textContent = "Förbereder senaste spelversionen…";
    await installGameCache(true);
  }
  status.textContent = "Startar spelet…";
  await import("./main");
  gate.remove();
}
void boot().catch((error) => {
  status.textContent = error instanceof Error ? error.message : "Spelet kunde inte förberedas. Försök igen.";
  const retry = document.createElement("button");
  retry.textContent = "Försök igen";
  retry.style.cssText = "min-height:44px;border:0;border-radius:22px;background:#efc385;color:#15232c;font:700 14px system-ui;padding:10px 24px";
  retry.onclick = () => { try { sessionStorage.removeItem("officeCore.startupRedirect"); } catch { /* Storage is optional. */ } location.reload(); };
  gate.append(retry);
});
