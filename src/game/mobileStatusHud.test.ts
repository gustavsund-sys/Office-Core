import test from "node:test";
import assert from "node:assert/strict";
import { mountMobileStatus } from "../mobile/statusHud";

class Element {
  id = ""; className = ""; hidden = false;
  children: Element[] = [];
  parentElement?: Element;
  setAttribute() {}
  append(child: Element) {
    if (child.parentElement) child.parentElement.children = child.parentElement.children.filter((node) => node !== child);
    child.parentElement = this;
    this.children.push(child);
  }
  matches(selectors: string) {
    return selectors.split(",").some((selector) => selector.startsWith("#") ? this.id === selector.slice(1) : this.className === selector.slice(1));
  }
  querySelector(selector: string): Element | undefined {
    for (const node of this.children) {
      if (node.matches(selector)) return node;
      const nested = node.querySelector(selector);
      if (nested) return nested;
    }
  }
}
class Observer {
  static current: Observer;
  disconnected = false;
  constructor(readonly callback: (records: { addedNodes: Element[] }[]) => void) { Observer.current = this; }
  observe(_target: unknown, options: unknown) { assert.deepEqual(options, { childList: true }); }
  disconnect() { this.disconnected = true; }
}

test("mobile status dock preserves scoped HUD references, includes lazy panels and leaves controls untouched", () => {
  const old = { document: globalThis.document, HTMLElement: globalThis.HTMLElement, MutationObserver: globalThis.MutationObserver };
  Object.assign(globalThis, { document: { createElement: () => new Element() }, HTMLElement: Element, MutationObserver: Observer });
  try {
    const ui = new Element();
    const add = (id: string, parent = ui) => { const node = new Element(); node.id = id; parent.append(node); return node; };
    const engagement = add("engagement-ui"), crisis = add("core-crisis", engagement), hit = add("hit-confirm", engagement);
    const toast = add("toast"), warning = add("warning"), warcry = add("warcry"), footer = add("footer");
    const mounted = mountMobileStatus(ui as unknown as HTMLElement);
    const dock = mounted.el as unknown as Element;
    assert.equal(dock.hidden, true);
    assert.equal(engagement.parentElement, dock);
    assert.equal(engagement.querySelector("#core-crisis"), crisis);
    assert.equal(engagement.querySelector("#hit-confirm"), hit);
    assert.equal(ui.querySelector("#toast"), toast);
    assert.equal(toast.parentElement, dock);
    assert.equal(warning.parentElement, dock);
    assert.equal(warcry.parentElement, ui);
    assert.equal(footer.parentElement, ui);
    const bombs = add("buster-countdowns");
    Observer.current.callback([{ addedNodes: [bombs] }]);
    assert.equal(bombs.parentElement, dock);
    Observer.current.callback([{ addedNodes: [bombs] }]);
    assert.equal(dock.children.filter((node) => node === bombs).length, 1);
    const unrelated = add("inventory-update");
    Observer.current.callback([{ addedNodes: [unrelated] }]);
    assert.equal(unrelated.parentElement, ui);
    mounted.dispose();
    assert.equal(Observer.current.disconnected, true);
  } finally { Object.assign(globalThis, old); }
});
