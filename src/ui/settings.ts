import { DESKTOP_RELEASE_URL } from "../client/downloads";
import type { Game } from "../game/game";
import {
  readGraphics,
  saveGraphics,
  readResolution,
  saveResolution,
  type GraphicsTier,
  type RenderResolution,
} from "../game/graphicsSettings";
import {
  readControlScheme,
  saveControlScheme,
  type ControlScheme,
} from "../game/controlSettings";
import { readVolumes, setVolume } from "../audio/mixer";
import "./settings.css";

let game: Game | undefined;
let applyGraphics: (() => void) | undefined;

export function installSettings(currentGame: Game, apply: () => void) {
  game = currentGame;
  applyGraphics = apply;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-trigger";
  button.innerHTML = '<span aria-hidden="true">⚙</span> INSTÄLLNINGAR';
  button.addEventListener("click", () => openSettings());
  document.querySelector(".pause-card")!.append(button);
}

export function openSettings() {
  if (!game || document.querySelector(".settings-page")) return;
  const graphicsAvailable = !!window.officeCoreDesktop;
  const before = document.activeElement as HTMLElement | null;
  const originalVolumes = readVolumes();
  const dialog = document.createElement("dialog");
  dialog.className = "settings-page";
  dialog.setAttribute("aria-labelledby", "settings-title");
  dialog.innerHTML = `<div class="settings-shell">
    <header class="settings-header"><div><span class="settings-eyebrow">OFFICE CORE / PERSONLIGA PREFERENSER</span><h1 id="settings-title">Ditt sätt att spela.</h1><p>${graphicsAvailable ? "Grafik, ljud och kontroller." : "Ljud och kontroller."} Anpassa kontoret efter dig.</p></div><button class="settings-close" type="button" aria-label="Stäng inställningar">×</button></header>
    <div class="settings-layout"><nav class="settings-nav" aria-label="Inställningskategorier"><button type="button" data-tab="graphics" aria-pressed="true"><span>01</span> Grafik</button><button type="button" data-tab="audio" aria-pressed="false"><span>02</span> Ljud</button><button type="button" data-tab="controls" aria-pressed="false"><span>03</span> Kontroller</button><p>Sparas på den här enheten.</p></nav>
    <div class="settings-content">
      <section data-panel="graphics"><span class="settings-eyebrow">BILDKVALITET</span><h2>Skärpa eller fler bildrutor?</h2>
        <label class="settings-row"><span><strong>Skärmupplösning</strong><small>Ändrar skärmens upplösning i fullskärmsläget.</small></span><select name="resolution" aria-label="Skärmupplösning"><option value="1440">2560 × 1440</option><option value="1080">1920 × 1080</option><option value="720">1280 × 720</option></select></label>
        <label class="settings-row"><span><strong>Detaljnivå</strong><small>Styr skuggor, ljussken och mängden effekter.</small></span><select name="quality" aria-label="Detaljnivå"><option value="standard">Hög</option><option value="medium">Mellan</option><option value="low">Låg</option></select></label>
        <div class="settings-quality-note"><span>◆</span><p data-quality-note></p></div><p class="settings-footnote">Skärmen måste stödja upplösningen. Högre upplösning kan sänka bildfrekvensen.</p>
      </section>
      <section data-panel="audio" hidden><span class="settings-eyebrow">LJUDMIX</span><h2>Hör kontoret på ditt sätt.</h2><p>Justera musik och speleffekter separat. Du hör volymändringen direkt.</p>
        <label class="settings-volume"><span><strong>Musik</strong><output data-volume="music"></output></span><input type="range" name="music" aria-label="Musikvolym" min="0" max="100" step="1"><small>Lobbymusik och musik under matchen.</small></label>
        <label class="settings-volume"><span><strong>Ljudeffekter</strong><output data-volume="effects"></output></span><input type="range" name="effects" aria-label="Effektvolym" min="0" max="100" step="1"><small>Vapen, fotsteg, larm, röster och andra spelljud.</small></label>
      </section>
      <section data-panel="controls" hidden><span class="settings-eyebrow">RÖRELSE & SIKTE</span><h2>Hitta ditt flyt.</h2><p>Välj hur spelaren rör sig. Klassisk styrning är standard.</p>
        <label class="settings-control"><input type="radio" name="settings-controls" value="classic"><span><strong>Klassisk</strong><small>Rör dig i kartans riktningar och sikta fritt. På mobil flyttar vänster spak spelaren över kartan.</small><b>STANDARD</b></span></label>
        <label class="settings-control"><input type="radio" name="settings-controls" value="aim"><span><strong>Siktstyrd</strong><small>Framåt följer siktet. Bakåt backar och sidled rör dig runt siktets riktning.</small></span></label>
        <div class="settings-key-guide"><span><kbd>W A S D</kbd> Flytta</span><span><kbd>E</kbd> Interagera</span><span><kbd>ESC</kbd> Pausmeny</span></div>
      </section>
    </div></div>
    <footer class="settings-footer"><span role="status">Dina val används när du sparar.</span><div><button class="settings-cancel" type="button">Avbryt</button><button class="settings-save" type="button">SPARA ÄNDRINGAR <span>↗</span></button></div></footer>
  </div>`;
  const quality = dialog.querySelector<HTMLSelectElement>('[name="quality"]')!;
  const resolution = dialog.querySelector<HTMLSelectElement>(
    '[name="resolution"]',
  )!;
  quality.value = readGraphics() ?? "standard";
  resolution.value = String(readResolution());
  const scheme = game
    ? game.input.aimRelativeMovement
      ? "aim"
      : "classic"
    : readControlScheme();
  dialog.querySelector<HTMLInputElement>(
    `[name="settings-controls"][value="${scheme}"]`,
  )!.checked = true;
  const updateQuality = () => {
    dialog.querySelector("[data-quality-note]")!.textContent = {
      standard: "Hög · Detaljerade skuggor, full mängd effekter och ljussken.",
      medium:
        "Mellan · Enklare skuggor och färre effekter. En balans mellan bildkvalitet och flyt.",
      low: "Låg · Skuggor av och färre effekter. Prioriterar bildfrekvensen.",
    }[quality.value as GraphicsTier]!;
  };
  quality.addEventListener("change", updateQuality);
  updateQuality();
  if (!graphicsAvailable) {
    dialog.querySelector('[data-tab="graphics"]')!.remove();
    dialog.querySelector('[data-panel="graphics"]')!.remove();
    dialog.querySelector<HTMLElement>('[data-panel="audio"]')!.hidden = false;
    dialog
      .querySelector('[data-tab="audio"]')!
      .setAttribute("aria-pressed", "true");
    dialog.querySelectorAll("[data-tab] span").forEach((number, index) => {
      number.textContent = String(index + 1).padStart(2, "0");
    });
  }
  for (const channel of ["music", "effects"] as const) {
    const slider = dialog.querySelector<HTMLInputElement>(
      `[name="${channel}"]`,
    )!;
    slider.value = String(Math.round(originalVolumes[channel] * 100));
    const value = dialog.querySelector<HTMLOutputElement>(
      `[data-volume="${channel}"]`,
    )!;
    value.value = `${slider.value} %`;
    slider.addEventListener("input", () => {
      value.value = `${slider.value} %`;
      setVolume(channel, Number(slider.value) / 100);
    });
  }
  for (const button of Array.from(
    dialog.querySelectorAll<HTMLButtonElement>("[data-tab]"),
  )) {
    button.addEventListener("click", () => {
      dialog.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== button.dataset.tab;
      });
      dialog
        .querySelectorAll("[data-tab]")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
    });
  }
  let saving = false;
  const close = (saved = false) => {
    if (saving) return;
    if (!saved) {
      setVolume("music", originalVolumes.music);
      setVolume("effects", originalVolumes.effects);
    }
    dialog.close();
    dialog.remove();
    before?.focus();
  };
  dialog
    .querySelector(".settings-close")!
    .addEventListener("click", () => close());
  dialog
    .querySelector(".settings-cancel")!
    .addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog
    .querySelector(".settings-save")!
    .addEventListener("click", async () => {
      if (saving) return;
      const saveButton =
        dialog.querySelector<HTMLButtonElement>(".settings-save")!;
      const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
      if (graphicsAvailable) {
        const setResolution = window.officeCoreDesktop?.setResolution;
        if (!setResolution) {
          status.textContent =
            "Installera den nya desktopversionen för att kunna byta skärmens upplösning.";
          const download = document.createElement("a");
          download.href = DESKTOP_RELEASE_URL;
          download.textContent = "Hämta uppdateringen";
          status.append(" ", download);
          return;
        }
        saving = true;
        dialog
          .querySelectorAll<HTMLInputElement | HTMLSelectElement>(
            "input, select",
          )
          .forEach((input) => {
            input.disabled = true;
          });
        saveButton.disabled = true;
        status.textContent = "Byter skärmens upplösning…";
        try {
          const result = await setResolution(
            Number(resolution.value) as RenderResolution,
          );
          if (!result.ok) {
            status.textContent =
              result.error ?? "Skärmens upplösning kunde inte ändras.";
            return;
          }
        } catch {
          status.textContent =
            "Skärmens upplösning kunde inte ändras. Försök igen.";
          return;
        } finally {
          saving = false;
          dialog
            .querySelectorAll<HTMLInputElement | HTMLSelectElement>(
              "input, select",
            )
            .forEach((input) => {
              input.disabled = false;
            });
          saveButton.disabled = false;
        }
      }
      if (graphicsAvailable) {
        saveGraphics(quality.value as GraphicsTier);
        saveResolution(Number(resolution.value) as RenderResolution);
      }
      const controls = dialog.querySelector<HTMLInputElement>(
        '[name="settings-controls"]:checked',
      )!.value as ControlScheme;
      saveControlScheme(controls);
      game?.setControlScheme(controls === "aim", false);
      if (game) {
        game.sound = true;
        game.lobbyMuted = false;
        try {
          localStorage.setItem("officeCore.lobbyMuted", "false");
        } catch {
          /* Optional persistence. */
        }
        game.updateLobbyMusic(true);
      }
      if (graphicsAvailable) applyGraphics?.();
      close(true);
    });
  if (document.documentElement.dataset.client === "mobile") {
    dialog.querySelector(".settings-key-guide")?.remove();
    const tools = document.createElement("div");
    tools.className = "settings-mobile-tools";
    document
      .querySelectorAll<HTMLButtonElement>(
        ".mobile-settings button:not(#sound)",
      )
      .forEach((original) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = original.textContent;
        button.addEventListener("click", () => original.click());
        tools.append(button);
      });
    const changeClient = document.querySelector(".mobile-change-client");
    if (changeClient) tools.append(changeClient.cloneNode(true));
    dialog.querySelector('[data-panel="controls"]')!.append(tools);
  }
  document.body.append(dialog);
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.showModal();
}
