/** Pointer presses work for secondary fingers, unlike compatibility mouse clicks. */
export function bindMobilePress(el: HTMLElement, activate: (event: Event) => boolean | void) {
  let suppressClickUntil = 0;
  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    // Do not filter isPrimary: another finger may already own either stick.
    if (activate(event) === false) return;
    event.preventDefault();
    suppressClickUntil = performance.now() + 1000;
  });
  el.addEventListener("click", (event) => {
    // Ignore pointer-generated clicks; keep keyboard and assistive activation.
    if (event.detail !== 0 || (event as PointerEvent).pointerType || performance.now() < suppressClickUntil) return;
    activate(event);
  });
}
