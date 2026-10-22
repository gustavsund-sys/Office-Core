type Row = {
  root: HTMLElement;
  label: HTMLElement;
  counter: HTMLElement;
  bar: HTMLProgressElement;
};
const rows = new WeakMap<HTMLElement, Row[]>();

/** Keep DOM nodes stable while timers tick or a bomb is replaced. */
export function updateBombCountdowns(
  panel: HTMLElement,
  charges: readonly { timer: number; label?: string }[],
) {
  let list = rows.get(panel);
  if (!list) rows.set(panel, (list = []));
  while (list.length > charges.length) list.pop()!.root.remove();
  while (list.length < charges.length) {
    const root = document.createElement("div");
    root.className = "buster-countdown";
    const label = document.createElement("span");
    const counter = document.createElement("strong");
    const bar = document.createElement("progress");
    bar.max = 25;
    bar.setAttribute("aria-label", "Core buster countdown");
    root.append(label, counter, bar);
    panel.append(root);
    list.push({ root, label, counter, bar });
  }
  panel.hidden = charges.length === 0;
  for (let i = 0; i < charges.length; i++) {
    const row = list[i],
      remaining = Math.max(0, charges[i].timer);
    const label =
      charges[i].label ?? `CORE BUSTER${charges.length > 1 ? ` ${i + 1}` : ""}`;
    const text = `${remaining.toFixed(1)}s`;
    if (row.label.textContent !== label) row.label.textContent = label;
    if (row.counter.textContent !== text) row.counter.textContent = text;
    row.bar.value = remaining;
  }
}
