import { headerArtwork } from "../ui/headerArtwork";
import { installDownloadGuides } from "./installGuide";
import "./launcher.css";
import { DESKTOP_DOWNLOADS } from "./downloads";

export type ClientMode = "desktop" | "mobile";

/** Native apps always use desktop controls; browsers choose explicitly. */
export async function chooseClient(): Promise<ClientMode> {
  if (window.officeCoreDesktop) {
    document.documentElement.dataset.client = "desktop";
    const url = new URL(location.href);
    url.searchParams.set("client", "desktop");
    history.replaceState(null, "", url);
    return "desktop";
  }
  const params = new URLSearchParams(location.search);
  const explicit = params.get("client");
  if (params.get("builder") === "1") return "desktop";
  if (explicit === "desktop" || explicit === "mobile") {
    document.documentElement.dataset.client = explicit;
    return explicit;
  }
  const screen = document.createElement("section");
  screen.className = "client-choice";
  screen.setAttribute("aria-label", "Välkommen till Office Core");
  const downloadIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>`;
  screen.innerHTML = `<div class="launcher-shell">
    <header class="launcher-top"><a class="launcher-brand" href="/" aria-label="Office Core startsida"><span class="launcher-mark">◆</span> OFFICE CORE</a><span class="launcher-alpha"><i></i> MULTIPLAYER · BETA 0.2b</span></header>
    <main class="launcher-main">
      <section class="launcher-world" aria-label="Om spelet">
        <div class="launcher-art"><img src="${headerArtwork}" alt="Röda och blå kontorskrigare gör sig redo för Office Core" width="2172" height="724" fetchpriority="high"><span class="launcher-art-tag"><i></i> HEADQUARTERS / OFFICE01</span></div>
        <div class="launcher-story"><span class="launcher-eyebrow">DAGENS AGENDA: TOTALT KAOS</span><h1>En arbetsplats.<br><em>Två sidor.</em> Ditt krig.</h1><p>Samla laget, skydda er Core och ta över kontoret. Vardagen kan vänta.</p><div class="launcher-facts"><span><b>02</b> LAG</span><span><b>08</b> SPELARE</span><span><b>03</b> VINSTER FÖR SEGER</span></div></div>
      </section>
      <section class="launcher-play" aria-labelledby="launcher-title"><span class="launcher-eyebrow">DAGS ATT STÄMPLA IN</span><h2 id="launcher-title">Kontoret kallar.</h2><p class="launcher-lead">Installera Office Core på din dator.<br>Välj din plattform och kliv in i matchen.</p>
        <div class="launcher-downloads">
          <a class="launcher-download launcher-windows" data-installer="windows" data-install-variant="Windows 10 / 11 · 64-bit" href="${DESKTOP_DOWNLOADS.windows}"><span class="launcher-platform-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 4 9-1v8H2zm11-1 9-1v9h-9zM2 13h9v8l-9-1zm11 0h9v9l-9-1z"/></svg></span><span><strong>Ladda ner för Windows</strong><small>Windows 10 / 11 · 64-bit · EXE</small></span>${downloadIcon}</a>
          <a class="launcher-download launcher-mac" data-installer="mac" data-install-variant="Mac · Apple Silicon" href="${DESKTOP_DOWNLOADS.mac}"><span class="launcher-platform-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M9 21h6m-3-5v5"/></svg></span><span><strong>Ladda ner för Mac</strong><small>Apple Silicon · M1 eller senare · DMG</small></span>${downloadIcon}</a>
          <a class="launcher-intel" data-installer="mac" data-install-variant="Mac · Intel" href="${DESKTOP_DOWNLOADS.macIntel}">Har du en Mac med Intel? <span>Ladda ner Intel-versionen ↗</span></a>
        </div>
        <p class="launcher-download-note">Gratis att spela <span>·</span> Internetanslutning krävs</p>
        <div class="launcher-divider"><span>ELLER HOPPA IN DIREKT</span></div>
        <div class="launcher-alternatives"><button type="button" data-client="desktop"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18"/></svg><span><strong>Spela online</strong><small>Direkt i webbläsaren</small></span><b>↗</b></button><button type="button" data-client="mobile"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></svg><span><strong>Spela på mobil</strong><small>Anpassat för pekskärm</small></span><b>↗</b></button></div>
        <div class="launcher-shared"><span>◆</span><p>Samma kontor. Samma match.<br><strong>Spela tillsammans på alla plattformar.</strong></p></div>
      </section>
    </main>
    <footer class="launcher-footer"><span>OFFICE CORE <i>/</i> FIRST TO THREE</span><span>Inga möten. Bara matcher.</span></footer>
  </div>`;
  installDownloadGuides(screen, () => {
    screen.querySelector<HTMLButtonElement>('[data-client="desktop"]')!.click();
  });
  document.body.append(screen);
  const choice = await new Promise<ClientMode>((resolve) => {
    screen
      .querySelectorAll<HTMLButtonElement>("[data-client]")
      .forEach((button) => {
        button.onclick = () => resolve(button.dataset.client as ClientMode);
      });
  });
  const url = new URL(location.href);
  url.searchParams.set("client", choice);
  history.replaceState(null, "", url);
  document.documentElement.dataset.client = choice;
  screen.remove();
  return choice;
}
