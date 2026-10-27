const DOCKED = "#warning,#toast,#buster-countdowns,#disarm-progress,#engagement-ui,.boss-lookout-prompt";

/** Move existing nodes intact: shared HUD queries and event listeners keep working.
 * Observe only direct HUD children for panels created lazily, not per-frame text changes.
 * Engagement's whole wrapper stays together because it owns scoped child queries.
 */
export function mountMobileStatus(ui: HTMLElement) {
  const dock = document.createElement("aside");
  dock.id = "mobile-status-dock";
  dock.setAttribute("aria-label", "Matchinformation");
  dock.hidden = true;
  ui.append(dock);
  const move = (node: HTMLElement) => {
    if (node.matches(DOCKED) && node.parentElement !== dock) dock.append(node);
  };
  for (const node of Array.from(ui.children)) if (node instanceof HTMLElement) move(node);
  const observer = new MutationObserver((changes) => {
    for (const change of changes) for (const node of Array.from(change.addedNodes))
      if (node instanceof HTMLElement) move(node);
  });
  observer.observe(ui, { childList: true });
  return { el: dock, dispose: () => observer.disconnect() };
}
