import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NullEngine,
  Scene,
  Mesh,
  MeshBuilder,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { World } from "../map/builder";
import { finishStaticModel, cachedStaticModel } from "../weapons/staticModel";
import { heldWeapon } from "../weapons/models";
import { syncOnlineVisuals } from "./onlineSimulation";
import type { Snapshot } from "../../shared/protocol";
import { updateBombCountdowns } from "../ui/bombCountdowns";

test("rigid parts preserve bounds and materials while sharing geometry across independent copies", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const light = new DirectionalLight("sun", Vector3.Down(), scene);
  const world = new World(scene, new ShadowGenerator(64, light));
  try {
    const root = new Mesh("test rigid model", scene);
    for (let i = 0; i < 3; i++) {
      const part = MeshBuilder.CreateBox(`part ${i}`, { size: 1 }, scene);
      part.parent = root;
      part.position.x = i * 2;
      part.isPickable = false;
      part.material = world.mat(i === 2 ? "#ff0000" : "#00ff00");
    }
    finishStaticModel(world, "test", root);
    const parts = root.getChildMeshes() as Mesh[];
    assert.equal(parts.length, 2);
    assert.equal(new Set(parts.map((p) => p.material)).size, 2);
    assert.ok(parts.every((p) => !p.isPickable));
    const green = parts.find((p) => p.getTotalVertices() === 48)!;
    green.computeWorldMatrix(true);
    assert.equal(green.getBoundingInfo().boundingBox.minimumWorld.x, -0.5);
    assert.equal(green.getBoundingInfo().boundingBox.maximumWorld.x, 2.5);
    const copy = cachedStaticModel(world, "test")!;
    assert.ok(copy.isEnabled());
    const copyGreen = (copy.getChildMeshes() as Mesh[]).find(
      (p) => p.getTotalVertices() === 48,
    )!;
    assert.equal(copyGreen.geometry, green.geometry);
    root.dispose();
    copy.position.x = 10;
    copyGreen.computeWorldMatrix(true);
    assert.equal(copyGreen.getBoundingInfo().boundingBox.minimumWorld.x, 9.5);
    assert.ok(!copyGreen.isDisposed());
    assert.ok(cachedStaticModel(world, "test")?.isEnabled());
    const rifle = heldWeapon(world, "huntingRifle");
    assert.equal(
      rifle.getChildMeshes().length,
      new Set(rifle.getChildMeshes().map((p) => p.material)).size,
    );
    assert.ok(rifle.getChildMeshes().length < 40);
    const rifleCopy = heldWeapon(world, "huntingRifle");
    assert.equal(
      rifle.getChildMeshes()[0].geometry,
      rifleCopy.getChildMeshes()[0].geometry,
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("network visual state syncs once per packet while animations render every frame", () => {
  let syncs = 0,
    renders = 0,
    medkits = 0;
  const game = {
    onlinePlayers: new Map(),
    pickup: {
      beacons: {
        sync: () => {
          syncs++;
          renders++;
        },
        render: () => renders++,
      },
      pulseTraps: {
        sync: () => {
          syncs++;
          renders++;
        },
        render: () => renders++,
        syncMedkits: () => medkits++,
      },
    },
  } as unknown as Parameters<typeof syncOnlineVisuals>[0];
  const snapshot = {
    players: [],
    bombs: [],
    rockets: [{ id: 1, x: 2, y: 1, z: 3 }],
    pickups: [],
    cores: [],
  } as unknown as Snapshot;
  const first = syncOnlineVisuals(game, snapshot, 1 / 60);
  for (let i = 0; i < 4; i++) {
    const next = syncOnlineVisuals(game, snapshot, 1 / 60);
    assert.equal(next.visuals, first.visuals);
    assert.equal(
      next.visuals.objects[0].target,
      first.visuals.objects[0].target,
    );
    assert.equal(next.newVisualFrame, false);
  }
  assert.equal(syncs, 2);
  assert.equal(medkits, 1);
  assert.equal(renders, 10);
  const next = syncOnlineVisuals(game, { ...snapshot, rockets: [] }, 1 / 60);
  assert.equal(next.newVisualFrame, true);
  assert.equal(next.visuals.objects.length, 0);
  assert.equal(syncs, 4);
  assert.equal(medkits, 2);
});

test("bomb HUD reuses nodes through countdowns, multiple bombs and removal", () => {
  const previous = globalThis.document;
  let allocations = 0;
  class Element {
    children: Element[] = [];
    parent?: Element;
    textContent = "";
    value = 0;
    hidden = false;
    setAttribute() {}
    append(...children: Element[]) {
      for (const c of children) {
        c.parent = this;
        this.children.push(c);
      }
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((c) => c !== this);
    }
  }
  globalThis.document = {
    createElement: () => {
      allocations++;
      return new Element();
    },
  } as unknown as Document;
  try {
    const panel = new Element() as unknown as HTMLElement;
    updateBombCountdowns(panel, [{ timer: 25 }]);
    const row = (panel as unknown as Element).children[0];
    updateBombCountdowns(panel, [{ timer: 24.9 }]);
    assert.equal((panel as unknown as Element).children[0], row);
    assert.equal(allocations, 4);
    assert.equal(row.children[1].textContent, "24.9s");
    assert.equal(row.children[2].value, 24.9);
    updateBombCountdowns(panel, [{ timer: 10 }, { timer: 5 }]);
    assert.equal(row.children[0].textContent, "CORE BUSTER 1");
    updateBombCountdowns(panel, [{ timer: 4 }]);
    assert.equal((panel as unknown as Element).children.length, 1);
    assert.equal(row.children[0].textContent, "CORE BUSTER");
    updateBombCountdowns(panel, []);
    assert.equal(panel.hidden, true);
    assert.equal((panel as unknown as Element).children.length, 0);
  } finally {
    globalThis.document = previous;
  }
});
