declare global {
  interface Window {
    officeCoreDesktop?: {
      quit(): void;
      setResolution?(
        height: 720 | 1080 | 1440,
      ): Promise<{ ok: boolean; error?: string }>;
    };
  }
}

export function installDesktopExit() {
  const desktop = window.officeCoreDesktop;
  if (!desktop) return;
  const card = document.querySelector<HTMLElement>(".pause-card");
  if (!card || card.querySelector(".desktop-exit")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "desktop-exit";
  button.textContent = "AVSLUTA SPELET";
  button.addEventListener("click", () => desktop.quit());
  card.append(button);
}
