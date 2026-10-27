import { ROOF_FINISH_Y } from "./surfaceHeights";
import {
  Color3,
  Color4,
  FreeCamera,
  GlowLayer,
  Matrix,
  Mesh,
  MeshBuilder,
  RenderTargetTexture,
  Scene,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { nearView, viewPlanes } from "../game/viewRegion";

export const LOWER_OFFICE_LAYER = 0x10000000;
export interface OfficeOpening {
  x: number;
  z: number;
  w: number;
  d: number;
}
// Keep the perspective image just below the transparent pane; its top sits just below the wall cap to prevent z-fighting.
export const PORTAL_SURFACE_Y = ROOF_FINISH_Y - 0.0725;

/** Off-axis perspective: every point on the glass plane stays anchored to its UV.
 * Points below it shrink with actual depth and respond to the observer's position.
 * Camera axes are world +X (right), +Z (up), -Y (forward).
 */
export function officePortalProjection(
  eye: Vector3,
  opening: OfficeOpening,
  halfZ: boolean,
) {
  const near = 0.1,
    far = 250,
    height = Math.max(0.15, eye.y - PORTAL_SURFACE_Y);
  const left = ((opening.x - opening.w / 2 - eye.x) * near) / height;
  const right = ((opening.x + opening.w / 2 - eye.x) * near) / height;
  const bottom = ((opening.z - opening.d / 2 - eye.z) * near) / height;
  const top = ((opening.z + opening.d / 2 - eye.z) * near) / height;
  return Matrix.FromValues(
    (2 * near) / (right - left),
    0,
    0,
    0,
    0,
    (2 * near) / (top - bottom),
    0,
    0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    (halfZ ? far : far + near) / (far - near),
    1,
    0,
    0,
    (-(halfZ ? 1 : 2) * near * far) / (far - near),
    0,
  );
}

export function createOfficePortal(
  scene: Scene,
  opening: OfficeOpening,
  officeMeshes: Mesh[],
) {
  const mainCamera = scene.activeCamera;
  const camera = new FreeCamera(
    "lower office perspective camera",
    new Vector3(opening.x, 23, opening.z - 13),
    scene,
  );
  scene.activeCamera = mainCamera;
  camera.layerMask = LOWER_OFFICE_LAYER;
  camera.upVector = Vector3.Forward();
  camera.minZ = 0.1;
  camera.maxZ = 250;
  camera.inputs.clear();
  const target = new RenderTargetTexture(
    "lower office perspective view",
    { width: 384, height: Math.round((384 * opening.d) / opening.w) },
    scene,
    false,
    true,
  );
  target.activeCamera = camera;
  target.renderList = officeMeshes;
  target.forceLayerMaskCheck = true;
  target.renderParticles = false;
  target.renderSprites = false;
  target.useCameraPostProcesses = false;
  target.ignoreCameraViewport = true;
  target.clearColor = Color4.FromHexString("#263b40ff");
  target.wrapU = target.wrapV = 0;
  const material = new StandardMaterial("lower office portal surface", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveTexture = target;
  const surface = MeshBuilder.CreateGround(
    "lower office perspective surface",
    { width: opening.w, height: opening.d },
    scene,
  );
  surface.position.set(opening.x, PORTAL_SURFACE_Y, opening.z);
  surface.material = material;
  surface.isPickable = false;
  const diagnosticDisabled = scene.metadata?.gpuInvestigation?.portals === false;
  if (diagnosticDisabled) surface.setEnabled(false);
  surface.metadata = { visualOnly: true, officePortal: true };
  for (const layer of scene.effectLayers ?? [])
    if (layer instanceof GlowLayer) layer.addExcludedMesh(surface);
  const center = new Vector3(opening.x, PORTAL_SURFACE_Y, opening.z);
  const radius = Math.hypot(opening.w, opening.d) / 2;
  const update = () => {
    const viewer = scene.activeCamera;
    if (!viewer || viewer === camera || diagnosticDisabled) return;
    viewer.computeWorldMatrix();
    const visible =
      viewer.globalPosition.y > PORTAL_SURFACE_Y + 0.15 &&
      nearView(viewPlanes(viewer), center, radius, 3);
    const index = scene.customRenderTargets.indexOf(target);
    if (visible && index < 0) scene.customRenderTargets.push(target);
    if (!visible && index >= 0) scene.customRenderTargets.splice(index, 1);
    if (!visible) return;
    camera.position.copyFrom(viewer.globalPosition);
    camera.setTarget(camera.position.add(new Vector3(0, -1, 0)));
    camera.freezeProjectionMatrix(
      officePortalProjection(
        camera.position,
        opening,
        scene.getEngine().isNDCHalfZRange,
      ),
    );
    camera.getViewMatrix(true);
  };
  const observer = scene.onBeforeRenderObservable.add(update);
  update();
  scene.onDisposeObservable.addOnce(() =>
    scene.onBeforeRenderObservable.remove(observer),
  );
  return { camera, target, surface, update };
}
