import { APPEARANCE_KEY, readAppearance } from "../player/appearance";
import { START_WEAPONS, type Loadout } from "../game/loadout";
import { WEAPONS } from "../config/weapons";
export class LoadoutUI {
  el = document.createElement("section");
  choice: Loadout = { weapon: "machineGun", skill: "pulseTrap", appearance: readAppearance() };
  confirmed = false;
  constructor(public onConfirm: (choice: Loadout | null) => void) {
    this.el.setAttribute("aria-label", "Utrustning före spawn");
    this.el.className = "loadout-panel deployment-screen";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="loadout-heading"><small>STEG 1 AV 2</small><h2>VÄLJ DIN UTRUSTNING</h2><p>Pistol ingår alltid. Välj specialvapen och skill. Därefter väljer du karaktär.</p></div><div class="loadout-art"><figure><img class="loadout-weapon-art" alt="" decoding="async"><figcaption class="weapon-art-caption"></figcaption></figure><figure><img class="loadout-skill-art" alt="" decoding="async"><figcaption class="skill-art-caption"></figcaption></figure></div><div class="loadout-options"><fieldset><legend>1 · SPECIAL WEAPON</legend>${START_WEAPONS.map((id) => `<button type="button" data-weapon="${id}">${WEAPONS[id].name}<small>${WEAPONS[id].damage} DMG</small></button>`).join("")}</fieldset><fieldset><legend>2 · SKILL · 2 ST</legend><button type="button" data-skill="pulseTrap">OFFENSIVE · PULSE TRAP<small>Närhetsmina · 5 m · 50 HP max</small></button><button type="button" data-skill="rcCar">OFFENSIVE · RC BOMBER<small>Fjärrstyrd kamerabil · WASD · E: detonera · 2 st</small></button><button type="button" data-skill="superMedkit">DEFENSIVE · SUPER MED-KIT<small>Placera en hälsostation · återställer till 100 HP</small></button></fieldset></div><button type="button" class="loadout-confirm">NÄSTA · VÄLJ KARAKTÄR →</button><p class="loadout-status" aria-live="polite">Välj utrustning och fortsätt till karaktärsvalet.</p>`;
    const status = this.el.querySelector<HTMLElement>(".loadout-status")!;
    const confirmButton = this.el.querySelector<HTMLButtonElement>(".loadout-confirm")!;
    const markChanged = () => {
      this.confirmed = false;
      confirmButton.disabled = false;
      this.onConfirm(null);
      this.el.querySelector(".loadout-status")!.textContent = "Bekräfta ditt nya val.";
    };
    const refresh = () => {
      const weaponArt = this.el.querySelector<HTMLImageElement>(
        ".loadout-weapon-art",
      )!;
      const skillArt =
        this.el.querySelector<HTMLImageElement>(".loadout-skill-art")!;
      const skillName =
        this.choice.skill === "rcCar"
          ? "RC BOMBER"
          : this.choice.skill === "pulseTrap"
            ? "PULSE TRAP"
            : "SUPER MED-KIT";
      weaponArt.style.objectFit =
        this.choice.weapon === "coreBuster" ? "contain" : "cover";
      weaponArt.src = `/loadout/${this.choice.weapon}.webp`;
      weaponArt.alt = `Office Core-spelaren utrustad med ${WEAPONS[this.choice.weapon].name} i kontorsmiljö`;
      skillArt.src = `/loadout/${this.choice.skill}.webp`;
      skillArt.alt = `${skillName} i kontorsmiljö`;
      this.el.querySelector(".weapon-art-caption")!.textContent =
        WEAPONS[this.choice.weapon].name;
      this.el.querySelector(".skill-art-caption")!.textContent =
        `2 × ${skillName}`;
      for (const b of Array.from(
        this.el.querySelectorAll<HTMLButtonElement>(
          "[data-weapon],[data-skill]",
        ),
      )) {
        const selected =
          b.dataset.weapon === this.choice.weapon ||
          b.dataset.skill === this.choice.skill;
        b.classList.toggle("selected", selected);
        b.setAttribute("aria-pressed", String(selected));
      }
    };
    this.el.addEventListener("click", (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>("button");
      if (!button) return;
      if (button.dataset.weapon)
        this.choice.weapon = button.dataset.weapon as Loadout["weapon"];
      else if (button.dataset.skill)
        this.choice.skill = button.dataset.skill as Loadout["skill"];
      else return;
      markChanged();
      refresh();
    });
    let openingCharacterSelection = false;
    confirmButton.addEventListener("click", async () => {
      if (openingCharacterSelection || this.confirmed) return;
      openingCharacterSelection = true;
      confirmButton.disabled = true;
      try {
        const { openCharacterLab } = await import("./characterLab");
        if (this.el.hidden) return;
        openCharacterLab(false, {
          appearance: this.choice.appearance ?? readAppearance(),
          onSelect: appearance => {
            if (this.el.hidden) return;
            this.choice.appearance = appearance;
            try {
              localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
            } catch { /* The match choice still works without local storage. */ }
            this.confirmed = true;
            confirmButton.disabled = true;
            status.textContent = "REDO · Utrustning och karaktär bekräftade.";
            this.onConfirm({ ...this.choice });
          },
        });
      } catch (error) {
        console.error("Could not open character selection", error);
        status.textContent = "Karaktärsvalet kunde inte öppnas. Tryck på Nästa för att försöka igen.";
      } finally {
        openingCharacterSelection = false;
        confirmButton.disabled = this.confirmed;
      }
    });
    refresh();
  }
}
