export type LoadingStage =
  "connect" | "assets" | "media" | "audio" | "graphics" | "ready";
const messages: Record<LoadingStage, string[]> = {
  connect: ["Väcker IT-avdelningen.", "Letar efter någon som kan lösenordet."],
  assets: [
    "Inventerar farligt kontorsmaterial.",
    "Fyller skrivbordslådorna med ammunition.",
    "Lägger häftapparaten utom räckhåll för HR.",
    "Dubbelkollar att kaffet är pansarbrytande.",
  ],
  media: ["Kallar in filmteamet.", "Letar efter din bästa actionvinkel."],
  audio: [
    "Ljudtest. Kollegorna slipper höra det.",
    "Stämmer motorerna till tonarten kaos.",
    "Kontrollerar att explosionerna låter mer än skrivaren.",
  ],
  graphics: [
    "Polerar piporna och dammar av pixlarna.",
    "Repetitionsspränger. Inga soffor kommer till skada.",
    "Lär skuggorna att hålla sig i bakgrunden.",
    "Kontrollerar att palmerna ser upptagna ut.",
  ],
  ready: ["Allt är redo. Kontorsfriden är det inte."],
};
export function loadingPercent(previous: number, next: number) {
  return Math.max(
    previous,
    Math.min(100, Math.max(0, Number.isFinite(next) ? next : previous)),
  );
}
/** One monotonic bar for real work; waiting on a server never invents progress. */
export class StartupLoading {
  readonly el = document.createElement("section");
  private percent = 0;
  private stage: LoadingStage = "connect";
  private joke = 0;
  private waiting = false;
  private timer: ReturnType<typeof setInterval>;
  constructor() {
    this.el.className = "game-loading startup-loading";
    this.el.setAttribute("aria-label", "Laddar Office Core");
    this.el.innerHTML = `<div class="startup-ambient" aria-hidden="true"></div><div class="startup-card"><img class="startup-logo" src="/branding/office-core-primary.webp" width="500" height="220" alt="Office Core"><div class="startup-kicker"><span class="startup-led" aria-hidden="true"></span> FÖRBEREDER DITT ARBETSPASS</div><h1>Kontoret öppnar strax.</h1><p class="startup-quip"></p><div class="startup-meter-label"><span class="startup-status" role="status" aria-live="polite"></span><strong class="startup-percent" aria-hidden="true">0<span>%</span></strong></div><div class="startup-track" role="progressbar" aria-label="Förbereder Office Core" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="startup-fill"></div></div><p class="startup-detail"></p><ol class="startup-steps" aria-label="Laddningssteg"><li>HÄMTA</li><li>LJUD</li><li>GRAFIK</li><li>KLART</li></ol><p class="startup-footnote">En liten stund i hissen. Sedan börjar kaoset.</p></div>`;
    document.body.append(this.el);
    this.update(0, "connect", "Förbereder Office Core…");
    this.timer = setInterval(() => {
      if (this.el.hidden || this.waiting) return;
      this.joke++;
      this.renderJoke();
    }, 4000);
  }
  get hidden() {
    return this.el.hidden;
  }
  set hidden(value: boolean) {
    this.el.hidden = value;
  }
  private renderJoke() {
    this.el.querySelector(".startup-quip")!.textContent = this.waiting
      ? ""
      : messages[this.stage][this.joke % messages[this.stage].length];
  }
  update(percent: number, stage: LoadingStage, status: string, detail = "") {
    this.percent = loadingPercent(this.percent, percent);
    if (stage !== this.stage) {
      this.stage = stage;
      this.joke = 0;
    }
    this.waiting = false;
    this.el.classList.remove("startup-waiting");
    this.el.querySelector(".startup-status")!.textContent = status;
    this.el.querySelector(".startup-detail")!.textContent = detail;
    this.el.querySelector(".startup-percent")!.innerHTML =
      `${Math.floor(this.percent)}<span>%</span>`;
    (this.el.querySelector(".startup-fill") as HTMLElement).style.width =
      `${this.percent}%`;
    this.el
      .querySelector(".startup-track")!
      .setAttribute("aria-valuenow", String(Math.floor(this.percent)));
    const step =
      stage === "ready"
        ? 3
        : stage === "graphics"
          ? 2
          : stage === "audio"
            ? 1
            : 0;
    this.el.querySelectorAll(".startup-steps li").forEach((el, i) => {
      el.classList.toggle("is-current", i === step);
      el.classList.toggle("is-done", i < step);
      if (i === step) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
    this.renderJoke();
  }
  serverWaiting() {
    this.update(this.percent, "connect", "Startar upp servrar...");
    this.waiting = true;
    this.el.classList.add("startup-waiting");
    this.renderJoke();
  }
  finish() {
    this.update(100, "ready", "Kontoret är redo.");
  }
  remove() {
    clearInterval(this.timer);
    this.el.remove();
  }
}
