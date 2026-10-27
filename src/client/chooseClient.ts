export type ClientMode = "desktop" | "mobile";

/** Choice is explicit, never inferred from the window size or changed during a match. */
export async function chooseClient(): Promise<ClientMode> {
  const params = new URLSearchParams(location.search);
  const explicit = params.get("client");
  if (params.get("builder") === "1") return "desktop";
  if ((params.get("playtest") === "1") && (explicit === "desktop" || explicit === "mobile")) {
    document.documentElement.dataset.client = explicit;
    return explicit;
  }
  const style = document.createElement("style");
  style.textContent = `.client-choice{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:linear-gradient(0deg,#06111aee,#06111a44),url(/branding/office-core-lobby-wide.webp) center/cover;color:#e4eee9;font:16px system-ui;padding:24px;overflow:auto}.client-choice *{box-sizing:border-box}.client-choice article{max-width:800px;text-align:center}.client-choice img{width:min(340px,65vw);height:auto}.client-choice h1{font-size:clamp(24px,4vw,36px);margin:10px 0}.client-choice p{color:#aebfc3;line-height:1.5}.client-options{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}.client-choice button{flex:1;min-width:150px;min-height:76px;display:grid;place-items:center;gap:6px;padding:12px 20px;background:linear-gradient(140deg,#304451ee,#142430ee);border:1px solid #57717b;border-radius:14px;color:inherit;font:inherit;cursor:pointer;touch-action:manipulation}.client-choice button:hover,.client-choice button:focus-visible{border-color:#ffcc75;background:#244450;outline:2px solid #ffcc75}.client-choice svg{width:28px;height:28px;stroke:#ffcc75;fill:none;stroke-width:1.5}.client-choice strong{font-size:18px}.client-choice small{color:#b6c7ca}`;
  document.head.append(style);
  const screen = document.createElement("section");
  screen.className = "client-choice";
  screen.setAttribute("aria-label", "Välj spelversion");
  screen.innerHTML = `<article><h1>STARTA OFFICE CORE</h1><p>Samma kontor. Samma strid. Välj din styrning.</p><div class="client-options"><button data-client="desktop"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="5" width="40" height="28" rx="3"/><path d="M24 33v9M15 42h18"/></svg><strong>Dator</strong><small>Tangentbord och mus</small></button><button data-client="mobile"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="11" width="40" height="26" rx="5"/><circle cx="12" cy="24" r="3"/><path d="M34 20v8M30 24h8"/></svg><strong>Mobil</strong><small>Pekstyrning och anpassad spelvy</small></button></div></article>`;
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
  style.remove();
  return choice;
}
