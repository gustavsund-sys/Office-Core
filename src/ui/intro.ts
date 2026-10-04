const INTRO_PREFERENCE = "officeCore.hideIntro.v1";

function modal(className: string, label: string) {
  const el = document.createElement("section");
  el.className = className;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", label);
  document.body.append(el);
  return el;
}

export function showTutorial(): Promise<void> {
  const previousFocus = document.activeElement as HTMLElement | null;
  const pages = [
    { title: "Skydda er Core. Slå ut deras.", text: "Två lag, högst fyra spelare i varje. Förstör motståndarnas Core för att vinna en runda. Först till tre rundvinster vinner matchen. Alla väljer Ready inför nästa runda.", image: "/branding/office-core-lobby-wide.webp", tips: ["Välj namn och anslut till lobbyn.", "Välj lag. När matchen startar väljer du specialvapen och skill före spawn."] },
    { title: "Rör dig. Sikta. Överlev.", text: "WASD eller piltangenterna flyttar spelaren. Sikta med musen och skjut med vänster musknapp (LMB). C växlar mellan klassisk och siktstyrd rörelse.", image: "/loadout/machineGun.webp", tips: ["Space: hoppa · E: plocka upp / desarmera · Esc: paus", "1: pistol · 2: specialvapen · 3: skill. Inventarieraden visar vad du bär.", "Ammo fyller på ammunition. Med-kit ger +50 HP; Super Med-kit återställer till 100 HP."] },
    { title: "Välj ditt specialvapen.", text: "Pistolen ingår alltid. Kulsprutan ger automatisk eld, Burst Gun skjuter korta salvor och Pulse Gun ger kraftigare enskilda träffar. Bazookan ger explosionsskada runt träffen.", image: "/loadout/bazooka.webp", tips: ["Core Buster: placera med LMB. Skydda laddningen tills den exploderar.", "Fiendens Core Buster? Stå intill och håll E i 10 sekunder för att desarmera.", "Hämta nya vapen och ammo i Weapon Drop-zonerna. Använd kontorsobjekt som skydd."] },
    { title: "Skills som vänder striden.", text: "Du börjar med två exemplar av vald skill. Välj slot 3 och placera med LMB. Därefter kan du återgå till ditt specialvapen.", image: "/loadout/rcCar.webp", tips: ["Pulse Trap: närhetsmina med 5 m utlösningsradie och områdesskada, högst 50 HP.", "Super Med-kit: placera en hälsostation som återställer till 100 HP.", "RC Bomber: kroppen står still medan du kör. W/S: fram/back, mus: styr, LMB: detonera. Skydda din kropp!", "Defensive Beacon hämtas separat i Weapon Drop: en lagbunden robot som bevakar området och kan skjutas sönder."] },
  ];
  const el = modal("onboarding tutorial-screen", "Office Core tutorial");
  let index = 0;
  return new Promise(resolve => {
    const close = () => { document.removeEventListener("keydown", keys); el.remove(); previousFocus?.focus(); resolve(); };
    const keys = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("keydown", keys);
    const render = () => {
      const page = pages[index];
      el.innerHTML = `<div class="tutorial-card"><div class="tutorial-art"><img src="${page.image}" alt="" /></div><div class="tutorial-copy"><span class="onboarding-kicker">FIELD GUIDE · ${index + 1} / ${pages.length}</span><h1>${page.title}</h1><p>${page.text}</p><ul>${page.tips.map(tip => `<li>${tip}</li>`).join("")}</ul><nav aria-label="Tutorial navigation"><button class="tutorial-back" ${index === 0 ? "disabled" : ""}>Tillbaka</button><button class="tutorial-next">${index === pages.length - 1 ? "Till lobbyn →" : "Nästa →"}</button></nav><button class="tutorial-close">Stäng tutorial</button></div></div>`;
      el.querySelector<HTMLButtonElement>(".tutorial-back")!.onclick = () => { index--; render(); };
      el.querySelector<HTMLButtonElement>(".tutorial-next")!.onclick = () => { if (index === pages.length - 1) close(); else { index++; render(); } };
      el.querySelector<HTMLButtonElement>(".tutorial-close")!.onclick = close;
      el.querySelector<HTMLButtonElement>(".tutorial-next")!.focus();
    };
    render();
  });
}

export async function showIntro(force = false) {
  try { if (!force && localStorage.getItem(INTRO_PREFERENCE) === "1") return; } catch { /* Storage may be unavailable. */ }
  const el = modal("onboarding intro-screen", "Office Core intro");
  el.innerHTML = `<video playsinline muted preload="metadata" poster="/branding/office-core-lobby-wide.webp" aria-label="Office Core introfilm"></video><div class="intro-shade"></div><div class="intro-brand"><span class="onboarding-kicker">WELCOME TO THE OFFICE</span><img src="/branding/office-core-primary.webp" alt="Office Core" /></div><button class="intro-sound">Slå på ljud</button><div class="intro-actions"><p class="intro-status" role="status"></p><label><input type="checkbox" class="intro-remember"> Visa inte igen</label><div><button class="intro-skip">Skip intro →</button><button class="intro-tutorial">Skip and show tutorial</button></div></div>`;
  const video = el.querySelector("video")!;
  const remember = el.querySelector<HTMLInputElement>(".intro-remember")!;
  try { remember.checked = localStorage.getItem(INTRO_PREFERENCE) === "1"; } catch { /* Storage may be unavailable. */ }
  // Development uses a local copy; production delivers media from GitHub Pages.
  video.src = import.meta.env.DEV ? "/intro/office-core-intro-v1.mp4" :
    import.meta.env.VITE_INTRO_VIDEO_URL || "https://gustavsund-sys.github.io/Office-Core/media/office-core-intro-v1.mp4";
  await new Promise<void>(resolve => {
    let finished = false;
    const finish = async (tutorial = false) => {
      if (finished) return;
      finished = true;
      try { localStorage.setItem(INTRO_PREFERENCE, remember.checked ? "1" : "0"); } catch { /* Continue without persistence. */ }
      document.removeEventListener("keydown", keys);
      video.pause(); video.removeAttribute("src"); video.load(); el.remove();
      if (tutorial) await showTutorial();
      resolve();
    };
    const keys = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); void finish(); } };
    document.addEventListener("keydown", keys);
    el.querySelector<HTMLButtonElement>(".intro-skip")!.onclick = () => { void finish(); };
    el.querySelector<HTMLButtonElement>(".intro-tutorial")!.onclick = () => { void finish(true); };
    const sound = el.querySelector<HTMLButtonElement>(".intro-sound")!;
    sound.onclick = () => { video.muted = !video.muted; sound.textContent = video.muted ? "Slå på ljud" : "Stäng av ljud"; void video.play().catch(() => {}); };
    video.onended = () => { void finish(); };
    video.onerror = () => { el.querySelector(".intro-status")!.textContent = "Filmen kunde inte laddas. Du kan fortsätta till spelet eller öppna tutorialen."; };
    el.querySelector<HTMLButtonElement>(".intro-skip")!.focus();
    void video.play().catch(() => { el.querySelector(".intro-status")!.textContent = "Tryck på ljudknappen för att starta filmen, eller välj Skip intro."; });
  });
}
