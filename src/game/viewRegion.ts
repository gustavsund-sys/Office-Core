import {
  Frustum,
  type Camera,
  type Plane,
  type Vector3,
} from "@babylonjs/core";

/** Conservative world-space margin: objects remain active before entering view. */
export function nearView(
  planes: readonly Plane[],
  center: Vector3,
  radius: number,
  margin: number,
) {
  return planes.every(
    (plane) => plane.dotCoordinate(center) >= -(radius + margin),
  );
}
export function viewPlanes(camera: Camera) {
  camera.getViewMatrix();
  camera.getProjectionMatrix();
  return Frustum.GetPlanes(camera.getTransformationMatrix());
}
