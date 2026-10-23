import test from "node:test";
import assert from "node:assert/strict";
import { LookoutEntryFilm } from "./lookoutEntryFilm";

test("unconfigured film never blocks entry", () => {
  const film = new LookoutEntryFilm("");
  assert.equal(
    film.play(true, () => assert.fail("not playing")),
    false,
  );
  assert.equal(film.active, false);
});

test("end, skip and errors resume once; cancellation and stale events never resume a different entry", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const elements: any[] = [];
  let key: ((e: any) => void) | undefined;
  const element = () => {
    const el: any = {
      className: "",
      children: [],
      setAttribute() {},
      removeAttribute() {},
      append(...children: any[]) {
        this.children.push(...children);
      },
      remove() {},
      focus() {},
      pause() {},
      load() {},
      play: () => Promise.resolve(),
    };
    elements.push(el);
    return el;
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement: element,
      pointerLockElement: null,
      body: { append() {} },
      addEventListener(_name: string, handler: any) {
        key = handler;
      },
      removeEventListener() {
        key = undefined;
      },
    },
  });
  const film = new LookoutEntryFilm("/test-entry.mp4");
  let resumed = 0;
  try {
    film.play(true, () => resumed++);
    const staleEnd = elements[1].onended;
    staleEnd();
    staleEnd();
    assert.equal(resumed, 1);
    assert.equal(film.active, false);
    film.play(false, () => resumed++);
    assert.equal(elements[4].muted, true);
    staleEnd();
    assert.equal(film.active, true);
    assert.equal(resumed, 1);
    elements[5].onclick();
    assert.equal(resumed, 2);
    film.play(true, () => resumed++);
    key!({ code: "Space", preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(resumed, 3);
    film.play(true, () => resumed++);
    elements[10].onerror();
    assert.equal(resumed, 4);
    film.play(true, () => resumed++);
    film.cancel();
    assert.equal(resumed, 4);
    assert.equal(film.active, false);
    await Promise.resolve();
  } finally {
    film.cancel();
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
