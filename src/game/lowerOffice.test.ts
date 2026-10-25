import { ROOF_FINISH_Y } from "../map/surfaceHeights";
import {
  officePortalProjection,
  LOWER_OFFICE_LAYER,
  PORTAL_SURFACE_Y,
} from "../map/officePortal";
import { deskAssembly } from "../map/deskAssembly";
import { OBJECTS } from "../maps/layout";
import test from "node:test";
import assert from "node:assert/strict";
import {
  Camera,
  FreeCamera,
  NullEngine,
  Scene,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Matrix,
} from "@babylonjs/core";
import { cutFloorOpenings } from "../map/floorSurfaces";
import {
  OFFICE_WINDOWS,
  LOWER_OFFICE_Y,
  buildLowerOffices,
} from "../map/lowerOffice";
import { office01 } from "../maps/office01";
import { World } from "../map/builder";

test("glass openings occupy the two dead pockets without removing walkable map or leaving opaque slab beneath glass", () => {
  const intersects = (
    a: { x: number; z: number; w: number; d: number },
    b: typeof a,
  ) =>
    Math.min(a.x + a.w / 2, b.x + b.w / 2) -
      Math.max(a.x - a.w / 2, b.x - b.w / 2) >
      1e-8 &&
    Math.min(a.z + a.d / 2, b.z + b.d / 2) -
      Math.max(a.z - a.d / 2, b.z - b.d / 2) >
      1e-8;
  const slab = {
    x: 0,
    z: office01.centerZ,
    w: office01.width + 1,
    d: office01.depth + 1,
  };
  const pieces = cutFloorOpenings([slab], OFFICE_WINDOWS);
  for (const opening of OFFICE_WINDOWS) {
    assert.ok(!office01.footprint.some((r) => intersects(r, opening)));
    assert.ok(!pieces.some((r) => intersects(r, opening)));
  }
  assert.ok(
    Math.abs(
      pieces.reduce((sum, r) => sum + r.w * r.d, 0) -
        (slab.w * slab.d -
          OFFICE_WINDOWS.reduce((sum, r) => sum + r.w * r.d, 0)),
    ) < 1e-6,
  );
});

test("lower offices are one storey below, non-interactive and add no dynamic lights or gameplay obstacles", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), scene);
    const world = new World(scene, new ShadowGenerator(32, sun));
    const lights = scene.lights.length;
    buildLowerOffices(world);
    assert.equal(scene.lights.length, lights);
    assert.equal(world.obstacles.length, 0);
    assert.equal(world.solids.length, 0);
    assert.equal(world.destructibles.length, 0);
    const offices = scene.meshes.filter((m) => m.metadata?.lowerOffice);
    assert.ok(offices.length > 10 && offices.length < 90);
    for (const m of offices) {
      m.computeWorldMatrix(true);
      assert.equal(m.isPickable, false);
      assert.ok(m.getBoundingInfo().boundingBox.maximumWorld.y < -0.5);
    }
    assert.ok(LOWER_OFFICE_Y <= -5);
    const glass = scene.meshes.filter((m) => m.name === "office viewing glass");
    const camera = new FreeCamera(
      "walking camera",
      new Vector3(-30, 23, -35.5),
      scene,
    );
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    camera.orthoLeft = -18;
    camera.orthoRight = 18;
    camera.orthoTop = 10;
    camera.orthoBottom = -10;
    camera.setTarget(new Vector3(-30, 0, -22.5));
    scene.onBeforeRenderObservable.notifyObservers(scene);
    const roots = scene.transformNodes.filter(
      (n) => n.name === "lower office · visual only",
    );
    camera.position.x += 8;
    camera.setTarget(new Vector3(-22, 0, -22.5));
    scene.activeCamera = camera;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.ok(
      roots.every((root) => root.position.equals(Vector3.Zero())),
      "office geometry never moves to imitate parallax",
    );
    assert.ok(
      offices.every(
        (mesh) =>
          mesh.layerMask === LOWER_OFFICE_LAYER &&
          !(mesh.layerMask & camera.layerMask),
      ),
      "main camera cannot render an orthographic duplicate",
    );
    const portals = scene.textures.filter(
      (t) => t.name === "lower office perspective view",
    );
    assert.equal(portals.length, OFFICE_WINDOWS.length);
    assert.ok(
      scene.customRenderTargets.length >= 1 &&
        scene.customRenderTargets.length <= 2,
      "only nearby rooms render",
    );
    camera.position.x = 10000;
    camera.setTarget(new Vector3(10000, 0, -22.5));
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(
      scene.customRenderTargets.length,
      0,
      "offscreen rooms consume no rendering pass",
    );

    assert.equal(glass.length, OFFICE_WINDOWS.length);
    assert.ok(glass.every((m) => !m.isPickable && m.material!.alpha < 0.25));
    for (const pane of glass) {
      pane.computeWorldMatrix(true);
      assert.ok(
        Math.abs(
          pane.getBoundingInfo().boundingBox.maximumWorld.y - ROOF_FINISH_Y,
        ) < 1e-5,
      );
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("off-axis glass perspective anchors all four corners and naturally shrinks distant desks on WebGL and WebGPU", () => {
  const opening = OFFICE_WINDOWS[0];
  for (const halfZ of [false, true])
    for (const dx of [-7, 0, 9]) {
      const eye = new Vector3(opening.x + dx, 23, opening.z - 13);
      const view = Matrix.LookAtLH(
        eye,
        eye.add(new Vector3(0, -1, 0)),
        Vector3.Forward(),
      );
      const transform = view.multiply(
        officePortalProjection(eye, opening, halfZ),
      );
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const projected = Vector3.TransformCoordinates(
            new Vector3(
              opening.x + (sx * opening.w) / 2,
              PORTAL_SURFACE_Y,
              opening.z + (sz * opening.d) / 2,
            ),
            transform,
          );
          assert.ok(Math.abs(projected.x - sx) < 1e-5);
          assert.ok(Math.abs(projected.y - sz) < 1e-5);
        }
      const width = (y: number) => {
        const a = Vector3.TransformCoordinates(
          new Vector3(opening.x - 1, y, opening.z),
          transform,
        );
        const b = Vector3.TransformCoordinates(
          new Vector3(opening.x + 1, y, opening.z),
          transform,
        );
        return b.x - a.x;
      };
      assert.ok(
        width(LOWER_OFFICE_Y) < width(PORTAL_SURFACE_Y) * 0.85,
        "same-sized desk becomes smaller at depth",
      );
    }
});

test("both floors use the shared desk assembly at the real upper-floor dimensions", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    const sun = new DirectionalLight("sun", Vector3.Down(), scene);
    const world = new World(scene, new ShadowGenerator(32, sun));
    const desk = deskAssembly(world, 0, 0, undefined, undefined, false)[0];
    const size = desk.getBoundingInfo().boundingBox.extendSize.scale(2);
    assert.equal(size.x, OBJECTS.desk[1]);
    assert.equal(size.z, OBJECTS.desk[2]);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("office glass ends before the foreground wall and the extra opening uses a different room", () => {
  const offices = OFFICE_WINDOWS.filter((r) => r.theme === "office");
  assert.equal(offices.length, 2);
  assert.ok(
    offices.every((r) => r.z - r.d / 2 > -27),
    "glass stays behind the foreground wall's projected edge",
  );
  assert.equal(OFFICE_WINDOWS.filter((r) => r.theme === "meeting").length, 1);
});
