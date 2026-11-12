import {
  ANIMATIONS, APPEARANCE_KEY, DEFAULT_APPEARANCE, OUTFITS,
  readAppearance, type Appearance, type CharacterAnimation, type Outfit,
} from "../player/appearance";
import { CharacterLabScene } from "./characterLabScene";
import "./characterLab.css";

export function openCharacterLab(standalone = false, selection?: {
  appearance: Appearance;
  onSelect: (appearance: Appearance) => void;
}) {
  if (document.querySelector(".character-lab")) return;
  const before = document.activeElement as HTMLElement | null;
  const dialog = document.createElement("dialog");
  dialog.className = "character-lab";
  dialog.setAttribute("aria-labelledby", "character-lab-title");
  let draft = { ...(selection?.appearance ?? readAppearance()) };
  let animation: CharacterAnimation = "Idle";
  const options = OUTFITS.map(([id, label]) => `<option value="${id}">${label}</option>`).join("");
  const select = (name: string, label: string, extra = "") =>
    `<label class="cl-label" for="cl-${name}">${label}</label><select id="cl-${name}" name="${name}">${options}${extra}</select>`;
  dialog.innerHTML = `
    <header class="cl-header"><div><span class="cl-eyebrow">OFFICE CORE / CHARACTER LAB</span><h1 id="character-lab-title">Vem är du på kontoret?</h1><p>Din stil. Dina kombinationer.</p></div><button type="button" class="cl-close" aria-label="Stäng karaktärsbyggaren">×</button></header>
    <div class="cl-layout">
      <section class="cl-stage" aria-label="Förhandsvisning av karaktär">
        <canvas class="cl-canvas" aria-label="3D-karaktär. Dra för att rotera och skrolla för att zooma." tabindex="0"></canvas>
        <div class="cl-stage-top"><span class="cl-pill">ULTIMATE MODULAR</span><span class="cl-stats"></span></div>
        <div class="cl-stage-bottom"><div><strong>DIN NYA REKRYT</strong><span>Dra för att rotera · skrolla för att zooma</span></div><div class="cl-camera-tools"><button type="button" data-view="body" aria-pressed="true">Helkropp</button><button type="button" data-view="face" aria-pressed="false">Ansikte</button><button type="button" class="cl-rotate" aria-pressed="false">↻ Rotera</button></div></div>
        <div class="cl-loading" role="status">Förbereder din karaktär…</div>
      </section>
      <section class="cl-controls" aria-label="Anpassa din karaktär">
        <span class="cl-eyebrow">01 / VÄLJ EN STIL</span><h2>Gör den till din.</h2>
        <label class="cl-label" for="cl-preset">Komplett outfit</label><select id="cl-preset" name="preset"><option value="custom" disabled>Egen kombination</option>${options}</select>
        <div class="cl-divider"></div><span class="cl-eyebrow">02 / MIXA DELAR</span>
        ${select("head", "Huvud", '<option value="Horse">Hästmask</option>')}
        ${select("body", "Överkropp")}
        <div class="cl-pair"><div>${select("legs", "Ben / byxor")}</div><div>${select("feet", "Skor")}</div></div>
        <label class="cl-check"><input type="checkbox" name="backpack"> Ryggsäck</label>
        <div class="cl-divider"></div><span class="cl-eyebrow">03 / SE DEN I RÖRELSE</span>
        <label class="cl-label" for="cl-animation">Animation</label><select id="cl-animation" name="animation">${ANIMATIONS.map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select>
        <p class="cl-animation-note">Paketets 24 animationer. Vapenposer visas utan vapen.</p>
        <div class="cl-note"><strong>DITT UTSEENDE</strong><p>11 outfits, fritt kombinerbara delar och en hästmask. Ditt sparade utseende används när du ansluter till nästa match.</p></div>
        <a class="cl-credit" href="https://quaternius.com/packs/ultimatemodularcharacters.html" target="_blank" rel="noopener noreferrer">Modeller av Quaternius · CC0 ↗</a>
      </section>
    </div>
    <div class="cl-footer"><span class="cl-status" role="status">Ditt utseende sparas på den här enheten.</span><div><button type="button" class="cl-random">Slumpa</button><button type="button" class="cl-reset">Återställ</button><button type="button" class="cl-save" disabled>SPARA UTSEENDE ↗</button></div></div>`;
  document.body.append(dialog);
  dialog.showModal();
  let scene: CharacterLabScene;
  const status = dialog.querySelector<HTMLElement>(".cl-status")!;
  const loading = dialog.querySelector<HTMLElement>(".cl-loading")!;
  const save = dialog.querySelector<HTMLButtonElement>(".cl-save")!;
  if (selection) {
    dialog.classList.add("cl-selection");
    save.textContent = "SPARA KARAKTÄR OCH BLI REDO";
    dialog.querySelector(".cl-eyebrow")!.textContent = "STEG 2 AV 2";
    dialog.querySelector("#character-lab-title")!.textContent = "Välj din karaktär";
    dialog.querySelector(".cl-close")!.textContent = "← Tillbaka";
    dialog.querySelector(".cl-close")!.setAttribute("aria-label", "Tillbaka till utrustningen");
    status.textContent = "Bekräfta karaktären för att bli redo. Ditt val sparas i webbläsaren.";
    dialog.querySelector(".cl-note p")!.textContent = "Välj en outfit eller kombinera delarna själv. Karaktären följer med ditt utrustningsval.";
  }
  let closed = false;
  let generation = 0;
  const close = () => {
    if (closed) return;
    closed = true;
    scene?.dispose();
    dialog.remove();
    if (standalone) {
      const url = new URL(location.href);
      url.searchParams.delete("characterLab");
      location.href = url.href;
    } else before?.focus();
  };
  dialog.querySelector(".cl-close")!.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  const sync = () => {
    for (const key of ["head", "body", "legs", "feet"] as const)
      dialog.querySelector<HTMLSelectElement>(`[name=${key}]`)!.value = draft[key];
    dialog.querySelector<HTMLInputElement>("[name=backpack]")!.checked = draft.backpack;
    const preset = draft.head === draft.body && draft.legs === draft.body && draft.feet === draft.body ? draft.body : "custom";
    dialog.querySelector<HTMLSelectElement>("[name=preset]")!.value = preset;
  };
  const load = async () => {
    if (!scene) return;
    const current = ++generation;
    save.disabled = true;
    loading.hidden = false;
    loading.textContent = "Förbereder din karaktär…";
    try {
      const triangles = await scene.show(draft);
      if (closed || current !== generation || triangles === null) return;
      scene.play(animation);
      dialog.querySelector(".cl-stats")!.textContent = `${Math.round(triangles).toLocaleString("sv-SE")} trianglar`;
      loading.hidden = true;
      save.disabled = false;
    } catch (error) {
      if (closed || current !== generation) return;
      console.error("Character lab could not load model", error);
      loading.textContent = "Modellen kunde inte laddas. Välj en outfit igen för att försöka på nytt.";
      status.textContent = "Kunde inte ladda förhandsvisningen.";
      if (selection) save.disabled = false;
    }
  };
  dialog.addEventListener("change", event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
    if (input.name === "animation") {
      animation = input.value as CharacterAnimation;
      scene?.play(animation);
      return;
    }
    if (input.name === "preset") {
      const outfit = input.value as Outfit;
      draft = { head: outfit, body: outfit, legs: outfit, feet: outfit, backpack: false };
    } else if (["head", "body", "legs", "feet"].includes(input.name)) {
      const key = input.name as "body" | "legs" | "feet";
      draft[key] = input.value as Outfit;
    } else if (input instanceof HTMLInputElement && input.name === "backpack") draft.backpack = input.checked;
    else return;
    sync();
    status.textContent = "Du har osparade ändringar.";
    void load();
  });
  const frame = (face = false) => {
    if (!scene) return;
    scene.frame(face);
    for (const button of Array.from(dialog.querySelectorAll<HTMLButtonElement>("[data-view]")))
      button.setAttribute("aria-pressed", String((button.dataset.view === "face") === face));
  };
  dialog.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button => button.addEventListener("click", () => frame(button.dataset.view === "face")));
  dialog.querySelector(".cl-rotate")!.addEventListener("click", event => {
    if (!scene) return;
    scene.rotate = !scene.rotate;
    (event.currentTarget as HTMLElement).setAttribute("aria-pressed", String(scene.rotate));
  });
  dialog.querySelector(".cl-reset")!.addEventListener("click", () => {
    draft = { ...DEFAULT_APPEARANCE };
    animation = "Idle";
    dialog.querySelector<HTMLSelectElement>("[name=animation]")!.value = animation;
    sync();
    frame();
    status.textContent = "Standardutseendet är återställt. Spara för att behålla det.";
    void load();
  });
  dialog.querySelector(".cl-random")!.addEventListener("click", () => {
    const random = () => OUTFITS[Math.floor(Math.random() * OUTFITS.length)][0];
    draft = { head: random(), body: random(), legs: random(), feet: random(), backpack: Math.random() > 0.5 };
    sync();
    status.textContent = "En ny kombination. Spara om du vill behålla den.";
    void load();
  });
  save.addEventListener("click", () => {
    if (selection) {
      close();
      selection.onSelect(draft);
      return;
    }
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(draft));
      status.textContent = "Sparat på den här enheten. Utseendet används nästa gång du ansluter.";
    } catch { status.textContent = "Kunde inte spara. Kontrollera att webbläsaren tillåter lokal lagring."; }
  });
  sync();
  try {
    scene = new CharacterLabScene(dialog.querySelector("canvas")!);
  } catch (error) {
    console.error(error);
    loading.textContent = "3D-förhandsvisningen kunde inte starta i den här webbläsaren.";
    if (selection) save.disabled = false;
    return;
  }
  void load();
}
