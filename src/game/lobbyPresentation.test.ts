import test from "node:test";
import assert from "node:assert/strict";
import { presentMatch } from "./matchPresentation";
import { setPaused } from "./interfaceSession";

test("online lobby keeps waiting labels stable across snapshots and pause events", () => {
  const previousDocument = globalThis.document;
  let writes = 0;
  const play = {
    disabled: false, value: "",
    get textContent() { return this.value; },
    set textContent(value: string) { writes++; this.value = value; },
    get innerHTML() { return this.value; },
    set innerHTML(value: string) { writes++; this.value = value; },
  };
  const node = { textContent: "", style: { display: "" }, disabled: false };
  let textWrites = 0;
  const nodes = new Map<string, { textContent: string }>();
  const el = { hidden: true, disabled: false, querySelector: (selector: string) => {
    if (!nodes.has(selector)) {
      let text = "";
      nodes.set(selector, {
        get textContent() { return text; },
        set textContent(value: string) { textWrites++; text = value; },
      });
    }
    return nodes.get(selector)!;
  } };
  globalThis.document = {
    querySelector: (selector: string) => selector === "#play" ? play : node,
    body: { classList: { toggle() {} } },
  } as any;
  const own = { id: "host", name: "Host", team: "RED", hp: 100, loadout: {} };
  const snapshot = { players: [own], owner: "host", started: false };
  const context = {
    hud: { el, toast() {} }, lobby: { el, update() {} },
    input: { active: false, locked: false, clear() {} },
    loadout: { el }, match: { started: false, members: [] }, paused: false,
    multiplayer: { room: {}, snapshot },
    player: { root: { position: {} } }, disarmAudio: { pause() {} },
    updateLobbyMusic() {},
    setPaused(value: boolean) { setPaused.call(this as any, value); },
  };
  try {
    for (const [players, owner, expected] of [
      [[own], "host", "VÄNTAR PÅ ETT ANNAT LAG"],
      [[own, { ...own, id: "ally" }], "host", "VÄNTAR PÅ ETT ANNAT LAG"],
      [[own, { ...own, id: "enemy", team: "BLUE" }], "host", "STARTA MATCH"],
      [[own], "other-host", "VÄNTAR PÅ VÄRDEN"],
    ] as const) {
      snapshot.players = [...players] as any; snapshot.owner = owner;
      presentMatch.call(context as any, snapshot as any, own as any);
      assert.equal(play.textContent, expected);
      const initialWrites = writes;
      const initialTextWrites = textWrites;
      for (let i = 0; i < 30; i++) {
        context.setPaused(true);
        presentMatch.call(context as any, snapshot as any, own as any);
      }
      assert.equal(play.textContent, expected);
      assert.equal(writes, initialWrites, "unchanged lobby must not rewrite the start button");
      assert.equal(textWrites, initialTextWrites, "unchanged snapshots must not replace lobby and HUD text nodes");
    }
  } finally { globalThis.document = previousDocument; }
});
