declare global {
  interface Window {
    officeCoreDesktop?: { quit(): void };
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
