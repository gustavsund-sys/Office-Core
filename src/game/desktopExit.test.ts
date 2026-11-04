import test from "node:test";
import assert from "node:assert/strict";
import { installDesktopExit } from "../client/desktop";

test("exit button exists only in the native client and uses the native quit action", () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  let button: any, quitCount = 0;
  const card = { querySelector: () => button, append: (value: any) => { button = value; } };
  globalThis.window = {} as any;
  globalThis.document = {
    querySelector: () => card,
    createElement: () => ({ addEventListener(_event: string, listener: () => void) { this.click = listener; } }),
  } as any;
  try {
    installDesktopExit();
    assert.equal(button, undefined, "normal desktop browsers must not get an app quit button");
    window.officeCoreDesktop = { quit() { quitCount++; } };
    installDesktopExit();
    assert.equal(button.textContent, "AVSLUTA SPELET");
    const originalButton = button;
    installDesktopExit();
    assert.equal(button, originalButton);
    button.click();
    assert.equal(quitCount, 1);
  } finally { globalThis.window = oldWindow; globalThis.document = oldDocument; }
});
