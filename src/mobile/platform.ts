import { setTutorialInputGuide } from "../ui/intro";
let rotate: HTMLElement | undefined;
let onPortrait: (() => void) | undefined;
let installPrompt:
  | (Event & {
      prompt(): Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    })
  | undefined;

/** Standalone configuration is installed only by the mobile entry. */
export function installMobilePlatform() {
  setTutorialInputGuide({
    movement:
      "Spaken flyttar spelaren och riktar vapnet åt samma håll. Ju längre ut du drar, desto snabbare går du. Upp till 90 % är gång; över 90 % börjar du springa. När sprintmätaren tar slut fortsätter du gå. Höger SKJUT-knapp avfyrar vapnet. Håll DUCKA för att ta skydd.",
    movementTips: [
      "HOPPA: hoppa · ANVÄND: plocka upp / desarmera · Ⅱ: paus",
      "Tryck på inventarieraden för att välja pistol, specialvapen eller skill. SIKTE öppnar Hunting Rifles kikarsikte.",
    ],
    plant:
      "Core Buster: välj vapnet och tryck PLACERA. Skydda laddningen tills den exploderar.",
    disarm:
      "Fiendens Core Buster? Stå intill och tryck ANVÄND för att påbörja 10 sekunders desarmering. Stanna nära och skjut inte.",
    skill:
      "Du börjar med två exemplar av vald skill. Tryck på skillen i inventariet och sedan PLACERA. Välj därefter ditt specialvapen igen.",
    rc: "RC Bomber: kroppen står still medan du kör. Vänster spak kör och svänger. DETONERA spränger bilen. Skydda din kropp!",
  });
  const manifest = document.createElement("link");
  manifest.rel = "manifest";
  manifest.href = "/mobile.webmanifest";
  document.head.append(manifest);
  const icon = document.createElement("link");
  icon.rel = "apple-touch-icon";
  icon.href = "/app-icons/office-core-180.png";
  document.head.append(icon);
  for (const [name, content] of [
    ["apple-mobile-web-app-capable", "yes"],
    ["apple-mobile-web-app-status-bar-style", "black-translucent"],
    ["apple-mobile-web-app-title", "Office Core"],
    ["mobile-web-app-capable", "yes"],
  ]) {
    const meta = document.createElement("meta");
    meta.name = name;
    meta.content = content;
    document.head.append(meta);
  }
  rotate = document.createElement("section");
  rotate.className = "mobile-rotate";
  rotate.setAttribute("role", "dialog");
  rotate.setAttribute("aria-modal", "true");
  rotate.setAttribute("aria-label", "Vrid mobilen");
  rotate.innerHTML =
    '<div><span aria-hidden="true">↻</span><h1>Vrid mobilen</h1><p>Office Core spelas i liggande läge.<br>Vrid skärmen för att fortsätta.</p><small>Stäng av telefonens rotationslås om skärmen inte vrids.</small></div>';
  document.body.append(rotate);
  const update = () => {
    const portrait = innerHeight > innerWidth;
    rotate!.hidden = !portrait;
    if (portrait) onPortrait?.();
  };
  window.addEventListener("resize", update);
  screen.orientation?.addEventListener("change", update);
  update();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as typeof installPrompt;
    window.dispatchEvent(new Event("mobile-install-ready"));
  });
}
export function setPortraitHandler(handler: () => void) {
  onPortrait = handler;
  if (innerHeight > innerWidth) handler();
}
export function isLandscape() {
  return innerWidth >= innerHeight;
}
export async function openMobileFullscreen() {
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    /* iOS uses installed standalone mode instead. */
  }
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (value: string) => Promise<void>;
  };
  try {
    await orientation?.lock?.("landscape");
  } catch {
    /* Rotation guard remains the universal fallback. */
  }
}
export async function installMobileApp() {
  if (installPrompt) {
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = undefined;
    return;
  }
  const help = document.createElement("dialog");
  help.className = "mobile-install-help";
  help.innerHTML =
    "<h2>Office Core på hemskärmen</h2><p><b>iPhone / iPad:</b> öppna sidan i Safari, välj Dela → Lägg till på hemskärmen.</p><p><b>Android:</b> öppna webbläsarens meny och välj Installera app eller Lägg till på startskärmen.</p><p>Appen söker efter uppdateringar automatiskt. Du kan uppdatera från menyn när en ny version är klar.</p><button>UPPFATTAT</button>";
  document.body.append(help);
  help.querySelector("button")!.onclick = () => {
    help.close();
    help.remove();
  };
  help.showModal();
}
