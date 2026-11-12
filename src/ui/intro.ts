import { headerArtwork } from "./headerArtwork";
export interface TutorialInputGuide {
  movement: string; movementTips: string[]; plant: string; disarm: string; skill: string; rc: string;
}
let inputGuide: TutorialInputGuide | undefined;
export function setTutorialInputGuide(guide: TutorialInputGuide) { inputGuide = guide; }

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
    {
      title: "Skydda er Core. Slå ut deras.",
      text: "Två lag, högst fyra spelare i varje. Förstör motståndarnas Core för att vinna en runda. Först till tre rundvinster vinner matchen. Alla väljer Ready inför nästa runda.",
      image: headerArtwork,
      tips: [
        "Välj namn och anslut till lobbyn.",
        "Välj lag. När matchen startar väljer du specialvapen och skill före spawn.",
      ],
    },
    {
      title: "Rör dig. Sikta. Överlev.",
      text: "WASD eller piltangenterna flyttar spelaren. Sikta med musen och skjut med vänster musknapp (LMB). Håll C för att ducka. K växlar mellan klassisk och siktstyrd rörelse.",
      image: "/loadout/machineGun.webp",
      tips: [
        "Space: hoppa · E: plocka upp / desarmera · Esc: paus",
        "1: pistol · 2: specialvapen · 3: skill. Inventarieraden visar vad du bär.",
        "Ammo fyller på ammunition. Med-kit ger +50 HP; Super Med-kit återställer till 100 HP.",
      ],
    },
    {
      title: "Välj ditt specialvapen.",
      text: "Pistolen ingår alltid. Kulsprutan ger automatisk eld, Burst Gun skjuter korta salvor och Pulse Gun ger kraftigare enskilda träffar. Bazookan ger explosionsskada runt träffen.",
      image: "/loadout/bazooka.webp",
      tips: [
        "Core Buster: placera med LMB. Skydda laddningen tills den exploderar.",
        "Fiendens Core Buster? Stå intill och håll E i 10 sekunder för att desarmera.",
        "Hämta nya vapen och ammo i Weapon Drop-zonerna. Använd kontorsobjekt som skydd.",
      ],
    },
    {
      title: "Skills som vänder striden.",
      text: "Du börjar med två exemplar av vald skill. Välj slot 3 och placera med LMB. Därefter kan du återgå till ditt specialvapen.",
      image: "/loadout/rcCar.webp",
      tips: [
        "Pulse Trap: närhetsmina med 5 m utlösningsradie och områdesskada, högst 50 HP.",
        "Super Med-kit: placera en hälsostation som återställer till 100 HP.",
        "RC Bomber: kroppen står still medan du kör. W/S: fram/back, A/D: sväng, E: detonera. Skydda din kropp!",
        "Defensive Beacon hämtas separat i Weapon Drop: en lagbunden robot som bevakar området och kan skjutas sönder.",
      ],
    },
  ];
  if (inputGuide) {
    pages[1].text = inputGuide.movement;
    pages[1].tips = [...inputGuide.movementTips, pages[1].tips[2]];
    pages[2].tips[0] = inputGuide.plant;
    pages[2].tips[1] = inputGuide.disarm;
    pages[3].text = inputGuide.skill;
    pages[3].tips[2] = inputGuide.rc;
  }
  const el = modal("onboarding tutorial-screen", "Office Core tutorial");
  let index = 0;
  return new Promise((resolve) => {
    const close = () => {
      document.removeEventListener("keydown", keys);
      el.remove();
      previousFocus?.focus();
      resolve();
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", keys);
    const render = () => {
      const page = pages[index];
      el.innerHTML = `<div class="tutorial-card"><div class="tutorial-art"><img src="${page.image}" alt="" /></div><div class="tutorial-copy"><span class="onboarding-kicker">FIELD GUIDE · ${index + 1} / ${pages.length}</span><h1>${page.title}</h1><p>${page.text}</p><ul>${page.tips.map((tip) => `<li>${tip}</li>`).join("")}</ul><nav aria-label="Tutorial navigation"><button class="tutorial-back" ${index === 0 ? "disabled" : ""}>Tillbaka</button><button class="tutorial-next">${index === pages.length - 1 ? "Till lobbyn →" : "Nästa →"}</button></nav><button class="tutorial-close">Stäng tutorial</button></div></div>`;
      el.querySelector<HTMLButtonElement>(".tutorial-back")!.onclick = () => {
        index--;
        render();
      };
      el.querySelector<HTMLButtonElement>(".tutorial-next")!.onclick = () => {
        if (index === pages.length - 1) close();
        else {
          index++;
          render();
        }
      };
      el.querySelector<HTMLButtonElement>(".tutorial-close")!.onclick = close;
      el.querySelector<HTMLButtonElement>(".tutorial-next")!.focus();
    };
    render();
  });
}
