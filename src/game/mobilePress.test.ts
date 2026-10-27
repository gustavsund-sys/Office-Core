import test from "node:test";
import assert from "node:assert/strict";
import { bindMobilePress } from "../mobile/press";

function pointer(type: string, id: number, button = 0) {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId: id, pointerType: "touch", isPrimary: id === 1, button,
  });
}
test("secondary fingers activate buttons while movement and aim pointers stay held", () => {
  const button = new EventTarget();
  let presses = 0;
  const held = new Set([1, 2]);
  bindMobilePress(button as HTMLElement, () => { presses++; });
  const down = pointer("pointerdown", 3);
  button.dispatchEvent(down);
  assert.equal(presses, 1);
  assert.equal(down.defaultPrevented, true);
  assert.deepEqual([...held], [1, 2]);
  button.dispatchEvent(pointer("pointerup", 3));
  button.dispatchEvent(Object.assign(new Event("click"), { detail: 1 }));
  button.dispatchEvent(Object.assign(new Event("click"), { detail: 0 }));
  assert.equal(presses, 1, "release and compatibility clicks never repeat an action");
  button.dispatchEvent(pointer("pointerdown", 4));
  assert.equal(presses, 2);
});
test("delegation leaves unrelated menu touches alone and retains keyboard activation", () => {
  const root = new EventTarget();
  let accepted = false, presses = 0;
  bindMobilePress(root as HTMLElement, () => {
    if (!accepted) return false;
    presses++;
  });
  const unrelated = pointer("pointerdown", 2);
  root.dispatchEvent(unrelated);
  assert.equal(unrelated.defaultPrevented, false);
  accepted = true;
  root.dispatchEvent(Object.assign(new Event("click"), { detail: 0 }));
  assert.equal(presses, 1);
  root.dispatchEvent(pointer("pointerdown", 3, 2));
  assert.equal(presses, 1, "secondary mouse buttons are ignored");
});
