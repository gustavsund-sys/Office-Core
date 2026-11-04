export type ControlScheme = "classic" | "aim";
function key() {
  return typeof document !== "undefined" &&
    document.documentElement.dataset.client === "mobile"
    ? "office-wars-controls.mobile"
    : "office-wars-controls";
}
export function readControlScheme(): ControlScheme {
  try {
    return localStorage.getItem(key()) === "aim" ? "aim" : "classic";
  } catch {
    return "classic";
  }
}
export function saveControlScheme(scheme: ControlScheme) {
  try {
    localStorage.setItem(key(), scheme);
  } catch {
    /* Session only. */
  }
}
