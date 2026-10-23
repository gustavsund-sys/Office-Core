/** Menu-only news; native dialog provides focus containment and Escape support. */
export function installWhatsNew(menu: Element) {
  const open = document.createElement("button");
  open.className = "open-whats-new";
  open.textContent = "What's new";
  open.type = "button";
  const dialog = document.createElement("dialog");
  dialog.className = "whats-new";
  dialog.setAttribute("aria-labelledby", "whats-new-title");
  dialog.innerHTML = `
    <div class="whats-new-heading"><div><span>OFFICE CORE · FIELD UPDATE</span><h1 id="whats-new-title">WHAT’S NEW</h1><p>Nya möjligheter. Nya sätt att ta kontroll över kontoret.</p></div><button class="whats-new-close" type="button" aria-label="Stäng What's new">×</button></div>
    <div class="whats-new-cards">
      <article class="news-feature news-boss"><div class="news-art"><img src="/updates/boss-lookout.jpg" alt="Spelaren vid Boss Lookouts stationära kulspruta" width="1100" height="619"><span class="news-tag">10 ENEMY KILLS → BOSS KEY</span></div><div class="news-copy"><div class="news-title"><img src="/ui/equipment/bossKey.svg" alt="" width="56" height="56"><div><small>EARN YOUR ADVANTAGE</small><h2>Boss Key & Lookout</h2></div></div><p>Få <strong>10 fiendekills</strong> och lås upp en personlig Boss Key direkt i inventoryn. Rundvinster och egna lagkamrater ger ingen nyckel.</p><ul><li><kbd>E</kbd> vid <strong>ditt lags hiss</strong> tar dig till Lookout. En spelare åt gången.</li><li>Du får <strong>100 personliga turret-skott</strong>. <kbd>B</kbd> för Bail sparar nyckeln och kvarvarande skott.</li><li><strong>Dör du eller skjuter slut på skotten förloras nyckeln.</strong> Skaffa 10 nya fiendekills för nästa.</li></ul></div></article>
      <article class="news-feature news-rifle"><div class="news-art"><img src="/loadout/huntingRifle.webp" alt="Office Core-spelaren med Hunting Rifle" width="960" height="640"><span class="news-tag">PRECISION · LONG RANGE</span></div><div class="news-copy"><div class="news-title"><img src="/ui/equipment/huntingRifle.png" alt="" width="78" height="56"><div><small>MAKE EVERY SHOT COUNT</small><h2>Hunting Rifle</h2></div></div><p>Tunga skott, lång räckvidd och ett riktigt <strong>kikarsikte i första person</strong>.</p><ul><li><kbd>HÖGER MUSKNAPP</kbd> växlar in och ut ur kikarsiktet. Musen styr siktet.</li><li><strong>100 skada</strong> per träff, <strong>10 skott</strong> i magasinet och <strong>8 sekunder</strong> för att ladda nästa skott.</li><li>Kraftig rekyl knuffar dig bakåt. Välj position och sikta noggrant.</li></ul></div></article>
    </div><footer class="whats-new-footer"><span>Håll utkik efter nya uppdateringar här i menyn.</span><button class="whats-new-done" type="button">UPPFATTAT · TILL MENYN →</button></footer>`;
  const show = () => { if (!dialog.open) dialog.showModal(); };
  const close = () => { dialog.close(); open.focus(); };
  dialog.querySelector(".whats-new-close")!.addEventListener("click", close);
  dialog.querySelector(".whats-new-done")!.addEventListener("click", close);
  dialog.addEventListener("keydown", event => event.stopPropagation());
  open.onclick = show;
  menu.append(open);
  document.body.append(dialog);
  show();
}
