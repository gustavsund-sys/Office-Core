import { installMobileApp, openMobileFullscreen } from "./platform";
import { Matrix, Vector3 } from "@babylonjs/core";
import type { Game } from "../game/game";
import type { MobileInput } from "./input";
import { stickVector } from "./controlMath";

type StickValue = { x: number; y: number; strength: number };
/** One pointer owner per control; releasing either thumb never releases the other. */
function stick(el: HTMLElement, change: (v: StickValue) => void) {
  let owner: number | undefined;
  const knob = el.querySelector<HTMLElement>("i")!;
  const move = (e: PointerEvent) => {
    if (e.pointerId !== owner) return;
    const rect = el.getBoundingClientRect(),
      radius = rect.width * 0.34;
    const dx = e.clientX - rect.left - rect.width / 2,
      dy = e.clientY - rect.top - rect.height / 2;
    const v = stickVector(dx, dy, radius);
    change(v);
    const length = Math.max(radius, Math.hypot(dx, dy));
    knob.style.transform = `translate(${(dx / length) * radius}px,${(dy / length) * radius}px)`;
  };
  el.addEventListener("pointerdown", (e) => {
    if (owner !== undefined) return;
    e.preventDefault();
    owner = e.pointerId;
    el.setPointerCapture(owner);
    move(e);
  });
  el.addEventListener("pointermove", move);
  const release = (e: PointerEvent) => {
    if (e.pointerId !== owner) return;
    owner = undefined;
    knob.style.transform = "";
    change({ x: 0, y: 0, strength: 0 });
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    el.addEventListener(type, release as EventListener);
  return () => {
    owner = undefined;
    knob.style.transform = "";
    change({ x: 0, y: 0, strength: 0 });
  };
}
export class MobileControls {
  readonly el = document.createElement("section");
  private fireHeld = false;
  private sprintHud = document.createElement("div");
  private resetSticks: (() => void)[] = [];
  private wasPlayable = false;
  private marker = document.createElement("div");
  private help = document.createElement("aside");
  private fireButton: HTMLButtonElement;
  private scopeButton: HTMLButtonElement;
  private interactButton: HTMLButtonElement;
  private exitButton: HTMLButtonElement;
  constructor(
    private game: Game,
    private input: MobileInput,
  ) {
    this.el.className = "mobile-controls";
    this.el.hidden = true;
    this.el.setAttribute("aria-label", "Pekstyrning");
    this.el.innerHTML = `<div class="mobile-stick move-stick" aria-label="Förflyttning"><i></i><span>GÅ / SPRINT</span></div><div class="mobile-actions"><button data-action="fire" class="mobile-fire">SKJUT</button><button data-action="interact">ANVÄND</button><button data-action="scope">SIKTE</button><button data-action="reload">LADDA</button><button data-action="jump">HOPPA</button><button data-action="crouch">DUCKA</button><button data-action="exit" hidden>LÄMNA TURRET</button></div>`;
    document.body.append(this.el);
    // Keep the existing HUD nodes and IDs so shared vitals updates still reach them.
    this.sprintHud.className = "mobile-sprint-hud";
    this.sprintHud.hidden = true;
    const vitals = document.querySelector("#ui .shield-vitals")!;
    this.sprintHud.append(vitals.querySelector("label")!, vitals.querySelector("#sprint-energy")!);
    document.querySelector("#ui")!.append(this.sprintHud);
    this.marker.className = "mobile-aim-marker";
    this.marker.hidden = true;
    document.body.append(this.marker);
    this.help.className = "mobile-help";
    this.help.textContent =
      "Spaken styr rörelse och vapen. Dra till kanten för sprint. Höger knapp skjuter.";
    document.body.append(this.help);
    this.fireButton = this.button("fire");
    this.scopeButton = this.button("scope");
    this.interactButton = this.button("interact");
    this.exitButton = this.button("exit");
    this.resetSticks.push(
      stick(this.el.querySelector(".move-stick")!, (v) => {
        this.input.movement = { x: v.x, y: v.y };
        if (this.input.remote && v.strength > 0)
          this.input.remoteDrivingStarted = true;
      }),
    );
    this.hold(this.fireButton, (active) => {
      if (this.input.remote) {
        if (active) this.input.remoteDetonate = true;
        return;
      }
      this.fireHeld = active;
      if (active) this.input.pressed = true;
    });
    this.hold(this.button("crouch"), (active) => {
      active ? input.keys.add("KeyC") : input.keys.delete("KeyC");
      if (game.boss?.active) game.player.crouched = active;
    });
    this.interactButton.onclick = () => {
      if (input.remote) input.remoteDetonate = true;
      else game.action("KeyE");
    };
    this.scopeButton.onclick = () => {
      if (game.boss?.active) game.boss.toggleScope();
      else game.rifleScope?.toggle();
    };
    for (const [name, code] of [
      ["reload", "KeyR"],
      ["jump", "Space"],
      ["exit", "KeyB"],
    ])
      this.button(name).onclick = () => game.action(code);
    // Delegation survives HUD inventory replacement, with no mutation observer or per-frame rebuild.
    document.querySelector("#ui")!.addEventListener("click", (e) => {
      if (!this.playable()) return;
      const slot = (e.target as Element).closest<HTMLElement>(
        ".inventory-slot",
      );
      const key = slot?.querySelector("kbd")?.textContent?.trim();
      if (key && /^[1-4]$/.test(key)) game.action(`Digit${key}`);
      else if (slot?.dataset.weapon === "bossKey") game.action("KeyE");
    });
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    document.addEventListener("contextmenu", (e) => {
      if ((e.target as Element).closest(".mobile-controls")) e.preventDefault();
    });
    const card = document.querySelector<HTMLElement>(".pause-card")!;
    card.dataset.mobileTab = "play";
    const logo = card.querySelector<HTMLImageElement>(".game-logo img")!;
    card.querySelectorAll(".game-logo source").forEach((source) => source.remove());
    logo.src = "/branding/office-core-primary.webp";
    logo.width = 1774;
    logo.height = 887;
    const nav = document.createElement("nav");
    nav.className = "mobile-menu-nav";
    nav.setAttribute("aria-label", "Mobilmeny");
    for (const [tab, title] of [
      ["play", "SPELA"],
      ["chat", "CHATT"],
      ["settings", "INSTÄLLNINGAR"],
    ]) {
      const button = document.createElement("button");
      button.textContent = title;
      button.setAttribute("aria-pressed", String(tab === "play"));
      button.onclick = () => {
        card.dataset.mobileTab = tab;
        nav
          .querySelectorAll("button")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      };
      nav.append(button);
    }
    card.querySelector(".game-logo")!.after(nav);
    const settings = document.createElement("section");
    settings.className = "mobile-settings";
    const make = (label: string, action: () => void) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.onclick = action;
      settings.append(button);
    };
    make("HELSKÄRM", () => void openMobileFullscreen());
    make("INSTALLERA WEBBAPP", () => void installMobileApp());
    make(
      "SPELREGLER & HJÄLP",
      () => void import("../ui/intro").then((m) => m.showTutorial()),
    );
    const change = document.createElement("a");
    change.className = "mobile-change-client";
    const url = new URL(location.href);
    url.searchParams.delete("client");
    change.href = url.href;
    change.textContent = "Byt spelversion";
    settings.append(change);
    card.append(settings);
    const guide = document.createElement("p");
    guide.className = "mobile-lobby-guide";
    guide.textContent =
      "Spaken styr rörelse och vapen · 0–90%: gång · Över 90%: sprint · Höger knapp skjuter.";
    nav.after(guide);
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(
        ".loadout-options [data-skill=rcCar] small",
      ),
    ))
      el.textContent =
        "Fjärrstyrd kamerabil · vänster spak styr · DETONERA spränger";
  }
  private button(action: string) {
    return this.el.querySelector<HTMLButtonElement>(
      `[data-action="${action}"]`,
    )!;
  }
  private precision() {
    return !!this.game.boss?.active || this.input.scoped;
  }
  private playable() {
    return (
      !this.game.paused &&
      !this.game.startupPreparing &&
      this.game.loadout.el.hidden &&
      this.game.player.hp > 0 &&
      !this.game.match.winner
    );
  }
  private hold(el: HTMLElement, change: (active: boolean) => void) {
    let owner: number | undefined;
    el.addEventListener("pointerdown", (e) => {
      if (owner !== undefined) return;
      e.preventDefault();
      owner = e.pointerId;
      el.setPointerCapture(owner);
      change(true);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === owner) {
        owner = undefined;
        change(false);
      }
    };
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      el.addEventListener(name, end as EventListener);
  }
  private reset() {
    this.resetSticks.forEach((fn) => fn());
    this.fireHeld = false;
    this.input.clear();
    this.game.boss?.touchFire(false);
    this.game.player.crouched = false;
  }
  update(dt: number) {
    const playable = this.playable();
    if (this.wasPlayable && !playable) this.reset();
    this.wasPlayable = playable;
    this.el.hidden = !playable;
    this.sprintHud.hidden = !playable;
    this.marker.hidden = !playable || this.precision() || this.input.remote;
    this.help.hidden = !playable;
    if (!playable) return;
    const precision = this.precision();
    this.el.classList.toggle("mobile-remote", this.input.remote);
    this.el.classList.toggle("mobile-precision", precision);
    const strength = Math.min(
      1,
      Math.hypot(this.input.movement.x, this.input.movement.y),
    );
    const label = this.input.remote
      ? "KÖR"
      : precision
        ? "SIKTA"
        : strength === 0
          ? "GÅ / SPRINT"
          : `${strength > 0.9 ? "SPRINT" : "GÅ"} ${Math.round(strength * 100)}%`;
    const stickLabel = this.el.querySelector<HTMLElement>(".move-stick span")!;
    if (stickLabel.textContent !== label) stickLabel.textContent = label;
    this.help.textContent = this.input.remote
      ? "Vänster spak: kör och sväng · DETONERA: spräng bilen"
      : precision
        ? "Vänster spak: sikta · SKJUT: avfyra · SIKTE: zooma"
        : "Spaken: steglös fart · 0–90%: gång · Över 90%: sprint · Höger knapp: skjut";
    if (precision) {
      const dx = this.input.movement.x * dt * 0.85,
        dy = this.input.movement.y * dt * 0.65;
      if (this.game.boss?.active) this.game.boss.touchAim(dx, dy);
      else this.game.rifleScope?.look(dx, dy);
    }
    this.input.down = this.fireHeld;
    this.game.boss?.touchFire(this.input.down);
    this.fireButton.textContent = this.input.remote
      ? "DETONERA"
      : this.game.weapons.pulseTrapSelected ||
          this.game.weapons.carryingBeacon ||
          this.game.weapons.id === "coreBuster"
        ? "PLACERA"
        : "SKJUT";
    this.interactButton.textContent = this.input.remote ? "DETONERA" : "ANVÄND";
    this.scopeButton.hidden =
      !this.game.boss?.active && this.game.weapons.id !== "huntingRifle";
    this.exitButton.hidden = !this.game.boss?.active;
    this.button("jump").hidden = precision || this.input.remote;
    if (this.input.remote) this.game.rc.el.hidden = true;
    if (!this.marker.hidden) {
      const p = this.game.player.root.position.add(
        new Vector3(this.input.aim.x * 5, 1.1, -this.input.aim.y * 5),
      );
      const engine = this.game.engine,
        viewport = this.game.camera.viewport.toGlobal(
          engine.getRenderWidth(),
          engine.getRenderHeight(),
        );
      const screen = Vector3.Project(
        p,
        Matrix.Identity(),
        this.game.scene.getTransformMatrix(),
        viewport,
      );
      this.marker.style.left = `${(screen.x / engine.getRenderWidth()) * 100}%`;
      this.marker.style.top = `${(screen.y / engine.getRenderHeight()) * 100}%`;
    }
  }
}
