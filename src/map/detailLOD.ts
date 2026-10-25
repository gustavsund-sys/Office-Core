import { Camera, type AbstractMesh, type Scene } from "@babylonjs/core";

export function detailVisible(
  size: number,
  distance: number,
  fov: number,
  height: number,
  previous = true,
) {
  const pixels =
    (size * Math.max(1, height)) /
    (2 * Math.max(0.1, distance) * Math.tan(fov / 2));
  return pixels >= (previous ? 2 : 3);
}

/** Only opt-in non-interactive trim. Orthographic gameplay and all hit surfaces stay intact. */
export function installOfficeDetailLOD(scene: Scene) {
  const previous = scene.customLODSelector;
  const cameras = new WeakMap<Camera, WeakMap<AbstractMesh, boolean>>();
  scene.customLODSelector = (mesh, camera) => {
    if (
      camera.mode === Camera.PERSPECTIVE_CAMERA &&
      mesh.metadata?.distanceDetail &&
      !mesh.isPickable
    ) {
      let states = cameras.get(camera);
      if (!states) cameras.set(camera, (states = new WeakMap()));
      const meta = mesh.metadata;
      if (meta.detailSize === undefined) {
        const extent = mesh.getBoundingInfo().boundingBox.extendSize;
        meta.detailSize = [extent.x * 2, extent.y * 2, extent.z * 2].sort(
          (a, b) => b - a,
        )[1];
      }
      const distance = mesh
        .getBoundingInfo()
        .boundingSphere.centerWorld.subtract(camera.globalPosition)
        .length();
      const visible = detailVisible(
        meta.detailSize,
        distance,
        camera.fov,
        scene.getEngine().getRenderHeight(),
        states.get(mesh) ?? true,
      );
      states.set(mesh, visible);
      if (!visible) return null;
    }
    return previous ? previous(mesh, camera) : mesh.getLOD(camera);
  };
}
