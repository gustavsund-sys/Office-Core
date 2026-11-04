import "./installGuide.css";

type Platform = "mac" | "windows";

function showInstallGuide(platform: Platform, href: string, variant: string, source: HTMLElement, playOnline: () => void) {
  if (document.querySelector(".install-guide")) return;
  const mac = platform === "mac";
  const dialog = document.createElement("dialog");
  dialog.className = "install-guide";
  dialog.setAttribute("aria-labelledby", "install-guide-title");
  const steps = mac
    ? `<li><strong>Installera spelet</strong><p>Öppna DMG-filen och dra <b>Office Core</b> till <b>Program</b>.</p></li>
       <li><strong>Försök öppna Office Core</strong><p>Starta appen från Program. Om macOS säger att utvecklaren inte kan verifieras, stäng meddelandet.</p></li>
       <li><strong>Godkänn just den här appen</strong><p>Gå till <b>Systeminställningar → Integritet och säkerhet</b>. Om Office Core visas där, välj <b>Öppna ändå</b> och bekräfta. Gör det bara om du litar på filen du hämtat härifrån.</p></li>`
    : `<li><strong>Installera spelet</strong><p>Öppna EXE-filen och följ installationsguiden.</p></li>
       <li><strong>Om SmartScreen visar en varning</strong><p>Om SmartScreen stoppar en okänd app kan du välja <b>Mer information → Kör ändå</b>, om alternativet erbjuds och du litar på filen du hämtat härifrån.</p></li>
       <li><strong>Starta Office Core</strong><p>Öppna spelet från skrivbordet eller Start-menyn.</p></li>`;
  const note = mac
    ? ""
    : `<strong>Om det inte finns något godkännande</strong><p><b>Smart appkontroll</b>, antivirus eller datorns administratör kan stoppa installationen. Då finns inte alltid ett engångsgodkännande. Avbryt och använd webbversionen i stället.</p>`;
  dialog.innerHTML = `<div class="install-guide-header"><div><span>OFFICE CORE / INSTALLATION</span><h2 id="install-guide-title">Installera på ${mac ? "Mac" : "Windows"}</h2><p>${mac ? "Mac-testversionen är inte notariserad av Apple." : "Windows-testversionen är osignerad."} Därför kan en säkerhetsvarning visas.</p></div><button type="button" class="install-guide-close" aria-label="Stäng installationsguiden">×</button></div>
    <ol class="install-guide-steps">${steps}</ol>
    ${note ? `<aside class="install-guide-note">${note}</aside>` : ""}
    <div class="install-guide-help"><a href="${mac ? "https://support.apple.com/sv-se/102445" : "https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation"}" target="_blank" rel="noopener noreferrer">${mac ? "Apples instruktioner" : "Microsofts information"} ↗</a><span class="install-guide-variant"></span></div>
    <div class="install-guide-actions"><button type="button" class="install-guide-online">Spela i webbläsaren</button><a class="install-guide-download">Ladda ner för ${mac ? "Mac" : "Windows"} <span aria-hidden="true">↓</span></a></div><p class="install-guide-status" role="status">Nedladdningen startar när du trycker på knappen ovan.</p>`;
  dialog.querySelector(".install-guide-variant")!.textContent = variant;
  const download = dialog.querySelector<HTMLAnchorElement>(".install-guide-download")!;
  download.href = href;
  download.addEventListener("click", () => {
    dialog.querySelector(".install-guide-status")!.textContent = "Om filen inte hämtas kan du trycka på nedladdningsknappen igen. Guiden ligger kvar medan du installerar.";
  });
  const close = () => { dialog.close(); dialog.remove(); source.focus(); };
  dialog.querySelector(".install-guide-close")!.addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.querySelector(".install-guide-online")!.addEventListener("click", () => { close(); playOnline(); });
  document.body.append(dialog);
  dialog.showModal();
}

export function installDownloadGuides(root: HTMLElement, playOnline: () => void) {
  root.querySelectorAll<HTMLAnchorElement>("a[data-installer]").forEach(link => {
    link.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      showInstallGuide(link.dataset.installer as Platform, link.href, link.dataset.installVariant ?? "", link, playOnline);
    });
  });
}
