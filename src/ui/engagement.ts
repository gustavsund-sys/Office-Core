import { MeshBuilder, Vector3, Matrix, type Mesh } from "@babylonjs/core";
import type { World } from "../map/builder";
import { office01 } from "../maps/office01";
import type { TeamPing, PingKind } from "../game/engagement";
const labels: Record<PingKind, string> = {
  enemy: "FIENDE HÄR",
  defend: "FÖRSVARA HÄR",
  help: "BEHÖVER HJÄLP",
};
const colors: Record<PingKind, string> = {
  enemy: "#ff7666",
  defend: "#73cbff",
  help: "#ffdc83",
};
export class EngagementUI {
  el = document.createElement("div");
  hitTimer = 0;
  pings: {
    ping: TeamPing;
    remaining: number;
    mesh: Mesh;
    label: HTMLElement;
    mini: HTMLElement;
  }[] = [];
  particles: { mesh: Mesh; life: number; velocity: Vector3 }[] = [];
  countdownLast = 0;
  constructor(
    private world: World,
    send: (kind: PingKind) => void,
  ) {
    this.el.id = "engagement-ui";
    this.el.innerHTML =
      '<div id="hit-confirm" hidden aria-live="polite"><i>✕</i><b></b></div><div id="core-crisis" hidden role="status"></div><div id="round-countdown" hidden aria-live="assertive"></div><div id="ping-controls" hidden><span>LAGKOMMANDON</span><button data-ping="enemy">G · Fiende</button><button data-ping="defend">H · Försvara</button><button data-ping="help">J · Hjälp</button></div>';
    document.querySelector("#ui")!.append(this.el);
    document.body.append(this.el.querySelector("#round-countdown")!);
    for (const button of Array.from(
      this.el.querySelectorAll<HTMLButtonElement>("[data-ping]"),
    ))
      button.onclick = () => send(button.dataset.ping as PingKind);
    window.addEventListener("keydown", (e) => {
      if (
        e.repeat ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)))
      )
        return;
      const kind: PingKind | undefined = (
        { KeyG: "enemy", KeyH: "defend", KeyJ: "help" } as Record<
          string,
          PingKind
        >
      )[e.code];
      if (kind) {
        e.preventDefault();
        send(kind);
      }
    });
  }
  confirm(kill = false) {
    this.hitTimer = kill ? 0.75 : 0.16;
    const hit = this.el.querySelector<HTMLElement>("#hit-confirm")!;
    hit.className = kill ? "kill" : "hit";
    hit.querySelector("b")!.textContent = kill ? "KILL CONFIRMED" : "";
  }
  ping(ping: TeamPing) {
    while (this.pings.length >= 8) this.removePing(this.pings.shift()!);
    const mesh = MeshBuilder.CreateTorus(
      "team ping",
      { diameter: 1.6, thickness: 0.07, tessellation: 24 },
      this.world.scene,
    );
    mesh.position.set(ping.x, 0.09, ping.z);
    mesh.isPickable = false;
    mesh.material = this.world.mat(colors[ping.kind], true);
    const label = document.createElement("div");
    label.className = "world-ping";
    label.style.setProperty("--ping", colors[ping.kind]);
    label.textContent = `${labels[ping.kind]} · ${ping.name ?? "Du"}`;
    document.querySelector("#ui")!.append(label);
    const mini = document.createElement("i");
    mini.className = "minimap-ping";
    mini.style.background = colors[ping.kind];
    document.querySelector(".map")!.append(mini);
    this.pings.push({ ping, remaining: 6, mesh, label, mini });
  }
  private removePing(p: (typeof this.pings)[number]) {
    p.mesh.dispose();
    p.label.remove();
    p.mini.remove();
  }
  clear() {
    for (const p of this.pings) this.removePing(p);
    this.pings = [];
    this.hitTimer = 0;
    this.countdown(undefined);
  }
  countdown(seconds?: number) {
    const el = document.querySelector<HTMLElement>("#round-countdown")!;
    el.hidden = seconds === undefined;
    if (seconds !== undefined) {
      el.textContent = `NÄSTA RUNDA · ${Math.max(1, Math.ceil(seconds))}`;
      document.querySelector("#victory")?.classList.add("counting-down");
    } else
      document.querySelector("#victory")?.classList.remove("counting-down");
  }
  update(
    dt: number,
    active: boolean,
    coreHp: number,
    bomb?: { team: string; timer: number },
  ) {
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.el.querySelector<HTMLElement>("#hit-confirm")!.hidden =
      this.hitTimer <= 0 || !active;
    this.el.querySelector<HTMLElement>("#ping-controls")!.hidden = !active;
    const crisis = this.el.querySelector<HTMLElement>("#core-crisis")!;
    crisis.hidden = !active || (!bomb && coreHp > 0.35);
    crisis.classList.toggle("urgent", !!bomb && bomb.timer <= 10);
    document
      .querySelector("#ui")!
      .classList.toggle("engagement-crisis", !crisis.hidden);
    const teamName = bomb
      ? bomb.team.charAt(0) + bomb.team.slice(1).toLowerCase()
      : "";
    crisis.textContent = bomb
      ? `A Core Buster has been planted at ${teamName} Core! ${teamName} Team! Disarm IT! · ${Math.ceil(bomb.timer)}s`
      : `DIN CORE ÄR KRITISK · ${Math.round(coreHp * 100)}% · FÖRSVARA!`;
    for (const p of this.pings) {
      p.remaining -= dt;
      p.mesh.scaling.setAll(1 + Math.sin(p.remaining * 5) * 0.12);
      p.mesh.setEnabled(active);
      p.label.hidden = !active;
      p.mini.hidden = !active;
      const camera = this.world.scene.activeCamera;
      if (camera) {
        const engine = this.world.scene.getEngine();
        const screen = Vector3.Project(
          new Vector3(p.ping.x, 2.1, p.ping.z),
          Matrix.Identity(),
          this.world.scene.getTransformMatrix(),
          camera.viewport.toGlobal(
            engine.getRenderWidth(),
            engine.getRenderHeight(),
          ),
        );
        p.label.style.left = `${(screen.x / engine.getRenderWidth()) * window.innerWidth}px`;
        p.label.style.top = `${(screen.y / engine.getRenderHeight()) * window.innerHeight}px`;
        p.label.hidden = !active || screen.z < 0 || screen.z > 1;
      }
      const canvas = document.querySelector<HTMLCanvasElement>("#minimap")!;
      const scale = 182 / office01.size;
      p.mini.style.left = `${canvas.offsetLeft + 95 + p.ping.x * scale}px`;
      p.mini.style.top = `${canvas.offsetTop + 95 - (p.ping.z - office01.centerZ) * scale}px`;
    }
    this.pings = this.pings.filter((p) => {
      if (p.remaining > 0) return true;
      this.removePing(p);
      return false;
    });
    for (const p of this.particles) {
      p.life -= dt;
      p.mesh.position.addInPlace(p.velocity.scale(dt));
      p.velocity.y -= dt * 5;
      p.mesh.rotation.x += dt * 3;
    }
    this.particles = this.particles.filter((p) => {
      if (p.life > 0) return true;
      p.mesh.dispose();
      return false;
    });
  }
  impact(position: Vector3, material: string, destroyed = false, strength = 1) {
    const color =
      material === "glass"
        ? "#ade4ed"
        : material === "metal"
          ? "#ffd696"
          : material === "wood"
            ? "#d1b792"
            : "#ff7b71";
    for (let i = 0; i < (destroyed ? 12 : Math.round(3 * strength)); i++) {
      if (this.particles.length >= 90) this.particles.shift()!.mesh.dispose();
      const paper = destroyed && material === "wood" && i % 3 === 0;
      const mesh = MeshBuilder.CreateBox(
        paper ? "flying paper" : "material fragment",
        {
          width: paper ? 0.2 : 0.035 * Math.sqrt(strength),
          height: paper ? 0.009 : 0.035 * Math.sqrt(strength),
          depth: paper ? 0.27 : 0.07 * Math.sqrt(strength),
        },
        this.world.scene,
      );
      mesh.position.copyFrom(position);
      mesh.material = this.world.mat(
        paper ? "#eee9cd" : color,
        material === "metal",
      );
      mesh.isPickable = false;
      this.particles.push({
        mesh,
        life: destroyed ? 1.1 : 0.18 * strength,
        velocity: new Vector3(
          (Math.random() - 0.5) * 3,
          1 + Math.random() * 2,
          (Math.random() - 0.5) * 3,
        ),
      });
    }
  }
}
