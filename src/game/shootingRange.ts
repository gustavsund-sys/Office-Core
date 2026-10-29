import type { World } from "../map/builder";
import { Damageable } from "../core/damageable";

/** A self-contained indoor practice layout, independent of the match map. */
export const RANGE_X = 500;
export function buildShootingRange(world: World, offset = 0) {
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string, solid = false) => world.box(name, x + offset, y, z, w, h, d, color, solid);
  box("range floor", 0, -0.15, 0, 30, 0.3, 32, "#40515a");
  for (const x of [-15, 15]) box("range wall", x, 2, 0, 0.4, 4, 32, "#273b45", true);
  for (const z of [-16, 16]) box("range wall", 0, 2, z, 30, 4, 0.4, "#273b45", true);
  for (const x of [-10, -5, 0, 5, 10])
    box("range lane", x, 0.01, 0, 0.06, 0.02, 28, "#a8c4bd");
  for (const z of [-5, 0, 5, 10])
    box("range distance marker", 0, 0.02, z, 28, 0.025, 0.05, "#839991");
  world.label("OFFICE CORE · SHOOTING RANGE", offset, 13, "#75decf", 4);
  world.coreDoor("BLUE", offset + 12, 8, 2, 0.5);
  return [-10, -5, 0, 5, 10].map((x) => new Damageable(world, "target", x + offset, 8));
}

export function rangeRoomStatus(room: { players: unknown[]; capacity: number; started: boolean }, wasFull: boolean) {
  const count = room.players.length;
  const available = count < room.capacity;
  return { count, available, opened: available && wasFull, nextWasFull: !available };
}

/** Poll independently of gameplay so a full match never blocks practice. */
export function installRangeStatus(endpoint: string, onReturn?: () => void) {
  const panel = document.createElement("aside");
  panel.className = "range-server-status";
  panel.innerHTML = '<strong>OFFICE01 · SERVERSTATUS</strong><span role="status" aria-live="polite">Kontrollerar servern…</span><a href="/">TILL SERVERLOBBYN ↗</a>';
  document.body.append(panel);
  if (onReturn) panel.querySelector("a")!.onclick = (event) => { event.preventDefault(); cleanup(); onReturn(); };
  const status = panel.querySelector("span")!;
  let wasFull = false;
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      const url = new URL(endpoint);
      url.protocol = url.protocol === "wss:" ? "https:" : "http:";
      url.pathname = "/rooms";
      url.search = "";
      url.hash = "";
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Server unavailable");
      const data = await response.json() as { rooms?: { players: unknown[]; capacity: number; started: boolean }[] };
      const room = data.rooms?.[0];
      if (!room) { status.textContent = "Servern är tillgänglig · väntar på lobby"; return; }
      const { count, available, opened, nextWasFull } = rangeRoomStatus(room, wasFull);
      status.textContent = `${count}/${room.capacity} spelare · ${available ? "PLATS LEDIG" : "FULLT"}${room.started ? " · MATCH PÅGÅR" : " · LOBBY"}`;
      panel.classList.toggle("available", available);
      if (opened) {
        status.textContent = `PLATS LEDIG! ${count}/${room.capacity} · Du kan ansluta nu`;
        panel.classList.add("new-place");
      }
      if (!available) panel.classList.remove("new-place");
      wasFull = nextWasFull;
    } catch {
      status.textContent = "Serverstatus tillfälligt otillgänglig · försöker igen";
      panel.classList.remove("available");
    } finally { busy = false; }
  };
  void check();
  const interval = window.setInterval(() => void check(), 5000);
  const cleanup = () => { window.clearInterval(interval); panel.remove(); };
  window.addEventListener("pagehide", cleanup, { once: true });
  return cleanup;
}
